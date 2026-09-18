/**
 * T00 — PostgreSQL test foundation gate (OPT-IN).
 *
 * Enabled only with `TOW_POSTGRES_E2E=1` against the disposable container from
 * `docker-compose.test.yml`. Skipped by default so the standard suite needs no
 * Docker (docs/tow/TOW-DOCKER-TEST-STRATEGY.md §3).
 *
 * Proves the FOUNDATION only:
 *   1. the container is reachable and reports PostgreSQL 14;
 *   2. all migrations apply from a truly empty schema;
 *   3. the safety guard fails closed for non-test targets;
 *   4. per-test isolation works (truncate + rollback leave no leakage);
 *   5. Docker Compose publishes exactly the port the guard/Knex/app use;
 *   6. the Express app answers `GET /health` (a real `SELECT 1`) from the SAME
 *      PostgreSQL singleton the app uses.
 *
 * No T01+ business behavior is exercised here.
 */
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const request = require('supertest');
const YAML = require('yaml');

const postgres = require('../../helpers/tow/postgres');

const enabled = postgres.isEnabled();
const describePostgres = enabled ? describe : describe.skip;

const BACKEND_DIR = path.resolve(__dirname, '..', '..', '..');
const COMPOSE_FILE = path.join(BACKEND_DIR, 'docker-compose.test.yml');

