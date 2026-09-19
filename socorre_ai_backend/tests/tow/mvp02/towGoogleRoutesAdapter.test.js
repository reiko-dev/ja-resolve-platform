/**
 * MVP-02 — UNIT suite for the Google Routes API v2 adapter.
 *
 * The adapter is the only place in the Tow module allowed to know about HTTP or
 * Google. Everything here runs against a stub HTTP client: no network, no key,
 * no `jest.mock('axios')`.
 *
 * Verified REST contract (see `docs/evidence/mvp-02/02-google-routes-contract.md`):
 *   POST https://routes.googleapis.com/directions/v2:computeRoutes
 *   headers  Content-Type / X-Goog-Api-Key / X-Goog-FieldMask (field mask is mandatory)
 *   body     {origin:{location:{latLng}}, destination:{...}, intermediates:[Waypoint], travelMode:'DRIVE', ...}
 *   response routes[].legs[].distanceMeters (int) + routes[].legs[].duration ("1234s")
 *            + routes[].polyline.encodedPolyline
 *
 * One request carries the pickup as a non-`via` intermediate waypoint, so Google
 * itself returns the two leg boundaries (`legs[0]` = provider -> pickup,
 * `legs[1]` = pickup -> destination) plus one continuous route polyline.
 *
 * RED-first: written before `adapters/routes/google-routes-adapter.js` exists.
 */
'use strict';

const {
  createGoogleRoutesAdapter,
} = require('../../../src/modules/tow/adapters/routes/google-routes-adapter');
const {
  RouteProviderError,
} = require('../../../src/modules/tow/adapters/routes/route-provider-error');
const { TowError } = require('../../../src/modules/tow/domain/errors');

const API_KEY = 'test-routes-key-do-not-use';
const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';

const PROVIDER = { latitude: -23.561684, longitude: -46.655981 };
const PICKUP = { latitude: -23.5475, longitude: -46.6388 };
const DESTINATION = { latitude: -23.6, longitude: -46.7 };

/** Deterministic stub HTTP client — records every call and replays a scripted outcome. */
function createStubHttpClient(outcome) {
  const calls = [];
  const queue = Array.isArray(outcome) ? outcome.slice() : null;
  return {
    calls,
    post: async (url, body, config) => {
      calls.push({ url, body, config });
      const next = queue ? queue.shift() : outcome;
      if (next && next.error) throw next.error;
      return next;
    },
  };
}

function leg({ distanceMeters = 7000, duration = '900s' } = {}) {
  return { distanceMeters, duration };
}

/** Google-shaped success payload with `count` legs. */
function googleRoute({ legs, distanceMeters, duration, polyline = 'encoded-route-polyline', omitPolyline = false } = {}) {
  const route = { legs: legs || [leg()] };
  if (distanceMeters !== undefined) route.distanceMeters = distanceMeters;
  if (duration !== undefined) route.duration = duration;
  if (!omitPolyline) route.polyline = { encodedPolyline: polyline };
  return { status: 200, headers: {}, data: { routes: [route] } };
}

/** Two-leg payload: provider -> pickup, then pickup -> destination. */
function twoLegRoute(overrides = {}) {
  return googleRoute({
    legs: [
      leg({ distanceMeters: 7000, duration: '900s' }),
      leg({ distanceMeters: 7350, duration: '1200s' }),
    ],
    ...overrides,
  });
}

function createAdapter(overrides = {}) {
  const httpClient = overrides.httpClient || createStubHttpClient(twoLegRoute());
  return {
    adapter: createGoogleRoutesAdapter({ apiKey: API_KEY, httpClient, ...overrides, httpClient }),
    httpClient,
  };
}

async function captureError(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to reject');
}

