/**
 * MVP-05 — partner service execution over the canonical HTTP surface.
 *
 * Covers `POST /tow/requests/{requestId}/{en-route,arrived,in-transit,finish}`:
 * the legal lifecycle, the authz matrix, illegal transitions, idempotent replay,
 * the contract-mandated `LocationInput` bodies and the milestone instants.
 *
 * RED-first: written before the routes, services, columns and tables exist.
 * Concurrency (two writers on the same request) is certified in
 * `towMvp05Postgres.e2e.test.js` — SQLite has a single connection.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const {
  createMvp05Services,
  createAssignedScenario,
  enRoute,
  arrived,
  inTransit,
  finish,
  getRequest,
  milestonesOf,
} = require('../../helpers/tow/mvp05');

describe('MVP-05 — partner service execution', () => {
  let app;
  let services;
  let clock;
  let routeProvider;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock();
    routeProvider = createFakeRouteProvider();
    // A real listening server, not the bare app: supertest would otherwise open and
    // close an ephemeral server per request, and that churn is what produces this
    // repository's documented stale-401 / `socket hang up` transport artifacts in a
    // full-suite run. The assertions are unchanged.
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
    ({ services } = createMvp05Services({ clock, routeProvider }));
  });

  afterAll(async () => {
    await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
    await testDb.reset();
  });

  beforeEach(async () => {
    if (await testDb.db.schema.hasTable('tow_request_tracking')) {
      await testDb.db('tow_request_tracking').del();
    }
    await testDb.db('tow_assignments').del();
    await testDb.db('tow_request_proposals').del();
    await testDb.db('tow_requests').del();
    await testDb.db('tow_vehicle_documents').del();
    await testDb.db('tow_vehicles').del();
    await testDb.db('partners').del();
    await testDb.db('users').where({ role: 'partner' }).del();
    await testDb.db('service_modules').where({ module_key: 'tow' }).del();
    routeProvider.reset();
    clock.reset();
  });

  async function scenario(options = {}) {
    return createAssignedScenario({ app, services, clock, ...options });
  }

  test('RED-MVP05-1 — the assigned partner drives the whole legal lifecycle', async () => {
    const fixture = await scenario({ partnerCount: 2 });
    const { request: towRequest, auths } = fixture;
    const partnerAuth = auths[0];

    // ASSIGNED: the partner is told to start the trip; the customer is told
    // nothing it cannot do (MVP-05 has no customer execution action).
    //
    // `fixture.assigned` is the ACCEPT response — a CUSTOMER call
    // (`POST /proposals/{id}/accept`, customer auth) — so it carries the
    // customer's actions. The partner's ASSIGNED view (`start_en_route`,
    // `cancel`) is pinned by the partner-driven assertions below and by
    // `towPartnerJobs`; RED correction 1 in `docs/evidence/mvp-05/04-red-corrections.md`.
    expect(fixture.assigned.state).toBe('ASSIGNED');
    expect(fixture.assigned.allowed_actions).toEqual(['cancel']);

    clock.advanceMinutes(2);
    const started = await enRoute(app, towRequest.id, partnerAuth);
    expect(started.status).toBe(200);
    expect(started.body.success).toBe(true);
    expect(started.body.data.state).toBe('EN_ROUTE');
    expect(started.body.data.allowed_actions).toEqual(['mark_arrived', 'cancel']);

    clock.advanceMinutes(10);
    const atPickup = await arrived(app, towRequest.id, partnerAuth);
    expect(atPickup.status).toBe(200);
    expect(atPickup.body.data.state).toBe('ARRIVED');
    expect(atPickup.body.data.allowed_actions).toEqual(['start_in_transit', 'cancel']);

    clock.advanceMinutes(5);
    const moving = await inTransit(app, towRequest.id, partnerAuth);
    expect(moving.status).toBe(200);
    expect(moving.body.data.state).toBe('IN_TRANSIT');
    expect(moving.body.data.allowed_actions).toEqual(['finish_service']);

    clock.advanceMinutes(25);
    const done = await finish(app, towRequest.id, partnerAuth);
    expect(done.status).toBe(200);
    expect(done.body.data.state).toBe('COMPLETED');
    expect(done.body.data.allowed_actions).toEqual([]);
    expect(done.body.data.terminal_reason).toBeNull();

    // The five milestone columns are persisted exactly once, from the BACKEND
    // clock, and the DTO never claims a client-supplied instant.
    const row = await testDb.db('tow_requests').where({ id: towRequest.id }).first();
    expect(milestonesOf(row)).toEqual({
      en_route_at: '2026-01-15T12:02:00.000Z',
      arrived_at: '2026-01-15T12:12:00.000Z',
      in_transit_at: '2026-01-15T12:17:00.000Z',
      completed_at: '2026-01-15T12:42:00.000Z',
      cancelled_at: null,
    });
    expect(row.updated_at).toBe('2026-01-15T12:42:00.000Z');

    // The customer recovery path rehydrates the same terminal state.
    const recovered = await getRequest(app, towRequest.id, fixture.customerAuth);
    expect(recovered.status).toBe(200);
    expect(recovered.body.data.state).toBe('COMPLETED');
    expect(recovered.body.data.assignment).toEqual(fixture.assigned.assignment);
  });

  test('anonymous callers are rejected with 401 before any key or body check', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    for (const call of [enRoute, arrived, inTransit, finish]) {
      const response = await call(app, fixture.request.id, null, { auth: null, key: null });
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    }
    const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
    expect(row.state).toBe('ASSIGNED');
  });

  test('a customer token cannot drive partner execution (403 forbidden)', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    for (const call of [enRoute, arrived, inTransit, finish]) {
      const response = await call(app, fixture.request.id, fixture.customerAuth);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('forbidden');
    }
    const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
    expect(row.state).toBe('ASSIGNED');
  });

  test('a foreign tow partner is 403 not_assigned_partner on every transition', async () => {
    const fixture = await scenario({ partnerCount: 2 });
    const foreign = fixture.auths[1];
    for (const call of [enRoute, arrived, inTransit, finish]) {
      const response = await call(app, fixture.request.id, foreign);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('not_assigned_partner');
    }
    const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
    expect(row.state).toBe('ASSIGNED');
  });

  test('an unknown request is 404 not_found for the assigned partner', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    const response = await enRoute(app, '999999', fixture.auths[0]);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
  });

  test('a non-canonical request id is a 404, never a 500', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    for (const bad of ['abc', '-1', '1.5', '0']) {
      const response = await enRoute(app, bad, fixture.auths[0]);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('not_found');
    }
  });

  describe('illegal transitions are 409 invalid_tow_transition', () => {
    test('ASSIGNED cannot jump to ARRIVED, IN_TRANSIT or COMPLETED', async () => {
      for (const call of [arrived, inTransit, finish]) {
        const fixture = await scenario({ partnerCount: 1 });
        const response = await call(app, fixture.request.id, fixture.auths[0]);
        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe('invalid_tow_transition');
        expect(response.body.error.details).toMatchObject({ from: 'ASSIGNED' });
        const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
        expect(row.state).toBe('ASSIGNED');
      }
    });

    test('EN_ROUTE cannot jump to IN_TRANSIT or COMPLETED', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      expect((await enRoute(app, fixture.request.id, fixture.auths[0])).status).toBe(200);
      for (const call of [inTransit, finish]) {
        const response = await call(app, fixture.request.id, fixture.auths[0]);
        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe('invalid_tow_transition');
        expect(response.body.error.details).toMatchObject({ from: 'EN_ROUTE' });
      }
      const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
      expect(row.state).toBe('EN_ROUTE');
    });

    test('ARRIVED cannot jump to COMPLETED', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      await enRoute(app, fixture.request.id, fixture.auths[0]);
      await arrived(app, fixture.request.id, fixture.auths[0]);
      const response = await finish(app, fixture.request.id, fixture.auths[0]);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('invalid_tow_transition');
      const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
      expect(row.state).toBe('ARRIVED');
    });

    test('a terminal request accepts no further progress', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      await enRoute(app, fixture.request.id, fixture.auths[0]);
      await arrived(app, fixture.request.id, fixture.auths[0]);
      await inTransit(app, fixture.request.id, fixture.auths[0]);
      expect((await finish(app, fixture.request.id, fixture.auths[0])).status).toBe(200);

      for (const call of [enRoute, arrived, inTransit, finish]) {
        const response = await call(app, fixture.request.id, fixture.auths[0]);
        // Replaying `finish` on a COMPLETED request is the only accepted call.
        if (call === finish) {
          expect(response.status).toBe(200);
          expect(response.body.data.state).toBe('COMPLETED');
        } else {
          expect(response.status).toBe(409);
          expect(response.body.error.code).toBe('invalid_tow_transition');
        }
      }
    });
  });

  describe('idempotent replay of the same transition', () => {
    test('replaying en-route while already EN_ROUTE keeps ONE milestone', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      clock.advanceMinutes(3);
      const first = await enRoute(app, fixture.request.id, fixture.auths[0], { key: 'idem-mvp05-enroute-a001' });
      expect(first.status).toBe(200);

      clock.advanceMinutes(7);
      const replay = await enRoute(app, fixture.request.id, fixture.auths[0], { key: 'idem-mvp05-enroute-b002' });
      expect(replay.status).toBe(200);
      expect(replay.body.data.state).toBe('EN_ROUTE');

      const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
      expect(milestonesOf(row)).toEqual({
        en_route_at: '2026-01-15T12:03:00.000Z',
        arrived_at: null,
        in_transit_at: null,
        completed_at: null,
        cancelled_at: null,
      });
      // The replay is a read: `updated_at` does not move either.
      expect(row.updated_at).toBe('2026-01-15T12:03:00.000Z');
    });

    test('replaying finish keeps ONE completed_at and ONE release', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      await enRoute(app, fixture.request.id, fixture.auths[0]);
      await arrived(app, fixture.request.id, fixture.auths[0]);
      await inTransit(app, fixture.request.id, fixture.auths[0]);
      clock.advanceMinutes(1);
      expect((await finish(app, fixture.request.id, fixture.auths[0], { key: 'idem-mvp05-finish-a0001' })).status).toBe(200);
      clock.advanceMinutes(9);
      const replay = await finish(app, fixture.request.id, fixture.auths[0], { key: 'idem-mvp05-finish-b0002' });
      expect(replay.status).toBe(200);

      // The milestone and the release keep the FIRST finish instant (12:01 =
      // 12:00 + 1). The replay happens at 12:10, so this assertion is exactly
      // what proves the replay did not re-stamp anything.
      // RED correction 2 in `docs/evidence/mvp-05/04-red-corrections.md`.
      const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
      expect(row.completed_at).toBe('2026-01-15T12:01:00.000Z');
      const assignments = await testDb.db('tow_assignments').where({ tow_request_id: fixture.request.id });
      expect(assignments).toHaveLength(1);
      expect(assignments[0].released_at).toBe('2026-01-15T12:01:00.000Z');
    });
  });

  describe('contract-mandated bodies and idempotency key', () => {
    test('arrived and finish require a valid LocationInput', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      await enRoute(app, fixture.request.id, fixture.auths[0]);

      const missing = await arrived(app, fixture.request.id, fixture.auths[0], { body: {} });
      expect(missing.status).toBe(422);
      expect(missing.body.error.code).toBe('validation_error');

      const extra = await arrived(app, fixture.request.id, fixture.auths[0], {
        body: { location: { latitude: -23.5, longitude: -46.6 }, recorded_at: '2026-01-15T12:00:00.000Z' },
      });
      expect(extra.status).toBe(422);
      expect(extra.body.error.code).toBe('validation_error');

      const outOfRange = await arrived(app, fixture.request.id, fixture.auths[0], {
        body: { location: { latitude: 123, longitude: -46.6 } },
      });
      expect(outOfRange.status).toBe(422);

      const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
      expect(row.state).toBe('EN_ROUTE');
    });

    test('a missing or malformed Idempotency-Key is 422 before any mutation', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      const noKey = await enRoute(app, fixture.request.id, fixture.auths[0], { key: null });
      expect(noKey.status).toBe(422);
      expect(noKey.body.error.code).toBe('validation_error');

      const shortKey = await enRoute(app, fixture.request.id, fixture.auths[0], { key: 'short' });
      expect(shortKey.status).toBe(422);

      const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
      expect(row.state).toBe('ASSIGNED');
      expect(milestonesOf(row)).toEqual({
        en_route_at: null, arrived_at: null, in_transit_at: null, completed_at: null, cancelled_at: null,
      });
    });

    test('arrival/finish bodies are validated but never become tracking history', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      await enRoute(app, fixture.request.id, fixture.auths[0]);
      expect((await arrived(app, fixture.request.id, fixture.auths[0])).status).toBe(200);
      expect(await testDb.db('tow_request_tracking').where({ tow_request_id: fixture.request.id })).toHaveLength(0);
    });
  });
});
