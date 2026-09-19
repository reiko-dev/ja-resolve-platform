/**
 * MVP-02 — UNIT suite for the `quoteTow` application operation.
 *
 * Proves the application boundary:
 *   - the route comes only from the injected `RouteProvider` port;
 *   - the two legs stay individually observable and the total is their exact sum;
 *   - the price comes only from the pure domain policy over that total;
 *   - the returned quote is an immutable, serializable snapshot (MVP-04 freezes it);
 *   - a provider failure becomes the canonical `external_dependency_unavailable`
 *     with NO price at all — there is no Haversine and no estimated fallback;
 *   - coordinates and tariff are validated before the provider is ever called.
 *
 * RED-first: written before `application/quote-service.js` exists.
 */
'use strict';

const { createQuoteService } = require('../../../src/modules/tow/application/quote-service');
const {
  createFakeRouteProvider,
} = require('../../helpers/tow/gateways/mapsGateway');
const { TowError } = require('../../../src/modules/tow/domain/errors');

const CLOCK_INSTANT = new Date('2026-06-01T12:00:00.000Z');
const PROVIDER = { latitude: -23.561684, longitude: -46.655981 };
const PICKUP = { latitude: -23.5475, longitude: -46.6388 };
const DESTINATION = { latitude: -23.6, longitude: -46.7 };

const TARIFF = Object.freeze({
  minimum_charge_cents: 15000,
  included_km: 10,
  price_per_additional_km_cents: 800,
});

function createClock(instant = CLOCK_INSTANT) {
  return { now: () => new Date(instant.getTime()) };
}

function createService({ routeProvider, vehicleRepository = null, clock = createClock() } = {}) {
  return createQuoteService({
    routeProvider: routeProvider || createFakeRouteProvider(),
    vehicleRepository,
    clock,
  });
}

function quote(service, overrides = {}) {
  return service.quoteTow({
    provider: PROVIDER,
    pickup: PICKUP,
    destination: DESTINATION,
    tariff: TARIFF,
    ...overrides,
  });
}

