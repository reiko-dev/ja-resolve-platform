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
 * Usage:
 *   node scripts/tow/pg-guard.js            # prints the resolved target
 *   node scripts/tow/pg-guard.js --assert   # exits 1 when unsafe
 */
'use strict';

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1'];
// Wildcard binds are explicitly refused: `0.0.0.0` / `::` listen on every
// interface, so a "test" database reachable through them is not isolated.
const WILDCARD_HOSTS = ['0.0.0.0', '::', '[::]', '*'];
const FORBIDDEN_USER_HINTS = ['prod', 'root', 'postgres'];
const TEST_DB_SUFFIX = '_test';

function resolveTestTarget(env = process.env) {
  return {
    enabled: env.TOW_POSTGRES_E2E === '1',
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT) || 55432,
    database: env.DB_NAME_TEST || 'socorre_ai_tow_test',
    user: env.DB_USER || 'tow_test',
    hasConnectionUrl: Boolean(
      (env.DATABASE_URL && String(env.DATABASE_URL).trim())
      || (env.PostgreSQL && String(env.PostgreSQL).trim())
    ),
  };
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
  resolveTestTarget,
  checkTestEnvironment,
  assertSafeTestEnvironment,
  describeTarget,
};
