/**
 * TOW ROUND — HYBRID address resolution on `POST /tow/requests`.
 *
 * Product rule under test:
 *   - a client-sent `formatted_address` is preserved verbatim and the resolver
 *     is NOT called;
 *   - an endpoint without an address (absent/null/""/whitespace) is resolved
 *     best-effort by the `AddressResolver` port;
 *   - a provider failure NEVER fails the create: 201 with `formatted_address =
 *     null` and a safe log;
 *   - pickup and destination resolve independently;
 *   - an idempotent replay never spends a second geocoding call.
 *
 * The resolver is injected (a deterministic fake): no network, no key.
 *
 * RED-first: written before the create enrichment existed.
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
  DEFAULT_INSTANT,
  PICKUP,
  DESTINATION,
  IDEMPOTENCY_KEY,
  createTowRequestInput,
} = require('../../helpers/tow/mvp03');
const { createTowCustomerAuth } = require('../../helpers/tow/auth');

const ENDPOINT = '/api/tow/requests';

/** What the fake provider "resolves" — the canonical Rio Branco shape. */
const RESOLVED_CANDIDATE = Object.freeze({
  street: 'Rua Bartholomeu',
  number: '125',
  neighborhood: 'Floresta Sul',
  city: 'Rio Branco',
  state: 'Acre',
  state_code: 'AC',
  postal_code: '69900-000',
  country: 'Brasil',
  location_type: 'ROOFTOP',
  partial_match: false,
});

const RESOLVED_ADDRESS = 'Rua Bartholomeu, 125 - Floresta Sul';

