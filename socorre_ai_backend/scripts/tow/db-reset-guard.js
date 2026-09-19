#!/usr/bin/env node
/**
 * T01 — destructive reset safety gate.
 *
 * `db-reset` drops every table of the target database. This module is the ONLY
 * place allowed to decide whether that is permissible, and it fails closed:
 * every rule below must hold, otherwise the caller throws and nothing is
 * dropped.
 *
 * Relationship with the T00 guard (`scripts/tow/pg-guard.js`):
 *   - `--purpose test` reuses `checkTestEnvironment()` verbatim (opt-in
 *     `TOW_POSTGRES_E2E=1`, loopback host, `_test` database, no
 *     `DATABASE_URL`, non-privileged user) and adds the reset-specific rules;
 *   - `--purpose dev` is a deliberately separate, narrower path for the local
 *     development database. It DOES read `socorre_ai_backend/.env` (through
 *     `db-connection.loadPurposeEnv`, exactly like the application itself), so
 *     it can inherit whatever that file points at — but the rules below are
 *     applied to the RESOLVED values, so a `.env` that points at production
 *     still cannot be used: the database name must end in `_dev` or `_test`
 *     (or be in the small allowlist below), the host must be loopback, the user
 *     must not look privileged, `DATABASE_URL` is refused and
 *     `NODE_ENV=production` is refused.
 *
 * Why the confirmation token is separate from `E2E_RESET_CONFIRM`: the E2E
 * script deletes *rows* of an already-provisioned database; this gate deletes
 * the *schema*. Reusing the same token would let an operator who learned one
 * token run the other operation. Two operations, two explicit consents.
 *
 * There is deliberately NO bypass flag: production can never be reset by
 * default, by a missing variable, or by a typo in a variable name. The only
 * way to widen the target is to change this file (code review + commit).
 *
 * Usage:
 *   node scripts/tow/db-reset-guard.js --purpose test --assert
 *   node scripts/tow/db-reset-guard.js --purpose dev
 */
'use strict';

const { checkTestEnvironment } = require('./pg-guard');

/** The exact phrase a human must set to authorize a schema-destroying reset. */
const RESET_CONFIRM_TOKEN = 'I_UNDERSTAND_DESTRUCTIVE_RESET';
const CONFIRM_VAR = 'DB_RESET_CONFIRM';

/** Databases the dev/test reset is allowed to touch, beyond the name pattern. */
const ALLOWED_DATABASE_NAMES = ['socorre_ai_dev', 'socorre_ai_test', 'socorre_ai_tow_test'];

/** Any of these in the database name refuses the reset outright. */
const FORBIDDEN_NAME_HINTS = ['prod', 'production', 'live', 'vps', 'homolog', 'staging', 'main', 'master'];

/** A dev/test database name must end with one of these. */
const ALLOWED_NAME_SUFFIXES = ['_dev', '_test'];

/** Dev/test databases always live on the loopback interface. */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1'];
const WILDCARD_HOSTS = ['0.0.0.0', '::', '[::]', '*'];

/** A reset must never run as one of these. */
const FORBIDDEN_USER_HINTS = ['prod', 'root', 'postgres', 'admin', 'superuser'];

const PURPOSES = ['dev', 'test'];

/**
 * Resolve the target the reset would destroy.
 *
 * `test` reuses the disposable harness target (`DB_NAME_TEST`); `dev` reads the
 * development variables (`DB_NAME`) but applies the same loopback/suffix rules.
 * Nothing is defaulted: a missing variable is a violation, not a fallback.
 */
function resolveResetTarget(env = process.env, purpose = 'test') {
  const isTest = purpose === 'test';
  const nameVar = isTest ? 'DB_NAME_TEST' : 'DB_NAME';
  const rawName = env[nameVar];
  return {
    purpose,
    nameVar,
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: rawName,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    nodeEnv: env.NODE_ENV,
    confirmed: env[CONFIRM_VAR] === RESET_CONFIRM_TOKEN,
    hasConnectionUrl: Boolean(
      (env.DATABASE_URL && String(env.DATABASE_URL).trim())
      || (env.PostgreSQL && String(env.PostgreSQL).trim())
    ),
  };
}

function isAllowedDatabaseName(name) {
  const value = String(name || '').trim();
  if (!value) return false;
  if (ALLOWED_DATABASE_NAMES.includes(value)) return true;
  return ALLOWED_NAME_SUFFIXES.some((suffix) => value.endsWith(suffix));
}

/**
 * @returns {{ safe: boolean, target: object, violations: string[] }}
 */
