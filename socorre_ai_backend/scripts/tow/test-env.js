#!/usr/bin/env node
/**
 * T00 — disposable PostgreSQL environment orchestration.
 *
 * Implements the canonical sequence of docs/tow/TOW-DOCKER-TEST-STRATEGY.md §5:
 *   up -> wait for healthcheck -> (caller runs migrations/gates) -> down
 *
 * Configuration (Codex finding C1): the harness entrypoint loads
 * `socorre_ai_backend/.env.test` explicitly (optional, shell values always win)
 * before anything else, and hands the resolved canonical target to every child
 * process it spawns (`docker compose`, migrations, Jest). Compose therefore
 * interpolates exactly the host/port/database/user that pg-guard, the Knex
 * helper and `src/config/database.js` use (Codex finding C2).
 *
 * Cleanup is guaranteed by `runWithEnvironment()` even when the suite fails OR
 * when the startup itself fails part-way: the startup attempt lives inside the
 * same cleanup scope, so a partially created container/network is still
 * destroyed (Codex finding C3). `down()` is safe and idempotent when nothing
 * was created.
 *
 * Teardown failure contract (Muse M4-2 / Codex thread 4048163642): a real
 * `docker compose down` failure is NEVER swallowed. With no earlier error it
 * fails the gate; with an earlier workload/startup error that error stays the
 * rejection and carries the teardown failure as `error.teardownError`.
 *
 * Compose project isolation (Codex round-3 P1, thread 4048484277): the project
 * name is no longer a fixed constant. Two concurrent runs on the same Docker
 * daemon (different worktrees or CI jobs, even with different `DB_PORT`) must
 * never manage the same container/network/volume, so `resolveComposeProject()`
 * derives a unique, deterministic name scoped to this run and
 * `docker-compose.test.yml` fixes no `container_name` / network `name` any
 * more. `TOW_TEST_PG_PROJECT` overrides the name explicitly.
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
const crypto = require('crypto');
const path = require('path');
const { describeEnvFile, loadTestEnvFile } = require('./test-env-file');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const COMPOSE_FILE = path.join(BACKEND_DIR, 'docker-compose.test.yml');
const HEALTH_TIMEOUT_MS = Number(process.env.TOW_TEST_PG_HEALTH_TIMEOUT_MS) || 90_000;
// Compose accepts [a-z0-9][a-z0-9_-]* (max 63 chars). Reject anything else
// loudly instead of letting Compose fail with an opaque error.
const COMPOSE_PROJECT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;

// Explicit, optional, shell-preserving: this is the only env file the harness
// reads. Loaded before pg-guard so the resolved target uses these values.
const envFileInfo = loadTestEnvFile();

const {
  applyTestTargetDefaults,
  checkTestEnvironment,
  describeTarget,
  resolveHarnessEnv,
  resolveTestTarget,
} = require('./pg-guard');

/**
 * Compose project name for THIS harness run (Codex round-3 P1 / thread
 * 4048484277).
 *
 * `TOW_TEST_PG_PROJECT` overrides the name when set (and is validated); with it
 * unset the default is deterministic and unique per run scope:
 *
 *   socorre-tow-test-<DB_PORT>-<first 8 hex of sha256(BACKEND_DIR)>
 *
 * The port keeps concurrent runs on different ports apart; the BACKEND_DIR hash
 * keeps different worktrees/clones apart even when they share a port. The name
 * is lowercase and Compose-safe. Empty `TOW_TEST_PG_PROJECT` counts as unset,
 * like every other harness variable.
 */
function resolveComposeProject(env = process.env) {
  const override = env.TOW_TEST_PG_PROJECT === undefined ? '' : String(env.TOW_TEST_PG_PROJECT).trim();
  if (override !== '') {
    if (!COMPOSE_PROJECT_PATTERN.test(override)) {
      throw new Error(
        `TOW_TEST_PG_PROJECT "${override}" is not a valid Compose project name`
        + ` (must match ${COMPOSE_PROJECT_PATTERN})`
      );
    }
    return override;
  }
  const port = resolveTestTarget(env).port;
  const scope = crypto.createHash('sha256').update(BACKEND_DIR).digest('hex').slice(0, 8);
  return `socorre-tow-test-${port}-${scope}`;
}

/** Project resolved for this process (`.env.test` already loaded). */
const COMPOSE_PROJECT = resolveComposeProject();

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

/**
 * Environment forwarded to child processes (docker compose, migrations, Jest).
 * The canonical target always wins over any stray `.env` Compose would
 * otherwise auto-load, so the published port and the client port cannot
 * diverge (Codex finding C2). The resolved Compose project travels with it so
 * migrations/Jest (and the e2e `docker compose config` render) inspect exactly
 * the project this run created (Codex round-3 P1 / thread 4048484277).
 */
function targetEnv(env = process.env) {
  const resolved = resolveHarnessEnv(env);
  return {
    ...resolved,
    TOW_TEST_PG_PROJECT: resolveComposeProject({ ...env, ...resolved }),
  };
}

function compose(args, options = {}) {
  const env = { ...targetEnv(), ...options.env };
  return run(
    'docker',
    ['compose', '-p', resolveComposeProject(env), '-f', COMPOSE_FILE, ...args],
    { ...options, env }
  );
}

