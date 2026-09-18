#!/usr/bin/env node
/**
 * T00 — PostgreSQL test-environment safety guard.
 *
 * FAIL CLOSED. Every destructive operation of the Tow PostgreSQL harness
 * (migrate, truncate, reset) must pass through `assertSafeTestEnvironment()`.
 *
 * Rules (docs/tow/TOW-DOCKER-TEST-STRATEGY.md §9):
 *   1. `TOW_POSTGRES_E2E === '1'` — explicit opt-in, never implicit;
 *   2. host must be loopback (localhost / 127.0.0.1 / ::1); wildcard binds
 *      (0.0.0.0 / :: / *) are refused explicitly;
 *   3. database name must end with `_test`;
 *   4. `DATABASE_URL` / `PostgreSQL` must not be set (they may point at prod);
 *   5. user must not contain a privileged-sounding production user hint
 *      (case-insensitive substring: `prod`, `root`, `postgres`).
 *
 * Configuration (Codex findings C1/C2): requiring this module loads
 * `socorre_ai_backend/.env.test` explicitly (optional, shell values always
 * win) through `scripts/tow/test-env-file.js`, and
 * `applyTestTargetDefaults()` makes the resolved target explicit in the
 * environment so Compose, the Knex helper, `src/config/database.js` and the
 * Express `/health` route all read the SAME host/port/database/user.
 *
 * Usage:
 *   node scripts/tow/pg-guard.js            # prints the resolved target
 *   node scripts/tow/pg-guard.js --assert   # exits 1 when unsafe
 */
'use strict';

const {
  describeEnvFile,
  hasEffectiveValue,
  lastLoadedEnvFileInfo,
  loadTestEnvFile,
} = require('./test-env-file');

// Explicit, optional, shell-preserving: the harness configuration lives in
// `.env.test` only. `.env` (dev/prod secrets) is never read here.
loadTestEnvFile();

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1'];
// Wildcard binds are explicitly refused: `0.0.0.0` / `::` listen on every
// interface, so a "test" database reachable through them is not isolated.
const WILDCARD_HOSTS = ['0.0.0.0', '::', '[::]', '*'];
const FORBIDDEN_USER_HINTS = ['prod', 'root', 'postgres'];
const TEST_DB_SUFFIX = '_test';
const DEFAULT_PASSWORD = 'tow_test_password';

function resolveTestTarget(env = process.env) {
  return {
    enabled: env.TOW_POSTGRES_E2E === '1',
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT) || 55432,
    database: env.DB_NAME_TEST || 'socorre_ai_tow_test',
    user: env.DB_USER || 'tow_test',
    password: env.DB_PASSWORD || DEFAULT_PASSWORD,
    hasConnectionUrl: Boolean(
      (env.DATABASE_URL && String(env.DATABASE_URL).trim())
      || (env.PostgreSQL && String(env.PostgreSQL).trim())
    ),
  };
}

/**
 * The canonical environment of the disposable target.
 *
 * Every consumer of the harness (docker compose interpolation, the Knex test
 * helper, `src/config/database.js` through the spawned Jest child) must read
 * the same values; this is the single map that is both applied in-process and
 * forwarded to child processes. `NODE_ENV=test` keeps production/development
 * config from being selected; `DB_SSL=false` matches the tmpfs container.
 */
function resolveHarnessEnv(env = process.env) {
  const target = resolveTestTarget(env);
  return {
    NODE_ENV: 'test',
    DB_HOST: target.host,
    DB_PORT: String(target.port),
    DB_NAME_TEST: target.database,
    DB_USER: target.user,
    DB_PASSWORD: target.password,
    DB_SSL: 'false',
  };
}

/**
 * Make the resolved target explicit in `env` (defaults to `process.env`).
 *
 * Only fills variables that are absent or empty: explicit shell/CI values keep
 * precedence, exactly like the `.env.test` loader. No-op unless the harness was
 * explicitly opted in (`TOW_POSTGRES_E2E=1`), so the offline suite is untouched.
 */
function applyTestTargetDefaults(env = process.env) {
  const target = resolveTestTarget(env);
  if (!target.enabled) return target;
  for (const [key, value] of Object.entries(resolveHarnessEnv(env))) {
    if (!hasEffectiveValue(env, key)) env[key] = value;
  }
  return target;
}

/** @returns {{ safe: boolean, target: object, violations: string[] }} */
function checkTestEnvironment(env = process.env) {
  const target = resolveTestTarget(env);
  const violations = [];

  if (!target.enabled) {
    violations.push('TOW_POSTGRES_E2E is not "1": the PostgreSQL harness is opt-in only');
  }
  const host = String(target.host).trim().toLowerCase();
  if (WILDCARD_HOSTS.includes(host)) {
    violations.push(`DB_HOST must not be a wildcard bind address, got "${target.host}"`);
  } else if (!LOOPBACK_HOSTS.includes(host)) {
    violations.push(`DB_HOST must be loopback for tests, got "${target.host}"`);
  }
  if (!String(target.database).endsWith(TEST_DB_SUFFIX)) {
    violations.push(`DB_NAME_TEST must end with "${TEST_DB_SUFFIX}", got "${target.database}"`);
  }
  if (target.hasConnectionUrl) {
    violations.push('DATABASE_URL/PostgreSQL must not be set for the disposable test environment');
  }
  if (FORBIDDEN_USER_HINTS.some((hint) => String(target.user).toLowerCase().includes(hint))) {
    violations.push(`DB_USER "${target.user}" looks like a privileged production user`);
  }

  return { safe: violations.length === 0, target, violations };
}

function assertSafeTestEnvironment(env = process.env) {
  const result = checkTestEnvironment(env);
  if (!result.safe) {
    const error = new Error(
      `Refusing to run against a non-test PostgreSQL target:\n  - ${result.violations.join('\n  - ')}`
    );
    error.code = 'UNSAFE_TEST_DATABASE';
    error.violations = result.violations;
    throw error;
  }
  return result.target;
}

function describeTarget(target) {
  return `postgresql://${target.user}@${target.host}:${target.port}/${target.database}`;
}

if (require.main === module) {
  const result = checkTestEnvironment();
  console.log(describeEnvFile(lastLoadedEnvFileInfo()));
  console.log(`Tow PostgreSQL test target: ${describeTarget(result.target)}`);
  console.log(`opt-in (TOW_POSTGRES_E2E=1): ${result.target.enabled ? 'yes' : 'no'}`);
  if (!result.safe) {
    console.error('UNSAFE:');
    for (const violation of result.violations) console.error(`  - ${violation}`);
    if (process.argv.includes('--assert')) process.exit(1);
  } else {
    console.log('SAFE: target satisfies the disposable test environment rules');
  }
}

module.exports = {
  LOOPBACK_HOSTS,
  WILDCARD_HOSTS,
  TEST_DB_SUFFIX,
  DEFAULT_PASSWORD,
  resolveTestTarget,
  resolveHarnessEnv,
  applyTestTargetDefaults,
  checkTestEnvironment,
  assertSafeTestEnvironment,
  describeTarget,
};
