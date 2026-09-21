/**
 * MVP-05 — the canonical `Idempotency-Key` on every MVP-05 mutation.
 *
 * The header is REQUIRED and validated (8..128) before any mutation, exactly as
 * on the MVP-03/MVP-04 write paths. The replay authority for these operations is
 * the canonical request STATE plus guarded writes — no new key table is
 * introduced — so a replay of the same intended transition in the target state
 * is a read, and a stale transition with a fresh key is still a conflict.
 *
 * RED-first: written before the routes, services, columns and tables exist.
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
  cancelByCustomer,
  cancelByPartner,
  postTracking,
  milestonesOf,
} = require('../../helpers/tow/mvp05');

const VALID_8 = '12345678';
const VALID_129 = 'k'.repeat(129);
const SHORT_7 = '1234567';

describe('MVP-05 — Idempotency-Key on execution, tracking and cancellation', () => {
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

  test('every MVP-05 mutation rejects a missing, short or over-long key with 422', async () => {
    const fixture = await scenario({ partnerCount: 2 });
    const calls = [
      (key) => enRoute(app, fixture.request.id, fixture.auths[0], { key }),
      (key) => arrived(app, fixture.request.id, fixture.auths[0], { key }),
      (key) => inTransit(app, fixture.request.id, fixture.auths[0], { key }),
      (key) => finish(app, fixture.request.id, fixture.auths[0], { key }),
      (key) => cancelByCustomer(app, fixture.request.id, fixture.customerAuth, { key }),
      (key) => cancelByPartner(app, fixture.request.id, fixture.auths[0], { key }),
      (key) => postTracking(app, fixture.request.id, fixture.auths[0], { key }),
    ];
    for (const call of calls) {
      for (const key of [null, SHORT_7, VALID_129]) {
        const response = await call(key);
        expect(response.status).toBe(422);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('validation_error');
      }
    }

    // Nothing moved: no state, no milestone, no tracking row.
    const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
    expect(row.state).toBe('ASSIGNED');
    expect(milestonesOf(row)).toEqual({
      en_route_at: null, arrived_at: null, in_transit_at: null, completed_at: null, cancelled_at: null,
    });
    expect(await testDb.db('tow_request_tracking').where({ tow_request_id: fixture.request.id })).toHaveLength(0);
  });

  test('an exactly-8-character key is accepted', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    const response = await enRoute(app, fixture.request.id, fixture.auths[0], { key: VALID_8 });
    expect(response.status).toBe(200);
    const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
    expect(row.en_route_at).toBe('2026-01-15T12:00:00.000Z');
  });

  test('a replay with a DIFFERENT valid key is still a read of the canonical state', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    clock.advanceMinutes(1);
    expect((await enRoute(app, fixture.request.id, fixture.auths[0], { key: 'idem-mvp05-key-a-000001' })).status).toBe(200);
    clock.advanceMinutes(4);
    const replay = await enRoute(app, fixture.request.id, fixture.auths[0], { key: 'idem-mvp05-key-b-000002' });
    expect(replay.status).toBe(200);
    expect(replay.body.data.state).toBe('EN_ROUTE');
    const row = await testDb.db('tow_requests').where({ id: fixture.request.id }).first();
    expect(row.en_route_at).toBe('2026-01-15T12:01:00.000Z');
    expect(row.updated_at).toBe('2026-01-15T12:01:00.000Z');
  });

  test('the key is not a cross-request dedupe authority: state is', async () => {
    const first = await scenario({ partnerCount: 1 });
    const second = await scenario({ partnerCount: 1 });
    const shared = 'idem-mvp05-shared-00001';

    expect((await enRoute(app, first.request.id, first.auths[0], { key: shared })).status).toBe(200);
    expect((await enRoute(app, second.request.id, second.auths[0], { key: shared })).status).toBe(200);

    const firstRow = await testDb.db('tow_requests').where({ id: first.request.id }).first();
    const secondRow = await testDb.db('tow_requests').where({ id: second.request.id }).first();
    expect(firstRow.state).toBe('EN_ROUTE');
    expect(secondRow.state).toBe('EN_ROUTE');
  });

  test('a stale transition with a fresh valid key is a conflict, never silently absorbed', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    await enRoute(app, fixture.request.id, fixture.auths[0]);
    await arrived(app, fixture.request.id, fixture.auths[0]);
    const stale = await enRoute(app, fixture.request.id, fixture.auths[0], { key: 'idem-mvp05-key-fresh-0001' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('invalid_tow_transition');
  });
});
