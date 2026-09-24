/**
 * SERVICE CATALOG — an existing request's lifecycle survives the catalog status.
 *
 * The approved rule: `Service.status` gates NEW requests only. Once a request
 * exists (even in SEARCHING/NEGOTIATING), changing the service to
 * INACTIVE/SOON/DELETED must NOT invalidate it: it keeps matching, appearing in
 * the partner opportunities, receiving proposals and reaching ASSIGNED.
 *
 * RED-first: written before the post-creation gates were removed.
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
  PICKUP,
  createTowRequestInput,
  createMvp03Services,
  createOperationalPartner,
} = require('../../helpers/tow/mvp03');
const { createTowPartnerAuth, createTowCustomerAuth } = require('../../helpers/tow/auth');

const REQUESTS = '/api/tow/requests';
const OPPORTUNITIES = '/api/tow/partner/opportunities';

/** ~14.5 km south of the pickup: inside the frozen 40 km radius. */
const NEAR_PARTNER = Object.freeze({ latitude: PICKUP.latitude - 0.13, longitude: PICKUP.longitude });

describe('SERVICE CATALOG — existing request lifecycle is preserved', () => {
  let app;
  let services;
  let clock;
  let routeProvider;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock(DEFAULT_INSTANT);
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
    ({ services } = createMvp03Services({ clock, routeProvider }));
  });

  afterAll(async () => {
    await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
    await testDb.reset();
  });

  beforeEach(async () => {
    for (const table of [
      'tow_payments',
      'tow_request_tracking',
      'tow_assignments',
      'tow_request_proposals',
      'tow_requests',
      'tow_vehicle_documents',
      'tow_vehicles',
      'partners',
    ]) {
      if (await testDb.db.schema.hasTable(table)) await testDb.db(table).del();
    }
    await testDb.db('users').where({ role: 'partner' }).del();
    await testDb.db('service_modules').del();
    routeProvider.reset();
    clock.reset();
  });

  async function operationalPartner() {
    const auth = await createTowPartnerAuth(NEAR_PARTNER);
    const built = await createOperationalPartner({
      services,
      partner: auth.partner,
      documents: [{ document_type: 'vehicle_license', status: 'approved' }],
      active: true,
    });
    return { ...auth, partner: built.partner, vehicle: built.vehicle };
  }

  async function createRequest(customer, key) {
    return request(app)
      .post(REQUESTS)
      .set('Idempotency-Key', key)
      .set(customer.headers)
      .send(createTowRequestInput());
  }

  test.each(['INACTIVE', 'SOON', 'DELETED'])(
    'ACTIVE -> %s: existing request keeps matching, proposing and reaching ASSIGNED; new request is blocked',
    async (status) => {
      const customer = await createTowCustomerAuth();
      const partner = await operationalPartner();

      // 1. ACTIVE -> create request SEARCHING.
      const created = await createRequest(customer, 'idem-lifecycle-create-01');
      expect(created.status).toBe(201);
      expect(created.body.data.state).toBe('SEARCHING');
      const requestId = created.body.data.id;

      // 2. The catalog changes to a non-ACTIVE status.
      const flipped = await services.moduleService.setStatus({
        status,
        reason: `lifecycle test ${status}`,
      });
      expect(flipped.status).toBe(status);

      // 3. The existing request still appears in the partner opportunities.
      const feed = await request(app).get(OPPORTUNITIES).set(partner.headers);
      expect(feed.status).toBe(200);
      expect(feed.body.data.items.map((item) => item.request.id)).toContain(requestId);

      // 4. A proposal for the existing request is still allowed.
      const proposed = await request(app)
        .post(`${REQUESTS}/${requestId}/proposals`)
        .set('Idempotency-Key', 'idem-lifecycle-proposal-1')
        .set(partner.headers)
        .send({});
      expect(proposed.status).toBe(201);
      expect(proposed.body.data.request_id).toBe(requestId);

      // 4b. Acceptance (assignment) is still allowed.
      const accepted = await request(app)
        .post(`/api/tow/proposals/${proposed.body.data.id}/accept`)
        .set('Idempotency-Key', 'idem-lifecycle-accept-01')
        .set(customer.headers)
        .send({});
      expect(accepted.status).toBe(200);
      expect(accepted.body.data.state).toBe('ASSIGNED');

      // 5. A NEW request is blocked while the service is not ACTIVE.
      const blocked = await createRequest(customer, 'idem-lifecycle-create-02');
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('service_module_disabled');
      expect(blocked.body.error.details).toMatchObject({ status });
    }
  );
});
