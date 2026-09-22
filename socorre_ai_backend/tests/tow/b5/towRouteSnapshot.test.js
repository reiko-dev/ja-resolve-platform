/**
 * B5 — route visualization: `GET /api/tow/requests/{requestId}/route`
 * (`getTowRequestRoute`, canonical `TowRouteSnapshot`).
 *
 * The endpoint is the visualization read of the Tow flow: the owning customer or
 * the assigned partner reads the request's own pickup -> destination route —
 * the provider's authoritative distance/duration plus a Google-compatible
 * `encoded_polyline`. It is NOT a pricing endpoint: the response is asserted to
 * carry no `final_price`, no `amount_cents` and no price member of any kind.
 *
 * The suite drives the REAL HTTP surface (a listening server, same convention as
 * the MVP-05/MVP-06 API suites) and the REAL composition root, with the
 * deterministic fake `RouteProvider` (no network, no Google key). The live 200
 * body is validated against the canonical composed `TowRouteSnapshot` schema.
 *
 * Geometry ordering is proven with a local provider double that encodes the
 * polyline FROM the request it received: the decoded first/last points must be
 * the canonical pickup/destination, so a swapped `origin`/`destination` — or a
 * lat/lng inversion — cannot pass.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { buildTowServices } = require('../../../src/modules/tow/composition');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const { encodePolyline, decodePolyline } = require('../../helpers/tow/polyline');
const { PICKUP, DESTINATION } = require('../../helpers/tow/mvp03');
const {
  createProposalScenario,
  authFor,
  PROPOSAL_IDEMPOTENCY_KEY,
  ACCEPT_IDEMPOTENCY_KEY,
} = require('../../helpers/tow/mvp04');
const { createAssignedScenario } = require('../../helpers/tow/mvp05');
const { createTowCustomerAuth } = require('../../helpers/tow/auth');
const {
  COMPOSED_SCHEMA_ID,
  buildAjv,
  composeDocument,
  loadRawDocuments,
} = require('../../helpers/towContract');

const TOW_SRC = path.resolve(__dirname, '../../../src/modules/tow');
const REQUESTS = '/api/tow/requests';
const ROUTE_PATH = (requestId) => `${REQUESTS}/${requestId}/route`;

/** The encoded polyline format stores coordinates as integers at 1e-5 degrees. */
function atPolylinePrecision(value) {
  return Math.round(value * 1e5) / 1e5;
}

/** `GET /tow/requests/{id}/route`. `auth: null` omits the token. */
function getRoute(app, requestId, auth, options = {}) {
  let pending = request(app).get(ROUTE_PATH(requestId));
  if (options.auth !== null) pending = pending.set((options.auth || auth).headers);
  return pending;
}

