/**
 * TOW ROUND — UNIT suite for the Google Geocoding adapter.
 *
 * The adapter is the only place allowed to know the Geocoding API. Everything
 * here runs against a stub HTTP client: no network, no key, no
 * `jest.mock('axios')`.
 *
 * Verified contract (Rio Branco probes, 2026-09-23):
 *   GET https://maps.googleapis.com/maps/api/geocode/json
 *       ?latlng=<lat>,<lng>&language=pt-BR&region=br&key=<server-side key>
 *   response.status: OK | ZERO_RESULTS | OVER_QUERY_LIMIT | REQUEST_DENIED |
 *                    INVALID_REQUEST | UNKNOWN_ERROR
 *   address_components[].types: street_number, route, sublocality,
 *       sublocality_level_1, neighborhood, administrative_area_level_2,
 *       locality, administrative_area_level_1, postal_code, country
 *
 * RED-first: written before `adapters/address/google-geocoding-adapter.js`.
 */
'use strict';

const {
  createGoogleGeocodingAdapter,
  GOOGLE_GEOCODING_ENDPOINT,
  GOOGLE_GEOCODING_KEY_VAR,
  DEFAULT_TIMEOUT_MS,
} = require('../../../src/modules/tow/adapters/address/google-geocoding-adapter');
const {
  AddressResolverError,
} = require('../../../src/modules/tow/adapters/address/address-resolver-error');

const API_KEY = 'test-geocoding-key-do-not-use';
const POINT = Object.freeze({ latitude: -9.9747, longitude: -67.8076 });

function component(longName, shortName, types) {
  return { long_name: longName, short_name: shortName, types };
}

/** The exact Rio Branco shape observed in the probes. */
function rioBrancoResult(overrides = {}) {
  return {
    formatted_address: 'R. Benjamin Constant, 856 - Centro, Rio Branco - AC, 69900-062, Brasil',
    address_components: [
      component('856', '856', ['street_number']),
      component('Rua Benjamin Constant', 'R. Benjamin Constant', ['route']),
      component('Centro', 'Centro', ['sublocality', 'sublocality_level_1', 'political']),
      component('Rio Branco', 'Rio Branco', ['administrative_area_level_2', 'political']),
      component('Acre', 'AC', ['administrative_area_level_1', 'political']),
      component('69900-062', '69900-062', ['postal_code']),
      component('Brasil', 'BR', ['country', 'political']),
    ],
    geometry: { location_type: 'ROOFTOP' },
    partial_match: false,
    ...overrides,
  };
}

function okResponse(results = [rioBrancoResult()]) {
  return { status: 200, data: { status: 'OK', results } };
}

function statusResponse(status) {
  return { status: 200, data: { status, results: [] } };
}

/** Deterministic stub HTTP client — records every call and replays an outcome. */
function createStubHttpClient(outcome) {
  const calls = [];
  const queue = Array.isArray(outcome) ? outcome.slice() : null;
  return {
    calls,
    get: async (url, config) => {
      calls.push({ url, config });
      const next = queue ? queue.shift() : outcome;
      if (next && next.error) throw next.error;
      return next;
    },
  };
}

