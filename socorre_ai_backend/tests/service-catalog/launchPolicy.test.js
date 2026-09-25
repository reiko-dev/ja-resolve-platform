/**
 * PLATFORM SERVICE CATALOG — LAUNCH POLICY.
 *
 * Only `tow` is launched. The other five services belong to the product but are
 * not launched yet, so the bootstrap policy is SOON for them and ACTIVE for
 * `tow`. This suite pins that policy as the single authority:
 *
 *   - `INITIAL_SERVICES[].initialStatus` declares it (canonical constants);
 *   - `ensureInitialServices()` / `ensureService()` honor it;
 *   - persistence fails CLOSED (missing status => SOON, never ACTIVE);
 *   - migration 011 corrects the rows migration 010 (immutable) left ACTIVE,
 *     touching ONLY ACTIVE rows and never tow / INACTIVE / DELETED / SOON;
 *   - the DB default becomes SOON (PostgreSQL ALTER; SQLite DDL mirror);
 *   - `enabled` remains only the derived projection of `status`.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../src/config/database', () => require('../helpers/testDb').db);

const testDb = require('../helpers/testDb');
const { createCatalogRepository } = require('../../src/modules/service-catalog/adapters/persistence/catalog-repository');
const { createCatalogService } = require('../../src/modules/service-catalog/application/catalog-service');
const {
  INITIAL_SERVICES,
  INITIAL_SERVICE_KEYS,
} = require('../../src/modules/service-catalog/domain/initial-services');
const {
  ACTIVE_SERVICE_STATUS,
  SOON_SERVICE_STATUS,
  serviceStatusToEnabled,
} = require('../../src/modules/service-catalog/domain');
const migration010 = require('../../database/migrations/010_platform_service_catalog');
const migration011 = require('../../database/migrations/011_service_catalog_launch_policy');

const EXPECTED_POLICY = Object.freeze([
  ['mechanic', SOON_SERVICE_STATUS],
  ['tire_repair', SOON_SERVICE_STATUS],
  ['electrical', SOON_SERVICE_STATUS],
  ['tow', ACTIVE_SERVICE_STATUS],
  ['store', SOON_SERVICE_STATUS],
  ['gas_station', SOON_SERVICE_STATUS],
]);

function registryRows() {
  return testDb.db('service_modules').select('*').orderBy('sort_order', 'asc');
}

/**
 * The PG-only branch of migration 011 (`isPostgres`). A callable double is
 * enough: the test proves the exact ALTER default statements and that `down()`
 * never issues a data update.
 */
function fakePostgresKnex() {
  const calls = { raw: [], updates: [] };
  const builder = {
    whereIn(column, values) {
      calls.whereIn = [column, values];
      return builder;
    },
    where(condition) {
      calls.where = condition;
      return builder;
    },
    update(patch) {
      calls.updates.push(patch);
      return Promise.resolve(1);
    },
  };
  const knex = () => builder;
  knex.raw = async (sql) => {
    calls.raw.push(sql);
    return { rows: [] };
  };
  knex.client = { dialect: 'postgresql', config: { client: 'pg' } };
  return { knex, calls };
}

