#!/usr/bin/env node
/**
 * T00 — disposable PostgreSQL environment orchestration.
 *
 * Implements the canonical sequence of docs/tow/TOW-DOCKER-TEST-STRATEGY.md §5:
 *   up -> wait for healthcheck -> (caller runs migrations/gates) -> down
 *
 * Cleanup is guaranteed by `runWithEnvironment()` even when the suite fails:
 * the `finally` block always tears the environment down.
 *
 * Commands:
 *   node scripts/tow/test-env.js up
 *   node scripts/tow/test-env.js wait
 *   node scripts/tow/test-env.js down
 *   node scripts/tow/test-env.js status
 *   node scripts/tow/test-env.js guard
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const { checkTestEnvironment, describeTarget, resolveTestTarget } = require('./pg-guard');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const COMPOSE_FILE = path.join(BACKEND_DIR, 'docker-compose.test.yml');
const COMPOSE_PROJECT = 'socorre-tow-test';
const HEALTH_TIMEOUT_MS = Number(process.env.TOW_TEST_PG_HEALTH_TIMEOUT_MS) || 90_000;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: BACKEND_DIR,
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`command failed (${result.status}): ${command} ${args.join(' ')}`);
  }
  return result;
}

function compose(args, options) {
  return run('docker', ['compose', '-p', COMPOSE_PROJECT, '-f', COMPOSE_FILE, ...args], options);
}

function composeAvailable() {
  const result = run('docker', ['compose', 'version'], { capture: true, allowFailure: true });
  return result.status === 0;
}

function up() {
  compose(['up', '-d', '--wait', '--wait-timeout', String(Math.ceil(HEALTH_TIMEOUT_MS / 1000))]);
  console.log('PostgreSQL test container is healthy');
}

function down() {
  compose(['down', '--volumes', '--remove-orphans', '--timeout', '10'], { allowFailure: true });
  console.log('PostgreSQL test environment destroyed (containers, volumes, network)');
}

function status() {
  compose(['ps'], { allowFailure: true });
}

/** Synchronous sleep without spawning a helper process. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Poll the container health status until healthy or timeout. */
function waitForHealth() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  for (;;) {
    const result = compose(['ps', '--format', 'json', 'tow-postgres-test'], { capture: true, allowFailure: true });
    const line = (result.stdout || '').trim().split('\n').filter(Boolean).pop();
    if (line) {
      try {
        const parsed = JSON.parse(line);
        const health = parsed.Health || parsed.health || '';
        if (String(health).toLowerCase() === 'healthy') {
          console.log('healthcheck: healthy');
          return true;
        }
      } catch (error) {
        // fall through and retry
      }
    }
    if (Date.now() > deadline) {
      throw new Error(`PostgreSQL test container did not become healthy within ${HEALTH_TIMEOUT_MS}ms`);
    }
    sleepSync(2000);
  }
}

/**
 * The dedicated PG commands (`npm run test:pg`, `npm run verify:tow`) ARE the
 * explicit opt-in; `TOW_POSTGRES_E2E=0` still vetoes them. The default Jest
 * suite never calls this, so it stays offline.
 */
function enableOptIn() {
  if (process.env.TOW_POSTGRES_E2E !== '0') {
    process.env.TOW_POSTGRES_E2E = '1';
  }
  return process.env.TOW_POSTGRES_E2E === '1';
}

/**
 * Run `fn` with the disposable environment up, tearing it down even on failure.
 * `fn` receives the resolved, guard-checked target.
 */
async function runWithEnvironment(fn) {
  const check = checkTestEnvironment();
  if (!check.safe) {
    throw new Error(`refusing to start test environment: ${check.violations.join('; ')}`);
  }
  up();
  try {
    waitForHealth();
    return await fn(check.target);
  } finally {
    down();
  }
}

function main() {
  const command = process.argv[2] || 'status';
  switch (command) {
    case 'up':
      up();
      break;
    case 'wait':
      waitForHealth();
      break;
    case 'down':
      down();
      break;
    case 'status':
      status();
      break;
    case 'guard': {
      const check = checkTestEnvironment();
      console.log(`target: ${describeTarget(check.target)}`);
      console.log(check.safe ? 'SAFE' : `UNSAFE: ${check.violations.join('; ')}`);
      process.exitCode = check.safe ? 0 : 1;
      break;
    }
    default:
      console.error(`unknown command: ${command}`);
      process.exitCode = 2;
  }
}

if (require.main === module) {
  if (!composeAvailable()) {
    console.error('docker compose is not available: the Tow PostgreSQL gate requires Docker');
    process.exit(1);
  }
  try {
    main();
  } catch (error) {
    console.error(String(error && error.message ? error.message : error));
    process.exit(1);
  }
}

module.exports = {
  BACKEND_DIR,
  enableOptIn,
  COMPOSE_FILE,
  COMPOSE_PROJECT,
  compose,
  up,
  down,
  status,
  waitForHealth,
  runWithEnvironment,
  resolveTestTarget,
};
