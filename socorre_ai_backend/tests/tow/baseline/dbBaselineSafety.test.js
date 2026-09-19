/**
 * T01 — SAFETY suite: the destructive reset can only ever reach a disposable
 * dev/test database.
 *
 * These tests are offline (no Docker, no PostgreSQL): they prove the decision
 * logic of `scripts/tow/db-reset-guard.js`, which is what `db:reset`,
 * `db:migrate`, `db:seed` and the clean-database gate all consult before doing
 * anything.
 */
'use strict';

const {
  RESET_CONFIRM_TOKEN,
  CONFIRM_VAR,
  ALLOWED_DATABASE_NAMES,
  checkResetAuthorization,
  assertResetAuthorized,
  describeResetTarget,
  isAllowedDatabaseName,
} = require('../../../scripts/tow/db-reset-guard');
const { checkPurpose, createConnection } = require('../../../scripts/tow/db-connection');

/** A fully authorized disposable TEST target. */
function safeTestEnv(overrides = {}) {
  const env = {
    TOW_POSTGRES_E2E: '1',
    NODE_ENV: 'test',
    DB_HOST: '127.0.0.1',
    DB_PORT: '55432',
    DB_NAME_TEST: 'socorre_ai_tow_test',
    DB_USER: 'tow_test',
    DB_PASSWORD: 'tow_test_password',
    [CONFIRM_VAR]: RESET_CONFIRM_TOKEN,
    ...overrides,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  return env;
}

/** A fully authorized local DEVELOPMENT target. */
function safeDevEnv(overrides = {}) {
  return safeTestEnv({
    TOW_POSTGRES_E2E: undefined,
    NODE_ENV: 'development',
    DB_NAME_TEST: undefined,
    DB_NAME: 'socorre_ai_dev',
    DB_PORT: '5432',
    DB_USER: 'socorre_dev',
    ...overrides,
  });
}

function expectUnsafe(result, matcher) {
  expect(result.safe).toBe(false);
  expect(result.violations.join('\n')).toMatch(matcher);
}

describe('T01 SAFETY — destructive reset guard', () => {
  describe('authorized targets', () => {
    test('accepts the disposable Docker test target with explicit consent', () => {
      const result = checkResetAuthorization(safeTestEnv(), { purpose: 'test' });
      expect(result.violations).toEqual([]);
      expect(result.safe).toBe(true);
      expect(result.target.database).toBe('socorre_ai_tow_test');
      expect(result.target.confirmed).toBe(true);
    });

    test('accepts the local development database ending in _dev', () => {
      const result = checkResetAuthorization(safeDevEnv(), { purpose: 'dev' });
      expect(result.violations).toEqual([]);
      expect(result.safe).toBe(true);
      expect(result.target.database).toBe('socorre_ai_dev');
    });

    test('accepts every allowlisted database name', () => {
      for (const name of ALLOWED_DATABASE_NAMES) {
        expect(isAllowedDatabaseName(name)).toBe(true);
      }
    });

    test('describeResetTarget never prints the password', () => {
      const target = checkResetAuthorization(
        safeTestEnv({ DB_PASSWORD: 'super-secret-password' }),
        { purpose: 'test' }
      ).target;
      const description = describeResetTarget(target);
      expect(description).not.toContain('super-secret-password');
      expect(description).toContain('socorre_ai_tow_test');
    });
  });

  describe('missing or wrong consent', () => {
    test('refuses when DB_RESET_CONFIRM is absent', () => {
      const result = checkResetAuthorization(safeTestEnv({ [CONFIRM_VAR]: undefined }), { purpose: 'test' });
      expectUnsafe(result, /DB_RESET_CONFIRM must be exactly/);
    });

    test('refuses a generic confirmation value', () => {
      for (const value of ['yes', 'true', '1', 'I_UNDERSTAND', 'confirm', RESET_CONFIRM_TOKEN.toLowerCase()]) {
        const result = checkResetAuthorization(safeTestEnv({ [CONFIRM_VAR]: value }), { purpose: 'test' });
        expectUnsafe(result, /DB_RESET_CONFIRM must be exactly/);
      }
    });

    test('the token is not the legacy E2E row-reset confirmation', () => {
      expect(RESET_CONFIRM_TOKEN).not.toBe('I_UNDERSTAND');
      expect(RESET_CONFIRM_TOKEN).toBe('I_UNDERSTAND_DESTRUCTIVE_RESET');
    });

    test('assertResetAuthorized throws with the documented error code', () => {
      expect(() => assertResetAuthorized(safeTestEnv({ [CONFIRM_VAR]: undefined }), { purpose: 'test' }))
        .toThrow(/Refusing to reset/);
      try {
        assertResetAuthorized(safeTestEnv({ [CONFIRM_VAR]: undefined }), { purpose: 'test' });
        throw new Error('expected the guard to throw');
      } catch (error) {
        expect(error.code).toBe('UNSAFE_RESET_TARGET');
        expect(Array.isArray(error.violations)).toBe(true);
      }
    });

    test('createConnection requires consent for the destructive purpose', () => {
      expect(() => createConnection({
        purpose: 'test',
        destructive: true,
        env: safeTestEnv({ [CONFIRM_VAR]: undefined }),
      })).toThrow(/Refusing to use a database/);
      // ... and refuses an unsafe target even for the non-destructive purpose.
      expect(() => createConnection({
        purpose: 'test',
        env: safeTestEnv({ [CONFIRM_VAR]: undefined, DB_NAME_TEST: 'socorre_ai_production' }),
      })).toThrow(/Refusing to use a database/);
      expect(checkPurpose('test', { env: safeTestEnv({ [CONFIRM_VAR]: undefined }) }).safe).toBe(true);
    });
  });

  describe('production can never be reached', () => {
    test('refuses NODE_ENV=production even with the token', () => {
      const result = checkResetAuthorization(safeTestEnv({ NODE_ENV: 'production' }), { purpose: 'test' });
      expectUnsafe(result, /NODE_ENV=production/);
    });

    test('refuses a production-sounding database name', () => {
      for (const name of ['socorre_ai_prod', 'socorre_ai_production_test', 'socorre_live_test', 'vps_test', 'homolog_test', 'staging_test']) {
        const result = checkResetAuthorization(safeTestEnv({ DB_NAME_TEST: name }), { purpose: 'test' });
        expectUnsafe(result, /forbidden hint/);
      }
    });

    test('refuses a database without the _dev/_test suffix', () => {
      const result = checkResetAuthorization(safeTestEnv({ DB_NAME_TEST: 'socorre_ai' }), { purpose: 'test' });
      expectUnsafe(result, /not an allowed dev\/test database/);
    });

    test('refuses DATABASE_URL, which may point anywhere', () => {
      const result = checkResetAuthorization(
        safeTestEnv({ DATABASE_URL: 'postgresql://user:pw@prod.example.com:5432/socorre' }),
        { purpose: 'test' }
      );
      expectUnsafe(result, /DATABASE_URL\/PostgreSQL must not be set/);
    });

    test('refuses the PostgreSQL service variable as well', () => {
      const result = checkResetAuthorization(
        safeTestEnv({ PostgreSQL: 'postgresql://user:pw@prod.example.com:5432/socorre' }),
        { purpose: 'test' }
      );
      expectUnsafe(result, /DATABASE_URL\/PostgreSQL must not be set/);
    });

    test('refuses remote and wildcard hosts', () => {
      for (const host of ['0.0.0.0', '::', '*', 'db.example.com', '10.0.0.7', 'postgres.internal']) {
        const result = checkResetAuthorization(safeTestEnv({ DB_HOST: host }), { purpose: 'test' });
        expectUnsafe(result, /DB_HOST/);
      }
    });

    test('refuses privileged users', () => {
      for (const user of ['postgres', 'root', 'prod_admin', 'superuser', 'admin']) {
        const result = checkResetAuthorization(safeTestEnv({ DB_USER: user }), { purpose: 'test' });
        expectUnsafe(result, /privileged/);
      }
    });

    test('refuses an implicit target (no explicit host/port/database/user)', () => {
      const result = checkResetAuthorization(
        safeTestEnv({ DB_HOST: undefined, DB_PORT: undefined, DB_NAME_TEST: undefined, DB_USER: undefined }),
        { purpose: 'test' }
      );
      expectUnsafe(result, /must be set explicitly/);
    });

    test('refuses an unknown purpose', () => {
      const result = checkResetAuthorization(safeTestEnv(), { purpose: 'production' });
      expectUnsafe(result, /unknown reset purpose/);
    });

    test('the dev path also refuses production hints and remote hosts', () => {
      expectUnsafe(
        checkResetAuthorization(safeDevEnv({ DB_NAME: 'socorre_ai_prod' }), { purpose: 'dev' }),
        /forbidden hint/
      );
      expectUnsafe(
        checkResetAuthorization(safeDevEnv({ DB_HOST: '10.1.2.3' }), { purpose: 'dev' }),
        /DB_HOST must be loopback/
      );
      expectUnsafe(
        checkResetAuthorization(safeDevEnv({ NODE_ENV: 'production' }), { purpose: 'dev' }),
        /NODE_ENV=production/
      );
      expectUnsafe(
        checkResetAuthorization(safeDevEnv({ DATABASE_URL: 'postgresql://u:p@h/db' }), { purpose: 'dev' }),
        /DATABASE_URL\/PostgreSQL must not be set/
      );
    });
  });

  describe('harness rules still apply to the test purpose', () => {
    test('refuses without the explicit TOW_POSTGRES_E2E opt-in', () => {
      const result = checkResetAuthorization(safeTestEnv({ TOW_POSTGRES_E2E: '0' }), { purpose: 'test' });
      expectUnsafe(result, /TOW_POSTGRES_E2E is not "1"/);
    });

    test('refuses a test database without the _test suffix even when allowlisted elsewhere', () => {
      const result = checkResetAuthorization(safeTestEnv({ DB_NAME_TEST: 'socorre_ai_dev' }), { purpose: 'test' });
      expectUnsafe(result, /DB_NAME_TEST must end with "_test"/);
    });
  });

  describe('non-destructive commands (migrate/seed/assert)', () => {
    test('do not require the destructive consent token', () => {
      const result = checkResetAuthorization(safeTestEnv({ [CONFIRM_VAR]: undefined }), {
        purpose: 'test',
        requireConfirmation: false,
      });
      expect(result.violations).toEqual([]);
      expect(result.safe).toBe(true);
    });

    test('still refuse every unsafe target', () => {
      expectUnsafe(
        checkResetAuthorization(safeTestEnv({ [CONFIRM_VAR]: undefined, DB_NAME_TEST: 'socorre_ai_prod' }), {
          purpose: 'test',
          requireConfirmation: false,
        }),
        /forbidden hint/
      );
      expectUnsafe(
        checkResetAuthorization(safeTestEnv({ [CONFIRM_VAR]: undefined, TOW_POSTGRES_E2E: '0' }), {
          purpose: 'test',
          requireConfirmation: false,
        }),
        /TOW_POSTGRES_E2E is not "1"/
      );
    });

    test('checkPurpose exposes the same decision used by the CLI commands', () => {
      expect(checkPurpose('test', { env: safeTestEnv({ [CONFIRM_VAR]: undefined }) }).safe).toBe(true);
      expect(checkPurpose('test', { env: safeTestEnv({ [CONFIRM_VAR]: undefined, NODE_ENV: 'production' }) }).safe).toBe(false);
      expect(checkPurpose('test', { env: safeTestEnv(), destructive: true }).safe).toBe(true);
    });
  });
});
