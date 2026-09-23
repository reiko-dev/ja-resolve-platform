/**
 * MVP-06 — CASH payment: canonical authority, authz, idempotency, rehydration.
 *
 * RED-first: written before the migration, the repository, the service, the
 * routes and the SQLite mirror exist. Every test below is a real failing proof
 * of the MVP-06 invariants until the implementation lands.
 *
 * The suite drives the REAL HTTP surface (a listening server, same convention
 * as the MVP-05 API suite — the per-request ephemeral server is what produces
 * this repository's documented stale-401 / `socket hang up` transport artifacts
 * in a full-suite run).
 *
 * Concurrency (F1–F6) is certified on real PostgreSQL in
 * `towMvp06Postgres.e2e.test.js`; SQLite has a single connection.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const {
  PAYMENT_METHOD_IDEMPOTENCY_KEY,
  CASH_RECEIVED_IDEMPOTENCY_KEY,
  CASH_RECEIVED_ALTERNATE_KEY,
  createMvp06Services,
  selectPaymentMethod,
  cashReceived,
  getPayment,
  paymentRow,
  paymentRows,
  createCompletedScenario,
  driveTo,
  getRequest,
  listPartnerJobs,
} = require('../../helpers/tow/mvp06');
const { createAssignedScenario } = require('../../helpers/tow/mvp05');
const { createCanonicalRequest } = require('../../helpers/tow/mvp03');
const { createTowCustomerAuth } = require('../../helpers/tow/auth');

describe('MVP-06 — CASH payment', () => {
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

  async function assigned(options = {}) {
    return createAssignedScenario({ app, services, clock, ...options });
  }

  async function completed(options = {}) {
    return createCompletedScenario({ app, services, clock, ...options });
  }

  describe('RED-MVP06-1 — cash confirmation endpoint', () => {
    test('the assigned partner confirms cash on a COMPLETED tow and gets the receipt', async () => {
      const fixture = await completed();
      const response = await cashReceived(app, fixture.request.id, fixture.auths[0]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        request_id: String(fixture.request.id),
        method: 'cash',
        status: 'CASH_RECEIVED',
        currency: 'BRL',
        pix: null,
      });
      expect(response.body.data.amount_cents).toBe(fixture.assigned.assignment.final_price.amount_cents);
    });

    test('the confirmation is rejected while the tow is not COMPLETED', async () => {
      const fixture = await assigned();

      // The payment already exists (materialized at accept as PENDING); the
      // rejected confirmation must not transition it.
      const before = await paymentRow(testDb.db, fixture.request.id);
      expect(String(before.status)).toBe('PENDING');

      const response = await cashReceived(app, fixture.request.id, fixture.auths[0]);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('invalid_tow_state');

      const row = await paymentRow(testDb.db, fixture.request.id);
      expect(String(row.status)).toBe('PENDING');
      expect(row.received_at).toBeNull();
      expect(row.received_by_partner_id).toBeNull();
    });
  });

  describe('RED-MVP06-2 — canonical cash authority', () => {
    test('exactly one payment row exists, frozen at the assignment final price', async () => {
      const fixture = await completed();
      const expectedCents = fixture.assigned.assignment.final_price.amount_cents;
      const assignment = await services.assignmentRepository.findByRequestId(fixture.request.id);

      const response = await cashReceived(app, fixture.request.id, fixture.auths[0]);
      expect(response.status).toBe(200);

      const rows = await paymentRows(testDb.db, fixture.request.id);
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(Number(row.tow_request_id)).toBe(Number(fixture.request.id));
      expect(Number(row.assignment_id)).toBe(Number(assignment.id));
      expect(String(row.method)).toBe('CASH');
      expect(Number(row.amount_cents)).toBe(expectedCents);
      expect(String(row.currency)).toBe('BRL');
      expect(String(row.status)).toBe('RECEIVED');
      expect(Number(row.received_by_partner_id)).toBe(Number(fixture.partners[0].partner.id));
      expect(row.received_at).toBeTruthy();
      expect(new Date(row.received_at).toISOString()).toBe(clock.isoNow());
    });

    test('a client-supplied amount is rejected and never becomes authority', async () => {
      const fixture = await completed();
      const assignment = await services.assignmentRepository.findByRequestId(fixture.request.id);

      const response = await cashReceived(app, fixture.request.id, fixture.auths[0], {
        body: { amount_cents: 1, currency: 'BRL' },
      });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('validation_error');
      const row = await paymentRow(testDb.db, fixture.request.id);
      expect(String(row.status)).toBe('PENDING');
      expect(Number(row.amount_cents)).toBe(Number(assignment.final_price_amount_cents));
      expect(Number(row.amount_cents)).not.toBe(1);
    });
  });

  describe('RED-MVP06-3 — authz', () => {
    test('another partner cannot confirm cash', async () => {
      const fixture = await completed({ partnerCount: 2 });
      const response = await cashReceived(app, fixture.request.id, fixture.auths[1]);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('not_assigned_partner');
      const row = await paymentRow(testDb.db, fixture.request.id);
      expect(String(row.status)).toBe('PENDING');
      expect(row.received_at).toBeNull();
    });

    test('the customer cannot confirm cash', async () => {
      const fixture = await completed();
      const response = await cashReceived(app, fixture.request.id, fixture.customerAuth);

      expect(response.status).toBe(403);
      const row = await paymentRow(testDb.db, fixture.request.id);
      expect(String(row.status)).toBe('PENDING');
      expect(row.received_at).toBeNull();
    });

    test('an anonymous caller is rejected', async () => {
      const fixture = await completed();
      const response = await cashReceived(app, fixture.request.id, null, { auth: null, key: null });

      expect(response.status).toBe(401);
      const row = await paymentRow(testDb.db, fixture.request.id);
      expect(String(row.status)).toBe('PENDING');
      expect(row.received_at).toBeNull();
    });

    test('an unknown request is 404 and a non-canonical id is 404', async () => {
      const fixture = await completed();
      const unknown = await cashReceived(app, '99999999', fixture.auths[0]);
      expect(unknown.status).toBe(404);

      const garbage = await cashReceived(app, 'not-an-id', fixture.auths[0]);
      expect(garbage.status).toBe(404);
    });

    test('the customer can read their own payment and a foreign customer cannot', async () => {
      const fixture = await completed();
      await cashReceived(app, fixture.request.id, fixture.auths[0]);

      const own = await getPayment(app, fixture.request.id, fixture.customerAuth);
      expect(own.status).toBe(200);
      expect(own.body.data.status).toBe('CASH_RECEIVED');

      const foreign = await createTowCustomerAuth();
      const denied = await getPayment(app, fixture.request.id, foreign);
      expect(denied.status).toBe(403);
    });
  });

  describe('RED-MVP06-4 — amount rehydration', () => {
    test('the payment endpoint rehydrates the accepted amount, not a recalculation', async () => {
      const fixture = await completed();
      const expectedCents = fixture.assigned.assignment.final_price.amount_cents;
      await cashReceived(app, fixture.request.id, fixture.auths[0]);

      const response = await getPayment(app, fixture.request.id, fixture.customerAuth);
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        request_id: String(fixture.request.id),
        method: 'cash',
        status: 'CASH_RECEIVED',
        amount_cents: expectedCents,
        currency: 'BRL',
        can_start_service: true,
        pix: null,
      });
    });

    test('TowRequest.payment is truthful after the customer selects cash', async () => {
      const fixture = await assigned();
      const selected = await selectPaymentMethod(app, fixture.request.id, fixture.customerAuth);

      expect(selected.status).toBe(200);
      expect(selected.body.data).toMatchObject({
        method: 'cash',
        status: 'CASH_SELECTED',
        amount_cents: fixture.assigned.assignment.final_price.amount_cents,
        currency: 'BRL',
        can_start_service: true,
      });

      const recovery = await getRequest(app, fixture.request.id, fixture.customerAuth);
      expect(recovery.status).toBe(200);
      expect(recovery.body.data.payment).toEqual(selected.body.data);
    });

    test('a request with no payment reports NOT_SELECTED with a null amount', async () => {
      // Since the Tow round the payment is materialized at ACCEPT, so the
      // truthful NOT_SELECTED projection belongs to the pre-assignment request
      // (there is no assignment_id and no frozen final price yet).
      const fixture = await assigned();
      const { request: openRequest } = await createCanonicalRequest({
        services,
        customer: fixture.customer,
        clock,
        idempotencyKey: 'idem-mvp06-open-000001',
      });

      const response = await getPayment(app, openRequest.id, fixture.customerAuth);
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        request_id: String(openRequest.id),
        method: null,
        status: 'NOT_SELECTED',
        amount_cents: null,
        currency: null,
        can_start_service: false,
        pix: null,
      });
    });

    test('the assigned partner recovers the cash state through the job list', async () => {
      const fixture = await completed();
      await cashReceived(app, fixture.request.id, fixture.auths[0]);

      const jobs = await listPartnerJobs(app, fixture.auths[0]);
      expect(jobs.status).toBe(200);
      const job = jobs.body.data.items.find((item) => String(item.id) === String(fixture.request.id));
      expect(job).toBeTruthy();
      expect(job.payment).toEqual({
        request_id: String(fixture.request.id),
        method: 'cash',
        status: 'CASH_RECEIVED',
        amount_cents: fixture.assigned.assignment.final_price.amount_cents,
        currency: 'BRL',
        can_start_service: true,
        pix: null,
      });
    });
  });

  describe('RED-MVP06-5 — retry semantics', () => {
    test('the same key retried returns the same payment and never restamps received_at', async () => {
      const fixture = await completed();
      const first = await cashReceived(app, fixture.request.id, fixture.auths[0]);
      expect(first.status).toBe(200);

      const rowAfterFirst = await paymentRow(testDb.db, fixture.request.id);
      clock.advanceMinutes(5);

      const retry = await cashReceived(app, fixture.request.id, fixture.auths[0]);
      expect(retry.status).toBe(200);
      expect(retry.body.data).toEqual(first.body.data);

      const rowAfterRetry = await paymentRow(testDb.db, fixture.request.id);
      expect(String(rowAfterRetry.received_at)).toBe(String(rowAfterFirst.received_at));
      expect(await paymentRows(testDb.db, fixture.request.id)).toHaveLength(1);
    });

    test('a DIFFERENT valid key still returns the same canonical payment', async () => {
      const fixture = await completed();
      const first = await cashReceived(app, fixture.request.id, fixture.auths[0], {
        key: CASH_RECEIVED_IDEMPOTENCY_KEY,
      });
      const retry = await cashReceived(app, fixture.request.id, fixture.auths[0], {
        key: CASH_RECEIVED_ALTERNATE_KEY,
      });

      expect(retry.status).toBe(200);
      expect(retry.body.data).toEqual(first.body.data);
      expect(await paymentRows(testDb.db, fixture.request.id)).toHaveLength(1);
    });

    test('selecting cash twice is idempotent and never duplicates the row', async () => {
      const fixture = await assigned();
      const first = await selectPaymentMethod(app, fixture.request.id, fixture.customerAuth);
      const second = await selectPaymentMethod(app, fixture.request.id, fixture.customerAuth, {
        key: PAYMENT_METHOD_IDEMPOTENCY_KEY,
      });

      expect(second.status).toBe(200);
      expect(second.body.data).toEqual(first.body.data);
      expect(await paymentRows(testDb.db, fixture.request.id)).toHaveLength(1);
    });
  });

  describe('payment method selection', () => {
    test('card and pix are not implemented in the MVP subset', async () => {
      const fixture = await assigned();
      // The canonical payment was materialized at accept; the rejected legacy
      // selections must not touch it.
      expect(await paymentRows(testDb.db, fixture.request.id)).toHaveLength(1);
      for (const method of ['card', 'pix']) {
        const response = await selectPaymentMethod(app, fixture.request.id, fixture.customerAuth, {
          method,
          key: `idem-mvp06-unsupported-${method}`,
        });
        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe('validation_error');
      }
      const rows = await paymentRows(testDb.db, fixture.request.id);
      expect(rows).toHaveLength(1);
      expect(String(rows[0].status)).toBe('PENDING');
    });

    test('a foreign customer cannot select the method and an anonymous caller is rejected', async () => {
      const fixture = await assigned();
      const foreign = await createTowCustomerAuth();

      const denied = await selectPaymentMethod(app, fixture.request.id, foreign);
      expect(denied.status).toBe(403);

      const anon = await selectPaymentMethod(app, fixture.request.id, null, { auth: null });
      expect(anon.status).toBe(401);

      const unknown = await selectPaymentMethod(app, '99999999', fixture.customerAuth);
      expect(unknown.status).toBe(404);
    });

    test('cash can be selected while the job is in progress, before COMPLETED', async () => {
      const fixture = await assigned();
      await driveTo(app, fixture, 'EN_ROUTE');
      const response = await selectPaymentMethod(app, fixture.request.id, fixture.customerAuth);

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('CASH_SELECTED');
    });

    test('cash cannot be selected before any assignment exists (historical path)', async () => {
      const fixture = await completed();
      // Rewind the canonical row to the pre-assignment shape the runtime can
      // actually produce: `SEARCHING` with no milestones and no assignment.
      // The payment row is removed too: this models a HISTORICAL request, which
      // is the only shape that reaches the legacy create path now that the
      // accept materializes the payment from the commercial choice.
      await testDb.db('tow_requests').where({ id: fixture.request.id }).update({
        state: 'SEARCHING',
        completed_at: null,
        in_transit_at: null,
        arrived_at: null,
        en_route_at: null,
      });
      await testDb.db('tow_assignments').where({ tow_request_id: fixture.request.id }).del();
      await testDb.db('tow_payments').where({ tow_request_id: fixture.request.id }).del();

      const response = await selectPaymentMethod(app, fixture.request.id, fixture.customerAuth);
      expect(response.status).toBe(409);
      expect(await paymentRows(testDb.db, fixture.request.id)).toHaveLength(0);
    });
  });

  describe('canonical uniqueness recovery', () => {
    test('a duplicate insert inside a transaction returns the winner instead of crashing', async () => {
      const fixture = await completed();
      const confirmed = await cashReceived(app, fixture.request.id, fixture.auths[0]);
      expect(confirmed.status).toBe(200);

      const assignment = await services.assignmentRepository.findByRequestId(fixture.request.id);
      const canonical = (await paymentRows(testDb.db, fixture.request.id))[0];

      // The exact repository call a concurrent loser would make. On PostgreSQL
      // this is where the failed INSERT must NOT poison the transaction: the
      // savepoint contains the 23505 and the winner lookup succeeds. (Adversarial
      // review finding M6-01.)
      const outcome = await services.towPaymentRepository.createForAssignment({
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

      expect(outcome.conflict).not.toBeNull();
      expect(outcome.row).toBeTruthy();
      expect(Number(outcome.row.id)).toBe(Number(canonical.id));
      expect(Number(outcome.row.amount_cents)).toBe(Number(confirmed.body.data.amount_cents));
      expect(String(outcome.row.status)).toBe('RECEIVED');
      expect(await paymentRows(testDb.db, fixture.request.id)).toHaveLength(1);
    });
  });

  describe('RED-MVP06-6 — no external PSP is ever called', () => {
    test('the whole CASH flow makes zero gateway calls', async () => {
      const stripe = require('../../../src/services/gateways/stripeGateway');
      const mercadoPago = require('../../../src/services/gateways/mercadopagoGateway');
      const pagSeguro = require('../../../src/services/gateways/pagseguroGateway');
      const legacyPaymentService = require('../../../src/services/paymentService');

      const spies = [
        jest.spyOn(stripe, 'processPayment'),
        jest.spyOn(mercadoPago, 'processPayment'),
        jest.spyOn(pagSeguro, 'processPayment'),
        jest.spyOn(legacyPaymentService, 'processPayment'),
        jest.spyOn(legacyPaymentService, 'confirmPayment'),
        jest.spyOn(legacyPaymentService, 'createTowEmergencyPayment'),
      ];

      try {
        const fixture = await completed();
        const selected = await selectPaymentMethod(app, fixture.request.id, fixture.customerAuth);
        expect(selected.status).toBe(200);
        const confirmed = await cashReceived(app, fixture.request.id, fixture.auths[0]);
        expect(confirmed.status).toBe(200);

        for (const spy of spies) {
          expect(spy).not.toHaveBeenCalled();
        }
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    });
  });

  describe('terminal states', () => {
    test('a cancelled tow can never receive cash', async () => {
      const fixture = await assigned();
      await selectPaymentMethod(app, fixture.request.id, fixture.customerAuth);

      const cancelled = await require('../../helpers/tow/mvp05').cancelByCustomer(
        app, fixture.request.id, fixture.customerAuth
      );
      expect(cancelled.status).toBe(200);

      const response = await cashReceived(app, fixture.request.id, fixture.auths[0]);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('invalid_tow_state');

      const row = await paymentRow(testDb.db, fixture.request.id);
      expect(String(row.status)).toBe('PENDING');
    });

    test('a completed tow keeps its historical payment readable after release', async () => {
      const fixture = await completed();
      await cashReceived(app, fixture.request.id, fixture.auths[0]);

      const assignment = await testDb.db('tow_assignments')
        .where({ tow_request_id: fixture.request.id }).first();
      expect(assignment.released_at).toBeTruthy();

      const response = await getPayment(app, fixture.request.id, fixture.customerAuth);
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('CASH_RECEIVED');
      expect(response.body.data.amount_cents).toBe(Number(assignment.final_price_amount_cents));
    });
  });
});
