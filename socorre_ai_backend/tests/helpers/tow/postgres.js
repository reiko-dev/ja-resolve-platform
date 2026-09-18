/**
 * T00 — PostgreSQL harness helper for the Tow suite.
 *
 * The PostgreSQL harness is OPT-IN and runs against the disposable container
 * from `docker-compose.test.yml`:
 *
 *   npm run test:pg            # up -> migrate -> tests -> down
 *   TOW_POSTGRES_E2E=1 npx jest tests/tow --runInBand
 *
 * Every destructive helper calls `assertSafeTestEnvironment()` first, so an
 * accidental production target fails closed instead of truncating data.
 *
 * This module is mechanism only: it creates no Tow v1 schema and encodes no
 * business rule.
 */
'use strict';

const path = require('path');
const knexFactory = require('knex');
const {
  assertSafeTestEnvironment,
  checkTestEnvironment,
  describeTarget,
  resolveTestTarget,
} = require('../../../scripts/tow/pg-guard');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', '..', 'database', 'migrations');

function isEnabled(env = process.env) {
  return env.TOW_POSTGRES_E2E === '1';
}

/** Guard-checked target; throws (fail closed) when the target is unsafe. */
function safeTarget(env = process.env) {
  return assertSafeTestEnvironment(env);
}

/** Describe the resolved target without connecting (never prints the password). */
function targetDescription(env = process.env) {
  return describeTarget(resolveTestTarget(env));
}

function createConnection(env = process.env) {
  const target = safeTarget(env);
  return knexFactory({
    client: 'postgresql',
    connection: {
      host: target.host,
      port: target.port,
      database: target.database,
      user: target.user,
      password: env.DB_PASSWORD || 'tow_test_password',
    },
    pool: { min: 0, max: 5 },
    acquireConnectionTimeout: 10_000,
  });
}

/** Drop and recreate the `public` schema: migrations then run from zero. */
async function resetSchema(db) {
  assertSafeTestEnvironment();
  await db.raw('DROP SCHEMA IF EXISTS public CASCADE');
  await db.raw('CREATE SCHEMA public');
}

/** Run every migration from an empty schema and return the applied batch info. */
async function migrateFromScratch(db) {
  assertSafeTestEnvironment();
  await resetSchema(db);
  const [batch, applied] = await db.migrate.latest({ directory: MIGRATIONS_DIR });
  return { batch, applied };
}

/** List user tables in `public` (isolation/assert helpers). */
async function listTables(db) {
  const result = await db.raw(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  return result.rows.map((row) => row.tablename);
}

/** TRUNCATE every table in `public` with RESTART IDENTITY CASCADE. */
async function truncateAll(db) {
  assertSafeTestEnvironment();
  const tables = await listTables(db);
  if (tables.length === 0) return [];
  const quoted = tables.map((name) => `"${name}"`).join(', ');
  await db.raw(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`);
  return tables;
}

/**
 * Run `fn` inside a transaction that is always rolled back. Proves isolation
 * without leaving state behind; useful for "no leakage" assertions.
 */
async function withRollback(db, fn) {
  assertSafeTestEnvironment();
  let result;
  try {
    await db.transaction(async (trx) => {
      result = await fn(trx);
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  }
  return result;
}

class RollbackSignal extends Error {
  constructor() {
    super('intentional rollback');
    this.code = 'TOW_TEST_ROLLBACK';
  }
}

/** Count rows in a table (isolation assertions). */
async function countRows(db, table) {
  const result = await db.raw(`SELECT COUNT(*)::int AS count FROM "${table}"`);
  return result.rows[0].count;
}

module.exports = {
  MIGRATIONS_DIR,
  RollbackSignal,
  isEnabled,
  safeTarget,
  targetDescription,
  checkTestEnvironment,
  createConnection,
  resetSchema,
  migrateFromScratch,
  listTables,
  truncateAll,
  withRollback,
  countRows,
};
