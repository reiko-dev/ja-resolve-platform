/**
 * SERVICE LOCATION — additive place identity on the canonical TowRequest.
 *
 * Adds exactly TWO nullable TEXT columns, `tow_requests.pickup_place_id` and
 * `tow_requests.destination_place_id`, and nothing else. They persist the
 * provider place id of an EXPLICIT user selection (Service Location ADR §3):
 * `place_id` is the only place-derived datum that may be stored indefinitely;
 * the place NAME is never persisted (no column exists for it) and the
 * operational authority stays with `latitude`/`longitude`.
 *
 * Why the columns are NULLABLE and why there is NO backfill:
 *   - requests created before this delivery carry no place identity; inventing
 *     one would mint identity the user never selected (ADR §2 rule 4), so
 *     historical rows stay NULL and the API simply omits the member;
 *   - a generic coordinate (USER_PIN / CURRENT_LOCATION) legitimately has no
 *     place id, so NULL is a first-class value, not a failure. There is no
 *     CHECK: `place_id` is an opaque provider string, and the pair invariant
 *     (`resolution_source=USER_SELECTED_PLACE` ⇔ `place_id != null`) lives in
 *     the Tow domain validator, which rejects the invalid payload before a row
 *     is ever written.
 *
 * Both engines work unchanged: `ALTER TABLE ... ADD COLUMN` (nullable, no
 * default) is supported by PostgreSQL and SQLite, so unlike migrations
 * 006/008/009 there is no dialect guard — there is no CHECK/default to mirror.
 * The SQLite harness mirrors the two columns inside its `CREATE TABLE` DDL
 * (`tests/helpers/testDb.js`).
 *
 * Deterministic: no environment value, no clock, no data migration, no seed.
 */
'use strict';

exports.up = async function up(knex) {
  await knex.schema.alterTable('tow_requests', (table) => {
    table.text('pickup_place_id').nullable();
    table.text('destination_place_id').nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('tow_requests', (table) => {
    table.dropColumn('pickup_place_id');
    table.dropColumn('destination_place_id');
  });
};