describe('B5 — tow request route snapshot', () => {
  let app;
  let services;
  let clock;
  let routeProvider;
  let validateSnapshot;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock();
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
    services = buildTowServices({ db: testDb.db, clock, routeProvider });

    const { composed } = composeDocument(loadRawDocuments());
    const ajv = buildAjv(composed);
    validateSnapshot = ajv.getSchema(`${COMPOSED_SCHEMA_ID}#/components/schemas/TowRouteSnapshot`);
    expect(validateSnapshot).toBeDefined();
  });

  afterAll(async () => {
    await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
    await testDb.reset();
  });

  beforeEach(async () => {
    for (const table of [
      'tow_request_tracking',
      'tow_assignments',
      'tow_request_proposals',
      'tow_requests',
      'tow_vehicle_documents',
      'tow_vehicles',
      'partners',
    ]) {
      if (await testDb.db.schema.hasTable(table)) await testDb.db(table).del();
    }
    await testDb.db('users').where({ role: 'partner' }).del();
    await testDb.db('service_modules').where({ module_key: 'tow' }).del();
    routeProvider.reset();
    routeProvider.failure = null;
    clock.reset();
  });

  async function assigned(options = {}) {
    return createAssignedScenario({ app, services, clock, ...options });
  }

  describe('happy path — the authoritative request route', () => {
    test('the owner customer reads the exact snapshot: pickup, destination, legs, totals and polyline', async () => {
      const scenario = await assigned({ partnerCount: 2 });
      routeProvider.reset();

      const response = await getRoute(app, scenario.request.id, scenario.customerAuth);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        request_id: String(scenario.request.id),
        pickup: {
          latitude: PICKUP.latitude,
          longitude: PICKUP.longitude,
          formatted_address: PICKUP.formatted_address,
        },
        destination: {
          latitude: DESTINATION.latitude,
          longitude: DESTINATION.longitude,
          formatted_address: DESTINATION.formatted_address,
        },
        route_quote: {
          pickup_to_destination: { distance_meters: 7350, duration_seconds: 1200 },
          total_distance_meters: 7350,
          total_duration_seconds: 1200,
        },
        encoded_polyline: 'fake-encoded-polyline',
        generated_at: clock.isoNow(),
      });

      // Exactly ONE provider call, asking for the request's own route
      // (`origin` = pickup, `destination` = destination) — never a second leg.
      expect(routeProvider.callCount('computeRoute')).toBe(1);
      expect(routeProvider.lastCall('computeRoute').request).toEqual({
        origin: { latitude: PICKUP.latitude, longitude: PICKUP.longitude },
        destination: { latitude: DESTINATION.latitude, longitude: DESTINATION.longitude },
      });
    });

    test('the live 200 body validates against the canonical TowRouteSnapshot schema', async () => {
      const scenario = await assigned({ partnerCount: 1 });
      const response = await getRoute(app, scenario.request.id, scenario.customerAuth);

      expect(response.status).toBe(200);
      const valid = validateSnapshot(response.body.data);
      if (!valid) {
        throw new Error(`TowRouteSnapshot violations: ${JSON.stringify(validateSnapshot.errors, null, 2)}`);
      }
      expect(valid).toBe(true);

      // The validator is not vacuous: a snapshot missing its required members
      // is rejected.
      expect(validateSnapshot({ request_id: String(scenario.request.id) })).toBe(false);

      // The declared member set, exactly — the absent provider leg is ABSENT,
      // never a null (the base RouteQuote schema does not allow null).
      expect(Object.keys(response.body.data).sort()).toEqual([
        'destination', 'encoded_polyline', 'generated_at', 'pickup', 'request_id', 'route_quote',
      ]);
      expect(response.body.data.route_quote.provider_to_pickup).toBeUndefined();
      expect(Object.keys(response.body.data.route_quote).sort()).toEqual([
        'pickup_to_destination', 'total_distance_meters', 'total_duration_seconds',
      ]);
    });

    test('the endpoint performs ZERO pricing: no final_price, amount_cents or any price member', async () => {
      const scenario = await assigned({ partnerCount: 1 });
      routeProvider.reset();

      const response = await getRoute(app, scenario.request.id, scenario.customerAuth);
      expect(response.status).toBe(200);

      const serialized = JSON.stringify(response.body);
      for (const forbidden of [
        'final_price', 'amount_cents', 'calculated_price', 'pricing_snapshot',
        'pricing', 'currency', 'minimum_charge', 'price_per_additional_km',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }

      // No tariff ever reaches the provider either: this call is pure geometry.
      expect(routeProvider.lastCall('computeRoute').request.tariff).toBeUndefined();
    });
  });

  describe('authorization matrix', () => {
    test('the owner customer may read; a foreign customer is 403 not_request_owner', async () => {
      const scenario = await assigned({ partnerCount: 2 });

      const own = await getRoute(app, scenario.request.id, scenario.customerAuth);
      expect(own.status).toBe(200);

      const foreign = await createTowCustomerAuth();
      const denied = await getRoute(app, scenario.request.id, foreign);
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe('not_request_owner');
    });

    test('the assigned partner may read; a non-assigned partner is 403 not_assigned_partner', async () => {
      const scenario = await assigned({ partnerCount: 2 });

      const assignedPartner = await getRoute(app, scenario.request.id, scenario.auths[0]);
      expect(assignedPartner.status).toBe(200);
      expect(assignedPartner.body.data.request_id).toBe(String(scenario.request.id));

      const foreignPartner = await getRoute(app, scenario.request.id, scenario.auths[1]);
      expect(foreignPartner.status).toBe(403);
      expect(foreignPartner.body.error.code).toBe('not_assigned_partner');
    });

    test('a partner on a request with NO assignment is 403 not_assigned_partner', async () => {
      const open = await createProposalScenario({ services, clock, partnerCount: 1 });
      const partnerAuth = authFor(open.partners[0]);

      const denied = await getRoute(app, open.request.id, partnerAuth);
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe('not_assigned_partner');
    });

    test('an anonymous caller is 401 and never reaches the provider', async () => {
      const scenario = await assigned({ partnerCount: 1 });
      routeProvider.reset();

      const response = await getRoute(app, scenario.request.id, null, { auth: null });
      expect(response.status).toBe(401);
      expect(routeProvider.callCount('computeRoute')).toBe(0);
    });

    test('an unknown id is 404 for both principals; a non-canonical id is 404 before the database', async () => {
      const scenario = await assigned({ partnerCount: 2 });

      for (const auth of [scenario.customerAuth, scenario.auths[0]]) {
        const unknown = await getRoute(app, '99999999', auth);
        expect(unknown.status).toBe(404);
        expect(unknown.body.error.code).toBe('not_found');
      }

      for (const garbage of ['not-an-id', '1.5', '-1']) {
        const customerDenied = await getRoute(app, garbage, scenario.customerAuth);
        expect(customerDenied.status).toBe(404);
        expect(customerDenied.body.error.code).toBe('not_found');

        const partnerDenied = await getRoute(app, garbage, scenario.auths[0]);
        expect(partnerDenied.status).toBe(404);
        expect(partnerDenied.body.error.code).toBe('not_found');
      }
    });
  });

  describe('pre-assignment vs post-assignment', () => {
    test('the snapshot is the REQUEST route before and after the assignment (no invented partner leg)', async () => {
      const scenario = await createProposalScenario({ services, clock, partnerCount: 1 });
      const customerAuth = authFor({ user: scenario.customer });
      const partnerAuth = authFor(scenario.partners[0]);

      const before = await getRoute(app, scenario.request.id, customerAuth);
      expect(before.status).toBe(200);
      expect(before.body.data.route_quote.provider_to_pickup).toBeUndefined();
      expect(before.body.data.route_quote.pickup_to_destination).toEqual({
        distance_meters: 7350,
        duration_seconds: 1200,
      });

      const proposed = await request(app)
        .post(`${REQUESTS}/${scenario.request.id}/proposals`)
        .set('Idempotency-Key', PROPOSAL_IDEMPOTENCY_KEY)
        .set(partnerAuth.headers)
        .send({});
      expect(proposed.status).toBe(201);

      const accepted = await request(app)
        .post(`/api/tow/proposals/${proposed.body.data.id}/accept`)
        .set('Idempotency-Key', ACCEPT_IDEMPOTENCY_KEY)
        .set(customerAuth.headers)
        .send({});
      expect(accepted.status).toBe(200);

      const after = await getRoute(app, scenario.request.id, customerAuth);
      expect(after.status).toBe(200);
      // The runtime owns no canonical partner origin for this read: the SAME
      // request route comes back after the assignment, with the provider leg
      // still absent (the frozen provider leg stays on the pricing snapshot).
      expect(after.body.data.pickup).toEqual(before.body.data.pickup);
      expect(after.body.data.destination).toEqual(before.body.data.destination);
      expect(after.body.data.route_quote).toEqual(before.body.data.route_quote);
      expect(after.body.data.route_quote.provider_to_pickup).toBeUndefined();
    });
  });

  describe('provider failure', () => {
    test('a provider failure is 503 external_dependency_unavailable with NO geometry', async () => {
      const scenario = await assigned({ partnerCount: 1 });
      routeProvider.failure = { code: 'PROVIDER_DOWN', message: 'route provider exploded' };

      const response = await getRoute(app, scenario.request.id, scenario.customerAuth);

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('external_dependency_unavailable');
      expect(response.body.data).toBeUndefined();
      const serialized = JSON.stringify(response.body);
      for (const forbidden of ['encoded_polyline', 'distance_meters', 'duration_seconds', 'total_']) {
        expect(serialized).not.toContain(forbidden);
      }
      // The raw provider message never leaks into the canonical envelope.
      expect(serialized).not.toContain('exploded');
    });
  });

  describe('geometry and lat/lng ordering', () => {
    test('the provider is asked pickup -> destination and the decoded polyline starts/ends exactly there', async () => {
      // A local provider double that ENCODES the polyline from the request it
      // received, so the assertion is about the runtime's call, not a fixture.
      const encodingProvider = {
        calls: [],
        async computeRoute(routeRequest) {
          this.calls.push(routeRequest);
          return {
            provider_to_pickup: null,
            pickup_to_destination: { distance_meters: 8123, duration_seconds: 999 },
            encoded_polyline: encodePolyline([
              [routeRequest.origin.latitude, routeRequest.origin.longitude],
              [routeRequest.destination.latitude, routeRequest.destination.longitude],
            ]),
          };
        },
      };

      const localApp = createApp({ tow: { clock, routeProvider: encodingProvider } }).listen(0);
      try {
        const localServices = buildTowServices({ db: testDb.db, clock, routeProvider: encodingProvider });
        const scenario = await createAssignedScenario({
          app: localApp,
          services: localServices,
          clock,
          partnerCount: 1,
        });
        // The proposal flow quoted through the same provider; isolate the read.
        encodingProvider.calls.length = 0;

        const response = await getRoute(localApp, scenario.request.id, scenario.customerAuth);
        expect(response.status).toBe(200);
        expect(response.body.data.route_quote).toEqual({
          pickup_to_destination: { distance_meters: 8123, duration_seconds: 999 },
          total_distance_meters: 8123,
          total_duration_seconds: 999,
        });

        // The decoded geometry is latitude-first and in request order: first
        // point = pickup, last point = destination. A swapped origin/destination
        // or an inverted lat/lng would fail here.
        const decoded = decodePolyline(response.body.data.encoded_polyline);
        expect(decoded).toHaveLength(2);
        expect(decoded[0]).toEqual({
          latitude: atPolylinePrecision(PICKUP.latitude),
          longitude: atPolylinePrecision(PICKUP.longitude),
        });
        expect(decoded[1]).toEqual({
          latitude: atPolylinePrecision(DESTINATION.latitude),
          longitude: atPolylinePrecision(DESTINATION.longitude),
        });
        // The snapshot's canonical endpoints are the exact stored points; the
        // geometry matches them at the format's own 1e-5 resolution.
        expect(response.body.data.pickup).toEqual({
          latitude: PICKUP.latitude,
          longitude: PICKUP.longitude,
          formatted_address: PICKUP.formatted_address,
        });
        expect(response.body.data.destination).toEqual({
          latitude: DESTINATION.latitude,
          longitude: DESTINATION.longitude,
          formatted_address: DESTINATION.formatted_address,
        });
        for (const [canonical, geometry] of [
          [PICKUP, decoded[0]],
          [DESTINATION, decoded[decoded.length - 1]],
        ]) {
          expect(Math.abs(canonical.latitude - geometry.latitude)).toBeLessThanOrEqual(5e-6);
          expect(Math.abs(canonical.longitude - geometry.longitude)).toBeLessThanOrEqual(5e-6);
        }

        expect(encodingProvider.calls).toHaveLength(1);
        expect(encodingProvider.calls[0]).toEqual({
          origin: { latitude: PICKUP.latitude, longitude: PICKUP.longitude },
          destination: { latitude: DESTINATION.latitude, longitude: DESTINATION.longitude },
        });
        expect(encodingProvider.calls[0].pickup).toBeUndefined();
      } finally {
        await new Promise((resolve) => { localApp.closeAllConnections?.(); localApp.close(resolve); });
      }
    });
  });
});

