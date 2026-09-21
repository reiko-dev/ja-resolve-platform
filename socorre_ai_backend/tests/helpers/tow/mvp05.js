/**
 * MVP-05 — fixtures for service execution, live tracking and cancellation.
 *
 * Deterministic by construction: fixed instants, fixed coordinates, no
 * `Date.now()`, no randomness. Everything is persisted through the REAL
 * composition root (`buildTowServices`) and exercised through the REAL HTTP
 * surface (`createApp`) so the suites hit the same routes, controllers,
 * services, repositories and policies as production.
 *
 * The canonical `ASSIGNED` fixture is built by the MVP-04 path (propose then
 * accept) instead of inserting rows directly: an MVP-05 test must never be able
 * to pass against an assignment shape the MVP-04 runtime could not produce.
 */
'use strict';

const request = require('supertest');
const { buildTowServices } = require('../../../src/modules/tow/composition');
const { createFakeClock } = require('./clock');
const { createFakeRouteProvider } = require('./gateways/mapsGateway');
const {
  DEFAULT_INSTANT,
  PICKUP,
  DESTINATION,
  TARIFF,
  createTowRequestInput,
} = require('./mvp03');
const {
  createProposalScenario,
  authFor,
  authsForPartners,
  PROPOSAL_IDEMPOTENCY_KEY,
  ACCEPT_IDEMPOTENCY_KEY,
} = require('./mvp04');

const REQUESTS = '/api/tow/requests';

/** Idempotency keys (>= 8 chars, contract minLength). */
const EN_ROUTE_IDEMPOTENCY_KEY = 'idem-mvp05-enroute-0001';
const ARRIVED_IDEMPOTENCY_KEY = 'idem-mvp05-arrived-0001';
const IN_TRANSIT_IDEMPOTENCY_KEY = 'idem-mvp05-intransit-001';
const FINISH_IDEMPOTENCY_KEY = 'idem-mvp05-finish-00001';
const CANCEL_IDEMPOTENCY_KEY = 'idem-mvp05-cancel-000001';
const CANCEL_PARTNER_IDEMPOTENCY_KEY = 'idem-mvp05-cancelp-0001';
const TRACKING_IDEMPOTENCY_KEY = 'idem-mvp05-track-000001';

/** A tracking point strictly after the assignment instant. */
const TRACKING_POINT = Object.freeze({
  latitude: -23.561684,
  longitude: -46.655981,
  recorded_at: '2026-01-15T12:05:00.000Z',
});

/** A second, NEWER tracking point for the same request. */
const TRACKING_POINT_LATER = Object.freeze({
  latitude: -23.564000,
  longitude: -46.652000,
  recorded_at: '2026-01-15T12:10:00.000Z',
});

/** A stale point: strictly OLDER than `TRACKING_POINT`. */
const TRACKING_POINT_STALE = Object.freeze({
  latitude: -23.570000,
  longitude: -46.660000,
  recorded_at: '2026-01-15T12:01:00.000Z',
});

const ARRIVAL_LOCATION = Object.freeze({
  location: {
    latitude: PICKUP.latitude,
    longitude: PICKUP.longitude,
    formatted_address: PICKUP.formatted_address,
  },
});

const FINISH_LOCATION = Object.freeze({
  location: {
    latitude: DESTINATION.latitude,
    longitude: DESTINATION.longitude,
    formatted_address: DESTINATION.formatted_address,
  },
});

const PARTNER_CANCELLATION_REASON = 'Cliente não localizado no endereço informado';
const CUSTOMER_CANCELLATION_REASON = 'Preciso cancelar o guincho';

/** Build the module services against the SQLite harness (fake clock + routes). */
function createMvp05Services(options = {}) {
  const clock = options.clock || createFakeClock(options.start || DEFAULT_INSTANT);
  const routeProvider = options.routeProvider || createFakeRouteProvider(options.route);
  const services = buildTowServices({ db: options.db || require('../testDb').db, clock, routeProvider });
  return { services, clock, routeProvider };
}

/**
 * Create an `ASSIGNED` canonical request: an open request plus `partnerCount`
 * operational partners, then partner[0] proposes and the customer accepts over
 * the real HTTP surface (MVP-04 is the only authority that can produce an
 * assignment).
 */