describePostgres('T00 PostgreSQL test foundation', () => {
  let db;
  let appDb;

  beforeAll(async () => {
    db = postgres.createConnection();
    await db.raw('SELECT 1');
  });

  afterAll(async () => {
    if (appDb) await appDb.destroy();
    if (db) await db.destroy();
  });

  test('the disposable container reports PostgreSQL 14', async () => {
    const result = await db.raw('SHOW server_version');
    expect(result.rows[0].server_version).toMatch(/^14\./);
    const client = await db.raw('SELECT current_database() AS db, current_user AS usr');
    expect(client.rows[0].db).toBe(postgres.safeTarget().database);
    expect(client.rows[0].usr).toBe(postgres.safeTarget().user);
  });

  test('migrations apply from a truly empty schema', async () => {
    // Prove the "from zero" property inside the gate itself: drop the schema
    // created by the prepare stage and assert it is really empty first.
    await postgres.resetSchema(db);
    const before = await postgres.listTables(db);
    expect(before.length).toBe(0);

    const { applied } = await postgres.migrateFromScratch(db);
    expect(Array.isArray(applied)).toBe(true);
    expect(applied.length).toBeGreaterThan(0);

    const tables = await postgres.listTables(db);
    expect(tables).toEqual(expect.arrayContaining([
      'users', 'partners', 'emergency_requests', 'tow_proposals', 'system_settings',
    ]));
    expect(tables.length).toBeGreaterThanOrEqual(applied.length > 0 ? 20 : 0);
  });

  test('the Tow safety guard fails closed for non-test targets', () => {
    const unsafe = postgres.checkTestEnvironment({
      TOW_POSTGRES_E2E: '1',
      DB_HOST: 'db.production.example.com',
      DB_NAME_TEST: 'socorre_ai_db',
      DB_USER: 'postgres',
    });
    expect(unsafe.safe).toBe(false);
    expect(unsafe.violations.join(' ')).toMatch(/loopback/);
    expect(unsafe.violations.join(' ')).toMatch(/must end with "_test"/);

    const notOptedIn = postgres.checkTestEnvironment({
      DB_HOST: '127.0.0.1',
      DB_NAME_TEST: 'socorre_ai_tow_test',
      DB_USER: 'tow_test',
    });
    expect(notOptedIn.safe).toBe(false);
    expect(notOptedIn.violations.join(' ')).toMatch(/opt-in/);

    const safe = postgres.checkTestEnvironment({
      TOW_POSTGRES_E2E: '1',
      DB_HOST: '127.0.0.1',
      DB_NAME_TEST: 'socorre_ai_tow_test',
      DB_USER: 'tow_test',
    });
    expect(safe.safe).toBe(true);
    expect(postgres.targetDescription({
      TOW_POSTGRES_E2E: '1',
      DB_HOST: '127.0.0.1',
      DB_PORT: '55432',
      DB_NAME_TEST: 'socorre_ai_tow_test',
      DB_USER: 'tow_test',
      DB_PASSWORD: 'super-secret',
    })).not.toContain('super-secret');
  });

  test('per-test isolation: truncate clears data and rollback leaves no leakage', async () => {
    await postgres.truncateAll(db);
    expect(await postgres.countRows(db, 'users')).toBe(0);

    const [user] = await db('users').insert({
      name: 'Isolation Probe',
      email: 'isolation-probe@example.test',
      password: 'hash',
      phone: '11990000009',
      role: 'user',
      is_active: true,
    }).returning('*');
    expect(await postgres.countRows(db, 'users')).toBe(1);

    await postgres.withRollback(db, async (trx) => {
      await trx('users').insert({
        name: 'Rolled Back',
        email: 'rolled-back@example.test',
        password: 'hash',
        phone: '11990000010',
        role: 'user',
        is_active: true,
      });
      expect(await postgres.countRows(trx, 'users')).toBe(2);
    });
    // The rollback removed the inner row but kept the committed one.
    expect(await postgres.countRows(db, 'users')).toBe(1);

    await postgres.truncateAll(db);
    expect(await postgres.countRows(db, 'users')).toBe(0);
    expect(user.id).toBeDefined();
  });

  test('docker compose publishes exactly the DB_PORT the guard and the client use', () => {
    const target = postgres.safeTarget();
    const rendered = execFileSync(
      'docker',
      ['compose', '-p', 'socorre-tow-test', '-f', COMPOSE_FILE, 'config'],
      { cwd: BACKEND_DIR, encoding: 'utf8', env: { ...process.env } }
    );
    const service = YAML.parse(rendered).services['tow-postgres-test'];
    // Compose interpolation resolves ${DB_PORT:-55432} to the canonical target
    // port; a second port variable would make this assertion fail.
    expect(String(service.ports[0].published)).toBe(String(target.port));
    expect(String(service.ports[0].target)).toBe('5432');
    // `docker compose config` exposes the publish bind address: the disposable
    // database must be reachable on IPv4 loopback only (Muse M4-1 / Codex
    // thread 4048163637), never on 0.0.0.0.
    expect(String(service.ports[0].host_ip)).toBe('127.0.0.1');
    // The container credentials are the same ones the guard/Knex use.
    expect(service.environment.POSTGRES_DB).toBe(target.database);
    expect(service.environment.POSTGRES_USER).toBe(target.user);
    expect(service.environment.POSTGRES_PASSWORD).toBe(target.password);
  });

  test('the Express app answers GET /health from the same PostgreSQL singleton', async () => {
    // `src/app.js` uses `src/config/database.js`; requiring the same module
    // path here returns that exact singleton (same Jest module cache entry).
    const { createApp } = require('../../../src/app');
    appDb = require('../../../src/config/database');

    const target = postgres.safeTarget();

    // 1. The singleton's configuration points at the disposable target: a 200
    //    from some other local PostgreSQL must not be able to pass this test.
    const connection = appDb.client.config.connection;
    expect(connection.host).toBe(target.host);
    expect(Number(connection.port)).toBe(target.port);
    expect(connection.database).toBe(target.database);
    expect(connection.user).toBe(target.user);

    // 2. The server itself reports the expected database/user identity.
    const identity = await appDb.raw('SELECT current_database() AS db, current_user AS usr');
    expect(identity.rows[0].db).toBe(target.database);
    expect(identity.rows[0].usr).toBe(target.user);

    // 3. Only a real `SELECT 1` through the app's pool can produce this 200.
    const app = createApp();
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.status).toBe('ok');
    expect(response.body.checks).toEqual({ http: 'ok', postgres: 'ok' });
  });
});

if (!enabled) {
  describe('T00 PostgreSQL test foundation (skipped)', () => {
    test('enable with TOW_POSTGRES_E2E=1 and docker-compose.test.yml', () => {
      expect(postgres.isEnabled()).toBe(false);
      expect(postgres.targetDescription()).toContain('socorre_ai_tow_test');
    });
  });
}
