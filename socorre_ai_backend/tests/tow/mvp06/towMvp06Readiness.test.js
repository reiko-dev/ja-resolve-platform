/**
 * MVP-06 — the mandatory lean MVP readiness gate: S01..S20 from Issue #18.
 *
 * One scenario per test, numbered explicitly. No collapsing: a green run of this
 * file is the evidence table the readiness report cites, and each test names the
 * authority it proves.
 *
 * The whole gate runs against the REAL module/application/HTTP stack over the
 * SQLite harness (the deterministic engine the accepted MVP-01..MVP-05 suites
 * use). Where a scenario is only decidable under real concurrency, the test says
 * so explicitly and the PG binding is recorded:
 *
 *   S13  concurrent accept -> `towMvp04Postgres.e2e.test.js` C1 (real PostgreSQL)
 *   S19  cash retry under concurrency -> `towMvp06Postgres.e2e.test.js` F1/F2
 *
 * Route quotes come from the deterministic fake provider (no Google call): the
 * live-provider certification is explicitly out of scope for the automated gate
 * (`docs/evidence/mvp-06/02-contract-audit.md` §5 and Issue #18).
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
  TARIFF,
  PICKUP,
  DESTINATION,
  createTowRequestInput,
  createOperationalPartner,
  createMvp03Services,
} = require('../../helpers/tow/mvp03');
const { authFor, createProposal } = require('../../helpers/tow/mvp04');
const { createTowCustomerAuth } = require('../../helpers/tow/auth');
const {
  PAYMENT_METHOD_IDEMPOTENCY_KEY,
  CASH_RECEIVED_IDEMPOTENCY_KEY,
  CASH_RECEIVED_ALTERNATE_KEY,
  createMvp06Services,
  selectPaymentMethod,
  cashReceived,
  getPayment,
  paymentRows,
  getRequest,
} = require('../../helpers/tow/mvp06');

const REQUESTS = '/api/tow/requests';

describe('MVP-06 readiness gate — S01..S20', () => {
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
    routeProvider.failure = null;
    // Restore the canonical two-leg fixture (S09 deliberately re-points the legs
    // to prove the one-meter boundary; no later scenario may inherit that).
    routeProvider.providerToPickup = { distance_meters: 7000, duration_seconds: 900 };
    routeProvider.pickupToDestination = { distance_meters: 7350, duration_seconds: 1200 };
    clock.reset();
  });

  let sequence = 0;
  const nextKey = (prefix) => {
    sequence += 1;
    return `idem-mvp06-${prefix}-${String(sequence).padStart(6, '0')}`;
  };

  /** A customer with real JWT auth over the HTTP surface. */
  async function customer() {
    const auth = await createTowCustomerAuth();
    return auth;
  }

  /** An operational tow partner with its own auth, vehicle and approved document. */
  async function partner(options = {}) {
    const created = await createOperationalPartner({
      services,
      partnerOverrides: options.partnerOverrides || {},
      vehicleOverrides: options.vehicleOverrides || {},
      documents: options.documents === undefined
        ? [{ document_type: 'vehicle_license', status: 'approved' }]
        : options.documents,
      active: options.active === undefined ? true : options.active,
    });
    return { ...created, auth: authFor(created) };
  }

  async function createRequest(auth, input = createTowRequestInput()) {
    return request(app)
      .post(REQUESTS)
      .set(auth.headers)
      .set('Idempotency-Key', nextKey('create'))
      .send(input);
  }

  const opportunities = (auth, query = {}) => request(app)
    .get('/api/tow/partner/opportunities')
    .set(auth.headers)
    .query(query);

  const propose = (auth, requestId) => request(app)
    .post(`${REQUESTS}/${requestId}/proposals`)
    .set(auth.headers)
    .set('Idempotency-Key', nextKey('propose'))
    .send({});

  const accept = (auth, proposalId) => request(app)
    .post(`/api/tow/proposals/${proposalId}/accept`)
    .set(auth.headers)
    .set('Idempotency-Key', nextKey('accept'))
    .send({});

  const milestone = (auth, requestId, path, body = {}) => request(app)
    .post(`${REQUESTS}/${requestId}/${path}`)
    .set(auth.headers)
    .set('Idempotency-Key', nextKey(path))
    .send(body);

  // -------------------------------------------------------------------------
  test('S01 — Tow module enabled allows a customer to create a request', async () => {
    const owner = await customer();
    const response = await createRequest(owner);

    expect(response.status).toBe(201);
    expect(response.body.data.state).toBe('SEARCHING');
    expect(response.body.data.payment.status).toBe('NOT_SELECTED');
  });

  // -------------------------------------------------------------------------
  test('S02 — Tow module disabled blocks a new request', async () => {
    const owner = await customer();
    await services.moduleService.setEnabled({ enabled: false, reason: 'S02 readiness gate' });

    const response = await createRequest(owner);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('service_module_disabled');
  });

  // -------------------------------------------------------------------------
  test('S03 — a partner without a TowVehicle is not eligible', async () => {
    const owner = await customer();
    const towRequest = (await createRequest(owner)).body.data;
    const { user, partner: partnerRow } = await require('../../helpers/tow/factories').createTowPartner();
    const auth = authFor({ user, partner: partnerRow });

    const feed = await opportunities(auth);
    expect(feed.status).toBe(200);
    expect(feed.body.data.items).toEqual([]);
    expect(routeProvider.callCount('computeRoute')).toBe(0);

    expect(towRequest.id).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  test('S04 — a TowVehicle without valid approved documents is not eligible', async () => {
    const owner = await customer();
    await createRequest(owner);
    const pendingDocs = await partner({
      documents: [{ document_type: 'vehicle_license', status: 'pending' }],
    });

    const feed = await opportunities(pendingDocs.auth);
    expect(feed.status).toBe(200);
    expect(feed.body.data.items).toEqual([]);
    expect(routeProvider.callCount('computeRoute')).toBe(0);
  });

  // -------------------------------------------------------------------------
  test('S05 — a TowVehicle incompatible with the request is not eligible', async () => {
    const owner = await customer();
    await createRequest(owner);
    const incompatible = await partner({
      vehicleOverrides: { supported_vehicle_classes: ['motorcycle'] },
    });

    const feed = await opportunities(incompatible.auth);
    expect(feed.status).toBe(200);
    expect(feed.body.data.items).toEqual([]);
    expect(routeProvider.callCount('computeRoute')).toBe(0);
  });

  // -------------------------------------------------------------------------
  test('S06 — a compatible partner inside the frozen radius sees the opportunity', async () => {
    const owner = await customer();
    const towRequest = (await createRequest(owner)).body.data;
    const eligible = await partner();

    const feed = await opportunities(eligible.auth);
    expect(feed.status).toBe(200);
    expect(feed.body.data.items).toHaveLength(1);
    const item = feed.body.data.items[0];
    expect(String(item.request.id)).toBe(String(towRequest.id));
    expect(item.compatibility).toEqual({
      compatible: true,
      vehicle_class_supported: true,
      weight_within_capacity: true,
    });
  });

  // -------------------------------------------------------------------------
  test('S07 — the Google route quote carries both legs and the authoritative total', async () => {
    const owner = await customer();
    const towRequest = (await createRequest(owner)).body.data;
    const eligible = await partner();

    const feed = await opportunities(eligible.auth);
    expect(feed.status).toBe(200);
    const item = feed.body.data.items[0];

    // ONE provider call, asked for provider -> pickup -> destination: the pickup
    // is the intermediate, so Google itself returns both leg boundaries.
    expect(routeProvider.callCount('computeRoute')).toBe(1);
    const call = routeProvider.lastCall('computeRoute').request;
    expect(call.pickup).toMatchObject({
      latitude: PICKUP.latitude,
      longitude: PICKUP.longitude,
    });
    expect(call.destination).toMatchObject({
      latitude: DESTINATION.latitude,
      longitude: DESTINATION.longitude,
    });
    expect(call.origin).toMatchObject({
      latitude: PICKUP.latitude,
      longitude: PICKUP.longitude,
    });

    // The authoritative total is the exact sum of the two provider legs.
    expect(item.route_quote.total_distance_meters).toBe(14350);
    expect(item.route_quote.total_duration_seconds).toBe(2100);
    expect(towRequest.id).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  test('S08 — pricing is computed server-side and cannot be supplied by the client', async () => {
    const owner = await customer();
    const towRequest = (await createRequest(owner)).body.data;
    const eligible = await partner();

    const feed = await opportunities(eligible.auth);
    const item = feed.body.data.items[0];

    // 14,350 m with a 10 km inclusion at 800 c/min beyond: 4350 m -> 3480 c.
    expect(item.proposed_price).toEqual({ amount_cents: 18480, currency: 'BRL' });

    const attempted = await request(app)
      .post(`${REQUESTS}/${towRequest.id}/proposals`)
      .set(eligible.auth.headers)
      .set('Idempotency-Key', nextKey('inject'))
      .send({ price_amount_cents: 1, proposed_price: { amount_cents: 1, currency: 'BRL' } });
    expect(attempted.status).toBe(422);
    expect(attempted.body.error.code).toBe('validation_error');

    const proposal = await propose(eligible.auth, towRequest.id);
    expect(proposal.status).toBe(201);
    expect(proposal.body.data.price).toEqual({ amount_cents: 18480, currency: 'BRL' });
  });

  // -------------------------------------------------------------------------
  test('S09 — one meter above the included distance is charged proportionally', async () => {
    // Exact boundary proof at the pricing authority: 10 km included, 1 m excess,
    // 800 c per additional km -> ROUND_HALF_UP(1 * 800 / 1000) = 1 cent.
    const { computeTowPrice } = require('../../../src/modules/tow/domain');
    const oneMeter = computeTowPrice({
      total_distance_meters: 10001,
      minimum_charge_cents: 15000,
      included_km: 10,
      price_per_additional_km_cents: 800,
    });
    expect(oneMeter.excess_meters).toBe(1);
    expect(oneMeter.variable_charge_cents).toBe(1);
    expect(oneMeter.final_price_cents).toBe(15001);
    // Never `ceil(excess_km)`: that would bill 800 c for the same meter.
    expect(oneMeter.final_price_cents).not.toBe(15800);

    // Half-way rounding only happens at the cent boundary.
    expect(computeTowPrice({
      total_distance_meters: 10625,
      minimum_charge_cents: 15000,
      included_km: 10,
      price_per_additional_km_cents: 800,
    }).variable_charge_cents).toBe(500);

    // And the same rule end-to-end: configure legs summing to exactly 10,001 m and
    // read the price the opportunity quotes.
    routeProvider.providerToPickup = { distance_meters: 5000, duration_seconds: 600 };
    routeProvider.pickupToDestination = { distance_meters: 5001, duration_seconds: 600 };
    const owner = await customer();
    await createRequest(owner);
    const eligible = await partner();

    const feed = await opportunities(eligible.auth);
    const item = feed.body.data.items[0];
    expect(item.route_quote.total_distance_meters).toBe(10001);
    expect(item.proposed_price.amount_cents).toBe(15001);
    expect(item.proposed_price.amount_cents).not.toBe(15800);
  });

  // -------------------------------------------------------------------------
  test('S10 — an eligible partner submits a proposal priced by the server', async () => {
    const owner = await customer();
    const towRequest = (await createRequest(owner)).body.data;
    const eligible = await partner();

    const response = await propose(eligible.auth, towRequest.id);
    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('ACTIVE');
    expect(response.body.data.price).toEqual({ amount_cents: 18480, currency: 'BRL' });
    expect(response.body.data.route_quote.total_distance_meters).toBe(14350);
    expect(String(response.body.data.partner_id)).toBe(String(eligible.partner.id));
  });

  // -------------------------------------------------------------------------
  test('S11 — two partners may propose and the request stays NEGOTIATING', async () => {
    const owner = await customer();
    const towRequest = (await createRequest(owner)).body.data;
    const first = await partner();
    const second = await partner();

    const firstProposal = await propose(first.auth, towRequest.id);
    const secondProposal = await propose(second.auth, towRequest.id);
    expect(firstProposal.status).toBe(201);
    expect(secondProposal.status).toBe(201);

    const recovery = await getRequest(app, towRequest.id, owner);
    expect(recovery.body.data.state).toBe('NEGOTIATING');

    // NEGOTIATING still permits another eligible proposal.
    const third = await partner();
    expect((await propose(third.auth, towRequest.id)).status).toBe(201);

    const listed = await request(app)
      .get(`${REQUESTS}/${towRequest.id}/proposals`)
      .set(owner.headers);
    expect(listed.status).toBe(200);
    expect(listed.body.data.items).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  test('S12 — the customer accepts one proposal and it becomes the winner', async () => {
    const owner = await customer();
    const towRequest = (await createRequest(owner)).body.data;
    const first = await partner();
    const second = await partner();
    const firstProposal = (await propose(first.auth, towRequest.id)).body.data;
    const secondProposal = (await propose(second.auth, towRequest.id)).body.data;

    const accepted = await accept(owner, firstProposal.id);
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.state).toBe('ASSIGNED');
    expect(String(accepted.body.data.assignment.partner_id)).toBe(String(first.partner.id));
    expect(accepted.body.data.assignment.final_price).toEqual({
      amount_cents: 18480,
      currency: 'BRL',
    });

    const winner = await testDb.db('tow_request_proposals').where({ id: firstProposal.id }).first();
    const loser = await testDb.db('tow_request_proposals').where({ id: secondProposal.id }).first();
    expect(winner.status).toBe('ACCEPTED');
    expect(loser.status).not.toBe('ACCEPTED');

    // The loser can no longer be accepted.
    expect((await accept(owner, secondProposal.id)).status).toBe(409);
  });

  // -------------------------------------------------------------------------
  test('S13 — two proposals cannot produce two assignments (PG authority: MVP-04 C1)', async () => {
    const owner = await customer();
    const towRequest = (await createRequest(owner)).body.data;
    const first = await partner();
    const second = await partner();
    const firstProposal = (await propose(first.auth, towRequest.id)).body.data;
    const secondProposal = (await propose(second.auth, towRequest.id)).body.data;

    // Offline this is the SEQUENTIAL authority: the first accept wins, the second
    // is rejected by the request-level guard and by UNIQUE(tow_request_id). The
    // true concurrent proof is MVP-04 C1 on real PostgreSQL, re-run against this
    // tree and cited by the readiness report.
    expect((await accept(owner, firstProposal.id)).status).toBe(200);
    const loser = await accept(owner, secondProposal.id);
    expect(loser.status).toBe(409);

    const assignmentRows = await testDb.db('tow_assignments').where({ tow_request_id: towRequest.id });
    expect(assignmentRows).toHaveLength(1);
    expect(String(assignmentRows[0].proposal_id)).toBe(String(firstProposal.id));

    // A replay of the winner returns the SAME assignment (never a second row).
    const replay = await accept(owner, firstProposal.id);
    expect(replay.status).toBe(200);
    expect(await testDb.db('tow_assignments').where({ tow_request_id: towRequest.id })).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  test('S14 — the assigned partner starts EN_ROUTE', async () => {
    const owner = await customer();
    const towRequest = (await createRequest(owner)).body.data;
    const assigned = await partner();
    const proposal = (await propose(assigned.auth, towRequest.id)).body.data;
    await accept(owner, proposal.id);

    const response = await milestone(assigned.auth, towRequest.id, 'en-route');
    expect(response.status).toBe(200);
    expect(response.body.data.state).toBe('EN_ROUTE');
  });

  // -------------------------------------------------------------------------
  test('S15 — the assigned partner marks ARRIVED', async () => {
    const owner = await customer();
    const towRequest = (await createRequest(owner)).body.data;
    const assigned = await partner();
    const proposal = (await propose(assigned.auth, towRequest.id)).body.data;
    await accept(owner, proposal.id);
    await milestone(assigned.auth, towRequest.id, 'en-route');

    const response = await milestone(assigned.auth, towRequest.id, 'arrived', {
      location: { latitude: PICKUP.latitude, longitude: PICKUP.longitude },
    });
    expect(response.status).toBe(200);
    expect(response.body.data.state).toBe('ARRIVED');
  });

  // -------------------------------------------------------------------------
  test('S16 — the assigned partner starts IN_TRANSIT', async () => {
    const owner = await customer();
    const towRequest = (await createRequest(owner)).body.data;
    const assigned = await partner();
    const proposal = (await propose(assigned.auth, towRequest.id)).body.data;
    await accept(owner, proposal.id);
    await milestone(assigned.auth, towRequest.id, 'en-route');
    await milestone(assigned.auth, towRequest.id, 'arrived', {
      location: { latitude: PICKUP.latitude, longitude: PICKUP.longitude },
    });

    const response = await milestone(assigned.auth, towRequest.id, 'in-transit');
    expect(response.status).toBe(200);
    expect(response.body.data.state).toBe('IN_TRANSIT');
  });

  // -------------------------------------------------------------------------
  test('S17 — the assigned partner writes the current point and only the right reader sees it', async () => {
    const owner = await customer();
    const towRequest = (await createRequest(owner)).body.data;
    const assigned = await partner();
    const other = await partner();
    const proposal = (await propose(assigned.auth, towRequest.id)).body.data;
    await accept(owner, proposal.id);
    await milestone(assigned.auth, towRequest.id, 'en-route');

    const point = {
      latitude: -23.564,
      longitude: -46.652,
      recorded_at: '2026-01-15T12:05:00.000Z',
    };
    const written = await request(app)
      .post(`${REQUESTS}/${towRequest.id}/tracking`)
      .set(assigned.auth.headers)
      .set('Idempotency-Key', nextKey('track'))
      .send(point);
    expect(written.status).toBe(202);
    expect(written.body.data.latitude).toBe(point.latitude);

    const ownerRead = await request(app)
      .get(`${REQUESTS}/${towRequest.id}/tracking`)
      .set(owner.headers);
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body.data.latest.latitude).toBe(point.latitude);

    const foreignCustomer = await customer();
    const foreignRead = await request(app)
      .get(`${REQUESTS}/${towRequest.id}/tracking`)
      .set(foreignCustomer.headers);
    expect(foreignRead.status).toBe(403);

    const foreignPartnerRead = await request(app)
      .get(`${REQUESTS}/${towRequest.id}/tracking`)
      .set(other.auth.headers);
    expect(foreignPartnerRead.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  test('S18 — the assigned partner completes the service and the assignment is released', async () => {
    const owner = await customer();
    const towRequest = (await createRequest(owner)).body.data;
    const assigned = await partner();
    const proposal = (await propose(assigned.auth, towRequest.id)).body.data;
    await accept(owner, proposal.id);
    await milestone(assigned.auth, towRequest.id, 'en-route');
    await milestone(assigned.auth, towRequest.id, 'arrived', {
      location: { latitude: PICKUP.latitude, longitude: PICKUP.longitude },
    });
    await milestone(assigned.auth, towRequest.id, 'in-transit');

    const response = await milestone(assigned.auth, towRequest.id, 'finish', {
      location: { latitude: DESTINATION.latitude, longitude: DESTINATION.longitude },
    });
    expect(response.status).toBe(200);
    expect(response.body.data.state).toBe('COMPLETED');

    const assignment = await testDb.db('tow_assignments').where({ tow_request_id: towRequest.id }).first();
    expect(assignment.released_at).toBeTruthy();
    expect(assignment.release_reason).toBe('COMPLETED');
    // Historical authority is retained, not deleted.
    expect(Number(assignment.final_price_amount_cents)).toBe(18480);

    // The partner and the vehicle can be used again.
    const vehicle = await testDb.db('tow_vehicles').where({ id: assignment.tow_vehicle_id }).first();
    expect(Boolean(vehicle.active)).toBe(true);
    expect((await request(app).get('/api/tow/partner/jobs').set(assigned.auth.headers)).status).toBe(200);
  });

  // -------------------------------------------------------------------------
  test('S19 — cash confirmation under retry records exactly one payment', async () => {
    const owner = await customer();
    const towRequest = (await createRequest(owner)).body.data;
    const assigned = await partner();
    const proposal = (await propose(assigned.auth, towRequest.id)).body.data;
    const assignedRequest = (await accept(owner, proposal.id)).body.data;
    await milestone(assigned.auth, towRequest.id, 'en-route');
    await milestone(assigned.auth, towRequest.id, 'arrived', {
      location: { latitude: PICKUP.latitude, longitude: PICKUP.longitude },
    });
    await milestone(assigned.auth, towRequest.id, 'in-transit');
    await milestone(assigned.auth, towRequest.id, 'finish', {
      location: { latitude: DESTINATION.latitude, longitude: DESTINATION.longitude },
    });

    const first = await cashReceived(app, towRequest.id, assigned.auth, {
      key: CASH_RECEIVED_IDEMPOTENCY_KEY,
    });
    expect(first.status).toBe(200);
    const frozenReceivedAt = (await paymentRows(testDb.db, towRequest.id))[0].received_at;

    clock.advanceMinutes(11);
    const sameKey = await cashReceived(app, towRequest.id, assigned.auth, {
      key: CASH_RECEIVED_IDEMPOTENCY_KEY,
    });
    const otherKey = await cashReceived(app, towRequest.id, assigned.auth, {
      key: CASH_RECEIVED_ALTERNATE_KEY,
    });
    expect(sameKey.status).toBe(200);
    expect(otherKey.status).toBe(200);
    expect(otherKey.body.data).toEqual(first.body.data);

    const rows = await paymentRows(testDb.db, towRequest.id);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].received_at)).toBe(String(frozenReceivedAt));
    expect(Number(rows[0].amount_cents)).toBe(
      assignedRequest.assignment.final_price.amount_cents
    );

    // Real-concurrency authority: MVP-06 F1/F2 on PostgreSQL.
  });

  // -------------------------------------------------------------------------
  test('S20 — full happy path: request -> proposal -> assignment -> tracking -> COMPLETED -> CASH -> recovery', async () => {
    const owner = await customer();
    const assigned = await partner();
    const second = await partner();

    const towRequest = (await createRequest(owner)).body.data;
    expect(towRequest.state).toBe('SEARCHING');

    // matching + quote + server price
    const feed = await opportunities(assigned.auth);
    expect(feed.status).toBe(200);
    const opportunity = feed.body.data.items[0];
    expect(String(opportunity.request.id)).toBe(String(towRequest.id));
    expect(opportunity.proposed_price.amount_cents).toBe(18480);

    // two proposals
    const winningProposal = (await propose(assigned.auth, towRequest.id)).body.data;
    const losingProposal = (await propose(second.auth, towRequest.id)).body.data;
    expect(winningProposal.id).toBeTruthy();
    expect(losingProposal.id).toBeTruthy();

    // accept -> atomic assignment
    const assignedRequest = (await accept(owner, winningProposal.id)).body.data;
    expect(assignedRequest.state).toBe('ASSIGNED');
    const assignment = await testDb.db('tow_assignments').where({ tow_request_id: towRequest.id }).first();

    // cash selected before execution
    const selected = await selectPaymentMethod(app, towRequest.id, owner, {
      key: PAYMENT_METHOD_IDEMPOTENCY_KEY,
    });
    expect(selected.status).toBe(200);
    expect(selected.body.data.status).toBe('CASH_SELECTED');
    expect(selected.body.data.amount_cents).toBe(
      Number(assignment.final_price_amount_cents)
    );

    // execution + tracking
    expect((await milestone(assigned.auth, towRequest.id, 'en-route')).body.data.state).toBe('EN_ROUTE');
    const trackingPoint = {
      latitude: -23.562, longitude: -46.654, recorded_at: '2026-01-15T12:03:00.000Z',
    };
    const tracked = await request(app)
      .post(`${REQUESTS}/${towRequest.id}/tracking`)
      .set(assigned.auth.headers)
      .set('Idempotency-Key', nextKey('s20-track'))
      .send(trackingPoint);
    expect(tracked.status).toBe(202);

    expect((await milestone(assigned.auth, towRequest.id, 'arrived', {
      location: { latitude: PICKUP.latitude, longitude: PICKUP.longitude },
    })).body.data.state).toBe('ARRIVED');
    expect((await milestone(assigned.auth, towRequest.id, 'in-transit')).body.data.state).toBe('IN_TRANSIT');
    const trackingLater = {
      latitude: -23.63, longitude: -46.56, recorded_at: '2026-01-15T12:20:00.000Z',
    };
    expect((await request(app)
      .post(`${REQUESTS}/${towRequest.id}/tracking`)
      .set(assigned.auth.headers)
      .set('Idempotency-Key', nextKey('s20-track'))
      .send(trackingLater)).status).toBe(202);

    const completed = await milestone(assigned.auth, towRequest.id, 'finish', {
      location: { latitude: DESTINATION.latitude, longitude: DESTINATION.longitude },
    });
    expect(completed.body.data.state).toBe('COMPLETED');

    // CASH received exactly once
    const cash = await cashReceived(app, towRequest.id, assigned.auth, {
      key: CASH_RECEIVED_IDEMPOTENCY_KEY,
    });
    expect(cash.status).toBe(200);
    expect(cash.body.data.status).toBe('CASH_RECEIVED');

    // continuity: every id resolves the SAME logical Tow
    const payment = (await paymentRows(testDb.db, towRequest.id))[0];
    expect(Number(payment.tow_request_id)).toBe(Number(towRequest.id));
    expect(Number(payment.assignment_id)).toBe(Number(assignment.id));
    expect(Number(payment.amount_cents)).toBe(Number(assignment.final_price_amount_cents));
    expect(Number(payment.received_by_partner_id)).toBe(Number(assigned.partner.id));
    expect(Number(assignment.proposal_id)).toBe(Number(winningProposal.id));

    // customer recovery
    const recovered = await getRequest(app, towRequest.id, owner);
    expect(recovered.status).toBe(200);
    expect(recovered.body.data.state).toBe('COMPLETED');
    expect(recovered.body.data.assignment.final_price.amount_cents).toBe(18480);
    expect(recovered.body.data.payment.status).toBe('CASH_RECEIVED');
    expect(recovered.body.data.payment.amount_cents).toBe(18480);

    const paymentRecovery = await getPayment(app, towRequest.id, owner);
    expect(paymentRecovery.status).toBe(200);
    expect(paymentRecovery.body.data).toEqual(recovered.body.data.payment);

    // partner historical recovery
    const jobs = await request(app).get('/api/tow/partner/jobs').set(assigned.auth.headers);
    const job = jobs.body.data.items.find((item) => String(item.id) === String(towRequest.id));
    expect(job).toBeTruthy();
    expect(job.state).toBe('COMPLETED');
    expect(job.payment.status).toBe('CASH_RECEIVED');
    expect(job.assignment.final_price.amount_cents).toBe(18480);
  });
});
