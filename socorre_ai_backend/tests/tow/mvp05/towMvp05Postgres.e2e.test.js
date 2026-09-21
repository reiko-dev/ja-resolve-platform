/**
 * MVP-05 — real PostgreSQL proof for service execution, live tracking and basic
 * cancellation (OPT-IN, `TOW_POSTGRES_E2E=1`).
 *
 * The offline suite runs on the SQLite harness, which has a single connection and
 * therefore CANNOT certify a race. Everything below is only decidable on the
 * production engine, where two HTTP requests really run in two sessions:
 *
 *   E1  N concurrent identical milestones: the row lock + guarded CAS serialise
 *       them into ONE applied transition, with no lost update and no deadlock;
 *   E2  a milestone racing a cancellation: the terminal row is coherent either
 *       way, the ordering CHECK holds, and the release happens exactly once;
 *   E3  the two cancellations racing each other: exactly ONE attribution and ONE
 *       release are written, and BOTH responses report the winner's attribution
 *       (a loser that re-decided from a stale read would report its own);
 *   E4  concurrent tracking points: ONE current point per request, the newer
 *       point always wins and a stale point never overwrites it;
 *   E5  migration 006 applies from an empty schema, and `down()` is EXACT: it
 *       drops the eight columns and the tracking table, leaves everything else,
 *       and `up()` restores the same guards;
 *   E6  a transition BLOCKED behind an uncommitted terminal writer resolves
 *       against the committed state under the lock, never against a stale read.
 *
 * The schema guards (FK CASCADE/RESTRICT, terminal coherence, milestone ordering,
 * actor attribution, coordinate bounds) are asserted in E5 from `pg_constraint` /
 * `pg_indexes`, and exercised through raw SQL there too — the database, not the
 * service, is the last line of defence.
 *
 * No Google call: the RouteProvider is the deterministic fake.
 */
'use strict';

const path = require('path');
const request = require('supertest');

const postgres = require('../../helpers/tow/postgres');

const enabled = postgres.isEnabled();
const describePostgres = enabled ? describe : describe.skip;

const MIGRATION_006 = path.join(
  postgres.MIGRATIONS_DIR,
  '006_mvp05_service_execution_tracking.js'
);

/** The eight columns migration 006 adds to the canonical aggregate. */
const MILESTONE_COLUMNS = [
  'en_route_at',
  'arrived_at',
  'in_transit_at',
  'completed_at',
  'cancelled_at',
  'cancelled_by_actor_type',
  'cancelled_by_actor_id',
  'cancellation_reason',
];

/** Every named CHECK migration 006 installs on `tow_requests`. */
const REQUEST_CHECKS = [
  'tow_requests_arrived_after_en_route_check',
  'tow_requests_in_transit_after_arrived_check',
  'tow_requests_completed_after_in_transit_check',
  'tow_requests_cancelled_after_en_route_check',
  'tow_requests_completed_state_check',
  'tow_requests_cancelled_state_check',
  'tow_requests_cancellation_actor_type_check',
  'tow_requests_cancellation_actor_pair_check',
  'tow_requests_cancellation_attribution_check',
  'tow_requests_cancellation_reason_length_check',
  'tow_requests_terminal_reason_state_check',
];

