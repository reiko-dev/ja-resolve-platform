/**
 * MVP-03 — real PostgreSQL proof for the canonical TowRequest + geographic
 * matching (OPT-IN, `TOW_POSTGRES_E2E=1`).
 *
 * The default suite runs on the SQLite harness; the properties proven here can
 * only be proven on the production engine:
 *   - migration 004 applies from a truly empty schema and owns the
 *     `(customer_id, idempotency_key)` uniqueness authority;
 *   - `numeric(10,8)` / `numeric(11,8)` coordinates round-trip exactly through
 *     the adapter, so the geodesic filter sees the same numbers that were
 *     written;
 *   - concurrent identical requests collapse to ONE row (the constraint, not a
 *     read-then-write race, is the authority);
 *   - the partner opportunity feed is filtered and quoted through the real
 *     production path against real PostgreSQL data.
 *
 * No Google call: the RouteProvider is the deterministic fake.
 */
'use strict';

const request = require('supertest');

const postgres = require('../../helpers/tow/postgres');

const enabled = postgres.isEnabled();
const describePostgres = enabled ? describe : describe.skip;

const CUSTOMER_INPUT = Object.freeze({
  pickup: { latitude: -23.561684, longitude: -46.655981, formatted_address: 'Av. Paulista, 1578 - São Paulo - SP' },
  destination: { latitude: -23.6639, longitude: -46.531, formatted_address: 'Rua das Figueiras, 100 - Santo André - SP' },
  vehicle: { class: 'light_vehicle', make: 'Fiat', model: 'Argo', year: 2021, weight_kg: 1200, plate: 'ABC1D23' },
  problem_description: 'Carro não liga na garagem do prédio',
  observations: null,
  payment_method: 'cash',
});

const TARIFF = Object.freeze({
  minimum_charge_cents: 15000,
  included_km: 10,
  price_per_additional_km_cents: 800,
});

/** ~14.45 km south of the canonical pickup: inside a 15 km radius. */
const NEAR = Object.freeze({ latitude: CUSTOMER_INPUT.pickup.latitude - 0.13, longitude: CUSTOMER_INPUT.pickup.longitude });
/** ~17.8 km south of the canonical pickup: outside a 15 km radius. */
const FAR = Object.freeze({ latitude: CUSTOMER_INPUT.pickup.latitude - 0.16, longitude: CUSTOMER_INPUT.pickup.longitude });

