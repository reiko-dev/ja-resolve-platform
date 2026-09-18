/**
 * T00 — PostgreSQL foundation mechanism, proven WITHOUT Docker.
 *
 * The opt-in gate (`towPostgresFoundation.e2e.test.js`) needs a container.
 * This suite proves the offline half: the fail-closed guard, the disposable
 * compose definition and the helper contract. It never connects to a database.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const guard = require('../../../scripts/tow/pg-guard');
const postgres = require('../../helpers/tow/postgres');

const BACKEND_DIR = path.resolve(__dirname, '..', '..', '..');
const COMPOSE_PATH = path.join(BACKEND_DIR, 'docker-compose.test.yml');
const ENV_EXAMPLE_PATH = path.join(BACKEND_DIR, '.env.test.example');

const SAFE_ENV = {
  TOW_POSTGRES_E2E: '1',
  DB_HOST: '127.0.0.1',
  DB_PORT: '55432',
  DB_NAME_TEST: 'socorre_ai_tow_test',
  DB_USER: 'tow_test',
  DB_PASSWORD: 'tow_test_password',
};

describe('T00 PostgreSQL test foundation (offline mechanism)', () => {
  describe('safety guard fails closed', () => {
    test('accepts only the explicit loopback disposable target', () => {
      const result = guard.checkTestEnvironment(SAFE_ENV);
      expect(result.safe).toBe(true);
      expect(result.violations).toEqual([]);
      expect(guard.assertSafeTestEnvironment(SAFE_ENV).database).toBe('socorre_ai_tow_test');
    });

    test('rejects a non-loopback host (production shape)', () => {
      const result = guard.checkTestEnvironment({ ...SAFE_ENV, DB_HOST: '10.0.0.7' });
      expect(result.safe).toBe(false);
      expect(result.violations.join(' ')).toMatch(/loopback/);
      expect(() => guard.assertSafeTestEnvironment({ ...SAFE_ENV, DB_HOST: '10.0.0.7' }))
        .toThrow(/non-test PostgreSQL target/);
    });

    test('rejects wildcard bind hosts (0.0.0.0 / :: / *)', () => {
      for (const host of ['0.0.0.0', '::', '[::]', '*']) {
        const result = guard.checkTestEnvironment({ ...SAFE_ENV, DB_HOST: host });
        expect(result.safe).toBe(false);
        expect(result.violations.join(' ')).toMatch(/wildcard bind/);
        expect(() => guard.assertSafeTestEnvironment({ ...SAFE_ENV, DB_HOST: host }))
          .toThrow(/non-test PostgreSQL target/);
      }
      // `0.0.0.0` must not be treated as loopback by the exported allowlist.
      expect(guard.LOOPBACK_HOSTS).not.toContain('0.0.0.0');
    });

    test('rejects a privileged user by case-insensitive substring, not exact match', () => {
      for (const user of ['postgres_user', 'prod_admin', 'root2', 'POSTGRES', 'PrOd_ReadOnly']) {
        const result = guard.checkTestEnvironment({ ...SAFE_ENV, DB_USER: user });
        expect(result.safe).toBe(false);
        expect(result.violations.join(' ')).toMatch(/privileged production user/);
        expect(() => guard.assertSafeTestEnvironment({ ...SAFE_ENV, DB_USER: user }))
          .toThrow(/non-test PostgreSQL target/);
      }
      // A legitimate disposable user still passes.
      expect(guard.checkTestEnvironment({ ...SAFE_ENV, DB_USER: 'tow_test' }).safe).toBe(true);
    });

    test('rejects a database name without the _test suffix', () => {
      const result = guard.checkTestEnvironment({ ...SAFE_ENV, DB_NAME_TEST: 'socorre_ai_db' });
      expect(result.safe).toBe(false);
      expect(result.violations.join(' ')).toMatch(/_test/);
    });

    test('rejects DATABASE_URL/PostgreSQL (may point at production)', () => {
      const withUrl = guard.checkTestEnvironment({
        ...SAFE_ENV,
        DATABASE_URL: 'postgres://prod:prod@db.internal:5432/socorre_ai_db',
      });
      expect(withUrl.safe).toBe(false);
      expect(withUrl.violations.join(' ')).toMatch(/DATABASE_URL/);

      const withEasyPanelVar = guard.checkTestEnvironment({
        ...SAFE_ENV,
        PostgreSQL: 'postgres://prod:prod@db.internal:5432/socorre_ai_db',
      });
      expect(withEasyPanelVar.safe).toBe(false);
    });

    test('rejects the absence of the explicit opt-in', () => {
      const { TOW_POSTGRES_E2E, ...noOptIn } = SAFE_ENV;
      const result = guard.checkTestEnvironment(noOptIn);
      expect(result.safe).toBe(false);
      expect(result.violations.join(' ')).toMatch(/opt-in/);
      expect(postgres.isEnabled(noOptIn)).toBe(false);
      expect(postgres.isEnabled(SAFE_ENV)).toBe(true);
    });

    test('never prints the password when describing the target', () => {
      const description = guard.describeTarget(guard.resolveTestTarget(SAFE_ENV));
      expect(description).toBe('postgresql://tow_test@127.0.0.1:55432/socorre_ai_tow_test');
      expect(description).not.toContain('tow_test_password');
    });
  });

  describe('disposable environment definition', () => {
    test('docker-compose.test.yml is ephemeral, isolated and health-checked', () => {
      const compose = fs.readFileSync(COMPOSE_PATH, 'utf8');
      expect(compose).toMatch(/image:\s*postgres:14/);
      expect(compose).toMatch(/healthcheck:/);
      expect(compose).toMatch(/pg_isready/);
      // Disposable: tmpfs only, no named volume mounted anywhere.
      expect(compose).toMatch(/tmpfs:/);
      expect(compose).not.toMatch(/^\s*volumes:\s*$/m);
      // Isolated network.
      expect(compose).toMatch(/networks:/);
      expect(compose).toMatch(/tow-test-net/);
      // Throwaway credentials, clearly not production.
      expect(compose).toMatch(/POSTGRES_USER:\s*tow_test/);
      expect(compose).toMatch(/POSTGRES_DB:\s*socorre_ai_tow_test/);
    });

    test('.env.test.example ships placeholders only and no real secrets', () => {
      const example = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');
      expect(example).toMatch(/DB_NAME_TEST=socorre_ai_tow_test/);
      expect(example).toMatch(/TOW_POSTGRES_E2E=1/);
      expect(example).toMatch(/DB_HOST=127\.0\.0\.1/);
      // Provider keys must stay empty so no real call can happen by accident.
      for (const key of [
        'GOOGLE_MAPS_API_KEY', 'GOOGLE_ROUTES_API_KEY', 'STRIPE_SECRET_KEY',
        'MERCADOPAGO_ACCESS_TOKEN', 'PAGSEGURO_TOKEN',
      ]) {
        expect(example).toMatch(new RegExp(`^${key}=\\s*$`, 'm'));
      }
      // No private-key blocks / long credential-looking values.
      expect(example).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
      expect(example).not.toMatch(/sk_live_/);
      expect(example).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/);
    });

    test('package.json exposes the canonical Tow commands', () => {
      const pkg = require('../../../package.json');
      expect(pkg.scripts['test:tow']).toBe('jest tests/tow --runInBand');
      expect(pkg.scripts['test:contract']).toBe('jest tests/contract --runInBand');
      expect(pkg.scripts['verify:tow']).toBe('node scripts/tow/verify.js');
      expect(pkg.scripts['test:pg']).toBe('node scripts/tow/run-pg-gate.js');
      expect(pkg.scripts['test:pg:down']).toContain('test-env.js down');
    });
  });

  describe('helper contract', () => {
    test('exposes the harness surface without connecting', () => {
      for (const name of [
        'isEnabled', 'safeTarget', 'targetDescription', 'createConnection',
        'resetSchema', 'migrateFromScratch', 'listTables', 'truncateAll',
        'withRollback', 'countRows',
      ]) {
        expect(typeof postgres[name]).toBe('function');
      }
      expect(postgres.MIGRATIONS_DIR.endsWith(path.join('database', 'migrations'))).toBe(true);
    });

    test('destructive helpers refuse an unsafe environment before touching the DB', async () => {
      const original = { ...process.env };
      try {
        delete process.env.TOW_POSTGRES_E2E;
        process.env.DB_HOST = 'db.production.internal';
        process.env.DB_NAME_TEST = 'socorre_ai_db';
        await expect(postgres.truncateAll({ raw: () => { throw new Error('must not run'); } }))
          .rejects.toThrow(/non-test PostgreSQL target/);
        await expect(postgres.resetSchema({ raw: () => { throw new Error('must not run'); } }))
          .rejects.toThrow(/non-test PostgreSQL target/);
      } finally {
        process.env = original;
      }
    });
  });
});