describe('B5 ARCH — route registration, wiring and DTO ownership', () => {
  test('exactly the canonical route is registered, served to the two principals', () => {
    const routes = fs.readFileSync(path.join(TOW_SRC, 'http/routes.js'), 'utf8');
    expect(routes).toContain(
      "router.get('/requests/:requestId/route', auth, requireCustomerOrTowPartner, routeController.getRoute);"
    );
    // Exactly one `/route` path registration exists in the module router.
    expect(routes.match(/\/route['"]/g)).toHaveLength(1);
  });

  test('the service is wired from the composition root and exported by the barrel', () => {
    const composition = fs.readFileSync(path.join(TOW_SRC, 'composition.js'), 'utf8');
    expect(composition).toContain('createRouteService({');
    expect(composition).toContain('routeService: createRouteService');
    const application = require('../../../src/modules/tow/application');
    expect(application.createRouteService).toBeInstanceOf(Function);
  });

  test('the domain owns the snapshot DTO and it carries no price member', () => {
    const domain = require('../../../src/modules/tow/domain');
    const snapshot = domain.buildTowRouteSnapshot({
      request: { id: 1, pickup: PICKUP, destination: DESTINATION },
      route: {
        pickup_to_destination: { distance_meters: 10, duration_seconds: 2 },
        encoded_polyline: 'polyline',
      },
      generatedAt: '2026-01-15T12:00:00.000Z',
    });
    expect(Object.keys(snapshot).sort()).toEqual([
      'destination', 'encoded_polyline', 'generated_at', 'pickup', 'request_id', 'route_quote',
    ]);
    expect(snapshot.route_quote.provider_to_pickup).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toMatch(/amount_cents|final_price|calculated_price/);
  });
});
