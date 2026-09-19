/**
 * T01 — connection factory for the database baseline commands.
 *
 * Two purposes, one rule set:
 *
 *   `test` (default) — the disposable Docker database of the T00 harness.
 *     Requires the explicit opt-in (`TOW_POSTGRES_E2E=1`) and inherits every
 *     rule of `scripts/tow/pg-guard.js`: loopback host, `_test` database, no
 *     `DATABASE_URL`, non-privileged user. Configuration comes from
 *     `.env.test` (optional, shell wins); `.env` is NEVER read on this path.
 *
 *   `dev` — the local development database (`DB_NAME`). This path reads
 *     `socorre_ai_backend/.env` exactly like the application itself does, but
 *     the same safety rules still apply: the database name must end in `_dev`
 *     or `_test` (or be in the allowlist), the host must be loopback, the user
 *     must not look privileged, `DATABASE_URL` is refused and
 *     `NODE_ENV=production` is refused. So a `.env` that points at production
 *     cannot be used here, by construction.
 *
 * Destructive callers (`db-reset`) additionally require
 * `DB_RESET_CONFIRM=I_UNDERSTAND_DESTRUCTIVE_RESET`; see
 * `scripts/tow/db-reset-guard.js`.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const knexFactory = require('knex');
const { applyTestTargetDefaults } = require('./pg-guard');
const { checkResetAuthorization, describeResetTarget } = require('./db-reset-guard');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const ENV_FILE = path.join(BACKEND_DIR, '.env');

/** Parse `--purpose dev|test` (default `test`). */
function resolvePurpose(argv = process.argv) {
  const index = argv.indexOf('--purpose');
  const purpose = index !== -1 ? String(argv[index + 1] || '') : 'test';
  if (purpose !== 'dev' && purpose !== 'test') {
    throw new Error(`--purpose must be "dev" or "test" (received "${purpose}")`);
  }
  return purpose;
}

/**
 * Load the configuration source of the requested purpose.
 *
 * `test` relies on `.env.test` (already loaded by `pg-guard`, optional and
 * shell-preserving) and on the harness defaults applied below. `dev` reads
 * `.env` like the app does; `dotenv` never overrides an existing shell value.
 */
function loadPurposeEnv(purpose, env = process.env) {
  if (purpose !== 'dev') {
    applyTestTargetDefaults(env);
    return { envFile: null };
  }
  if (!fs.existsSync(ENV_FILE)) return { envFile: null };
  // Loaded lazily so the test path never even requires dotenv's file handling.
  // eslint-disable-next-line global-require
  require('dotenv').config({ path: ENV_FILE });
  return { envFile: ENV_FILE };
}

/**
 * Guard-checked target for the given purpose.
 *
 * @param {'dev'|'test'} purpose
 * @param {{ destructive?: boolean, env?: object }} [options]
 */
function checkPurpose(purpose, options = {}) {
  const env = options.env || process.env;
  return checkResetAuthorization(env, {
    purpose,
    requireConfirmation: Boolean(options.destructive),
  });
}

function unsafeError(violations) {
  const error = new Error(
    'Refusing to use a database that is not an authorized dev/test target:\n' +
    `  - ${violations.join('\n  - ')}`
  );
  error.code = 'UNSAFE_RESET_TARGET';
  error.violations = violations;
  return error;
}

/**
 * Knex connection for the guard-checked target.
 *
 * @param {{ purpose?: 'dev'|'test', destructive?: boolean, env?: object }} [options]
 */
function createConnection(options = {}) {
  const purpose = options.purpose || 'test';
  const check = checkPurpose(purpose, options);
  if (!check.safe) throw unsafeError(check.violations);
  const target = check.target;
  return knexFactory({
    client: 'postgresql',
    connection: {
      host: target.host,
      port: Number(target.port),
      database: target.database,
      user: target.user,
      password: target.password,
    },
    pool: { min: 0, max: 5 },
    acquireConnectionTimeout: 10_000,
  });
}

module.exports = {
  BACKEND_DIR,
  ENV_FILE,
  resolvePurpose,
  loadPurposeEnv,
  checkPurpose,
  createConnection,
  describeResetTarget,
  unsafeError,
};
