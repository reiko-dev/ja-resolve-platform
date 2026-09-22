/**
 * MVP-04 — `POST /api/tow/proposals/{proposalId}/accept` (atomic assignment).
 *
 * Proves the customer accept path end to end on the offline harness: exactly one
 * assignment, winner `ACCEPTED`, losers `CLOSED`, request `ASSIGNED`, truthful
 * `allowed_actions`, action-time expiry, idempotent replay, and the module gate.
 *
 * The CONCURRENCY proof lives in `towMvp04Postgres.e2e.test.js`: SQLite has a
 * single connection and can never certify a race.
 *
 * RED-first: written before the route, service, repository and tables exist.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const request = require('supertest');
const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { createTowCustomerAuth, createTowPartnerAuth } = require('../../helpers/tow/auth');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const {
  createMvp04Services,
  createProposalScenario,
  authFor,
  authsForPartners,
} = require('../../helpers/tow/mvp04');

const REQUESTS = '/api/tow/requests';
const EXPECTED_PRICE = Object.freeze({ amount_cents: 18480, currency: 'BRL' });

describe('MVP-04 — atomic assignment on accept', () => {
  let app;
  let services;
  let clock;
  let routeProvider;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock();
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
    ({ services } = createMvp04Services({ clock, routeProvider }));
  });

  afterAll(async () => {
    await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
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
    clock.reset();
  });

  async function scenario(options = {}) {
    const created = await createProposalScenario({ services, clock, ...options });
    return { ...created, auths: authsForPartners(created.partners) };
  }

  /** Create a proposal over the real HTTP surface; returns the DTO. */
  async function propose(auth, requestId, options = {}) {
    const response = await request(app)
      .post(`${REQUESTS}/${requestId}/proposals`)
      .set('Idempotency-Key', options.key || 'idem-mvp04-prop-000001')
      .set(auth.headers)
      .send({});
    expect(response.status).toBe(201);
    return response.body.data;
  }

  function accept(customerAuth, proposalId, options = {}) {
    let pending = request(app).post(`/api/tow/proposals/${proposalId}/accept`);
    if (options.key !== null) pending = pending.set('Idempotency-Key', options.key || 'idem-mvp04-accept-0001');
    if (options.auth !== null) pending = pending.set((options.auth || customerAuth).headers);
    return pending.send({});
  }

  function listProposals(auth, requestId) {
    return request(app).get(`${REQUESTS}/${requestId}/proposals`).set(auth.headers);
  }

  describe('happy path', () => {
    test('accepting one of three proposals assigns exactly one winner', async () => {
      const { request: towRequest, auths, customer } = await scenario({ partnerCount: 3 });
      const customerAuth = authFor({ user: customer });

      const proposals = [];
      for (let index = 0; index < auths.length; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        const created = await propose(auths[index], towRequest.id, { key: `idem-mvp04-acc-00000${index}` });
        proposals.push(created);
      }
      const winner = proposals[1];

      const response = await accept(customerAuth, winner.id);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const towRequestDto = response.body.data;
      expect(towRequestDto.state).toBe('ASSIGNED');
      expect(towRequestDto.id).toBe(String(towRequest.id));
      expect(towRequestDto.assignment).toEqual({
        partner_id: String(winner.partner_id),
        tow_vehicle_id: String(winner.tow_vehicle.id),
        final_price: EXPECTED_PRICE,
        assigned_at: '2026-01-15T12:00:00.000Z',
      });
      // MVP-05 EXT: the accept response is the CUSTOMER's view, and the customer
      // may cancel a job that has not started transit. Before MVP-05 the list was
      // empty because no action existed at all; `cancel` is now the honest one.
      expect(towRequestDto.allowed_actions).toEqual(['cancel']);

      // Exactly one assignment row, with the frozen snapshot.
      const assignments = await testDb.db('tow_assignments').select('*');
      expect(assignments).toHaveLength(1);
      expect(assignments[0].tow_request_id).toBe(towRequest.id);
      expect(String(assignments[0].proposal_id)).toBe(String(winner.id));
      expect(assignments[0].final_price_amount_cents).toBe(18480);
      expect(assignments[0].released_at).toBeNull();

      // Winner ACCEPTED, every other ACTIVE proposal CLOSED.
      const rows = await testDb.db('tow_request_proposals').select('*').orderBy('id');
      const byId = new Map(rows.map((row) => [String(row.id), row]));
      expect(byId.get(String(winner.id)).status).toBe('ACCEPTED');
      for (const proposal of proposals) {
        if (String(proposal.id) === String(winner.id)) continue;
        expect(byId.get(String(proposal.id)).status).toBe('CLOSED');
        expect(byId.get(String(proposal.id)).decided_at).not.toBeNull();
      }

      // The request row itself is ASSIGNED.
      const requestRow = await testDb.db('tow_requests').where({ id: towRequest.id }).first();
      expect(requestRow.state).toBe('ASSIGNED');
    });

    test('the customer proposal list reflects the closed losers and the winner', async () => {
      const { request: towRequest, auths, customer } = await scenario({ partnerCount: 2 });
      const customerAuth = authFor({ user: customer });
      const first = await propose(auths[0], towRequest.id, { key: 'idem-mvp04-lst-000001' });
      await propose(auths[1], towRequest.id, { key: 'idem-mvp04-lst-000002' });
      await accept(customerAuth, first.id);

      const response = await listProposals(customerAuth, towRequest.id);
      expect(response.status).toBe(200);
      expect(response.body.data.request_state).toBe('ASSIGNED');
      const statuses = response.body.data.items.map((item) => item.status).sort();
      expect(statuses).toEqual(['ACCEPTED', 'CLOSED']);
    });

    test('the partner rehydration shows the ACCEPTED / CLOSED outcome', async () => {
      const { request: towRequest, auths, customer } = await scenario({ partnerCount: 2 });
      const customerAuth = authFor({ user: customer });
      const winner = await propose(auths[0], towRequest.id, { key: 'idem-mvp04-pw-000001' });
      await propose(auths[1], towRequest.id, { key: 'idem-mvp04-pw-000002' });
      await accept(customerAuth, winner.id);

      const accepted = await request(app)
        .get('/api/tow/partner/proposals?status=ACCEPTED')
        .set(auths[0].headers);
      expect(accepted.body.data.items.map((item) => item.id)).toEqual([winner.id]);

      const closed = await request(app)
        .get('/api/tow/partner/proposals?status=CLOSED')
        .set(auths[1].headers);
      expect(closed.body.data.items).toHaveLength(1);
    });

    test('the request rehydration exposes the assignment after accept', async () => {
      const { request: towRequest, auths, customer } = await scenario({ partnerCount: 1 });
      const customerAuth = authFor({ user: customer });
      const created = await propose(auths[0], towRequest.id);
      await accept(customerAuth, created.id);

      const response = await request(app).get(`${REQUESTS}/${towRequest.id}`).set(customerAuth.headers);
      expect(response.status).toBe(200);
      expect(response.body.data.state).toBe('ASSIGNED');
      expect(response.body.data.assignment.final_price).toEqual(EXPECTED_PRICE);
      expect(response.body.data.assignment.assigned_at).toBe('2026-01-15T12:00:00.000Z');
    });
  });

  describe('idempotency', () => {
    test('replaying the same accept returns the same assignment, never a second one', async () => {
      const { request: towRequest, auths, customer } = await scenario({ partnerCount: 1 });
      const customerAuth = authFor({ user: customer });
      const created = await propose(auths[0], towRequest.id);

      const first = await accept(customerAuth, created.id, { key: 'idem-mvp04-rep-000001' });
      const second = await accept(customerAuth, created.id, { key: 'idem-mvp04-rep-000001' });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.data.assignment).toEqual(first.body.data.assignment);
      expect(await testDb.db('tow_assignments').select('*')).toHaveLength(1);
    });

    test('a DIFFERENT key for an already-assigned request is request_already_assigned', async () => {
      const { request: towRequest, auths, customer } = await scenario({ partnerCount: 2 });
      const customerAuth = authFor({ user: customer });
      const first = await propose(auths[0], towRequest.id, { key: 'idem-mvp04-ras-000001' });
      const second = await propose(auths[1], towRequest.id, { key: 'idem-mvp04-ras-000002' });
      await accept(customerAuth, first.id, { key: 'idem-mvp04-ras-000003' });

      const response = await accept(customerAuth, second.id, { key: 'idem-mvp04-ras-000004' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('request_already_assigned');
      expect(await testDb.db('tow_assignments').select('*')).toHaveLength(1);
    });

    test('a second accept of the SAME proposal with a different key stays idempotent', async () => {
      const { request: towRequest, auths, customer } = await scenario({ partnerCount: 1 });
      const customerAuth = authFor({ user: customer });
      const created = await propose(auths[0], towRequest.id);
      await accept(customerAuth, created.id, { key: 'idem-mvp04-same-000001' });

      const response = await accept(customerAuth, created.id, { key: 'idem-mvp04-same-000002' });
      expect(response.status).toBe(200);
      expect(response.body.data.assignment).not.toBeNull();
      expect(await testDb.db('tow_assignments').select('*')).toHaveLength(1);
    });
  });

  describe('action-time expiry', () => {
    test('an expired proposal cannot be accepted, even while still stored ACTIVE', async () => {
      const { request: towRequest, auths, customer } = await scenario({ partnerCount: 1 });
      const customerAuth = authFor({ user: customer });
      const created = await propose(auths[0], towRequest.id);

      // 10 minutes after creation: exactly at `expires_at`.
      clock.set('2026-01-15T12:10:00.000Z');

      const response = await accept(customerAuth, created.id);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('proposal_expired');
      expect(await testDb.db('tow_assignments').select('*')).toHaveLength(0);

      // The stored status is untouched: expiry is evaluated at action time only.
      const row = await testDb.db('tow_request_proposals').where({ id: created.id }).first();
      expect(row.status).toBe('ACTIVE');
    });

    test('a proposal one millisecond before expiry is still acceptable', async () => {
      const { request: towRequest, auths, customer } = await scenario({ partnerCount: 1 });
      const customerAuth = authFor({ user: customer });
      const created = await propose(auths[0], towRequest.id);

      clock.set('2026-01-15T12:09:59.999Z');
      const response = await accept(customerAuth, created.id);
      expect(response.status).toBe(200);
    });

    test('the expiry window follows the tow_proposal_expiry_minutes setting', async () => {
      await services.settingsService.patch({ tow_proposal_expiry_minutes: 2 });

      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      const created = await propose(auths[0], towRequest.id);
      expect(created.expires_at).toBe('2026-01-15T12:02:00.000Z');
    });
  });

  describe('withdraw', () => {
    test('the owning partner withdraws an ACTIVE proposal', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      const created = await propose(auths[0], towRequest.id);

      const response = await request(app)
        .post(`/api/tow/proposals/${created.id}/withdraw`)
        .set('Idempotency-Key', 'idem-mvp04-wdr-000001')
        .set(auths[0].headers);
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('WITHDRAWN');

      const row = await testDb.db('tow_request_proposals').where({ id: created.id }).first();
      expect(row.status).toBe('WITHDRAWN');
      expect(row.decided_at).not.toBeNull();
    });

    test('another partner cannot withdraw it', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 2 });
      const created = await propose(auths[0], towRequest.id, { key: 'idem-mvp04-wx-000001' });

      const response = await request(app)
        .post(`/api/tow/proposals/${created.id}/withdraw`)
        .set('Idempotency-Key', 'idem-mvp04-wx-000002')
        .set(auths[1].headers);
      expect(response.status).toBe(403);
    });

    test('a customer cannot withdraw a partner proposal', async () => {
      const { request: towRequest, auths, customer } = await scenario({ partnerCount: 1 });
      const created = await propose(auths[0], towRequest.id);
      const customerAuth = authFor({ user: customer });

      const response = await request(app)
        .post(`/api/tow/proposals/${created.id}/withdraw`)
        .set('Idempotency-Key', 'idem-mvp04-wy-000001')
        .set(customerAuth.headers);
      expect(response.status).toBe(403);
    });

    test('an ACCEPTED proposal can no longer be withdrawn', async () => {
      const { request: towRequest, auths, customer } = await scenario({ partnerCount: 1 });
      const customerAuth = authFor({ user: customer });
      const created = await propose(auths[0], towRequest.id);
      await accept(customerAuth, created.id);

      const response = await request(app)
        .post(`/api/tow/proposals/${created.id}/withdraw`)
        .set('Idempotency-Key', 'idem-mvp04-wz-000001')
        .set(auths[0].headers);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('proposal_not_actionable');
    });

    test('an expired proposal can no longer be withdrawn', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      const created = await propose(auths[0], towRequest.id);
      clock.set('2026-01-15T12:10:00.000Z');

      const response = await request(app)
        .post(`/api/tow/proposals/${created.id}/withdraw`)
        .set('Idempotency-Key', 'idem-mvp04-we-000001')
        .set(auths[0].headers);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('proposal_expired');
    });

    test('an unknown proposal is a 404', async () => {
      const { auths } = await scenario({ partnerCount: 1 });
      const response = await request(app)
        .post('/api/tow/proposals/999999/withdraw')
        .set('Idempotency-Key', 'idem-mvp04-wf-000001')
        .set(auths[0].headers);
      expect(response.status).toBe(404);
    });
  });

  describe('authorization', () => {
    test('a partner cannot accept a proposal', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      const created = await propose(auths[0], towRequest.id);
      const response = await accept(auths[0], created.id);
      expect(response.status).toBe(403);
    });

    test('a different customer cannot accept', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      const created = await propose(auths[0], towRequest.id);
      const stranger = await createTowCustomerAuth();
      const response = await accept(stranger, created.id);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('not_request_owner');
    });

    test('an unauthenticated accept is refused', async () => {
      const { request: towRequest, auths, customer } = await scenario({ partnerCount: 1 });
      const customerAuth = authFor({ user: customer });
      const created = await propose(auths[0], towRequest.id);
      const response = await accept(customerAuth, created.id, { auth: null });
      expect(response.status).toBe(401);
    });

    test('an unknown proposal id is a 404 for the owner', async () => {
      const { customer } = await scenario({ partnerCount: 1 });
      const customerAuth = authFor({ user: customer });
      const response = await accept(customerAuth, '999999');
      expect(response.status).toBe(404);
    });
  });

  describe('module gate', () => {
    test('a disabled module blocks accept with service_module_disabled', async () => {
      const { request: towRequest, auths, customer } = await scenario({ partnerCount: 1 });
      const customerAuth = authFor({ user: customer });
      const created = await propose(auths[0], towRequest.id);
      await testDb.db('service_modules').where({ module_key: 'tow' }).update({ enabled: false });

      const response = await accept(customerAuth, created.id);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('service_module_disabled');
      expect(await testDb.db('tow_assignments').select('*')).toHaveLength(0);
    });
  });

  describe('occupancy', () => {
    test('a partner already on a live job cannot be assigned a second request', async () => {
      const { request: firstRequest, auths, customer } = await scenario({ partnerCount: 1 });
      const customerAuth = authFor({ user: customer });
      const firstProposal = await propose(auths[0], firstRequest.id, { key: 'idem-mvp04-occ-000001' });
      await accept(customerAuth, firstProposal.id, { key: 'idem-mvp04-occ-000002' });

      // A second request from the same customer, and the same partner proposes.
      const { createCanonicalRequest } = require('../../helpers/tow/mvp03');
      const { request: secondRequest } = await createCanonicalRequest({
        services,
        customer,
        clock,
        idempotencyKey: 'idem-mvp04-occ-request-2',
      });
      const secondProposal = await propose(auths[0], secondRequest.id, { key: 'idem-mvp04-occ-000003' });
      expect(secondProposal.status).toBe('ACTIVE');

      const response = await accept(customerAuth, secondProposal.id, { key: 'idem-mvp04-occ-000004' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('conflict');
      expect(await testDb.db('tow_assignments').select('*')).toHaveLength(1);
    });
  });
});
