/**
 * SERVICE CATALOG — canonical lifecycle status and the public catalog.
 *
 * Proves the four product statuses end to end over the real HTTP surface:
 *   ACTIVE    appears in the public catalog and allows a new Tow request;
 *   INACTIVE  appears with its reason and blocks a new request;
 *   SOON      appears with its reason and blocks a new request;
 *   DELETED   is hidden from the public catalog and blocks a new request.
 *
 * It also proves the lifecycle governs NEW requests only: a request created
 * while ACTIVE keeps its lifecycle (read + cancel) after the service becomes
 * INACTIVE. Tow routing/pricing/tracking/payment are untouched.
 *
 * RED-first: written before the catalog status existed.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const request = require('supertest');
const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const {
  DEFAULT_INSTANT,
  IDEMPOTENCY_KEY,
  createTowRequestInput,
} = require('../../helpers/tow/mvp03');
const { createTowCustomerAuth, createTowAdminAuth } = require('../../helpers/tow/auth');

const CATALOG = '/api/tow/services';
const MODULE_STATUS = '/api/tow/module-status';
const ADMIN_MODULE = '/api/admin/tow/module';
const REQUESTS = '/api/tow/requests';

describe('SERVICE CATALOG — lifecycle status and public catalog', () => {
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

  beforeEach(async () => {
    await testDb.db('tow_requests').del();
    await testDb.db('service_modules').del();
    routeProvider.reset();
    clock.reset();
  });

  function createRequest(customer, key = IDEMPOTENCY_KEY) {
    return request(app)
      .post(REQUESTS)
      .set('Idempotency-Key', key)
      .set(customer.headers)
      .send(createTowRequestInput());
  }

  async function setStatus(admin, status, reason = 'catalog test') {
    return request(app)
      .patch(ADMIN_MODULE)
      .set(admin.headers)
      .send({ status, reason });
  }

  function catalog() {
    return request(app).get(CATALOG);
  }

  describe('public catalog', () => {
    test('a fresh registry is ACTIVE and appears in the catalog', async () => {
      const response = await catalog();

      expect(response.status).toBe(200);
      expect(response.body.data.items).toEqual([{
        id: expect.any(String),
        key: 'tow',
        name: 'Guincho',
        status: 'ACTIVE',
        disabled_reason: null,
        // The canonical catalog order for Tow (migration 010).
        sort_order: 40,
      }]);
    });

    test('INACTIVE and SOON stay visible with their reason', async () => {
      const admin = await createTowAdminAuth();

      await setStatus(admin, 'INACTIVE', 'maintenance window');
      let items = (await catalog()).body.data.items;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ status: 'INACTIVE', disabled_reason: 'maintenance window' });

      await setStatus(admin, 'SOON', 'launching next month');
      items = (await catalog()).body.data.items;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ status: 'SOON', disabled_reason: 'launching next month' });
    });

    test('DELETED is hidden from the public catalog but stays in the registry', async () => {
      const admin = await createTowAdminAuth();
      await setStatus(admin, 'DELETED', 'retired service');

      const response = await catalog();
      expect(response.status).toBe(200);
      expect(response.body.data.items).toEqual([]);

      const row = await testDb.db('service_modules').where({ module_key: 'tow' }).first();
      expect(row.status).toBe('DELETED');
    });

    test('the catalog is ordered by sort_order', async () => {
      // A second registry row models a future platform service.
      await testDb.db('service_modules').insert({
        module_key: 'mechanic',
        service_key: 'mechanic',
        partner_type: 'mechanic',
        name: 'Mecânica',
        status: 'SOON',
        sort_order: -1,
        enabled: 0,
      });

      const items = (await catalog()).body.data.items;
      expect(items.map((item) => item.name)).toEqual(['Mecânica', 'Guincho']);
    });

    test('the catalog is public (no token required)', async () => {
      const response = await request(app).get(CATALOG);
      expect(response.status).toBe(200);
    });
  });

  describe('new-request gate', () => {
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
    ])('%s blocks a new request with service_module_disabled + details.status', async (status, reason) => {
      const admin = await createTowAdminAuth();
      await setStatus(admin, status, reason);

      const customer = await createTowCustomerAuth();
      const response = await createRequest(customer);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('service_module_disabled');
      expect(response.body.error.details).toMatchObject({ module_key: 'tow', status });
      expect(await testDb.db('tow_requests').select('*')).toHaveLength(0);
    });

    test('an unknown status is refused with 422 and nothing changes', async () => {
      const admin = await createTowAdminAuth();
      const response = await request(app)
        .patch(ADMIN_MODULE)
        .set(admin.headers)
        .send({ status: 'BROKEN', reason: 'typo' });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('validation_error');
      expect((await catalog()).body.data.items[0].status).toBe('ACTIVE');
    });

    test('moving away from ACTIVE requires a reason', async () => {
      const admin = await createTowAdminAuth();
      const response = await request(app)
        .patch(ADMIN_MODULE)
        .set(admin.headers)
        .send({ status: 'INACTIVE' });

      expect(response.status).toBe(422);
      expect(response.body.error.details).toMatchObject({ field: 'reason' });
    });
  });

  describe('compatibility and lifecycle preservation', () => {
    test('the released { enabled, reason } toggle still maps to ACTIVE/INACTIVE', async () => {
      const admin = await createTowAdminAuth();

      const disabled = await request(app)
        .patch(ADMIN_MODULE)
        .set(admin.headers)
        .send({ enabled: false, reason: 'maintenance window' });
      expect(disabled.status).toBe(200);
      expect(disabled.body.data).toMatchObject({ status: 'INACTIVE', enabled: false });

      const enabled = await request(app)
        .patch(ADMIN_MODULE)
        .set(admin.headers)
        .send({ enabled: true, reason: 'back online' });
      expect(enabled.status).toBe(200);
      expect(enabled.body.data).toMatchObject({ status: 'ACTIVE', enabled: true, disabled_reason: null });
    });

    test('module-status publishes the canonical status and the derived enabled', async () => {
      const admin = await createTowAdminAuth();
      await setStatus(admin, 'SOON', 'launching');

      const response = await request(app).get(MODULE_STATUS);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ status: 'SOON', enabled: false, disabled_reason: 'launching' });
    });

    test('a request created while ACTIVE keeps its lifecycle after the service becomes INACTIVE', async () => {
      const customer = await createTowCustomerAuth();
      const created = await createRequest(customer);
      expect(created.status).toBe(201);
      const requestId = created.body.data.id;

      const admin = await createTowAdminAuth();
      expect((await setStatus(admin, 'INACTIVE', 'maintenance window')).status).toBe(200);

      // Recovery read still works (DRAIN), and the owner can still cancel.
      const read = await request(app).get(`${REQUESTS}/${requestId}`).set(customer.headers);
      expect(read.status).toBe(200);
      expect(read.body.data.state).toBe('SEARCHING');

      const cancelled = await request(app)
        .post(`${REQUESTS}/${requestId}/cancel`)
        .set('Idempotency-Key', 'idem-catalog-drain-01')
        .set(customer.headers)
        .send({ reason: 'Cancelado no teste de catálogo' });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.request.state).toBe('CANCELLED');
    });
  });
});
