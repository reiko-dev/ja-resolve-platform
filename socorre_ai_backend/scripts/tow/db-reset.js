#!/usr/bin/env node
/**
 * T01 — destructive database reset (dev/test only).
 *
 * Drops the `public` schema (tables, constraints, indexes, sequences, Knex
 * bookkeeping) and recreates it empty, so the next `db:migrate` runs from zero.
 *
 * RESET SAFETY ARCHITECTURE (external review P1, PR #32)
 * -----------------------------------------------------
 * The DROP lives in a PRIVATE function of this module and is NOT exported. The
 * only public entry point is `resetDatabase({ purpose, env?, confirm?, dryRun? })`,
 * which always performs the same sequence:
 *
 *   1. resolve the target from the configuration (`env`/`process.env`);
 *   2. authorize THAT target through `db-reset-guard.js` (destructive consent
 *      token included unless `dryRun`);
 *   3. create the Knex connection FROM THE AUTHORIZED TARGET
 *      (`createConnectionForTarget(target)`) — the connection is a consequence
 *      of the authorization, never an input;
 *   4. run the private destructive primitive;
 *   5. destroy the connection.
 *
 * There is deliberately NO API that accepts a `Knex`/connection object: an
 * authorization obtained for a safe target can never be replayed against a
 * different connection, because no caller can supply a connection at all
 * (`resetDatabase(db)` is refused with `RESET_API_MISUSE`).
 *
 * This command is the ONLY destructive entry point of the baseline, and it
 * refuses to run unless `scripts/tow/db-reset-guard.js` authorizes the target:
 *
 *   DB_RESET_CONFIRM=I_UNDERSTAND_DESTRUCTIVE_RESET npm run db:reset
 *
 * The target must be an explicit loopback database whose name ends in `_dev` or
 * `_test` (see the guard for the full rule list). Production cannot be reached:
 * `NODE_ENV=production` is refused, `DATABASE_URL` is refused, wildcard and
 * remote hosts are refused, privileged users are refused, and there is no
 * bypass flag.
 *
 * Usage:
 *   node scripts/tow/db-reset.js [--purpose test|dev] [--dry-run] [--json]
 */
'use strict';

const {
  createConnectionForTarget,
  loadPurposeEnv,
  resolvePurpose,
} = require('./db-connection');
const {
  CONFIRM_VAR,
  assertResetAuthorized,
  describeResetTarget,
} = require('./db-reset-guard');

/** Options the public guarded reset accepts. Anything else is a misuse. */
const ALLOWED_RESET_OPTIONS = ['purpose', 'env', 'confirm', 'dryRun'];

class ResetApiMisuseError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'ResetApiMisuseError';
    this.code = 'RESET_API_MISUSE';
  }
}

