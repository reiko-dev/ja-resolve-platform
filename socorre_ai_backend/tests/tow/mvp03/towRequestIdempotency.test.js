/**
 * MVP-03 — `Idempotency-Key` semantics for `POST /api/tow/requests`.
 *
 * The frozen contract makes the header mandatory and reserves
 * `idempotency_conflict` for "same key, different payload". This suite proves:
 *   - a retry with the same key and the same payload returns the SAME request;
 *   - the same key with a different payload is a 409 and never mutates the row;
 *   - the key is scoped per customer, never global;
 *   - a new key always creates a new request (the zero-match retry path);
 *   - the unique constraint — not a read-then-write race — is the authority.
 *
 * RED-first: written before the idempotency port, fingerprint and constraint
 * exist.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const request = require('supertest');
const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { buildTowServices } = require('../../../src/modules/tow/composition');
const { createTowCustomerAuth } = require('../../helpers/tow/auth');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const { DEFAULT_INSTANT, createTowRequestInput } = require('../../helpers/tow/mvp03');

const ENDPOINT = '/api/tow/requests';
const KEY = 'idem-conflict-000001';

describe('MVP-03 — Tow request idempotency', () => {
  let app;
  let services;
  let clock;
  let customer;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock(DEFAULT_INSTANT);
    app = createApp({ tow: { clock, routeProvider: createFakeRouteProvider() } });
    services = buildTowServices({ db: testDb.db, clock, routeProvider: createFakeRouteProvider() });
    customer = await createTowCustomerAuth({ name: 'Idempotent MVP03' });
  });

  afterAll(async () => {
    await testDb.reset();
  });

  beforeEach(async () => {
    await testDb.db('tow_requests').del();
    await testDb.db('service_modules').where({ module_key: 'tow' }).del();
    clock.reset();
  });

  function post(payload, { key = KEY, auth = customer } = {}) {
    let pending = request(app).post(ENDPOINT).set(auth.headers);
    if (key !== null) pending = pending.set('Idempotency-Key', key);
    return pending.send(payload);
  }

  async function rows() {
    return testDb.db('tow_requests').select('*').orderBy('id');
  }

  test('a retry with the same key and payload returns the same request', async () => {
    const first = await post(createTowRequestInput());
    expect(first.status).toBe(201);

    const retry = await post(createTowRequestInput());
    expect(retry.status).toBe(201);
    expect(retry.body.data).toEqual(first.body.data);
    expect(await rows()).toHaveLength(1);
  });

  test('a retry after a zero-match search returns the same SEARCHING request', async () => {
    const first = await post(createTowRequestInput());
    expect(first.body.data.state).toBe('SEARCHING');

    clock.advanceMinutes(5);
    const retry = await post(createTowRequestInput());
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(retry.body.data.state).toBe('SEARCHING');
    expect(await rows()).toHaveLength(1);
  });

  test('the same key with a different payload is a 409 idempotency_conflict', async () => {
    const first = await post(createTowRequestInput());
    expect(first.status).toBe(201);

    const conflict = await post(createTowRequestInput({
      problem_description: 'Pneu furado na marginal',
    }));
    expect(conflict.status).toBe(409);
    expect(conflict.body.success).toBe(false);
    expect(conflict.body.error.code).toBe('idempotency_conflict');

    const persisted = await rows();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].problem_description).toBe('Carro não liga na garagem do prédio');
  });

  test('a change in the pickup, vehicle or observations is also a conflict', async () => {
    await post(createTowRequestInput());
    for (const payload of [
      createTowRequestInput({ pickup: { latitude: -23.6, longitude: -46.65 } }),
      createTowRequestInput({ vehicle: { model: 'Cronos' } }),
      createTowRequestInput({ observations: 'outro texto' }),
    ]) {
      const conflict = await post(payload);
      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe('idempotency_conflict');
    }
    expect(await rows()).toHaveLength(1);
  });

  test('the key is scoped per customer and never global', async () => {
    const other = await createTowCustomerAuth({ name: 'Other Idempotent MVP03' });
    const first = await post(createTowRequestInput());
    const second = await post(createTowRequestInput(), { auth: other });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).not.toBe(first.body.data.id);
    expect(second.body.data.customer_id).toBe(String(other.user.id));

    const persisted = await rows();
    expect(persisted).toHaveLength(2);
    expect(persisted.map((row) => row.idempotency_key)).toEqual([KEY, KEY]);
  });

  test('a new key always creates a new request', async () => {
    const first = await post(createTowRequestInput());
    const second = await post(createTowRequestInput(), { key: 'idem-brand-new-000002' });

    expect(second.status).toBe(201);
    expect(second.body.data.id).not.toBe(first.body.data.id);
    expect(await rows()).toHaveLength(2);
  });

  test('concurrent retries of the same key create exactly one request', async () => {
    const responses = await Promise.all([
      post(createTowRequestInput()),
      post(createTowRequestInput()),
      post(createTowRequestInput()),
    ]);

    for (const response of responses) expect(response.status).toBe(201);
    const ids = new Set(responses.map((response) => response.body.data.id));
    expect(ids.size).toBe(1);
    expect(await rows()).toHaveLength(1);
  });

  test('the module gate is evaluated before the idempotent replay', async () => {
    const first = await post(createTowRequestInput());
    expect(first.status).toBe(201);

    await services.moduleService.setEnabled({ enabled: false, reason: 'MVP-03 replay gate' });
    const replay = await post(createTowRequestInput());
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe('service_module_disabled');
    expect(await rows()).toHaveLength(1);
  });

  test('the persisted fingerprint is a hash, never the raw payload', async () => {
    await post(createTowRequestInput());
    const [persisted] = await rows();
    expect(typeof persisted.idempotency_fingerprint).toBe('string');
    expect(persisted.idempotency_fingerprint).toHaveLength(64);
    expect(persisted.idempotency_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(persisted.idempotency_fingerprint).not.toMatch(/Carro/);
  });
});
