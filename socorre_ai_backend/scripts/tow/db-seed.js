#!/usr/bin/env node
/**
 * T01 — seed the default administrator.
 *
 * Credentials come from the environment (`ADMIN_EMAIL`, `ADMIN_PASSWORD`,
 * `ADMIN_NAME`); there is no default password. Running it twice is a no-op the
 * second time and never rotates an existing administrator's password.
 *
 * Usage:
 *   node scripts/tow/db-seed.js [--purpose test|dev] [--json]
 */
'use strict';

const { createConnection, resolvePurpose, loadPurposeEnv } = require('./db-connection');
const { runSeed } = require('./db-baseline');
const { describeSeedResult } = require('./admin-seed');

async function main() {
  const argv = process.argv.slice(2);
  const purpose = resolvePurpose(argv);
  loadPurposeEnv(purpose);
  const db = createConnection({ purpose });
  try {
    const result = await runSeed(db, process.env);
    console.log(`[db:seed] ${describeSeedResult(result)}`);
    if (argv.includes('--json')) {
      // Password-free by construction: the result only carries id/e-mail/state.
      console.log(JSON.stringify({ purpose, ...result }, null, 2));
    }
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[db:seed] ${error && error.message ? error.message : error}`);
    process.exitCode = 1;
  });
}
