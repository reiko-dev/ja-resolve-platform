/**
 * MVP-06 — Gauntlet attack pass.
 *
 * Active attempts to BREAK the CASH payment surface, beyond the happy-path and
 * the documented authz matrix. Every test here either proves the attack fails or
 * documents an intentional boundary decision.
 *
 * The attacks are:
 *   A1  currency injection on the bodyless confirmation
 *   A2  amount injection through the query string
 *   A3  module disabled AFTER the job is COMPLETED (graceful drain boundary)
 *   A4  process restart: rehydrate the payment from persistence with a brand-new
 *       composition root and a brand-new HTTP server
 *   A5  two proposals accepted, then cash confirmed — the payment must stay tied
 *       to the WINNER's assignment, never the loser's
 *   A6  a malformed / too-short Idempotency-Key inserts nothing
 *   A7  the assigned partner cannot select the method (customer-only operation)
 *   A8  a payment read by a non-assigned partner is 403, and the DTO never leaks
 *       another partner's id
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { buildTowServices } = require('../../../src/modules/tow/composition');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const {
  createMvp06Services,
  selectPaymentMethod,
  cashReceived,
  getPayment,
  paymentRows,
  createCompletedScenario,
} = require('../../helpers/tow/mvp06');
const { createAssignedScenario } = require('../../helpers/tow/mvp05');
const { createTowCustomerAuth } = require('../../helpers/tow/auth');
const { authFor } = require('../../helpers/tow/mvp04');

describe('MVP-06 — Gauntlet attack pass', () => {
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
    clock.reset();
  });

  const completed = (options = {}) => createCompletedScenario({ app, services, clock, ...options });

  test('A1 — a currency injection on the bodyless confirmation is rejected', async () => {
    const fixture = await completed();
    const response = await cashReceived(app, fixture.request.id, fixture.auths[0], {
      body: { currency: 'USD' },
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('validation_error');
    expect(await paymentRows(testDb.db, fixture.request.id)).toHaveLength(0);
  });

  test('A2 — an amount in the query string cannot change the authoritative amount', async () => {
    const fixture = await completed();
    const response = await require('supertest')(app)
      .post(`/api/tow/requests/${fixture.request.id}/cash-received?amount_cents=1&currency=USD`)
      .set(fixture.auths[0].headers)
      .set('Idempotency-Key', 'gauntlet-a2-cash-0001')
      .send();

    expect(response.status).toBe(200);
    expect(response.body.data.amount_cents).toBe(
      fixture.assigned.assignment.final_price.amount_cents
    );
    expect(response.body.data.amount_cents).not.toBe(1);
    expect(response.body.data.currency).toBe('BRL');
  });

  test('A3 — a module disabled after COMPLETED still allows the cash receipt (graceful drain)', async () => {
    const fixture = await completed();

    await services.moduleService.setEnabled({ enabled: false, reason: 'Gauntlet A3 drain' });

    // DRAIN work on an already-finished job is not new business: the receipt is
    // still confirmable, exactly like the MVP-05 execution milestones.
    const response = await cashReceived(app, fixture.request.id, fixture.auths[0]);
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('CASH_RECEIVED');

    // New business stays blocked.
    const blocked = await require('supertest')(app)
      .post('/api/tow/requests')
      .set(fixture.customerAuth.headers)
      .set('Idempotency-Key', 'gauntlet-a3-create-01')
      .send({
        pickup: { latitude: -23.561684, longitude: -46.655981 },
        destination: { latitude: -23.6639, longitude: -46.531 },
        vehicle: { class: 'light_vehicle', make: 'Fiat', model: 'Argo', year: 2021, weight_kg: 1200 },
        problem_description: 'Gauntlet A3',
      });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('service_module_disabled');

    // Restore enabled: a suite must never leak a globally-disabled module into
    // another suite that shares the harness.
    const restored = await services.moduleService.setEnabled({ enabled: true, reason: 'Gauntlet A3 restore' });
    expect(restored.enabled).toBe(true);
  });

  test('A4 — the payment survives a process restart and rehydrates from persistence', async () => {
    const fixture = await completed();
    const confirmed = await cashReceived(app, fixture.request.id, fixture.auths[0]);
    expect(confirmed.status).toBe(200);

    // A brand-new composition root and a brand-new HTTP server: no in-memory
    // payment state is shared with the instance that wrote the row.
    const restartedServices = buildTowServices({ db: testDb.db, clock, routeProvider });
    const restartedApp = createApp({ tow: { clock, routeProvider } }).listen(0);
    try {
      const summary = await restartedServices.paymentService.getSummary({
        requestId: fixture.request.id,
        customerId: fixture.customer.id,
      });
      expect(summary).toEqual(confirmed.body.data);

      const restartedRead = await require('supertest')(restartedApp)
        .get(`/api/tow/requests/${fixture.request.id}/payment`)
        .set(fixture.customerAuth.headers);
      expect(restartedRead.status).toBe(200);
      expect(restartedRead.body.data).toEqual(confirmed.body.data);

      const rows = await paymentRows(testDb.db, fixture.request.id);
      expect(rows).toHaveLength(1);
    } finally {
      await new Promise((resolve) => { restartedApp.closeAllConnections?.(); restartedApp.close(resolve); });
    }
  });

  test('A5 — cash stays tied to the winning assignment, never to the losing proposal', async () => {
    const fixture = await completed({ partnerCount: 2 });
    const assignment = await services.assignmentRepository.findByRequestId(fixture.request.id);

    const confirmed = await cashReceived(app, fixture.request.id, fixture.auths[0]);
    expect(confirmed.status).toBe(200);

    const row = (await paymentRows(testDb.db, fixture.request.id))[0];
    expect(Number(row.assignment_id)).toBe(Number(assignment.id));
    expect(Number(row.received_by_partner_id)).toBe(Number(fixture.partners[0].partner.id));
    expect(Number(row.received_by_partner_id)).not.toBe(Number(fixture.partners[1].partner.id));
  });

  test('A6 — a malformed Idempotency-Key inserts nothing on both writes', async () => {
    const fixture = await completed();

    const short = await cashReceived(app, fixture.request.id, fixture.auths[0], { key: 'short' });
    expect(short.status).toBe(422);
    expect(short.body.error.code).toBe('validation_error');
    expect(await paymentRows(testDb.db, fixture.request.id)).toHaveLength(0);

    const missing = await require('supertest')(app)
      .post(`/api/tow/requests/${fixture.request.id}/cash-received`)
      .set(fixture.auths[0].headers)
      .send();
    expect(missing.status).toBe(422);
    expect(await paymentRows(testDb.db, fixture.request.id)).toHaveLength(0);

    const assignedFixture = await createAssignedScenario({ app, services, clock });
    const shortSelect = await selectPaymentMethod(app, assignedFixture.request.id, assignedFixture.customerAuth, {
      key: 'nope',
    });
    expect(shortSelect.status).toBe(422);
    expect(await paymentRows(testDb.db, assignedFixture.request.id)).toHaveLength(0);
  });

  test('A7 — the assigned partner cannot select the payment method (customer-only)', async () => {
    const fixture = await createAssignedScenario({ app, services, clock });
    const response = await selectPaymentMethod(app, fixture.request.id, fixture.auths[0]);
    expect(response.status).toBe(403);
    expect(await paymentRows(testDb.db, fixture.request.id)).toHaveLength(0);
  });

  test('A8 — a non-assigned partner cannot read the payment and sees no partner id', async () => {
    const fixture = await completed({ partnerCount: 2 });
    const confirmed = await cashReceived(app, fixture.request.id, fixture.auths[0]);

    const denied = await getPayment(app, fixture.request.id, fixture.auths[1]);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('not_assigned_partner');

    // The sanitized summary never carries an actor id field at all.
    for (const key of ['received_by_partner_id', 'partner_id', 'received_by']) {
      expect(confirmed.body.data).not.toHaveProperty(key);
    }

    const foreignCustomer = await createTowCustomerAuth();
    expect((await getPayment(app, fixture.request.id, foreignCustomer)).status).toBe(403);
  });

  test('A9 — the payment DTO exposes no internal identity beyond the public ids', async () => {
    const fixture = await completed();
    const response = await cashReceived(app, fixture.request.id, fixture.auths[0]);

    expect(Object.keys(response.body.data).sort()).toEqual([
      'amount_cents', 'can_start_service', 'currency', 'method', 'pix', 'request_id', 'status',
    ]);
  });
});