async function createAssignedScenario(options = {}) {
  const { app, services, clock, partnerCount = 2, customer = null } = options;
  const created = await createProposalScenario({
    services,
    clock,
    partnerCount,
    customer,
    requestInput: options.requestInput || createTowRequestInput(),
  });
  const auths = authsForPartners(created.partners);
  const customerAuth = authFor({ user: created.customer });

  const proposed = await request(app)
    .post(`${REQUESTS}/${created.request.id}/proposals`)
    .set('Idempotency-Key', PROPOSAL_IDEMPOTENCY_KEY)
    .set(auths[0].headers)
    .send({});
  if (proposed.status !== 201) {
    throw new Error(`MVP-05 fixture could not create the proposal (status ${proposed.status})`);
  }

  const accepted = await request(app)
    .post(`/api/tow/proposals/${proposed.body.data.id}/accept`)
    .set('Idempotency-Key', ACCEPT_IDEMPOTENCY_KEY)
    .set(customerAuth.headers)
    .send({});
  if (accepted.status !== 200) {
    throw new Error(`MVP-05 fixture could not accept the proposal (status ${accepted.status})`);
  }

  return {
    ...created,
    auths,
    customerAuth,
    proposal: proposed.body.data,
    assigned: accepted.body.data,
  };
}

/** `POST /tow/requests/{id}/en-route`. `auth: null` omits the token. */
function enRoute(app, requestId, auth, options = {}) {
  let pending = request(app).post(`${REQUESTS}/${requestId}/en-route`);
  if (options.key !== null) pending = pending.set('Idempotency-Key', options.key || EN_ROUTE_IDEMPOTENCY_KEY);
  if (options.auth !== null) pending = pending.set((options.auth || auth).headers);
  return pending.send(options.body === undefined ? {} : options.body);
}

/** `POST /tow/requests/{id}/arrived` (contract requires a LocationInput body). */
function arrived(app, requestId, auth, options = {}) {
  let pending = request(app).post(`${REQUESTS}/${requestId}/arrived`);
  if (options.key !== null) pending = pending.set('Idempotency-Key', options.key || ARRIVED_IDEMPOTENCY_KEY);
  if (options.auth !== null) pending = pending.set((options.auth || auth).headers);
  return pending.send(options.body === undefined ? ARRIVAL_LOCATION : options.body);
}

/** `POST /tow/requests/{id}/in-transit`. */
function inTransit(app, requestId, auth, options = {}) {
  let pending = request(app).post(`${REQUESTS}/${requestId}/in-transit`);
  if (options.key !== null) pending = pending.set('Idempotency-Key', options.key || IN_TRANSIT_IDEMPOTENCY_KEY);
  if (options.auth !== null) pending = pending.set((options.auth || auth).headers);
  return pending.send(options.body === undefined ? {} : options.body);
}

/** `POST /tow/requests/{id}/finish` (contract requires a LocationInput body). */
function finish(app, requestId, auth, options = {}) {
  let pending = request(app).post(`${REQUESTS}/${requestId}/finish`);
  if (options.key !== null) pending = pending.set('Idempotency-Key', options.key || FINISH_IDEMPOTENCY_KEY);
  if (options.auth !== null) pending = pending.set((options.auth || auth).headers);
  return pending.send(options.body === undefined ? FINISH_LOCATION : options.body);
}

/** `POST /tow/requests/{id}/cancel` (customer). */
function cancelByCustomer(app, requestId, auth, options = {}) {
  let pending = request(app).post(`${REQUESTS}/${requestId}/cancel`);
  if (options.key !== null) pending = pending.set('Idempotency-Key', options.key || CANCEL_IDEMPOTENCY_KEY);
  if (options.auth !== null) pending = pending.set((options.auth || auth).headers);
  const body = options.body === undefined ? { reason: CUSTOMER_CANCELLATION_REASON } : options.body;
  return body === null ? pending.send() : pending.send(body);
}

/** `POST /tow/requests/{id}/cancel-partner` (assigned partner). */
function cancelByPartner(app, requestId, auth, options = {}) {
  let pending = request(app).post(`${REQUESTS}/${requestId}/cancel-partner`);
  if (options.key !== null) pending = pending.set('Idempotency-Key', options.key || CANCEL_PARTNER_IDEMPOTENCY_KEY);
  if (options.auth !== null) pending = pending.set((options.auth || auth).headers);
  const body = options.body === undefined ? { reason: PARTNER_CANCELLATION_REASON } : options.body;
  return body === null ? pending.send() : pending.send(body);
}

