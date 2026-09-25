#!/usr/bin/env node
/**
 * TOW CLIENT DEMO — controlled reset between demonstrations.
 *
 * The client may repeat the flow any number of times. This command removes ONLY
 * the Tow data that belongs to the two demo accounts, then restores the demo
 * partner to the operational state matching requires:
 *
 *   - TowRequests owned by the demo customer, and TowRequests assigned to or
 *     proposed by the demo partner;
 *   - their proposals, assignments, tracking and payments (deleted in FK-safe
 *     order; nothing else is touched);
 *   - partner operational flags: `is_online = true`, `is_available = true`,
 *     location restored, approval restored;
 *   - the `tow` module left enabled/ACTIVE.
 *
 * It NEVER deletes users, never deletes another account's data, never runs
 * `db:reset`, never drops/truncates a table. The demo accounts are updated in
 * place by `demo-seed`; this command only cleans the session data.
 *
 * Guard (fail-closed, see `demo-config.js`): requires `TOW_DEMO_ENV=demo`,
 * `TOW_DEMO_RESET_SESSION=1`, an explicit loopback target whose database name
 * ends with `_demo`, and refuses privileged users and connection URLs.
 *
 * Usage (VPS):
 *   set -a; source /var/www/socorre-ai/shared/backend.env; set +a
 *   TOW_DEMO_ENV=demo TOW_DEMO_RESET_SESSION=1 node scripts/tow/demo-reset-session.js
 */
'use strict';

require('dotenv').config();

const {
  assertDemoAuthorized,
  describeDemoTarget,
  createDemoConnection,
} = require('./demo-config');
const {
  assertDemoSchemaReady,
  findDemoIdentities,
  deleteDemoTowData,
  restoreDemoPartnerOperational,
  ensureTowModuleEnabled,
} = require('./demo-seed');

async function resetDemoSession(db, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const identities = await findDemoIdentities(db);

  return db.transaction(async (trx) => {
    const removed = await deleteDemoTowData(trx, identities);
    const restored = await restoreDemoPartnerOperational(trx, identities.partnerIds, now);
    const serviceModule = await ensureTowModuleEnabled(trx, now);
    return { removed, restored, serviceModule, partnerIds: identities.partnerIds };
  });
}

async function main() {
  const target = assertDemoAuthorized(process.env, { purpose: 'reset-session' });
  console.log(`[demo:reset-session] target: ${describeDemoTarget(target)}`);
  const db = createDemoConnection(target);
  try {
    await assertDemoSchemaReady(db);
    const result = await resetDemoSession(db);
    console.log('[demo:reset-session] demo-scoped Tow data removed:');
    for (const [table, count] of Object.entries(result.removed)) {
      console.log(`[demo:reset-session]   - ${table}: ${count}`);
    }
    console.log(`[demo:reset-session] demo partners restored to operational state: ${result.restored}`);
    console.log(`[demo:reset-session] module tow: enabled=${result.serviceModule.enabled}`);
    if (result.partnerIds.length === 0) {
      console.log('[demo:reset-session] WARNING: no demo partner found — run demo:tow:seed to provision the cast');
    }
    console.log('DEMO_RESET_SESSION=PASS');
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[demo:reset-session] ${error && error.message ? error.message : error}`);
    console.error('DEMO_RESET_SESSION=FAIL');
    process.exitCode = 1;
  });
}

module.exports = { resetDemoSession };
