/**
 * SERVICE CATALOG — the canonical lifecycle status of a platform service.
 *
 * `service_modules` is the platform's service registry (one row per service:
 * `tow` today). Until now its availability was the boolean `enabled`. This
 * migration adds the canonical product lifecycle WITHOUT introducing a second
 * source of truth:
 *
 *   status       ACTIVE | INACTIVE | SOON | DELETED   (the authority)
 *   name         human display name for the public catalog
 *   sort_order   catalog ordering
 *
 * `enabled` is kept as a DERIVED compatibility projection: the repository writes
 * it in sync with `status` on every write, so old readers (the released module
 * endpoints) keep answering, but `status` is the single authority.
 *
 * Backfill (no automatic invention):
 *   enabled = true  -> ACTIVE   (existing services keep working)
 *   enabled = false -> INACTIVE (the module was explicitly disabled)
 * The Tow display name is set to the product copy used by the apps.
 *
 * The CHECK is added on PostgreSQL only (production dialect); SQLite cannot add a
 * CHECK to an existing table, so the offline harness mirrors the column and the
 * constraint inside its `CREATE TABLE` DDL (`tests/helpers/testDb.js`), exactly
 * like migrations 006/008 do.
 *
 * Deterministic: no environment value, no clock, no seed.
 */
'use strict';

/** The canonical lifecycle vocabulary. */
const SERVICE_STATUSES = ['ACTIVE', 'INACTIVE', 'SOON', 'DELETED'];
const ACTIVE_STATUS = 'ACTIVE';

function isPostgres(knex) {
  const dialect = knex.client && knex.client.dialect;
  const client = knex.client && knex.client.config && knex.client.config.client;
  return dialect === 'postgresql' || dialect === 'pg' || client === 'pg' || client === 'postgresql';
}

function quoteList(values) {
  return values.map((value) => `'${value}'`).join(', ');
}

const STATUS_CHECK = `status IN (${quoteList(SERVICE_STATUSES)})`;

exports.up = async function up(knex) {
  await knex.schema.alterTable('service_modules', (table) => {
    table.string('name', 150).nullable();
    table.string('status', 20).notNullable().defaultTo(ACTIVE_STATUS);
    table.integer('sort_order').notNullable().defaultTo(0);
    table.index(['status']);
    table.index(['sort_order']);
  });

  // Backfill the legacy boolean into the canonical status. `CASE WHEN` is plain
  // SQL supported by both engines; no data is invented beyond the mapping above.
  await knex('service_modules').update({
    status: knex.raw("CASE WHEN enabled THEN 'ACTIVE' ELSE 'INACTIVE' END"),
  });

  // Product display name for the canonical Tow service.
  await knex('service_modules').where({ module_key: 'tow' }).update({ name: 'Guincho' });

  if (isPostgres(knex)) {
    await knex.raw(
      `ALTER TABLE service_modules ADD CONSTRAINT service_modules_status_check CHECK (${STATUS_CHECK})`
    );
  }
};

exports.down = async function down(knex) {
  if (isPostgres(knex)) {
    await knex.raw('ALTER TABLE service_modules DROP CONSTRAINT IF EXISTS service_modules_status_check');
  }

  await knex.schema.alterTable('service_modules', (table) => {
    table.dropIndex(['sort_order']);
    table.dropIndex(['status']);
    table.dropColumn('status');
    table.dropColumn('sort_order');
    table.dropColumn('name');
  });
};

module.exports.SERVICE_STATUSES = SERVICE_STATUSES;
module.exports.STATUS_CHECK = STATUS_CHECK;