/** Read-only catalog of `public` (used by `--dry-run` and the private DROP). */
async function listPublicTables(db) {
  const result = await db.raw(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  return result.rows.map((row) => row.tablename);
}

/**
 * THE destructive primitive. PRIVATE: never exported, never reachable from
 * another module. Its only caller is `resetDatabase()` below, which has already
 * authorized the target and built the connection from that very target.
 *
 * @param {import('knex').Knex} db connection created by `createConnectionForTarget`
 * @returns {Promise<string[]>} the tables that were removed
 */
async function dropPublicSchema(db) {
  const tables = await listPublicTables(db);
  await db.raw('DROP SCHEMA IF EXISTS public CASCADE');
  await db.raw('CREATE SCHEMA public');
  return tables;
}

/**
 * A Knex instance is a CALLABLE object (`knex('table')`) carrying these
 * members; a configuration object is a plain object without them.
 */
function looksLikeKnexConnection(value) {
  if (!value) return false;
  const type = typeof value;
  if (type !== 'object' && type !== 'function') return false;
  return typeof value.raw === 'function'
    && typeof value.destroy === 'function'
    && (typeof value.transaction === 'function' || typeof value.migrate === 'object');
}

/**
 * Fail closed on any shape other than the documented configuration object.
 *
 * Passing a connection (the pre-correction `resetDatabase(db)` API) is refused
 * explicitly: authorization would no longer be bound to the connection that
 * executes the DROP. The connection check runs first because a real Knex
 * instance is a function, and the specific diagnosis is more useful than the
 * generic "received function".
 */
function normalizeResetOptions(options) {
  if (options === undefined) return {};
  if (looksLikeKnexConnection(options)) {
    throw new ResetApiMisuseError(
      'resetDatabase() does not accept a database connection: the guarded reset resolves, ' +
      'authorizes and connects to the target itself, so the DROP can only run on the target ' +
      'that was authorized. Pass { purpose, env?, confirm? } instead.'
    );
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new ResetApiMisuseError(
      'resetDatabase() takes a configuration object ({ purpose, env?, confirm?, dryRun? }); ' +
      `received ${Array.isArray(options) ? 'an array' : typeof options}`
    );
  }
  const unknown = Object.keys(options).filter((key) => !ALLOWED_RESET_OPTIONS.includes(key));
  if (unknown.length > 0) {
    throw new ResetApiMisuseError(
      `unknown reset option(s): ${unknown.join(', ')} (allowed: ${ALLOWED_RESET_OPTIONS.join(', ')})`
    );
  }
  return options;
}

/**
 * The environment the authorization is computed from.
 *
 * `env` is an explicit, testable seam for embedded callers; when it is omitted
 * the command loads the configuration of the purpose exactly like the other
 * T01 commands (`--purpose test`: harness defaults; `--purpose dev`: the
 * backend `.env`).
 */
function resolveAuthorizationEnv(options, purpose) {
  if (options.env) return options.env;
  loadPurposeEnv(purpose);
  return process.env;
}

/**
 * Guarded destructive reset — the ONLY public way to drop the schema.
 *
 * @param {{ purpose?: 'dev'|'test', env?: object, confirm?: string, dryRun?: boolean }} [options]
 * @returns {Promise<{ dryRun: boolean, purpose: string, target: string, tables: string[], dropped: string[] }>}
 *   `target` is a password-free description; `tables` is the read-only catalog
 *   (dry-run) and `dropped` the tables actually removed (real reset).
 */
async function resetDatabase(options = {}) {
  const opts = normalizeResetOptions(options);
  const purpose = opts.purpose || 'test';
  const dryRun = Boolean(opts.dryRun);

  // 1. resolve + authorize the target. Nothing is connected before this throws.
  const env = resolveAuthorizationEnv(opts, purpose);
  const authorizationEnv = opts.confirm === undefined
    ? env
    : { ...env, [CONFIRM_VAR]: opts.confirm };
  // `--dry-run` only reads the catalog, so it requires the target to be
  // authorized but not the destructive consent token; the real reset requires
  // DB_RESET_CONFIRM=I_UNDERSTAND_DESTRUCTIVE_RESET.
  const target = assertResetAuthorized(authorizationEnv, {
    purpose,
    requireConfirmation: !dryRun,
  });

  // 2. connection built FROM the authorized target — never supplied by a caller.
  const db = createConnectionForTarget(target);
  const description = describeResetTarget(target);
  try {
    if (dryRun) {
      const tables = await listPublicTables(db);
      return { dryRun: true, purpose, target: description, tables, dropped: [] };
    }
    // 3. the private primitive; 4. the `finally` destroys the connection.
    const dropped = await dropPublicSchema(db);
    return { dryRun: false, purpose, target: description, tables: dropped, dropped };
  } finally {
    await db.destroy();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const purpose = resolvePurpose(argv);
  const dryRun = argv.includes('--dry-run');
  const result = await resetDatabase({ purpose, dryRun });
  if (result.dryRun) {
    console.log(`[db:reset] dry-run: would drop ${result.tables.length} table(s) from schema "public"`);
    for (const table of result.tables) console.log(`[db:reset]   - ${table}`);
    if (argv.includes('--json')) console.log(JSON.stringify({ dryRun: true, purpose, tables: result.tables }, null, 2));
    return;
  }
  console.log(`[db:reset] schema "public" recreated empty (dropped ${result.dropped.length} table(s))`);
  if (argv.includes('--json')) console.log(JSON.stringify({ purpose, dropped: result.dropped }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[db:reset] ${error && error.message ? error.message : error}`);
    process.exitCode = 1;
  });
}

/**
 * Public surface: the guarded reset and its misuse error. The destructive
 * primitive (`dropPublicSchema`) is intentionally absent — see the module
 * header and `tests/tow/baseline/dbBaselineSafety.test.js` (RESET-DIRECT-7).
 */
module.exports = { resetDatabase, ResetApiMisuseError };
