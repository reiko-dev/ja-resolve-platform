/**
 * MVP-04 — persistence adapter for the canonical TowAssignment (Knex).
 *
 * This table is the ONLY authority on occupancy. `released_at IS NULL` means the
 * partner and the vehicle are on a job; nothing else in the module may answer
 * that question (`TowVehicle.active` describes configuration, `is_available`
 * describes willingness to receive NEW work).
 *
 * Two UNIQUE constraints make "exactly one assignment" structural:
 *   - `tow_assignments.tow_request_id` — one assignment per request, EVER;
 *   - `tow_assignments.proposal_id` — the accept idempotency key, which is what
 *     turns a replayed accept into a 200 instead of a second job.
 *
 * `createForProposal` never pre-checks those constraints: it inserts and lets the
 * database arbitrate, so a concurrent accept is decided by the index rather than
 * by a read-then-write race.
 */
'use strict';


const { toIsoInstant } = require('../../domain/instants');

const COLUMNS = Object.freeze([
  'id',
  'tow_request_id',
  'proposal_id',
  'partner_id',
  'tow_vehicle_id',
  'final_price_amount_cents',
  'final_price_currency',
  'vehicle_plate',
  'assigned_at',
  'released_at',
  'release_reason',
  'created_at',
  'updated_at',
]);

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isUniqueViolation(error) {
  return Boolean(error) && (
    error.code === '23505'
    || /unique constraint|duplicate key|SQLITE_CONSTRAINT/i.test(error.message || '')
  );
}

/** 1:1 with the `tow_assignments` columns, minus `id` (database-owned). */
/**
 * Timestamp columns are written as ISO-8601 instants, never as a `Date`.
 *
 * The SQLite harness binds a `Date` to "[object Object]" (or to an epoch double
 * that the TEXT-affinity column stores as `'1768…0.0'`), and its `prepBindings`
 * normalization does not reach a query issued inside a transaction — which is
 * exactly where the accept flow writes. `timestamptz` accepts the ISO string
 * unchanged on PostgreSQL, so one representation is correct on both engines.
 */
function toColumns(record) {
  return {
    tow_request_id: record.tow_request_id,
    proposal_id: record.proposal_id,
    partner_id: record.partner_id,
    tow_vehicle_id: record.tow_vehicle_id,
    final_price_amount_cents: record.final_price_amount_cents,
    final_price_currency: record.final_price_currency,
    vehicle_plate: record.vehicle_plate,
    assigned_at: toIsoInstant(record.assigned_at),
    released_at: toIsoInstant(record.released_at),
    release_reason: record.release_reason ?? null,
    created_at: toIsoInstant(record.created_at),
    updated_at: toIsoInstant(record.updated_at),
  };
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tow_request_id: row.tow_request_id,
    proposal_id: row.proposal_id,
    partner_id: row.partner_id,
    tow_vehicle_id: row.tow_vehicle_id,
    final_price_amount_cents: toNumber(row.final_price_amount_cents),
    final_price_currency: row.final_price_currency,
    vehicle_plate: row.vehicle_plate,
    assigned_at: row.assigned_at,
    released_at: row.released_at ?? null,
    release_reason: row.release_reason ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const REQUEST_UNIQUE = 'tow_assignments_tow_request_id_unique';
const PROPOSAL_UNIQUE = 'tow_assignments_proposal_id_unique';
const LIVE_PARTNER_INDEX = 'tow_assignments_one_live_per_partner';
const LIVE_VEHICLE_INDEX = 'tow_assignments_one_live_per_vehicle';

/**
 * WHICH constraint rejected the insert, extracted from the engine's report.
 *
 * Only the CONSTRAINT part of the message may be inspected — never the whole
 * message: knex prefixes the failing SQL, and the SQL of this very insert names
 * every column, so a naive `message.includes('tow_request_id')` would classify a
 * partner-occupancy rejection as a request collision.
 *
 *   PostgreSQL -> `error.constraint` (and `... unique constraint "name"`)
 *   SQLite     -> `UNIQUE constraint failed: tow_assignments.partner_id`
 *                 (or `... : index 'tow_assignments_one_live_per_partner'`)
 */
function violationTarget(error) {
  const parts = [];
  if (error && error.constraint) parts.push(String(error.constraint));
  const message = String((error && error.message) || '');
  const sqlite = /unique constraint failed:\s*(.+)$/im.exec(message);
  if (sqlite) parts.push(sqlite[1]);
  const postgres = /unique constraint "([^"]+)"/i.exec(message);
  if (postgres) parts.push(postgres[1]);
  return parts.join(' ');
}

