#!/usr/bin/env node
/**
 * TOW CLIENT DEMO — REAL HTTP smoke test against a running backend.
 *
 * Drives the exact cross-app journey of the client demonstration with `axios`,
 * using the two demo accounts of `demo-config.js`:
 *
 *   (a)  GET  /health                                   postgres ok
 *   (b)  GET  /api/tow/module-status                    enabled/ACTIVE
 *   (c)  GET  /socket.io/?EIO=4&transport=polling       realtime transport alive
 *   (d)  POST /api/auth/login                           customer + partner tokens
 *   (e)  POST /api/locations/autocomplete               Places proxy (biased)
 *        GET  /api/locations/places/{placeId}           Place Details proxy
 *   (f)  POST /api/tow/requests                         SEARCHING, cash, idempotent
 *   (g)  GET  /api/tow/requests/{id}/route              real Routes polyline
 *   (h)  GET  /api/tow/partner/opportunities            partner sees it, priced
 *   (i)  POST /api/tow/requests/{id}/proposals          partner proposes (server price)
 *        GET  /api/tow/requests/{id}/proposals          customer lists proposals
 *   (j)  POST /api/tow/proposals/{id}/accept            ASSIGNED + CASH_SELECTED
 *   (k)  GET  /api/tow/partner/jobs                     partner recovers assignment
 *   (l)  POST /api/tow/requests/{id}/tracking           partner publishes a point
 *        GET  /api/tow/requests/{id}/tracking           customer reads it
 *   (m)  POST .../en-route|arrived|in-transit|finish    partner drives -> COMPLETED
 *   (n)  POST /api/tow/requests/{id}/cash-received      CASH_RECEIVED + retry
 *   (o)  GET  /api/tow/requests/{id}/payment            canonical payment summary
 *   (p)  GET  /api/tow/requests/{id}                    customer final recovery
 *
 * It never calls a legacy surface and never mutates anything by hand: the REST
 * authority is the only writer. Tokens, passwords and keys are never logged.
 * Each step prints `<NAME>_SMOKE=PASS` so the result maps 1:1 to the delivery
 * report; the run ends with `SMOKE=PASS` (exit 0) or `SMOKE=FAIL` (exit 1).
 *
 * Base URL: `TOW_DEMO_BASE_URL` (default `http://127.0.0.1:3001`).
 * Credentials: `TOW_DEMO_PASSWORD` + the fixed demo e-mails.
 */
'use strict';

require('dotenv').config();

const crypto = require('crypto');
const axios = require('axios');
const {
  DEMO_ACCOUNTS,
  DEMO_DESTINATION,
  DEMO_REQUEST_VEHICLE,
  DEMO_PARTNER_PROFILE,
  resolveDemoPassword,
} = require('./demo-config');

const BASE_URL = process.env.TOW_DEMO_BASE_URL || 'http://127.0.0.1:3001';
const REQUEST_TIMEOUT_MS = Number(process.env.TOW_DEMO_SMOKE_TIMEOUT_MS) || 25_000;
const PLACES_QUERY = process.env.TOW_DEMO_SMOKE_PLACES_QUERY || 'Avenida Paulista, 1000 - São Paulo';
const PICKUP_FALLBACK_RADIUS_METERS = 40_000;

class SmokeFailure extends Error {
  constructor(step, message) {
    super(message);
    this.name = 'SmokeFailure';
    this.step = step;
  }
}

const http = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  proxy: false,
  validateStatus: () => true,
  headers: { Accept: 'application/json' },
});

function pass(name, detail) {
  console.log(`[smoke] PASS ${name}${detail ? `: ${detail}` : ''}`);
  console.log(`${name}=PASS`);
}

function assertStep(step, condition, message) {
  if (!condition) throw new SmokeFailure(step, message);
}