describePostgres('MVP-05 PostgreSQL — execution, tracking and cancellation', () => {
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
    // A real listening server, not the bare app: supertest would otherwise open and
    // close an ephemeral server per request, and that churn is what produces this
    // repository's documented stale-401 / `socket hang up` transport artifacts in a
    // full-suite run. The assertions are unchanged.
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
    appDb = require('../../../src/config/database');
  });

  afterAll(async () => {
    await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
    if (appDb) await appDb.destroy();
    if (db) await db.destroy();
  });

  beforeEach(async () => {
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

  /**
   * The shared Tow fixtures persist `users`/`partners` through the SQLite harness
   * (`tests/helpers/tow/factories.js`), so this suite builds its own principals in
   * PostgreSQL and then drives the REAL HTTP surface for everything else.
   */
  const CUSTOMER_INPUT = Object.freeze({
    pickup: { latitude: -23.561684, longitude: -46.655981, formatted_address: 'Av. Paulista, 1578 - São Paulo - SP' },
    destination: { latitude: -23.6639, longitude: -46.531, formatted_address: 'Rua das Figueiras, 100 - Santo André - SP' },
    vehicle: { class: 'light_vehicle', make: 'Fiat', model: 'Argo', year: 2021, weight_kg: 1200, plate: 'MVP5A11' },
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
      email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id}@mvp05.pg.test`,
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

  async function createCustomer(name = 'MVP-05 PG Customer') {
    const user = await createUser({ role: 'user', name });
    return { user, headers: signFor(user) };
  }

  async function createTowPartner(name = 'MVP-05 PG Tow Partner') {
    const user = await createUser({ role: 'partner', name });
    const [partner] = await db('partners').insert({
      user_id: user.id,
      type: 'tow',
      business_name: 'Guincho MVP-05',
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
      plate: `MV${String(partner.id).padStart(5, '0')}`,
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
      filename: `mvp05-pg-${partner.id}`,
      original_name: 'crlv.jpg',
      file_path: `mvp05-pg-${partner.id}`,
      file_url: `mvp05-pg-${partner.id}`,
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
    const customer = await createCustomer(`MVP-05 PG Customer ${nextSequence()}`);
    const partners = [];
    for (let index = 0; index < partnerCount; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      partners.push(await createTowPartner(`MVP-05 PG Partner ${nextSequence()}`));
    }
    const towRequest = await createRequest(customer, `pg-mvp05-request-${nextSequence()}`);
    const proposals = [];
    for (const partner of partners) {
      // eslint-disable-next-line no-await-in-loop
      proposals.push(await propose(partner, towRequest.id, `pg-mvp05-proposal-${nextSequence()}`));
    }
    const accepted = await request(app)
      .post(`/api/tow/proposals/${proposals[0].id}/accept`)
      .set(customer.headers)
      .set('Idempotency-Key', `pg-mvp05-accept-${nextSequence()}`)
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

  function enRoute(fixture, key) {
    return request(app)
      .post(`/api/tow/requests/${fixture.request.id}/en-route`)
      .set(fixture.auths[0].headers)
      .set('Idempotency-Key', key || 'pg-e-enroute-000001')
      .send({});
  }

  function arrived(fixture, key) {
    return request(app)
      .post(`/api/tow/requests/${fixture.request.id}/arrived`)
      .set(fixture.auths[0].headers)
      .set('Idempotency-Key', key || 'pg-e-arrived-000001')
      .send({ location: { latitude: -23.561684, longitude: -46.655981 } });
  }

  function inTransit(fixture, key) {
    return request(app)
      .post(`/api/tow/requests/${fixture.request.id}/in-transit`)
      .set(fixture.auths[0].headers)
      .set('Idempotency-Key', key || 'pg-e-intransit-0001')
      .send({});
  }

  function finish(fixture, key) {
    return request(app)
      .post(`/api/tow/requests/${fixture.request.id}/finish`)
      .set(fixture.auths[0].headers)
      .set('Idempotency-Key', key || 'pg-e-finish-000001')
      .send({ location: { latitude: -23.6639, longitude: -46.531 } });
  }

  function cancelByCustomer(fixture, key) {
    return request(app)
      .post(`/api/tow/requests/${fixture.request.id}/cancel`)
      .set(fixture.customerAuth.headers)
      .set('Idempotency-Key', key || 'pg-e-cancel-000001')
      .send({ reason: 'Cancelado durante o teste de concorrência' });
  }

  function cancelByPartner(fixture, key) {
    return request(app)
      .post(`/api/tow/requests/${fixture.request.id}/cancel-partner`)
      .set(fixture.auths[0].headers)
      .set('Idempotency-Key', key || 'pg-e-cancelp-00001')
      .send({ reason: 'Guincho indisponível durante o teste de concorrência' });
  }

  function postTracking(fixture, body, key) {
    return request(app)
      .post(`/api/tow/requests/${fixture.request.id}/tracking`)
      .set(fixture.auths[0].headers)
      .set('Idempotency-Key', key || 'pg-e-track-0000001')
      .send(body);
  }

  const NEWER_POINT = Object.freeze({
    latitude: -23.564, longitude: -46.652, recorded_at: '2026-01-15T12:10:00.000Z',
  });
  const OLDER_POINT = Object.freeze({
    latitude: -23.561684, longitude: -46.655981, recorded_at: '2026-01-15T12:05:00.000Z',
  });
  const STALE_POINT = Object.freeze({
    latitude: -23.56, longitude: -46.66, recorded_at: '2026-01-15T12:00:00.000Z',
  });

  async function requestRow(requestId) {
    return db('tow_requests').where({ id: requestId }).first();
  }

  async function assignmentRows(requestId) {
    return db('tow_assignments').where({ tow_request_id: requestId }).select('*');
  }

  async function trackingRows(requestId) {
    return db('tow_request_tracking').where({ tow_request_id: requestId }).select('*');
  }

  /** Assert a raw statement is refused by the DATABASE with a specific SQLSTATE. */
  async function expectPgError(sqlState, run) {
    let caught = null;
    try {
      await run();
    } catch (error) {
      caught = error;
    }
    expect(caught).not.toBeNull();
    expect({ sqlState: caught.code, constraint: caught.constraint }).toMatchObject({ sqlState });
    return caught;
  }

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
  // E1
  // -------------------------------------------------------------------------
  test('E1 — concurrent identical milestones apply once, without lost updates or deadlock', async () => {
    const fixture = await scenario();
    const key = 'pg-e1-enroute-000001';

    const responses = await Promise.all([
      enRoute(fixture, key), enRoute(fixture, key), enRoute(fixture, key), enRoute(fixture, key),
    ]);

    // The guarded CAS plus the row lock turn the race into one APPLY and three
    // replays: every caller gets the same answer, nobody gets a 500/deadlock.
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    const states = responses.map((response) => response.body.data.state);
    expect(new Set(states)).toEqual(new Set(['EN_ROUTE']));

    const row = await requestRow(fixture.request.id);
    expect(row.state).toBe('EN_ROUTE');
    expect(row.en_route_at).toEqual(new Date('2026-01-15T12:00:00.000Z'));
    expect(row.arrived_at).toBeNull();
    expect(row.in_transit_at).toBeNull();
    expect(row.completed_at).toBeNull();
    expect(row.cancelled_at).toBeNull();
    expect(row.terminal_reason).toBeNull();

    // The assignment is still live: a milestone is not a terminal state.
    const assignments = await assignmentRows(fixture.request.id);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].released_at).toBeNull();

    // A second contended round at a LATER instant is a pure replay: the row must
    // keep the instant the single winning write stamped. A lost update (or a
    // replay that re-stamped the milestone) would move it to 12:01.
    clock.advanceMinutes(1);
    const replay = await Promise.all([enRoute(fixture, key), enRoute(fixture, key)]);
    expect(replay.map((response) => response.status)).toEqual([200, 200]);
    expect(replay.map((response) => response.body.data.state)).toEqual(['EN_ROUTE', 'EN_ROUTE']);
    const afterReplay = await requestRow(fixture.request.id);
    expect(afterReplay.en_route_at).toEqual(new Date('2026-01-15T12:00:00.000Z'));
    expect(afterReplay.updated_at).toEqual(new Date('2026-01-15T12:00:00.000Z'));
  });

  // -------------------------------------------------------------------------
  // E2
  // -------------------------------------------------------------------------
  test('E2 — a milestone racing a cancellation leaves a coherent terminal row and one release', async () => {
    for (let round = 1; round <= 3; round += 1) {
      const fixture = await scenario();
      const [milestone, cancellation] = await Promise.all([
        enRoute(fixture, `pg-e2-enroute-00000${round}`),
        cancelByCustomer(fixture, `pg-e2-cancel-000000${round}`),
      ]);

      // Cancellation is legal from ASSIGNED and from EN_ROUTE, so it can never be
      // lost to the milestone. The milestone is either applied before it (200) or
      // refused once the request is already terminal (409).
      expect([200, 409]).toContain(milestone.status);
      expect(cancellation.status).toBe(200);

      const row = await requestRow(fixture.request.id);
      expect(row.state).toBe('CANCELLED');
      expect(row.cancelled_at).toEqual(new Date('2026-01-15T12:00:00.000Z'));
      expect(row.cancelled_by_actor_type).toBe('customer');
      expect(row.terminal_reason).toBe('CUSTOMER_CANCELLED');

      // The ordering CHECK is the invariant a broken race would violate: a row
      // can never claim to have been cancelled before it departed.
      if (row.en_route_at !== null) {
        expect(row.en_route_at.getTime()).toBeLessThanOrEqual(row.cancelled_at.getTime());
        expect(milestone.status).toBe(200);
      } else {
        expect(milestone.status).toBe(409);
        expect(milestone.body.error.code).toBe('invalid_tow_transition');
      }

      // Terminal state releases the assignment exactly once.
      const assignments = await assignmentRows(fixture.request.id);
      expect(assignments).toHaveLength(1);
      expect(assignments[0].released_at).toEqual(new Date('2026-01-15T12:00:00.000Z'));
      expect(assignments[0].release_reason).toBe('CANCELLED');

      // And no forward milestone was invented by the race.
      expect(row.arrived_at).toBeNull();
      expect(row.in_transit_at).toBeNull();
      expect(row.completed_at).toBeNull();
    }
  });

  // -------------------------------------------------------------------------
  // E3
  // -------------------------------------------------------------------------
  test('E3 — the two cancellations racing write ONE attribution and BOTH report it', async () => {
    for (let round = 1; round <= 3; round += 1) {
      const fixture = await scenario();
      const [byCustomer, byPartner] = await Promise.all([
        cancelByCustomer(fixture, `pg-e3-cancel-000000${round}`),
        cancelByPartner(fixture, `pg-e3-cancelp-00000${round}`),
      ]);

      // Both are legal from ASSIGNED and both target CANCELLED: one applies, the
      // other replays. Neither may fail.
      expect([byCustomer.status, byPartner.status]).toEqual([200, 200]);

      const row = await requestRow(fixture.request.id);
      expect(row.state).toBe('CANCELLED');
      expect(['CUSTOMER_CANCELLED', 'PARTNER_CANCELLED']).toContain(row.terminal_reason);

      // The winner's attribution is the ONLY one persisted ...
      const winnerActorType = row.terminal_reason === 'CUSTOMER_CANCELLED' ? 'customer' : 'partner';
      expect(row.cancelled_by_actor_type).toBe(winnerActorType);
      expect(row.cancelled_by_actor_id).not.toBeNull();

      // ... and BOTH responses report it. A loser that decided from a stale read
      // would answer with its own attribution instead of the stored one.
      expect(byCustomer.body.data.request.terminal_reason).toBe(row.terminal_reason);
      expect(byPartner.body.data.request.terminal_reason).toBe(row.terminal_reason);

      // Exactly one release, with the terminal reason the assignment contract owns.
      const assignments = await assignmentRows(fixture.request.id);
      expect(assignments).toHaveLength(1);
      expect(assignments[0].released_at).toEqual(new Date('2026-01-15T12:00:00.000Z'));
      expect(assignments[0].release_reason).toBe('CANCELLED');

      // Zero financial consequence on both paths, and no tracking side effect.
      for (const response of [byCustomer, byPartner]) {
        expect(response.body.data.financial_consequence).toEqual({
          fee_due_cents: 0, currency: 'BRL', customer_debt_created: false,
        });
      }
      expect(await trackingRows(fixture.request.id)).toHaveLength(0);
    }
  });

  // -------------------------------------------------------------------------
  // E4
  // -------------------------------------------------------------------------
  test('E4 — concurrent tracking points keep ONE current point and the newer always wins', async () => {
    const fixture = await scenario();

    // The older and the newer point race in the same instant of wall time. Whichever
    // order the database serialises them in, the stored point must be the newer one.
    const raced = await Promise.all([
      postTracking(fixture, OLDER_POINT, 'pg-e4-track-old-00001'),
      postTracking(fixture, NEWER_POINT, 'pg-e4-track-new-00001'),
    ]);
    expect(raced.map((response) => response.status).filter((status) => status === 202).length)
      .toBeGreaterThanOrEqual(1);
    expect(raced.every((response) => [202, 409].includes(response.status))).toBe(true);

    const rows = await trackingRows(fixture.request.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].observed_at).toEqual(new Date(NEWER_POINT.recorded_at));
    expect(Number(rows[0].latitude)).toBeCloseTo(NEWER_POINT.latitude, 6);

    // A stale point is refused and NEVER overwrites the stored one.
    const stale = await postTracking(fixture, STALE_POINT, 'pg-e4-track-stale-0001');
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('stale_tracking_update');
    const afterStale = await trackingRows(fixture.request.id);
    expect(afterStale).toHaveLength(1);
    expect(afterStale[0].observed_at).toEqual(new Date(NEWER_POINT.recorded_at));

    // Four concurrent writes of the SAME instant collapse into the single row the
    // UNIQUE constraint allows: equal instants are accepted, never duplicated.
    const equal = await Promise.all([
      postTracking(fixture, NEWER_POINT, 'pg-e4-track-eq-000001'),
      postTracking(fixture, NEWER_POINT, 'pg-e4-track-eq-000002'),
      postTracking(fixture, NEWER_POINT, 'pg-e4-track-eq-000003'),
      postTracking(fixture, NEWER_POINT, 'pg-e4-track-eq-000004'),
    ]);
    expect(equal.map((response) => response.status)).toEqual([202, 202, 202, 202]);
    expect(await trackingRows(fixture.request.id)).toHaveLength(1);

    // The read path sees exactly the same single point for both viewers.
    const read = await request(app)
      .get(`/api/tow/requests/${fixture.request.id}/tracking`)
      .set(fixture.customerAuth.headers);
    expect(read.status).toBe(200);
    expect(read.body.data.latest.recorded_at).toBe(NEWER_POINT.recorded_at);
  });

  // -------------------------------------------------------------------------
  // E5
  // -------------------------------------------------------------------------
  test('E5 — migration 006 pins its guards, and down() is exact', async () => {
    const columns = await db.raw(
      "SELECT column_name, data_type, is_nullable FROM information_schema.columns "
      + "WHERE table_name = 'tow_requests' AND column_name = ANY(?) ORDER BY column_name",
      [MILESTONE_COLUMNS]
    );
    expect(columns.rows.map((row) => row.column_name).sort()).toEqual([...MILESTONE_COLUMNS].sort());
    for (const column of columns.rows) {
      expect({ column: column.column_name, nullable: column.is_nullable })
        .toEqual({ column: column.column_name, nullable: 'YES' });
    }

    const checks = await db.raw(
      'SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint '
      + "WHERE conrelid = 'tow_requests'::regclass AND contype = 'c'"
    );
    const byName = Object.fromEntries(checks.rows.map((row) => [row.conname, row.definition]));
    for (const name of REQUEST_CHECKS) {
      expect({ name, present: Boolean(byName[name]) }).toEqual({ name, present: true });
    }
    // The two equivalences are asserted from the definition text: `state` and the
    // instant cannot disagree, in either direction. The comparison is a real
    // equivalence (`=` between the two predicates), not an implication.
    expect(byName.tow_requests_completed_state_check).toMatch(/=\s*\(completed_at IS NOT NULL\)/);
    expect(byName.tow_requests_completed_state_check).toContain("'COMPLETED'");
    expect(byName.tow_requests_cancelled_state_check).toMatch(/=\s*\(cancelled_at IS NOT NULL\)/);
    expect(byName.tow_requests_cancelled_state_check).toContain("'CANCELLED'");
    // Milestone ordering: arrived can never precede en_route.
    expect(byName.tow_requests_arrived_after_en_route_check).toMatch(/arrived_at >= en_route_at/);

    const trackingConstraints = await db.raw(`
      SELECT c.conname, c.contype, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      WHERE c.conrelid = 'tow_request_tracking'::regclass
      ORDER BY c.conname
    `);
    const definitions = trackingConstraints.rows.map((row) => row.definition).join('\n');
    expect(definitions).toMatch(/FOREIGN KEY \(tow_request_id\).*ON DELETE CASCADE/s);
    expect(definitions).toMatch(/FOREIGN KEY \(partner_id\).*ON DELETE RESTRICT/s);
    expect(definitions).toMatch(/UNIQUE \(tow_request_id\)/);
    expect(definitions).toMatch(/latitude/);
    expect(definitions).toMatch(/longitude/);

    // The database, not the service, refuses an incoherent row.
    const fixture = await scenario();
    await expectPgError('23514', () => db('tow_requests')
      .where({ id: fixture.request.id }).update({ state: 'COMPLETED' }));
    await expectPgError('23514', () => db('tow_requests')
      .where({ id: fixture.request.id }).update({ state: 'CANCELLED' }));
    await expectPgError('23514', () => db('tow_requests').where({ id: fixture.request.id }).update({
      arrived_at: new Date('2026-01-15T11:00:00.000Z'),
      en_route_at: new Date('2026-01-15T12:00:00.000Z'),
    }));
    await expectPgError('23514', () => db('tow_requests').where({ id: fixture.request.id }).update({
      cancelled_at: new Date('2026-01-15T12:00:00.000Z'),
      cancelled_by_actor_type: 'admin',
      cancelled_by_actor_id: 1,
    }));
    await expectPgError('23514', () => db('tow_requests').where({ id: fixture.request.id }).update({
      cancelled_at: new Date('2026-01-15T12:00:00.000Z'),
    }));
    await expectPgError('23514', () => db('tow_request_tracking').insert({
      tow_request_id: fixture.request.id,
      partner_id: fixture.partners[0].partner.id,
      latitude: 91,
      longitude: 0,
      observed_at: new Date('2026-01-15T12:05:00.000Z'),
      received_at: new Date('2026-01-15T12:05:00.000Z'),
    }));
    await expectPgError('23503', () => db('tow_request_tracking').insert({
      tow_request_id: 99999999,
      partner_id: fixture.partners[0].partner.id,
      latitude: -23.5,
      longitude: -46.6,
      observed_at: new Date('2026-01-15T12:05:00.000Z'),
      received_at: new Date('2026-01-15T12:05:00.000Z'),
    }));

    // CASCADE: a deleted request takes its current point with it.
    const openRequest = await db('tow_requests').where({ id: fixture.request.id }).first();
    await db('tow_request_tracking').insert({
      tow_request_id: openRequest.id,
      partner_id: fixture.partners[0].partner.id,
      latitude: -23.5,
      longitude: -46.6,
      observed_at: new Date('2026-01-15T12:05:00.000Z'),
      received_at: new Date('2026-01-15T12:05:00.000Z'),
    });
    await db('tow_assignments').where({ tow_request_id: openRequest.id }).del();
    await db('tow_requests').where({ id: openRequest.id }).del();
    expect(await trackingRows(openRequest.id)).toHaveLength(0);

    // RESTRICT: a partner that owns the current point cannot be deleted silently.
    const bare = await db('partners').insert({
      user_id: fixture.partners[0].user.id,
      type: 'tow',
      business_name: 'E5 RESTRICT partner',
      address: 'Av. Paulista, 1578 - São Paulo - SP',
      phone: '11990000009',
      latitude: -23.561684,
      longitude: -46.655981,
      is_verified: true,
      is_available: true,
      is_online: true,
      approval_status: 'approved',
    }).returning('*');
    const second = await scenario(1);
    await db('tow_request_tracking').insert({
      tow_request_id: second.request.id,
      partner_id: bare[0].id,
      latitude: -23.5,
      longitude: -46.6,
      observed_at: new Date('2026-01-15T12:05:00.000Z'),
      received_at: new Date('2026-01-15T12:05:00.000Z'),
    });
    await expectPgError('23503', () => db('partners').where({ id: bare[0].id }).del());

    // down() is EXACT: the eight columns and the tracking table go, nothing else.
    const migration = require(MIGRATION_006);
    await migration.down(db);

    const afterDown = await db.raw(
      "SELECT column_name FROM information_schema.columns "
      + "WHERE table_name = 'tow_requests' AND column_name = ANY(?)",
      [MILESTONE_COLUMNS]
    );
    expect(afterDown.rows).toHaveLength(0);
    expect(await postgres.listTables(db)).not.toContain('tow_request_tracking');
    const surviving = await db.raw(
      "SELECT column_name FROM information_schema.columns "
      + "WHERE table_name = 'tow_requests' AND column_name IN ('id', 'state', 'terminal_reason', 'updated_at')"
    );
    expect(surviving.rows.map((row) => row.column_name).sort())
      .toEqual(['id', 'state', 'terminal_reason', 'updated_at']);
    expect(await postgres.listTables(db)).toContain('tow_assignments');
    expect(await postgres.listTables(db)).toContain('tow_request_proposals');

    // up() restores the same guards from an empty schema.
    await migration.up(db);
    const restored = await db.raw(
      "SELECT column_name FROM information_schema.columns "
      + "WHERE table_name = 'tow_requests' AND column_name = ANY(?)",
      [MILESTONE_COLUMNS]
    );
    expect(restored.rows.map((row) => row.column_name).sort()).toEqual([...MILESTONE_COLUMNS].sort());
    expect(await postgres.listTables(db)).toContain('tow_request_tracking');
    const restoredChecks = await db.raw(
      'SELECT conname FROM pg_constraint '
      + "WHERE conrelid = 'tow_requests'::regclass AND contype = 'c'"
    );
    const restoredNames = restoredChecks.rows.map((row) => row.conname);
    for (const name of REQUEST_CHECKS) {
      expect(restoredNames).toContain(name);
    }
  });

  // -------------------------------------------------------------------------
  // E6
  // -------------------------------------------------------------------------
  test('E6 — a transition blocked behind an uncommitted terminal writer reads the committed state', async () => {
    const fixture = await scenario();
    const requestId = fixture.request.id;

    // An uncommitted terminal writer holds the row lock. The HTTP cancellation
    // starts while that row is locked and must WAIT on it.
    const writer = await db.transaction();
    let response = null;
    try {
      await writer('tow_requests').where({ id: requestId }).forUpdate().first();
      await writer('tow_requests').where({ id: requestId }).update({
        state: 'CANCELLED',
        cancelled_at: new Date('2026-01-15T12:00:00.000Z'),
        cancelled_by_actor_type: 'partner',
        cancelled_by_actor_id: fixture.partners[0].partner.id,
        cancellation_reason: 'Cancelado pelo parceiro na transação concorrente',
        terminal_reason: 'PARTNER_CANCELLED',
        updated_at: new Date('2026-01-15T12:00:00.000Z'),
      });

      // `.then()` is what actually issues the supertest request: without it the
      // call would stay lazy and nothing would ever block on the lock.
      const pending = cancelByCustomer(fixture, 'pg-e6-cancel-000001').then((result) => result);
      expect(await waitForBlockedTransition()).toBe(true);

      // The blocked request cannot have decided anything yet: the row is still the
      // pre-writer row as seen by any other session.
      const beforeCommit = await db('tow_requests').where({ id: requestId }).first();
      expect(beforeCommit.state).toBe('ASSIGNED');

      await writer.commit();
      response = await pending;
    } finally {
      // A failed assertion must never leave the transaction (and its connection)
      // open, or the teardown would wait on it forever.
      if (!writer.isCompleted()) await writer.rollback();
    }

    // The winner committed `PARTNER_CANCELLED`. The blocked customer call must
    // resolve against THAT state: a 200 replay reporting the partner attribution,
    // never an overwrite with its own.
    expect(response.status).toBe(200);
    expect(response.body.data.request.state).toBe('CANCELLED');
    expect(response.body.data.request.terminal_reason).toBe('PARTNER_CANCELLED');

    const row = await requestRow(requestId);
    expect(row.state).toBe('CANCELLED');
    expect(row.terminal_reason).toBe('PARTNER_CANCELLED');
    expect(row.cancelled_by_actor_type).toBe('partner');
    expect(row.cancelled_at).toEqual(new Date('2026-01-15T12:00:00.000Z'));
    expect(row.en_route_at).toBeNull();

    // The raw writer did not go through the service, so the assignment is still
    // live; what E6 proves is that the service never acted on a stale read.
    expect(await assignmentRows(requestId)).toHaveLength(1);
  });
});
