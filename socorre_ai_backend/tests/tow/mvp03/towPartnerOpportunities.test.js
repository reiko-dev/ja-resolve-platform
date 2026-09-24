/**
 * MVP-03 — `GET /api/tow/partner/opportunities` (geographic matching).
 *
 * Proves the partner-filtered, server-quoted opportunity feed:
 *   - only operational, eligible, inside-radius tow partners see a request;
 *   - the radius is the radius FROZEN on the request, not the live setting;
 *   - only an eligible, inside-radius candidate may reach the RouteProvider;
 *   - the proposed price is the authoritative MVP-02 quote, never a persisted
 *     or client-derived number;
 *   - the item is the truthful frozen `TowOpportunity` shape: the actual active
 *     vehicle used for eligibility/quote, the MVP-01 compatibility verdict and
 *     `opportunity_expires_at: null` (MVP-03 owns no expiry);
 *   - ordering is deterministic (distance, then request id).
 *
 * Live validation of the same response against the composed canonical
 * `TowOpportunityListResponse` lives in
 * `towPartnerOpportunitiesContract.test.js` (EXT-MVP03-1).
 *
 * RED-first: written before the matching service, the domain policy and the
 * route exist.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const request = require('supertest');
const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { buildTowServices } = require('../../../src/modules/tow/composition');
const {
  createTowCustomerAuth,
  createTowPartnerAuth,
  createTowAdminAuth,
} = require('../../helpers/tow/auth');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const {
  DEFAULT_INSTANT,
  PICKUP,
  TARIFF,
  createTowRequestInput,
  createMvp03Services,
  createOperationalPartner,
} = require('../../helpers/tow/mvp03');

const ENDPOINT = '/api/tow/partner/opportunities';
const REQUESTS = '/api/tow/requests';

/** ~14.5 km south of the canonical pickup: inside the default 40 km radius. */
const NEAR_PARTNER = Object.freeze({ latitude: PICKUP.latitude - 0.13, longitude: PICKUP.longitude });
/** ~17.8 km south of the canonical pickup: inside a frozen 30 km radius only. */
const FAR_PARTNER = Object.freeze({ latitude: PICKUP.latitude - 0.16, longitude: PICKUP.longitude });
/** ~50 km south of the canonical pickup: outside the default 40 km radius. */
const VERY_FAR_PARTNER = Object.freeze({ latitude: PICKUP.latitude - 0.45, longitude: PICKUP.longitude });
/** ~38.9 km south: inside the frozen 40 km radius (boundary proof). */
const BOUNDARY_INSIDE_PARTNER = Object.freeze({ latitude: PICKUP.latitude - 0.35, longitude: PICKUP.longitude });
/** ~41.1 km south: outside the frozen 40 km radius (boundary proof). */
const BOUNDARY_OUTSIDE_PARTNER = Object.freeze({ latitude: PICKUP.latitude - 0.37, longitude: PICKUP.longitude });