/** `GET /tow/requests/{id}/tracking`. */
function getTracking(app, requestId, auth, options = {}) {
  let pending = request(app).get(`${REQUESTS}/${requestId}/tracking`);
  if (options.auth !== null) pending = pending.set((options.auth || auth).headers);
  return pending;
}

/** `POST /tow/requests/{id}/tracking`. */
function postTracking(app, requestId, auth, options = {}) {
  let pending = request(app).post(`${REQUESTS}/${requestId}/tracking`);
  if (options.key !== null) pending = pending.set('Idempotency-Key', options.key || TRACKING_IDEMPOTENCY_KEY);
  if (options.auth !== null) pending = pending.set((options.auth || auth).headers);
  return pending.send(options.body === undefined ? TRACKING_POINT : options.body);
}

/** `GET /tow/partner/jobs`. */
function listPartnerJobs(app, auth, query = {}) {
  return request(app).get('/api/tow/partner/jobs').set(auth.headers).query(query);
}

/** `GET /tow/requests/{id}` (canonical customer recovery). */
function getRequest(app, requestId, auth) {
  return request(app).get(`${REQUESTS}/${requestId}`).set(auth.headers);
}

/** Raw `tow_request_tracking` row, for invariant assertions that bypass the DTO. */
async function trackingRow(db, requestId) {
  return db('tow_request_tracking').where({ tow_request_id: requestId }).first();
}

/** The five MVP-05 milestone columns of a raw `tow_requests` row. */
function milestonesOf(row) {
  if (!row) return null;
  return {
    en_route_at: row.en_route_at ?? null,
    arrived_at: row.arrived_at ?? null,
    in_transit_at: row.in_transit_at ?? null,
    completed_at: row.completed_at ?? null,
    cancelled_at: row.cancelled_at ?? null,
  };
}

/** Drive the request to `target` over HTTP, asserting every step is a 200. */
async function driveTo(app, scenario, target, keys = {}) {
  const auth = scenario.auths[0];
  const requestId = scenario.request.id;
  const steps = [];
  const call = {
    EN_ROUTE: () => enRoute(app, requestId, auth, { key: keys.enRoute }),
    ARRIVED: () => arrived(app, requestId, auth, { key: keys.arrived }),
    IN_TRANSIT: () => inTransit(app, requestId, auth, { key: keys.inTransit }),
    COMPLETED: () => finish(app, requestId, auth, { key: keys.finish }),
  };
  for (const state of ['EN_ROUTE', 'ARRIVED', 'IN_TRANSIT', 'COMPLETED']) {
    const response = await call[state]();
    steps.push({ state, status: response.status, body: response.body });
    if (state === target) return steps;
  }
  return steps;
}

module.exports = {
  REQUESTS,
  EN_ROUTE_IDEMPOTENCY_KEY,
  ARRIVED_IDEMPOTENCY_KEY,
  IN_TRANSIT_IDEMPOTENCY_KEY,
  FINISH_IDEMPOTENCY_KEY,
  CANCEL_IDEMPOTENCY_KEY,
  CANCEL_PARTNER_IDEMPOTENCY_KEY,
  TRACKING_IDEMPOTENCY_KEY,
  PROPOSAL_IDEMPOTENCY_KEY,
  ACCEPT_IDEMPOTENCY_KEY,
  TRACKING_POINT,
  TRACKING_POINT_LATER,
  TRACKING_POINT_STALE,
  ARRIVAL_LOCATION,
  FINISH_LOCATION,
  CUSTOMER_CANCELLATION_REASON,
  PARTNER_CANCELLATION_REASON,
  DEFAULT_INSTANT,
  PICKUP,
  DESTINATION,
  TARIFF,
  createMvp05Services,
  createAssignedScenario,
  enRoute,
  arrived,
  inTransit,
  finish,
  cancelByCustomer,
  cancelByPartner,
  getTracking,
  postTracking,
  listPartnerJobs,
  getRequest,
  trackingRow,
  milestonesOf,
  driveTo,
};
