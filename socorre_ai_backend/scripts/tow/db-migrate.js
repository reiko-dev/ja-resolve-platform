#!/usr/bin/env node
/**
 * T01 — run the clean baseline migrations (`database/migrations`).
 *
 * Refuses to run against a database that already contains UNMANAGED tables
 * (tables but no `knex_migrations`): that is the signature of a legacy database
 * built by the archived chain, and the documented upgrade path for those is a
 * reset (`npm run db:reset`), not an incremental migration.
 *
 * Usage:
 *   node scripts/tow/db-migrate.js [--purpose test|dev] [--allow-existing] [--json]
 */
'use strict';

const { createConnection, resolvePurpose, loadPurposeEnv } = require('./db-connection');
const { migrateBaseline, listTables } = require('./db-baseline');

async function main() {
  const argv = process.argv.slice(2);
  const purpose = resolvePurpose(argv);
  const allowExisting = argv.includes('--allow-existing');
  loadPurposeEnv(purpose);
  const db = createConnection({ purpose });
  try {
    const tables = await listTables(db);
    const managed = tables.includes('knex_migrations');
    if (tables.length > 0 && !managed && !allowExisting) {
      throw new Error(
        `database contains ${tables.length} table(s) but no "knex_migrations": it was not created by this baseline. ` +
        'Reset it first (DB_RESET_CONFIRM=I_UNDERSTAND_DESTRUCTIVE_RESET npm run db:reset) or pass --allow-existing.'
      );
    }
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
