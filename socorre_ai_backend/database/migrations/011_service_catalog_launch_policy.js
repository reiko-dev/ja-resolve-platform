/**
 * PLATFORM SERVICE CATALOG — launch policy correction.
 *
 * Migration 010 is IMMUTABLE HISTORY: it provisioned the six initial platform
 * services as ACTIVE (its `up()` is never edited). That status was the implicit
 * default of the era, not a launch decision. The product policy is:
 *
 *   tow           LAUNCHED      -> stays ACTIVE (the only launched service)
 *   mechanic      NOT LAUNCHED  -> SOON
 *   tire_repair   NOT LAUNCHED  -> SOON
 *   electrical    NOT LAUNCHED  -> SOON
 *   store         NOT LAUNCHED  -> SOON
 *   gas_station   NOT LAUNCHED  -> SOON
 *
 * Semantics: ACTIVE = launched/operational; SOON = belongs to the product but
 * not launched; INACTIVE = launched but suspended; DELETED = removed. SOON and
 * INACTIVE are different facts, so this migration is NOT a generic prepare-up:
 * it corrects rows that are ACTIVE today, and only those.
 *
 * up():
 *   1. DATA: for the five unlaunched service keys, move ONLY rows whose current
 *      status is ACTIVE to SOON, keeping the derived `enabled` projection in
 *      sync. Rows already INACTIVE (suspended), SOON (explicitly unlaunched) or
 *      DELETED (removed) are NEVER rewritten: those are decisions taken after
 *      010 and this migration must not clobber them. `tow` is never in the key
 *      list. The key matched is `module_key`, the UNIQUE identity of a registry
 *      row (for a catalog service it equals `service_key`), so at most one row
 *      per service is corrected.
 *   2. SCHEMA (PostgreSQL only): the column default becomes SOON, so a row
 *      inserted later without an explicit status is never implicitly launched.
 *      SQLite cannot alter a column default; the offline harness mirrors this
 *      in its `CREATE TABLE` DDL (`tests/helpers/testDb.js`), exactly like
 *      migrations 006/008/009 mirror constraints.
 *
 * down():
 *   restores ONLY the schema default to ACTIVE (the exact prior schema).
 *   It deliberately does NOT rewrite data SOON -> ACTIVE: by the time someone
 *   rolls this migration back, SOON may be an explicit administrator decision,
 *   and a blanket rewrite would silently relaunch services. Data changes are
 *   corrected through the admin lifecycle surface, not by a rollback.
 *
 * Deterministic: no environment value, no clock, no seed. No `updated_by` is
 * fabricated; `updated_at` is not touched, matching the data-migration style of
 * 009/010.
 */
'use strict';

/** The five unlaunched initial services, matched by the UNIQUE `module_key`. */
const UNLAUNCHED_SERVICE_KEYS = Object.freeze([
  'mechanic',
  'tire_repair',
  'electrical',
  'store',
  'gas_station',
]);

/** The canonical lifecycle values this migration writes. */
const ACTIVE_STATUS = 'ACTIVE';
const SOON_STATUS = 'SOON';

function isPostgres(knex) {
  const dialect = knex.client && knex.client.dialect;
  const client = knex.client && knex.client.config && knex.client.config.client;
  return dialect === 'postgresql' || dialect === 'pg' || client === 'pg' || client === 'postgresql';
}

exports.up = async function up(knex) {
  await knex('service_modules')
    .whereIn('module_key', UNLAUNCHED_SERVICE_KEYS)
    .where({ status: ACTIVE_STATUS })
    .update({ status: SOON_STATUS, enabled: false });

  if (isPostgres(knex)) {
    await knex.raw(
      `ALTER TABLE service_modules ALTER COLUMN status SET DEFAULT '${SOON_STATUS}'`
    );
  }
};

exports.down = async function down(knex) {
  // Schema only: data is intentionally left as-is (see the header).
  if (isPostgres(knex)) {
    await knex.raw(
      `ALTER TABLE service_modules ALTER COLUMN status SET DEFAULT '${ACTIVE_STATUS}'`
    );
  }
};

module.exports.UNLAUNCHED_SERVICE_KEYS = UNLAUNCHED_SERVICE_KEYS;
