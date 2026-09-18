#!/usr/bin/env node
/**
 * T00 — explicit "prepare database + run migrations from zero" stage of the
 * canonical `npm run verify:tow` sequence.
 *
 * Fails closed through scripts/tow/pg-guard.js: it refuses to touch anything
 * that is not the disposable loopback test database.
 */
'use strict';

const postgres = require('../../tests/helpers/tow/postgres');

async function main() {
  const target = postgres.safeTarget();
  console.log(`[verify:tow] migrations against ${postgres.targetDescription()}`);
  const db = postgres.createConnection();
  try {
    const { batch, applied } = await postgres.migrateFromScratch(db);
    const tables = await postgres.listTables(db);
    console.log(`[verify:tow] migrations applied: ${applied.length} (batch ${batch})`);
    console.log(`[verify:tow] tables in public: ${tables.length}`);
  } finally {
    await db.destroy();
  }
  console.log(`[verify:tow] database ready at ${target.host}:${target.port}/${target.database}`);
}

main().catch((error) => {
  console.error(`[verify:tow] migration stage failed: ${error && error.message ? error.message : error}`);
  process.exit(1);
});