async function call(name, { method, url, token = null, data, idempotencyKey = null }) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  let response;
  try {
    response = await http.request({ method, url, data, headers });
  } catch (error) {
    const detail = error && error.code ? error.code : (error && error.message) || String(error);
    throw new SmokeFailure(name, `${method.toUpperCase()} ${url} received no HTTP response (${detail})`);
  }
  if (response.status >= 400) {
    const body = response.data || {};
    const code = body.error && body.error.code ? body.error.code : 'no_error_code';
    const message = body.message ? ` - ${body.message}` : '';
    throw new SmokeFailure(name, `${method.toUpperCase()} ${url} -> HTTP ${response.status} (${code})${message}`);
  }
  return response;
}

async function login(name, email, password) {
  const response = await call(name, {
    method: 'post',
    url: '/api/auth/login',
    data: { email, password },
  });
  const body = response.data || {};
  const token = body.data && body.data.token;
  assertStep(name, response.status === 200, `unexpected HTTP ${response.status}`);
  assertStep(name, typeof token === 'string' && token.length > 0, 'login response carries no token');
  return { token, user: (body.data && body.data.user) || null };
}

function smokeKey(suffix) {
  return `tow-demo-smoke-${Date.now()}-${process.pid}-${suffix}`;
}

function haversineMeters(left, right) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earth = 6_371_000;
  const dLat = toRad(right.latitude - left.latitude);
  const dLng = toRad(right.longitude - left.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(left.latitude)) * Math.cos(toRad(right.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(a));
}

/** Places smoke; returns the resolved place or null when the provider gave nothing usable. */
async function placesSmoke(customerToken) {
  const sessionToken = crypto.randomBytes(16).toString('hex');
  const autocomplete = await call('PLACES_AUTOCOMPLETE_SMOKE', {
    method: 'post',
    url: '/api/locations/autocomplete',
    token: customerToken,
    data: {
      input: PLACES_QUERY,
      session_token: sessionToken,
      location_bias: {
        latitude: DEMO_PARTNER_PROFILE.latitude,
        longitude: DEMO_PARTNER_PROFILE.longitude,
        radius_meters: 5000,
      },
    },
  });
  const predictions = (autocomplete.data && autocomplete.data.data && autocomplete.data.data.predictions) || [];
  assertStep(
    'PLACES_AUTOCOMPLETE_SMOKE',
    Array.isArray(predictions) && predictions.length > 0,
    `autocomplete returned no prediction for "${PLACES_QUERY}"`
  );
  pass('PLACES_AUTOCOMPLETE_SMOKE', `${predictions.length} prediction(s), first="${predictions[0].primary_text}"`);

  const placeId = predictions[0].place_id;
  const details = await call('PLACES_DETAILS_SMOKE', {
    method: 'get',
    url: `/api/locations/places/${encodeURIComponent(placeId)}?session_token=${sessionToken}`,
    token: customerToken,
  });
  const place = details.data && details.data.data;
  assertStep('PLACES_DETAILS_SMOKE', Boolean(place && Number.isFinite(Number(place.latitude))), 'place details carry no coordinates');
  pass('PLACES_DETAILS_SMOKE', `place_id=${place.place_id} address="${place.formatted_address}"`);

  const distance = haversineMeters(
    { latitude: DEMO_PARTNER_PROFILE.latitude, longitude: DEMO_PARTNER_PROFILE.longitude },
    { latitude: Number(place.latitude), longitude: Number(place.longitude) }
  );
  if (distance > PICKUP_FALLBACK_RADIUS_METERS) {
    console.log(`[smoke] WARN resolved place is ${Math.round(distance)} m from the demo partner; using the partner coordinates as pickup`);
    return null;
  }
  return place;
}

