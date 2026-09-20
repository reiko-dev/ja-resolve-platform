/**
 * MVP-03 — customer rehydration: `GET /api/tow/requests/:requestId` and
 * `GET /api/tow/requests`.
 *
 * Proves the canonical recovery path (process death, logout/login, reinstall,
 * device switch, lost cached id), owner-only authorization and that no other
 * customer's request ever leaks.
 *
 * RED-first: written before the routes exist.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const request = require('supertest');
const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const {
  createTowCustomerAuth,
  createTowPartnerAuth,
  createTowAdminAuth,
} = require('../../helpers/tow/auth');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const { DEFAULT_INSTANT, createTowRequestInput } = require('../../helpers/tow/mvp03');

const ENDPOINT = '/api/tow/requests';

describe('MVP-03 — Tow request rehydration', () => {
  let app;
  let clock;
  let owner;
  let stranger;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock(DEFAULT_INSTANT);
    app = createApp({ tow: { clock, routeProvider: createFakeRouteProvider() } });
    owner = await createTowCustomerAuth({ name: 'Owner MVP03' });
    stranger = await createTowCustomerAuth({ name: 'Stranger MVP03' });
  });

  afterAll(async () => {
    await testDb.reset();
  });

  beforeEach(async () => {
    await testDb.db('tow_requests').del();
    await testDb.db('service_modules').where({ module_key: 'tow' }).del();
    clock.reset();
  });

  async function createRequest({ auth = owner, key = 'idem-rehydrate-0001', payload } = {}) {
    const response = await request(app)
      .post(ENDPOINT)
      .set('Idempotency-Key', key)
      .set(auth.headers)
      .send(payload || createTowRequestInput());
    expect(response.status).toBe(201);
    return response.body.data;
  }

  describe('single request', () => {
    test('the owning customer rehydrates the exact canonical snapshot', async () => {
      const created = await createRequest();
      const response = await request(app).get(`${ENDPOINT}/${created.id}`).set(owner.headers);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(created);
    });

    test('an unknown id is a 404 and never a 500', async () => {
      const response = await request(app).get(`${ENDPOINT}/999999`).set(owner.headers);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('not_found');
    });

    test('a non-numeric id is a 404, not a validation leak', async () => {
      const response = await request(app).get(`${ENDPOINT}/not-an-id`).set(owner.headers);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('not_found');
    });

    test('another customer receives 403 not_request_owner', async () => {
      const created = await createRequest();
      const response = await request(app).get(`${ENDPOINT}/${created.id}`).set(stranger.headers);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('not_request_owner');
    });

    test('a tow partner cannot read an arbitrary customer request', async () => {
      const partner = await createTowPartnerAuth();
      const created = await createRequest();
      const response = await request(app).get(`${ENDPOINT}/${created.id}`).set(partner.headers);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('an admin cannot read a customer request in MVP-03', async () => {
      const admin = await createTowAdminAuth();
      const created = await createRequest();
      const response = await request(app).get(`${ENDPOINT}/${created.id}`).set(admin.headers);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('an anonymous caller is rejected with 401', async () => {
      const created = await createRequest();
      const response = await request(app).get(`${ENDPOINT}/${created.id}`);
      expect(response.status).toBe(401);
    });

    test('rehydration works while the module is disabled', async () => {
      const created = await createRequest();
      await testDb.db('service_modules')
        .where({ module_key: 'tow' })
        .update({ enabled: false });

      const response = await request(app).get(`${ENDPOINT}/${created.id}`).set(owner.headers);
      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(created.id);
    });
  });

  describe('list', () => {
    test('only the authenticated customer requests are returned', async () => {
      const mine = await createRequest({ key: 'idem-list-mine-0001' });
      const theirs = await createRequest({ auth: stranger, key: 'idem-list-theirs-01' });

      const response = await request(app).get(ENDPOINT).set(owner.headers);
      expect(response.status).toBe(200);
      expect(response.body.data.items.map((item) => item.id)).toEqual([mine.id]);
      expect(response.body.data.items.map((item) => item.customer_id)).toEqual([String(owner.user.id)]);
      expect(response.body.data.meta.total).toBe(1);

      const strangerList = await request(app).get(ENDPOINT).set(stranger.headers);
      expect(strangerList.body.data.items.map((item) => item.id)).toEqual([theirs.id]);
    });

    test('the list is newest first with canonical pagination meta', async () => {
      const first = await createRequest({ key: 'idem-list-order-001' });
      clock.advanceMinutes(1);
      const second = await createRequest({ key: 'idem-list-order-002' });
      clock.advanceMinutes(1);
      const third = await createRequest({ key: 'idem-list-order-003' });

      const response = await request(app).get(ENDPOINT).set(owner.headers);
      expect(response.body.data.items.map((item) => item.id)).toEqual([third.id, second.id, first.id]);
      expect(response.body.data.meta).toMatchObject({ page: 1, limit: 20, total: 3 });
    });

    test('pagination slices the ordered history', async () => {
      for (let index = 0; index < 3; index += 1) {
        await createRequest({ key: `idem-list-page-00${index}` });
        clock.advanceMinutes(1);
      }

      const response = await request(app).get(`${ENDPOINT}?page=2&limit=2`).set(owner.headers);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.meta).toMatchObject({ page: 2, limit: 2, total: 3 });
    });

    test('the state filter is honoured', async () => {
      await createRequest({ key: 'idem-list-state-0001' });
      const response = await request(app).get(`${ENDPOINT}?state=SEARCHING`).set(owner.headers);
      expect(response.body.data.items).toHaveLength(1);

      const empty = await request(app).get(`${ENDPOINT}?state=COMPLETED`).set(owner.headers);
      expect(empty.status).toBe(200);
      expect(empty.body.data.items).toEqual([]);
      expect(empty.body.data.meta.total).toBe(0);
    });

    test('an unknown state filter is a 422 validation error', async () => {
      const response = await request(app).get(`${ENDPOINT}?state=WHATEVER`).set(owner.headers);
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('validation_error');
    });

    test.each(['page=0', 'limit=0', 'limit=101', 'page=abc', 'from=not-a-date'])(
      'an invalid query (%s) is a 422 validation error',
      async (query) => {
        const response = await request(app).get(`${ENDPOINT}?${query}`).set(owner.headers);
        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe('validation_error');
      }
    );

    test('the from/to window filters by created_at', async () => {
      await createRequest({ key: 'idem-list-window-001' });
      clock.advanceHours(2);
      const later = await createRequest({ key: 'idem-list-window-002' });

      const from = encodeURIComponent(new Date(Date.parse(DEFAULT_INSTANT) + 60 * 60 * 1000).toISOString());
      const response = await request(app).get(`${ENDPOINT}?from=${from}`).set(owner.headers);
      expect(response.body.data.items.map((item) => item.id)).toEqual([later.id]);
    });

    test('an anonymous caller is rejected with 401', async () => {
      const response = await request(app).get(ENDPOINT);
      expect(response.status).toBe(401);
    });
  });
});