describe('PLATFORM SERVICE CATALOG — launch policy', () => {
  let catalogService;
  let catalogRepository;

  beforeAll(async () => {
    await testDb.reset();
    catalogRepository = createCatalogRepository(testDb.db);
    catalogService = createCatalogService({ catalogRepository });
  });

  afterAll(async () => {
    await testDb.reset();
  });

  describe('INITIAL_SERVICES — the single bootstrap-policy authority', () => {
    test('declares exactly the six initial services', () => {
      expect(INITIAL_SERVICES).toHaveLength(6);
      expect(INITIAL_SERVICE_KEYS).toEqual(EXPECTED_POLICY.map(([key]) => key));
    });

    test('pins each initialStatus to the product policy', () => {
      expect(INITIAL_SERVICES.map((service) => [service.key, service.initialStatus]))
        .toEqual(EXPECTED_POLICY);
    });

    test('uses the canonical domain constants (no duplicated status strings)', () => {
      for (const service of INITIAL_SERVICES) {
        expect([ACTIVE_SERVICE_STATUS, SOON_SERVICE_STATUS]).toContain(service.initialStatus);
      }
      expect(INITIAL_SERVICES.filter((service) => service.initialStatus === ACTIVE_SERVICE_STATUS)
        .map((service) => service.key)).toEqual(['tow']);
    });
  });

  describe('ensureInitialServices — provisioning an empty registry', () => {
    beforeEach(async () => {
      await testDb.db('service_modules').del();
    });

    test('provisions SOON/SOON/SOON/ACTIVE/SOON/SOON', async () => {
      const items = await catalogService.ensureInitialServices();

      expect(items.map((item) => [item.key, item.status])).toEqual(EXPECTED_POLICY);
    });

    test('writes the derived enabled projection in the same pass', async () => {
      await catalogService.ensureInitialServices();

      const rows = await registryRows();
      for (const row of rows) {
        expect(Boolean(row.enabled)).toBe(serviceStatusToEnabled(row.status));
      }
      expect(rows.filter((row) => row.enabled === 1 || row.enabled === true).map((row) => row.module_key))
        .toEqual(['tow']);
    });

    test('is idempotent and never rewrites an existing decision', async () => {
      await catalogService.ensureInitialServices();
      await testDb.db('service_modules').where({ module_key: 'mechanic' }).update({ status: 'INACTIVE' });

      await catalogService.ensureInitialServices();

      const mechanic = await testDb.db('service_modules').where({ module_key: 'mechanic' }).first();
      expect(mechanic.status).toBe('INACTIVE');
    });
  });

  describe('fail-closed persistence — a missing status is never ACTIVE', () => {
    beforeEach(async () => {
      await testDb.db('service_modules').del();
    });

    test('createDefault without a status creates SOON (documented fail-safe)', async () => {
      const created = await catalogRepository.createDefault({ key: 'mechanic', name: 'Mecânico' });
      expect(created.status).toBe(SOON_SERVICE_STATUS);
      expect(created.enabled).toBe(false);
    });

    test('insertIfMissing without a status creates SOON (documented fail-safe)', async () => {
      const created = await catalogRepository.insertIfMissing({ key: 'electrical', name: 'Elétrica' });
      expect(created.status).toBe(SOON_SERVICE_STATUS);
      expect(created.enabled).toBe(false);
    });

    test('the application boundary always passes a status: missing key fails as unknown', async () => {
      await expect(catalogService.ensureService('not_a_service'))
        .rejects.toThrow('Unknown service key "not_a_service"');
      expect(await registryRows()).toEqual([]);
    });

    test('the lazy createDefault path honors the policy: tow ACTIVE, mechanic SOON', async () => {
      const tow = await catalogService.ensureService('tow');
      expect(tow.status).toBe(ACTIVE_SERVICE_STATUS);
      expect(tow.enabled).toBe(true);

      const mechanic = await catalogService.ensureService('mechanic');
      expect(mechanic.status).toBe(SOON_SERVICE_STATUS);
      expect(mechanic.enabled).toBe(false);
    });
  });

  describe('migration 011 — launch policy correction', () => {
    beforeEach(async () => {
      await testDb.db('service_modules').del();
      await migration010.up(testDb.db);
    });

    test('migration 010 alone stays all-ACTIVE (immutable history)', async () => {
      const rows = await registryRows();
      expect(rows).toHaveLength(INITIAL_SERVICES.length);
      expect(rows.every((row) => row.status === ACTIVE_SERVICE_STATUS)).toBe(true);
    });

    test('fresh all-ACTIVE -> five SOON + tow ACTIVE, enabled kept in sync', async () => {
      await migration011.up(testDb.db);

      const rows = await registryRows();
      expect(rows.map((row) => [row.module_key, row.status])).toEqual(EXPECTED_POLICY);
      for (const row of rows) {
        expect(Boolean(row.enabled)).toBe(serviceStatusToEnabled(row.status));
      }
    });

    test('is idempotent: a second run changes nothing', async () => {
      await migration011.up(testDb.db);
      const first = await registryRows();
      await migration011.up(testDb.db);
      expect(await registryRows()).toEqual(first);
    });

    test('preserves every non-ACTIVE decision: tow INACTIVE, mechanic DELETED, electrical INACTIVE, store SOON', async () => {
      await testDb.db('service_modules').where({ module_key: 'tow' }).update({
        status: 'INACTIVE',
        enabled: false,
        disabled_reason: 'scheduled maintenance',
      });
      await testDb.db('service_modules').where({ module_key: 'mechanic' }).update({ status: 'DELETED', enabled: false });
      await testDb.db('service_modules').where({ module_key: 'electrical' }).update({ status: 'INACTIVE', enabled: false });
      await testDb.db('service_modules').where({ module_key: 'store' }).update({ status: 'SOON', enabled: false });
      await testDb.db('service_modules').where({ module_key: 'tire_repair' }).update({ status: 'SOON', enabled: false });

      await migration011.up(testDb.db);

      const rows = await registryRows();
      const byKey = Object.fromEntries(rows.map((row) => [row.module_key, row]));
      expect(byKey.tow).toMatchObject({ status: 'INACTIVE', disabled_reason: 'scheduled maintenance' });
      expect(byKey.mechanic.status).toBe('DELETED');
      expect(byKey.electrical.status).toBe('INACTIVE');
      expect(byKey.store.status).toBe('SOON');
      expect(byKey.tire_repair.status).toBe('SOON');
      // Only the still-ACTIVE unlaunched service was corrected.
      expect(byKey.gas_station.status).toBe('SOON');
      expect(byKey.tow.enabled).toBe(0);
    });

    test('the key list never includes tow', () => {
      expect(migration011.UNLAUNCHED_SERVICE_KEYS).toEqual([
        'mechanic', 'tire_repair', 'electrical', 'store', 'gas_station',
      ]);
      expect(migration011.UNLAUNCHED_SERVICE_KEYS).not.toContain('tow');
    });

    test('SQLite mirror: a row inserted without status fails closed to SOON', async () => {
      await testDb.db('service_modules').insert({
        module_key: 'future_service',
        service_key: 'future_service',
        partner_type: 'future_service',
      });
      const row = await testDb.db('service_modules').where({ module_key: 'future_service' }).first();
      expect(row.status).toBe(SOON_SERVICE_STATUS);
    });
  });

  describe('migration 011 — PostgreSQL schema default', () => {
    test('up flips the default to SOON; down restores ACTIVE without rewriting data', async () => {
      const { knex, calls } = fakePostgresKnex();

      await migration011.up(knex);
      expect(calls.raw).toEqual([
        "ALTER TABLE service_modules ALTER COLUMN status SET DEFAULT 'SOON'",
      ]);
      expect(calls.whereIn).toEqual(['module_key', migration011.UNLAUNCHED_SERVICE_KEYS]);
      expect(calls.where).toEqual({ status: 'ACTIVE' });
      expect(calls.updates).toEqual([{ status: 'SOON', enabled: false }]);

      await migration011.down(knex);
      expect(calls.raw[1]).toBe("ALTER TABLE service_modules ALTER COLUMN status SET DEFAULT 'ACTIVE'");
      // down() is schema-only: no SOON -> ACTIVE data rewrite.
      expect(calls.updates).toHaveLength(1);
    });
  });
});
