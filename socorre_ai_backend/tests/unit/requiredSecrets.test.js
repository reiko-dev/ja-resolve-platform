/**
 * Production fail-fast guard for required secrets/config (T6 §5).
 *
 * Covers `src/config/requiredSecrets.js` and the production branch of
 * `src/config/postgresConnection.js`. Development and test defaults must remain
 * exactly as they were (empty DB password, no JWT/Google requirement).
 */
'use strict';

const {
  missingProductionSecrets,
  assertProductionSecrets,
} = require('../../src/config/requiredSecrets');
const { getPostgresConnection } = require('../../src/config/postgresConnection');

const MANAGED_KEYS = [
  'NODE_ENV',
  'JWT_SECRET',
  'DB_PASSWORD',
  'PostgreSQL',
  'DATABASE_URL',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_NAME_TEST',
  'DB_USER',
  'DB_SSL',
];

function withEnv(overrides, fn) {
  const snapshot = {};
  for (const key of MANAGED_KEYS) {
    snapshot[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, overrides);
  try {
    return fn();
  } finally {
    for (const key of MANAGED_KEYS) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
  }
}

describe('required production secrets', () => {
  test('is a no-op outside production', () => {
    expect(missingProductionSecrets({ NODE_ENV: 'test' })).toEqual([]);
    expect(missingProductionSecrets({ NODE_ENV: 'development' })).toEqual([]);
    expect(missingProductionSecrets({})).toEqual([]);
    expect(() => assertProductionSecrets({ NODE_ENV: 'test' })).not.toThrow();
  });

  test('lists every missing production secret', () => {
    expect(missingProductionSecrets({ NODE_ENV: 'production' })).toEqual([
      'JWT_SECRET',
      'DB_PASSWORD',
      'GOOGLE_ROUTES_API_KEY',
    ]);
  });

  test('fails fast with an actionable message', () => {
    expect(() => assertProductionSecrets({ NODE_ENV: 'production' })).toThrow(
      /Missing required production secret\(s\): JWT_SECRET, DB_PASSWORD, GOOGLE_ROUTES_API_KEY/
    );
  });

  test('accepts a connection URL as the database credential source', () => {
    const env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'a-secret',
      DATABASE_URL: 'postgres://user:password@db:5432/app',
      GOOGLE_ROUTES_API_KEY: 'a-key',
    };
    expect(missingProductionSecrets(env)).toEqual([]);
    expect(() => assertProductionSecrets(env)).not.toThrow();

    const envWithPostgresVar = { ...env, DATABASE_URL: undefined, PostgreSQL: env.DATABASE_URL };
    expect(missingProductionSecrets(envWithPostgresVar)).toEqual([]);
  });

  test('does not throw when every required secret is present', () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: 'production',
        JWT_SECRET: 'a-secret',
        DB_PASSWORD: 'a-password',
        GOOGLE_ROUTES_API_KEY: 'a-key',
      })
    ).not.toThrow();
  });
});

describe('postgres connection production guard', () => {
  test('keeps the development/test defaults untouched', () => {
    withEnv({}, () => {
      expect(getPostgresConnection('development').password).toBe('');
      expect(getPostgresConnection('test').password).toBe('');
      expect(getPostgresConnection('development').host).toBe('localhost');
    });
  });

  test('building the production config under NODE_ENV=test does not throw', () => {
    withEnv({ NODE_ENV: 'test' }, () => {
      expect(getPostgresConnection('production').password).toBe('');
    });
  });

  test('refuses an empty DB password in production', () => {
    withEnv({ NODE_ENV: 'production' }, () => {
      expect(() => getPostgresConnection('production')).toThrow(
        /DB_PASSWORD must be set in production/
      );
    });
  });

  test('accepts an explicit DB password in production', () => {
    withEnv({ NODE_ENV: 'production', DB_PASSWORD: 'a-password' }, () => {
      expect(getPostgresConnection('production').password).toBe('a-password');
    });
  });

  test('accepts a connection URL in production without DB_PASSWORD', () => {
    withEnv(
      { NODE_ENV: 'production', DATABASE_URL: 'postgres://user:password@db:5432/app' },
      () => {
        expect(getPostgresConnection('production')).toBe('postgres://user:password@db:5432/app');
      }
    );
  });
});
