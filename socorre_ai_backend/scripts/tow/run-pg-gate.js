#!/usr/bin/env node
/**
 * T00 — `npm run test:pg`: the PostgreSQL foundation gate with a guaranteed
 * disposable environment (up → healthcheck → migrations → tests → down).
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const testEnv = require('./test-env');

async function main() {
  if (!testEnv.enableOptIn()) {
    throw new Error('TOW_POSTGRES_E2E=0 explicitly disables the PostgreSQL gate');
  }
  await testEnv.runWithEnvironment(async () => {
    // Children receive the canonical target explicitly (`.env.test` already
    // loaded in this process), so migrations, Jest and the app under test all
    // read the same host/port/database/user.
    const childEnv = { ...process.env, ...testEnv.targetEnv(), TOW_POSTGRES_E2E: '1' };
    const migrate = spawnSync(process.execPath, [path.join(BACKEND_DIR, 'scripts/tow/migrate-test-db.js')], {
      cwd: BACKEND_DIR,
      stdio: 'inherit',
      env: childEnv,
    });
    if (migrate.status !== 0) throw new Error(`migration stage exited with ${migrate.status}`);

    const jest = spawnSync(
      process.execPath,
      [
        path.join(BACKEND_DIR, 'node_modules', 'jest', 'bin', 'jest.js'),
        'tests/tow/foundation/towPostgresFoundation.e2e.test.js',
        '--runInBand',
      ],
      { cwd: BACKEND_DIR, stdio: 'inherit', env: childEnv }
    );
    if (jest.status !== 0) throw new Error(`PostgreSQL foundation gate exited with ${jest.status}`);
  });
  console.log('[test:pg] GREEN');
}

main().catch((error) => {
  console.error(`[test:pg] RED: ${error && error.message ? error.message : error}`);
  process.exit(1);
});
