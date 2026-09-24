/**
 * TOW ROUND — the commercial payment choice on the canonical TowRequest.
 *
 * Adds exactly ONE nullable column, `tow_requests.payment_method`, and nothing
 * else. It records the method the CUSTOMER chose BEFORE the request was created
 * (`POST /tow/requests` requires it), which is a different authority from
 * `tow_payments`: that table remains the FINANCIAL execution (created lazily
 * after assignment, on the first financial write) and is never touched here.
 *
 * Why the column is NULLABLE and why there is NO backfill:
 *   - requests created before this delivery were born without a commercial
 *     choice; attributing `CASH` to them would invent a customer decision that
 *     was never made. The spec explicitly forbids that automatic attribution, so
 *     the migration leaves historical rows NULL and the API projects them as
 *     `null`;
 *   - NEW requests can never be NULL: the domain validator refuses a creation
 *     payload without `payment_method`, and the CHECK below pins every written
 *     value to the one method the MVP implements (`CASH`).
 *
 * The CHECK is added on PostgreSQL only (the production dialect). SQLite cannot
 * add a CHECK to an existing table, so the offline harness mirrors the column
 * and the constraint inside its `CREATE TABLE` DDL (`tests/helpers/testDb.js`),
 * exactly like migration 006 does.
 *
 * Deterministic: no environment value, no clock, no data migration, no seed.
 */
'use strict';

/** The only method this phase implements, in persistence vocabulary. */
const PAYMENT_METHODS = ['CASH'];

function isPostgres(knex) {
  const dialect = knex.client && knex.client.dialect;
  const client = knex.client && knex.client.config && knex.client.config.client;
  return dialect === 'postgresql' || dialect === 'pg' || client === 'pg' || client === 'postgresql';
}

function quoteList(values) {
  return values.map((value) => `'${value}'`).join(', ');
}

/**
 * The named CHECK constraints this migration installs on `tow_requests`.
 * `up()` and `down()` read the SAME list so a rollback can never drop a
 * different set than the one that was created.
 */
const REQUEST_CHECK_CONSTRAINTS = [
  ['tow_requests_payment_method_check',
    `payment_method IS NULL OR payment_method IN (${quoteList(PAYMENT_METHODS)})`],
];

exports.up = async function up(knex) {
  await knex.schema.alterTable('tow_requests', (table) => {
    table.string('payment_method', 10).nullable();
  });

  if (isPostgres(knex)) {
    for (const [name, condition] of REQUEST_CHECK_CONSTRAINTS) {
      // eslint-disable-next-line no-await-in-loop
      await knex.raw(`ALTER TABLE tow_requests ADD CONSTRAINT ${name} CHECK (${condition})`);
    }
  }
};

exports.down = async function down(knex) {
  if (isPostgres(knex)) {
    for (const [name] of [...REQUEST_CHECK_CONSTRAINTS].reverse()) {
      // eslint-disable-next-line no-await-in-loop
      await knex.raw(`ALTER TABLE tow_requests DROP CONSTRAINT IF EXISTS ${name}`);
    }
  }

  await knex.schema.alterTable('tow_requests', (table) => {
    table.dropColumn('payment_method');
  });
};

module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
module.exports.REQUEST_CHECK_CONSTRAINTS = REQUEST_CHECK_CONSTRAINTS;
