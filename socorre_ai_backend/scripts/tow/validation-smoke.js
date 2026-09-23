#!/usr/bin/env node
/**
 * Tow local validation environment — REAL HTTP smoke test.
 *
 * Drives the running validation backend (`npm run start:validation`) through the
 * canonical Tow journey with `axios`:
 *
 *   (a) GET  /health                                  postgres ok
 *   (b) GET  /api/tow/module-status                   module enabled
 *   (c) POST /api/auth/login                          customer + partner tokens
 *   (d) GET  /api/tow/vehicles                        seeded active vehicle
 *   (e) POST /api/tow/requests                        SEARCHING, payment_method=cash, idempotent
 *   (f) GET  /api/tow/requests/{id}/route             non-empty encoded polyline
 *   (g) GET  /api/tow/partner/opportunities           feed contains the request + cash + price
 *   (h) POST /api/tow/requests/{id}/proposals         partner proposes (server price)
 *   (i) POST /api/tow/proposals/{id}/accept           customer accepts -> ASSIGNED
 *   (i.1) POST /api/tow/requests/{id}/tracking        assigned partner publishes a point -> 202
 *   (i.2) GET  /api/tow/requests/{id}/tracking        customer reads the persisted latest point
 *   (j) POST .../en-route|arrived|in-transit|finish   partner drives -> COMPLETED
 *   (k) PUT  /api/tow/requests/{id}/payment-method    customer selects cash
 *   (l) POST /api/tow/requests/{id}/cash-received     partner confirms -> CASH_RECEIVED
 *   (m) GET  /api/tow/requests/{id}                   COMPLETED + CASH_RECEIVED
 *
 * The scenario is closed by the deterministic reset+seed below (the canonical
 * state machine is the only authority on legal transitions; the smoke asserts
 * exactly the contract's MVP-06 CASH sequence).
 *
 * On success it performs the deterministic cleanup by calling the SAME
 * reset+seed path as `validation-env reset` (imported, never duplicated) and
 * prints `SMOKE=PASS` + `SCENARIO=RESET_AND_SEEDED`. Pass `--no-reset` to skip
 * the cleanup. On the first hard failure it prints `SMOKE=FAIL` with the HTTP
 * status and machine error code and exits 1.
 *
 * Base URL: TOW_VALIDATION_BASE_URL (default http://127.0.0.1:3000).
 * The legacy surfaces (`/emergency-requests`, `/tow-proposals`) are never called.
 */
'use strict';

// Profile selection BEFORE any harness module is required (same contract as
// validation-env.js: pg-guard/test-env read the env file during module init).
process.env.TOW_TEST_ENV_FILE = process.env.TOW_TEST_ENV_FILE || '.env.validation';
process.env.TOW_TEST_PG_PROJECT = process.env.TOW_TEST_PG_PROJECT || 'socorre-tow-validation';

const BASE_URL = process.env.TOW_VALIDATION_BASE_URL || 'http://127.0.0.1:3000';

const axios = require('axios');
const {
  PARTNER_PROFILE,
  VALIDATION_ACCOUNTS,
  resolveValidationPassword,
} = require('./validation-seed');
const { runReset } = require('./validation-env');

const REQUEST_TIMEOUT_MS = Number(process.env.TOW_VALIDATION_SMOKE_TIMEOUT_MS) || 20_000;

/** Scenario destination (downtown São Paulo), distinct from the seeded pickup. */
const DESTINATION = Object.freeze({
  latitude: -23.5475,
  longitude: -46.6388,
  formatted_address: 'Praça da Sé, São Paulo/SP',
});

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
  // A local smoke must never be routed through a proxy and must inspect 4xx/5xx
  // itself (status + machine code), not throw a generic axios error.
  proxy: false,
  validateStatus: () => true,
  headers: { Accept: 'application/json' },
});

function pass(step, detail) {
  console.log(`[smoke] PASS ${step}${detail ? `: ${detail}` : ''}`);
}

function assertStep(step, condition, message) {
  if (!condition) throw new SmokeFailure(step, message);
}