async function main() {
  const password = resolveDemoPassword(process.env);
  console.log(`[smoke] base URL: ${BASE_URL}`);
  console.log('[smoke] credentials: demo accounts from scripts/tow/demo-config.js (password never printed)');

  // (a) liveness + database
  const health = await call('HEALTH_SMOKE', { method: 'get', url: '/health' });
  const checks = (health.data && health.data.checks) || {};
  assertStep('HEALTH_SMOKE', health.status === 200 && checks.postgres === 'ok', `postgres=${checks.postgres}`);
  pass('HEALTH_SMOKE', 'http+postgres ok');

  // (b) module gate
  const moduleStatus = await call('MODULE_STATUS_SMOKE', { method: 'get', url: '/api/tow/module-status' });
  const module = moduleStatus.data && moduleStatus.data.data;
  assertStep('MODULE_STATUS_SMOKE', module && module.enabled === true, `enabled=${module && module.enabled}`);
  console.log(`TOW_MODULE_STATUS=${module.status}`);
  pass('MODULE_STATUS_SMOKE', `status=${module.status}`);

  // (c) realtime transport alive (REST remains the authority)
  const socket = await call('SOCKET_IO_HANDSHAKE', {
    method: 'get',
    url: '/socket.io/?EIO=4&transport=polling',
  });
  assertStep('SOCKET_IO_HANDSHAKE', socket.status === 200, `unexpected HTTP ${socket.status}`);
  pass('SOCKET_IO_HANDSHAKE', 'engine.io polling handshake ok');

  // (d) both logins
  const customer = await login('AUTH_CLIENT_SMOKE', DEMO_ACCOUNTS.CUSTOMER.email, password);
  pass('AUTH_CLIENT_SMOKE', DEMO_ACCOUNTS.CUSTOMER.email);
  const partner = await login('AUTH_PARTNER_SMOKE', DEMO_ACCOUNTS.PARTNER.email, password);
  assertStep(
    'AUTH_PARTNER_SMOKE',
    partner.user && partner.user.partner_id !== null && partner.user.partner_id !== undefined,
    'partner login has no partner_id (run demo:tow:seed)'
  );
  pass('AUTH_PARTNER_SMOKE', DEMO_ACCOUNTS.PARTNER.email);

  // (e) Places proxy (Autocomplete + Details) — the same surface the apps use
  const place = await placesSmoke(customer.token);

  // (f) canonical request creation with the commercial choice frozen at creation
  const pickup = place
    ? {
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      formatted_address: place.formatted_address,
      place_id: place.place_id,
      resolution_source: 'USER_SELECTED_PLACE',
    }
    : {
      latitude: DEMO_PARTNER_PROFILE.latitude,
      longitude: DEMO_PARTNER_PROFILE.longitude,
      formatted_address: DEMO_PARTNER_PROFILE.address,
      resolution_source: 'USER_PIN',
    };
  console.log(`[smoke] pickup: ${pickup.place_id ? `place ${pickup.place_id}` : 'partner coordinates (fallback)'}`);

  const createPayload = {
    pickup,
    destination: { ...DEMO_DESTINATION, resolution_source: 'USER_PIN' },
    vehicle: { ...DEMO_REQUEST_VEHICLE },
    problem_description: 'Demonstração Tow: veículo não liga, remoção até o destino.',
    payment_method: 'cash',
  };
  const createKey = smokeKey('create');
  const createdResponse = await call('REQUEST_CREATE_SMOKE', {
    method: 'post',
    url: '/api/tow/requests',
    token: customer.token,
    data: createPayload,
    idempotencyKey: createKey,
  });
  const created = createdResponse.data && createdResponse.data.data;
  assertStep('REQUEST_CREATE_SMOKE', createdResponse.status === 201, `unexpected HTTP ${createdResponse.status}`);
  assertStep('REQUEST_CREATE_SMOKE', created && created.id, 'created request has no id');
  assertStep('REQUEST_CREATE_SMOKE', created.state === 'SEARCHING', `state=${created.state}`);
  assertStep('REQUEST_CREATE_SMOKE', created.payment_method === 'cash', `payment_method=${created.payment_method}`);
  const requestId = created.id;
  pass('REQUEST_CREATE_SMOKE', `id=${requestId} state=SEARCHING payment_method=cash`);

  // (f.1) idempotent replay: the same key must return the same request, not a new one
  const replay = await call('REQUEST_IDEMPOTENCY_SMOKE', {
    method: 'post',
    url: '/api/tow/requests',
    token: customer.token,
    data: createPayload,
    idempotencyKey: createKey,
  });
  const replayed = replay.data && replay.data.data;
  assertStep('REQUEST_IDEMPOTENCY_SMOKE', replayed && String(replayed.id) === String(requestId), 'replay returned a different request');
  pass('REQUEST_IDEMPOTENCY_SMOKE', `same id ${requestId}`);

  // (g) route snapshot from the real provider
  const routeResponse = await call('ROUTES_SMOKE', {
    method: 'get',
    url: `/api/tow/requests/${requestId}/route`,
    token: customer.token,
  });
  const route = routeResponse.data && routeResponse.data.data;
  const polyline = route && route.encoded_polyline;
  assertStep('ROUTES_SMOKE', typeof polyline === 'string' && polyline.length > 0, 'encoded_polyline is empty');
  pass('ROUTES_SMOKE', `polyline length=${polyline.length}`);

  // (h) partner opportunity feed
  const opportunitiesResponse = await call('OPPORTUNITY_SMOKE', {
    method: 'get',
    url: '/api/tow/partner/opportunities',
    token: partner.token,
  });
  const items = (opportunitiesResponse.data && opportunitiesResponse.data.data && opportunitiesResponse.data.data.items) || [];
  const opportunity = Array.isArray(items)
    ? items.find((item) => item && item.request && String(item.request.id) === String(requestId))
    : null;
  assertStep('OPPORTUNITY_SMOKE', Boolean(opportunity), `request ${requestId} not in the feed (${items.length} item(s))`);
  assertStep('OPPORTUNITY_SMOKE', opportunity.request.payment_method === 'cash', `payment_method=${opportunity.request.payment_method}`);
  assertStep(
    'OPPORTUNITY_SMOKE',
    opportunity.proposed_price && Number.isFinite(Number(opportunity.proposed_price.amount_cents)),
    'opportunity carries no backend-computed proposed_price'
  );
  pass('OPPORTUNITY_SMOKE', `amount_cents=${opportunity.proposed_price.amount_cents}`);

  // (i) partner proposal (server prices it; the partner sends no amount)
  const proposalResponse = await call('PROPOSAL_SMOKE', {
    method: 'post',
    url: `/api/tow/requests/${requestId}/proposals`,
    token: partner.token,
    data: {},
    idempotencyKey: smokeKey('proposal'),
  });
  const proposal = proposalResponse.data && proposalResponse.data.data;
  assertStep('PROPOSAL_SMOKE', proposalResponse.status === 201, `unexpected HTTP ${proposalResponse.status}`);
  assertStep('PROPOSAL_SMOKE', proposal && proposal.id, 'proposal has no id');
  assertStep(
    'PROPOSAL_SMOKE',
    proposal.price && Number.isFinite(Number(proposal.price.amount_cents)),
    'proposal carries no server-computed price'
  );
  const finalPriceCents = String(proposal.price.amount_cents);
  pass('PROPOSAL_SMOKE', `id=${proposal.id} amount_cents=${finalPriceCents}`);

  const proposalList = await call('PROPOSALS_LIST_SMOKE', {
    method: 'get',
    url: `/api/tow/requests/${requestId}/proposals`,
    token: customer.token,
  });
  const listed = (proposalList.data && proposalList.data.data && proposalList.data.data.items) || [];
  assertStep('PROPOSALS_LIST_SMOKE', listed.some((item) => String(item.id) === String(proposal.id)), 'customer proposal list does not contain the proposal');
  pass('PROPOSALS_LIST_SMOKE', `${listed.length} proposal(s)`);

  // (j) customer accepts -> ASSIGNED + CASH_SELECTED materialized
  const acceptResponse = await call('ACCEPT_SMOKE', {
    method: 'post',
    url: `/api/tow/proposals/${proposal.id}/accept`,
    token: customer.token,
    data: {},
    idempotencyKey: smokeKey('accept'),
  });
  const accepted = acceptResponse.data && acceptResponse.data.data;
  assertStep('ACCEPT_SMOKE', acceptResponse.status === 200, `unexpected HTTP ${acceptResponse.status}`);
  assertStep('ACCEPT_SMOKE', accepted && accepted.state === 'ASSIGNED', `state=${accepted && accepted.state}`);
  assertStep('ACCEPT_SMOKE', accepted.payment && accepted.payment.status === 'CASH_SELECTED', `payment=${accepted.payment && accepted.payment.status}`);
  assertStep('ACCEPT_SMOKE', accepted.payment && String(accepted.payment.amount_cents) === finalPriceCents, `payment amount=${accepted.payment && accepted.payment.amount_cents} != proposal ${finalPriceCents}`);
  pass('ACCEPT_SMOKE', `state=ASSIGNED payment=CASH_SELECTED amount_cents=${finalPriceCents}`);

  // (k) partner job recovery (same canonical assignment and frozen final price)
  const jobsResponse = await call('ASSIGNMENT_SMOKE', {
    method: 'get',
    url: '/api/tow/partner/jobs',
    token: partner.token,
  });
  const jobs = (jobsResponse.data && jobsResponse.data.data && jobsResponse.data.data.items) || [];
  const job = jobs.find((item) => item && String(item.id) === String(requestId));
  assertStep('ASSIGNMENT_SMOKE', Boolean(job), `request ${requestId} not in the partner jobs`);
  assertStep(
    'ASSIGNMENT_SMOKE',
    job.assignment && String(job.assignment.final_price.amount_cents) === finalPriceCents,
    'partner job final price differs from the accepted proposal'
  );
  pass('ASSIGNMENT_SMOKE', `vehicle id=${job.assignment.tow_vehicle_id} final_price=${finalPriceCents}`);

  // (l) tracking write (partner) + read (customer)
  const trackingPoint = {
    latitude: DEMO_PARTNER_PROFILE.latitude,
    longitude: DEMO_PARTNER_PROFILE.longitude,
    recorded_at: new Date().toISOString(),
  };
  const trackingWrite = await call('TRACKING_WRITE_SMOKE', {
    method: 'post',
    url: `/api/tow/requests/${requestId}/tracking`,
    token: partner.token,
    data: trackingPoint,
    idempotencyKey: smokeKey('tracking'),
  });
  assertStep('TRACKING_WRITE_SMOKE', trackingWrite.status === 202, `unexpected HTTP ${trackingWrite.status}`);
  pass('TRACKING_WRITE_SMOKE', 'HTTP 202');

  const trackingRead = await call('TRACKING_READ_SMOKE', {
    method: 'get',
    url: `/api/tow/requests/${requestId}/tracking`,
    token: customer.token,
  });
  const tracking = trackingRead.data && trackingRead.data.data;
  assertStep(
    'TRACKING_READ_SMOKE',
    tracking && tracking.latest
      && Number(tracking.latest.latitude) === Number(trackingPoint.latitude)
      && Number(tracking.latest.longitude) === Number(trackingPoint.longitude),
    'customer tracking read does not match the persisted point'
  );
  pass('TRACKING_READ_SMOKE', `latest recorded_at=${tracking.latest.recorded_at}`);

  // (m) the four frozen milestones, driven by the assigned partner
  const milestones = [
    ['en-route', {}, 'EN_ROUTE_SMOKE'],
    ['arrived', { location: { latitude: DEMO_PARTNER_PROFILE.latitude, longitude: DEMO_PARTNER_PROFILE.longitude, formatted_address: DEMO_PARTNER_PROFILE.address } }, 'ARRIVED_SMOKE'],
    ['in-transit', {}, 'IN_TRANSIT_SMOKE'],
    ['finish', { location: { latitude: DEMO_DESTINATION.latitude, longitude: DEMO_DESTINATION.longitude, formatted_address: DEMO_DESTINATION.formatted_address } }, 'COMPLETED_SMOKE'],
  ];
  for (const [edge, body, name] of milestones) {
    const response = await call(name, {
      method: 'post',
      url: `/api/tow/requests/${requestId}/${edge}`,
      token: partner.token,
      data: body,
      idempotencyKey: smokeKey(edge),
    });
    assertStep(name, response.status === 200, `unexpected HTTP ${response.status}`);
    pass(name, `HTTP ${response.status}`);
  }

  // (n) cash handover confirmation + idempotent retry (two different keys)
  const receivedResponse = await call('CASH_RECEIVED_SMOKE', {
    method: 'post',
    url: `/api/tow/requests/${requestId}/cash-received`,
    token: partner.token,
    idempotencyKey: smokeKey('cashreceived'),
  });
  const received = receivedResponse.data && receivedResponse.data.data;
  assertStep('CASH_RECEIVED_SMOKE', receivedResponse.status === 200, `unexpected HTTP ${receivedResponse.status}`);
  assertStep('CASH_RECEIVED_SMOKE', received && received.status === 'CASH_RECEIVED', `status=${received && received.status}`);
  assertStep('CASH_RECEIVED_SMOKE', received && String(received.amount_cents) === finalPriceCents, `amount=${received && received.amount_cents} != ${finalPriceCents}`);
  pass('CASH_RECEIVED_SMOKE', `status=CASH_RECEIVED amount_cents=${finalPriceCents}`);

  const retryResponse = await call('CASH_RECEIVED_RETRY_SMOKE', {
    method: 'post',
    url: `/api/tow/requests/${requestId}/cash-received`,
    token: partner.token,
    idempotencyKey: smokeKey('cashreceived-retry'),
  });
  const retried = retryResponse.data && retryResponse.data.data;
  assertStep('CASH_RECEIVED_RETRY_SMOKE', retryResponse.status === 200, `unexpected HTTP ${retryResponse.status}`);
  assertStep('CASH_RECEIVED_RETRY_SMOKE', retried && retried.status === 'CASH_RECEIVED', `status=${retried && retried.status}`);
  assertStep(
    'CASH_RECEIVED_RETRY_SMOKE',
    received && retried && String(retried.received_at) === String(received.received_at),
    'retry changed received_at (not idempotent)'
  );
  pass('CASH_RECEIVED_RETRY_SMOKE', 'same status and received_at');

  // (o) payment summary read
  const paymentResponse = await call('PAYMENT_READ_SMOKE', {
    method: 'get',
    url: `/api/tow/requests/${requestId}/payment`,
    token: customer.token,
  });
  const payment = paymentResponse.data && paymentResponse.data.data;
  assertStep('PAYMENT_READ_SMOKE', payment && payment.status === 'CASH_RECEIVED', `status=${payment && payment.status}`);
  assertStep('PAYMENT_READ_SMOKE', payment && String(payment.amount_cents) === finalPriceCents, `amount=${payment && payment.amount_cents} != ${finalPriceCents}`);
  pass('PAYMENT_READ_SMOKE', `status=CASH_RECEIVED amount_cents=${finalPriceCents}`);

  // (p) the customer's final read: COMPLETED + CASH_RECEIVED
  const finalResponse = await call('FINAL_RECOVERY_SMOKE', {
    method: 'get',
    url: `/api/tow/requests/${requestId}`,
    token: customer.token,
  });
  const finalRequest = finalResponse.data && finalResponse.data.data;
  assertStep('FINAL_RECOVERY_SMOKE', finalRequest && finalRequest.state === 'COMPLETED', `state=${finalRequest && finalRequest.state}`);
  assertStep('FINAL_RECOVERY_SMOKE', finalRequest.payment && finalRequest.payment.status === 'CASH_RECEIVED', `payment=${finalRequest.payment && finalRequest.payment.status}`);
  assertStep('FINAL_RECOVERY_SMOKE', finalRequest.payment_method === 'cash', `payment_method=${finalRequest.payment_method}`);
  pass('FINAL_RECOVERY_SMOKE', 'state=COMPLETED payment=CASH_RECEIVED payment_method=cash');

  console.log('SMOKE=PASS');
  console.log(`SMOKE_REQUEST_ID=${requestId}`);
  console.log(`SMOKE_FINAL_PRICE_CENTS=${finalPriceCents}`);
}

if (require.main === module) {
  main().catch((error) => {
    if (error instanceof SmokeFailure) {
      console.error(`[smoke] FAIL ${error.step}: ${error.message}`);
    } else {
      console.error(`[smoke] FAIL unexpected: ${error && error.message ? error.message : error}`);
    }
    console.error('SMOKE=FAIL');
    process.exitCode = 1;
  });
}

module.exports = { main, BASE_URL, smokeKey, placesSmoke, haversineMeters };
