/**
 * MVP-05 — basic cancellation, widened by ISSUE #6.
 *
 * The owning customer (`POST /cancel`) cancels in EVERY non-terminal phase —
 * SEARCHING, NEGOTIATING, ASSIGNED, EN_ROUTE, ARRIVED, IN_TRANSIT — while the
 * assigned partner (`POST /cancel-partner`) keeps the frozen pre-transit scope
 * (ASSIGNED / EN_ROUTE / ARRIVED). The truthful zero-fee financial envelope,
 * backend-clock milestones, actor attribution, release of the assignment and
 * idempotent replay are asserted once, here, for both principals.
 *
 * RED-first: written before the routes, services, columns and tables exist.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const {
  createMvp05Services,
  createAssignedScenario,
  enRoute,
  arrived,
  inTransit,
  finish,
  cancelByCustomer,
  cancelByPartner,
  getRequest,
  milestonesOf,
  CUSTOMER_CANCELLATION_REASON,
  PARTNER_CANCELLATION_REASON,
} = require('../../helpers/tow/mvp05');

const ZERO_FINANCIAL_CONSEQUENCE = Object.freeze({
  fee_due_cents: 0,
  currency: 'BRL',
  customer_debt_created: false,
});

describe('MVP-05 — basic cancellation', () => {
  let app;
  let services;
  let clock;
  let routeProvider;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock();
    routeProvider = createFakeRouteProvider();
    // A real listening server, not the bare app: supertest would otherwise open and
    // close an ephemeral server per request, and that churn is what produces this
    // repository's documented stale-401 / `socket hang up` transport artifacts in a
    // full-suite run. The assertions are unchanged.
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
    ({ services } = createMvp05Services({ clock, routeProvider }));
  });

  afterAll(async () => {
    await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
    await testDb.reset();
  });

  beforeEach(async () => {
    if (await testDb.db.schema.hasTable('tow_request_tracking')) {
      await testDb.db('tow_request_tracking').del();
    }
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
    return createAssignedScenario({ app, services, clock, ...options });
  }

  test('RED-MVP05-5 — the owning customer cancels an ASSIGNED request', async () => {
    const fixture = await scenario({ partnerCount: 2 });
    clock.advanceMinutes(3);

    const response = await cancelByCustomer(app, fixture.request.id, fixture.customerAuth);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.financial_consequence).toEqual(ZERO_FINANCIAL_CONSEQUENCE);
    expect(response.body.data.request.state).toBe('CANCELLED');
    expect(response.body.data.request.terminal_reason).toBe('CUSTOMER_CANCELLED');
    expect(response.body.data.request.allowed_actions).toEqual([]);

    const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
    expect(row.state).toBe('CANCELLED');
    expect(row.terminal_reason).toBe('CUSTOMER_CANCELLED');
    expect(milestonesOf(row)).toEqual({
      en_route_at: null,
      arrived_at: null,
      in_transit_at: null,
      completed_at: null,
      cancelled_at: '2026-01-15T12:03:00.000Z',
    });
    expect(row.cancelled_by_actor_type).toBe('customer');
    expect(String(row.cancelled_by_actor_id)).toBe(String(fixture.customer.id));
    expect(row.cancellation_reason).toBe(CUSTOMER_CANCELLATION_REASON);

    const assignment = await testDb.db('tow_assignments').where({ tow_request_id: fixture.request.id }).first();
    expect(assignment.released_at).toBe('2026-01-15T12:03:00.000Z');
    expect(assignment.release_reason).toBe('CANCELLED');

    // The cancellation is rehydrated by the customer recovery path.
    const recovered = await getRequest(app, fixture.request.id, fixture.customerAuth);
    expect(recovered.body.data.state).toBe('CANCELLED');
    expect(recovered.body.data.terminal_reason).toBe('CUSTOMER_CANCELLED');
  });

  test('the assigned partner cancels at EN_ROUTE with the required reason', async () => {
    const fixture = await scenario({ partnerCount: 2 });
    await enRoute(app, fixture.request.id, fixture.auths[0]);
    clock.advanceMinutes(5);

    const response = await cancelByPartner(app, fixture.request.id, fixture.auths[0]);
    expect(response.status).toBe(200);
    expect(response.body.data.financial_consequence).toEqual(ZERO_FINANCIAL_CONSEQUENCE);
    expect(response.body.data.request.state).toBe('CANCELLED');
    expect(response.body.data.request.terminal_reason).toBe('PARTNER_CANCELLED');

    const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
    expect(row.cancelled_by_actor_type).toBe('partner');
    expect(String(row.cancelled_by_actor_id)).toBe(String(fixture.partners[0].partner.id));
    expect(row.cancellation_reason).toBe(PARTNER_CANCELLATION_REASON);
    expect(row.en_route_at).toBe('2026-01-15T12:00:00.000Z');
    expect(row.cancelled_at).toBe('2026-01-15T12:05:00.000Z');

    const assignment = await testDb.db('tow_assignments').where({ tow_request_id: fixture.request.id }).first();
    expect(assignment.release_reason).toBe('CANCELLED');
  });

  test('the customer can cancel at ARRIVED (still before IN_TRANSIT)', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    await enRoute(app, fixture.request.id, fixture.auths[0]);
    await arrived(app, fixture.request.id, fixture.auths[0]);
    const response = await cancelByCustomer(app, fixture.request.id, fixture.customerAuth, { body: null });
    expect(response.status).toBe(200);
    expect(response.body.data.request.state).toBe('CANCELLED');
    const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
    expect(row.cancellation_reason).toBeNull();
    expect(row.arrived_at).toBe('2026-01-15T12:00:00.000Z');
  });

  test('replaying the cancellation is a 200 read: one instant, one release', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    clock.advanceMinutes(2);
    expect((await cancelByCustomer(app, fixture.request.id, fixture.customerAuth, { key: 'idem-mvp05-cancel-a001' })).status).toBe(200);
    clock.advanceMinutes(8);
    const replay = await cancelByCustomer(app, fixture.request.id, fixture.customerAuth, { key: 'idem-mvp05-cancel-b002' });
    expect(replay.status).toBe(200);
    expect(replay.body.data.request.state).toBe('CANCELLED');

    const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
    expect(row.cancelled_at).toBe('2026-01-15T12:02:00.000Z');
    expect(row.updated_at).toBe('2026-01-15T12:02:00.000Z');
    const assignments = await testDb.db('tow_assignments').where({ tow_request_id: fixture.request.id });
    expect(assignments).toHaveLength(1);
    expect(assignments[0].released_at).toBe('2026-01-15T12:02:00.000Z');
  });

  describe('IN_TRANSIT closes the partner route but not the customer route (ISSUE #6)', () => {
    test('the customer cancels after IN_TRANSIT: the job closes and the partner is released', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      await enRoute(app, fixture.request.id, fixture.auths[0]);
      await arrived(app, fixture.request.id, fixture.auths[0]);
      await inTransit(app, fixture.request.id, fixture.auths[0]);
      clock.advanceMinutes(3);

      const response = await cancelByCustomer(app, fixture.request.id, fixture.customerAuth);
      expect(response.status).toBe(200);
      expect(response.body.data.financial_consequence).toEqual(ZERO_FINANCIAL_CONSEQUENCE);
      expect(response.body.data.request.state).toBe('CANCELLED');
      expect(response.body.data.request.terminal_reason).toBe('CUSTOMER_CANCELLED');
      expect(response.body.data.request.allowed_actions).toEqual([]);

      const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
      expect(row.state).toBe('CANCELLED');
      expect(row.in_transit_at).toBe('2026-01-15T12:00:00.000Z');
      expect(row.cancelled_at).toBe('2026-01-15T12:03:00.000Z');
      const assignment = await testDb.db('tow_assignments').where({ tow_request_id: fixture.request.id }).first();
      expect(assignment.released_at).toBe('2026-01-15T12:03:00.000Z');
      expect(assignment.release_reason).toBe('CANCELLED');
    });

    test('the partner can no longer cancel after IN_TRANSIT (frozen partner scope)', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      await enRoute(app, fixture.request.id, fixture.auths[0]);
      await arrived(app, fixture.request.id, fixture.auths[0]);
      await inTransit(app, fixture.request.id, fixture.auths[0]);
      const response = await cancelByPartner(app, fixture.request.id, fixture.auths[0]);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('invalid_tow_transition');
      expect(response.body.error.details).toMatchObject({ from: 'IN_TRANSIT', to: 'CANCELLED' });

      const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
      expect(row.state).toBe('IN_TRANSIT');
      expect(row.cancelled_at).toBeNull();
      const assignment = await testDb.db('tow_assignments').where({ tow_request_id: fixture.request.id }).first();
      expect(assignment.released_at).toBeNull();
    });

    test('a COMPLETED request cannot be cancelled', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      await enRoute(app, fixture.request.id, fixture.auths[0]);
      await arrived(app, fixture.request.id, fixture.auths[0]);
      await inTransit(app, fixture.request.id, fixture.auths[0]);
      await finish(app, fixture.request.id, fixture.auths[0]);
      const response = await cancelByCustomer(app, fixture.request.id, fixture.customerAuth);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('invalid_tow_transition');
      const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
      expect(row.terminal_reason).toBeNull();
    });

    test('an already CANCELLED request replay by the owner is 200, by a foreign actor is 403', async () => {
      const fixture = await scenario({ partnerCount: 2 });
      await cancelByCustomer(app, fixture.request.id, fixture.customerAuth);
      const other = await scenario({ partnerCount: 1 });

      const replay = await cancelByCustomer(app, fixture.request.id, fixture.customerAuth);
      expect(replay.status).toBe(200);
      expect(replay.body.data.request.state).toBe('CANCELLED');

      const foreignCustomer = await cancelByCustomer(app, fixture.request.id, other.customerAuth);
      expect(foreignCustomer.status).toBe(403);
      expect(foreignCustomer.body.error.code).toBe('not_request_owner');
      expect(foreignCustomer.body.data).toBeUndefined();

      const foreignPartner = await cancelByPartner(app, fixture.request.id, fixture.auths[1]);
      expect(foreignPartner.status).toBe(403);
      expect(foreignPartner.body.error.code).toBe('not_assigned_partner');
    });
  });

  test('an unassigned SEARCHING request is cancellable by the owning customer (ISSUE #6)', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    await testDb.db('tow_assignments').where({ tow_request_id: fixture.request.id }).del();
    await testDb.db('tow_requests').where({ id: fixture.request.id }).update({ state: 'SEARCHING' });

    const response = await cancelByCustomer(app, fixture.request.id, fixture.customerAuth);
    expect(response.status).toBe(200);
    expect(response.body.data.financial_consequence).toEqual(ZERO_FINANCIAL_CONSEQUENCE);
    expect(response.body.data.request.state).toBe('CANCELLED');
    expect(response.body.data.request.terminal_reason).toBe('CUSTOMER_CANCELLED');
    expect(response.body.data.request.assignment).toBeNull();

    const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
    expect(row.state).toBe('CANCELLED');
    expect(row.cancelled_at).toBe('2026-01-15T12:00:00.000Z');
    expect(row.cancelled_by_actor_type).toBe('customer');
    // No partner existed, so no assignment row may be invented by the release.
    const assignment = await testDb.db('tow_assignments').where({ tow_request_id: fixture.request.id }).first();
    expect(assignment).toBeUndefined();
  });

  describe('authz and validation', () => {
    test('the wrong role is rejected by the transport guard', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      const partnerOnCustomerRoute = await cancelByCustomer(app, fixture.request.id, fixture.auths[0]);
      expect(partnerOnCustomerRoute.status).toBe(403);
      expect(partnerOnCustomerRoute.body.error.code).toBe('forbidden');

      const customerOnPartnerRoute = await cancelByPartner(app, fixture.request.id, fixture.customerAuth);
      expect(customerOnPartnerRoute.status).toBe(403);
      expect(customerOnPartnerRoute.body.error.code).toBe('forbidden');
    });

    test('anonymous callers get 401 on both cancel routes', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      expect((await cancelByCustomer(app, fixture.request.id, null, { auth: null })).status).toBe(401);
      expect((await cancelByPartner(app, fixture.request.id, null, { auth: null })).status).toBe(401);
    });

    test('an unknown request is 404 for the owner', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      const response = await cancelByCustomer(app, '999999', fixture.customerAuth);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('not_found');
    });

    test('partner cancel requires a non-empty reason (RequiredReasonInput)', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      for (const body of [{}, { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(2001) }, { reason: 'ok', extra: 1 }]) {
        const response = await cancelByPartner(app, fixture.request.id, fixture.auths[0], { body });
        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe('validation_error');
      }
      const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
      expect(row.state).toBe('ASSIGNED');
    });

    test('customer cancel rejects an unknown body field and an over-long reason', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      const unknown = await cancelByCustomer(app, fixture.request.id, fixture.customerAuth, { body: { why: 'x' } });
      expect(unknown.status).toBe(422);
      const long = await cancelByCustomer(app, fixture.request.id, fixture.customerAuth, { body: { reason: 'x'.repeat(1001) } });
      expect(long.status).toBe(422);
    });

    test('the cancel routes require the canonical Idempotency-Key', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      expect((await cancelByCustomer(app, fixture.request.id, fixture.customerAuth, { key: null })).status).toBe(422);
      expect((await cancelByPartner(app, fixture.request.id, fixture.auths[0], { key: 'tiny' })).status).toBe(422);
      const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
      expect(row.state).toBe('ASSIGNED');
    });
  });
});