describe('MVP-02 UNIT — quoteTow application operation', () => {
  describe('authoritative route snapshot', () => {
    test('produces both legs, their exact totals and the encoded polyline', async () => {
      const service = createService();
      const result = await quote(service);

      expect(result.route_quote).toEqual({
        provider_to_pickup: { distance_meters: 7000, duration_seconds: 900 },
        pickup_to_destination: { distance_meters: 7350, duration_seconds: 1200 },
        total_distance_meters: 14350,
        total_duration_seconds: 2100,
        encoded_polyline: 'fake-encoded-polyline',
      });
    });

    test('total meters is exactly the sum of the two provider legs', async () => {
      const routeProvider = createFakeRouteProvider({
        providerToPickup: { distance_meters: 1234, duration_seconds: 111 },
        pickupToDestination: { distance_meters: 8766, duration_seconds: 222 },
      });
      const result = await quote(createService({ routeProvider }));
      expect(result.route_quote.total_distance_meters).toBe(10000);
      expect(result.route_quote.total_duration_seconds).toBe(333);
    });

    test('asks the provider for provider -> pickup -> destination, with the pickup in the middle', async () => {
      const routeProvider = createFakeRouteProvider();
      await quote(createService({ routeProvider }));

      expect(routeProvider.callCount('computeRoute')).toBe(1);
      expect(routeProvider.lastCall('computeRoute').request).toEqual({
        origin: PROVIDER,
        destination: DESTINATION,
        pickup: PICKUP,
      });
    });

    test('preserves a null polyline when the provider returns no geometry', async () => {
      const routeProvider = createFakeRouteProvider({ encodedPolyline: null });
      const result = await quote(createService({ routeProvider }));
      expect(result.route_quote.encoded_polyline).toBeNull();
    });
  });

  describe('authoritative pricing over the summed route', () => {
    test('prices the summed distance with the frozen contract result', async () => {
      const result = await quote(createService());
      expect(result.calculated_price).toEqual({ amount_cents: 18480, currency: 'BRL' });
      expect(result.pricing_snapshot).toEqual({
        minimum_charge_cents: 15000,
        included_km: 10,
        included_meters: 10000,
        price_per_additional_km_cents: 800,
      });
    });

    test('the two legs are summed BEFORE pricing, not priced separately', async () => {
      // 6000 m + 6000 m = 12000 m -> 2000 m excess -> R$16,00 -> R$166,00.
      // Pricing each leg separately would give 0 excess on each leg -> R$150,00.
      const routeProvider = createFakeRouteProvider({
        providerToPickup: { distance_meters: 6000, duration_seconds: 600 },
        pickupToDestination: { distance_meters: 6000, duration_seconds: 600 },
      });
      const result = await quote(createService({ routeProvider }));
      expect(result.calculated_price.amount_cents).toBe(16600);
    });

    test('a route inside the included distance charges the minimum only', async () => {
      const routeProvider = createFakeRouteProvider({
        providerToPickup: { distance_meters: 4000, duration_seconds: 600 },
        pickupToDestination: { distance_meters: 5850, duration_seconds: 600 },
      });
      const result = await quote(createService({ routeProvider }));
      expect(result.route_quote.total_distance_meters).toBe(9850);
      expect(result.calculated_price.amount_cents).toBe(15000);
    });

    test('one meter above the included distance is billed proportionally', async () => {
      const routeProvider = createFakeRouteProvider({
        providerToPickup: { distance_meters: 5000, duration_seconds: 600 },
        pickupToDestination: { distance_meters: 5001, duration_seconds: 600 },
      });
      const result = await quote(createService({ routeProvider }));
      expect(result.calculated_price.amount_cents).toBe(15001);
    });
  });

  describe('the quote is a snapshot, not a live reference', () => {
    test('mutating the caller tariff after the quote does not change the snapshot', async () => {
      const tariff = { ...TARIFF };
      const result = await quote(createService(), { tariff });

      tariff.minimum_charge_cents = 1;
      tariff.included_km = 0;
      tariff.price_per_additional_km_cents = 1;

      expect(result.pricing_snapshot).toEqual({
        minimum_charge_cents: 15000,
        included_km: 10,
        included_meters: 10000,
        price_per_additional_km_cents: 800,
      });
      expect(result.calculated_price.amount_cents).toBe(18480);
    });

    test('a later tariff change on the vehicle does not mutate an existing quote', async () => {
      const vehicle = { id: 7, pricing: { ...TARIFF } };
      const vehicleRepository = { findByPartnerAndId: async () => vehicle };
      const service = createService({ vehicleRepository });

      const first = await service.quoteTow({
        provider: PROVIDER, pickup: PICKUP, destination: DESTINATION, partnerId: 1, vehicleId: 7,
      });

      // Tariff B: 0 km included, R$1,00/km, R$1,00 minimum.
      vehicle.pricing = { minimum_charge_cents: 100, included_km: 0, price_per_additional_km_cents: 100 };

      const second = await service.quoteTow({
        provider: PROVIDER, pickup: PICKUP, destination: DESTINATION, partnerId: 1, vehicleId: 7,
      });

      expect(first.pricing_snapshot.minimum_charge_cents).toBe(15000);
      expect(first.pricing_snapshot.price_per_additional_km_cents).toBe(800);
      expect(first.calculated_price.amount_cents).toBe(18480);

      expect(second.pricing_snapshot.minimum_charge_cents).toBe(100);
      expect(second.pricing_snapshot.price_per_additional_km_cents).toBe(100);
      expect(second.calculated_price.amount_cents).toBe(1535);
    });

    test('the whole quote is deeply frozen and JSON-serializable', async () => {
      const result = await quote(createService());
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.route_quote)).toBe(true);
      expect(Object.isFrozen(result.route_quote.provider_to_pickup)).toBe(true);
      expect(Object.isFrozen(result.route_quote.pickup_to_destination)).toBe(true);
      expect(Object.isFrozen(result.pricing_snapshot)).toBe(true);
      expect(Object.isFrozen(result.calculated_price)).toBe(true);
      expect(JSON.parse(JSON.stringify(result))).toEqual({ ...result });
    });

    test('stamps generated_at from the injected clock port', async () => {
      const result = await quote(createService({ clock: createClock(new Date('2026-03-04T05:06:07.000Z')) }));
      expect(result.generated_at).toBe('2026-03-04T05:06:07.000Z');
    });
  });

  describe('tariff resolution through the VehicleRepository port', () => {
    test('resolves the tariff from the vehicle when no tariff is supplied', async () => {
      const vehicleRepository = {
        findByPartnerAndId: async () => ({ id: 7, pricing: { ...TARIFF } }),
      };
      const service = createService({ vehicleRepository });
      const result = await service.quoteTow({
        provider: PROVIDER, pickup: PICKUP, destination: DESTINATION, partnerId: 3, vehicleId: 7,
      });
      expect(result.calculated_price.amount_cents).toBe(18480);
    });

    test('an unknown vehicle is a not_found error and the provider is never called', async () => {
      const routeProvider = createFakeRouteProvider();
      const vehicleRepository = { findByPartnerAndId: async () => null };
      const service = createService({ routeProvider, vehicleRepository });

      await expect(service.quoteTow({
        provider: PROVIDER, pickup: PICKUP, destination: DESTINATION, partnerId: 3, vehicleId: 99,
      })).rejects.toMatchObject({ code: 'not_found' });
      expect(routeProvider.callCount('computeRoute')).toBe(0);
    });

    test('a missing tariff with no repository is a validation_error', async () => {
      const routeProvider = createFakeRouteProvider();
      const service = createService({ routeProvider });
      await expect(service.quoteTow({
        provider: PROVIDER, pickup: PICKUP, destination: DESTINATION,
      })).rejects.toMatchObject({ code: 'validation_error' });
      expect(routeProvider.callCount('computeRoute')).toBe(0);
    });
  });

  describe('validation happens before the provider is called', () => {
    test('a malformed provider coordinate is a validation_error and no Google call is attempted', async () => {
      const routeProvider = createFakeRouteProvider();
      const service = createService({ routeProvider });

      await expect(quote(service, { provider: { latitude: 120, longitude: 0 } }))
        .rejects.toMatchObject({ code: 'validation_error' });
      expect(routeProvider.callCount('computeRoute')).toBe(0);
    });

    test.each([
      ['pickup', { latitude: Number.NaN, longitude: 0 }],
      ['destination', { latitude: 0, longitude: 181 }],
      ['provider', { latitude: '10', longitude: 20 }],
    ])('a malformed %s coordinate is rejected without a provider call', async (field, point) => {
      const routeProvider = createFakeRouteProvider();
      const service = createService({ routeProvider });

      await expect(quote(service, { [field]: point })).rejects.toMatchObject({ code: 'validation_error' });
      expect(routeProvider.callCount('computeRoute')).toBe(0);
    });

    test('a malformed tariff is rejected without a provider call', async () => {
      const routeProvider = createFakeRouteProvider();
      const service = createService({ routeProvider });

      await expect(quote(service, { tariff: { minimum_charge_cents: -1, included_km: 1, price_per_additional_km_cents: 1 } }))
        .rejects.toMatchObject({ code: 'validation_error' });
      expect(routeProvider.callCount('computeRoute')).toBe(0);
    });
  });

  describe('client input can never override distance or price', () => {
    test('client-supplied distance, legs, totals and price are ignored', async () => {
      const result = await quote(createService(), {
        total_distance_meters: 1,
        distance_meters: 1,
        total_duration_seconds: 1,
        route_quote: { total_distance_meters: 1, total_duration_seconds: 1 },
        calculated_price: { amount_cents: 1, currency: 'BRL' },
        amount_cents: 1,
        price_cents: 1,
        excess_meters: 1,
        encoded_polyline: 'client-polyline',
        pricing_snapshot: { minimum_charge_cents: 1, included_km: 0, price_per_additional_km_cents: 1 },
      });

      expect(result.route_quote.total_distance_meters).toBe(14350);
      expect(result.route_quote.encoded_polyline).toBe('fake-encoded-polyline');
      expect(result.calculated_price.amount_cents).toBe(18480);
      expect(result.pricing_snapshot.minimum_charge_cents).toBe(15000);
    });

    test('an explicit backend tariff takes precedence and skips the repository lookup', async () => {
      const findByPartnerAndId = jest.fn(async () => ({ id: 7, pricing: { ...TARIFF } }));
      const service = createService({ vehicleRepository: { findByPartnerAndId } });
      const result = await service.quoteTow({
        provider: PROVIDER,
        pickup: PICKUP,
        destination: DESTINATION,
        partnerId: 3,
        vehicleId: 7,
        tariff: { minimum_charge_cents: 100, included_km: 0, price_per_additional_km_cents: 100 },
      });
      expect(result.pricing_snapshot).toEqual({
        minimum_charge_cents: 100,
        included_km: 0,
        included_meters: 0,
        price_per_additional_km_cents: 100,
      });
      expect(result.calculated_price.amount_cents).toBe(1535);
      expect(findByPartnerAndId).not.toHaveBeenCalled();
    });
  });

  describe('no Haversine, no estimate, no fallback', () => {
    test('a provider failure becomes external_dependency_unavailable with no price', async () => {
      const routeProvider = createFakeRouteProvider({ failure: { code: 'PROVIDER_DOWN' } });
      const service = createService({ routeProvider });

      await expect(quote(service)).rejects.toMatchObject({ code: 'external_dependency_unavailable' });
    });

    test('the canonical error carries the contract http status and leaks no provider internals', async () => {
      const routeProvider = createFakeRouteProvider({
        failure: { message: 'connect ECONNREFUSED 127.0.0.1:443 axios stack trace' },
      });
      const service = createService({ routeProvider });

      try {
        await quote(service);
        throw new Error('expected quoteTow to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(TowError);
        expect(error.code).toBe('external_dependency_unavailable');
        expect(error.httpStatus).toBe(503);
        expect(error.message).not.toMatch(/ECONNREFUSED|axios|stack|127\.0\.0\.1/i);
        expect(error.details).toBeUndefined();
      }
    });

    test('a failing provider never produces an estimated or Haversine-derived price', async () => {
      const routeProvider = createFakeRouteProvider({ failure: { code: 'TIMEOUT' } });
      const service = createService({ routeProvider });

      let settled = null;
      try {
        settled = await quote(service);
      } catch (error) {
        settled = error;
      }
      expect(settled).toBeInstanceOf(TowError);
      expect(settled.code).toBe('external_dependency_unavailable');
      expect(settled.calculated_price).toBeUndefined();
      expect(settled.route_quote).toBeUndefined();
    });

    test.each([
      ['negative distance', { pickup_to_destination: { distance_meters: -1, duration_seconds: 1 } }],
      ['fractional distance', { pickup_to_destination: { distance_meters: 1.5, duration_seconds: 1 } }],
      ['missing leg', {}],
      ['non-object payload', null],
    ])('a provider returning a malformed route (%s) is external_dependency_unavailable', async (_label, payload) => {
      const routeProvider = { name: 'broken', computeRoute: async () => payload };
      const service = createService({ routeProvider });
      await expect(quote(service)).rejects.toMatchObject({
        code: 'external_dependency_unavailable',
        httpStatus: 503,
      });
    });
  });

  describe('construction contract', () => {
    test('requires a route provider port', () => {
      expect(() => createQuoteService({ clock: createClock() })).toThrow(TypeError);
    });

    test('requires a clock port', () => {
      expect(() => createQuoteService({ routeProvider: createFakeRouteProvider() })).toThrow(TypeError);
    });
  });
});
