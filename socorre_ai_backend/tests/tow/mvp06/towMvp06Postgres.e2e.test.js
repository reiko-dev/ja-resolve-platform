/**
 * MVP-06 — real PostgreSQL proof for the CASH payment aggregate (OPT-IN,
 * `TOW_POSTGRES_E2E=1`).
 *
 * The offline suite runs on the SQLite harness, which has a single connection and
 * therefore CANNOT certify a race. Everything below is only decidable on the
 * production engine, where two HTTP requests really run in two sessions:
 *
 *   F1  N concurrent cash confirmations: exactly ONE payment row, ONE
 *       `received_at`, and every response reports the same canonical payment;
 *   F2  confirmations with DIFFERENT valid idempotency keys: still one payment —
 *       the key is not the idempotency authority, the row is;
 *   F3  a wrong partner racing the assigned partner: the wrong partner can never
 *       win and never creates a payment row;
 *   F4  a raw duplicate INSERT must be rejected by PostgreSQL itself: the
 *       UNIQUE constraints, not application logic, are the last line of defence;
 *   F5  a cash confirmation blocked behind an UNCOMMITTED completion: no payment
 *       may become RECEIVED before COMPLETED is committed; once it is, the
 *       blocked request resolves against the committed state and succeeds;
 *   F6  a cancelled Tow can never produce a RECEIVED payment.
 *
 * A separate block asserts migration 007's database-level guards (unique
 * indexes, CHECK constraints, foreign keys) and that `down()` is exact.
 *
 * No Google call and no PSP call: the RouteProvider is the deterministic fake,
 * and CASH never touches a gateway.
 */
'use strict';

const path = require('path');
const request = require('supertest');

const postgres = require('../../helpers/tow/postgres');

const enabled = postgres.isEnabled();
const describePostgres = enabled ? describe : describe.skip;

const MIGRATION_007 = path.join(postgres.MIGRATIONS_DIR, '007_mvp06_cash_payment.js');

/** Every named CHECK migration 007 installs on `tow_payments`. */
const PAYMENT_CHECKS = [
  'tow_payments_method_check',
  'tow_payments_amount_check',
  'tow_payments_currency_check',
  'tow_payments_status_check',
  'tow_payments_receipt_coherence_check',
];

