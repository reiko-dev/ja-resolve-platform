/**
 * Tow local validation profile — offline contract tests.
 *
 * The live gate (Docker + backend + HTTP smoke) is expensive; these checks run
 * in the default offline suite and freeze the profile's safety properties:
 *
 *   - `.env.validation.example` is a tracked, secret-free example that declares
 *     every key the launcher, the seed and the smoke rely on;
 *   - it never targets the shared test database (port 55432 / `socorre_ai_tow_test`);
 *   - it pins the deterministic doubles (`TOW_PAYMENT_MODE=mock`,
 *     `TOW_ROUTE_PROVIDER=validation-fixture`) and a `*_validation_test` database;
 *   - the defensive namespace guard exported by `validation-env.js` refuses any
 *     other database name.
 *
 * Requiring the orchestrator loads the harness env file; the test neutralizes
 * `TOW_TEST_ENV_FILE` to a non-existent path and restores every managed variable
 * afterwards, so no validation value leaks into the rest of the suite.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const EXAMPLE_PATH = path.join(BACKEND_DIR, '.env.validation.example');

const REQUIRED_KEYS = [
  'NODE_ENV',
  'APP_ENV',
  'PORT',
  'HOST',
  'TOW_PAYMENT_MODE',
  'TOW_ROUTE_PROVIDER',
  'JWT_SECRET',
  'TOW_POSTGRES_E2E',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_NAME_TEST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_SSL',
  'GOOGLE_ROUTES_API_KEY',
  'GOOGLE_MAPS_API_KEY',
  'TOW_DOCUMENT_STORAGE_DIR',
];

const MANAGED_KEYS = [
  'TOW_TEST_ENV_FILE',
  'TOW_TEST_PG_PROJECT',
  'TOW_POSTGRES_E2E',
  'NODE_ENV',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_NAME_TEST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_SSL',
];

function parseExample() {
  return dotenv.parse(fs.readFileSync(EXAMPLE_PATH));
}

describe('Tow validation profile example (.env.validation.example)', () => {
  const profile = parseExample();

  test('is a tracked, readable file', () => {
    expect(fs.existsSync(EXAMPLE_PATH)).toBe(true);
    expect(fs.statSync(EXAMPLE_PATH).isFile()).toBe(true);
  });

  test.each(REQUIRED_KEYS)('declares %s', (key) => {
    expect(Object.prototype.hasOwnProperty.call(profile, key)).toBe(true);
  });

  test('pins the deterministic provider doubles', () => {
    expect(profile.TOW_PAYMENT_MODE).toBe('mock');
    expect(profile.TOW_ROUTE_PROVIDER).toBe('validation-fixture');
  });

  test('targets a dedicated validation database, never the shared test one', () => {
    expect(profile.DB_NAME_TEST.endsWith('_validation_test')).toBe(true);
    expect(profile.DB_NAME.endsWith('_validation_test')).toBe(true);
    expect(profile.DB_NAME_TEST).not.toBe('socorre_ai_tow_test');
    expect(String(profile.DB_PORT)).not.toBe('55432');
    expect(String(profile.DB_PORT)).toBe('55433');
    expect(profile.DB_HOST).toBe('127.0.0.1');
  });

  test('carries no real-looking secret', () => {
    expect(profile.JWT_SECRET.startsWith('validation-only')).toBe(true);
    expect(profile.DB_PASSWORD).toBe('tow_validation_password');
    expect(profile.GOOGLE_ROUTES_API_KEY).toBe('');
    expect(profile.GOOGLE_MAPS_API_KEY).toBe('');
  });

  test('is explicitly a non-production, opt-in profile', () => {
    expect(profile.NODE_ENV).toBe('development');
    expect(profile.APP_ENV).toBe('validation');
    expect(profile.TOW_POSTGRES_E2E).toBe('1');
    expect(profile.PORT).toBe('3000');
  });
});

describe('validation database namespace guard', () => {
  let validationEnv;
  const snapshot = {};

  beforeAll(() => {
    for (const key of MANAGED_KEYS) {
      snapshot[key] = process.env[key];
      delete process.env[key];
    }
    // Neutralize the profile file: the guard is a pure function and the test
    // must not load .env.validation into the Jest process.
    process.env.TOW_TEST_ENV_FILE = path.join(BACKEND_DIR, '.env.validation.unit-test-absent');
    process.env.TOW_TEST_PG_PROJECT = 'socorre-tow-unit-test';

    // eslint-disable-next-line global-require
    validationEnv = require('../../scripts/tow/validation-env');

    for (const key of MANAGED_KEYS) {
      delete process.env[key];
      if (snapshot[key] !== undefined) process.env[key] = snapshot[key];
    }
  });

  afterAll(() => {
    for (const key of MANAGED_KEYS) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
  });

  test('accepts the pinned validation database', () => {
    expect(validationEnv.VALIDATION_DB_SUFFIX).toBe('_validation_test');
    expect(
      validationEnv.assertValidationDatabaseName({ DB_NAME_TEST: 'socorre_tow_validation_test' })
    ).toBe('socorre_tow_validation_test');
  });

  test('accepts any database inside the validation namespace', () => {
    expect(
      validationEnv.assertValidationDatabaseName({ DB_NAME_TEST: 'another_validation_test' })
    ).toBe('another_validation_test');
  });

  test('refuses the shared test database with an actionable message', () => {
    expect(() =>
      validationEnv.assertValidationDatabaseName({ DB_NAME_TEST: 'socorre_ai_tow_test' })
    ).toThrow(/does not end with "_validation_test"/);
    try {
      validationEnv.assertValidationDatabaseName({ DB_NAME_TEST: 'socorre_ai_tow_test' });
    } catch (error) {
      expect(error.code).toBe('VALIDATION_DB_UNSAFE');
    }
  });

  test('refuses a missing database name', () => {
    expect(() => validationEnv.assertValidationDatabaseName({})).toThrow(/DB_NAME_TEST is not set/);
    try {
      validationEnv.assertValidationDatabaseName({});
    } catch (error) {
      expect(error.code).toBe('VALIDATION_DB_NOT_SET');
    }
  });

  test('refuses a target without the explicit harness opt-in', () => {
    expect(() => validationEnv.assertValidationTarget({
      DB_NAME_TEST: 'socorre_tow_validation_test',
      DB_HOST: '127.0.0.1',
      DB_PORT: '55433',
      DB_USER: 'tow_validation',
      TOW_POSTGRES_E2E: '0',
    })).toThrow(/TOW_POSTGRES_E2E/);
  });
});
