/**
 * Local validation profile — guarded config and the deterministic route fixture.
 *
 * The Tow MVP is CASH-only (no PSP, no gateway) and the local validation
 * environment has no Google Routes server key. This suite pins the two explicit
 * selections that make that environment possible, and the invariants that keep
 * them out of production:
 *
 *   - `TOW_PAYMENT_MODE` resolves to `cash` by default and to `mock` only when
 *     asked; `mock` is impossible with `NODE_ENV`/`APP_ENV=production`;
 *   - `TOW_ROUTE_PROVIDER` resolves to `google` by default and to the
 *     deterministic fixture only when asked; the fixture is impossible with
 *     `NODE_ENV`/`APP_ENV=production`;
 *   - the fixture adapter satisfies the frozen `RouteProvider` port, is fully
 *     deterministic and encodes a decodable polyline;
 *   - composition maps the resolved kind to the adapter and carries the payment
 *     mode.
 *
 * Every config assertion passes an explicit env object: `process.env` is never
 * mutated, so suites stay order-independent and offline.
 */
'use strict';

const { db } = require('../../helpers/testDb');
const {
  TOW_PAYMENT_MODE_VAR,
  TOW_PAYMENT_MODES,
  resolveTowPaymentMode,
  assertTowPaymentModeSafe,
  describeTowPaymentMode,
} = require('../../../src/config/towPaymentMode');
const {
  TOW_ROUTE_PROVIDER_VAR,
  TOW_ROUTE_PROVIDER_KINDS,
  resolveTowRouteProviderKind,
  assertTowRouteProviderSafe,
} = require('../../../src/config/towRouteProvider');
const {
  createValidationRoutesAdapter,
  DEFAULT_DETOUR_FACTOR,
} = require('../../../src/modules/tow/adapters/routes/validation-routes-adapter');
const {
  RouteProviderError,
} = require('../../../src/modules/tow/adapters/routes/route-provider-error');
const {
  buildTowServices,
  createConfiguredRouteProvider,
} = require('../../../src/modules/tow/composition');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const { geodesicDistanceMeters } = require('../../../src/modules/tow/domain');

const ORIGIN = Object.freeze({ latitude: -23.561684, longitude: -46.655981 });
const PICKUP = Object.freeze({ latitude: -23.5475, longitude: -46.6388 });
const DESTINATION = Object.freeze({ latitude: -23.6, longitude: -46.7 });

/** Small local decoder — deliberately independent from the adapter's encoder. */
function decodeSignedValue(encoded, index) {
  let result = 0;
  let shift = 0;
  let byte = 0;
  let cursor = index;
  do {
    byte = encoded.charCodeAt(cursor) - 63;
    cursor += 1;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);
  const value = (result & 1) ? ~(result >> 1) : (result >> 1);
  return { value, nextIndex: cursor };
}

function decodePolyline(encoded) {
  const points = [];
  let latitude = 0;
  let longitude = 0;
  let index = 0;
  while (index < encoded.length) {
    const decodedLatitude = decodeSignedValue(encoded, index);
    latitude += decodedLatitude.value;
    index = decodedLatitude.nextIndex;
    const decodedLongitude = decodeSignedValue(encoded, index);
    longitude += decodedLongitude.value;
    index = decodedLongitude.nextIndex;
    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }
  return points;
}

async function captureError(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to reject');
}

