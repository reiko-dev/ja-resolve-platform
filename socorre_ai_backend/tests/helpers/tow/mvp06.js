/**
 * MVP-06 — fixtures for the CASH payment flow and the lean readiness gate.
 *
 * Deterministic by construction: fixed instants, fixed coordinates, no
 * `Date.now()`, no randomness. Everything is persisted through the REAL
 * composition root (`buildTowServices`) and driven through the REAL HTTP
 * surface (`createApp`), so the suites hit the same routes, controllers,
 * services, repositories and policies as production.
 *
 * The canonical payment fixtures are built on the MVP-04/MVP-05 helpers
 * (`createAssignedScenario`, `driveTo`): a payment test must never be able to
 * pass against an assignment or a `COMPLETED` state the runtime could not
 * actually produce.
 */
'use strict';

const request = require('supertest');
const { buildTowServices } = require('../../../src/modules/tow/composition');
const { createFakeClock } = require('./clock');
const { createFakeRouteProvider } = require('./gateways/mapsGateway');
const { DEFAULT_INSTANT } = require('./mvp03');
const {
  createAssignedScenario,
  driveTo,
  getRequest,
  listPartnerJobs,
} = require('./mvp05');

const REQUESTS = '/api/tow/requests';

/** Idempotency keys (>= 8 chars, contract minLength). */
const PAYMENT_METHOD_IDEMPOTENCY_KEY = 'idem-mvp06-paymethod-01';
const CASH_RECEIVED_IDEMPOTENCY_KEY = 'idem-mvp06-cash-000001';
const CASH_RECEIVED_ALTERNATE_KEY = 'idem-mvp06-cash-000002';

/** The only method MVP-06 implements. */
const CASH_METHOD = 'cash';

/** Build the module services against the SQLite harness (fake clock + routes). */
function createMvp06Services(options = {}) {
  const clock = options.clock || createFakeClock(options.start || DEFAULT_INSTANT);
  const routeProvider = options.routeProvider || createFakeRouteProvider(options.route);
  const services = buildTowServices({ db: options.db || require('../testDb').db, clock, routeProvider });
  return { services, clock, routeProvider };
}

/** `PUT /tow/requests/{id}/payment-method`. */
function selectPaymentMethod(app, requestId, auth, options = {}) {
  let pending = request(app).put(`${REQUESTS}/${requestId}/payment-method`);
  if (options.key !== null) pending = pending.set('Idempotency-Key', options.key || PAYMENT_METHOD_IDEMPOTENCY_KEY);
  if (options.auth !== null) pending = pending.set((options.auth || auth).headers);
  const body = options.body === undefined ? { method: options.method || CASH_METHOD } : options.body;
  return body === null ? pending.send() : pending.send(body);
}

/** `POST /tow/requests/{id}/cash-received` (contract declares no body). */
function cashReceived(app, requestId, auth, options = {}) {
  let pending = request(app).post(`${REQUESTS}/${requestId}/cash-received`);
  if (options.key !== null) pending = pending.set('Idempotency-Key', options.key || CASH_RECEIVED_IDEMPOTENCY_KEY);
  if (options.auth !== null) pending = pending.set((options.auth || auth).headers);
  return options.body === undefined ? pending.send() : pending.send(options.body);
}

/** `GET /tow/requests/{id}/payment`. */
function getPayment(app, requestId, auth, options = {}) {
  let pending = request(app).get(`${REQUESTS}/${requestId}/payment`);
  if (options.auth !== null) pending = pending.set((options.auth || auth).headers);
  return pending;
}

/** Raw `tow_payments` row, for invariant assertions that bypass the DTO. */
async function paymentRow(db, requestId) {
  return db('tow_payments').where({ tow_request_id: requestId }).first();
}

/** All `tow_payments` rows for a request (used to prove "exactly one"). */
async function paymentRows(db, requestId) {
  return db('tow_payments').where({ tow_request_id: requestId });
}

/**
 * Create an `ASSIGNED` scenario and drive it to `COMPLETED` over the real HTTP
 * surface (finishing also releases the assignment).
 */
async function createCompletedScenario(options = {}) {
  const { app, services, clock, partnerCount = 2 } = options;
  const scenario = await createAssignedScenario({ app, services, clock, partnerCount });
  const steps = await driveTo(app, scenario, 'COMPLETED', options.keys || {});
  return { ...scenario, steps };
}

module.exports = {
  REQUESTS,
  PAYMENT_METHOD_IDEMPOTENCY_KEY,
  CASH_RECEIVED_IDEMPOTENCY_KEY,
  CASH_RECEIVED_ALTERNATE_KEY,
  CASH_METHOD,
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
};