describe('MVP-02 UNIT — Google Routes adapter', () => {
  describe('request shape', () => {
    test('calls the documented Routes v2 endpoint exactly once per quote', async () => {
      const { adapter, httpClient } = createAdapter();
      await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });

      expect(httpClient.calls).toHaveLength(1);
      expect(httpClient.calls[0].url).toBe(ENDPOINT);
      expect(ENDPOINT).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    });

    test('sends origin = provider and destination = final destination', async () => {
      const { adapter, httpClient } = createAdapter();
      await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });

      const { body } = httpClient.calls[0];
      expect(body.origin).toEqual({ location: { latLng: { latitude: PROVIDER.latitude, longitude: PROVIDER.longitude } } });
      expect(body.destination).toEqual({ location: { latLng: { latitude: DESTINATION.latitude, longitude: DESTINATION.longitude } } });
    });

    test('sends the pickup as a non-via intermediate waypoint so Google emits two legs', async () => {
      const { adapter, httpClient } = createAdapter();
      await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });

      const { body } = httpClient.calls[0];
      expect(Array.isArray(body.intermediates)).toBe(true);
      expect(body.intermediates).toHaveLength(1);
      expect(body.intermediates[0].location.latLng).toEqual({ latitude: PICKUP.latitude, longitude: PICKUP.longitude });
      // `via: true` waypoints do NOT create a leg entry, so it must never be set.
      expect(body.intermediates[0].via).not.toBe(true);
    });

    test('never uses the wrong `waypoints` field name', async () => {
      const { adapter, httpClient } = createAdapter();
      await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });
      expect(httpClient.calls[0].body).not.toHaveProperty('waypoints');
    });

    test('uses DRIVE travel mode and does not request alternative routes', async () => {
      const { adapter, httpClient } = createAdapter();
      await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });

      expect(httpClient.calls[0].body.travelMode).toBe('DRIVE');
      expect(httpClient.calls[0].body.computeAlternativeRoutes).toBe(false);
    });

    test('sends the API key in the X-Goog-Api-Key header, never in the URL or body', async () => {
      const { adapter, httpClient } = createAdapter();
      await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });

      const call = httpClient.calls[0];
      expect(call.config.headers['X-Goog-Api-Key']).toBe(API_KEY);
      expect(call.config.headers['Content-Type']).toBe('application/json');
      expect(call.url).not.toContain(API_KEY);
      expect(JSON.stringify(call.body)).not.toContain(API_KEY);
    });

    test('requests a mandatory, minimal, non-wildcard field mask', async () => {
      const { adapter, httpClient } = createAdapter();
      await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });

      const mask = httpClient.calls[0].config.headers['X-Goog-FieldMask'];
      expect(mask).toBe('routes.legs.distanceMeters,routes.legs.duration,routes.polyline.encodedPolyline');
      expect(mask).not.toContain('*');
      expect(mask).not.toContain(' ');
    });

    test('applies the configured timeout', async () => {
      const { adapter, httpClient } = createAdapter({ timeoutMs: 4321 });
      await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });
      expect(httpClient.calls[0].config.timeout).toBe(4321);
    });

    test('defaults to a bounded timeout when none is configured', async () => {
      const { adapter, httpClient } = createAdapter();
      await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });
      expect(httpClient.calls[0].config.timeout).toBeGreaterThan(0);
      expect(httpClient.calls[0].config.timeout).toBeLessThanOrEqual(30000);
    });
  });

  describe('response mapping', () => {
    test('maps legs[0] to provider_to_pickup and legs[1] to pickup_to_destination', async () => {
      const { adapter } = createAdapter();
      const result = await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });

      expect(result.provider_to_pickup).toEqual({ distance_meters: 7000, duration_seconds: 900 });
      expect(result.pickup_to_destination).toEqual({ distance_meters: 7350, duration_seconds: 1200 });
    });

    test('never rounds or truncates a leg distance', async () => {
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient(googleRoute({
          legs: [leg({ distanceMeters: 1 }), leg({ distanceMeters: 999999999 })],
        })),
      });

      const result = await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });

      expect(result.provider_to_pickup.distance_meters).toBe(1);
      expect(result.pickup_to_destination.distance_meters).toBe(999999999);
    });

    test('converts the "1234s" duration string into integer seconds', async () => {
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient(googleRoute({
          legs: [leg({ duration: '900s' }), leg({ duration: '1200s' })],
        })),
      });

      const result = await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });

      expect(result.provider_to_pickup.duration_seconds).toBe(900);
      expect(result.pickup_to_destination.duration_seconds).toBe(1200);
    });

    test('rounds a fractional duration half-up to whole seconds', async () => {
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient(googleRoute({
          legs: [leg({ duration: '900.5s' }), leg({ duration: '900.4999s' })],
        })),
      });

      const result = await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });

      expect(result.provider_to_pickup.duration_seconds).toBe(901);
      expect(result.pickup_to_destination.duration_seconds).toBe(900);
    });

    test('preserves the whole-route encoded polyline returned by Google', async () => {
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient(twoLegRoute({ polyline: 'ipkcFfichVnP@j@BLoFVwM{E?' })),
      });

      const result = await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });

      expect(result.encoded_polyline).toBe('ipkcFfichVnP@j@BLoFVwM{E?');
    });

    test('returns a null polyline when Google omits the geometry', async () => {
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient(twoLegRoute({ omitPolyline: true })),
      });

      const result = await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });

      expect(result.encoded_polyline).toBeNull();
    });

    test('returns a null polyline when Google sends geometry we cannot render', async () => {
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient(twoLegRoute({ polyline: null })),
      });

      const result = await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });

      expect(result.encoded_polyline).toBeNull();
    });

    test('returns a frozen provider result', async () => {
      const { adapter } = createAdapter();
      const result = await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });
      expect(Object.isFrozen(result)).toBe(true);
    });

    test('tolerates extra unrequested provider fields without leaking them', async () => {
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient(googleRoute({
          legs: [leg(), leg()],
          distanceMeters: 14350,
          duration: '2100s',
        })),
      });

      const result = await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });

      expect(Object.keys(result).sort()).toEqual(['encoded_polyline', 'pickup_to_destination', 'provider_to_pickup']);
    });
  });

  describe('single-leg mode (no pickup supplied)', () => {
    test('omits intermediates and maps the single leg to pickup_to_destination', async () => {
      const { adapter, httpClient } = createAdapter({
        httpClient: createStubHttpClient(googleRoute({ legs: [leg({ distanceMeters: 8400, duration: '1320s' })] })),
      });

      const result = await adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION });

      expect(httpClient.calls).toHaveLength(1);
      expect(httpClient.calls[0].body.intermediates).toBeUndefined();
      expect(httpClient.calls[0].body.origin.location.latLng).toEqual({ latitude: PROVIDER.latitude, longitude: PROVIDER.longitude });
      expect(httpClient.calls[0].body.destination.location.latLng).toEqual({ latitude: DESTINATION.latitude, longitude: DESTINATION.longitude });
      expect(result.provider_to_pickup).toBeNull();
      expect(result.pickup_to_destination).toEqual({ distance_meters: 8400, duration_seconds: 1320 });
    });

    test('an unexpected extra leg in single-leg mode is a malformed_response failure', async () => {
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient(googleRoute({ legs: [leg(), leg()] })),
      });
      const error = await captureError(adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION }));
      expect(error.reason).toBe('malformed_response');
    });
  });

  describe('leg boundaries are never guessed', () => {
    test.each([
      ['no legs array', { routes: [{ polyline: { encodedPolyline: 'x' } }] }],
      ['non-array legs', { routes: [{ legs: 'nope' }] }],
      ['only one leg', { routes: [{ legs: [leg()] }] }],
      ['three legs', { routes: [{ legs: [leg(), leg(), leg()] }] }],
      ['empty legs', { routes: [{ legs: [] }] }],
    ])('%s for a pickup route is a malformed_response failure', async (_label, data) => {
      const { adapter } = createAdapter({ httpClient: createStubHttpClient({ status: 200, data }) });
      const error = await captureError(adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP }));
      expect(error).toBeInstanceOf(RouteProviderError);
      expect(error.reason).toBe('malformed_response');
    });
  });

  describe('provider failures are classified, never leaked', () => {
    test('an empty routes array is an empty_route failure', async () => {
      const { adapter } = createAdapter({ httpClient: createStubHttpClient({ status: 200, data: { routes: [] } }) });

      const error = await captureError(adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP }));
      expect(error).toBeInstanceOf(RouteProviderError);
      expect(error.reason).toBe('empty_route');
    });

    test.each([
      ['missing routes', { status: 200, data: {} }],
      ['non-array routes', { status: 200, data: { routes: 'nope' } }],
      ['missing data', { status: 200 }],
      ['null data', { status: 200, data: null }],
      ['string distance', { routes: [{ legs: [{ distanceMeters: '7000', duration: '900s' }, leg()] }] }],
      ['negative distance', { routes: [{ legs: [{ distanceMeters: -1, duration: '900s' }, leg()] }] }],
      ['fractional distance', { routes: [{ legs: [{ distanceMeters: 1.5, duration: '900s' }, leg()] }] }],
      ['missing distance', { routes: [{ legs: [{ duration: '900s' }, leg()] }] }],
      ['missing duration', { routes: [{ legs: [{ distanceMeters: 7000 }, leg()] }] }],
      ['unparseable duration', { routes: [{ legs: [{ distanceMeters: 7000, duration: 'soon' }, leg()] }] }],
      ['negative duration', { routes: [{ legs: [{ distanceMeters: 7000, duration: '-5s' }, leg()] }] }],
      ['second leg malformed', { routes: [{ legs: [leg(), { distanceMeters: null, duration: '900s' }] }] }],
    ])('%s is a malformed_response failure', async (_label, data) => {
      const { adapter } = createAdapter({ httpClient: createStubHttpClient({ status: 200, data }) });
      const error = await captureError(adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP }));
      expect(error).toBeInstanceOf(RouteProviderError);
      expect(error.reason).toBe('malformed_response');
    });

    test('an axios timeout is classified as timeout', async () => {
      const timeoutError = Object.assign(new Error('timeout of 8000ms exceeded'), { code: 'ECONNABORTED' });
      const { adapter } = createAdapter({ httpClient: createStubHttpClient({ error: timeoutError }) });

      const error = await captureError(adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP }));
      expect(error).toBeInstanceOf(RouteProviderError);
      expect(error.reason).toBe('timeout');
    });

    test('a transport failure with no response is classified as network_failure', async () => {
      const networkError = Object.assign(new Error('getaddrinfo ENOTFOUND routes.googleapis.com'), {
        code: 'ENOTFOUND',
        request: {},
      });
      const { adapter } = createAdapter({ httpClient: createStubHttpClient({ error: networkError }) });

      const error = await captureError(adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP }));
      expect(error).toBeInstanceOf(RouteProviderError);
      expect(error.reason).toBe('network_failure');
    });

    test.each([400, 401, 403, 429, 500, 503, 504])('an HTTP %p response is classified as provider_error', async (status) => {
      const providerError = Object.assign(new Error(`Request failed with status code ${status}`), {
        response: { status, data: { error: { code: status, message: 'RAW GOOGLE BODY', status: 'X' } } },
      });
      const { adapter } = createAdapter({ httpClient: createStubHttpClient({ error: providerError }) });

      const error = await captureError(adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP }));
      expect(error).toBeInstanceOf(RouteProviderError);
      expect(error.reason).toBe('provider_error');
      expect(error.details).toMatchObject({ status });
    });

    test('no failure ever exposes the API key or the raw provider body', async () => {
      const providerError = Object.assign(new Error('Request failed with status code 403'), {
        response: { status: 403, data: { error: { message: `API key ${API_KEY} not authorized`, status: 'PERMISSION_DENIED' } } },
      });
      const { adapter } = createAdapter({ httpClient: createStubHttpClient({ error: providerError }) });

      const error = await captureError(adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP }));
      const serialized = `${error.message} ${JSON.stringify(error.details || {})} ${error.stack || ''}`;
      expect(serialized).not.toContain(API_KEY);
      expect(serialized).not.toContain('RAW GOOGLE BODY');
      expect(serialized).not.toContain('PERMISSION_DENIED');
      expect(serialized).not.toContain('not authorized');
    });

    test('a malformed response never echoes the offending payload', async () => {
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient({ status: 200, data: { routes: [{ legs: [{ distanceMeters: 'LEAK-ME', duration: '900s' }, leg()] }] } }),
      });
      const error = await captureError(adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP }));
      expect(`${error.message} ${JSON.stringify(error.details || {})}`).not.toContain('LEAK-ME');
    });

    test('every failure carries a stable machine-readable reason and name', async () => {
      const { adapter } = createAdapter({ httpClient: createStubHttpClient({ status: 200, data: { routes: [] } }) });
      const error = await captureError(adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP }));
      expect(error.name).toBe('RouteProviderError');
      expect(error.code).toBe('route_provider_error');
      expect(typeof error.reason).toBe('string');
    });
  });

  describe('configuration failures never reach the network', () => {
    test('a missing API key is configuration_missing and no HTTP call is attempted', async () => {
      const httpClient = createStubHttpClient(twoLegRoute());
      const adapter = createGoogleRoutesAdapter({ apiKey: undefined, httpClient });

      const error = await captureError(adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP }));
      expect(error).toBeInstanceOf(RouteProviderError);
      expect(error.reason).toBe('configuration_missing');
      expect(httpClient.calls).toHaveLength(0);
    });

    test('a blank API key is configuration_missing', async () => {
      const httpClient = createStubHttpClient(twoLegRoute());
      const adapter = createGoogleRoutesAdapter({ apiKey: '   ', httpClient });
      const error = await captureError(adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP }));
      expect(error.reason).toBe('configuration_missing');
      expect(httpClient.calls).toHaveLength(0);
    });

    test('a non-string API key is configuration_invalid', async () => {
      const httpClient = createStubHttpClient(twoLegRoute());
      const adapter = createGoogleRoutesAdapter({ apiKey: 12345, httpClient });
      const error = await captureError(adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP }));
      expect(error.reason).toBe('configuration_invalid');
      expect(httpClient.calls).toHaveLength(0);
    });

    test('the constructor never throws on a missing key, so composition stays safe', () => {
      expect(() => createGoogleRoutesAdapter({ apiKey: undefined })).not.toThrow();
    });

    test('the failure never contains the rejected key value', async () => {
      const httpClient = createStubHttpClient(twoLegRoute());
      const adapter = createGoogleRoutesAdapter({ apiKey: '   ', httpClient });
      const error = await captureError(adapter.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP }));
      expect(error.message).not.toContain('   ');
    });
  });

  describe('defense in depth: the adapter never sends garbage to Google', () => {
    test.each([
      ['origin', { origin: { latitude: 91, longitude: 0 } }],
      ['destination', { destination: { latitude: 0, longitude: 181 } }],
      ['pickup', { pickup: { latitude: Number.NaN, longitude: 0 } }],
    ])('a malformed %s coordinate is a validation error and no HTTP call is attempted', async (_field, bad) => {
      const httpClient = createStubHttpClient(twoLegRoute());
      const adapter = createGoogleRoutesAdapter({ apiKey: API_KEY, httpClient });

      const error = await captureError(adapter.computeRoute({
        origin: PROVIDER, destination: DESTINATION, pickup: PICKUP, ...bad,
      }));
      expect(error).toBeInstanceOf(TowError);
      expect(error.code).toBe('validation_error');
      expect(httpClient.calls).toHaveLength(0);
    });
  });
});
