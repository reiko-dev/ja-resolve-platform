/**
 * MVP-01 EXT — persistence adapter for partner identity (Knex).
 *
 * Implements the `PartnerRepository` port with the minimal canonical projection
 * the application/domain needs, without depending on the legacy `Partner` model
 * or on Knex.
 *
 * MVP-03 EXT: the projection is extended with the partner's operational context
 * (`is_available`, `is_online`, `is_verified`, `latitude`, `longitude`) because
 * geographic matching must decide availability and distance from the SAME row
 * it read the identity from. It still selects an explicit column list — never
 * `*` — so no legacy column (including the `specialty` / `last_seen` columns the
 * legacy model references but the schema does not have; see
 * `docs/evidence/mvp-03/02-legacy-audit.md` §6) can leak into the module.
 *
 * `is_verified` is part of the projection for observability only: it is NOT a
 * matching criterion in MVP-03 (proved by the inclusion test for an unverified
 * partner).
 */
'use strict';

const PARTNER_COLUMNS = Object.freeze([
  'id',
  'type',
  'is_available',
  'is_online',
  'is_verified',
  'latitude',
  'longitude',
]);

/**
 * SQLite delivers `0`/`1`, PostgreSQL delivers `true`/`false` and a driver may
 * deliver `'t'`. The domain compares against real booleans, so the coercion
 * happens here, once.
 */
function toBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 't' || value === 'true';
}

function toCoordinate(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapPartnerRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    is_available: toBoolean(row.is_available),
    is_online: toBoolean(row.is_online),
    is_verified: toBoolean(row.is_verified),
    latitude: toCoordinate(row.latitude),
    longitude: toCoordinate(row.longitude),
  };
}

function createPartnerRepository(db) {
  if (!db) throw new TypeError('createPartnerRepository requires a knex instance');

  async function findById(id) {
    if (id === null || id === undefined || id === '') return null;
    const row = await db('partners').select(PARTNER_COLUMNS).where({ id }).first();
    return mapPartnerRow(row);
  }

  return { findById };
}

module.exports = { createPartnerRepository, PARTNER_COLUMNS, mapPartnerRow };
