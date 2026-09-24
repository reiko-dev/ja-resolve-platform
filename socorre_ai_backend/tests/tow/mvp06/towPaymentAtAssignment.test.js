/**
 * TOW ROUND — the `TowPayment` is materialized by the ACCEPT transaction.
 *
 * The customer chooses the payment method ONCE, before the request exists
 * (`POST /tow/requests` requires `payment_method`). Before the assignment the
 * request truthfully owns no payment row (there is no `assignment_id` and no
 * frozen final price). The moment a proposal is accepted, both authorities
 * exist, so the accept creates the payment in the SAME transaction:
 *
 *   method       = CASH            (the commercial choice, never a second one)
 *   status       = PENDING         (CASH_SELECTED in the consumer DTO)
 *   amount_cents = assignment.final_price_amount_cents
 *   currency     = assignment.final_price_currency
 *
 * The first-party journey never calls `PUT /tow/requests/{id}/payment-method`;
 * that operation remains a legacy/compatibility path that, for a request which
 * already owns its payment, only returns the canonical row.
 *
 * RED-first: written before the accept materialization existed.
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
  createMvp06Services,
  cashReceived,
  getPayment,
  paymentRow,
  paymentRows,
} = require('../../helpers/tow/mvp06');
const {
  createProposalScenario,
  createProposal,
  authFor,
  authsForPartners,
  ACCEPT_IDEMPOTENCY_KEY,
} = require('../../helpers/tow/mvp04');
const {
  PICKUP,
  createTowRequestInput,
  createOperationalPartner,
} = require('../../helpers/tow/mvp03');
const { driveTo } = require('../../helpers/tow/mvp05');
const { createTowCustomerAuth } = require('../../helpers/tow/auth');

const REQUESTS = '/api/tow/requests';
const OPPORTUNITIES = '/api/tow/partner/opportunities';

describe('TOW ROUND — TowPayment materialized at assignment', () => {
  let app;
  let services;
  let clock;
  let routeProvider;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock();
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
    ({ services } = createMvp06Services({ clock, routeProvider }));
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

  /** An OPEN request (payment_method=cash) plus N operational partners. */
  async function openScenario({ partnerCount = 1 } = {}) {
    const scenario = await createProposalScenario({ services, clock, partnerCount });
    return {
      ...scenario,
      auths: authsForPartners(scenario.partners),
      customerAuth: authFor({ user: scenario.customer }),
    };
  }

  function accept(customerAuth, proposalId, key = ACCEPT_IDEMPOTENCY_KEY) {
    return request(app)
      .post(`/api/tow/proposals/${proposalId}/accept`)
      .set('Idempotency-Key', key)
      .set(customerAuth.headers)
      .send({});
  }

  test('1/2 — the create carries cash and owns NO payment before the assignment', async () => {
    const customer = await createTowCustomerAuth();
    const created = await request(app)
      .post(REQUESTS)
      .set('Idempotency-Key', 'idem-payment-at-assignment-create')
      .set(customer.headers)
      .send(createTowRequestInput());

    expect(created.status).toBe(201);
    expect(created.body.data.payment_method).toBe('cash');
    expect(created.body.data.state).toBe('SEARCHING');
    expect(created.body.data.payment.status).toBe('NOT_SELECTED');
    expect(await paymentRows(testDb.db, created.body.data.id)).toHaveLength(0);
  });

  test('3/4/7/8 — accept materializes PENDING with the assignment amount and currency', async () => {
    const fixture = await openScenario({ partnerCount: 1 });
    const proposal = await createProposal({
      services,
      partner: fixture.partners[0].partner,
      request: fixture.request,
    });

    // The Parceiro sees the commercial choice on the opportunity BEFORE proposing
    // (and before any payment row exists).
    const feed = await request(app).get(OPPORTUNITIES).set(fixture.auths[0].headers);
    expect(feed.body.data.items[0].request.payment_method).toBe('cash');
    expect(await paymentRows(testDb.db, fixture.request.id)).toHaveLength(0);

    const response = await accept(fixture.customerAuth, proposal.id);
    expect(response.status).toBe(200);
    expect(response.body.data.state).toBe('ASSIGNED');

    const assignment = await services.assignmentRepository.findByRequestId(fixture.request.id);
    expect(assignment).toBeTruthy();

    const row = await paymentRow(testDb.db, fixture.request.id);
    expect(row).toBeTruthy();
    expect(Number(row.tow_request_id)).toBe(Number(fixture.request.id));
    expect(Number(row.assignment_id)).toBe(Number(assignment.id));
    // The consistency rule: the financial execution uses exactly the commercial
    // choice made at creation.
    expect(String(row.method)).toBe(String(fixture.request.payment_method));
    expect(String(row.method)).toBe('CASH');
    expect(String(row.status)).toBe('PENDING');
    expect(row.received_at).toBeNull();
    expect(row.received_by_partner_id).toBeNull();
    expect(Number(row.amount_cents)).toBe(Number(assignment.final_price_amount_cents));
    expect(Number(row.amount_cents)).toBe(Number(proposal.price.amount_cents));
    expect(String(row.currency)).toBe(String(assignment.final_price_currency));
    expect(String(row.currency)).toBe('BRL');

    // The accept response is never NOT_SELECTED.
    expect(response.body.data.payment).toEqual({
      request_id: String(fixture.request.id),
      method: 'cash',
      status: 'CASH_SELECTED',
      amount_cents: Number(assignment.final_price_amount_cents),
      currency: 'BRL',
      can_start_service: true,
      pix: null,
    });

    // Every recovery read projects the same canonical payment.
    const recovery = await getPayment(app, fixture.request.id, fixture.customerAuth);
    expect(recovery.status).toBe(200);
    expect(recovery.body.data).toEqual(response.body.data.payment);

    const requestRead = await request(app).get(`${REQUESTS}/${fixture.request.id}`).set(fixture.customerAuth.headers);
    expect(requestRead.body.data.payment).toEqual(response.body.data.payment);

    const jobs = await request(app).get('/api/tow/partner/jobs').set(fixture.auths[0].headers);
    const job = jobs.body.data.items.find((item) => String(item.id) === String(fixture.request.id));
    expect(job.payment).toEqual(response.body.data.payment);
  });

  test('5 — replaying the accept returns the same payment and never creates a second row', async () => {
    const fixture = await openScenario({ partnerCount: 1 });
    const proposal = await createProposal({
      services,
      partner: fixture.partners[0].partner,
      request: fixture.request,
    });

    const first = await accept(fixture.customerAuth, proposal.id);
    expect(first.status).toBe(200);
    const frozenRow = await paymentRow(testDb.db, fixture.request.id);

    clock.advanceMinutes(5);
    const replay = await accept(fixture.customerAuth, proposal.id, 'idem-payment-at-assignment-replay');
    expect(replay.status).toBe(200);
    expect(replay.body.data.payment).toEqual(first.body.data.payment);

    const rows = await paymentRows(testDb.db, fixture.request.id);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].id)).toBe(Number(frozenRow.id));
    expect(Number(rows[0].amount_cents)).toBe(Number(frozenRow.amount_cents));
    expect(String(rows[0].status)).toBe('PENDING');
  });

  test('5b — a legacy assignment without a payment heals on replay, never duplicates', async () => {
    const fixture = await openScenario({ partnerCount: 1 });
    const proposal = await createProposal({
      services,
      partner: fixture.partners[0].partner,
      request: fixture.request,
    });
    expect((await accept(fixture.customerAuth, proposal.id)).status).toBe(200);

    // Model an assignment accepted BEFORE the materialization existed: the
    // assignment is canonical, the payment row is absent.
    await testDb.db('tow_payments').where({ tow_request_id: fixture.request.id }).del();
    expect(await paymentRows(testDb.db, fixture.request.id)).toHaveLength(0);

    const replay = await accept(fixture.customerAuth, proposal.id, 'idem-payment-at-assignment-heal');
    expect(replay.status).toBe(200);
    expect(replay.body.data.payment.status).toBe('CASH_SELECTED');

    const rows = await paymentRows(testDb.db, fixture.request.id);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].method)).toBe('CASH');
    expect(String(rows[0].status)).toBe('PENDING');
  });

  test('6 — one payment per request/assignment, even against a duplicate insert', async () => {
    const fixture = await openScenario({ partnerCount: 2 });
    const winner = await createProposal({ services, partner: fixture.partners[0].partner, request: fixture.request });
    const loser = await createProposal({
      services,
      partner: fixture.partners[1].partner,
      request: fixture.request,
      idempotencyKey: 'idem-payment-at-assignment-prop-2',
    });

    expect((await accept(fixture.customerAuth, winner.id)).status).toBe(200);
    const canonical = await paymentRow(testDb.db, fixture.request.id);
    const assignment = await services.assignmentRepository.findByRequestId(fixture.request.id);

    // A second accept of another proposal is a 409 and materializes nothing new.
    const second = await accept(fixture.customerAuth, loser.id, 'idem-payment-at-assignment-accept-2');
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('request_already_assigned');
    expect(await paymentRows(testDb.db, fixture.request.id)).toHaveLength(1);

    // The exact repository call a concurrent loser would make: the UNIQUE
    // identities decide, and the canonical row is returned.
    const duplicate = await services.towPaymentRepository.createForAssignment({
      tow_request_id: fixture.request.id,
      assignment_id: assignment.id,
      method: 'CASH',
      amount_cents: 1,
      currency: 'BRL',
      status: 'RECEIVED',
      received_at: clock.now(),
      received_by_partner_id: fixture.partners[0].partner.id,
      created_at: clock.now(),
      updated_at: clock.now(),
    });
    expect(duplicate.conflict).not.toBeNull();
    expect(Number(duplicate.row.id)).toBe(Number(canonical.id));
    expect(Number(duplicate.row.amount_cents)).toBe(Number(canonical.amount_cents));
    expect(await paymentRows(testDb.db, fixture.request.id)).toHaveLength(1);
  });

  test('9/10 — the first-party journey reaches CASH_RECEIVED without PUT payment-method', async () => {
    const fixture = await openScenario({ partnerCount: 1 });
    const proposal = await createProposal({
      services,
      partner: fixture.partners[0].partner,
      request: fixture.request,
    });

    // create -> propose -> accept. No `PUT /payment-method` anywhere in this test.
    const accepted = await accept(fixture.customerAuth, proposal.id);
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.payment.status).toBe('CASH_SELECTED');

    // ASSIGNED -> EN_ROUTE -> ARRIVED -> IN_TRANSIT -> COMPLETED
    const steps = await driveTo(app, fixture, 'COMPLETED');
    for (const step of steps) expect(step.status).toBe(200);

    // PENDING -> RECEIVED, still one row, still the frozen amount.
    const received = await cashReceived(app, fixture.request.id, fixture.auths[0]);
    expect(received.status).toBe(200);
    expect(received.body.data.status).toBe('CASH_RECEIVED');
    expect(received.body.data.method).toBe('cash');
    expect(received.body.data.can_start_service).toBe(true);

    const rows = await paymentRows(testDb.db, fixture.request.id);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].status)).toBe('RECEIVED');
    expect(rows[0].received_at).toBeTruthy();
    expect(Number(rows[0].received_by_partner_id)).toBe(Number(fixture.partners[0].partner.id));
  });

  test('a historical request without a commercial choice materializes nothing', async () => {
    const customer = await createTowCustomerAuth();
    const input = createTowRequestInput();
    const { row: historical } = await services.towRequestRepository.createIdempotent(
      {
        customer_id: customer.user.id,
        state: 'SEARCHING',
        pickup: input.pickup,
        destination: input.destination,
        vehicle: input.vehicle,
        problem_description: 'Histórico',
        observations: null,
        payment_method: null,
        matching_radius_km: 15,
        idempotency_key: 'idem-payment-at-assignment-hist-1',
        created_at: clock.now(),
        updated_at: clock.now(),
      },
      { fingerprintSource: 'historical-row' }
    );

    const { partner } = await createOperationalPartner({
      services,
      partnerOverrides: { latitude: PICKUP.latitude, longitude: PICKUP.longitude },
    });
    const proposal = await services.proposalService.createForPartner({
      partnerId: partner.id,
      requestId: historical.id,
      idempotencyKey: 'idem-payment-at-assignment-hist-2',
      body: {},
    });

    const response = await accept(authFor({ user: customer.user }), proposal.id, 'idem-payment-at-assignment-hist-3');
    expect(response.status).toBe(200);
    expect(response.body.data.state).toBe('ASSIGNED');
    // No commercial choice was ever made: nothing is invented, the truthful
    // projection stays NOT_SELECTED and no row exists.
    expect(response.body.data.payment.status).toBe('NOT_SELECTED');
    expect(await paymentRows(testDb.db, historical.id)).toHaveLength(0);
  });
});
