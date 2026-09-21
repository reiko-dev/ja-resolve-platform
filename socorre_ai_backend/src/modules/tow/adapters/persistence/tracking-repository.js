/**
 * MVP-05 — persistence adapter for the CURRENT partner position (Knex).
 *
 * The delivery owns exactly ONE row per canonical request: the latest known
 * position. That is a deliberate product decision, not a storage shortcut —
 * the contract exposes `latest` and nothing else, and a trail would be data the
 * module has no consent, retention or consumer for. The shape of the table
 * (`tow_request_id` UNIQUE) makes a second row for the same request
 * unrepresentable, so "no history" cannot be broken by a future caller.
 *
 * Two instants are stored, and they are NOT interchangeable:
 *   - `observed_at` — when the DEVICE took the fix. It arrives in the payload
 *     (`recorded_at` in the contract) and is the ordering authority: a point is
 *     accepted only when it is not older than the stored one;
 *   - `received_at` — when the BACKEND accepted it. It is the backend clock's
 *     instant and the only one the module can vouch for.
 *
 * The write is an UPSERT with a monotonic guard, never a read-then-write: the
 * `observed_at <= :instant` predicate of the UPDATE is what makes two
 * concurrent points resolve to the newest one instead of to whichever request
 * the scheduler happened to run last. On the engines where a pre-read can race,
 * the loser of the guard re-reads and reports the winner as stale.
 *
 * This table is NOT the legacy `real_time_tracking`: that one keeps a
 * `location_history` trail plus ETA/route columns this delivery does not own
 * (see `docs/evidence/mvp-05/01-current-state-delta.md`).
 */
'use strict';

const { toIsoInstant, instantMillis } = require('../../domain/instants');

const COLUMNS = Object.freeze([
  'id',
  'tow_request_id',
  'partner_id',
  'latitude',
  'longitude',
  'observed_at',
  'received_at',
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

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tow_request_id: row.tow_request_id,
    partner_id: row.partner_id,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    observed_at: row.observed_at,
    received_at: row.received_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function createTrackingRepository(db) {
  if (!db) throw new TypeError('createTrackingRepository requires a knex instance');

  function build(connection) {
    const base = () => connection('tow_request_tracking').select(COLUMNS);

    async function findByRequestId(requestId) {
      return mapRow(await base().where({ tow_request_id: requestId }).first());
    }

    /**
     * Stores `point` as the current position of `requestId`, unless it is older
     * than the one already stored.
     *
     * @returns {Promise<{point: object|null, applied: boolean, stale: boolean}>}
     * `applied` is true only for the call that wrote; `stale` is true when an
     * equal-or-newer point already existed and this one lost.
     */
    async function upsertCurrentPoint({
      tow_request_id: requestId,
      partner_id: partnerId,
      latitude,
      longitude,
      observed_at: observedAt,
      received_at: receivedAt,
    }) {
      const observedInstant = toIsoInstant(observedAt);
      const receivedInstant = toIsoInstant(receivedAt);

      const existing = await findByRequestId(requestId);
      if (existing && instantMillis(existing.observed_at) > instantMillis(observedInstant)) {
        return { point: existing, applied: false, stale: true };
      }

      const patch = {
        partner_id: partnerId,
        latitude,
        longitude,
        observed_at: observedInstant,
        received_at: receivedInstant,
        updated_at: receivedInstant,
      };

      if (!existing) {
        try {
          const [created] = await connection('tow_request_tracking')
            .insert({ tow_request_id: requestId, ...patch, created_at: receivedInstant })
            .returning(COLUMNS);
          return { point: mapRow(created), applied: true, stale: false };
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          // Lost the insert race: fall through to the guarded update, which is
          // the authority on which of the two points is the newest.
        }
      }

      const [updated] = await connection('tow_request_tracking')
        .where({ tow_request_id: requestId })
        .where('observed_at', '<=', observedInstant)
        .update(patch)
        .returning(COLUMNS);

      if (updated) return { point: mapRow(updated), applied: true, stale: false };

      return { point: await findByRequestId(requestId), applied: false, stale: true };
    }

    function withTransaction(trx) {
      if (!trx || typeof trx !== 'function') {
        throw new TypeError('withTransaction requires a transaction handle');
      }
      return build(trx);
    }

    return { findByRequestId, upsertCurrentPoint, withTransaction };
  }

  return build(db);
}

module.exports = { createTrackingRepository, COLUMNS, mapRow };