function createAssignmentRepository(db) {
  if (!db) throw new TypeError('createAssignmentRepository requires a knex instance');

  function build(connection) {
    const base = () => connection('tow_assignments').select(COLUMNS);

    async function findById(id) {
      return mapRow(await base().where({ id }).first());
    }

    async function findByRequestId(requestId) {
      return mapRow(await base().where({ tow_request_id: requestId }).first());
    }

    async function findByProposalId(proposalId) {
      return mapRow(await base().where({ proposal_id: proposalId }).first());
    }

    async function findByRequestIds(requestIds) {
      const ids = Array.isArray(requestIds) ? requestIds.filter((id) => id !== null && id !== undefined) : [];
      if (ids.length === 0) return [];
      const rows = await base().whereIn('tow_request_id', ids);
      return rows.map(mapRow);
    }

    /**
     * Inserts the winning assignment.
     *
     * There is no pre-read: the database arbitrates. A pre-read could not, since
     * another transaction may commit between the read and the write.
     *
     * The rejection is then DISAMBIGUATED, because the four constraints mean four
     * different things to the caller:
     *   - `proposal_id`  -> this accept already happened: an idempotent replay;
     *   - `tow_request_id` -> another proposal won: 409 `request_already_assigned`;
     *   - the live-partner / live-vehicle indexes -> 409 `conflict` (occupancy).
     *
     * @returns {Promise<{row: object|null, conflict: 'proposal'|'request'|'partner_occupancy'|'vehicle_occupancy'|null}>}
     */
    async function createForProposal(record) {
      try {
        const [created] = await connection('tow_assignments')
          .insert(toColumns(record))
          .returning('*');
        return { row: mapRow(created), conflict: null };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;

        const target = violationTarget(error);
        if (target.includes(PROPOSAL_UNIQUE) || target.includes('proposal_id')) {
          return { row: null, conflict: 'proposal' };
        }
        if (target.includes(REQUEST_UNIQUE) || target.includes('tow_request_id')) {
          return { row: null, conflict: 'request' };
        }
        if (target.includes(LIVE_PARTNER_INDEX) || target.includes('partner_id')) {
          return { row: null, conflict: 'partner_occupancy' };
        }
        if (target.includes(LIVE_VEHICLE_INDEX) || target.includes('tow_vehicle_id')) {
          return { row: null, conflict: 'vehicle_occupancy' };
        }

        // An unnamed or engine-specific rejection: ask the database which row
        // exists, which disambiguates a replay from a lost race safely.
        if (await findByProposalId(record.proposal_id)) return { row: null, conflict: 'proposal' };
        if (await findByRequestId(record.tow_request_id)) return { row: null, conflict: 'request' };
        return { row: null, conflict: 'partner_occupancy' };
      }
    }

    function withTransaction(trx) {
      if (!trx || typeof trx !== 'function') {
        throw new TypeError('withTransaction requires a transaction handle');
      }
      return build(trx);
    }

    return {
      createForProposal,
      findById,
      findByRequestId,
      findByProposalId,
      findByRequestIds,
      withTransaction,
    };
  }

  return build(db);
}

module.exports = { createAssignmentRepository, COLUMNS, mapRow, toColumns, violationTarget };
