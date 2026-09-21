/**
 * MVP-06 — `tow_payments` repository (the only writer of the table).
 *
 * Follows the module adapter conventions exactly:
 *   - factory + `build(connection)` closure, so `withTransaction(trx)` returns
 *     the same API bound to the transaction the service opened;
 *   - a frozen `COLUMNS` list, so a `select *` can never leak a driver detail;
 *   - timestamps leave the process as ISO-8601 strings (`toIsoInstant`), never
 *     as `Date` objects;
 *   - `toNumber` on the money column, so the DTO sees an integer and not the
 *     string some drivers return for a `numeric`;
 *   - uniqueness is decided by the DATABASE. `createForAssignment` inserts and
 *     classifies a unique violation instead of doing read-then-write, because a
 *     pre-read cannot see a concurrent transaction's uncommitted row.
 *
 * The repository never computes an amount. The record it receives was built by
 * the domain from the assignment's frozen final price.
 */
'use strict';

function createTowPaymentRepository(db) {
  if (!db) throw new TypeError('createTowPaymentRepository requires a database connection');

  const COLUMNS = Object.freeze([
    'id',
    'tow_request_id',
    'assignment_id',
    'method',
    'amount_cents',
    'currency',
    'status',
    'received_at',
    'received_by_partner_id',
    'created_at',
    'updated_at',
  ]);

  function toNumber(value) {
    if (value === null || value === undefined) return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }

  const { toIsoInstant } = require('../../domain/instants');

  function mapRow(row) {
    if (!row) return null;
    return {
      id: toNumber(row.id),
      tow_request_id: toNumber(row.tow_request_id),
      assignment_id: toNumber(row.assignment_id),
      method: row.method,
      amount_cents: toNumber(row.amount_cents),
      currency: row.currency,
      status: row.status,
      received_at: toIsoInstant(row.received_at),
      received_by_partner_id: toNumber(row.received_by_partner_id),
      created_at: toIsoInstant(row.created_at),
      updated_at: toIsoInstant(row.updated_at),
    };
  }

  function isUniqueViolation(error) {
    if (!error) return false;
    if (error.code === '23505') return true;
    const message = String(error.message || '');
    return /unique constraint|duplicate key|SQLITE_CONSTRAINT/i.test(message);
  }

  /** Which uniqueness rule did the database enforce? (identity of the conflict) */
  function violationTarget(error) {
    const constraint = String(
      (error && error.constraint)
      || (error && error.message)
      || ''
    );
    if (/assignment_id/i.test(constraint)) return 'assignment';
    if (/tow_request_id/i.test(constraint)) return 'request';
    return null;
  }

  function build(connection) {
    /** The only read used as "does this request already have a payment?" */
    async function findByRequestId(towRequestId) {
      const row = await connection('tow_payments').where({ tow_request_id: towRequestId }).first(COLUMNS);
      return mapRow(row);
    }

    async function findByAssignmentId(assignmentId) {
      const row = await connection('tow_payments').where({ assignment_id: assignmentId }).first(COLUMNS);
      return mapRow(row);
    }

    /**
     * Batch read for the list/recovery paths, so a page of requests costs one
     * query and never one per row.
     */
    async function findByRequestIds(towRequestIds) {
      const ids = (towRequestIds || []).filter((id) => id !== null && id !== undefined);
      if (ids.length === 0) return [];
      const rows = await connection('tow_payments').whereIn('tow_request_id', ids).select(COLUMNS);
      return rows.map(mapRow);
    }

    /**
     * Insert the payment record. Uniqueness is the DATABASE's decision: a
     * concurrent double insert cannot create two rows, and the loser learns
     * which identity conflicted instead of crashing.
     *
     * @returns {Promise<{row: object|null, conflict: 'request'|'assignment'|null}>}
     */
    async function createForAssignment(record) {
      const payload = {
        tow_request_id: record.tow_request_id,
        assignment_id: record.assignment_id,
        method: record.method,
        amount_cents: record.amount_cents,
        currency: record.currency,
        status: record.status,
        received_at: record.received_at,
        received_by_partner_id: record.received_by_partner_id,
        created_at: record.created_at,
        updated_at: record.updated_at,
      };

      try {
        const [inserted] = await connection('tow_payments').insert(payload).returning(COLUMNS);
        return { row: mapRow(inserted), conflict: null };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const conflict = violationTarget(error);
        // Resolve the winner so the caller can answer with the canonical row.
        const existing = conflict === 'assignment'
          ? await findByAssignmentId(record.assignment_id)
          : await findByRequestId(record.tow_request_id);
        return { row: existing, conflict: conflict || 'request' };
      }
    }

    /**
     * Guarded `PENDING -> RECEIVED` transition.
     *
     * `WHERE status = 'PENDING'` is the whole idempotency authority of the
     * confirmation: a retry matches zero rows and therefore cannot restamp
     * `received_at`, `received_by_partner_id` or `updated_at`. Identity columns
     * are never in the update list.
     *
     * @returns {Promise<{row: object|null, transitioned: boolean}>}
     */
    async function markReceived(towRequestId, { receivedAt, receivedByPartnerId, updatedAt }) {
      const [updated] = await connection('tow_payments')
        .where({ tow_request_id: towRequestId, status: 'PENDING' })
        .update({
          status: 'RECEIVED',
          received_at: toIsoInstant(receivedAt),
          received_by_partner_id: receivedByPartnerId,
          updated_at: toIsoInstant(updatedAt ?? receivedAt),
        })
        .returning(COLUMNS);

      const row = mapRow(updated);
      if (row) return { row, transitioned: true };
      return { row: await findByRequestId(towRequestId), transitioned: false };
    }

    function withTransaction(trx) {
      if (typeof trx !== 'function') {
        throw new TypeError('tow-payment-repository.withTransaction requires a knex transaction object');
      }
      return build(trx);
    }

    return { findByRequestId, findByRequestIds, findByAssignmentId, createForAssignment, markReceived, withTransaction };
  }

  return build(db);
}

module.exports = { createTowPaymentRepository };
