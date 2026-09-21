/**
 * MVP-05 — current partner tracking (`GET|POST /tow/requests/{requestId}/tracking`).
 *
 * One row per live request (no history, no trail), assigned-partner write only,
 * customer-owner/assigned-partner read only, deterministic stale rejection, no
 * Google Routes call, no write after a terminal state.
 *
 * RED-first: written before the routes, service, repository and table exist.
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
  getTracking,
  postTracking,
  trackingRow,
  TRACKING_POINT,
  TRACKING_POINT_LATER,
  TRACKING_POINT_STALE,
  PICKUP,
  DESTINATION,
} = require('../../helpers/tow/mvp05');

describe('MVP-05 — live tracking', () => {
  let app;
  let services;
  let clock;
  let routeProvider;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock();
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider } });
    ({ services } = createMvp05Services({ clock, routeProvider }));
  });

  afterAll(async () => {
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

  test('RED-MVP05-2 — the assigned partner writes a point and both parties read it', async () => {
    const fixture = await scenario({ partnerCount: 2 });
    const callsBefore = routeProvider.callCount();

    clock.advanceMinutes(4);
    const written = await postTracking(app, fixture.request.id, fixture.auths[0]);
    expect(written.status).toBe(202);
    expect(written.body).toEqual({
      success: true,
      data: {
        latitude: TRACKING_POINT.latitude,
        longitude: TRACKING_POINT.longitude,
        recorded_at: TRACKING_POINT.recorded_at,
      },
    });

    // Exactly ONE row per request, with the internal observed/received instants.
    const rows = await testDb.db('tow_request_tracking').where({ tow_request_id: fixture.request.id });
    expect(rows).toHaveLength(1);
    expect(rows[0].partner_id).toBe(fixture.partners[0].partner.id);
    expect(rows[0].observed_at).toBe(TRACKING_POINT.recorded_at);
    expect(rows[0].received_at).toBe('2026-01-15T12:04:00.000Z');

    const expectedRoute = {
      pickup: {
        latitude: PICKUP.latitude, longitude: PICKUP.longitude, formatted_address: PICKUP.formatted_address,
      },
      destination: {
        latitude: DESTINATION.latitude, longitude: DESTINATION.longitude, formatted_address: DESTINATION.formatted_address,
      },
    };

    const asCustomer = await getTracking(app, fixture.request.id, fixture.customerAuth);
    expect(asCustomer.status).toBe(200);
    expect(asCustomer.body.data.route).toEqual(expectedRoute);
    expect(asCustomer.body.data.latest).toEqual({
      latitude: TRACKING_POINT.latitude,
      longitude: TRACKING_POINT.longitude,
      recorded_at: TRACKING_POINT.recorded_at,
    });

    const asPartner = await getTracking(app, fixture.request.id, fixture.auths[0]);
    expect(asPartner.status).toBe(200);
    expect(asPartner.body.data).toEqual(asCustomer.body.data);

    // Live tracking never calls the routing provider (no ETA, no geometry).
    expect(routeProvider.callCount()).toBe(callsBefore);
  });

  test('RED-MVP05-3 — the owning customer recovers tracking; nobody else does', async () => {
    const fixture = await scenario({ partnerCount: 2 });
    await postTracking(app, fixture.request.id, fixture.auths[0]);

    const anonymous = await getTracking(app, fixture.request.id, null, { auth: null });
    expect(anonymous.status).toBe(401);

    const foreignPartner = await getTracking(app, fixture.request.id, fixture.auths[1]);
    expect(foreignPartner.status).toBe(403);
    expect(foreignPartner.body.error.code).toBe('not_assigned_partner');

    const unknown = await getTracking(app, '999999', fixture.customerAuth);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('not_found');
  });

  test('a foreign customer cannot read another customer tracking (403 not_request_owner)', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    await postTracking(app, fixture.request.id, fixture.auths[0]);
    const other = await scenario({ partnerCount: 1 });

    const response = await getTracking(app, fixture.request.id, other.customerAuth);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('not_request_owner');
    expect(response.body.data).toBeUndefined();
  });

  test('request A never exposes request B point', async () => {
    const first = await scenario({ partnerCount: 1 });
    const second = await scenario({ partnerCount: 1 });
    await postTracking(app, first.request.id, first.auths[0], { body: TRACKING_POINT });
    await postTracking(app, second.request.id, second.auths[0], {
      body: { ...TRACKING_POINT_LATER, latitude: 1.5, longitude: 2.5 },
    });

    const firstRead = await getTracking(app, first.request.id, first.customerAuth);
    expect(firstRead.body.data.latest.latitude).toBe(TRACKING_POINT.latitude);
    const secondRead = await getTracking(app, second.request.id, second.customerAuth);
    expect(secondRead.body.data.latest.latitude).toBe(1.5);
  });

  test('a new point replaces the current one: still ONE row, no history', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    clock.advanceMinutes(2);
    await postTracking(app, fixture.request.id, fixture.auths[0]);
    clock.advanceMinutes(6);
    const second = await postTracking(app, fixture.request.id, fixture.auths[0], { body: TRACKING_POINT_LATER });
    expect(second.status).toBe(202);

    const rows = await testDb.db('tow_request_tracking').where({ tow_request_id: fixture.request.id });
    expect(rows).toHaveLength(1);
    expect(rows[0].observed_at).toBe(TRACKING_POINT_LATER.recorded_at);
    expect(rows[0].received_at).toBe('2026-01-15T12:08:00.000Z');
    expect(Number(rows[0].latitude)).toBeCloseTo(TRACKING_POINT_LATER.latitude, 6);

    const read = await getTracking(app, fixture.request.id, fixture.customerAuth);
    expect(read.body.data.latest).toEqual({
      latitude: TRACKING_POINT_LATER.latitude,
      longitude: TRACKING_POINT_LATER.longitude,
      recorded_at: TRACKING_POINT_LATER.recorded_at,
    });
  });

  test('before the first point the latest snapshot is null, never invented', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    const read = await getTracking(app, fixture.request.id, fixture.customerAuth);
    expect(read.status).toBe(200);
    expect(read.body.data.latest).toBeNull();
    expect(read.body.data.route.pickup.latitude).toBe(PICKUP.latitude);
  });

  describe('stale / out-of-order points', () => {
    test('an older recorded_at is rejected with 409 stale_tracking_update', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      clock.advanceMinutes(1);
      await postTracking(app, fixture.request.id, fixture.auths[0], { body: TRACKING_POINT_LATER });

      clock.advanceMinutes(1);
      const stale = await postTracking(app, fixture.request.id, fixture.auths[0], { body: TRACKING_POINT_STALE });
      expect(stale.status).toBe(409);
      expect(stale.body.success).toBe(false);
      expect(stale.body.error.code).toBe('stale_tracking_update');
      expect(stale.body.error.details).toMatchObject({ recorded_at: TRACKING_POINT_STALE.recorded_at });

      const row = await trackingRow(testDb.db, fixture.request.id);
      expect(row.observed_at).toBe(TRACKING_POINT_LATER.recorded_at);
      expect(Number(row.latitude)).toBeCloseTo(TRACKING_POINT_LATER.latitude, 6);
    });

    test('an equal recorded_at is not older and is accepted deterministically', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      await postTracking(app, fixture.request.id, fixture.auths[0], { body: TRACKING_POINT });
      const same = await postTracking(app, fixture.request.id, fixture.auths[0], {
        body: { ...TRACKING_POINT, latitude: -23.5 },
      });
      expect(same.status).toBe(202);
      const row = await trackingRow(testDb.db, fixture.request.id);
      expect(Number(row.latitude)).toBeCloseTo(-23.5, 6);
    });

    test('a stale point never overwrites the row and never creates a second row', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      await postTracking(app, fixture.request.id, fixture.auths[0], { body: TRACKING_POINT_LATER });
      await postTracking(app, fixture.request.id, fixture.auths[0], { body: TRACKING_POINT_STALE });
      const rows = await testDb.db('tow_request_tracking').where({ tow_request_id: fixture.request.id });
      expect(rows).toHaveLength(1);
    });
  });

  describe('terminal states', () => {
    test('no write is accepted after COMPLETED; the last snapshot stays readable', async () => {
      const fixture = await scenario({ partnerCount: 1 });
      await postTracking(app, fixture.request.id, fixture.auths[0]);
      await enRoute(app, fixture.request.id, fixture.auths[0]);
      await arrived(app, fixture.request.id, fixture.auths[0]);
      await inTransit(app, fixture.request.id, fixture.auths[0]);
      expect((await finish(app, fixture.request.id, fixture.auths[0])).status).toBe(200);

      const late = await postTracking(app, fixture.request.id, fixture.auths[0], { body: TRACKING_POINT_LATER });
      expect(late.status).toBe(409);
      expect(late.body.error.code).toBe('invalid_tow_state');
      expect(late.body.error.details).toMatchObject({ state: 'COMPLETED' });

      const row = await trackingRow(testDb.db, fixture.request.id);
      expect(row.observed_at).toBe(TRACKING_POINT.recorded_at);
      const read = await getTracking(app, fixture.request.id, fixture.customerAuth);
      expect(read.status).toBe(200);
      expect(read.body.data.latest.recorded_at).toBe(TRACKING_POINT.recorded_at);
    });
  });

  test('tracking requires an assignment: an unassigned request has no writer', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    await testDb.db('tow_assignments').where({ tow_request_id: fixture.request.id }).del();
    await testDb.db('tow_requests').where({ id: fixture.request.id }).update({ state: 'SEARCHING' });

    const response = await postTracking(app, fixture.request.id, fixture.auths[0]);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('not_assigned_partner');
    expect(await testDb.db('tow_request_tracking').where({ tow_request_id: fixture.request.id })).toHaveLength(0);
  });

  test('the tracking payload is validated against the contract TrackingPoint', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    const cases = [
      { latitude: -23.5, longitude: -46.6 },
      { latitude: -23.5, longitude: -46.6, recorded_at: 'not-an-instant' },
      { latitude: -23.5, longitude: -46.6, recorded_at: TRACKING_POINT.recorded_at, observed_at: TRACKING_POINT.recorded_at },
      { latitude: 91, longitude: -46.6, recorded_at: TRACKING_POINT.recorded_at },
      { latitude: -23.5, longitude: -181, recorded_at: TRACKING_POINT.recorded_at },
      { latitude: 'a', longitude: -46.6, recorded_at: TRACKING_POINT.recorded_at },
    ];
    for (const body of cases) {
      const response = await postTracking(app, fixture.request.id, fixture.auths[0], { body });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('validation_error');
    }
    expect(await testDb.db('tow_request_tracking').where({ tow_request_id: fixture.request.id })).toHaveLength(0);
  });

  test('the tracking write requires the canonical Idempotency-Key', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    const noKey = await postTracking(app, fixture.request.id, fixture.auths[0], { key: null });
    expect(noKey.status).toBe(422);
    const short = await postTracking(app, fixture.request.id, fixture.auths[0], { key: 'tiny' });
    expect(short.status).toBe(422);
    expect(await testDb.db('tow_request_tracking').where({ tow_request_id: fixture.request.id })).toHaveLength(0);
  });

  test('an unrelated tow partner cannot write a point (403 not_assigned_partner)', async () => {
    const fixture = await scenario({ partnerCount: 2 });
    const response = await postTracking(app, fixture.request.id, fixture.auths[1]);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('not_assigned_partner');
  });
});
