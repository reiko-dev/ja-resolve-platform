/**
 * MVP-04 EXT (EXT-MVP04-1) — `GET /api/tow/partner/jobs`
 * (canonical `listPartnerTowJobs`).
 *
 * The partner job list is NOT a second projection of the assignment: it reads the
 * SAME authority the customer recovery path reads (`tow_assignments`, the only
 * occupancy/job authority) and returns the same `TowRequest` DTO, so a partner
 * and the customer can never disagree about the price, the vehicle or the
 * instant of a job.
 *
 * What this suite pins:
 *   - the route exists, is partner-only, and the partner identity comes
 *     EXCLUSIVELY from the authenticated context (`req.user.partner_id`) — no
 *     query, path or body field can select another partner's jobs;
 *   - the winning partner sees its job; losing-proposal partners and unrelated
 *     partners see nothing;
 *   - the live body validates against the canonical `TowRequestListResponse`
 *     schema (Ajv, composed contract), for a populated and an empty list;
 *   - the canonical subset of `validateListQuery`: `page`/`limit`, `state` over
 *     the frozen request states, and `from`/`to` as INCLUSIVE bounds on
 *     `assignment.assigned_at`.
 *
 * RED-first: written before the route, the controller method, the service
 * method and `AssignmentRepository.listForPartner` exist.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const request = require('supertest');
const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { createTowAdminAuth } = require('../../helpers/tow/auth');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const {
  createMvp04Services,
  createProposalScenario,
  authFor,
  authsForPartners,
} = require('../../helpers/tow/mvp04');
const { createCanonicalRequest } = require('../../helpers/tow/mvp03');
const {
  loadRawDocuments,
  composeDocument,
  buildAjv,
  schemaUri,
} = require('../../helpers/towContract');

const JOBS = '/api/tow/partner/jobs';
const ASSIGNED_AT = '2026-01-15T12:00:00.000Z';

describe('MVP-04 EXT — partner job list (EXT-MVP04-1)', () => {
  let app;
  let services;
  let clock;
  let routeProvider;
  let validateListResponse;
  let validateError;

  beforeAll(async () => {
    await testDb.reset();
    const { composed } = composeDocument(loadRawDocuments());
    const ajv = buildAjv(composed);
    validateListResponse = ajv.getSchema(schemaUri('#/components/schemas/TowRequestListResponse'));
    validateError = ajv.getSchema(schemaUri('#/components/schemas/ErrorResponse'));
    expect(typeof validateListResponse).toBe('function');
    expect(typeof validateError).toBe('function');
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
    clock.reset();
  });

  async function scenario(options = {}) {
    const created = await createProposalScenario({ services, clock, ...options });
    return { ...created, auths: authsForPartners(created.partners) };
  }

  async function propose(auth, requestId, key) {
    const response = await request(app)
      .post(`/api/tow/requests/${requestId}/proposals`)
      .set('Idempotency-Key', key)
      .set(auth.headers)
      .send({});
    expect(response.status).toBe(201);
    return response.body.data;
  }

  async function accept(customerAuth, proposalId, key = 'idem-mvp04-accept-0001') {
    const response = await request(app)
      .post(`/api/tow/proposals/${proposalId}/accept`)
      .set('Idempotency-Key', key)
      .set(customerAuth.headers)
      .send({});
    expect(response.status).toBe(200);
    return response.body.data;
  }

  function getJobs(auth, query = {}) {
    let pending = request(app).get(JOBS).query(query);
    if (auth) pending = pending.set(auth.headers);
    return pending;
  }

  /** Three partners propose; the customer accepts the first one. */
  async function assignedScenario(options = {}) {
    const created = await scenario({ partnerCount: 3, ...options });
    const customerAuth = authFor({ user: created.customer });
    const winner = await propose(created.auths[0], created.request.id, 'idem-mvp04-pj-win-0001');
    await propose(created.auths[1], created.request.id, 'idem-mvp04-pj-lose-0001');
    const assigned = await accept(customerAuth, winner.id);
    return { ...created, customerAuth, winner, assigned };
  }

  describe('authorization and identity', () => {
    test('an anonymous caller is a 401', async () => {
      const response = await getJobs(null);
      expect(response.status).toBe(401);
    });

    test('a customer cannot list partner jobs', async () => {
      const { customerAuth } = await assignedScenario();
      const response = await getJobs(customerAuth);
      expect(response.status).toBe(403);
    });

    test('an admin cannot list partner jobs', async () => {
      const admin = await createTowAdminAuth();
      const response = await getJobs(authFor(admin));
      expect(response.status).toBe(403);
    });

    test('the identity is the token, never the query', async () => {
      const { request: towRequest, auths } = await assignedScenario();

      // The loser asks for the winner's jobs by naming it in every plausible way.
      const spoofed = await getJobs(auths[1], {
        partner_id: auths[0].partner.id,
        partnerId: auths[0].partner.id,
        id: auths[0].partner.id,
      });
      expect(spoofed.status).toBe(200);
      expect(spoofed.body.data.items).toEqual([]);
      expect(spoofed.body.data.meta.total).toBe(0);

      // ... and the winner's own list is unaffected by the extra parameters.
      const own = await getJobs(auths[0], { partner_id: auths[1].partner.id });
      expect(own.status).toBe(200);
      expect(own.body.data.items).toHaveLength(1);
      expect(own.body.data.items[0].id).toBe(String(towRequest.id));
    });
  });

  describe('the job list', () => {
    test('the winning partner sees exactly its assigned job', async () => {
      const { request: towRequest, auths, assigned } = await assignedScenario();

      const response = await getJobs(auths[0]);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toHaveLength(1);

      const job = response.body.data.items[0];
      expect(job.id).toBe(String(towRequest.id));
      expect(job.state).toBe('ASSIGNED');
      expect(job.assignment).toEqual(assigned.assignment);
      expect(job.assignment.partner_id).toBe(String(auths[0].partner.id));
      expect(job.assignment.assigned_at).toBe(ASSIGNED_AT);
      expect(response.body.data.meta).toEqual({ page: 1, limit: 20, total: 1 });

      // The canonical schema is the arbiter, not this assertion list.
      expect(validateListResponse(response.body)).toBe(true);
      expect(validateListResponse.errors).toBeNull();
    });

    test('a partner that lost the request sees no job', async () => {
      const { auths } = await assignedScenario();

      const response = await getJobs(auths[1]);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.meta.total).toBe(0);
      expect(validateListResponse(response.body)).toBe(true);
    });

    test('an unrelated partner sees no job', async () => {
      const { auths } = await assignedScenario();

      const response = await getJobs(auths[2]);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.meta.total).toBe(0);
    });

    test('a partner with no job at all gets an empty, schema-valid list', async () => {
      const { auths } = await scenario({ partnerCount: 1 });

      const response = await getJobs(auths[0]);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.meta).toEqual({ page: 1, limit: 20, total: 0 });
      expect(validateListResponse(response.body)).toBe(true);
    });

    test('the customer and the partner agree on the very same assignment', async () => {
      const { request: towRequest, auths, customerAuth } = await assignedScenario();

      const fromCustomer = await request(app)
        .get(`/api/tow/requests/${towRequest.id}`)
        .set(customerAuth.headers);
      const fromPartner = await getJobs(auths[0]);

      expect(fromCustomer.status).toBe(200);
      expect(fromPartner.status).toBe(200);
      // Same authority, same projection: not a field may differ — EXCEPT
      // `allowed_actions`, which MVP-05 made VIEWER-AWARE on purpose (the
      // assigned partner may start the trip, the customer may not). Everything
      // that describes the job itself must still be identical, so the two
      // projections are compared member by member with only that field removed.
      const partnerItem = { ...fromPartner.body.data.items[0] };
      const partnerActions = partnerItem.allowed_actions;
      delete partnerItem.allowed_actions;
      const customerItem = { ...fromCustomer.body.data };
      const customerActions = customerItem.allowed_actions;
      delete customerItem.allowed_actions;

      expect(partnerItem).toEqual(customerItem);
      expect(partnerItem.assignment).toEqual(fromCustomer.body.data.assignment);
      expect(customerActions).toEqual(['cancel']);
      expect(partnerActions).toEqual(['start_en_route', 'cancel']);
    });

    test('an ASSIGNED job is never visible to a partner that did not win it', async () => {
      const { request: towRequest, auths } = await assignedScenario();

      for (const index of [1, 2]) {
        const response = await getJobs(auths[index]);
        const ids = response.body.data.items.map((item) => item.id);
        expect(ids).not.toContain(String(towRequest.id));
      }
    });
  });

  describe('filters and pagination', () => {
    test('state filters over the frozen request states', async () => {
      const { request: towRequest, auths } = await assignedScenario();

      const assigned = await getJobs(auths[0], { state: 'ASSIGNED' });
      expect(assigned.status).toBe(200);
      expect(assigned.body.data.items.map((item) => item.id)).toEqual([String(towRequest.id)]);

      for (const state of ['SEARCHING', 'NEGOTIATING', 'COMPLETED', 'CANCELLED']) {
        const response = await getJobs(auths[0], { state });
        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([]);
      }
    });

    test('an unknown state is a 422 validation error', async () => {
      const { auths } = await assignedScenario();
      const response = await getJobs(auths[0], { state: 'NOT_A_STATE' });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('validation_error');
      expect(validateError(response.body)).toBe(true);
    });

    test('from and to are inclusive bounds on assignment.assigned_at', async () => {
      const { auths } = await assignedScenario();

      const exact = await getJobs(auths[0], { from: ASSIGNED_AT, to: ASSIGNED_AT });
      expect(exact.status).toBe(200);
      expect(exact.body.data.items).toHaveLength(1);

      const fromInside = await getJobs(auths[0], { from: ASSIGNED_AT });
      expect(fromInside.body.data.items).toHaveLength(1);

      const toInside = await getJobs(auths[0], { to: ASSIGNED_AT });
      expect(toInside.body.data.items).toHaveLength(1);

      const oneMsAfter = await getJobs(auths[0], { from: '2026-01-15T12:00:00.001Z' });
      expect(oneMsAfter.body.data.items).toEqual([]);

      const oneMsBefore = await getJobs(auths[0], { to: '2026-01-15T11:59:59.999Z' });
      expect(oneMsBefore.body.data.items).toEqual([]);
    });

    test('malformed or inverted bounds are 422', async () => {
      const { auths } = await assignedScenario();

      for (const query of [
        { from: 'not-an-instant' },
        { to: 'yesterday' },
        { from: '2026-01-15T12:00:00.000Z', to: '2026-01-15T11:00:00.000Z' },
      ]) {
        const response = await getJobs(auths[0], query);
        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe('validation_error');
        expect(validateError(response.body)).toBe(true);
      }
    });

    test('pagination is over the partner assignments, not the request table', async () => {
      const { request: firstRequest, auths, customer, partners } = await assignedScenario();

      // MVP-04 owns no release flow, so history is written directly here: the
      // `released_at` column and its partial unique index are exactly the schema
      // that makes a second live job for the same partner possible. The job list
      // must read that authority — history included.
      await testDb.db('tow_assignments').where({ tow_request_id: firstRequest.id }).update({
        released_at: '2026-01-15T13:00:00.000Z',
        release_reason: 'COMPLETED',
        updated_at: '2026-01-15T13:00:00.000Z',
      });
      // MVP-05 EXT: `tow_requests` now enforces terminal coherence
      // (`(state = 'COMPLETED') = (completed_at IS NOT NULL)` plus the milestone
      // ordering checks), so a fabricated COMPLETED row must carry the whole
      // milestone chain instead of only the state. The assertions below are
      // unchanged: this test is about which ASSIGNMENTS the list paginates over.
      await testDb.db('tow_requests').where({ id: firstRequest.id }).update({
        state: 'COMPLETED',
        en_route_at: '2026-01-15T12:30:00.000Z',
        arrived_at: '2026-01-15T12:45:00.000Z',
        in_transit_at: '2026-01-15T12:50:00.000Z',
        completed_at: '2026-01-15T13:00:00.000Z',
        updated_at: '2026-01-15T13:00:00.000Z',
      });

      clock.set('2026-01-16T09:30:00.000Z');
      const { request: secondRequest } = await createCanonicalRequest({
        services,
        customer,
        clock,
        idempotencyKey: 'idem-mvp04-pj-second-0001',
      });
      const secondProposal = await propose(auths[0], secondRequest.id, 'idem-mvp04-pj-second-0002');
      await accept(authFor({ user: customer }), secondProposal.id, 'idem-mvp04-pj-second-0003');

      const all = await getJobs(auths[0]);
      expect(all.status).toBe(200);
      expect(all.body.data.meta).toEqual({ page: 1, limit: 20, total: 2 });
      expect(all.body.data.items).toHaveLength(2);
      // Newest first.
      expect(all.body.data.items.map((item) => item.id)).toEqual([String(secondRequest.id), String(firstRequest.id)]);
      expect(all.body.data.items.map((item) => item.state)).toEqual(['ASSIGNED', 'COMPLETED']);
      expect(validateListResponse(all.body)).toBe(true);

      const firstPage = await getJobs(auths[0], { limit: 1, page: 1 });
      expect(firstPage.body.data.meta).toEqual({ page: 1, limit: 1, total: 2 });
      expect(firstPage.body.data.items.map((item) => item.id)).toEqual([String(secondRequest.id)]);

      const secondPage = await getJobs(auths[0], { limit: 1, page: 2 });
      expect(secondPage.body.data.meta).toEqual({ page: 2, limit: 1, total: 2 });
      expect(secondPage.body.data.items.map((item) => item.id)).toEqual([String(firstRequest.id)]);

      const beyond = await getJobs(auths[0], { limit: 1, page: 3 });
      expect(beyond.body.data.items).toEqual([]);
      expect(beyond.body.data.meta.total).toBe(2);

      // The filter still narrows the paginated authority.
      const completed = await getJobs(auths[0], { state: 'COMPLETED' });
      expect(completed.body.data.meta.total).toBe(1);
      expect(completed.body.data.items[0].id).toBe(String(firstRequest.id));
      expect(completed.body.data.items[0].assignment.partner_id).toBe(String(partners[0].partner.id));

      // ... and the other partners still see nothing of this history.
      for (const index of [1, 2]) {
        const response = await getJobs(auths[index]);
        expect(response.body.data.meta.total).toBe(0);
      }
    });

    test('an out-of-range limit or page is a 422', async () => {
      const { auths } = await assignedScenario();

      for (const query of [{ limit: 101 }, { limit: 0 }, { page: 0 }, { page: 'two' }]) {
        const response = await getJobs(auths[0], query);
        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe('validation_error');
      }
    });
  });
});