/** Single HTTP call that turns transport errors and 4xx/5xx into a SmokeFailure. */
async function call(step, { method, url, token = null, data, idempotencyKey = null }) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  let response;
  try {
    response = await http.request({ method, url, data, headers });
  } catch (error) {
    const detail = error && error.code ? error.code : (error && error.message) || String(error);
    throw new SmokeFailure(step, `${method.toUpperCase()} ${url} received no HTTP response (${detail})`);
  }

  if (response.status >= 400) {
    const body = response.data || {};
    const code = body.error && body.error.code ? body.error.code : 'no_error_code';
    const message = body.message ? ` - ${body.message}` : '';
    throw new SmokeFailure(
      step,
      `${method.toUpperCase()} ${url} -> HTTP ${response.status} (${code})${message}`
    );
  }
  return response;
}

async function login(step, email, password) {
  const response = await call(step, {
    method: 'post',
    url: '/api/auth/login',
    data: { email, password },
  });
  const body = response.data || {};
  const token = body.data && body.data.token;
  assertStep(step, response.status === 200, `unexpected HTTP ${response.status}`);
  assertStep(step, typeof token === 'string' && token.length > 0, 'login response carries no token');
  return { token, user: (body.data && body.data.user) || null };
}

function scenarioIdempotencyKey(suffix) {
  // 8..128 chars: prefix + epoch ms + pid + suffix.
  return `tow-validation-smoke-${Date.now()}-${process.pid}-${suffix}`;
}

