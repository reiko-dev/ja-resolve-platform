/**
 * MVP-04 — persistence adapter for the canonical TowProposal (Knex).
 *
 * Owns the two things Domain/Application may not own:
 *
 *   1. the STORAGE REPRESENTATION — the flat snapshot columns are the record,
 *      and engine differences are normalized here once: `jsonb` arrives as an
 *      array from PostgreSQL and as TEXT from the SQLite harness, `numeric`/
 *      `bigint` arrive as strings, booleans arrive as `0`/`1`, `'t'` or `true`;
 *   2. the IDEMPOTENCY ATOMICITY — the SHA-256 digest of the fingerprint source
 *      (hashed here, because `node:crypto` must never enter Domain/Application)
 *      and the `(partner_id, idempotency_key)` resolution through the UNIQUE
 *      constraint. On a concurrent insert the loser re-reads the winner's row and
 *      compares digests, exactly like `TowRequestRepository`.
 *
 * Transactional methods are reached through `withTransaction(trx)`, which returns
 * the SAME API bound to that transaction. `lockById` is the row lock the accept
 * flow needs; it is a no-op outside PostgreSQL (see `applyRowLock`).
 */
'use strict';

const crypto = require('node:crypto');
const { INITIAL_TOW_PROPOSAL_STATUS } = require('../../domain');
const { toIsoInstant } = require('../../domain/instants');
const { applyRowLock } = require('./row-lock');

/** The partial index that allows one ACTIVE proposal per (request, partner). */
const ACTIVE_PROPOSAL_INDEX = 'tow_request_proposals_one_active_per_partner';