describe('MVP-03 — partner opportunities', () => {
  let app;
  let services;
  let clock;
  let routeProvider;
  let customer;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock(DEFAULT_INSTANT);
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
    ({ services } = createMvp03Services({ clock, routeProvider }));
    customer = await createTowCustomerAuth({ name: 'Customer MVP03' });
  });

  afterAll(async () => {
    await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
    await testDb.reset();
  });

  beforeEach(async () => {
    await testDb.db('tow_requests').del();
    await testDb.db('tow_vehicle_documents').del();
    await testDb.db('tow_vehicles').del();
    await testDb.db('partners').del();
    await testDb.db('users').where({ role: 'partner' }).del();
    await testDb.db('service_modules').where({ module_key: 'tow' }).del();
    routeProvider.reset();
    routeProvider.failure = null;
    clock.reset();
  });

  async function createRequest(options = {}) {
    const response = await request(app)
      .post(REQUESTS)
      .set('Idempotency-Key', options.key || 'idem-opportunity-0001')
      .set((options.auth || customer).headers)
      .send(options.payload || createTowRequestInput());
    expect(response.status).toBe(201);
    return response.body.data;
  }

  async function partnerWith(options = {}) {
    // `createTowPartnerAuth` spreads its remaining keys straight into the
    // partner row, so the overrides must NOT be nested under a
    // `partnerOverrides` key.
    const auth = await createTowPartnerAuth(options.partnerOverrides || {});
    if (options.vehicle === null) return auth;

    const built = await createOperationalPartner({
      services,
      partner: auth.partner,
      vehicleOverrides: options.vehicleOverrides || {},
      documents: options.documents === undefined
        ? [{ document_type: 'vehicle_license', status: 'approved' }]
        : options.documents,
      active: options.active === undefined ? true : options.active,
    });
    return { ...auth, partner: built.partner, vehicle: built.vehicle };
  }

  function listOpportunities(auth) {
    return request(app).get(ENDPOINT).set(auth.headers);
  }

  describe('inclusion', () => {
    test('an operational in-radius tow partner sees the request with the authoritative quote', async () => {
      const created = await createRequest();
      const partner = await partnerWith({ partnerOverrides: NEAR_PARTNER });

      const response = await listOpportunities(partner);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.meta).toMatchObject({ page: 1, limit: 20, total: 1 });
      expect(response.body.data.items).toHaveLength(1);

      const opportunity = response.body.data.items[0];
      expect(Object.keys(opportunity).sort()).toEqual([
        'active_tow_vehicle',
        'compatibility',
        'opportunity_expires_at',
        'proposed_price',
        'request',
        'route_quote',
      ]);
      // Same canonical row, different VIEWER: `allowed_actions` is viewer-aware,
      // and the owner's ISSUE #6 `cancel` is not offered to the partner viewer
      // (a partner has no request-level action in SEARCHING). The rest of the
      // projection must be identical.
      const opportunityRequest = { ...opportunity.request };
      delete opportunityRequest.allowed_actions;
      const createdRequest = { ...created };
      delete createdRequest.allowed_actions;
      expect(opportunityRequest).toEqual(createdRequest);
      expect(opportunity.request.allowed_actions).toEqual([]);
      expect(created.allowed_actions).toEqual(['cancel']);
      expect(opportunity.proposed_price).toEqual({ amount_cents: 18480, currency: 'BRL' });
      expect(opportunity.route_quote).toEqual({
        total_distance_meters: 14350,
        total_duration_seconds: 2100,
      });
      // The ACTUAL active vehicle used for eligibility and quote, projected to
      // `TowVehicleSummary`: no tariff, no persistence-only column.
      expect(opportunity.active_tow_vehicle).toEqual({
        id: String(partner.vehicle.id),
        plate: partner.vehicle.plate,
        make: 'Ford',
        model: 'F-4000',
        year: 2020,
        equipment_type: 'flatbed',
        supported_vehicle_classes: ['light_vehicle', 'motorcycle'],
        max_towed_weight_kg: 4000,
        document_status: 'pending',
        active: true,
      });
      expect(opportunity.compatibility).toEqual({
        compatible: true,
        vehicle_class_supported: true,
        weight_within_capacity: true,
      });
      // MVP-03 owns no expiry owner: the field is null, never fabricated.
      expect(opportunity.opportunity_expires_at).toBeNull();
    });

    test('the proposed price is exactly the live MVP-02 quote for that vehicle', async () => {
      await createRequest();
      const partner = await partnerWith({ partnerOverrides: NEAR_PARTNER });

      const response = await listOpportunities(partner);
      const quote = await services.quoteService.quoteTow({
        provider: { latitude: NEAR_PARTNER.latitude, longitude: NEAR_PARTNER.longitude },
        pickup: PICKUP,
        destination: createTowRequestInput().destination,
        tariff: TARIFF,
      });

      expect(response.body.data.items[0].proposed_price).toEqual(quote.calculated_price);
      // The response carries the contract projection of the live quote
      // (`RouteQuote` requires only the two totals); the per-leg detail and the
      // encoded polyline stay internal to MVP-02.
      expect(response.body.data.items[0].route_quote).toEqual({
        total_distance_meters: quote.route_quote.total_distance_meters,
        total_duration_seconds: quote.route_quote.total_duration_seconds,
      });
    });

    test('two partners with different TowVehicle tariffs receive different backend prices', async () => {
      await createRequest();
      const cheap = await partnerWith({ partnerOverrides: NEAR_PARTNER });
      const premiumTariff = {
        minimum_charge_cents: 30000,
        included_km: 5,
        price_per_additional_km_cents: 1200,
      };
      const premium = await partnerWith({
        partnerOverrides: { ...NEAR_PARTNER, cnpj: '11222333000199' },
        vehicleOverrides: { plate: 'XYZ9Z99', pricing: premiumTariff },
      });

      const cheapFeed = await listOpportunities(cheap);
      const premiumFeed = await listOpportunities(premium);
      const cheapPrice = cheapFeed.body.data.items[0].proposed_price;
      const premiumPrice = premiumFeed.body.data.items[0].proposed_price;

      // Same request, same road distance, DIFFERENT TowVehicle tariff: the price
      // is per-partner and computed only by the backend.
      expect(cheapFeed.body.data.items[0].route_quote)
        .toEqual(premiumFeed.body.data.items[0].route_quote);
      expect(cheapPrice).toEqual({ amount_cents: 18480, currency: 'BRL' });
      // 30000 + (14350 - 5000) * 1200 / 1000 = 30000 + 11220 = 41220
      expect(premiumPrice).toEqual({ amount_cents: 41220, currency: 'BRL' });
      expect(premiumPrice.amount_cents).not.toBe(cheapPrice.amount_cents);
    });

    test('the quoted distance is exactly provider -> pickup + pickup -> destination', async () => {
      await createRequest();
      const partner = await partnerWith({ partnerOverrides: NEAR_PARTNER });
      routeProvider.providerToPickup = { distance_meters: 7000, duration_seconds: 900 };
      routeProvider.pickupToDestination = { distance_meters: 7350, duration_seconds: 1200 };

      const response = await listOpportunities(partner);
      const quote = await services.quoteService.quoteTow({
        provider: { latitude: NEAR_PARTNER.latitude, longitude: NEAR_PARTNER.longitude },
        pickup: PICKUP,
        destination: createTowRequestInput().destination,
        tariff: TARIFF,
      });

      expect(quote.route_quote.provider_to_pickup.distance_meters).toBe(7000);
      expect(quote.route_quote.pickup_to_destination.distance_meters).toBe(7350);
      expect(response.body.data.items[0].route_quote.total_distance_meters).toBe(14350);
      expect(response.body.data.items[0].proposed_price).toEqual(quote.calculated_price);
    });

    test('exactly one RouteProvider call is made per eligible opportunity', async () => {
      await createRequest();
      const partner = await partnerWith({ partnerOverrides: NEAR_PARTNER });

      await listOpportunities(partner);
      expect(routeProvider.callCount()).toBe(1);
    });

    test('an unverified partner is still matched (is_verified is not a blocking reason)', async () => {
      await createRequest();
      const partner = await partnerWith({
        partnerOverrides: { ...NEAR_PARTNER, is_verified: 0 },
      });

      const response = await listOpportunities(partner);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toHaveLength(1);
    });

    test('a pending approval_status does not block MVP-03 matching', async () => {
      await createRequest();
      const partner = await partnerWith({
        partnerOverrides: { ...NEAR_PARTNER, approval_status: 'pending' },
      });

      const response = await listOpportunities(partner);
      expect(response.body.data.items).toHaveLength(1);
    });

    test('a request frozen at a larger radius reaches a farther partner', async () => {
      await services.settingsService.patch({ tow_initial_radius_km: 30 });
      await createRequest({ key: 'idem-opportunity-wide-1' });
      const partner = await partnerWith({ partnerOverrides: FAR_PARTNER });

      const response = await listOpportunities(partner);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toHaveLength(1);
      await services.settingsService.patch({ tow_initial_radius_km: 40 });
    });

    test('a partner at ~39 km is inside the frozen 40 km radius', async () => {
      const created = await createRequest({ key: 'idem-opportunity-boundary-in' });
      const partner = await partnerWith({ partnerOverrides: BOUNDARY_INSIDE_PARTNER });

      const response = await listOpportunities(partner);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0].request.id).toBe(created.id);
    });

    test('a partner at ~41 km is outside the frozen 40 km radius', async () => {
      await createRequest({ key: 'idem-opportunity-boundary-out' });
      const partner = await partnerWith({ partnerOverrides: BOUNDARY_OUTSIDE_PARTNER });

      const response = await listOpportunities(partner);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toEqual([]);
      expect(routeProvider.callCount()).toBe(0);
    });

    test('opportunities are ordered by distance then request id', async () => {
      // Distance is measured from the PARTNER (which sits 0.13 deg south of the
      // canonical pickup), so the offsets below are expressed relative to it.
      const closest = await createRequest({
        key: 'idem-opportunity-near-1',
        payload: createTowRequestInput({ pickup: { latitude: NEAR_PARTNER.latitude + 0.01 } }),
      });
      clock.advanceMinutes(1);
      const farther = await createRequest({
        key: 'idem-opportunity-far-01',
        payload: createTowRequestInput({ pickup: { latitude: NEAR_PARTNER.latitude + 0.05 } }),
      });
      const partner = await partnerWith({ partnerOverrides: NEAR_PARTNER });

      const response = await listOpportunities(partner);
      expect(response.body.data.items.map((item) => item.request.id)).toEqual([closest.id, farther.id]);
    });

    test('equidistant opportunities are ordered by request id ascending', async () => {
      const first = await createRequest({
        key: 'idem-opportunity-tie-01',
        payload: createTowRequestInput({ pickup: { latitude: NEAR_PARTNER.latitude + 0.02 } }),
      });
      clock.advanceMinutes(1);
      const second = await createRequest({
        key: 'idem-opportunity-tie-02',
        payload: createTowRequestInput({ pickup: { latitude: NEAR_PARTNER.latitude + 0.02 } }),
      });
      const partner = await partnerWith({ partnerOverrides: NEAR_PARTNER });

      const response = await listOpportunities(partner);
      expect(response.body.data.items.map((item) => item.request.id))
        .toEqual([first.id, second.id].sort((a, b) => Number(a) - Number(b)));
    });

    test('pagination slices the ordered opportunity feed', async () => {
      for (let index = 0; index < 3; index += 1) {
        await createRequest({
          key: `idem-opportunity-page-${index}`,
          payload: createTowRequestInput({ pickup: { latitude: PICKUP.latitude - 0.01 * (index + 1) } }),
        });
        clock.advanceMinutes(1);
      }
      const partner = await partnerWith({ partnerOverrides: NEAR_PARTNER });

      const response = await request(app).get(`${ENDPOINT}?page=2&limit=2`).set(partner.headers);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.meta).toMatchObject({ page: 2, limit: 2, total: 3 });
    });

    test('a partner with no vehicle sees an empty feed and never reaches the provider', async () => {
      await createRequest();
      const partner = await partnerWith({ vehicle: null });

      const response = await listOpportunities(partner);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.meta.total).toBe(0);
      expect(routeProvider.callCount()).toBe(0);
    });

    test('an empty feed is a 200, never a 404 or a terminal state', async () => {
      const partner = await partnerWith({ partnerOverrides: NEAR_PARTNER });
      const response = await listOpportunities(partner);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toEqual([]);
      expect(routeProvider.callCount()).toBe(0);
    });
  });

  describe('exclusion — no opportunity and no provider call', () => {
    async function expectExcluded(partner) {
      const response = await listOpportunities(partner);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.meta.total).toBe(0);
      expect(routeProvider.callCount()).toBe(0);
    }

    test('an out-of-radius partner is excluded', async () => {
      await createRequest();
      await expectExcluded(await partnerWith({ partnerOverrides: VERY_FAR_PARTNER }));
    });

    test('an unavailable partner is excluded', async () => {
      await createRequest();
      await expectExcluded(await partnerWith({
        partnerOverrides: { ...NEAR_PARTNER, is_available: 0 },
      }));
    });

    test('an offline partner is excluded', async () => {
      await createRequest();
      await expectExcluded(await partnerWith({
        partnerOverrides: { ...NEAR_PARTNER, is_online: 0 },
      }));
    });

    test('a partner registered at (0,0) is excluded', async () => {
      await createRequest();
      await expectExcluded(await partnerWith({
        partnerOverrides: { latitude: 0, longitude: 0 },
      }));
    });

    test('a partner with no registered coordinates is excluded', async () => {
      await createRequest();
      await expectExcluded(await partnerWith({
        partnerOverrides: { latitude: null, longitude: null },
      }));
    });

    test('a partner whose only vehicle is inactive is excluded', async () => {
      await createRequest();
      await expectExcluded(await partnerWith({
        partnerOverrides: NEAR_PARTNER,
        active: false,
      }));
    });

    test('a partner with no vehicle document is excluded', async () => {
      await createRequest();
      await expectExcluded(await partnerWith({
        partnerOverrides: NEAR_PARTNER,
        documents: [],
      }));
    });

    test('a partner with a pending document is excluded', async () => {
      await createRequest();
      await expectExcluded(await partnerWith({
        partnerOverrides: NEAR_PARTNER,
        documents: [{ document_type: 'vehicle_license', status: 'pending' }],
      }));
    });

    test('a partner with a rejected document is excluded', async () => {
      await createRequest();
      await expectExcluded(await partnerWith({
        partnerOverrides: NEAR_PARTNER,
        documents: [{ document_type: 'vehicle_license', status: 'rejected' }],
      }));
    });

    test('a partner with an expired document is excluded', async () => {
      await createRequest();
      await expectExcluded(await partnerWith({
        partnerOverrides: NEAR_PARTNER,
        documents: [{
          document_type: 'vehicle_license',
          status: 'approved',
          expires_at: '2020-01-01T00:00:00.000Z',
        }],
      }));
    });

    test('a vehicle that does not support the requested class is excluded', async () => {
      await createRequest();
      await expectExcluded(await partnerWith({
        partnerOverrides: NEAR_PARTNER,
        vehicleOverrides: { supported_vehicle_classes: ['motorcycle'] },
      }));
    });

    test('a vehicle without enough capacity is excluded', async () => {
      await createRequest();
      await expectExcluded(await partnerWith({
        partnerOverrides: NEAR_PARTNER,
        vehicleOverrides: { max_towed_weight_kg: 1000 },
      }));
    });

    test('a non-tow partner cannot reach the feed at all', async () => {
      await createRequest();
      const mechanic = await createTowPartnerAuth({ type: 'mechanic', ...NEAR_PARTNER });
      const response = await listOpportunities(mechanic);
      expect(response.status).toBe(403);
      expect(routeProvider.callCount()).toBe(0);
    });
  });

  describe('request lifecycle scope', () => {
    test('a non-SEARCHING request is never offered', async () => {
      const created = await createRequest();
      // MVP-05 EXT: `tow_requests` now enforces terminal coherence
      // (`(state = 'CANCELLED') = (cancelled_at IS NOT NULL)`), so a fabricated
      // terminal row must carry its milestone. The assertion below is unchanged:
      // the feed offers SEARCHING requests only.
      await testDb.db('tow_requests').where({ id: created.id }).update({
        state: 'CANCELLED',
        cancelled_at: '2026-01-15T12:05:00.000Z',
        terminal_reason: 'CUSTOMER_CANCELLED',
      });
      const partner = await partnerWith({ partnerOverrides: NEAR_PARTNER });

      const response = await listOpportunities(partner);
      expect(response.body.data.items).toEqual([]);
      expect(routeProvider.callCount()).toBe(0);
    });

    test('only the in-radius eligible request reaches the provider among several', async () => {
      await createRequest({
        key: 'idem-opportunity-mix-01',
        // ~111 km south of the partner: outside the frozen 40 km radius.
        payload: createTowRequestInput({ pickup: { latitude: PICKUP.latitude - 1.0 } }),
      });
      clock.advanceMinutes(1);
      const eligible = await createRequest({ key: 'idem-opportunity-mix-02' });
      const partner = await partnerWith({ partnerOverrides: NEAR_PARTNER });

      const response = await listOpportunities(partner);
      expect(response.body.data.items.map((item) => item.request.id)).toEqual([eligible.id]);
      expect(routeProvider.callCount()).toBe(1);
    });

    test('the frozen radius wins over a later settings change', async () => {
      const created = await createRequest({ key: 'idem-opportunity-frozen' });
      await services.settingsService.patch({ tow_initial_radius_km: 5 });
      const partner = await partnerWith({ partnerOverrides: NEAR_PARTNER });

      const response = await listOpportunities(partner);
      expect(response.body.data.items.map((item) => item.request.id)).toEqual([created.id]);
      await services.settingsService.patch({ tow_initial_radius_km: 40 });
    });
  });

  describe('service catalog lifecycle', () => {
    test('a disabled service does NOT gate the feed for an existing request', async () => {
      // SERVICE CATALOG — the status gates NEW requests at creation only. A
      // request created while ACTIVE keeps matching after the service is
      // disabled, otherwise it would be stranded in SEARCHING forever.
      const created = await createRequest();
      const partner = await partnerWith({ partnerOverrides: NEAR_PARTNER });
      await services.moduleService.setEnabled({ enabled: false, reason: 'MVP-03 lifecycle' });

      const response = await listOpportunities(partner);
      expect(response.status).toBe(200);
      expect(response.body.data.items.map((item) => item.request.id)).toEqual([created.id]);
      expect(routeProvider.callCount()).toBe(1);
    });
  });

  describe('provider failure boundary', () => {
    test('a provider failure is a 503 with no fabricated price', async () => {
      await createRequest();
      const partner = await partnerWith({ partnerOverrides: NEAR_PARTNER });
      routeProvider.failure = { code: 'ROUTE_PROVIDER_UNAVAILABLE', message: 'maps down' };

      const response = await listOpportunities(partner);
      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('external_dependency_unavailable');
      expect(JSON.stringify(response.body)).not.toMatch(/amount_cents/);
    });
  });

  describe('authorization', () => {
    test('an anonymous caller is rejected with 401', async () => {
      const response = await request(app).get(ENDPOINT);
      expect(response.status).toBe(401);
    });

    test('a customer cannot read the partner feed', async () => {
      const response = await listOpportunities(customer);
      expect(response.status).toBe(403);
    });

    test('an admin cannot read the partner feed', async () => {
      const admin = await createTowAdminAuth();
      const response = await listOpportunities(admin);
      expect(response.status).toBe(403);
    });
  });
});
