#!/usr/bin/env node
/**
 * T01 — destructive database reset (dev/test only).
 *
 * Drops the `public` schema (tables, constraints, indexes, sequences, Knex
 * bookkeeping) and recreates it empty, so the next `db:migrate` runs from zero.
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

const { createConnection, resolvePurpose, loadPurposeEnv } = require('./db-connection');

/** Drop and recreate `public`; returns the tables that were removed. */
async function resetDatabase(db) {
  const result = await db.raw(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  const tables = result.rows.map((row) => row.tablename);
  await db.raw('DROP SCHEMA IF EXISTS public CASCADE');
  await db.raw('CREATE SCHEMA public');
  return tables;
}

async function main() {
  const argv = process.argv.slice(2);
  const purpose = resolvePurpose(argv);
  const dryRun = argv.includes('--dry-run');
  loadPurposeEnv(purpose);
  // `--dry-run` only reads the catalog, so it requires the target to be
  // authorized but not the destructive consent token; the real reset requires
  // DB_RESET_CONFIRM=I_UNDERSTAND_DESTRUCTIVE_RESET.
  const db = createConnection({ purpose, destructive: !dryRun });
  try {
    if (dryRun) {
      const result = await db.raw(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
      );
      const tables = result.rows.map((row) => row.tablename);
      console.log(`[db:reset] dry-run: would drop ${tables.length} table(s) from schema "public"`);
      for (const table of tables) console.log(`[db:reset]   - ${table}`);
      if (argv.includes('--json')) console.log(JSON.stringify({ dryRun: true, purpose, tables }, null, 2));
      return;
    }
    const tables = await resetDatabase(db);
    console.log(`[db:reset] schema "public" recreated empty (dropped ${tables.length} table(s))`);
    if (argv.includes('--json')) console.log(JSON.stringify({ purpose, dropped: tables }, null, 2));
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[db:reset] ${error && error.message ? error.message : error}`);
    process.exitCode = 1;
  });
}

module.exports = { resetDatabase };
