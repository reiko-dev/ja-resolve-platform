/**
 * MVP-03 — persistence adapter for the canonical TowRequest (Knex).
 *
 * Owns the two things the Domain/Application layers are not allowed to own:
 *
 *   1. the STORAGE REPRESENTATION — the nested aggregate is flattened into
 *      columns on write and rebuilt on read, and engine-specific number formats
 *      (`numeric` arrives as a string from node-postgres) are normalized here,
 *      once;
 *   2. the IDEMPOTENCY ATOMICITY — the SHA-256 digest of the fingerprint source
 *      (hashed here, because `node:crypto` must never enter Domain/Application)
 *      and the `(customer_id, idempotency_key)` resolution.
 *
 * The uniqueness authority is the database constraint, never a
 * read-then-write check: on a concurrent insert the loser re-reads the winner's
 * row and compares digests. That is what makes three simultaneous identical
 * requests collapse to exactly one row on PostgreSQL.
 *
 * The fingerprint source itself is transient: only its digest is persisted, so
 * no raw payload text ever lands in the `idempotency_fingerprint` column.
 */
'use strict';

const crypto = require('node:crypto');
const { INITIAL_TOW_REQUEST_STATE, OPEN_TOW_REQUEST_STATES } = require('../../domain');
const { toIsoInstant } = require('../../domain/instants');
const { applyRowLock } = require('./row-lock');

const COLUMNS = Object.freeze([
  'id',
  'customer_id',
  'state',
  'terminal_reason',
  'pickup_latitude',
  'pickup_longitude',
  'pickup_formatted_address',
  'destination_latitude',
  'destination_longitude',
  'destination_formatted_address',
  'vehicle_class',
  'vehicle_make',
  'vehicle_model',
  'vehicle_year',
  'vehicle_weight_kg',
  'vehicle_plate',
  'problem_description',
  'observations',
  // The commercial payment choice made at creation (CASH in this MVP). It is
  // NOT the financial execution state: that one lives in `tow_payments`.
  'payment_method',
  'matching_radius_km',
  'idempotency_key',
  'idempotency_fingerprint',
  // MVP-05 — the execution milestones and the cancellation attribution. They
  // live on the request row (not in a separate event table) so the state change
  // and its evidence are one atomic write.
  'en_route_at',
  'arrived_at',
  'in_transit_at',
  'completed_at',
  'cancelled_at',
  'cancelled_by_actor_type',
  'cancelled_by_actor_id',
  'cancellation_reason',
  'created_at',
  'updated_at',
]);

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hashFingerprintSource(fingerprintSource) {
  return crypto.createHash('sha256').update(String(fingerprintSource), 'utf8').digest('hex');
}

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
    customer_id: record.customer_id,
    state: record.state || INITIAL_TOW_REQUEST_STATE,
    terminal_reason: record.terminal_reason ?? null,
    pickup_latitude: record.pickup.latitude,
    pickup_longitude: record.pickup.longitude,
    pickup_formatted_address: record.pickup.formatted_address ?? null,
    destination_latitude: record.destination.latitude,
    destination_longitude: record.destination.longitude,
    destination_formatted_address: record.destination.formatted_address ?? null,
    vehicle_class: record.vehicle.class,
    vehicle_make: record.vehicle.make,
    vehicle_model: record.vehicle.model,
    vehicle_year: record.vehicle.year ?? null,
    vehicle_weight_kg: record.vehicle.weight_kg ?? null,
    vehicle_plate: record.vehicle.plate ?? null,
    problem_description: record.problem_description,
    observations: record.observations ?? null,
    payment_method: record.payment_method ?? null,
    matching_radius_km: record.matching_radius_km,
    idempotency_key: record.idempotency_key,
    created_at: toIsoInstant(record.created_at),
    updated_at: toIsoInstant(record.updated_at),
  };
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    customer_id: row.customer_id,
    state: row.state,
    terminal_reason: row.terminal_reason ?? null,
    pickup: {
      latitude: toNumber(row.pickup_latitude),
      longitude: toNumber(row.pickup_longitude),
      formatted_address: row.pickup_formatted_address ?? null,
    },
    destination: {
      latitude: toNumber(row.destination_latitude),
      longitude: toNumber(row.destination_longitude),
      formatted_address: row.destination_formatted_address ?? null,
    },
    vehicle: {
      class: row.vehicle_class,
      make: row.vehicle_make,
      model: row.vehicle_model,
      year: toNumber(row.vehicle_year),
      weight_kg: toNumber(row.vehicle_weight_kg),
      plate: row.vehicle_plate ?? null,
    },
    problem_description: row.problem_description,
    observations: row.observations ?? null,
    payment_method: row.payment_method ?? null,
    matching_radius_km: toNumber(row.matching_radius_km),
    idempotency_key: row.idempotency_key,
    idempotency_fingerprint: row.idempotency_fingerprint,
    // MVP-05 milestones, raw (the DTO layer normalizes with `toIsoInstant`).
    en_route_at: row.en_route_at ?? null,
    arrived_at: row.arrived_at ?? null,
    in_transit_at: row.in_transit_at ?? null,
    completed_at: row.completed_at ?? null,
    cancelled_at: row.cancelled_at ?? null,
    cancelled_by_actor_type: row.cancelled_by_actor_type ?? null,
    cancelled_by_actor_id: row.cancelled_by_actor_id ?? null,
    cancellation_reason: row.cancellation_reason ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function isUniqueViolation(error) {
  return Boolean(error) && (
    error.code === '23505'
    || /unique constraint|duplicate key|SQLITE_CONSTRAINT/i.test(error.message || '')
  );
}