describe('TOW ROUND — address resolution on create (hybrid)', () => {
  let app;
  let clock;
  let routeProvider;
  let resolverImpl;
  const resolverCalls = [];
  const addressResolver = {
    resolve: jest.fn((point) => {
      resolverCalls.push(point);
      return resolverImpl(point);
    }),
  };

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock(DEFAULT_INSTANT);
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider, addressResolver } }).listen(0);
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
    ]) {
      if (await testDb.db.schema.hasTable(table)) await testDb.db(table).del();
    }
    await testDb.db('service_modules').where({ module_key: 'tow' }).del();
    resolverCalls.length = 0;
    resolverImpl = async () => RESOLVED_CANDIDATE;
    routeProvider.reset();
    clock.reset();
  });

  function post(payload, { key = IDEMPOTENCY_KEY, auth } = {}) {
    let pending = request(app).post(ENDPOINT);
    if (key !== null) pending = pending.set('Idempotency-Key', key);
    if (auth) pending = pending.set(auth.headers);
    return pending.send(payload);
  }

  function withoutAddress(payload, endpoint) {
    delete payload[endpoint].formatted_address;
    return payload;
  }

  test('1 — a client address is preserved and the resolver is never called', async () => {
    const customer = await createTowCustomerAuth();
    const response = await post(createTowRequestInput(), { auth: customer });

    expect(response.status).toBe(201);
    expect(response.body.data.pickup.formatted_address).toBe(PICKUP.formatted_address);
    expect(response.body.data.destination.formatted_address).toBe(DESTINATION.formatted_address);
    expect(resolverCalls).toHaveLength(0);
    expect(addressResolver.resolve).not.toHaveBeenCalled();
  });

  test('2 — a missing pickup address is resolved and persisted; destination untouched', async () => {
    const customer = await createTowCustomerAuth();
    const payload = withoutAddress(createTowRequestInput(), 'pickup');

    const response = await post(payload, { auth: customer });

    expect(response.status).toBe(201);
    expect(response.body.data.pickup.formatted_address).toBe(RESOLVED_ADDRESS);
    expect(response.body.data.destination.formatted_address).toBe(DESTINATION.formatted_address);
    expect(resolverCalls).toHaveLength(1);
    expect(resolverCalls[0]).toEqual({ latitude: PICKUP.latitude, longitude: PICKUP.longitude });

    const persisted = await testDb.db('tow_requests').where({ id: response.body.data.id }).first();
    expect(persisted.pickup_formatted_address).toBe(RESOLVED_ADDRESS);
    expect(persisted.destination_formatted_address).toBe(DESTINATION.formatted_address);
  });

  test('3 — an explicit null address is resolved', async () => {
    const customer = await createTowCustomerAuth();
    const payload = createTowRequestInput({ pickup: { formatted_address: null } });

    const response = await post(payload, { auth: customer });

    expect(response.status).toBe(201);
    expect(response.body.data.pickup.formatted_address).toBe(RESOLVED_ADDRESS);
    expect(resolverCalls).toHaveLength(1);
  });

  test('4 — an empty string is normalized to absent and resolved', async () => {
    const customer = await createTowCustomerAuth();
    const payload = createTowRequestInput({ pickup: { formatted_address: '' } });

    const response = await post(payload, { auth: customer });

    expect(response.status).toBe(201);
    expect(response.body.data.pickup.formatted_address).toBe(RESOLVED_ADDRESS);
    expect(resolverCalls).toHaveLength(1);
  });

  test('5 — a whitespace-only string is normalized to absent and resolved', async () => {
    const customer = await createTowCustomerAuth();
    const payload = createTowRequestInput({ pickup: { formatted_address: '   ' } });

    const response = await post(payload, { auth: customer });

    expect(response.status).toBe(201);
    expect(response.body.data.pickup.formatted_address).toBe(RESOLVED_ADDRESS);
    expect(resolverCalls).toHaveLength(1);
  });

  test('6 — a resolver failure is a 201 with null and a safe log, never a create failure', async () => {
    const customer = await createTowCustomerAuth();
    const payload = withoutAddress(withoutAddress(createTowRequestInput(), 'pickup'), 'destination');
    resolverImpl = async () => {
      throw Object.assign(new Error('provider down'), { reason: 'timeout' });
    };
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await post(payload, { auth: customer });

    expect(response.status).toBe(201);
    expect(response.body.data.pickup.formatted_address).toBeNull();
    expect(response.body.data.destination.formatted_address).toBeNull();
    const logged = consoleError.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain('tow_address_resolution_failed reason=timeout');
    consoleError.mockRestore();

    const persisted = await testDb.db('tow_requests').where({ id: response.body.data.id }).first();
    expect(persisted.pickup_formatted_address).toBeNull();
    expect(persisted.destination_formatted_address).toBeNull();
  });

  test('7 — pickup success and destination failure resolve independently', async () => {
    const customer = await createTowCustomerAuth();
    const payload = withoutAddress(withoutAddress(createTowRequestInput(), 'pickup'), 'destination');
    resolverImpl = async (point) => {
      if (point.latitude === PICKUP.latitude) return RESOLVED_CANDIDATE;
      throw Object.assign(new Error('provider down'), { reason: 'network_failure' });
    };
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await post(payload, { auth: customer });

    expect(response.status).toBe(201);
    expect(response.body.data.pickup.formatted_address).toBe(RESOLVED_ADDRESS);
    expect(response.body.data.destination.formatted_address).toBeNull();
    expect(resolverCalls).toHaveLength(2);
    consoleError.mockRestore();
  });

  test('8 — a ZERO_RESULTS/NO_ADDRESS answer persists null, never coordinates', async () => {
    const customer = await createTowCustomerAuth();
    const payload = withoutAddress(createTowRequestInput(), 'pickup');
    resolverImpl = async () => null;

    const response = await post(payload, { auth: customer });

    expect(response.status).toBe(201);
    expect(response.body.data.pickup.formatted_address).toBeNull();
    expect(response.body.data.pickup).toEqual({
      latitude: PICKUP.latitude,
      longitude: PICKUP.longitude,
      formatted_address: null,
    });
  });

  test('9 — an idempotent replay never spends a second resolution', async () => {
    const customer = await createTowCustomerAuth();
    const payload = withoutAddress(createTowRequestInput(), 'pickup');

    const first = await post(payload, { auth: customer });
    expect(first.status).toBe(201);
    expect(resolverCalls).toHaveLength(1);

    clock.advanceMinutes(3);
    const replay = await post(payload, { auth: customer });

    expect(replay.status).toBe(201);
    expect(replay.body.data).toEqual(first.body.data);
    expect(resolverCalls).toHaveLength(1);

    const rows = await testDb.db('tow_requests').select('*');
    expect(rows).toHaveLength(1);
    expect(rows[0].pickup_formatted_address).toBe(RESOLVED_ADDRESS);
  });

  test('10 — without a wired resolver the create keeps the client value or null', async () => {
    const customer = await createTowCustomerAuth();
    const bareApp = createApp({ tow: { clock, routeProvider, addressResolver: null } }).listen(0);
    try {
      const withAddress = await request(bareApp)
        .post(ENDPOINT)
        .set('Idempotency-Key', 'idem-address-bare-01')
        .set(customer.headers)
        .send(createTowRequestInput());
      expect(withAddress.status).toBe(201);
      expect(withAddress.body.data.pickup.formatted_address).toBe(PICKUP.formatted_address);

      const withoutAddressPayload = withoutAddress(createTowRequestInput(), 'pickup');
      const withoutAddressResponse = await request(bareApp)
        .post(ENDPOINT)
        .set('Idempotency-Key', 'idem-address-bare-02')
        .set(customer.headers)
        .send(withoutAddressPayload);
      expect(withoutAddressResponse.status).toBe(201);
      expect(withoutAddressResponse.body.data.pickup.formatted_address).toBeNull();
      expect(resolverCalls).toHaveLength(0);
    } finally {
      await new Promise((resolve) => { bareApp.closeAllConnections?.(); bareApp.close(resolve); });
    }
  });

  test('11 — address enrichment never calls the route provider', async () => {
    const customer = await createTowCustomerAuth();
    const payload = withoutAddress(createTowRequestInput(), 'pickup');

    const response = await post(payload, { auth: customer });

    expect(response.status).toBe(201);
    expect(routeProvider.callCount()).toBe(0);
  });

  test('12 — the resolved address is recoverable through GET and the history list', async () => {
    const customer = await createTowCustomerAuth();
    const payload = withoutAddress(createTowRequestInput(), 'pickup');
    const created = await post(payload, { auth: customer });

    const read = await request(app).get(`${ENDPOINT}/${created.body.data.id}`).set(customer.headers);
    expect(read.status).toBe(200);
    expect(read.body.data.pickup.formatted_address).toBe(RESOLVED_ADDRESS);

    const list = await request(app).get(ENDPOINT).set(customer.headers);
    expect(list.status).toBe(200);
    expect(list.body.data.items[0].pickup.formatted_address).toBe(RESOLVED_ADDRESS);
  });
});