async function main() {
  const noReset = process.argv.includes('--no-reset');
  const password = resolveValidationPassword(process.env);

  console.log(`[smoke] base URL: ${BASE_URL}`);
  console.log(`[smoke] module gate: /api/tow/module-status (tow)`);
  console.log('[smoke] customer + partner credentials come from scripts/tow/validation-seed.js');

  // (a) liveness + database
  const health = await call('(a) GET /health', { method: 'get', url: '/health' });
  assertStep('(a) GET /health', health.status === 200, `unexpected HTTP ${health.status}`);
  const checks = (health.data && health.data.checks) || {};
  assertStep(
    '(a) GET /health',
    checks.postgres === 'ok',
    `postgres check is "${checks.postgres}" (expected "ok")`
  );
  pass('(a) GET /health', 'postgres ok');

  // (b) module enabled
  const moduleStatus = await call('(b) GET /api/tow/module-status', {
    method: 'get',
    url: '/api/tow/module-status',
  });
  const enabled = moduleStatus.data && moduleStatus.data.data && moduleStatus.data.data.enabled;
  assertStep('(b) GET /api/tow/module-status', enabled === true, `module enabled=${enabled}`);
  pass('(b) GET /api/tow/module-status', 'enabled=true');

  // (c) both logins
  const customer = await login(
    '(c) POST /api/auth/login (customer)',
    VALIDATION_ACCOUNTS.CUSTOMER.email,
    password
  );
  pass('(c) POST /api/auth/login (customer)', VALIDATION_ACCOUNTS.CUSTOMER.email);
  const partner = await login(
    '(c) POST /api/auth/login (partner)',
    VALIDATION_ACCOUNTS.PARTNER.email,
    password
  );
  assertStep(
    '(c) POST /api/auth/login (partner)',
    partner.user && partner.user.partner_id !== null && partner.user.partner_id !== undefined,
    'partner login has no partner_id (seed missing the partners row?)'
  );
  pass('(c) POST /api/auth/login (partner)', VALIDATION_ACCOUNTS.PARTNER.email);

  // (d) seeded vehicle
  const vehiclesResponse = await call('(d) GET /api/tow/vehicles', {
    method: 'get',
    url: '/api/tow/vehicles',
    token: partner.token,
  });
  const vehicles = (vehiclesResponse.data && vehiclesResponse.data.data
    && vehiclesResponse.data.data.items) || [];
  assertStep(
    '(d) GET /api/tow/vehicles',
    Array.isArray(vehicles) && vehicles.some((vehicle) => vehicle.active === true),
    'no active TowVehicle returned for the seeded partner'
  );
  pass('(d) GET /api/tow/vehicles', `${vehicles.length} vehicle(s), at least one active`);

  // (e) create the canonical tow request at the seeded partner coordinates
  const createPayload = {
    pickup: {
      latitude: PARTNER_PROFILE.latitude,
      longitude: PARTNER_PROFILE.longitude,
      formatted_address: PARTNER_PROFILE.address,
    },
    destination: {
      latitude: DESTINATION.latitude,
      longitude: DESTINATION.longitude,
      formatted_address: DESTINATION.formatted_address,
    },
    vehicle: {
      class: 'light_vehicle',
      make: 'Fiat',
      model: 'Argo',
      year: 2019,
      plate: 'SMK1B23',
    },
    problem_description: 'Smoke de validação: veículo não liga, guincho para oficina.',
    // The commercial choice is REQUIRED since draft.13: a create without it is a
    // 422 and persists nothing.
    payment_method: 'cash',
  };
  const createdResponse = await call('(e) POST /api/tow/requests', {
    method: 'post',
    url: '/api/tow/requests',
    token: customer.token,
    data: createPayload,
    idempotencyKey: scenarioIdempotencyKey('create'),
  });
  const created = createdResponse.data && createdResponse.data.data;
  const requestId = created && created.id;
  assertStep('(e) POST /api/tow/requests', createdResponse.status === 201, `unexpected HTTP ${createdResponse.status}`);
  assertStep('(e) POST /api/tow/requests', Boolean(requestId), 'created request has no id');
  assertStep('(e) POST /api/tow/requests', created.state === 'SEARCHING', `state=${created.state}`);
  assertStep(
    '(e) POST /api/tow/requests',
    created.payment_method === 'cash',
    `payment_method=${created.payment_method} (expected "cash")`
  );
  pass('(e) POST /api/tow/requests', `id=${requestId} state=SEARCHING payment_method=cash`);

  // (f) route snapshot with geometry from the validation fixture provider
  const routeResponse = await call('(f) GET /api/tow/requests/{id}/route', {
    method: 'get',
    url: `/api/tow/requests/${requestId}/route`,
    token: customer.token,
  });
  const route = routeResponse.data && routeResponse.data.data;
  const polyline = route && route.encoded_polyline;
  assertStep(
    '(f) GET /api/tow/requests/{id}/route',
    typeof polyline === 'string' && polyline.length > 0,
    `encoded_polyline is ${polyline === null ? 'null' : typeof polyline} (expected a non-empty string)`
  );
  pass('(f) GET /api/tow/requests/{id}/route', `polyline length=${polyline.length}`);

  // (g) partner opportunity feed contains the new request
  const opportunitiesResponse = await call('(g) GET /api/tow/partner/opportunities', {
    method: 'get',
    url: '/api/tow/partner/opportunities',
    token: partner.token,
  });
  const items = (opportunitiesResponse.data && opportunitiesResponse.data.data
    && opportunitiesResponse.data.data.items) || [];
  const opportunity = Array.isArray(items)
    ? items.find((item) => item && item.request && String(item.request.id) === String(requestId))
    : null;
  assertStep(
    '(g) GET /api/tow/partner/opportunities',
    Boolean(opportunity),
    `request ${requestId} is not in the partner feed (${items.length} item(s))`
  );
  assertStep(
    '(g) GET /api/tow/partner/opportunities',
    opportunity.request.payment_method === 'cash',
    `opportunity payment_method=${opportunity.request.payment_method} (expected "cash")`
  );
  assertStep(
    '(g) GET /api/tow/partner/opportunities',
    Boolean(opportunity.proposed_price && Number.isFinite(Number(opportunity.proposed_price.amount_cents))),
    'opportunity carries no backend-computed proposed_price'
  );
  pass(
    '(g) GET /api/tow/partner/opportunities',
    `request ${requestId} matched payment_method=cash amount_cents=${opportunity.proposed_price.amount_cents}`
  );

  // (h) partner proposal. The server prices it from the seeded vehicle; the
  //     partner never sends an amount.
  const proposalResponse = await call('(h) POST /api/tow/requests/{id}/proposals', {
    method: 'post',
    url: `/api/tow/requests/${requestId}/proposals`,
    token: partner.token,
    data: {},
    idempotencyKey: scenarioIdempotencyKey('proposal'),
  });
  const proposal = proposalResponse.data && proposalResponse.data.data;
  assertStep(
    '(h) POST /api/tow/requests/{id}/proposals',
    proposalResponse.status === 201,
    `unexpected HTTP ${proposalResponse.status}`
  );
  assertStep('(h) POST /api/tow/requests/{id}/proposals', Boolean(proposal && proposal.id), 'proposal has no id');
  assertStep(
    '(h) POST /api/tow/requests/{id}/proposals',
    Boolean(proposal && proposal.price && Number.isFinite(Number(proposal.price.amount_cents))),
    'proposal carries no server-computed price'
  );
  pass(
    '(h) POST /api/tow/requests/{id}/proposals',
    `id=${proposal.id} amount_cents=${proposal.price.amount_cents}`
  );

  // (i) customer accepts the only live proposal -> ASSIGNED.
  const acceptResponse = await call('(i) POST /api/tow/proposals/{id}/accept', {
    method: 'post',
    url: `/api/tow/proposals/${proposal.id}/accept`,
    token: customer.token,
    data: {},
    idempotencyKey: scenarioIdempotencyKey('accept'),
  });
  const accepted = acceptResponse.data && acceptResponse.data.data;
  assertStep('(i) POST /api/tow/proposals/{id}/accept', acceptResponse.status === 200, `unexpected HTTP ${acceptResponse.status}`);
  assertStep(
    '(i) POST /api/tow/proposals/{id}/accept',
    accepted && accepted.state === 'ASSIGNED',
    `state=${accepted && accepted.state}`
  );
  pass('(i) POST /api/tow/proposals/{id}/accept', 'state=ASSIGNED');

  // (i.1)/(i.2) live tracking: the ASSIGNED partner publishes a GPS point and
  // the owning customer reads the persisted latest point. The socket event is
  // only a fast path — this REST pair is the authority the smoke can assert.
  const trackingPoint = {
    latitude: PARTNER_PROFILE.latitude,
    longitude: PARTNER_PROFILE.longitude,
    recorded_at: new Date().toISOString(),
  };
  const trackingWrite = await call('(i.1) POST /api/tow/requests/{id}/tracking', {
    method: 'post',
    url: `/api/tow/requests/${requestId}/tracking`,
    token: partner.token,
    data: trackingPoint,
    idempotencyKey: scenarioIdempotencyKey('tracking'),
  });
  assertStep(
    '(i.1) POST /api/tow/requests/{id}/tracking',
    trackingWrite.status === 202,
    `unexpected HTTP ${trackingWrite.status}`
  );
  const trackingRead = await call('(i.2) GET /api/tow/requests/{id}/tracking', {
    method: 'get',
    url: `/api/tow/requests/${requestId}/tracking`,
    token: customer.token,
  });
  const tracking = trackingRead.data && trackingRead.data.data;
  assertStep(
    '(i.2) GET /api/tow/requests/{id}/tracking',
    trackingRead.status === 200,
    `unexpected HTTP ${trackingRead.status}`
  );
  assertStep(
    '(i.2) GET /api/tow/requests/{id}/tracking',
    Boolean(tracking && tracking.latest)
      && Number(tracking.latest.latitude) === Number(trackingPoint.latitude)
      && Number(tracking.latest.longitude) === Number(trackingPoint.longitude),
    'customer tracking read does not match the persisted point'
  );
  pass('(i.1/i.2) tracking', `latest recorded_at=${tracking.latest.recorded_at}`);

  // (j) the assigned partner drives the four frozen milestones.
  const milestones = [
    ['en-route', {}, scenarioIdempotencyKey('enroute')],
    [
      'arrived',
      {
        location: {
          latitude: PARTNER_PROFILE.latitude,
          longitude: PARTNER_PROFILE.longitude,
          formatted_address: PARTNER_PROFILE.address,
        },
      },
      scenarioIdempotencyKey('arrived'),
    ],
    ['in-transit', {}, scenarioIdempotencyKey('intransit')],
    [
      'finish',
      {
        location: {
          latitude: DESTINATION.latitude,
          longitude: DESTINATION.longitude,
          formatted_address: DESTINATION.formatted_address,
        },
      },
      scenarioIdempotencyKey('finish'),
    ],
  ];
  for (const [edge, body, idempotencyKey] of milestones) {
    const step = `(j) POST /api/tow/requests/{id}/${edge}`;
    const response = await call(step, {
      method: 'post',
      url: `/api/tow/requests/${requestId}/${edge}`,
      token: partner.token,
      data: body,
      idempotencyKey,
    });
    assertStep(step, response.status === 200, `unexpected HTTP ${response.status}`);
    pass(step, `HTTP ${response.status}`);
  }

  // (k) customer selects the simulated cash payment (the only method of the MVP).
  const selectResponse = await call('(k) PUT /api/tow/requests/{id}/payment-method', {
    method: 'put',
    url: `/api/tow/requests/${requestId}/payment-method`,
    token: customer.token,
    data: { method: 'cash' },
    idempotencyKey: scenarioIdempotencyKey('paymethod'),
  });
  const selected = selectResponse.data && selectResponse.data.data;
  assertStep('(k) PUT /api/tow/requests/{id}/payment-method', selectResponse.status === 200, `unexpected HTTP ${selectResponse.status}`);
  assertStep(
    '(k) PUT /api/tow/requests/{id}/payment-method',
    selected && selected.status === 'CASH_SELECTED',
    `payment status=${selected && selected.status}`
  );
  pass('(k) PUT /api/tow/requests/{id}/payment-method', `status=${selected.status}`);

  // (l) the assigned partner confirms the cash handover on the COMPLETED Tow.
  const receivedResponse = await call('(l) POST /api/tow/requests/{id}/cash-received', {
    method: 'post',
    url: `/api/tow/requests/${requestId}/cash-received`,
    token: partner.token,
    idempotencyKey: scenarioIdempotencyKey('cashreceived'),
  });
  const received = receivedResponse.data && receivedResponse.data.data;
  assertStep('(l) POST /api/tow/requests/{id}/cash-received', receivedResponse.status === 200, `unexpected HTTP ${receivedResponse.status}`);
  assertStep(
    '(l) POST /api/tow/requests/{id}/cash-received',
    received && received.status === 'CASH_RECEIVED',
    `payment status=${received && received.status}`
  );
  assertStep(
    '(l) POST /api/tow/requests/{id}/cash-received',
    received && String(received.amount_cents) === String(proposal.price.amount_cents),
    `amount_cents=${received && received.amount_cents} != proposed ${proposal.price.amount_cents}`
  );
  pass('(l) POST /api/tow/requests/{id}/cash-received', `status=${received.status} amount_cents=${received.amount_cents}`);

  // (m) the customer's final read: COMPLETED with CASH_RECEIVED.
  const finalResponse = await call('(m) GET /api/tow/requests/{id}', {
    method: 'get',
    url: `/api/tow/requests/${requestId}`,
    token: customer.token,
  });
  const finalRequest = finalResponse.data && finalResponse.data.data;
  assertStep('(m) GET /api/tow/requests/{id}', finalResponse.status === 200, `unexpected HTTP ${finalResponse.status}`);
  assertStep(
    '(m) GET /api/tow/requests/{id}',
    finalRequest && finalRequest.state === 'COMPLETED',
    `state=${finalRequest && finalRequest.state}`
  );
  assertStep(
    '(m) GET /api/tow/requests/{id}',
    finalRequest && finalRequest.payment && finalRequest.payment.status === 'CASH_RECEIVED',
    `payment status=${finalRequest && finalRequest.payment && finalRequest.payment.status}`
  );
  pass('(m) GET /api/tow/requests/{id}', 'state=COMPLETED payment=CASH_RECEIVED');

  if (noReset) {
    console.log('[smoke] cleanup skipped (--no-reset)');
  } else {
    console.log('[smoke] cleanup: running the validation reset + seed (same path as tow:validation:reset)');
    await runReset();
  }

  console.log('SMOKE=PASS');
  console.log(`SCENARIO=${noReset ? 'CLEANUP_SKIPPED' : 'RESET_AND_SEEDED'}`);
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

module.exports = { main, BASE_URL, DESTINATION, scenarioIdempotencyKey };