describePostgres('MVP-03 PostgreSQL — canonical TowRequest and matching', () => {
  let db;
  let appDb;
  let services;
  let app;
  let routeProvider;
  let clock;
  let sequence = 0;

  const nextSequence = () => {
    sequence += 1;
    return sequence;
  };

  beforeAll(async () => {
    db = postgres.createConnection();
    await postgres.resetSchema(db);
    await postgres.migrateFromScratch(db);

    // Required AFTER the target env is resolved by the helper above.
    const { buildTowServices } = require('../../../src/modules/tow/composition');
    const { createApp } = require('../../../src/app');
    const { createFakeClock } = require('../../helpers/tow/clock');
    const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');

    clock = createFakeClock('2026-01-15T12:00:00.000Z');
    routeProvider = createFakeRouteProvider();
    services = buildTowServices({ db, clock, routeProvider });
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
    // `createApp()` composes against the singleton connection; it must be
    // closed explicitly or Jest never exits (the pool keeps the loop alive).
    appDb = require('../../../src/config/database');
  });

  afterAll(async () => {
    if (app) await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
    if (appDb) await appDb.destroy();
    if (db) await db.destroy();
  });

  beforeEach(async () => {
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

  async function createUser({ role, name }) {
    const id = nextSequence();
    const [row] = await db('users').insert({
      name,
      email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id}@mvp03.pg.test`,
      password: 'not-a-real-hash',
      phone: '11990000000',
      role,
    }).returning('*');
    return row;
  }

  async function createCustomer(name = 'PG Customer') {
    const user = await createUser({ role: 'user', name });
    const jwt = require('jsonwebtoken');
    const { getJwtSecret } = require('../../../src/config/jwt');
    return {
      user,
      headers: { Authorization: `Bearer ${jwt.sign({ userId: user.id, role: 'user' }, getJwtSecret(), { expiresIn: '1h' })}` },
    };
  }

  async function createTowPartnerAuth({ latitude, longitude, isAvailable = 1, isOnline = 1, withVehicle = true }) {
    const user = await createUser({ role: 'partner', name: 'PG Tow Partner' });
    const [partner] = await db('partners').insert({
      user_id: user.id,
      type: 'tow',
      business_name: 'Guincho PG',
      address: 'Av. Paulista, 1578 - São Paulo - SP',
      phone: '11990000001',
      latitude,
      longitude,
      is_verified: true,
      is_available: isAvailable,
      is_online: isOnline,
      approval_status: 'approved',
    }).returning('*');

    if (withVehicle) {
      const vehicle = await services.vehicleRepository.insert({
        partner_id: partner.id,
        plate: `PG${String(partner.id).padStart(5, '0')}`,
        make: 'Ford',
        model: 'F-4000',
        year: 2020,
        equipment_type: 'flatbed',
        supported_vehicle_classes: ['light_vehicle', 'motorcycle'],
        max_towed_weight_kg: 4000,
        active: true,
        pricing: TARIFF,
      });
      await services.documentRepository.insert({
        tow_vehicle_id: vehicle.id,
        partner_id: partner.id,
        document_type: 'vehicle_license',
        filename: `pg-${partner.id}`,
        original_name: 'crlv.jpg',
        file_path: `pg-${partner.id}`,
        file_url: `pg-${partner.id}`,
        mime_type: 'image/jpeg',
        file_size: 1,
        status: 'approved',
      });
    }

    const jwt = require('jsonwebtoken');
    const { getJwtSecret } = require('../../../src/config/jwt');
    return {
      user,
      partner,
      headers: { Authorization: `Bearer ${jwt.sign({ userId: user.id, role: 'partner' }, getJwtSecret(), { expiresIn: '1h' })}` },
    };
  }

  function postRequest(customer, { key, payload = CUSTOMER_INPUT } = {}) {
    return request(app)
      .post('/api/tow/requests')
      .set(customer.headers)
      .set('Idempotency-Key', key)
      .send(payload);
  }

  test('migration 004 applies from an empty schema and owns the uniqueness authority', async () => {
    const tables = await postgres.listTables(db);
    expect(tables).toContain('tow_requests');

    const columns = await db('information_schema.columns')
      .where({ table_name: 'tow_requests' })
      .select('column_name', 'data_type', 'is_nullable');
    const byName = Object.fromEntries(columns.map((column) => [column.column_name, column]));

    expect(byName.customer_id.is_nullable).toBe('NO');
    expect(byName.state.is_nullable).toBe('NO');
    expect(byName.idempotency_key.is_nullable).toBe('NO');
    expect(byName.idempotency_fingerprint.is_nullable).toBe('NO');
    expect(byName.matching_radius_km.is_nullable).toBe('NO');
    expect(byName.pickup_latitude.data_type).toBe('numeric');
    expect(byName.pickup_longitude.data_type).toBe('numeric');
    expect(byName.destination_latitude.data_type).toBe('numeric');

    // Assert the CONSTRAINT COLUMNS, not its name: the name is an
    // implementation detail, the covered column set is the invariant.
    const constraints = await db.raw(`
      SELECT c.conname, string_agg(a.attname, ',' ORDER BY k.ord) AS columns
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE t.relname = 'tow_requests' AND c.contype = 'u'
      GROUP BY c.conname
    `);
    expect(constraints.rows.map((row) => row.columns)).toContain('customer_id,idempotency_key');
  });

  test('a created request round-trips its coordinates and frozen radius exactly', async () => {
    const customer = await createCustomer('Round Trip');
    const response = await postRequest(customer, { key: 'pg-round-trip-000001' });

    expect(response.status).toBe(201);
    expect(response.body.data.pickup.latitude).toBeCloseTo(CUSTOMER_INPUT.pickup.latitude, 8);
    expect(response.body.data.pickup.longitude).toBeCloseTo(CUSTOMER_INPUT.pickup.longitude, 8);
    expect(response.body.data.matching).toEqual({ current_radius_km: 15, max_radius_km: 50, search_expires_at: null });

    const [row] = await db('tow_requests').select('*');
    expect(Number(row.pickup_latitude)).toBeCloseTo(CUSTOMER_INPUT.pickup.latitude, 8);
    expect(Number(row.pickup_longitude)).toBeCloseTo(CUSTOMER_INPUT.pickup.longitude, 8);
    expect(Number(row.matching_radius_km)).toBe(15);
  });

  test('concurrent identical requests collapse to exactly one row', async () => {
    const customer = await createCustomer('Concurrent');
    const responses = await Promise.all([1, 2, 3, 4, 5].map(
      () => postRequest(customer, { key: 'pg-concurrent-000001' })
    ));

    for (const response of responses) {
      expect([201, 409]).toContain(response.status);
    }
    const created = responses.filter((response) => response.status === 201);
    expect(created.length).toBeGreaterThanOrEqual(1);
    expect(new Set(created.map((response) => response.body.data.id)).size).toBe(1);

    const rows = await db('tow_requests').select('id');
    expect(rows).toHaveLength(1);
  });

  test('the same key with a different payload is a 409 conflict on real PostgreSQL', async () => {
    const customer = await createCustomer('Conflict');
    await postRequest(customer, { key: 'pg-conflict-000001' });

    const conflict = await postRequest(customer, {
      key: 'pg-conflict-000001',
      payload: { ...CUSTOMER_INPUT, problem_description: 'Pneu furado' },
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('idempotency_conflict');
    expect(await db('tow_requests').select('id')).toHaveLength(1);
  });

  test('the geodesic radius filter matches the frozen radius against real numeric columns', async () => {
    const customer = await createCustomer('Radius');
    await postRequest(customer, { key: 'pg-radius-000001' });

    const near = await createTowPartnerAuth(NEAR);
    const nearFeed = await request(app).get('/api/tow/partner/opportunities').set(near.headers);
    expect(nearFeed.status).toBe(200);
    expect(nearFeed.body.data.items).toHaveLength(1);
    expect(nearFeed.body.data.items[0].proposed_price).toEqual({ amount_cents: 18480, currency: 'BRL' });
    expect(routeProvider.callCount()).toBe(1);

    routeProvider.reset();
    const far = await createTowPartnerAuth(FAR);
    const farFeed = await request(app).get('/api/tow/partner/opportunities').set(far.headers);
    expect(farFeed.status).toBe(200);
    expect(farFeed.body.data.items).toEqual([]);
    expect(routeProvider.callCount()).toBe(0);
  });

  test('the customer list is scoped, newest first, on real PostgreSQL', async () => {
    const first = await createCustomer('Owner One');
    const second = await createCustomer('Owner Two');

    const older = await postRequest(first, { key: 'pg-list-000001' });
    clock.advanceMinutes(1);
    const newer = await postRequest(first, { key: 'pg-list-000002' });
    await postRequest(second, { key: 'pg-list-000003' });

    const list = await request(app).get('/api/tow/requests').set(first.headers);
    expect(list.status).toBe(200);
    expect(list.body.data.items.map((item) => item.id)).toEqual([newer.body.data.id, older.body.data.id]);
    expect(list.body.data.meta.total).toBe(2);

    const stranger = await request(app).get(`/api/tow/requests/${older.body.data.id}`).set(second.headers);
    expect(stranger.status).toBe(403);
    expect(stranger.body.error.code).toBe('not_request_owner');
  });

  test('the module gate refuses creation on real PostgreSQL without persisting', async () => {
    const customer = await createCustomer('Gated');
    await services.moduleService.setEnabled({ enabled: false, reason: 'MVP-03 PG gate' });

    const response = await postRequest(customer, { key: 'pg-gate-000001' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('service_module_disabled');
    expect(await db('tow_requests').select('id')).toHaveLength(0);
  });
});

if (!enabled) {
  describe('MVP-03 PostgreSQL suite (skipped)', () => {
    test('enable with TOW_POSTGRES_E2E=1 and the disposable compose harness', () => {
      expect(postgres.isEnabled()).toBe(false);
    });
  });
}