const COLUMNS = Object.freeze([
  'id',
  'tow_request_id',
  'partner_id',
  'tow_vehicle_id',
  'status',
  'route_provider_to_pickup_distance_meters',
  'route_provider_to_pickup_duration_seconds',
  'route_pickup_to_destination_distance_meters',
  'route_pickup_to_destination_duration_seconds',
  'route_total_distance_meters',
  'route_total_duration_seconds',
  'pricing_minimum_charge_cents',
  'pricing_included_meters',
  'pricing_price_per_additional_km_cents',
  'price_amount_cents',
  'price_currency',
  'vehicle_plate',
  'vehicle_make',
  'vehicle_model',
  'vehicle_year',
  'vehicle_equipment_type',
  'vehicle_supported_vehicle_classes',
  'vehicle_max_towed_weight_kg',
  'vehicle_document_status',
  'vehicle_active',
  'partner_business_name',
  'expires_at',
  'decided_at',
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

function toBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 't' || value === 'true';
}

/** `jsonb` (PostgreSQL array) or TEXT (SQLite) -> array; never a silent `[]`. */
function toClasses(value) {
  if (Array.isArray(value)) return [...value];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hashFingerprintSource(fingerprintSource) {
  return crypto.createHash('sha256').update(String(fingerprintSource), 'utf8').digest('hex');
}

function isUniqueViolation(error) {
  return Boolean(error) && (
    error.code === '23505'
    || /unique constraint|duplicate key|SQLITE_CONSTRAINT/i.test(error.message || '')
  );
}

/**
 * Which constraint rejected the insert.
 *
 * Two different UNIQUE rules can reject the same statement, and they mean two
 * different things to the caller: the idempotency key (a replay to resolve) and
 * the partial index that allows one ACTIVE proposal per (request, partner) (a
 * lost race against a SIBLING key, which is a 409, not a 500).
 *
 * Only the constraint part of the message is inspected, never the whole
 * message: knex prefixes the failing SQL, and that SQL names both columns.
 *
 *   PostgreSQL -> `error.constraint` / `... unique constraint "name"`
 *   SQLite     -> `UNIQUE constraint failed: index 'name'` for a partial index
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

/** 1:1 with the `tow_request_proposals` columns, minus `id` (database-owned). */
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
    partner_id: record.partner_id,
    tow_vehicle_id: record.tow_vehicle_id,
    status: record.status || INITIAL_TOW_PROPOSAL_STATUS,
    route_provider_to_pickup_distance_meters: record.route_provider_to_pickup_distance_meters,
    route_provider_to_pickup_duration_seconds: record.route_provider_to_pickup_duration_seconds,
    route_pickup_to_destination_distance_meters: record.route_pickup_to_destination_distance_meters,
    route_pickup_to_destination_duration_seconds: record.route_pickup_to_destination_duration_seconds,
    route_total_distance_meters: record.route_total_distance_meters,
    route_total_duration_seconds: record.route_total_duration_seconds,
    pricing_minimum_charge_cents: record.pricing_minimum_charge_cents,
    pricing_included_meters: record.pricing_included_meters,
    pricing_price_per_additional_km_cents: record.pricing_price_per_additional_km_cents,
    price_amount_cents: record.price_amount_cents,
    price_currency: record.price_currency,
    vehicle_plate: record.vehicle_plate,
    vehicle_make: record.vehicle_make,
    vehicle_model: record.vehicle_model,
    vehicle_year: record.vehicle_year,
    vehicle_equipment_type: record.vehicle_equipment_type,
    vehicle_supported_vehicle_classes: JSON.stringify(record.vehicle_supported_vehicle_classes),
    vehicle_max_towed_weight_kg: record.vehicle_max_towed_weight_kg,
    vehicle_document_status: record.vehicle_document_status,
    vehicle_active: record.vehicle_active,
    partner_business_name: record.partner_business_name ?? null,
    expires_at: toIsoInstant(record.expires_at),
    decided_at: toIsoInstant(record.decided_at),
    idempotency_key: record.idempotency_key,
    created_at: toIsoInstant(record.created_at),
    updated_at: toIsoInstant(record.updated_at),
  };
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tow_request_id: row.tow_request_id,
    partner_id: row.partner_id,
    tow_vehicle_id: row.tow_vehicle_id,
    status: row.status,
    route_provider_to_pickup_distance_meters: toNumber(row.route_provider_to_pickup_distance_meters),
    route_provider_to_pickup_duration_seconds: toNumber(row.route_provider_to_pickup_duration_seconds),
    route_pickup_to_destination_distance_meters: toNumber(row.route_pickup_to_destination_distance_meters),
    route_pickup_to_destination_duration_seconds: toNumber(row.route_pickup_to_destination_duration_seconds),
    route_total_distance_meters: toNumber(row.route_total_distance_meters),
    route_total_duration_seconds: toNumber(row.route_total_duration_seconds),
    pricing_minimum_charge_cents: toNumber(row.pricing_minimum_charge_cents),
    pricing_included_meters: toNumber(row.pricing_included_meters),
    pricing_price_per_additional_km_cents: toNumber(row.pricing_price_per_additional_km_cents),
    price_amount_cents: toNumber(row.price_amount_cents),
    price_currency: row.price_currency,
    vehicle_plate: row.vehicle_plate,
    vehicle_make: row.vehicle_make,
    vehicle_model: row.vehicle_model,
    vehicle_year: toNumber(row.vehicle_year),
    vehicle_equipment_type: row.vehicle_equipment_type,
    vehicle_supported_vehicle_classes: toClasses(row.vehicle_supported_vehicle_classes),
    vehicle_max_towed_weight_kg: toNumber(row.vehicle_max_towed_weight_kg),
    vehicle_document_status: row.vehicle_document_status,
    vehicle_active: toBoolean(row.vehicle_active),
    partner_business_name: row.partner_business_name ?? null,
    expires_at: row.expires_at,
    decided_at: row.decided_at ?? null,
    idempotency_key: row.idempotency_key,
    idempotency_fingerprint: row.idempotency_fingerprint,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function createTowProposalRepository(db) {
  if (!db) throw new TypeError('createTowProposalRepository requires a knex instance');

  function build(connection) {
    const base = () => connection('tow_request_proposals').select(COLUMNS);

    async function findById(id) {
      return mapRow(await base().where({ id }).first());
    }

    async function findByIdForPartner(id, partnerId) {
      return mapRow(await base().where({ id, partner_id: partnerId }).first());
    }

    /**
     * The ONE live proposal a partner may hold per request — the row the
     * `tow_request_proposals_one_active_per_partner` partial index protects.
     */
    async function findActiveForPartnerAndRequest({ partnerId, requestId }) {
      return mapRow(await base()
        .where({ partner_id: partnerId, tow_request_id: requestId, status: INITIAL_TOW_PROPOSAL_STATUS })
        .first());
    }

    async function findByPartnerAndKey(partnerId, idempotencyKey) {
      return mapRow(await base().where({ partner_id: partnerId, idempotency_key: idempotencyKey }).first());
    }

    /**
     * The idempotent replay of a create attempt, resolved in ONE round trip.
     *
     * The digest comparison happens HERE because the application layer must never
     * touch `node:crypto`. `same_payload` is the frozen contract's distinction
     * between "the same attempt, return the stored result" and "the same key with
     * a different payload", which is a 409 `idempotency_conflict`.
     *
     * @returns {Promise<{row: object, same_payload: boolean}|null>}
     */
    async function findReplay({ partnerId, idempotencyKey, fingerprintSource }) {
      const row = await findByPartnerAndKey(partnerId, idempotencyKey);
      if (!row) return null;
      return { row, same_payload: row.idempotency_fingerprint === hashFingerprintSource(fingerprintSource) };
    }

    function applyFilters(query, { status } = {}) {
      if (status) query.where({ status });
      return query;
    }

    async function listByRequest(requestId, { limit, offset, status = null } = {}) {
      const rows = await applyFilters(base().where({ tow_request_id: requestId }), { status })
        .orderBy('created_at', 'asc')
        .orderBy('id', 'asc')
        .limit(limit)
        .offset(offset);
      const counted = await applyFilters(connection('tow_request_proposals').where({ tow_request_id: requestId }), { status })
        .count({ total: '*' })
        .first();
      return { rows: rows.map(mapRow), total: toNumber(counted && counted.total) || 0 };
    }

    async function listByPartner(partnerId, { limit, offset, status = null } = {}) {
      const rows = await applyFilters(base().where({ partner_id: partnerId }), { status })
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .limit(limit)
        .offset(offset);
      const counted = await applyFilters(connection('tow_request_proposals').where({ partner_id: partnerId }), { status })
        .count({ total: '*' })
        .first();
      return { rows: rows.map(mapRow), total: toNumber(counted && counted.total) || 0 };
    }

    /**
     * Which of these requests have at least ONE actionable proposal right now?
     *
     * `expires_at > now` is evaluated by the DATABASE against its own clock so
     * the answer is one query instead of a read per request; the caller passes
     * the instant the module considers "now" so a fake clock stays authoritative.
     */
    async function findLiveRequestIds(requestIds, { now } = {}) {
      const ids = Array.isArray(requestIds) ? requestIds.filter((id) => id !== null && id !== undefined) : [];
      if (ids.length === 0) return [];
      const rows = await connection('tow_request_proposals')
        .distinct('tow_request_id')
        .whereIn('tow_request_id', ids)
        .where({ status: INITIAL_TOW_PROPOSAL_STATUS })
        .where('expires_at', '>', toIsoInstant(now))
        .orderBy('tow_request_id', 'asc');
      return rows.map((row) => row.tow_request_id);
    }

    async function lockById(id) {
      return mapRow(await applyRowLock(base().where({ id }).first(), connection));
    }

    async function markAccepted(id, { decidedAt }) {
      const [updated] = await connection('tow_request_proposals')
        .where({ id })
        .update({
          status: 'ACCEPTED',
          decided_at: toIsoInstant(decidedAt),
          updated_at: toIsoInstant(decidedAt),
        })
        .returning(COLUMNS);
      return mapRow(updated);
    }

    async function markWithdrawn(id, { decidedAt }) {
      const [updated] = await connection('tow_request_proposals')
        .where({ id })
        .update({
          status: 'WITHDRAWN',
          decided_at: toIsoInstant(decidedAt),
          updated_at: toIsoInstant(decidedAt),
        })
        .returning(COLUMNS);
      return mapRow(updated);
    }

    /**
     * Closes every other live proposal of the request.
     *
     * The `status = 'ACTIVE'` predicate is the whole point: a proposal that was
     * already WITHDRAWN or EXPIRED keeps its own outcome, and the winner (already
     * ACCEPTED by the caller) is excluded by id. Returns the number of losers, so
     * the caller can assert the transition without a second read.
     */
    async function closeActiveForRequestExcept(requestId, { exceptProposalId, decidedAt }) {
      return connection('tow_request_proposals')
        .where({ tow_request_id: requestId, status: INITIAL_TOW_PROPOSAL_STATUS })
        .whereNot({ id: exceptProposalId })
        .update({
          status: 'CLOSED',
          decided_at: toIsoInstant(decidedAt),
          updated_at: toIsoInstant(decidedAt),
        });
    }

    async function createIdempotent(record, { fingerprintSource } = {}) {
      const fingerprint = hashFingerprintSource(fingerprintSource);

      const existing = await findByPartnerAndKey(record.partner_id, record.idempotency_key);
      if (existing) {
        return { row: existing, created: false, same_payload: existing.idempotency_fingerprint === fingerprint };
      }

      try {
        const [created] = await connection('tow_request_proposals')
          .insert({ ...toColumns(record), idempotency_fingerprint: fingerprint })
          .returning('*');
        return { row: mapRow(created), created: true, same_payload: true };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;

        const target = violationTarget(error);
        if (target.includes(ACTIVE_PROPOSAL_INDEX)) {
          // A SIBLING key won the (request, partner) race: the partial index is
          // the authority, and the honest answer is the same 409 the pre-read
          // guard raises when it wins the race instead.
          return { row: null, created: false, same_payload: false, conflict: 'active' };
        }

        // Lost a concurrent race on the idempotency key: the winner's row is now
        // the authority.
        const winner = await findByPartnerAndKey(record.partner_id, record.idempotency_key);
        if (winner) {
          return { row: winner, created: false, same_payload: winner.idempotency_fingerprint === fingerprint };
        }

        // An unnamed or engine-specific rejection: ask the database which row
        // exists, which separates the two rules without trusting the message.
        const active = await findActiveForPartnerAndRequest({
          partnerId: record.partner_id,
          requestId: record.tow_request_id,
        });
        if (active) return { row: null, created: false, same_payload: false, conflict: 'active' };
        throw error;
      }
    }

    function withTransaction(trx) {
      if (!trx || typeof trx !== 'function') {
        throw new TypeError('withTransaction requires a transaction handle');
      }
      return build(trx);
    }

    return {
      createIdempotent,
      findById,
      findByIdForPartner,
      findByPartnerAndKey,
      findReplay,
      findActiveForPartnerAndRequest,
      listByRequest,
      listByPartner,
      findLiveRequestIds,
      lockById,
      markAccepted,
      markWithdrawn,
      closeActiveForRequestExcept,
      withTransaction,
    };
  }

  return build(db);
}

module.exports = {
  createTowProposalRepository,
  COLUMNS,
  mapRow,
  toColumns,
  hashFingerprintSource,
  violationTarget,
};
