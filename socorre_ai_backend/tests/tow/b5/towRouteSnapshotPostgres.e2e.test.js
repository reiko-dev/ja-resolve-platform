/**
 * B5 — route snapshot read on REAL PostgreSQL (OPT-IN, `TOW_POSTGRES_E2E=1`).
 *
 * The offline suite certifies the behaviour on the SQLite harness. This entry
 * proves the same read against the production engine, where the request's
 * `numeric` coordinates arrive from node-postgres as strings and must be mapped
 * before the contract DTO is built, and where the assignment lookup runs on the
 * real `tow_assignments` table.
 *
 * No Google call: the RouteProvider is the deterministic fake.
 */
'use strict';

const request = require('supertest');
const postgres = require('../../helpers/tow/postgres');

const enabled = postgres.isEnabled();
const describePostgres = enabled ? describe : describe.skip;

const CUSTOMER_INPUT = Object.freeze({
  pickup: {
    latitude: -23.561684,
    longitude: -46.655981,
    formatted_address: 'Av. Paulista, 1578 - São Paulo - SP',
  },
  destination: {
    latitude: -23.6639,
    longitude: -46.531,
    formatted_address: 'Rua das Figueiras, 100 - Santo André - SP',
  },
  vehicle: { class: 'light_vehicle', make: 'Fiat', model: 'Argo', year: 2021, weight_kg: 1200, plate: 'B5PG001' },
  problem_description: 'Carro não liga na garagem do prédio',
  payment_method: 'cash',
  observations: null,
});

describePostgres('B5 PostgreSQL — tow request route snapshot', () => {
  let db;
  let appDb;
  let app;
  let clock;
  let routeProvider;
  let sequence = 0;

  beforeAll(async () => {
    db = postgres.createConnection();
    await postgres.resetSchema(db);
    await postgres.migrateFromScratch(db);

    // Required AFTER the target env is resolved by the helper above.
    const { createApp } = require('../../../src/app');
    const { createFakeClock } = require('../../helpers/tow/clock');
    const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');

    clock = createFakeClock('2026-01-15T12:00:00.000Z');
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
    appDb = require('../../../src/config/database');
  });

  afterAll(async () => {
    await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
    if (appDb) await appDb.destroy();
    if (db) await db.destroy();
  });

  beforeEach(async () => {
    await db('tow_payments').del();
    await db('tow_request_tracking').del();
    await db('tow_assignments').del();
    await db('tow_request_proposals').del();
    await db('tow_requests').del();
    await db('tow_vehicle_documents').del();
    await db('tow_vehicles').del();
    await db('partners').del();
    await db('users').del();
    await db('service_modules').del();
    routeProvider.reset();
    routeProvider.failure = null;
    clock.reset();
  });

  function signFor(user) {
    const jwt = require('jsonwebtoken');
    const { getJwtSecret } = require('../../../src/config/jwt');
    return { Authorization: `Bearer ${jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), { expiresIn: '1h' })}` };
  }

  async function createCustomer(name) {
    sequence += 1;
    const [user] = await db('users').insert({
      name,
      email: `b5-pg-customer-${sequence}@b5.pg.test`,
      password: 'not-a-real-hash',
      phone: '11990000000',
      role: 'user',
    }).returning('*');
    return { user, headers: signFor(user) };
  }

  async function createTowPartner(name) {
    sequence += 1;
    const [user] = await db('users').insert({
      name,
      email: `b5-pg-partner-${sequence}@b5.pg.test`,
      password: 'not-a-real-hash',
      phone: '11990000001',
      role: 'partner',
    }).returning('*');
    const [partner] = await db('partners').insert({
      user_id: user.id,
      type: 'tow',
      business_name: name,
      phone: '11990000001',
      is_verified: true,
      is_available: true,
      is_online: true,
      approval_status: 'approved',
    }).returning('*');
    return { user, partner, headers: signFor(user) };
  }

  async function createRequest(customer, key) {
    const response = await request(app)
      .post('/api/tow/requests')
      .set(customer.headers)
      .set('Idempotency-Key', key)
      .send(CUSTOMER_INPUT);
    expect(response.status).toBe(201);
    return response.body.data;
  }

  test('the owner customer reads the snapshot with the exact PG coordinates', async () => {
    const customer = await createCustomer('B5 PG Customer');
    const created = await createRequest(customer, `b5-pg-request-${sequence + 1}`);

    const response = await request(app)
      .get(`/api/tow/requests/${created.id}/route`)
      .set(customer.headers);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      request_id: String(created.id),
      pickup: { ...CUSTOMER_INPUT.pickup },
      destination: { ...CUSTOMER_INPUT.destination },
      route_quote: {
        pickup_to_destination: { distance_meters: 7350, duration_seconds: 1200 },
        total_distance_meters: 7350,
        total_duration_seconds: 1200,
      },
      encoded_polyline: 'fake-encoded-polyline',
      generated_at: clock.isoNow(),
    });
    expect(JSON.stringify(response.body)).not.toMatch(/amount_cents|final_price/);
    expect(routeProvider.callCount('computeRoute')).toBe(1);
  });

  test('foreign customer 403, unassigned partner 403, unknown 404, provider failure 503 with no geometry', async () => {
    const owner = await createCustomer('B5 PG Owner');
    const created = await createRequest(owner, `b5-pg-request-${sequence + 1}`);

    const foreignCustomer = await createCustomer('B5 PG Foreign');
    const foreign = await request(app)
      .get(`/api/tow/requests/${created.id}/route`)
      .set(foreignCustomer.headers);
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe('not_request_owner');

    const partner = await createTowPartner('B5 PG Partner');
    const unassigned = await request(app)
      .get(`/api/tow/requests/${created.id}/route`)
      .set(partner.headers);
    expect(unassigned.status).toBe(403);
    expect(unassigned.body.error.code).toBe('not_assigned_partner');

    const unknown = await request(app)
      .get('/api/tow/requests/99999999/route')
      .set(owner.headers);
    expect(unknown.status).toBe(404);

    routeProvider.failure = { code: 'PROVIDER_DOWN', message: 'down' };
    const failed = await request(app)
      .get(`/api/tow/requests/${created.id}/route`)
      .set(owner.headers);
    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe('external_dependency_unavailable');
    expect(failed.body.data).toBeUndefined();
    expect(JSON.stringify(failed.body)).not.toContain('encoded_polyline');
  });
});