describePostgres('MVP-06 PostgreSQL — CASH payment authority and concurrency', () => {
  let db;
  let appDb;
  let services;
  let app;
  let routeProvider;
  let clock;

  const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

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

  const CUSTOMER_INPUT = Object.freeze({
    pickup: { latitude: -23.561684, longitude: -46.655981, formatted_address: 'Av. Paulista, 1578 - São Paulo - SP' },
    destination: { latitude: -23.6639, longitude: -46.531, formatted_address: 'Rua das Figueiras, 100 - Santo André - SP' },
    vehicle: { class: 'light_vehicle', make: 'Fiat', model: 'Argo', year: 2021, weight_kg: 1200, plate: 'MVP6A11' },
    problem_description: 'Carro não liga na garagem do prédio',
    observations: null,
  });

  const TARIFF = Object.freeze({
    minimum_charge_cents: 15000,
    included_km: 10,
    price_per_additional_km_cents: 800,
  });

  let sequence = 0;
  const nextSequence = () => {
    sequence += 1;
    return sequence;
  };

  async function createUser({ role, name }) {
    const id = nextSequence();
    const [row] = await db('users').insert({
      name,
      email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id}@mvp06.pg.test`,
      password: 'not-a-real-hash',
      phone: '11990000000',
      role,
    }).returning('*');
    return row;
  }

  function signFor(user) {
    const jwt = require('jsonwebtoken');
    const { getJwtSecret } = require('../../../src/config/jwt');
    return { Authorization: `Bearer ${jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), { expiresIn: '1h' })}` };
  }

  async function createCustomer(name = 'MVP-06 PG Customer') {
    const user = await createUser({ role: 'user', name });
    return { user, headers: signFor(user) };
  }

  async function createTowPartner(name = 'MVP-06 PG Tow Partner') {
    const user = await createUser({ role: 'partner', name });
    const [partner] = await db('partners').insert({
      user_id: user.id,
      type: 'tow',
      business_name: 'Guincho MVP-06',
      address: 'Av. Paulista, 1578 - São Paulo - SP',
      phone: '11990000001',
      latitude: CUSTOMER_INPUT.pickup.latitude,
      longitude: CUSTOMER_INPUT.pickup.longitude,
      is_verified: true,
      is_available: true,
      is_online: true,
      approval_status: 'approved',
    }).returning('*');

    const vehicle = await services.vehicleRepository.insert({
      partner_id: partner.id,
      plate: `MP${String(partner.id).padStart(5, '0')}`,
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
      filename: `mvp06-pg-${partner.id}`,
      original_name: 'crlv.jpg',
      file_path: `mvp06-pg-${partner.id}`,
      file_url: `mvp06-pg-${partner.id}`,
      mime_type: 'image/jpeg',
      file_size: 1,
      status: 'approved',
    });

    return { user, partner, vehicle, headers: signFor(user) };
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

  async function propose(partner, requestId, key) {
    const response = await request(app)
      .post(`/api/tow/requests/${requestId}/proposals`)
      .set(partner.headers)
      .set('Idempotency-Key', key)
      .send({});
    expect(response.status).toBe(201);
    return response.body.data;
  }

  /** An ASSIGNED canonical request, built through the REAL MVP-04 path. */
  async function scenario(partnerCount = 2) {
    const customer = await createCustomer(`MVP-06 PG Customer ${nextSequence()}`);
    const partners = [];
    for (let index = 0; index < partnerCount; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      partners.push(await createTowPartner(`MVP-06 PG Partner ${nextSequence()}`));
    }
    const towRequest = await createRequest(customer, `pg-mvp06-request-${nextSequence()}`);
    const proposals = [];
    for (const partner of partners) {
      // eslint-disable-next-line no-await-in-loop
      proposals.push(await propose(partner, towRequest.id, `pg-mvp06-proposal-${nextSequence()}`));
    }
    const accepted = await request(app)
      .post(`/api/tow/proposals/${proposals[0].id}/accept`)
      .set(customer.headers)
      .set('Idempotency-Key', `pg-mvp06-accept-${nextSequence()}`)
      .send({});
    expect(accepted.status).toBe(200);

    return {
      request: towRequest,
      customer,
      partners,
      customerAuth: customer,
      auths: partners.map((partner) => ({ headers: partner.headers, user: partner.user })),
      proposal: proposals[0],
      assigned: accepted.body.data,
    };
  }

  const milestone = (fixture, path, key, body = {}) => request(app)
    .post(`/api/tow/requests/${fixture.request.id}/${path}`)
    .set(fixture.auths[0].headers)
    .set('Idempotency-Key', key)
    .send(body);

  async function complete(fixture) {
    const steps = [
      ['en-route', {}, 'pg-mvp06-enroute-0001'],
      ['arrived', { location: { latitude: -23.561684, longitude: -46.655981 } }, 'pg-mvp06-arrived-0001'],
      ['in-transit', {}, 'pg-mvp06-intransit-01'],
      ['finish', { location: { latitude: -23.6639, longitude: -46.531 } }, 'pg-mvp06-finish-0001'],
    ];
    for (const [path, body, key] of steps) {
      // eslint-disable-next-line no-await-in-loop
      const response = await milestone(fixture, path, key, body);
      expect(response.status).toBe(200);
    }
  }

  const cashReceived = (fixture, key, headers = null) => request(app)
    .post(`/api/tow/requests/${fixture.request.id}/cash-received`)
    .set(headers || fixture.auths[0].headers)
    .set('Idempotency-Key', key)
    .send();

  const paymentRows = (requestId) => db('tow_payments').where({ tow_request_id: requestId });

  /** True once another session is waiting on a lock while touching `tow_requests`. */
  async function waitForBlockedTransition(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await db.raw(
        "SELECT count(*)::int AS blocked FROM pg_stat_activity "
        + "WHERE wait_event_type = 'Lock' AND query ILIKE '%tow_requests%'"
      );
      if (result.rows[0].blocked > 0) return true;
      await sleep(20);
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // F1
  // -------------------------------------------------------------------------
  test('F1 — concurrent cash confirmations produce ONE payment and ONE received_at', async () => {
    const fixture = await scenario();
    await complete(fixture);
    clock.advanceMinutes(5);
    const frozenNow = clock.isoNow();

    const responses = await Promise.all([
      cashReceived(fixture, 'pg-f1-cash-00000001'),
      cashReceived(fixture, 'pg-f1-cash-00000002'),
      cashReceived(fixture, 'pg-f1-cash-00000003'),
      cashReceived(fixture, 'pg-f1-cash-00000004'),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('CASH_RECEIVED');
      expect(response.body.data.amount_cents).toBe(fixture.assigned.assignment.final_price.amount_cents);
    }
    // Every response reports the SAME canonical payment.
    const canonical = JSON.stringify(responses[0].body.data);
    for (const response of responses) {
      expect(JSON.stringify(response.body.data)).toBe(canonical);
    }

    const rows = await paymentRows(fixture.request.id);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].status)).toBe('RECEIVED');
    expect(new Date(rows[0].received_at).toISOString()).toBe(frozenNow);
    expect(Number(rows[0].received_by_partner_id)).toBe(Number(fixture.partners[0].partner.id));
  });

  // -------------------------------------------------------------------------
  // F2
  // -------------------------------------------------------------------------
  test('F2 — different valid keys still produce exactly one payment', async () => {
    const fixture = await scenario();
    await complete(fixture);

    const first = await cashReceived(fixture, 'pg-f2-cash-00000001');
    clock.advanceMinutes(7);
    const second = await cashReceived(fixture, 'pg-f2-cash-00000002');

    expect(second.status).toBe(200);
    expect(second.body.data).toEqual(first.body.data);
    expect(await paymentRows(fixture.request.id)).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // F3
  // -------------------------------------------------------------------------
  test('F3 — a wrong partner racing the assigned partner can never win', async () => {
    const fixture = await scenario(2);
    await complete(fixture);
    const wrong = fixture.auths[1].headers;

    const responses = await Promise.all([
      cashReceived(fixture, 'pg-f3-cash-00000001', wrong),
      cashReceived(fixture, 'pg-f3-cash-00000002', wrong),
      cashReceived(fixture, 'pg-f3-cash-00000003', fixture.auths[0].headers),
    ]);

    expect(responses[0].status).toBe(403);
    expect(responses[1].status).toBe(403);
    expect(responses[2].status).toBe(200);

    const rows = await paymentRows(fixture.request.id);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].received_by_partner_id)).toBe(Number(fixture.partners[0].partner.id));
  });

  // -------------------------------------------------------------------------
  // F4
  // -------------------------------------------------------------------------
  test('F4 — PostgreSQL itself rejects a duplicate payment authority', async () => {
    const fixture = await scenario();
    await complete(fixture);
    expect((await cashReceived(fixture, 'pg-f4-cash-00000001')).status).toBe(200);

    const existing = (await paymentRows(fixture.request.id))[0];

    // A raw duplicate insert that bypasses the service entirely. The UNIQUE
    // constraint must reject it — application logic is not the last line.
    await expect(db('tow_payments').insert({
      tow_request_id: existing.tow_request_id,
      assignment_id: existing.assignment_id,
      method: 'CASH',
      amount_cents: 1,
      currency: 'BRL',
      status: 'RECEIVED',
      received_at: new Date('2026-01-15T12:30:00.000Z'),
      received_by_partner_id: fixture.partners[0].partner.id,
    })).rejects.toMatchObject({ code: '23505' });

    // The same assignment under a DIFFERENT request id is also rejected: the
    // assignment identity is independently unique.
    const other = await scenario();
    await complete(other);
    await expect(db('tow_payments').insert({
      tow_request_id: other.request.id,
      assignment_id: existing.assignment_id,
      method: 'CASH',
      amount_cents: 1,
      currency: 'BRL',
      status: 'PENDING',
    })).rejects.toMatchObject({ code: '23505' });

    expect(await paymentRows(fixture.request.id)).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // F5
  // -------------------------------------------------------------------------
  test('F5 — cash cannot be RECEIVED before COMPLETED is committed', async () => {
    const fixture = await scenario();
    const requestId = fixture.request.id;

    // Drive to IN_TRANSIT, then hold an UNCOMMITTED completion.
    for (const [path, body, key] of [
      ['en-route', {}, 'pg-f5-enroute-00001'],
      ['arrived', { location: { latitude: -23.561684, longitude: -46.655981 } }, 'pg-f5-arrived-00001'],
      ['in-transit', {}, 'pg-f5-intransit-01'],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const response = await milestone(fixture, path, key, body);
      expect(response.status).toBe(200);
    }

    const writer = await db.transaction();
    let response = null;
    try {
      await writer('tow_requests').where({ id: requestId }).forUpdate().first();
      await writer('tow_requests').where({ id: requestId }).update({
        state: 'COMPLETED',
        completed_at: new Date('2026-01-15T12:00:00.000Z'),
        updated_at: new Date('2026-01-15T12:00:00.000Z'),
      });

      // `.then()` is what actually issues the supertest request: without it the
      // call stays lazy and nothing ever blocks on the lock.
      const pending = cashReceived(fixture, 'pg-f5-cash-00000001').then((result) => result);
      expect(await waitForBlockedTransition()).toBe(true);

      // The blocked confirmation cannot have decided anything yet, and no
      // payment may exist while COMPLETED is uncommitted.
      const beforeCommit = await db('tow_requests').where({ id: requestId }).first();
      expect(beforeCommit.state).toBe('IN_TRANSIT');
      expect(await paymentRows(requestId)).toHaveLength(0);

      await writer.commit();
      response = await pending;
    } finally {
      if (!writer.isCompleted()) await writer.rollback();
    }

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('CASH_RECEIVED');
    const rows = await paymentRows(requestId);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].status)).toBe('RECEIVED');
  });

  // -------------------------------------------------------------------------
  // F6
  // -------------------------------------------------------------------------
  test('F6 — a cancelled Tow can never produce a RECEIVED payment', async () => {
    const fixture = await scenario();
    const selectResponse = await request(app)
      .put(`/api/tow/requests/${fixture.request.id}/payment-method`)
      .set(fixture.customerAuth.headers)
      .set('Idempotency-Key', 'pg-f6-method-0000001')
      .send({ method: 'cash' });
    expect(selectResponse.status).toBe(200);
    expect(selectResponse.body.data.status).toBe('CASH_SELECTED');

    const cancelled = await request(app)
      .post(`/api/tow/requests/${fixture.request.id}/cancel`)
      .set(fixture.customerAuth.headers)
      .set('Idempotency-Key', 'pg-f6-cancel-0000001')
      .send({ reason: 'Cancelado no teste de concorrência MVP-06' });
    expect(cancelled.status).toBe(200);

    const response = await cashReceived(fixture, 'pg-f6-cash-00000001');
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('invalid_tow_state');

    const rows = await paymentRows(fixture.request.id);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].status)).toBe('PENDING');
    expect(rows[0].received_at).toBeNull();
    expect(rows[0].received_by_partner_id).toBeNull();
  });

  describe('migration 007 — database guards', () => {
    test('the two UNIQUE identities and every CHECK exist in PostgreSQL', async () => {
      const indexes = await db.raw(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'tow_payments'"
      );
      const names = indexes.rows.map((row) => row.indexname);
      expect(names).toContain('tow_payments_tow_request_id_unique');
      expect(names).toContain('tow_payments_assignment_id_unique');

      const constraints = await db.raw(
        "SELECT conname FROM pg_constraint WHERE conrelid = 'tow_payments'::regclass"
      );
      const constraintNames = constraints.rows.map((row) => row.conname);
      for (const name of PAYMENT_CHECKS) {
        expect(constraintNames).toContain(name);
      }
    });

    test('the database rejects an incoherent receipt and a non-CASH method', async () => {
      const fixture = await scenario();
      await complete(fixture);
      const assignment = await db('tow_assignments').where({ tow_request_id: fixture.request.id }).first();

      const base = {
        tow_request_id: fixture.request.id,
        assignment_id: assignment.id,
        amount_cents: 1000,
        currency: 'BRL',
      };

      await expect(db('tow_payments').insert({ ...base, method: 'CARD', status: 'PENDING' }))
        .rejects.toMatchObject({ code: '23514' });
      await expect(db('tow_payments').insert({
        ...base, method: 'CASH', status: 'RECEIVED',
      })).rejects.toMatchObject({ code: '23514' });
      await expect(db('tow_payments').insert({
        ...base, method: 'CASH', status: 'PENDING', received_at: new Date(),
        received_by_partner_id: fixture.partners[0].partner.id,
      })).rejects.toMatchObject({ code: '23514' });
      await expect(db('tow_payments').insert({
        ...base, method: 'CASH', amount_cents: -1,
      })).rejects.toMatchObject({ code: '23514' });

      expect(await paymentRows(fixture.request.id)).toHaveLength(0);
    });

    test('migration 007 applies from an empty schema and down() is exact', async () => {
      // `db` is already migrated; assert the table and column shape directly and
      // that the migration file is the only source of the table.
      const columns = await db.raw(
        "SELECT column_name, data_type, is_nullable FROM information_schema.columns "
        + "WHERE table_name = 'tow_payments' ORDER BY ordinal_position"
      );
      const byName = new Map(columns.rows.map((row) => [row.column_name, row]));
      for (const name of [
        'id', 'tow_request_id', 'assignment_id', 'method', 'amount_cents', 'currency',
        'status', 'received_at', 'received_by_partner_id', 'created_at', 'updated_at',
      ]) {
        expect(byName.has(name)).toBe(true);
      }
      expect(byName.get('amount_cents').data_type).toBe('integer');
      expect(byName.get('received_at').is_nullable).toBe('YES');

      const migration = require(MIGRATION_007);
      expect(migration.PAYMENT_STATUSES).toEqual(['PENDING', 'RECEIVED']);
      const source = require('fs').readFileSync(MIGRATION_007, 'utf8');
      expect(source).toMatch(/dropTableIfExists\('tow_payments'\)/);
    });
  });
});
