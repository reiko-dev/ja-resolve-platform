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
      // Throwaway credentials, parametrized with the SAME canonical variables
      // the guard and the Knex helper read (Codex finding C2).
      expect(compose).toMatch(/POSTGRES_USER:\s*\$\{DB_USER:-tow_test\}/);
      expect(compose).toMatch(/POSTGRES_PASSWORD:\s*\$\{DB_PASSWORD:-tow_test_password\}/);
      expect(compose).toMatch(/POSTGRES_DB:\s*\$\{DB_NAME_TEST:-socorre_ai_tow_test\}/);
      // Single source of truth for the host port: DB_PORT, never a harness-only
      // duplicate that can drift from the client configuration. The mapping is
      // bound to IPv4 loopback so the weak throwaway credentials are never
      // published on another interface (Muse M4-1 / Codex thread 4048163637).
      expect(compose).toMatch(/'127\.0\.0\.1:\$\{DB_PORT:-55432\}:5432'/);
      // A bare mapping (quote directly before ${DB_PORT...}, i.e. every
      // interface) is rejected.
      expect(compose).not.toMatch(/'(\$\{DB_PORT:-55432\}:5432)'/);
      expect(compose).not.toMatch(/TOW_TEST_PG_PORT/);
    });

    test('the published port is bound to IPv4 loopback (M4-1 negative control)', () => {
      const compose = fs.readFileSync(COMPOSE_PATH, 'utf8');
      // The same predicate decides both the real file and the pre-fix shape:
      // the publish mapping must exist, end in :5432 and start with 127.0.0.1.
      const isLoopbackBound = (source) => {
        const mappings = [...source.matchAll(/^\s*-\s*'([^']+)'\s*$/gm)].map((match) => match[1]);
        const published = mappings.find((mapping) => mapping.endsWith(':5432'));
        return Boolean(published) && /^127\.0\.0\.1:/.test(published);
      };

      expect(isLoopbackBound(compose)).toBe(true);

      // Negative control: the pre-fix bare mapping (every interface) must fail
      // the very predicate the real file passes.
      const preFix = compose.replace("'127.0.0.1:${DB_PORT:-55432}:5432'", "'${DB_PORT:-55432}:5432'");
      expect(preFix).toContain("'${DB_PORT:-55432}:5432'");
      expect(isLoopbackBound(preFix)).toBe(false);
    });

    test('compose defaults, healthcheck and guard defaults cannot drift apart', () => {
      const compose = fs.readFileSync(COMPOSE_PATH, 'utf8');
      const defaults = guard.resolveTestTarget({ TOW_POSTGRES_E2E: '1' });
      expect(compose).toContain(`\${DB_PORT:-${defaults.port}}`);
      expect(compose).toContain(`\${DB_USER:-${defaults.user}}`);
      expect(compose).toContain(`\${DB_PASSWORD:-${defaults.password}}`);
      expect(compose).toContain(`\${DB_NAME_TEST:-${defaults.database}}`);
      // The healthcheck probes the same database the client will use.
      expect(compose).toContain(`pg_isready -U \${DB_USER:-${defaults.user}} -d \${DB_NAME_TEST:-${defaults.database}}`);
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

  describe('single source of truth for the PostgreSQL target (Codex finding C2)', () => {
    test('the resolved target carries the password used by the client', () => {
      const target = guard.resolveTestTarget(SAFE_ENV);
      expect(target.password).toBe('tow_test_password');
      expect(guard.resolveTestTarget({ ...SAFE_ENV, DB_PASSWORD: 'other_test_pw' }).password)
        .toBe('other_test_pw');
    });

    test('the harness hands the resolved DB_PORT/DB_NAME_TEST/DB_USER to compose', () => {
      const testEnv = require('../../../scripts/tow/test-env');
      const env = { ...SAFE_ENV, DB_PORT: '55999' };

      expect(guard.resolveTestTarget(env).port).toBe(55999);
      expect(testEnv.targetEnv(env)).toMatchObject({
        DB_HOST: '127.0.0.1',
        DB_PORT: '55999',
        DB_NAME_TEST: 'socorre_ai_tow_test',
        DB_USER: 'tow_test',
        DB_PASSWORD: 'tow_test_password',
      });
      // Compose interpolation of `${DB_PORT:-55432}` therefore publishes 55999.
      expect(testEnv.targetEnv(env).DB_PORT).toBe(String(guard.resolveTestTarget(env).port));
    });

    test('the Knex helper connects to exactly that host/port/database/user', async () => {
      const env = { ...SAFE_ENV, DB_PORT: '55999' };
      const db = postgres.createConnection(env);
      try {
        const connection = db.client.config.connection;
        expect(connection.host).toBe('127.0.0.1');
        expect(connection.port).toBe(55999);
        expect(connection.database).toBe('socorre_ai_tow_test');
        expect(connection.user).toBe('tow_test');
        expect(connection.port).toBe(guard.resolveTestTarget(env).port);
      } finally {
        await db.destroy();
      }
    });

    test('no harness file reintroduces a second port variable', () => {
      for (const file of [
        'docker-compose.test.yml',
        '.env.test.example',
        'scripts/tow/test-env.js',
        'scripts/tow/pg-guard.js',
        'scripts/tow/test-env-file.js',
        'tests/helpers/tow/postgres.js',
      ]) {
        const source = fs.readFileSync(path.join(BACKEND_DIR, file), 'utf8');
        expect(source).not.toMatch(/TOW_TEST_PG_PORT/);
      }
    });

    test('.env.test.example documents the real loading contract', () => {
      const example = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');
      expect(example).toMatch(/test-env-file\.js/);
      expect(example).toMatch(/TOW_TEST_ENV_FILE/);
      expect(example).toMatch(/never loaded with[\s\S]{0,60}override: true/);
      // The canonical variables are the ones compose/guard/Knex read.
      expect(example).toMatch(/^DB_PORT=55432$/m);
      expect(example).toMatch(/^DB_USER=tow_test$/m);
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
