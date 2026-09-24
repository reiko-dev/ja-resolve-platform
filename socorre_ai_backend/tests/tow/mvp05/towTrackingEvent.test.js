/**
 * TOW ROUND — the `tow_tracking_updated` invalidation signal.
 *
 * The socket is a FAST PATH, never an authority: after a tracking write is
 * PERSISTED the application publishes one minimal event (`request_id`,
 * `received_at`) so the Cliente can refetch `GET /tow/requests/{id}/tracking`
 * immediately. This suite proves the signal is emitted exactly when — and only
 * when — a new canonical point was actually stored:
 *
 *   - an applied write publishes exactly one event, with the canonical request
 *     id and the BACKEND instant of the stored point;
 *   - a newer write publishes a second event;
 *   - a stale point (already rejected with 409) publishes nothing;
 *   - a terminal request (already rejected with 409) publishes nothing;
 *   - a transport failure in the publisher never fails the canonical write:
 *     the persisted point stays the authority.
 *
 * RED-first: written before the publisher port, the socket adapter and the
 * composition wiring existed.
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
  postTracking,
  TRACKING_POINT,
  TRACKING_POINT_LATER,
  TRACKING_POINT_STALE,
} = require('../../helpers/tow/mvp05');

describe('TOW ROUND — tow_tracking_updated invalidation signal', () => {
  let app;
  let services;
  let clock;
  let routeProvider;
  let publisherImpl;
  const events = [];
  const publisher = {
    publishTrackingUpdated(event) {
      events.push(event);
      return publisherImpl ? publisherImpl(event) : undefined;
    },
  };

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock();
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider, trackingEvents: publisher } }).listen(0);
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
    events.length = 0;
    publisherImpl = null;
  });

  async function scenario(options = {}) {
    return createAssignedScenario({ app, services, clock, ...options });
  }

  test('a persisted point publishes exactly one event with the canonical id and backend instant', async () => {
    const fixture = await scenario({ partnerCount: 1 });

    clock.advanceMinutes(4);
    const written = await postTracking(app, fixture.request.id, fixture.auths[0]);
    expect(written.status).toBe(202);

    expect(events).toEqual([
      {
        request_id: String(fixture.request.id),
        received_at: '2026-01-15T12:04:00.000Z',
      },
    ]);
  });

  test('a newer point publishes a second event; a stale point publishes nothing', async () => {
    const fixture = await scenario({ partnerCount: 1 });

    clock.advanceMinutes(2);
    expect((await postTracking(app, fixture.request.id, fixture.auths[0])).status).toBe(202);
    clock.advanceMinutes(6);
    expect((await postTracking(app, fixture.request.id, fixture.auths[0], {
      body: TRACKING_POINT_LATER,
    })).status).toBe(202);
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({
      request_id: String(fixture.request.id),
      received_at: '2026-01-15T12:08:00.000Z',
    });

    clock.advanceMinutes(1);
    const stale = await postTracking(app, fixture.request.id, fixture.auths[0], {
      body: TRACKING_POINT_STALE,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('stale_tracking_update');
    expect(events).toHaveLength(2);
  });

  test('a terminal request publishes nothing: the invalidation dies with the job', async () => {
    const fixture = await scenario({ partnerCount: 1 });

    clock.advanceMinutes(1);
    await postTracking(app, fixture.request.id, fixture.auths[0]);
    await enRoute(app, fixture.request.id, fixture.auths[0]);
    await arrived(app, fixture.request.id, fixture.auths[0]);
    await inTransit(app, fixture.request.id, fixture.auths[0]);
    expect((await finish(app, fixture.request.id, fixture.auths[0])).status).toBe(200);
    expect(events).toHaveLength(1);

    clock.advanceMinutes(5);
    const late = await postTracking(app, fixture.request.id, fixture.auths[0], {
      body: TRACKING_POINT_LATER,
    });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('invalid_tow_state');
    expect(events).toHaveLength(1);
  });

  test('a publisher transport failure never fails the canonical write', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    publisherImpl = () => {
      throw new Error('socket transport down');
    };
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    clock.advanceMinutes(3);
    const written = await postTracking(app, fixture.request.id, fixture.auths[0]);

    expect(written.status).toBe(202);
    const rows = await testDb.db('tow_request_tracking').where({ tow_request_id: fixture.request.id });
    expect(rows).toHaveLength(1);
    expect(rows[0].observed_at).toBe(TRACKING_POINT.recorded_at);
    consoleError.mockRestore();
  });
});
