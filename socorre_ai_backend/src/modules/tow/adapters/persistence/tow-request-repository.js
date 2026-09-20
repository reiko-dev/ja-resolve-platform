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
const { INITIAL_TOW_REQUEST_STATE } = require('../../domain');

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
  'matching_radius_km',
  'idempotency_key',
  'idempotency_fingerprint',
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
    matching_radius_km: record.matching_radius_km,
    idempotency_key: record.idempotency_key,
    created_at: record.created_at,
    updated_at: record.updated_at,
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
    matching_radius_km: toNumber(row.matching_radius_km),
    idempotency_key: row.idempotency_key,
    idempotency_fingerprint: row.idempotency_fingerprint,
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

  const base = () => db('tow_requests').select(COLUMNS);

  async function findById(id) {
    return mapRow(await base().where({ id }).first());
  }

  async function findByIdForCustomer(id, customerId) {
    return mapRow(await base().where({ id, customer_id: customerId }).first());
  }

  function applyFilters(query, { state, from, to } = {}) {
    if (state) query.where({ state });
    // `Date` bindings are the only representation both engines compare
    // correctly: PostgreSQL binds them to `timestamptz`, and the SQLite harness
    // normalizes them to the same `'YYYY-MM-DD HH:MM:SS.mmm'` text the rows were
    // written with.
    if (from) query.where('created_at', '>=', from);
    if (to) query.where('created_at', '<=', to);
    return query;
  }

  async function listForCustomer(customerId, { limit, offset, state = null, from = null, to = null } = {}) {
    const rows = await applyFilters(base().where({ customer_id: customerId }), { state, from, to })
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .offset(offset);

    const counted = await applyFilters(db('tow_requests').where({ customer_id: customerId }), { state, from, to })
      .count({ total: '*' })
      .first();

    return { rows: rows.map(mapRow), total: toNumber(counted && counted.total) || 0 };
  }

  /**
   * The candidate set of the matching feed: open requests, oldest first so the
   * longest-waiting customer is served first. The cap is explicit and
   * documented (`DEFAULT_CANDIDATE_SCAN_LIMIT`); MVP-03 has no bounding-box
   * pre-filter because the radius is a per-row frozen value.
   */
  async function listSearchingCandidates({ limit }) {
    const rows = await base()
      .where({ state: INITIAL_TOW_REQUEST_STATE })
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .limit(limit);
    return rows.map(mapRow);
  }

  async function findByCustomerAndKey(customerId, idempotencyKey) {
    return mapRow(await base().where({ customer_id: customerId, idempotency_key: idempotencyKey }).first());
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
      const [created] = await db('tow_requests')
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

  return {
    createIdempotent,
    findById,
    findByIdForCustomer,
    findByCustomerAndKey,
    listForCustomer,
    listSearchingCandidates,
  };
}

module.exports = { createTowRequestRepository, COLUMNS, mapRow, toColumns, hashFingerprintSource };