function createAdapter(overrides = {}) {
  const httpClient = overrides.httpClient || createStubHttpClient(okResponse());
  return {
    adapter: createGoogleGeocodingAdapter({
      apiKey: API_KEY,
      httpClient,
      retryDelayMs: 0,
      ...overrides,
      httpClient,
    }),
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

describe('TOW ROUND UNIT — Google Geocoding adapter', () => {
  describe('request shape', () => {
    test('calls the documented Geocoding endpoint with latlng/language/region/key', async () => {
      const { adapter, httpClient } = createAdapter();
      await adapter.resolve(POINT);

      expect(httpClient.calls).toHaveLength(1);
      expect(httpClient.calls[0].url).toBe(GOOGLE_GEOCODING_ENDPOINT);
      expect(GOOGLE_GEOCODING_ENDPOINT).toBe('https://maps.googleapis.com/maps/api/geocode/json');
      expect(httpClient.calls[0].config.params).toEqual({
        latlng: `${POINT.latitude},${POINT.longitude}`,
        language: 'pt-BR',
        region: 'br',
        key: API_KEY,
      });
      expect(httpClient.calls[0].config.timeout).toBe(DEFAULT_TIMEOUT_MS);
      expect(DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(3000);
    });
  });

  describe('extraction (provider vocabulary -> canonical candidate)', () => {
    test('maps the Rio Branco shape: route/street_number/sublocality_level_1/AA2/AA1', async () => {
      const { adapter } = createAdapter();
      const candidate = await adapter.resolve(POINT);

      expect(candidate).toEqual({
        street: 'Rua Benjamin Constant',
        number: '856',
        neighborhood: 'Centro',
        city: 'Rio Branco',
        state: 'Acre',
        state_code: 'AC',
        postal_code: '69900-062',
        country: 'Brasil',
        location_type: 'ROOFTOP',
        partial_match: false,
      });
    });

    test('a missing street_number is preserved as null (S/N is a domain decision)', async () => {
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient(okResponse([rioBrancoResult({
          address_components: rioBrancoResult().address_components
            .filter((entry) => !entry.types.includes('street_number')),
        })])),
      });

      const candidate = await adapter.resolve(POINT);
      expect(candidate.number).toBeNull();
      expect(candidate.street).toBe('Rua Benjamin Constant');
    });

    test('prefers the generic neighborhood type when present', async () => {
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient(okResponse([rioBrancoResult({
          address_components: [
            component('Williamsburg', 'Williamsburg', ['neighborhood', 'political']),
            component('Brooklyn', 'Brooklyn', ['sublocality_level_1', 'political']),
          ],
        })])),
      });

      const candidate = await adapter.resolve(POINT);
      expect(candidate.neighborhood).toBe('Williamsburg');
    });

    test('falls back to sublocality when only that type is present', async () => {
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient(okResponse([rioBrancoResult({
          address_components: [component('Centro', 'Centro', ['sublocality', 'political'])],
        })])),
      });

      const candidate = await adapter.resolve(POINT);
      expect(candidate.neighborhood).toBe('Centro');
    });

    test('falls back to locality when administrative_area_level_2 is absent', async () => {
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient(okResponse([rioBrancoResult({
          address_components: [
            component('Rio Branco', 'Rio Branco', ['locality', 'political']),
            component('Acre', 'AC', ['administrative_area_level_1', 'political']),
          ],
        })])),
      });

      const candidate = await adapter.resolve(POINT);
      expect(candidate.city).toBe('Rio Branco');
      expect(candidate.state_code).toBe('AC');
    });

    test('carries the confidence signals verbatim', async () => {
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient(okResponse([rioBrancoResult({
          geometry: { location_type: 'GEOMETRIC_CENTER' },
          partial_match: true,
        })])),
      });

      const candidate = await adapter.resolve(POINT);
      expect(candidate.location_type).toBe('GEOMETRIC_CENTER');
      expect(candidate.partial_match).toBe(true);
    });
  });

  describe('provider statuses', () => {
    test('ZERO_RESULTS is NO_ADDRESS (null), never an error', async () => {
      const { adapter } = createAdapter({ httpClient: createStubHttpClient(statusResponse('ZERO_RESULTS')) });
      expect(await adapter.resolve(POINT)).toBeNull();
    });

    test('OK with an empty results array is NO_ADDRESS', async () => {
      const { adapter } = createAdapter({ httpClient: createStubHttpClient(okResponse([])) });
      expect(await adapter.resolve(POINT)).toBeNull();
    });

    test.each([
      ['REQUEST_DENIED', 'request_denied'],
      ['INVALID_REQUEST', 'invalid_provider_request'],
      ['OVER_QUERY_LIMIT', 'quota_exceeded'],
    ])('%s is a non-retryable %s', async (status, reason) => {
      const { adapter, httpClient } = createAdapter({ httpClient: createStubHttpClient(statusResponse(status)) });

      const error = await captureError(adapter.resolve(POINT));
      expect(error).toBeInstanceOf(AddressResolverError);
      expect(error.reason).toBe(reason);
      expect(httpClient.calls).toHaveLength(1);
    });

    test('UNKNOWN_ERROR is retried once and then surfaces', async () => {
      const { adapter, httpClient } = createAdapter({
        httpClient: createStubHttpClient(statusResponse('UNKNOWN_ERROR')),
      });

      const error = await captureError(adapter.resolve(POINT));
      expect(error.reason).toBe('unknown_provider_error');
      expect(httpClient.calls).toHaveLength(2);
    });

    test('a malformed payload (no status) is a non-retryable malformed_response', async () => {
      const { adapter, httpClient } = createAdapter({
        httpClient: createStubHttpClient({ status: 200, data: { results: [] } }),
      });

      const error = await captureError(adapter.resolve(POINT));
      expect(error.reason).toBe('malformed_response');
      expect(httpClient.calls).toHaveLength(1);
    });

    test('an unknown provider status is a malformed_response', async () => {
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient(statusResponse('SOMETHING_NEW')),
      });

      const error = await captureError(adapter.resolve(POINT));
      expect(error.reason).toBe('malformed_response');
    });
  });

  describe('transport failures and retry policy', () => {
    test('a timeout is retried once and then surfaces as timeout', async () => {
      const timeout = Object.assign(new Error('timeout of 2000ms exceeded'), { code: 'ECONNABORTED' });
      const { adapter, httpClient } = createAdapter({ httpClient: createStubHttpClient({ error: timeout }) });

      const error = await captureError(adapter.resolve(POINT));
      expect(error.reason).toBe('timeout');
      expect(httpClient.calls).toHaveLength(2);
    });

    test('a network failure is retried once', async () => {
      const network = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
      const { adapter, httpClient } = createAdapter({ httpClient: createStubHttpClient({ error: network }) });

      const error = await captureError(adapter.resolve(POINT));
      expect(error.reason).toBe('network_failure');
      expect(httpClient.calls).toHaveLength(2);
    });

    test('a transient failure followed by success recovers within the retry budget', async () => {
      const timeout = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
      const { adapter, httpClient } = createAdapter({
        httpClient: createStubHttpClient([{ error: timeout }, okResponse()]),
      });

      const candidate = await adapter.resolve(POINT);
      expect(candidate.street).toBe('Rua Benjamin Constant');
      expect(httpClient.calls).toHaveLength(2);
    });

    test('an HTTP 5xx is retried once and classified as provider_error', async () => {
      const serverError = Object.assign(new Error('Request failed with status code 503'), {
        response: { status: 503 },
      });
      const { adapter, httpClient } = createAdapter({ httpClient: createStubHttpClient({ error: serverError }) });

      const error = await captureError(adapter.resolve(POINT));
      expect(error.reason).toBe('provider_error');
      expect(httpClient.calls).toHaveLength(2);
    });

    test('an HTTP 403 is a non-retryable request_denied', async () => {
      const denied = Object.assign(new Error('Request failed with status code 403'), {
        response: { status: 403 },
      });
      const { adapter, httpClient } = createAdapter({ httpClient: createStubHttpClient({ error: denied }) });

      const error = await captureError(adapter.resolve(POINT));
      expect(error.reason).toBe('request_denied');
      expect(httpClient.calls).toHaveLength(1);
    });
  });

  describe('configuration and input validation', () => {
    test('a missing dedicated key is configuration_missing and never calls the provider', async () => {
      const original = process.env[GOOGLE_GEOCODING_KEY_VAR];
      delete process.env[GOOGLE_GEOCODING_KEY_VAR];
      try {
        const httpClient = createStubHttpClient(okResponse());
        const adapter = createGoogleGeocodingAdapter({ httpClient, retryDelayMs: 0 });

        const error = await captureError(adapter.resolve(POINT));
        expect(error.reason).toBe('configuration_missing');
        expect(httpClient.calls).toHaveLength(0);
      } finally {
        if (original === undefined) delete process.env[GOOGLE_GEOCODING_KEY_VAR];
        else process.env[GOOGLE_GEOCODING_KEY_VAR] = original;
      }
    });

    test('invalid coordinates are invalid_request and never call the provider', async () => {
      const { adapter, httpClient } = createAdapter();

      for (const point of [
        { latitude: 91, longitude: 0 },
        { latitude: 0, longitude: -181 },
        { latitude: 'a', longitude: 0 },
        {},
      ]) {
        const error = await captureError(adapter.resolve(point));
        expect(error.reason).toBe('invalid_request');
      }
      expect(httpClient.calls).toHaveLength(0);
    });

    test('no failure ever exposes the API key', async () => {
      const denied = Object.assign(new Error('Request failed with status code 403'), {
        response: { status: 403, data: { error_message: `key ${API_KEY} not authorized` } },
      });
      const { adapter } = createAdapter({ httpClient: createStubHttpClient({ error: denied }) });

      const error = await captureError(adapter.resolve(POINT));
      const serialized = `${error.message} ${JSON.stringify(error.details || {})} ${error.stack || ''}`;
      expect(serialized).not.toContain(API_KEY);
      expect(serialized).not.toContain('not authorized');
    });
  });
});