function createTowRequestRepository(db) {
  if (!db) throw new TypeError('createTowRequestRepository requires a knex instance');

  function build(connection) {
    const base = () => connection('tow_requests').select(COLUMNS);

    async function findById(id) {
      return mapRow(await base().where({ id }).first());
    }

    async function findByIdForCustomer(id, customerId) {
      return mapRow(await base().where({ id, customer_id: customerId }).first());
    }

    /**
     * MVP-04 EXT — batch read for the partner job list: the assignments are
     * paginated first (they are the job authority), then their requests are
     * loaded in ONE query instead of one per row.
     */
    async function findByIds(ids) {
      const list = Array.isArray(ids) ? ids.filter((id) => id !== null && id !== undefined) : [];
      if (list.length === 0) return [];
      const rows = await base().whereIn('id', list);
      return rows.map(mapRow);
    }

    function applyFilters(query, { state, from, to } = {}) {
      if (state) query.where({ state });
      // The window must be bound in the SAME representation the rows are written
      // in (`toIsoInstant`): on PostgreSQL `timestamptz` normalizes either form,
      // but the SQLite harness stores TEXT, so a `Date` bound here would be
      // normalized to `'YYYY-MM-DD HH:MM:SS.mmm'` and compared lexically against
      // `'YYYY-MM-DDTHH:MM:SS.mmmZ'` — and `'T' > ' '` would silently widen the
      // window by one row. One instant representation, both sides of every
      // comparison.
      if (from) query.where('created_at', '>=', toIsoInstant(from));
      if (to) query.where('created_at', '<=', toIsoInstant(to));
      return query;
    }

    async function listForCustomer(customerId, { limit, offset, state = null, from = null, to = null } = {}) {
      const rows = await applyFilters(base().where({ customer_id: customerId }), { state, from, to })
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .limit(limit)
        .offset(offset);

      const counted = await applyFilters(connection('tow_requests').where({ customer_id: customerId }), { state, from, to })
        .count({ total: '*' })
        .first();

      return { rows: rows.map(mapRow), total: toNumber(counted && counted.total) || 0 };
    }

    /**
     * The candidate set of the matching feed: open requests, oldest first so the
     * longest-waiting customer is served first. The cap is explicit and
     * documented (`DEFAULT_CANDIDATE_SCAN_LIMIT`); MVP-03 has no bounding-box
     * pre-filter because the radius is a per-row frozen value.
     *
     * MVP-04 widened the predicate from `SEARCHING` to the OPEN states: a request
     * that already received one proposal becomes `NEGOTIATING` and MUST stay in the
     * feed, because competing partners may still propose until the customer
     * accepts one. Freezing the feed at `SEARCHING` would silently make the second
     * proposal impossible — the whole point of the delivery.
     */
    async function listSearchingCandidates({ limit }) {
      const rows = await base()
        .whereIn('state', OPEN_TOW_REQUEST_STATES)
        .orderBy('created_at', 'asc')
        .orderBy('id', 'asc')
        .limit(limit);
      return rows.map(mapRow);
    }

    async function findByCustomerAndKey(customerId, idempotencyKey) {
      return mapRow(await base().where({ customer_id: customerId, idempotency_key: idempotencyKey }).first());
    }

    /**
     * Locks the request row for the accept transaction.
     *
     * `SELECT ... FOR UPDATE` on PostgreSQL: two simultaneous accepts of two
     * proposals of the SAME request serialize here, so the second one observes the
     * first one's assignment and answers 409 instead of racing the UNIQUE
     * constraint. Outside PostgreSQL the clause is a no-op (see `applyRowLock`) and
     * the UNIQUE constraint remains the authority.
     */
    async function lockById(id) {
      return mapRow(await applyRowLock(base().where({ id }).first(), connection));
    }

    /**
     * MVP-04 — `SEARCHING -> NEGOTIATING` on the first proposal.
     *
     * Guarded by `state = 'SEARCHING'` in the WHERE clause: a request already in
     * NEGOTIATING (or beyond) is not rewritten, so concurrent first proposals from
     * two partners cannot fight over the transition. Returns the number of rows
     * changed; 0 simply means somebody else got there first.
     */
    async function markNegotiating(id, { updatedAt }) {
      return connection('tow_requests')
        .where({ id, state: INITIAL_TOW_REQUEST_STATE })
        .update({ state: 'NEGOTIATING', updated_at: toIsoInstant(updatedAt) });
    }

    /** MVP-04 — the assignment transition, inside the accept transaction. */
    async function markAssigned(id, { updatedAt }) {
      const [updated] = await connection('tow_requests')
        .where({ id })
        .update({ state: 'ASSIGNED', updated_at: toIsoInstant(updatedAt) })
        .returning(COLUMNS);
      return mapRow(updated);
    }

    /**
     * MVP-05 — ONE guarded execution write: the state, its milestone and (for a
     * cancellation) its attribution, in a single UPDATE.
     *
     * The `state = from` predicate is the compare-and-swap. It is the second
     * line of defence behind the row lock of the enclosing transaction, and the
     * ONLY line on an engine where the lock is a no-op (the SQLite harness):
     * if another writer already moved the request, this matches zero rows and
     * the caller re-reads the winner's state instead of overwriting it.
     *
     * `milestoneColumn` comes from the domain state machine — the adapter never
     * decides which column a transition owns. Writing the milestone in the same
     * statement is what makes "the state changed but the timestamp was lost"
     * unrepresentable.
     *
     * @returns {Promise<object|null>} the updated request, or `null` when the
     * guarded predicate matched nothing.
     */
    async function applyExecutionTransition(id, {
      from,
      to,
      milestoneColumn = null,
      terminalReason = null,
      cancellation = null,
      updatedAt,
    }) {
      const instant = toIsoInstant(updatedAt);
      const patch = {
        state: to,
        terminal_reason: terminalReason,
        updated_at: instant,
      };
      if (milestoneColumn) patch[milestoneColumn] = instant;
      if (cancellation) {
        patch.cancelled_by_actor_type = cancellation.actor_type;
        patch.cancelled_by_actor_id = cancellation.actor_id;
        patch.cancellation_reason = cancellation.reason ?? null;
      }

      const [updated] = await connection('tow_requests')
        .where({ id, state: from })
        .update(patch)
        .returning(COLUMNS);
      return mapRow(updated);
    }

    async function createIdempotent(record, { fingerprintSource } = {}) {
      const fingerprint = hashFingerprintSource(fingerprintSource);

      const existing = await findByCustomerAndKey(record.customer_id, record.idempotency_key);
      if (existing) {
        return {
          row: existing,
          created: false,
          same_payload: existing.idempotency_fingerprint === fingerprint,
        };
      }

      try {
        const [created] = await connection('tow_requests')
          .insert({ ...toColumns(record), idempotency_fingerprint: fingerprint })
          .returning('*');
        return { row: mapRow(created), created: true, same_payload: true };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;

        // Lost a concurrent race: the winner's row is now the authority.
        const winner = await findByCustomerAndKey(record.customer_id, record.idempotency_key);
        if (!winner) throw error;
        return {
          row: winner,
          created: false,
          same_payload: winner.idempotency_fingerprint === fingerprint,
        };
      }
    }

    /**
     * Returns the SAME API bound to a transaction. Binding is explicit because a
   * query issued on the pool while a transaction is open would silently escape
     * it — and would deadlock the single-connection SQLite harness.
     */
    function withTransaction(trx) {
      if (!trx || typeof trx !== 'function') {
        throw new TypeError('withTransaction requires a transaction handle');
      }
      return build(trx);
    }

    return {
      createIdempotent,
      findById,
      findByIdForCustomer,
      findByIds,
      findByCustomerAndKey,
      listForCustomer,
      listSearchingCandidates,
      lockById,
      markNegotiating,
      markAssigned,
      applyExecutionTransition,
      withTransaction,
    };
  }

  return build(db);
}

module.exports = { createTowRequestRepository, COLUMNS, mapRow, toColumns, hashFingerprintSource };
