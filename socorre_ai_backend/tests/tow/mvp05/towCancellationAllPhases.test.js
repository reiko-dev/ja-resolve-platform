/**
 * ISSUE #6 — the customer cancels a Tow in ANY non-terminal phase.
 *
 * The contract of this delivery: the owning customer may cancel while the
 * request is `SEARCHING`, `NEGOTIATING`, `ASSIGNED`, `EN_ROUTE`, `ARRIVED` or
 * `IN_TRANSIT`; `COMPLETED` and `CANCELLED` stay terminal and refuse the
 * operation. The old pre-transit constraint was a Phase 1 product decision, not
 * a safety rule: this delivery has no fee, debt, refund or wallet, so dropping
 * the request is free wherever it happens — including after the vehicle was
 * loaded (`IN_TRANSIT`), where the vehicle returns to the partner and the job is
 * closed as `CANCELLED` instead of `COMPLETED`.
 *
 * The PARTNER path is deliberately NOT widened: the assigned partner keeps
 * cancelling only while the vehicle is not loaded (`ASSIGNED`/`EN_ROUTE`/
 * `ARRIVED`), so `cancel-partner` semantics are unchanged.
 *
 * Everything is driven through the REAL HTTP surface (`createApp`) against the
 * SQLite harness with the deterministic fake clock and fake route provider. The
 * assignment is produced by the MVP-04 acceptance path, never inserted, so a
 * test can never pass against a shape the runtime cannot produce.
 *
 * RED-first: written before the domain, application and contract changes.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const request = require('supertest');
const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const domain = require('../../../src/modules/tow/domain');
const {
  REQUESTS,
  createMvp05Services,
  createAssignedScenario,
  enRoute,
  arrived,
  cancelByCustomer,
  cancelByPartner,
  getRequest,
  listPartnerJobs,
  postTracking,
  trackingRow,
  driveTo,
  CUSTOMER_CANCELLATION_REASON,
} = require('../../helpers/tow/mvp05');
const {
  createProposalScenario,
  authFor,
  authsForPartners,
  PROPOSAL_IDEMPOTENCY_KEY,
  ACCEPT_IDEMPOTENCY_KEY,
} = require('../../helpers/tow/mvp04');
const {
  selectPaymentMethod,
  getPayment,
  paymentRows,
} = require('../../helpers/tow/mvp06');

const ZERO_FINANCIAL_CONSEQUENCE = Object.freeze({
  fee_due_cents: 0,
  currency: 'BRL',
  customer_debt_created: false,
});

const NON_TERMINAL_STATES = Object.freeze([
  'SEARCHING', 'NEGOTIATING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_TRANSIT',
]);
const TERMINAL_STATES = Object.freeze(['COMPLETED', 'CANCELLED']);

describe('ISSUE-6 — customer cancellation in every non-terminal phase', () => {
  let app;
  let services;
  let clock;
  let routeProvider;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock();
    routeProvider = createFakeRouteProvider();
    // A real listening server, not the bare app: supertest would otherwise open
    // and close an ephemeral server per request, and that churn is what produces
    // this repository's documented stale-401 / `socket hang up` artifacts in a
    // full-suite run. The assertions are unchanged.
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
    ({ services } = createMvp05Services({ clock, routeProvider }));
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
    await testDb.db('service_modules').where({ module_key: 'tow' }).del();
    routeProvider.reset();
    clock.reset();
  });

  /** A SEARCHING canonical request plus one eligible partner, no proposal yet. */
  async function openScenario() {
    const fixture = await createProposalScenario({ services, clock, partnerCount: 1 });
    return {
      ...fixture,
      customerAuth: authFor({ user: fixture.customer }),
      auths: authsForPartners(fixture.partners),
    };
  }

  /** A NEGOTIATING request: the open fixture plus one live proposal. */
  async function negotiatingScenario() {
    const fixture = await openScenario();
    const proposed = await request(app)
      .post(`${REQUESTS}/${fixture.request.id}/proposals`)
      .set('Idempotency-Key', PROPOSAL_IDEMPOTENCY_KEY)
      .set(fixture.auths[0].headers)
      .send({});
    if (proposed.status !== 201) {
      throw new Error(`ISSUE-6 fixture could not negotiate (status ${proposed.status})`);
    }
    return { ...fixture, proposal: proposed.body.data };
  }

  async function assignedScenario() {
    return createAssignedScenario({ app, services, clock, partnerCount: 1 });
  }

  /** Every non-terminal phase, each reachable through the real runtime path. */
  const PHASES = Object.freeze([
    {
      phase: 'SEARCHING',
      assigned: false,
      prepare: () => openScenario(),
    },
    {
      phase: 'NEGOTIATING',
      assigned: false,
      prepare: () => negotiatingScenario(),
    },
    {
      phase: 'ASSIGNED',
      assigned: true,
      prepare: () => assignedScenario(),
    },
    {
      phase: 'EN_ROUTE',
      assigned: true,
      prepare: async () => {
        const fixture = await assignedScenario();
        await enRoute(app, fixture.request.id, fixture.auths[0]);
        return fixture;
      },
    },
    {
      phase: 'ARRIVED',
      assigned: true,
      prepare: async () => {
        const fixture = await assignedScenario();
        await enRoute(app, fixture.request.id, fixture.auths[0]);
        await arrived(app, fixture.request.id, fixture.auths[0]);
        return fixture;
      },
    },
    {
      phase: 'IN_TRANSIT',
      assigned: true,
      prepare: async () => {
        const fixture = await assignedScenario();
        await driveTo(app, fixture, 'IN_TRANSIT');
        return fixture;
      },
    },
  ]);

  describe.each(PHASES)('cancel at $phase', ({ phase, assigned, prepare }) => {
    test(`the owning customer cancels at ${phase} and the state is persisted as CANCELLED`, async () => {
      const fixture = await prepare();
      clock.advanceMinutes(2);

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
      expect(row.cancelled_at).toBe(clock.isoNow());
      expect(row.cancelled_by_actor_type).toBe('customer');
      expect(String(row.cancelled_by_actor_id)).toBe(String(fixture.customer.id));
      expect(row.cancellation_reason).toBe(CUSTOMER_CANCELLATION_REASON);

      const assignment = await testDb.db('tow_assignments')
        .where({ tow_request_id: fixture.request.id })
        .first();
      if (assigned) {
        // The release happened in the same transaction and freed the partner.
        expect(assignment.released_at).toBe(clock.isoNow());
        expect(assignment.release_reason).toBe('CANCELLED');
        const live = await testDb.db('tow_assignments')
          .where({ partner_id: fixture.partners[0].partner.id })
          .whereNull('released_at');
        expect(live).toHaveLength(0);
      } else {
        // SEARCHING/NEGOTIATING never had a partner to release.
        expect(assignment).toBeUndefined();
      }

      const recovered = await getRequest(app, fixture.request.id, fixture.customerAuth);
      expect(recovered.status).toBe(200);
      expect(recovered.body.data.state).toBe('CANCELLED');
      expect(recovered.body.data.terminal_reason).toBe('CUSTOMER_CANCELLED');

      // A cancelled negotiation is closed: a live proposal can no longer win.
      if (phase === 'NEGOTIATING') {
        const accept = await request(app)
          .post(`/api/tow/proposals/${fixture.proposal.id}/accept`)
          .set('Idempotency-Key', ACCEPT_IDEMPOTENCY_KEY)
          .set(fixture.customerAuth.headers)
          .send({});
        expect(accept.status).toBe(409);
      }
    });
  });

  describe('the partner path is deliberately not widened', () => {
    test('an unassigned SEARCHING request answers 403, never a cancellation', async () => {
      const fixture = await openScenario();
      const response = await cancelByPartner(app, fixture.request.id, fixture.auths[0]);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('not_assigned_partner');

      const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
      expect(row.state).toBe('SEARCHING');
      expect(row.cancelled_at).toBeNull();
    });

    test('the assigned partner still cannot cancel after IN_TRANSIT', async () => {
      const fixture = await assignedScenario();
      await driveTo(app, fixture, 'IN_TRANSIT');

      const response = await cancelByPartner(app, fixture.request.id, fixture.auths[0]);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('invalid_tow_transition');
      expect(response.body.error.details).toEqual({ from: 'IN_TRANSIT', to: 'CANCELLED' });

      const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
      expect(row.state).toBe('IN_TRANSIT');
      expect(row.cancelled_at).toBeNull();
    });
  });

  describe('terminal states', () => {
    test('a COMPLETED tow refuses the customer cancellation with 409 invalid_tow_transition', async () => {
      const fixture = await assignedScenario();
      await driveTo(app, fixture, 'COMPLETED');

      const response = await cancelByCustomer(app, fixture.request.id, fixture.customerAuth);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('invalid_tow_transition');
      expect(response.body.error.details).toEqual({ from: 'COMPLETED', to: 'CANCELLED' });

      const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
      expect(row.state).toBe('COMPLETED');
      expect(row.cancelled_at).toBeNull();
      expect(row.terminal_reason).toBeNull();
      const assignment = await testDb.db('tow_assignments')
        .where({ tow_request_id: fixture.request.id })
        .first();
      expect(assignment.release_reason).toBe('COMPLETED');
    });

    test('replaying a cancellation is the canonical 200 read: same instant, single release', async () => {
      const fixture = await assignedScenario();
      clock.advanceMinutes(3);
      const first = await cancelByCustomer(app, fixture.request.id, fixture.customerAuth, {
        key: 'idem-issue6-replay-a0001',
      });
      expect(first.status).toBe(200);

      clock.advanceMinutes(7);
      const replay = await cancelByCustomer(app, fixture.request.id, fixture.customerAuth, {
        key: 'idem-issue6-replay-b0002',
      });
      expect(replay.status).toBe(200);
      expect(replay.body.data.request.state).toBe('CANCELLED');
      expect(replay.body.data.request.terminal_reason).toBe('CUSTOMER_CANCELLED');
      expect(replay.body.data.financial_consequence).toEqual(ZERO_FINANCIAL_CONSEQUENCE);

      const rows = await testDb.db('tow_requests').where({ id: fixture.request.id });
      expect(rows).toHaveLength(1);
      expect(rows[0].cancelled_at).toBe('2026-01-15T12:03:00.000Z');
      expect(rows[0].updated_at).toBe('2026-01-15T12:03:00.000Z');

      const assignments = await testDb.db('tow_assignments')
        .where({ tow_request_id: fixture.request.id });
      expect(assignments).toHaveLength(1);
      expect(assignments[0].released_at).toBe('2026-01-15T12:03:00.000Z');
    });
  });

  test('a tracking write after CANCELLED is refused as a terminal state', async () => {
    const fixture = await assignedScenario();
    await driveTo(app, fixture, 'IN_TRANSIT');
    const cancelled = await cancelByCustomer(app, fixture.request.id, fixture.customerAuth);
    expect(cancelled.status).toBe(200);

    const write = await postTracking(app, fixture.request.id, fixture.auths[0]);
    expect(write.status).toBe(409);
    expect(write.body.error.code).toBe('invalid_tow_state');
    expect(write.body.error.details.state).toBe('CANCELLED');
    expect(await trackingRow(testDb.db, fixture.request.id)).toBeUndefined();
  });

  test('the domain advertises cancel to the customer in exactly the non-terminal states', () => {
    for (const state of NON_TERMINAL_STATES) {
      expect(domain.allowedActionsForRequest({ state, viewer: 'customer' })).toContain('cancel');
    }
    for (const state of TERMINAL_STATES) {
      expect(domain.allowedActionsForRequest({ state, viewer: 'customer' })).not.toContain('cancel');
      expect(domain.allowedActionsForRequest({ state, viewer: 'customer' })).toEqual([]);
    }

    // The partner path keeps its frozen pre-transit scope.
    for (const state of ['ASSIGNED', 'EN_ROUTE', 'ARRIVED']) {
      expect(domain.allowedActionsForRequest({ state, viewer: 'partner' })).toContain('cancel');
    }
    for (const state of ['SEARCHING', 'NEGOTIATING', 'IN_TRANSIT']) {
      expect(domain.allowedActionsForRequest({ state, viewer: 'partner' })).not.toContain('cancel');
    }
    expect(domain.allowedActionsForRequest({ state: 'IN_TRANSIT', viewer: 'partner' }))
      .toEqual(['finish_service']);

    // The cancellation classifier is actor-aware and never opens a terminal.
    expect(domain.classifyCancellation('SEARCHING', 'customer')).toBe(domain.TRANSITION_OUTCOMES.APPLY);
    expect(domain.classifyCancellation('NEGOTIATING', 'customer')).toBe(domain.TRANSITION_OUTCOMES.APPLY);
    expect(domain.classifyCancellation('IN_TRANSIT', 'customer')).toBe(domain.TRANSITION_OUTCOMES.APPLY);
    expect(domain.classifyCancellation('IN_TRANSIT', 'partner')).toBe(domain.TRANSITION_OUTCOMES.ILLEGAL);
    expect(domain.classifyCancellation('COMPLETED', 'customer')).toBe(domain.TRANSITION_OUTCOMES.ILLEGAL);
    expect(domain.classifyCancellation('CANCELLED', 'customer')).toBe(domain.TRANSITION_OUTCOMES.REPLAY);
  });

  test('the HTTP projection announces cancel in every non-terminal state and none in terminal ones', async () => {
    const fixtures = {};

    fixtures.SEARCHING = await openScenario();
    fixtures.NEGOTIATING = await negotiatingScenario();
    fixtures.ASSIGNED = await assignedScenario();

    fixtures.EN_ROUTE = await assignedScenario();
    await enRoute(app, fixtures.EN_ROUTE.request.id, fixtures.EN_ROUTE.auths[0]);

    fixtures.ARRIVED = await assignedScenario();
    await enRoute(app, fixtures.ARRIVED.request.id, fixtures.ARRIVED.auths[0]);
    await arrived(app, fixtures.ARRIVED.request.id, fixtures.ARRIVED.auths[0]);

    fixtures.IN_TRANSIT = await assignedScenario();
    await driveTo(app, fixtures.IN_TRANSIT, 'IN_TRANSIT');

    fixtures.COMPLETED = await assignedScenario();
    await driveTo(app, fixtures.COMPLETED, 'COMPLETED');

    fixtures.CANCELLED = await assignedScenario();
    await cancelByCustomer(app, fixtures.CANCELLED.request.id, fixtures.CANCELLED.customerAuth);

    for (const state of NON_TERMINAL_STATES) {
      const fixture = fixtures[state];
      const response = await getRequest(app, fixture.request.id, fixture.customerAuth);
      expect(response.status).toBe(200);
      expect(response.body.data.state).toBe(state);
      expect(response.body.data.allowed_actions).toContain('cancel');
    }
    expect((await getRequest(app, fixtures.NEGOTIATING.request.id, fixtures.NEGOTIATING.customerAuth))
      .body.data.allowed_actions).toEqual(['accept_proposal', 'cancel']);

    for (const state of TERMINAL_STATES) {
      const fixture = fixtures[state];
      const response = await getRequest(app, fixture.request.id, fixture.customerAuth);
      expect(response.status).toBe(200);
      expect(response.body.data.state).toBe(state);
      expect(response.body.data.allowed_actions).toEqual([]);
    }

    // The partner viewer is NOT widened: at IN_TRANSIT it still only finishes.
    const jobs = await listPartnerJobs(app, fixtures.IN_TRANSIT.auths[0]);
    const item = jobs.body.data.items
      .find((entry) => entry.id === String(fixtures.IN_TRANSIT.request.id));
    expect(item.allowed_actions).toEqual(['finish_service']);
  });

  test('cancelling after cash was selected creates no refund and leaves the payment untouched', async () => {
    const fixture = await assignedScenario();
    const selected = await selectPaymentMethod(app, fixture.request.id, fixture.customerAuth);
    expect(selected.status).toBe(200);
    expect(selected.body.data.status).toBe('CASH_SELECTED');
    expect(selected.body.data.amount_cents)
      .toBe(fixture.assigned.assignment.final_price.amount_cents);

    await driveTo(app, fixture, 'IN_TRANSIT');
    clock.advanceMinutes(4);
    const cancelled = await cancelByCustomer(app, fixture.request.id, fixture.customerAuth);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.financial_consequence).toEqual(ZERO_FINANCIAL_CONSEQUENCE);
    expect(cancelled.body.data.request.state).toBe('CANCELLED');
    expect(cancelled.body.data.request.payment.status).toBe('CASH_SELECTED');

    const rows = await paymentRows(testDb.db, fixture.request.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('PENDING');
    expect(rows[0].received_at).toBeNull();
    expect(rows[0].received_by_partner_id).toBeNull();

    const summary = await getPayment(app, fixture.request.id, fixture.customerAuth);
    expect(summary.status).toBe(200);
    expect(summary.body.data.status).toBe('CASH_SELECTED');
    expect(summary.body.data).not.toHaveProperty('refund_status');
    expect(summary.body.data).not.toHaveProperty('refund');
  });
});
