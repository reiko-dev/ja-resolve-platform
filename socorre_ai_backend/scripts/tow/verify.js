#!/usr/bin/env node
/**
 * T00 — canonical `npm run verify:tow` gate.
 *
 * Sequence (docs/tow/TOW-DOCKER-TEST-STRATEGY.md §5):
 *
 *   OpenAPI structure gate        (no Docker, no network)
 *        ↓
 *   contract suite                (no Docker, no network)
 *        ↓
 *   focused Tow suite             (no Docker; PG harness skipped by default)
 *        ↓
 *   disposable PostgreSQL: up → healthcheck → prepare DB → migrations
 *        ↓
 *   PostgreSQL foundation gate    (TOW_POSTGRES_E2E=1)
 *        ↓
 *   destroy containers/volumes/network (always, even on failure)
 *        ↓
 *   exit code + summary
 *
 * Teardown failure contract (Muse M4-2 / Codex thread 4048163642): a failed
 * `docker compose down` is a FAILED stage and makes the summary RED/exit 1,
 * even when every test stage passed. If an earlier startup error exists, that
 * error is recorded and the teardown failure is recorded beside it.
 *
 * Flags:
 *   --skip-postgres   run only the offline gates (CI without Docker)
 *   --offline         alias of --skip-postgres
 *
 * Env:
 *   TOW_VERIFY_SKIP_POSTGRES=1   same as --skip-postgres
 *
 * Configuration: `socorre_ai_backend/.env.test` is loaded explicitly when
 * present (optional; shell/CI values always win) and the resolved canonical
 * PostgreSQL target is forwarded to every child process. The offline stage
 * always runs with `TOW_POSTGRES_E2E=0` so it never needs a container, even
 * when `.env.test` opts the harness in.
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const testEnv = require('./test-env');

const skipPostgres = process.argv.includes('--skip-postgres')
  || process.argv.includes('--offline')
  || process.env.TOW_VERIFY_SKIP_POSTGRES === '1';

const results = [];

function stage(name, fn) {
  const startedAt = Date.now();
  console.log(`\n=== [verify:tow] ${name} ===`);
  let ok = true;
  let detail = '';
  try {
    fn();
  } catch (error) {
    ok = false;
    detail = error && error.message ? error.message : String(error);
    console.error(`[verify:tow] FAILED: ${detail}`);
  }
  results.push({ name, ok, detail, ms: Date.now() - startedAt });
  return ok;
}

function jest(target, extraEnv = {}) {
  const result = spawnSync(
    process.execPath,
    [path.join(BACKEND_DIR, 'node_modules', 'jest', 'bin', 'jest.js'), target, '--runInBand'],
    { cwd: BACKEND_DIR, stdio: 'inherit', env: { ...process.env, ...extraEnv } }
  );
  if (result.status !== 0) {
    throw new Error(`jest ${target} exited with ${result.status}`);
  }
}

function node(script, extraEnv = {}) {
  const result = spawnSync(process.execPath, [path.join(BACKEND_DIR, script)], {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    throw new Error(`${script} exited with ${result.status}`);
  }
}

async function main() {
  stage('OpenAPI 3.1 structure gate', () => {
    node('scripts/tow/validate-openapi.js');
  });

  stage('contract suite (OpenAPI + patch semantics + discovery + consumer smoke)', () => {
    jest('tests/contract');
  });

  stage('focused Tow suite (offline)', () => {
    // Explicit veto: with `.env.test` present the harness is opted in, but this
    // stage is BY DESIGN offline (no container is up yet). The PostgreSQL stage
    // below re-enables the opt-in for its own children.
    jest('tests/tow', { TOW_POSTGRES_E2E: '0' });
  });

  if (skipPostgres) {
    results.push({ name: 'PostgreSQL foundation gate', ok: true, detail: 'skipped (--skip-postgres)', ms: 0 });
  } else {
    let envError = null;
    try {
      if (!testEnv.enableOptIn()) {
        throw new Error('TOW_POSTGRES_E2E=0 explicitly disables the PostgreSQL stage');
      }
      await testEnv.runWithEnvironment(async () => {
        const childEnv = { ...process.env, ...testEnv.targetEnv(), TOW_POSTGRES_E2E: '1' };
        stage('prepare database + migrations from zero', () => {
          node('scripts/tow/migrate-test-db.js', childEnv);
        });
        stage('PostgreSQL foundation gate', () => {
          jest('tests/tow/foundation/towPostgresFoundation.e2e.test.js', childEnv);
        });
      });
    } catch (error) {
      envError = error;
    }
    if (envError) {
      // A teardown failure must always be visible and must fail the gate
      // (Muse M4-2 / Codex thread 4048163642), even when every stage already
      // reported PASS. An earlier startup error keeps its own stage entry; a
      // teardown-only failure is recorded as the teardown stage.
      const failedBefore = results.some((entry) => !entry.ok);
      const teardownError = envError.teardownError
        || (envError.isTeardownFailure ? envError : null);
      const teardownOnly = Boolean(teardownError) && envError === teardownError;
      if (!failedBefore && !teardownOnly) {
        results.push({
          name: 'PostgreSQL foundation gate',
          ok: false,
          detail: envError.message,
          ms: 0,
        });
      }
      if (teardownError) {
        results.push({
          name: 'teardown (docker compose down)',
          ok: false,
          detail: teardownError.message,
          ms: 0,
        });
      }
    }
  }

  console.log('\n=== [verify:tow] summary ===');
  for (const entry of results) {
    console.log(`  ${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name}${entry.detail ? ` — ${entry.detail}` : ''}`);
  }
  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n[verify:tow] ${failed.length === 0 ? 'GREEN' : `RED (${failed.length} failing stage(s))`}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(`[verify:tow] unexpected failure: ${error && error.message ? error.message : error}`);
  process.exit(1);
});
