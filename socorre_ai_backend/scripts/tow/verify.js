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
 * Startup-failure contract (Codex round-3 P2 / thread 4048484296): a
 * PostgreSQL startup/health failure that recorded no stage entry always gets
 * its own `PostgreSQL environment (startup)` FAIL entry, even when an earlier
 * offline stage failed — the summary must never hide that the environment
 * never came up.
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
const { planPostgresFailureEntries } = require('./verify-stage-recording');

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
      // A PostgreSQL failure that recorded no stage entry (opt-in veto,
      // startup, health wait) is ALWAYS visible, even when an unrelated offline
      // stage already failed; a teardown failure keeps its own stage entry and
      // is never duplicated (Codex round-3 P2 / thread 4048484296, Muse M4-2 /
      // thread 4048163642). The decision is unit-tested in
      // tests/unit/towVerifyStageRecording.test.js.
      for (const entry of planPostgresFailureEntries({
        recordedNames: results.map((recorded) => recorded.name),
        error: envError,
      })) {
        results.push(entry);
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
