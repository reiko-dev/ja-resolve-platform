/**
 * PLATFORM SERVICE CATALOG — provisioning, public catalog and the Tow gate.
 *
 * Proves the platform-level catalog end to end:
 *   - migration 010 (immutable history) provisions the initial services as
 *     ACTIVE, is idempotent and never resets an existing Tow configuration;
 *   - migration 011 corrects the launch policy on top of 010 (tow stays
 *     ACTIVE, the other five become SOON), so the 010->011 sequence is the
 *     production baseline;
 *   - `GET /api/service-catalog` is the canonical public catalog: a SUCCESSFUL
 *     response is the authoritative complete catalog, DELETED is omitted, and
 *     an empty registry answers `items: []` (the client must not invent
 *     ACTIVE services);
 *   - the admin surface changes lifecycle per service key;
 *   - Tow consumes `service_key=tow`: new requests are blocked unless ACTIVE
 *     (graceful drain preserved) and the released `/tow/*` projections keep
 *     answering from the same authority.
 *
 * The SQLite harness mirrors the schema (no migrations at reset), so the
 * migration 010 `up()` is exercised directly against the harness database.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../src/config/database', () => require('../helpers/testDb').db);

const request = require('supertest');
const testDb = require('../helpers/testDb');
const { createApp } = require('../../src/app');
const { createFakeClock } = require('../helpers/tow/clock');
const { createFakeRouteProvider } = require('../helpers/tow/gateways/mapsGateway');
const {
  DEFAULT_INSTANT,
  IDEMPOTENCY_KEY,
  createTowRequestInput,
} = require('../helpers/tow/mvp03');
const { createTowCustomerAuth, createTowAdminAuth } = require('../helpers/tow/auth');
const {
  INITIAL_SERVICES,
  INITIAL_SERVICE_KEYS,
} = require('../../src/modules/service-catalog/domain/initial-services');
const migration010 = require('../../database/migrations/010_platform_service_catalog');
const migration011 = require('../../database/migrations/011_service_catalog_launch_policy');

const CATALOG = '/api/service-catalog';
const ADMIN_CATALOG = '/api/admin/service-catalog';
const TOW_CATALOG = '/api/tow/services';
const TOW_MODULE_STATUS = '/api/tow/module-status';
const TOW_REQUESTS = '/api/tow/requests';

describe('PLATFORM SERVICE CATALOG — provisioning, public catalog and the Tow gate', () => {
  let app;
  let clock;
  let routeProvider;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock(DEFAULT_INSTANT);
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
  });

  afterAll(async () => {
    await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
    await testDb.reset();
  });

  function provision() {
    return migration010.up(testDb.db);
  }

  /** The production baseline: migration 010 plus its 011 launch correction. */
  async function provisionLaunchPolicy() {
    await migration010.up(testDb.db);
    await migration011.up(testDb.db);
  }

  function registryRows() {
    return testDb.db('service_modules').select('*').orderBy('sort_order', 'asc');
  }

  describe('migration 010 — provisioning', () => {
    beforeEach(async () => {
      await testDb.db('service_modules').del();
    });

    test('provisions every initial service with its stable key, name and order', async () => {
      await provision();

      const rows = await registryRows();
      expect(rows.map((row) => row.module_key)).toEqual(INITIAL_SERVICE_KEYS);
      expect(rows.map((row) => row.name)).toEqual(INITIAL_SERVICES.map((service) => service.name));
      expect(rows.map((row) => row.sort_order)).toEqual(INITIAL_SERVICES.map((service) => service.sortOrder));
      expect(rows.every((row) => row.status === 'ACTIVE')).toBe(true);
    });

    test('is idempotent: running it twice keeps exactly one row per service', async () => {
      await provision();
      await provision();
      expect(await registryRows()).toHaveLength(INITIAL_SERVICES.length);
    });

    test('preserves an existing Tow configuration (never resets status or name)', async () => {
      await testDb.db('service_modules').insert({
        module_key: 'tow',
        service_key: 'tow',
        partner_type: 'tow',
        name: 'Reboque Premium',
        status: 'INACTIVE',
        sort_order: 7,
        enabled: false,
        disabled_reason: 'maintenance window',
      });

      await provision();

      const tow = await testDb.db('service_modules').where({ module_key: 'tow' }).first();
      expect(tow).toMatchObject({
        name: 'Reboque Premium',
        status: 'INACTIVE',
        sort_order: 7,
        disabled_reason: 'maintenance window',
      });
    });

    test('down removes only the catalog-only services and keeps tow', async () => {
      await provision();
      await migration010.down(testDb.db);

      const keys = (await registryRows()).map((row) => row.module_key);
      expect(keys).toEqual(['tow']);
    });
  });

  describe('public catalog — GET /api/service-catalog', () => {
    beforeEach(async () => {
      await testDb.db('tow_requests').del();
      await testDb.db('service_modules').del();
      await provisionLaunchPolicy();
      routeProvider.reset();
      clock.reset();
    });

    test('returns every initial service with its launch status in catalog order with its key', async () => {
      const response = await request(app).get(CATALOG);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          items: INITIAL_SERVICES.map((service) => ({
            id: expect.any(String),
            key: service.key,
            name: service.name,
            status: service.initialStatus,
            disabled_reason: null,
            sort_order: service.sortOrder,
          })),
        },
      });
      // Only tow is launched; the other five are SOON (product-not-launched).
      expect(response.body.data.items.filter((item) => item.status === 'ACTIVE').map((item) => item.key))
        .toEqual(['tow']);
    });

    test('INACTIVE and SOON stay visible with their reason', async () => {
      const admin = await createTowAdminAuth();

      await request(app).patch(`${ADMIN_CATALOG}/mechanic`).set(admin.headers)
        .send({ status: 'INACTIVE', reason: 'maintenance window' });
      // `store` is SOON at boot: releasing it to ACTIVE and suspending it back
      // to SOON must carry the suspension reason onto the row.
      await request(app).patch(`${ADMIN_CATALOG}/store`).set(admin.headers)
        .send({ status: 'ACTIVE', reason: 'released' });
      await request(app).patch(`${ADMIN_CATALOG}/store`).set(admin.headers)
        .send({ status: 'SOON', reason: 'launching next month' });

      const items = (await request(app).get(CATALOG)).body.data.items;
      expect(items.find((item) => item.key === 'mechanic'))
        .toMatchObject({ status: 'INACTIVE', disabled_reason: 'maintenance window' });
      expect(items.find((item) => item.key === 'store'))
        .toMatchObject({ status: 'SOON', disabled_reason: 'launching next month' });
    });

    test('a service with a successful catalog response and tow omitted is authoritative (DELETED never reappears)', async () => {
      const admin = await createTowAdminAuth();
      await request(app).patch(`${ADMIN_CATALOG}/tow`).set(admin.headers)
        .send({ status: 'DELETED', reason: 'service retired' });

      const response = await request(app).get(CATALOG);
      expect(response.status).toBe(200);
      expect(response.body.data.items.map((item) => item.key)).not.toContain('tow');
      expect(response.body.data.items).toHaveLength(INITIAL_SERVICES.length - 1);
    });

    test('an empty registry does not invent services (successful response = complete catalog)', async () => {
      await testDb.db('service_modules').del();

      const response = await request(app).get(CATALOG);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toEqual([]);
    });

    test('is public (no token required)', async () => {
      expect((await request(app).get(CATALOG)).status).toBe(200);
    });
  });

  describe('admin lifecycle — PATCH /api/admin/service-catalog/{key}', () => {
    beforeEach(async () => {
      await testDb.db('service_modules').del();
      await provisionLaunchPolicy();
    });

    test('requires an administrator', async () => {
      expect((await request(app).get(ADMIN_CATALOG)).status).toBe(401);

      const customer = await createTowCustomerAuth();
      expect((await request(app).get(ADMIN_CATALOG).set(customer.headers)).status).toBe(403);
    });

    test('lists every status, DELETED included', async () => {
      const admin = await createTowAdminAuth();
      await request(app).patch(`${ADMIN_CATALOG}/gas_station`).set(admin.headers)
        .send({ status: 'DELETED', reason: 'not launched' });

      const items = (await request(app).get(ADMIN_CATALOG).set(admin.headers)).body.data.items;
      expect(items).toHaveLength(INITIAL_SERVICES.length);
      expect(items.find((item) => item.key === 'gas_station'))
        .toMatchObject({ status: 'DELETED', enabled: false, disabled_reason: 'not launched' });
    });

    test('gets one service by key', async () => {
      const admin = await createTowAdminAuth();
      const response = await request(app).get(`${ADMIN_CATALOG}/tire_repair`).set(admin.headers);
      expect(response.body.data).toMatchObject({ key: 'tire_repair', name: 'Borracheiro', status: 'SOON' });
    });

    test('the SOON -> ACTIVE release path is an explicit admin decision', async () => {
      const admin = await createTowAdminAuth();

      // `mechanic` boots as SOON (product not launched).
      const before = await request(app).get(`${ADMIN_CATALOG}/mechanic`).set(admin.headers);
      expect(before.body.data).toMatchObject({ status: 'SOON', enabled: false });

      const released = await request(app).patch(`${ADMIN_CATALOG}/mechanic`).set(admin.headers)
        .send({ status: 'ACTIVE' });
      expect(released.status).toBe(200);
      expect(released.body.data).toMatchObject({ status: 'ACTIVE', enabled: true, disabled_reason: null });
    });

    test('unknown key answers 404', async () => {
      const admin = await createTowAdminAuth();
      const response = await request(app).patch(`${ADMIN_CATALOG}/unknown_service`).set(admin.headers)
        .send({ status: 'INACTIVE', reason: 'typo' });
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('not_found');
    });

    test('an unknown status is refused with 422 and a reason is mandatory away from ACTIVE', async () => {
      const admin = await createTowAdminAuth();

      const broken = await request(app).patch(`${ADMIN_CATALOG}/mechanic`).set(admin.headers)
        .send({ status: 'BROKEN', reason: 'typo' });
      expect(broken.status).toBe(422);
      expect(broken.body.error.code).toBe('validation_error');

      const noReason = await request(app).patch(`${ADMIN_CATALOG}/mechanic`).set(admin.headers)
        .send({ status: 'INACTIVE' });
      expect(noReason.status).toBe(422);
      expect(noReason.body.error.details).toMatchObject({ field: 'reason' });
    });

    test('the released { enabled, reason } toggle still maps to ACTIVE/INACTIVE', async () => {
      const admin = await createTowAdminAuth();

      // `tow` is the launched service (ACTIVE at boot).
      const disabled = await request(app).patch(`${ADMIN_CATALOG}/tow`).set(admin.headers)
        .send({ enabled: false, reason: 'maintenance window' });
      expect(disabled.body.data).toMatchObject({ status: 'INACTIVE', enabled: false });

      const enabled = await request(app).patch(`${ADMIN_CATALOG}/tow`).set(admin.headers)
        .send({ enabled: true, reason: 'back online' });
      expect(enabled.body.data).toMatchObject({ status: 'ACTIVE', enabled: true, disabled_reason: null });
    });

    test('a repeated status is a read (idempotent)', async () => {
      const admin = await createTowAdminAuth();
      await request(app).patch(`${ADMIN_CATALOG}/electrical`).set(admin.headers)
        .send({ status: 'INACTIVE', reason: 'maintenance window' });
      const repeated = await request(app).patch(`${ADMIN_CATALOG}/electrical`).set(admin.headers)
        .send({ status: 'INACTIVE', reason: 'ignored while already INACTIVE' });
      expect(repeated.status).toBe(200);
      expect(repeated.body.data).toMatchObject({ status: 'INACTIVE', disabled_reason: 'maintenance window' });
    });

    test('the Tow lifecycle is the SAME authority as /tow/module-status and /tow/services', async () => {
      const admin = await createTowAdminAuth();
      await request(app).patch(`${ADMIN_CATALOG}/tow`).set(admin.headers)
        .send({ status: 'SOON', reason: 'launching next month' });

      const moduleStatus = await request(app).get(TOW_MODULE_STATUS);
      expect(moduleStatus.body.data).toMatchObject({ status: 'SOON', enabled: false, disabled_reason: 'launching next month' });

      // The compatibility projection answers from the SAME catalog rows (the
      // whole platform catalog) and exposes the stable `key` additively.
      const towCatalog = await request(app).get(TOW_CATALOG);
      expect(towCatalog.body.data.items).toHaveLength(INITIAL_SERVICES.length);
      expect(towCatalog.body.data.items.find((item) => item.key === 'tow')).toEqual({
        id: expect.any(String),
        key: 'tow',
        name: 'Guincho',
        status: 'SOON',
        disabled_reason: 'launching next month',
        sort_order: 40,
      });
    });
  });

  describe('Tow gate — graceful drain', () => {
    beforeEach(async () => {
      await testDb.db('tow_requests').del();
      await testDb.db('service_modules').del();
      await provisionLaunchPolicy();
      routeProvider.reset();
      clock.reset();
    });

    function createRequest(customer, key = IDEMPOTENCY_KEY) {
      return request(app)
        .post(TOW_REQUESTS)
        .set('Idempotency-Key', key)
        .set(customer.headers)
        .send(createTowRequestInput());
    }

    test('ACTIVE allows a new request', async () => {
      const customer = await createTowCustomerAuth();
      const response = await createRequest(customer);
      expect(response.status).toBe(201);
      expect(response.body.data.state).toBe('SEARCHING');
    });

    test.each([
      ['INACTIVE', 'service temporarily unavailable'],
      ['SOON', 'service not launched yet'],
      ['DELETED', 'service retired'],
    ])('%s blocks a NEW request with service_module_disabled + details.status', async (status, reason) => {
      const admin = await createTowAdminAuth();
      await request(app).patch(`${ADMIN_CATALOG}/tow`).set(admin.headers).send({ status, reason });

      const customer = await createTowCustomerAuth();
      const response = await createRequest(customer);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('service_module_disabled');
      expect(response.body.error.details).toMatchObject({ module_key: 'tow', status });
      expect(await testDb.db('tow_requests').select('*')).toHaveLength(0);
    });

    test('a request created while ACTIVE keeps draining after the service is DELETED', async () => {
      const customer = await createTowCustomerAuth();
      const created = await createRequest(customer);
      expect(created.status).toBe(201);
      const requestId = created.body.data.id;

      const admin = await createTowAdminAuth();
      await request(app).patch(`${ADMIN_CATALOG}/tow`).set(admin.headers)
        .send({ status: 'DELETED', reason: 'service retired' });

      const read = await request(app).get(`${TOW_REQUESTS}/${requestId}`).set(customer.headers);
      expect(read.status).toBe(200);
      expect(read.body.data.state).toBe('SEARCHING');

      const cancelled = await request(app)
        .post(`${TOW_REQUESTS}/${requestId}/cancel`)
        .set('Idempotency-Key', 'idem-platform-catalog-drain-01')
        .set(customer.headers)
        .send({ reason: 'Cancelado no teste do catálogo platform-level' });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.request.state).toBe('CANCELLED');
    });
  });
});