describe('validation profile — TOW_PAYMENT_MODE', () => {
  test('the vocabulary is exactly cash and mock', () => {
    expect(TOW_PAYMENT_MODE_VAR).toBe('TOW_PAYMENT_MODE');
    expect(TOW_PAYMENT_MODES).toEqual(['cash', 'mock']);
  });

  test('defaults to cash when unset or empty', () => {
    for (const env of [{}, { [TOW_PAYMENT_MODE_VAR]: '' }, { [TOW_PAYMENT_MODE_VAR]: '   ' }]) {
      const resolved = resolveTowPaymentMode(env);
      expect(resolved).toEqual({ mode: 'cash', simulated: false });
      expect(Object.isFrozen(resolved)).toBe(true);
    }
  });

  test('mock is resolved only when explicitly requested', () => {
    expect(resolveTowPaymentMode({ [TOW_PAYMENT_MODE_VAR]: 'mock' }))
      .toEqual({ mode: 'mock', simulated: true });
  });

  test('an unrecognized value fails fast instead of being coerced', () => {
    for (const value of ['card', 'MOCK', 'cashless', 'true']) {
      const error = (() => {
        try {
          resolveTowPaymentMode({ [TOW_PAYMENT_MODE_VAR]: value });
          return null;
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe('TOW_PAYMENT_MODE_INVALID');
    }
  });

  test('mock is allowed in development and test', () => {
    for (const nodeEnv of ['development', 'test']) {
      expect(assertTowPaymentModeSafe({
        NODE_ENV: nodeEnv,
        [TOW_PAYMENT_MODE_VAR]: 'mock',
      })).toEqual({ mode: 'mock', simulated: true });
    }
  });

  test('mock in production throws TOW_PAYMENT_MODE_UNSAFE', () => {
    const error = (() => {
      try {
        assertTowPaymentModeSafe({ NODE_ENV: 'production', [TOW_PAYMENT_MODE_VAR]: 'mock' });
        return null;
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('TOW_PAYMENT_MODE_UNSAFE');
    expect(error.message).toMatch(/validation-only/);
  });

  test('APP_ENV=production also refuses mock', () => {
    expect(() => assertTowPaymentModeSafe({
      NODE_ENV: 'development',
      APP_ENV: 'production',
      [TOW_PAYMENT_MODE_VAR]: 'mock',
    })).toThrow(/validation-only/);
  });

  test('cash is safe in production', () => {
    expect(assertTowPaymentModeSafe({ NODE_ENV: 'production' }))
      .toEqual({ mode: 'cash', simulated: false });
  });

  test('the description is safe, explicit and never a secret', () => {
    expect(describeTowPaymentMode({ mode: 'mock', simulated: true }))
      .toBe('MOCK (validation only — no PSP, no real money)');
    expect(describeTowPaymentMode({ mode: 'cash', simulated: false }))
      .toBe('CASH (no PSP; cash is settled in hand)');
  });
});

describe('validation profile — TOW_ROUTE_PROVIDER', () => {
  test('the vocabulary is exactly google and validation-fixture', () => {
    expect(TOW_ROUTE_PROVIDER_VAR).toBe('TOW_ROUTE_PROVIDER');
    expect(TOW_ROUTE_PROVIDER_KINDS).toEqual(['google', 'validation-fixture']);
  });

  test('defaults to google when unset or empty', () => {
    expect(resolveTowRouteProviderKind({})).toBe('google');
    expect(resolveTowRouteProviderKind({ [TOW_ROUTE_PROVIDER_VAR]: '' })).toBe('google');
  });

  test('the validation fixture is selected only when explicitly requested', () => {
    expect(resolveTowRouteProviderKind({ [TOW_ROUTE_PROVIDER_VAR]: 'validation-fixture' }))
      .toBe('validation-fixture');
  });

  test('an unrecognized value fails fast', () => {
    for (const value of ['fixture', 'google-maps', 'GOOGLE']) {
      const error = (() => {
        try {
          resolveTowRouteProviderKind({ [TOW_ROUTE_PROVIDER_VAR]: value });
          return null;
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe('TOW_ROUTE_PROVIDER_INVALID');
    }
  });

  test('the fixture is allowed in development and test', () => {
    for (const nodeEnv of ['development', 'test']) {
      expect(assertTowRouteProviderSafe({
        NODE_ENV: nodeEnv,
        [TOW_ROUTE_PROVIDER_VAR]: 'validation-fixture',
      })).toBe('validation-fixture');
    }
  });

  test('the fixture in production throws TOW_ROUTE_PROVIDER_UNSAFE', () => {
    const error = (() => {
      try {
        assertTowRouteProviderSafe({
          NODE_ENV: 'production',
          [TOW_ROUTE_PROVIDER_VAR]: 'validation-fixture',
        });
        return null;
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('TOW_ROUTE_PROVIDER_UNSAFE');
    expect(error.message).toMatch(/validation-only/);
  });

  test('APP_ENV=production also refuses the fixture', () => {
    expect(() => assertTowRouteProviderSafe({
      NODE_ENV: 'development',
      APP_ENV: 'production',
      [TOW_ROUTE_PROVIDER_VAR]: 'validation-fixture',
    })).toThrow(/validation-only/);
  });

  test('google is safe in production', () => {
    expect(assertTowRouteProviderSafe({ NODE_ENV: 'production' })).toBe('google');
  });
});

describe('validation profile — deterministic route fixture adapter', () => {
  const adapter = createValidationRoutesAdapter();

  test('exposes the RouteProvider port shape under a fixture name', () => {
    expect(adapter.name).toBe('validation-fixture-routes');
    expect(typeof adapter.computeRoute).toBe('function');
  });

  test('same input twice produces a deep-equal result (no clock, no randomness)', async () => {
    const request = { origin: ORIGIN, destination: DESTINATION, pickup: PICKUP };
    const first = await adapter.computeRoute(request);
    const second = await adapter.computeRoute(request);
    expect(second).toEqual(first);
  });

  test('legs are the geodesic distance times the detour factor', async () => {
    const result = await adapter.computeRoute({ origin: ORIGIN, destination: DESTINATION, pickup: PICKUP });

    const expectedProviderToPickup = Math.round(geodesicDistanceMeters(ORIGIN, PICKUP) * DEFAULT_DETOUR_FACTOR);
    const expectedPickupToDestination = Math.round(geodesicDistanceMeters(PICKUP, DESTINATION) * DEFAULT_DETOUR_FACTOR);

    expect(result.provider_to_pickup).toEqual({
      distance_meters: expectedProviderToPickup,
      duration_seconds: Math.round(expectedProviderToPickup / 11.1),
    });
    expect(result.pickup_to_destination).toEqual({
      distance_meters: expectedPickupToDestination,
      duration_seconds: Math.round(expectedPickupToDestination / 11.1),
    });
  });

  test('provider_to_pickup is null when the request has no pickup', async () => {
    const result = await adapter.computeRoute({ origin: ORIGIN, destination: DESTINATION });
    expect(result.provider_to_pickup).toBeNull();
    expect(result.pickup_to_destination).not.toBeNull();
  });

  test('the polyline decodes back to origin, pickup and destination in order', async () => {
    const result = await adapter.computeRoute({ origin: ORIGIN, destination: DESTINATION, pickup: PICKUP });
    const decoded = decodePolyline(result.encoded_polyline);

    expect(decoded).toHaveLength(3);
    for (const [point, expected] of [
      [decoded[0], ORIGIN],
      [decoded[1], PICKUP],
      [decoded[2], DESTINATION],
    ]) {
      expect(point.latitude).toBeCloseTo(expected.latitude, 4);
      expect(point.longitude).toBeCloseTo(expected.longitude, 4);
    }
  });

  test('single-leg polyline decodes back to origin and destination', async () => {
    const result = await adapter.computeRoute({ origin: ORIGIN, destination: DESTINATION });
    const decoded = decodePolyline(result.encoded_polyline);
    expect(decoded).toHaveLength(2);
    expect(decoded[0].latitude).toBeCloseTo(ORIGIN.latitude, 4);
    expect(decoded[1].latitude).toBeCloseTo(DESTINATION.latitude, 4);
  });

  test('malformed coordinates are a RouteProviderError with an invalid_request reason', async () => {
    const error = await captureError(adapter.computeRoute({
      origin: { latitude: 'north', longitude: -46.6 },
      destination: DESTINATION,
    }));
    expect(error).toBeInstanceOf(RouteProviderError);
    expect(error.code).toBe('route_provider_error');
    expect(error.reason).toBe('invalid_request');

    await expect(adapter.computeRoute({ destination: DESTINATION }))
      .rejects.toMatchObject({ reason: 'invalid_request' });
    await expect(adapter.computeRoute({ origin: ORIGIN, destination: null }))
      .rejects.toMatchObject({ reason: 'invalid_request' });
    await expect(adapter.computeRoute({ origin: ORIGIN, destination: DESTINATION, pickup: {} }))
      .rejects.toMatchObject({ reason: 'invalid_request' });
  });
});

describe('validation profile — composition wiring', () => {
  test('buildTowServices carries the resolved payment mode and an injected provider', () => {
    const services = buildTowServices({
      db,
      clock: { now: () => new Date('2026-06-01T12:00:00.000Z') },
      storage: { save: async () => ({ key: 'k' }), read: async () => Buffer.alloc(0), remove: async () => {} },
      routeProvider: createFakeRouteProvider(),
      paymentMode: resolveTowPaymentMode({}),
    });

    expect(services.paymentMode).toEqual({ mode: 'cash', simulated: false });
    expect(services.routeProvider.name).toBe('fake-route-provider');
  });

  test('createConfiguredRouteProvider defaults to the real Google adapter', () => {
    const provider = createConfiguredRouteProvider({}, {});
    expect(provider.name).toBe('google-routes');
    expect(typeof provider.computeRoute).toBe('function');
  });

  test('createConfiguredRouteProvider selects the fixture only by explicit env', () => {
    const provider = createConfiguredRouteProvider({}, { [TOW_ROUTE_PROVIDER_VAR]: 'validation-fixture' });
    expect(provider.name).toBe('validation-fixture-routes');
  });

  test('createConfiguredRouteProvider refuses the fixture in production', () => {
    expect(() => createConfiguredRouteProvider({}, {
      NODE_ENV: 'production',
      [TOW_ROUTE_PROVIDER_VAR]: 'validation-fixture',
    })).toThrow(/validation-only/);
  });
});
