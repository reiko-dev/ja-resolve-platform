#!/usr/bin/env node
/**
 * T01 — run the clean baseline migrations (`database/migrations`).
 *
 * Refuses to run against a database that already contains UNMANAGED tables
 * (tables but no `knex_migrations`): that is the signature of a legacy database
 * built by the archived chain, and the documented upgrade path for those is a
 * reset (`npm run db:reset`), not an incremental migration.
 *
 * There is NO `--allow-existing` escape hatch (removed by the external-review
 * correction, PR #32): the T01 policy is `pre-T01 DB -> authorized reset ->
 * clean baseline`, and the rule lives in ONE place
 * (`db-baseline.js#baselineEligibility`, reached through `migrateBaseline`) so
 * no public migrate path can diverge. The flag is still recognized only to fail
 * loudly instead of being silently ignored.
 *
 * Usage:
 *   node scripts/tow/db-migrate.js [--purpose test|dev] [--json]
 */
'use strict';

const { createConnection, resolvePurpose, loadPurposeEnv } = require('./db-connection');
const { migrateBaseline, listTables } = require('./db-baseline');

async function main() {
  const argv = process.argv.slice(2);
  const purpose = resolvePurpose(argv);
  if (argv.includes('--allow-existing')) {
    throw new Error(
      '--allow-existing was removed: the T01 policy is "pre-T01 DB -> authorized reset -> clean baseline", ' +
      'so an unmanaged database is always refused. Run ' +
      'DB_RESET_CONFIRM=I_UNDERSTAND_DESTRUCTIVE_RESET npm run db:reset -- --purpose <dev|test> instead.'
    );
  }
  loadPurposeEnv(purpose);
  const db = createConnection({ purpose });
  try {
    // `migrateBaseline` applies the shared baseline-eligibility rule before
    // Knex is allowed to run anything.
    const { batch, applied } = await migrateBaseline(db);
    if (applied.length === 0) {
      console.log('[db:migrate] already up to date (no migration applied)');
    } else {
      console.log(`[db:migrate] applied ${applied.length} migration(s) in batch ${batch}`);
      for (const name of applied) console.log(`[db:migrate]   + ${name}`);
    }
    const after = await listTables(db);
    console.log(`[db:migrate] tables in public: ${after.length}`);
    if (argv.includes('--json')) console.log(JSON.stringify({ purpose, batch, applied, tables: after.length }, null, 2));
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[db:migrate] ${error && error.message ? error.message : error}`);
    process.exitCode = 1;
  });
}
