/**
 * MVP-04 — `POST /api/tow/requests/{requestId}/proposals` (server-priced create).
 *
 * Proves: the module gate runs FIRST; the body is empty by contract; the price,
 * route and tariff are server-derived and frozen; eligibility is revalidated
 * before the route provider is called; duplicates collide on the DB constraint
 * with the stable `proposal_already_active` code; the request moves
 * `SEARCHING -> NEGOTIATING` on the first proposal without hiding itself from
 * other partners; and the partner proposal list rehydrates.
 *
 * RED-first: written before the route, service, repository and table exist.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const request = require('supertest');
const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { createTowCustomerAuth, createTowPartnerAuth, createTowAdminAuth } = require('../../helpers/tow/auth');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const { createTowRequestInput, createCanonicalRequest } = require('../../helpers/tow/mvp03');
const {
  PROPOSAL_IDEMPOTENCY_KEY,
  createMvp04Services,
  createProposalScenario,
  authFor,
  authsForPartners,
} = require('../../helpers/tow/mvp04');

const REQUESTS = '/api/tow/requests';
const PARTNER_PROPOSALS = '/api/tow/partner/proposals';

/** Fake route legs sum to 14,350 m → 18480 cents with the canonical tariff. */
const EXPECTED_PRICE = Object.freeze({ amount_cents: 18480, currency: 'BRL' });
const EXPECTED_ROUTE = Object.freeze({
  provider_to_pickup: { distance_meters: 7000, duration_seconds: 900 },
  pickup_to_destination: { distance_meters: 7350, duration_seconds: 1200 },
  total_distance_meters: 14350,
  total_duration_seconds: 2100,
});

