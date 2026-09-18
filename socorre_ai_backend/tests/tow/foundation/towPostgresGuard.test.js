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
const crypto = require('crypto');
const YAML = require('yaml');

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
      // No globally fixed container/network names: Compose must derive them
      // from the per-run project (Codex round-3 P1 / thread 4048484277).
      expect(compose).not.toMatch(/^\s*container_name:/m);
      expect(compose).not.toMatch(/^\s*name:\s*\S/m);
      expect(compose).not.toMatch(/socorre-tow-postgres-test/);
      expect(compose).not.toMatch(/socorre-tow-test-net/);
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

  describe('compose project isolation (Codex round-3 P1 / thread 4048484277)', () => {
    const testEnv = require('../../../scripts/tow/test-env');
    const COMPOSE_PROJECT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;

    test('docker-compose.test.yml fixes no container_name and no network name', () => {
      const parsed = YAML.parse(fs.readFileSync(COMPOSE_PATH, 'utf8'));
      expect(parsed.services['tow-postgres-test']).toBeDefined();
      // The service key stays `tow-postgres-test`: `compose ps ... tow-postgres-test`
      // resolves the service by name.
      expect(parsed.services['tow-postgres-test'].container_name).toBeUndefined();
      expect(parsed.networks['tow-test-net']).toBeDefined();
      expect(parsed.networks['tow-test-net'].name).toBeUndefined();
      // Compose must be free to derive `<project>-tow-postgres-test-1` and
      // `<project>_tow-test-net`.
      expect(parsed.name).toBeUndefined();
    });

    test('resolveComposeProject honors TOW_TEST_PG_PROJECT and rejects invalid overrides', () => {
      expect(testEnv.resolveComposeProject({ ...SAFE_ENV, TOW_TEST_PG_PROJECT: 'my-tow-run_1' }))
        .toBe('my-tow-run_1');
      // Empty counts as unset, like every other harness variable.
      expect(testEnv.resolveComposeProject({ ...SAFE_ENV, TOW_TEST_PG_PROJECT: '   ' }))
        .toMatch(/^socorre-tow-test-55432-[0-9a-f]{8}$/);

      for (const invalid of [
        'Socorre-Tow',        // uppercase
        'has space',
        '-leading-dash',
        '.dot',
        'socorre/tow',
        'a'.repeat(64),       // longer than 63 chars
      ]) {
        expect(() => testEnv.resolveComposeProject({ ...SAFE_ENV, TOW_TEST_PG_PROJECT: invalid }))
          .toThrow(/TOW_TEST_PG_PROJECT .* is not a valid Compose project name/);
      }
    });

    test('the derived default is unique per DB_PORT and per backend directory', () => {
      const defaultPort = testEnv.resolveComposeProject({ ...SAFE_ENV, DB_PORT: '55432' });
      const customPort = testEnv.resolveComposeProject({ ...SAFE_ENV, DB_PORT: '55999' });
      expect(defaultPort).toBe('socorre-tow-test-55432-'
        + crypto.createHash('sha256').update(BACKEND_DIR).digest('hex').slice(0, 8));
      expect(customPort).toMatch(/^socorre-tow-test-55999-[0-9a-f]{8}$/);
      // Different ports -> different projects (two concurrent runs).
      expect(customPort).not.toBe(defaultPort);
      // Deterministic: same input, same project.
      expect(testEnv.resolveComposeProject({ ...SAFE_ENV, DB_PORT: '55999' })).toBe(customPort);
      // Guard default port when DB_PORT is absent.
      expect(testEnv.resolveComposeProject({ TOW_POSTGRES_E2E: '1' }))
        .toMatch(/^socorre-tow-test-55432-[0-9a-f]{8}$/);
      for (const name of [defaultPort, customPort, testEnv.COMPOSE_PROJECT]) {
        expect(name).toMatch(COMPOSE_PROJECT_PATTERN);
        expect(name.length).toBeLessThanOrEqual(63);
      }
    });

    test('the resolved project is forwarded to child processes with the target env', () => {
      const env = { ...SAFE_ENV, DB_PORT: '55999' };
      expect(testEnv.targetEnv(env).TOW_TEST_PG_PROJECT).toBe(testEnv.resolveComposeProject(env));
      expect(testEnv.targetEnv(env).TOW_TEST_PG_PROJECT).toBe(
        testEnv.resolveComposeProject({ ...SAFE_ENV, DB_PORT: '55999' })
      );
      // An explicit override wins and travels unchanged.
      const override = { ...env, TOW_TEST_PG_PROJECT: 'ci-run-42' };
      expect(testEnv.targetEnv(override).TOW_TEST_PG_PROJECT).toBe('ci-run-42');
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

  describe('SQL identifier hardening (Muse final review P2-2)', () => {
    const INJECTION = 'x"; DROP TABLE y;--';

    /**
     * Split a SQL string on the `;` that are OUTSIDE a quoted identifier, i.e.
     * count top-level statements. A `""` inside a quoted identifier is an
     * escaped quote and does not close it (PostgreSQL rule).
     */
    function splitStatements(sql) {
      const statements = [];
      let current = '';
      let inIdentifier = false;
      for (let index = 0; index < sql.length; index += 1) {
        const char = sql[index];
        if (char === '"') {
          if (inIdentifier && sql[index + 1] === '"') {
            current += '""';
            index += 1;
            continue;
          }
          inIdentifier = !inIdentifier;
          current += char;
          continue;
        }
        if (char === ';' && !inIdentifier) {
          statements.push(current.trim());
          current = '';
          continue;
        }
        current += char;
      }
      if (current.trim().length > 0) statements.push(current.trim());
      return statements.filter(Boolean);
    }

    /** Run `fn` with the canonical disposable target in `process.env`. */
    async function withSafeEnv(fn) {
      const original = { ...process.env };
      try {
        Object.assign(process.env, SAFE_ENV);
        delete process.env.DATABASE_URL;
        delete process.env.PostgreSQL;
        return await fn();
      } finally {
        process.env = original;
      }
    }

    test('quoteIdentifier turns the injection into ONE identifier, never two statements', () => {
      const quoted = postgres.quoteIdentifier(INJECTION);
      expect(quoted).toBe('"x""; DROP TABLE y;--"');
      // The `;` and the `--` are INSIDE the identifier: the whole payload is a
      // single statement, so `DROP TABLE y` can never execute.
      const sql = `TRUNCATE ${quoted} RESTART IDENTITY CASCADE`;
      expect(splitStatements(sql)).toEqual([sql]);

      // Negative control: the pre-fix shape (no quote doubling) really does
      // break the statement into separate ones, so the assertion above is
      // meaningful rather than vacuous.
      const preFix = `TRUNCATE "${INJECTION}" RESTART IDENTITY CASCADE`;
      expect(splitStatements(preFix).length).toBeGreaterThan(1);
      expect(splitStatements(preFix).join(' ')).toContain('DROP TABLE y');
    });

    test('quoteIdentifier preserves real pg_tables names and rejects non-identifiers', () => {
      for (const name of ['users', 'tow_proposals', 'system_settings', 'emergency_requests']) {
        expect(postgres.quoteIdentifier(name)).toBe(`"${name}"`);
        expect(splitStatements(`TRUNCATE ${postgres.quoteIdentifier(name)} CASCADE`)).toHaveLength(1);
      }
      // A name that already contains a double quote is doubled, not stripped.
      expect(postgres.quoteIdentifier('we"ird')).toBe('"we""ird"');
      for (const invalid of [undefined, null, '', 42, {}]) {
        expect(() => postgres.quoteIdentifier(invalid)).toThrow(TypeError);
      }
    });

    test('countRows quotes the identifier before it reaches the driver', async () => {
      const calls = [];
      const db = {
        raw: async (sql) => {
          calls.push(sql);
          return { rows: [{ count: 7 }] };
        },
      };
      await expect(postgres.countRows(db, INJECTION)).resolves.toBe(7);
      expect(calls).toEqual([`SELECT COUNT(*)::int AS count FROM "x""; DROP TABLE y;--"`]);
      expect(splitStatements(calls[0])).toHaveLength(1);
    });

    test('truncateAll quotes every table returned by pg_tables', async () => {
      await withSafeEnv(async () => {
        const calls = [];
        const db = {
          raw: async (sql) => {
            calls.push(sql);
            if (/pg_tables/.test(sql)) {
              return { rows: [{ tablename: 'users' }, { tablename: INJECTION }] };
            }
            return { rows: [] };
          },
        };
        const tables = await postgres.truncateAll(db);
        expect(tables).toEqual(['users', INJECTION]);
        const truncate = calls.find((sql) => sql.startsWith('TRUNCATE'));
        expect(truncate).toBe(`TRUNCATE "users", "x""; DROP TABLE y;--" RESTART IDENTITY CASCADE`);
        expect(splitStatements(truncate)).toHaveLength(1);
      });
    });

    test('no harness SQL string interpolates a bare identifier any more', () => {
      const source = fs.readFileSync(
        path.join(BACKEND_DIR, 'tests', 'helpers', 'tow', 'postgres.js'),
        'utf8'
      );
      // The pre-fix shapes: `"${table}"` / `"${name}"`.
      expect(source).not.toMatch(/`[^`]*"\$\{(table|name)\}"[^`]*`/);
      expect(source).toMatch(/quoteIdentifier/);
    });
  });
});