function composeAvailable() {
  try {
    return run('docker', ['compose', 'version'], { capture: true, allowFailure: true }).status === 0;
  } catch (error) {
    // `docker` missing from PATH is a normal "not available" answer.
    return false;
  }
}

function up() {
  applyTestTargetDefaults(process.env);
  compose(['up', '-d', '--wait', '--wait-timeout', String(Math.ceil(HEALTH_TIMEOUT_MS / 1000))]);
  console.log('PostgreSQL test container is healthy');
}

/** Error raised when `docker compose down` itself fails (Muse M4-2). */
function makeTeardownError(message) {
  const error = new Error(message);
  error.name = 'TeardownError';
  error.isTeardownFailure = true;
  return error;
}

/** Human-readable teardown command. Contains no credentials by construction. */
function teardownCommand(project = resolveComposeProject()) {
  return `docker compose -p ${project} -f ${COMPOSE_FILE} down --volumes --remove-orphans --timeout 10`;
}

/**
 * Destroy containers, volumes and network.
 *
 * Idempotent when nothing was created (`docker compose down` with no resources
 * exits 0), but a REAL teardown failure is never swallowed: it is thrown as a
 * `TeardownError` (Muse M4-2 / Codex thread 4048163642) so the caller can fail
 * the gate. The message carries the command and exit status, never secrets.
 */
function down() {
  const args = ['down', '--volumes', '--remove-orphans', '--timeout', '10'];
  // The teardown message must name the SAME project `compose()` will use.
  const project = resolveComposeProject(targetEnv());
  let result;
  try {
    result = compose(args, { allowFailure: true, capture: true });
  } catch (error) {
    throw makeTeardownError(
      `docker compose down could not run (${error && error.message ? error.message : error}): ${teardownCommand(project)}`
    );
  }
  // Preserve the compose progress lines in the console/evidence.
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw makeTeardownError(`docker compose down failed (exit status ${result.status}): ${teardownCommand(project)}`);
  }
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
 * Preserve the workload/startup error as the rejection and attach the teardown
 * failure so it is not lost (Muse M4-2 / Codex thread 4048163642).
 */
function attachTeardownError(error, teardownError) {
  if (error && typeof error === 'object' && !Object.isFrozen(error)) {
    error.teardownError = teardownError;
    return error;
  }
  const message = `${error && error.message ? error.message : String(error)}`
    + ` (teardown also failed: ${teardownError.message})`;
  const wrapped = new Error(message);
  wrapped.cause = error;
  wrapped.teardownError = teardownError;
  return wrapped;
}

/**
 * Run `fn` with the disposable environment up, tearing it down even on failure.
 *
 * The safety guard runs BEFORE any startup/destructive operation, and the
 * startup attempt lives inside the cleanup scope: a partially created
 * container/network from a failed `up()` is still destroyed.
 *
 * `fn` receives the resolved, guard-checked target.
 *
 * Teardown contract (Muse M4-2): a teardown failure fails the gate when no
 * earlier error exists; otherwise the earlier error stays the rejection and
 * carries the teardown failure as `teardownError`.
 *
 * `options` is a minimal test seam (no mocking framework): `{ env, up,
 * waitForHealth, down }` may be injected to prove the lifecycle deterministically
 * without Docker.
 */
async function runWithEnvironment(fn, options = {}) {
  const env = options.env || process.env;
  const startUp = options.up || up;
  const waitHealthy = options.waitForHealth || waitForHealth;
  const tearDown = options.down || down;

  // Fail closed BEFORE anything is started or destroyed.
  const check = checkTestEnvironment(env);
  if (!check.safe) {
    throw new Error(`refusing to start test environment: ${check.violations.join('; ')}`);
  }
  applyTestTargetDefaults(env);

  let result;
  let workloadError = null;
  try {
    startUp();
    waitHealthy();
    result = await fn(check.target);
  } catch (error) {
    workloadError = error;
  }

  let teardownError = null;
  try {
    tearDown();
  } catch (error) {
    teardownError = error;
  }

  if (teardownError) {
    if (workloadError) throw attachTeardownError(workloadError, teardownError);
    throw teardownError;
  }
  if (workloadError) throw workloadError;
  return result;
}

const DOCKER_COMMANDS = new Set(['up', 'wait', 'down', 'status']);

function main() {
  const command = process.argv[2] || 'status';
  switch (command) {
    case 'up':
      console.log(`[test-env] ${describeEnvFile(envFileInfo)}`);
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
      // Read-only: never starts or destroys anything, so it must work without
      // Docker being available.
      const check = checkTestEnvironment();
      console.log(`[test-env] ${describeEnvFile(envFileInfo)}`);
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
  const command = process.argv[2] || 'status';
  if (DOCKER_COMMANDS.has(command) && !composeAvailable()) {
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
  COMPOSE_PROJECT_PATTERN,
  compose,
  resolveComposeProject,
  targetEnv,
  up,
  down,
  status,
  waitForHealth,
  runWithEnvironment,
  resolveTestTarget,
  envFileInfo,
};