describe('MVP-04 — server-priced proposal creation', () => {
  let app;
  let services;
  let clock;
  let routeProvider;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock();
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider } });
    ({ services } = createMvp04Services({ clock, routeProvider }));
  });

  afterAll(async () => {
    await testDb.reset();
  });

  beforeEach(async () => {
    await testDb.db('tow_assignments').del();
    await testDb.db('tow_request_proposals').del();
    await testDb.db('tow_requests').del();
    await testDb.db('tow_vehicle_documents').del();
    await testDb.db('tow_vehicles').del();
    await testDb.db('partners').del();
    await testDb.db('users').where({ role: 'partner' }).del();
    await testDb.db('service_modules').where({ module_key: 'tow' }).del();
    routeProvider.reset();
    routeProvider.failure = null;
    clock.reset();
  });

  function createProposal(auth, requestId, options = {}) {
    let pending = request(app).post(`${REQUESTS}/${requestId}/proposals`);
    if (options.key !== null) pending = pending.set('Idempotency-Key', options.key || PROPOSAL_IDEMPOTENCY_KEY);
    if (options.auth !== null) pending = pending.set((options.auth || auth).headers);
    return pending.send(options.body === undefined ? {} : options.body);
  }

  async function scenario(options = {}) {
    const created = await createProposalScenario({ services, clock, ...options });
    const auths = authsForPartners(created.partners);
    return { ...created, auths };
  }

  describe('happy path', () => {
    test('a single eligible partner creates a proposal priced by the backend', async () => {
      const { request: towRequest, auths, partners } = await scenario({ partnerCount: 1 });
      const response = await createProposal(auths[0], towRequest.id);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);

      const proposal = response.body.data;
      expect(proposal.request_id).toBe(String(towRequest.id));
      expect(proposal.partner_id).toBe(String(partners[0].partner.id));
      expect(proposal.status).toBe('ACTIVE');
      expect(proposal.price).toEqual(EXPECTED_PRICE);
      expect(proposal.route_quote).toEqual(EXPECTED_ROUTE);
      expect(proposal.counteroffer).toBeNull();
      expect(proposal.expires_at).toBe('2026-01-15T12:10:00.000Z');
      expect(proposal.created_at).toBe('2026-01-15T12:00:00.000Z');
      expect(proposal.tow_vehicle).toEqual({
        id: String(partners[0].vehicle.id),
        plate: partners[0].vehicle.plate,
        make: 'Ford',
        model: 'F-4000',
        year: 2020,
        equipment_type: 'flatbed',
        supported_vehicle_classes: ['light_vehicle', 'motorcycle'],
        max_towed_weight_kg: 4000,
        document_status: 'approved',
        active: true,
      });
    });

    test('the route provider was called exactly once, after eligibility passed', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      await createProposal(auths[0], towRequest.id);
      expect(routeProvider.callCount('computeRoute')).toBe(1);
    });

    test('the first proposal moves the request SEARCHING -> NEGOTIATING', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      await createProposal(auths[0], towRequest.id);
      const row = await testDb.db('tow_requests').where({ id: towRequest.id }).first();
      expect(row.state).toBe('NEGOTIATING');
    });

    test('multiple partners can hold simultaneous ACTIVE proposals (TOW-PROP-001)', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 3 });
      const keys = ['idem-mvp04-prop-a00001', 'idem-mvp04-prop-b00001', 'idem-mvp04-prop-c00001'];
      const responses = [];
      for (let index = 0; index < auths.length; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        responses.push(await createProposal(auths[index], towRequest.id, { key: keys[index] }));
      }
      expect(responses.map((r) => r.status)).toEqual([201, 201, 201]);

      const rows = await testDb.db('tow_request_proposals').select('*');
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.status === 'ACTIVE')).toBe(true);
      // The first proposal must NOT win anything.
      const assignments = await testDb.db('tow_assignments').select('*');
      expect(assignments).toHaveLength(0);
    });

    test('the request stays visible in the partner opportunity feed after a proposal', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 2 });
      await createProposal(auths[0], towRequest.id);

      const feed = await request(app).get('/api/tow/partner/opportunities').set(auths[1].headers);
      expect(feed.status).toBe(200);
      expect(feed.body.data.items.map((item) => item.request.id)).toContain(String(towRequest.id));
    });
  });

  describe('module gate', () => {
    test('a disabled module blocks creation with service_module_disabled and no provider call', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      // The canonical way to disable the module: the row is created on first
      // read and then flipped, exactly like the MVP-03 gate test does.
      await services.moduleService.setEnabled({ enabled: false, reason: 'MVP-04 gate test' });

      const response = await createProposal(auths[0], towRequest.id);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('service_module_disabled');
      expect(routeProvider.callCount('computeRoute')).toBe(0);
      expect(await testDb.db('tow_request_proposals').select('*')).toHaveLength(0);
    });
  });

  describe('input contract', () => {
    test('a missing Idempotency-Key is a validation error', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      const response = await createProposal(auths[0], towRequest.id, { key: null });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('validation_error');
    });

    test.each([
      'proposed_price', 'price', 'amount', 'amount_cents', 'route_distance',
      'estimated_price', 'tariff', 'partner_id', 'tow_vehicle_id',
    ])('the body rejects the client-supplied field %s', async (field) => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      const response = await createProposal(auths[0], towRequest.id, { body: { [field]: 1 } });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('validation_error');
      expect(routeProvider.callCount('computeRoute')).toBe(0);
    });

    test('a client cannot propose with a price even when it matches the server price', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      const response = await createProposal(auths[0], towRequest.id, { body: { price: 18480 } });
      expect(response.status).toBe(422);
      expect(await testDb.db('tow_request_proposals').select('*')).toHaveLength(0);
    });

    test('a non-numeric requestId is a 404, never a 500', async () => {
      const { auths } = await scenario({ partnerCount: 1 });
      const response = await createProposal(auths[0], 'not-an-id');
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('not_found');
    });

    test('an unknown request is a 404', async () => {
      const { auths } = await scenario({ partnerCount: 1 });
      const response = await createProposal(auths[0], '999999');
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('not_found');
    });
  });

  describe('eligibility revalidation (never tightened beyond MVP-03)', () => {
    test('a partner outside the frozen radius is refused and consumes no provider call', async () => {
      const { request: towRequest, auths } = await scenario({
        partnerCount: 1,
        partnerOverrides: [{ partnerOverrides: { latitude: -23.561684 - 0.16, longitude: -46.655981 } }],
      });
      const response = await createProposal(auths[0], towRequest.id);
      // Hidden from the opportunity feed => not addressable. A partner must not
      // learn that an out-of-radius request exists.
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('not_found');
      expect(routeProvider.callCount('computeRoute')).toBe(0);
    });

    test('a partner with no active vehicle is refused', async () => {
      const { request: towRequest, auths } = await scenario({
        partnerCount: 1,
        partnerOverrides: [{ active: false }],
      });
      const response = await createProposal(auths[0], towRequest.id);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('vehicle_not_operational');
      expect(routeProvider.callCount('computeRoute')).toBe(0);
    });

    test('an unavailable partner is refused', async () => {
      const { request: towRequest, auths } = await scenario({
        partnerCount: 1,
        partnerOverrides: [{ partnerOverrides: { is_available: false } }],
      });
      const response = await createProposal(auths[0], towRequest.id);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('partner_not_operational');
      expect(routeProvider.callCount('computeRoute')).toBe(0);
    });

    test('an offline partner is refused', async () => {
      const { request: towRequest, auths } = await scenario({
        partnerCount: 1,
        partnerOverrides: [{ partnerOverrides: { is_online: false } }],
      });
      const response = await createProposal(auths[0], towRequest.id);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('partner_not_operational');
    });

    test('CONTRACT_CONFLICT-1: an UNVERIFIED partner is NOT excluded (accepted MVP-03 semantics)', async () => {
      const { request: towRequest, auths } = await scenario({
        partnerCount: 1,
        partnerOverrides: [{ partnerOverrides: { is_verified: false } }],
      });
      const response = await createProposal(auths[0], towRequest.id);
      expect(response.status).toBe(201);
    });

    test('a partner whose required document is missing is refused', async () => {
      const { request: towRequest, auths } = await scenario({
        partnerCount: 1,
        partnerOverrides: [{ documents: [] }],
      });
      const response = await createProposal(auths[0], towRequest.id);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('tow_document_required');
      expect(routeProvider.callCount('computeRoute')).toBe(0);
    });

    test('a partner whose required document is pending is refused', async () => {
      const { request: towRequest, auths } = await scenario({
        partnerCount: 1,
        partnerOverrides: [{ documents: [{ document_type: 'vehicle_license', status: 'pending' }] }],
      });
      const response = await createProposal(auths[0], towRequest.id);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('tow_document_not_approved');
      expect(routeProvider.callCount('computeRoute')).toBe(0);
    });

    test('an incompatible vehicle class is refused', async () => {
      const { request: towRequest, auths } = await scenario({
        partnerCount: 1,
        partnerOverrides: [{ vehicleOverrides: { supported_vehicle_classes: ['heavy_truck'] } }],
      });
      const response = await createProposal(auths[0], towRequest.id);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('vehicle_not_compatible');
      expect(routeProvider.callCount('computeRoute')).toBe(0);
    });

    test('a provider failure yields external_dependency_unavailable and no proposal row', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      routeProvider.failure = { code: 'ROUTE_PROVIDER_UNAVAILABLE', message: 'boom' };
      const response = await createProposal(auths[0], towRequest.id);
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('external_dependency_unavailable');
      expect(await testDb.db('tow_request_proposals').select('*')).toHaveLength(0);
    });
  });

  describe('authorization', () => {
    test('a customer cannot create a proposal', async () => {
      const { request: towRequest } = await scenario({ partnerCount: 1 });
      const customer = await createTowCustomerAuth();
      const response = await createProposal(customer, towRequest.id);
      expect(response.status).toBe(403);
    });

    test('an admin cannot create a proposal', async () => {
      const { request: towRequest } = await scenario({ partnerCount: 1 });
      const admin = await createTowAdminAuth();
      const response = await createProposal(admin, towRequest.id);
      expect(response.status).toBe(403);
    });

    test('an unauthenticated request is refused', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      const response = await createProposal(auths[0], towRequest.id, { auth: null });
      expect(response.status).toBe(401);
    });
  });

  describe('duplicate policy', () => {
    test('a second ACTIVE proposal by the same partner is a stable conflict', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      const first = await createProposal(auths[0], towRequest.id, { key: 'idem-mvp04-dup-000001' });
      expect(first.status).toBe(201);

      const second = await createProposal(auths[0], towRequest.id, { key: 'idem-mvp04-dup-000002' });
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('proposal_already_active');

      const rows = await testDb.db('tow_request_proposals').select('*');
      expect(rows).toHaveLength(1);
    });

    test('after withdrawing, the same partner may propose again', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      const first = await createProposal(auths[0], towRequest.id, { key: 'idem-mvp04-dup-000003' });
      const withdraw = await request(app)
        .post(`/api/tow/proposals/${first.body.data.id}/withdraw`)
        .set('Idempotency-Key', 'idem-mvp04-wd-000001')
        .set(auths[0].headers);
      expect(withdraw.status).toBe(200);
      expect(withdraw.body.data.status).toBe('WITHDRAWN');

      const again = await createProposal(auths[0], towRequest.id, { key: 'idem-mvp04-dup-000004' });
      expect(again.status).toBe(201);
      expect(again.body.data.status).toBe('ACTIVE');
    });
  });

  describe('idempotency', () => {
    test('the same key with the same payload returns the same proposal, not a duplicate', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      const first = await createProposal(auths[0], towRequest.id, { key: 'idem-mvp04-idem-000001' });
      const second = await createProposal(auths[0], towRequest.id, { key: 'idem-mvp04-idem-000001' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.data.id).toBe(first.body.data.id);
      expect(await testDb.db('tow_request_proposals').select('*')).toHaveLength(1);
      // The replay must not re-price: the provider is called once.
      expect(routeProvider.callCount('computeRoute')).toBe(1);
    });

    test('the same key with a different payload is a 409 idempotency_conflict', async () => {
      const { request: first, customer, auths } = await scenario({ partnerCount: 1 });
      const created = await createProposal(auths[0], first.id, { key: 'idem-mvp04-idem-000002' });
      expect(created.status).toBe(201);

      // Same partner, same key, DIFFERENT request: the fingerprint source is
      // (partner, request, vehicle), so this is a different payload and the
      // adapter must refuse the replay instead of returning the first proposal.
      const { request: second } = await createCanonicalRequest({
        services,
        customer,
        clock,
        idempotencyKey: 'idem-mvp04-req-000002',
      });

      const conflict = await createProposal(auths[0], second.id, { key: 'idem-mvp04-idem-000002' });
      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe('idempotency_conflict');
      expect(await testDb.db('tow_request_proposals').select('*')).toHaveLength(1);
    });

    test('the adapter persists the digest of the canonical fingerprint source', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      await createProposal(auths[0], towRequest.id);

      // The domain owns the deterministic SOURCE (no `node:crypto` in Domain);
      // the adapter owns the SHA-256 digest, and only the digest is stored.
      const rows = await testDb.db('tow_request_proposals').select('*');
      expect(rows[0].idempotency_fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0].idempotency_key).toBe(PROPOSAL_IDEMPOTENCY_KEY);
    });
  });

  describe('partner proposal list', () => {
    test('the partner rehydrates their own proposals with pagination meta', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      const created = await createProposal(auths[0], towRequest.id);

      const response = await request(app).get(PARTNER_PROPOSALS).set(auths[0].headers);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.meta).toMatchObject({ page: 1, limit: 20, total: 1 });
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0].id).toBe(created.body.data.id);
      expect(response.body.data.items[0].status).toBe('ACTIVE');
    });

    test('the partner list filters by status', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      await createProposal(auths[0], towRequest.id);

      const active = await request(app).get(`${PARTNER_PROPOSALS}?status=ACTIVE`).set(auths[0].headers);
      expect(active.status).toBe(200);
      expect(active.body.data.items).toHaveLength(1);

      const accepted = await request(app).get(`${PARTNER_PROPOSALS}?status=ACCEPTED`).set(auths[0].headers);
      expect(accepted.status).toBe(200);
      expect(accepted.body.data.items).toHaveLength(0);
    });

    test('an invalid status filter is a validation error', async () => {
      const { auths } = await scenario({ partnerCount: 1 });
      const response = await request(app).get(`${PARTNER_PROPOSALS}?status=pending`).set(auths[0].headers);
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('validation_error');
    });

    test('a partner only sees their own proposals', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 2 });
      await createProposal(auths[0], towRequest.id, { key: 'idem-mvp04-own-000001' });

      const other = await request(app).get(PARTNER_PROPOSALS).set(auths[1].headers);
      expect(other.status).toBe(200);
      expect(other.body.data.items).toHaveLength(0);
    });

    test('a customer cannot read the partner proposal list', async () => {
      const customer = await createTowCustomerAuth();
      const response = await request(app).get(PARTNER_PROPOSALS).set(customer.headers);
      expect(response.status).toBe(403);
    });
  });

  describe('customer proposal list', () => {
    test('the owner lists proposals for their request with the request state', async () => {
      const { request: towRequest, auths, customer } = await scenario({ partnerCount: 2 });
      const customerAuth = authFor({ user: customer });
      await createProposal(auths[0], towRequest.id, { key: 'idem-mvp04-cl-000001' });
      await createProposal(auths[1], towRequest.id, { key: 'idem-mvp04-cl-000002' });

      const response = await request(app)
        .get(`${REQUESTS}/${towRequest.id}/proposals`)
        .set(customerAuth.headers);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toHaveLength(2);
      expect(response.body.data.request_state).toBe('NEGOTIATING');
    });

    test('a different customer cannot list someone else\'s proposals', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      await createProposal(auths[0], towRequest.id);
      const stranger = await createTowCustomerAuth();

      const response = await request(app)
        .get(`${REQUESTS}/${towRequest.id}/proposals`)
        .set(stranger.headers);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('not_request_owner');
    });

    test('an unknown request is a 404 for the owner path', async () => {
      const customer = await createTowCustomerAuth();
      const response = await request(app).get(`${REQUESTS}/999999/proposals`).set(customer.headers);
      expect(response.status).toBe(404);
    });
  });

  describe('truthful allowed_actions', () => {
    test('the request advertises accept_proposal only when a live proposal exists', async () => {
      const { request: towRequest, auths, customer } = await scenario({ partnerCount: 1 });
      const customerAuth = authFor({ user: customer });

      const before = await request(app).get(`${REQUESTS}/${towRequest.id}`).set(customerAuth.headers);
      expect(before.status).toBe(200);
      expect(before.body.data.allowed_actions).toEqual([]);
      expect(before.body.data.assignment).toBeNull();

      await createProposal(auths[0], towRequest.id);

      const after = await request(app).get(`${REQUESTS}/${towRequest.id}`).set(customerAuth.headers);
      expect(after.status).toBe(200);
      expect(after.body.data.allowed_actions).toEqual(['accept_proposal']);
      expect(after.body.data.assignment).toBeNull();
    });

    test('no MVP-05 or counteroffer action is ever advertised', async () => {
      const { request: towRequest, auths, customer } = await scenario({ partnerCount: 1 });
      const customerAuth = authFor({ user: customer });
      await createProposal(auths[0], towRequest.id);

      const response = await request(app).get(`${REQUESTS}/${towRequest.id}`).set(customerAuth.headers);
      for (const forbidden of [
        'create_counteroffer', 'accept_counteroffer', 'reject_counteroffer',
        'start_en_route', 'mark_arrived', 'start_in_transit', 'finish_service',
        'select_payment_method', 'cancel_request', 'confirm_completion',
      ]) {
        expect(response.body.data.allowed_actions).not.toContain(forbidden);
      }
    });
  });

  describe('counteroffer is not implemented', () => {
    test('the counteroffer path does not exist', async () => {
      const { request: towRequest, auths, customer } = await scenario({ partnerCount: 1 });
      const created = await createProposal(auths[0], towRequest.id);
      const customerAuth = authFor({ user: customer });

      const response = await request(app)
        .post(`/api/tow/proposals/${created.body.data.id}/counteroffer`)
        .set('Idempotency-Key', 'idem-mvp04-co-000001')
        .set(customerAuth.headers)
        .send({ amount_cents: 10000 });
      expect(response.status).toBe(404);
    });
  });
});