function checkResetAuthorization(env = process.env, options = {}) {
  const purpose = options.purpose || 'test';
  if (!PURPOSES.includes(purpose)) {
    return {
      safe: false,
      target: resolveResetTarget(env, purpose),
      violations: [`unknown reset purpose "${purpose}" (expected one of: ${PURPOSES.join(', ')})`],
    };
  }

  const target = resolveResetTarget(env, purpose);
  const violations = [];
  // `requireConfirmation: false` is used by the non-destructive baseline
  // commands (migrate/seed/assert): they must obey every target rule, but they
  // do not destroy anything, so they do not need the human consent token.
  const requireConfirmation = options.requireConfirmation !== false;

  // 1. Explicit human consent.
  if (requireConfirmation && !target.confirmed) {
    violations.push(`${CONFIRM_VAR} must be exactly "${RESET_CONFIRM_TOKEN}" to authorize a destructive reset`);
  }

  // 2. Production can never be reached, whatever the other variables say.
  if (String(target.nodeEnv || '').trim().toLowerCase() === 'production') {
    violations.push('NODE_ENV=production: the destructive reset is disabled in production');
  }

  // 3. An explicit target is mandatory (no implicit localhost/5432/postgres).
  for (const [label, value] of [['DB_HOST', target.host], ['DB_PORT', target.port], [target.nameVar, target.database], ['DB_USER', target.user]]) {
    if (value === undefined || value === null || String(value).trim() === '') {
      violations.push(`${label} must be set explicitly: the reset never falls back to a default target`);
    }
  }

  // 4. Connection URLs may point anywhere (production included) — refuse them.
  if (target.hasConnectionUrl) {
    violations.push('DATABASE_URL/PostgreSQL must not be set: the reset only accepts an explicit host/port/database/user');
  }

  // 5. Loopback only.
  const host = String(target.host || '').trim().toLowerCase();
  if (WILDCARD_HOSTS.includes(host)) {
    violations.push(`DB_HOST must not be a wildcard bind address, got "${target.host}"`);
  } else if (host && !LOOPBACK_HOSTS.includes(host)) {
    violations.push(`DB_HOST must be loopback, got "${target.host}"`);
  }

  // 6. Database name: allowlist/pattern, plus a hard refusal list.
  const database = String(target.database || '').trim();
  if (database) {
    const lowered = database.toLowerCase();
    const hint = FORBIDDEN_NAME_HINTS.find((item) => lowered.includes(item));
    if (hint) {
      violations.push(`database name "${database}" contains the forbidden hint "${hint}"`);
    } else if (!isAllowedDatabaseName(database)) {
      violations.push(
        `database name "${database}" is not an allowed dev/test database ` +
        `(allowed: ${ALLOWED_DATABASE_NAMES.join(', ')} or any name ending in ${ALLOWED_NAME_SUFFIXES.join('/')})`
      );
    }
  }

  // 7. Never as a privileged/administrative role.
  const user = String(target.user || '').toLowerCase();
  if (user) {
    const hint = FORBIDDEN_USER_HINTS.find((item) => user.includes(item));
    if (hint) violations.push(`DB_USER "${target.user}" looks like a privileged user ("${hint}")`);
  }

  // 8. Test purpose additionally inherits every T00 harness rule.
  if (purpose === 'test') {
    const harness = checkTestEnvironment(env);
    for (const violation of harness.violations) {
      if (!violations.includes(violation)) violations.push(violation);
    }
  }

  return { safe: violations.length === 0, target, violations };
}

function assertResetAuthorized(env = process.env, options = {}) {
  const result = checkResetAuthorization(env, options);
  if (!result.safe) {
    const error = new Error(
      'Refusing to reset a database that is not an authorized disposable dev/test target:\n' +
      `  - ${result.violations.join('\n  - ')}`
    );
    error.code = 'UNSAFE_RESET_TARGET';
    error.violations = result.violations;
    throw error;
  }
  return result.target;
}

/** Password-free description, safe for logs and CI output. */
function describeResetTarget(target) {
  return `postgresql://${target.user}@${target.host}:${target.port}/${target.database} (purpose: ${target.purpose})`;
}

module.exports = {
  RESET_CONFIRM_TOKEN,
  CONFIRM_VAR,
  ALLOWED_DATABASE_NAMES,
  ALLOWED_NAME_SUFFIXES,
  FORBIDDEN_NAME_HINTS,
  FORBIDDEN_USER_HINTS,
  LOOPBACK_HOSTS,
  WILDCARD_HOSTS,
  PURPOSES,
  isAllowedDatabaseName,
  resolveResetTarget,
  checkResetAuthorization,
  assertResetAuthorized,
  describeResetTarget,
};

if (require.main === module) {
  // Lazy require: `db-connection` depends on this module, so it can only be
  // loaded once the guard itself is fully initialized.
  // eslint-disable-next-line global-require
  const { resolvePurpose, loadPurposeEnv } = require('./db-connection');
  try {
    const purpose = resolvePurpose(process.argv.slice(2));
    // Same configuration source as the commands, so this pre-flight reports the
    // exact target `db:reset` would use (harness defaults for `test`, `.env` for
    // `dev`; the guard rules still apply afterwards).
    loadPurposeEnv(purpose);
    const result = checkResetAuthorization(process.env, { purpose });
    console.log(`Destructive reset target: ${describeResetTarget(result.target)}`);
    console.log(`authorized (${CONFIRM_VAR}): ${result.target.confirmed ? 'yes' : 'no'}`);
    if (result.safe) {
      console.log('SAFE: the target satisfies every destructive-reset rule');
    } else {
      console.error('REFUSED:');
      for (const violation of result.violations) console.error(`  - ${violation}`);
      if (process.argv.includes('--assert')) process.exit(1);
    }
  } catch (error) {
    console.error(`[db:guard] ${error && error.message ? error.message : error}`);
    process.exit(1);
  }
}
