/**
 * SERVICE LOCATION — UNIT suite for the Google Places (New) adapter.
 *
 * The adapter is the only place allowed to know the Places (New) vocabulary.
 * Everything here runs against a stub HTTP client: no network, no key, no
 * `jest.mock('axios')`.
 *
 * Contract pinned here (Places API New, `places.googleapis.com/v1`):
 *   POST {base}/places:autocomplete
 *   GET  {base}/places/{placeId}
 *   suggestions[].placePrediction.{placeId|place, text.text,
 *       structuredFormat.mainText.text, structuredFormat.secondaryText.text}
 *   details: { id, displayName.text, formattedAddress, location.{latitude,longitude} }
 *
 * RED-first: written before `adapters/places/google-places-adapter.js`.
 */
'use strict';

const {
  createGooglePlacesAdapter,
  GOOGLE_PLACES_ENDPOINT_BASE,
  GOOGLE_PLACES_KEY_VAR,
  AUTOCOMPLETE_FIELD_MASK,
  PLACE_DETAILS_FIELD_MASK,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_DELAY_MS,
} = require('../../src/modules/service-location/adapters/places/google-places-adapter');
const {
  PlacesProviderError,
} = require('../../src/modules/service-location/adapters/places/places-provider-error');
const {
  SERVICE_LOCATION_PLACES_VAR,
  SERVICE_LOCATION_PLACES_KINDS,
  resolveServiceLocationPlacesKind,
  assertServiceLocationPlacesSafe,
} = require('../../src/config/serviceLocationPlaces');

const API_KEY = 'test-places-key-do-not-use';
const SESSION_TOKEN = '44f7a0c9-1234-4abc-8def-0123456789ab';
const PLACE_ID = 'ChIJiwvAtfFYVZIR6Z0A9Z1Z1Z1';

/** Deterministic stub HTTP client — records every call and replays an outcome. */
function createStubHttpClient(outcomes = {}) {
  const postCalls = [];
  const getCalls = [];
  const postQueue = Array.isArray(outcomes.post) ? outcomes.post.slice() : null;
  const getQueue = Array.isArray(outcomes.get) ? outcomes.get.slice() : null;

  function next(value) {
    if (value && value.error) throw value.error;
    return value;
  }

  return {
    postCalls,
    getCalls,
    post: jest.fn(async (url, body, config) => {
      postCalls.push({ url, body, config });
      return next(postQueue ? postQueue.shift() : outcomes.post);
    }),
    get: jest.fn(async (url, config) => {
      getCalls.push({ url, config });
      return next(getQueue ? getQueue.shift() : outcomes.get);
    }),
  };
}

function placePrediction(overrides = {}) {
  return {
    placePrediction: {
      placeId: PLACE_ID,
      text: { text: 'Contax, Estrada Dias Martins, Rio Branco - AC' },
      structuredFormat: {
        mainText: { text: 'Contax' },
        secondaryText: { text: 'Estrada Dias Martins, Rio Branco - AC' },
      },
      ...overrides,
    },
  };
}

function autocompleteResponse(suggestions = [placePrediction()]) {
  return { status: 200, data: { suggestions } };
}

function detailsResponse(overrides = {}) {
  return {
    status: 200,
    data: {
      id: PLACE_ID,
      displayName: { text: 'Contax', languageCode: 'pt-BR' },
      formattedAddress: 'Estrada Dias Martins, 123 - Rio Branco, AC',
      location: { latitude: -9.9747, longitude: -67.8076 },
      ...overrides,
    },
  };
}

function createAdapter(overrides = {}) {
  const httpClient = overrides.httpClient || createStubHttpClient({
    post: autocompleteResponse(),
    get: detailsResponse(),
  });
  return {
    adapter: createGooglePlacesAdapter({
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

describe('SERVICE LOCATION UNIT — Google Places (New) adapter', () => {
  describe('request shape', () => {
    test('autocomplete posts to the documented endpoint without the key in the URL', async () => {
      const { adapter, httpClient } = createAdapter();
      await adapter.searchPredictions({ input: '  araujo mix  ' });

      expect(httpClient.postCalls).toHaveLength(1);
      expect(GOOGLE_PLACES_ENDPOINT_BASE).toBe('https://places.googleapis.com/v1');
      expect(httpClient.postCalls[0].url).toBe(`${GOOGLE_PLACES_ENDPOINT_BASE}/places:autocomplete`);
      expect(httpClient.postCalls[0].url).not.toContain(API_KEY);

      const { body, config } = httpClient.postCalls[0];
      expect(body.input).toBe('araujo mix');
      expect(body.languageCode).toBe('pt-BR');
      expect(body.regionCode).toBe('br');
      expect(config.timeout).toBe(DEFAULT_TIMEOUT_MS);
      expect(DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(3000);
      expect(config.headers['Content-Type']).toBe('application/json');
      expect(config.headers['X-Goog-Api-Key']).toBe(API_KEY);
      expect(config.headers['X-Goog-FieldMask']).toBe(AUTOCOMPLETE_FIELD_MASK);
    });

    test('field masks are exact and never request over-scoped paid fields', async () => {
      const { adapter, httpClient } = createAdapter();
      await adapter.searchPredictions({ input: 'contax' });
      await adapter.getPlace({ placeId: PLACE_ID });

      expect(AUTOCOMPLETE_FIELD_MASK).toBe(
        'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,'
          + 'suggestions.placePrediction.structuredFormat.mainText.text,'
          + 'suggestions.placePrediction.structuredFormat.secondaryText.text'
      );
      expect(PLACE_DETAILS_FIELD_MASK).toBe('id,displayName,formattedAddress,location');
      expect(httpClient.postCalls[0].config.headers['X-Goog-FieldMask']).toBe(AUTOCOMPLETE_FIELD_MASK);
      expect(httpClient.getCalls[0].config.headers['X-Goog-FieldMask']).toBe(PLACE_DETAILS_FIELD_MASK);

      for (const mask of [AUTOCOMPLETE_FIELD_MASK, PLACE_DETAILS_FIELD_MASK]) {
        for (const forbidden of [
          'ratings', 'reviews', 'photos', 'phone', 'website', 'openingHours', 'primaryType',
        ]) {
          expect(mask).not.toContain(forbidden);
        }
      }
    });

    test('the default timeout and retry policy stay short', () => {
      expect(DEFAULT_MAX_ATTEMPTS).toBe(2);
      expect(DEFAULT_RETRY_DELAY_MS).toBe(150);
    });
  });

  describe('autocomplete normalization', () => {
    test('normalizes a two-line prediction, ignoring queryPrediction and incomplete entries', async () => {
      const suggestions = [
        { queryPrediction: { text: { text: 'araujo mix' } } },
        placePrediction(),
        { placePrediction: { text: { text: 'sem place id' }, structuredFormat: { mainText: { text: 'sem place id' } } } },
        { placePrediction: { placeId: 'ChIJsemprimario', structuredFormat: { secondaryText: { text: 'x' } } } },
      ];
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient({ post: autocompleteResponse(suggestions) }),
      });

      const result = await adapter.searchPredictions({ input: 'araujo mix' });
      expect(result).toEqual({
        predictions: [{
          placeId: PLACE_ID,
          primaryText: 'Contax',
          secondaryText: 'Estrada Dias Martins, Rio Branco - AC',
        }],
      });
    });

    test('accepts the resource name as placeId and text.text as the primary fallback', async () => {
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient({
          post: autocompleteResponse([
            { placePrediction: { place: 'places/ChIJresource', text: { text: 'Mercado' } } },
          ]),
        }),
      });

      const result = await adapter.searchPredictions({ input: 'mercado' });
      expect(result.predictions).toEqual([
        { placeId: 'ChIJresource', primaryText: 'Mercado', secondaryText: null },
      ]);
    });

    test('empty and missing suggestions are an empty result, never an error', async () => {
      const empty = createAdapter({
        httpClient: createStubHttpClient({ post: { status: 200, data: { suggestions: [] } } }),
      });
      const missing = createAdapter({
        httpClient: createStubHttpClient({ post: { status: 200, data: {} } }),
      });

      expect((await empty.adapter.searchPredictions({ input: 'x' })).predictions).toEqual([]);
      expect((await missing.adapter.searchPredictions({ input: 'x' })).predictions).toEqual([]);
    });

    test('a non-array suggestions payload is malformed_response', async () => {
      const { adapter, httpClient } = createAdapter({
        httpClient: createStubHttpClient({ post: { status: 200, data: { suggestions: {} } } }),
      });

      const error = await captureError(adapter.searchPredictions({ input: 'x' }));
      expect(error).toBeInstanceOf(PlacesProviderError);
      expect(error.reason).toBe('malformed_response');
      expect(httpClient.postCalls).toHaveLength(1);
    });

    test('sessionToken is forwarded in the body and omitted when absent', async () => {
      const { adapter, httpClient } = createAdapter();
      await adapter.searchPredictions({ input: 'x', sessionToken: SESSION_TOKEN });
      expect(httpClient.postCalls[0].body.sessionToken).toBe(SESSION_TOKEN);

      await adapter.searchPredictions({ input: 'x' });
      expect(httpClient.postCalls[1].body).not.toHaveProperty('sessionToken');
    });

    test('invalid sessionToken is invalid_request without any HTTP call', async () => {
      const { adapter, httpClient } = createAdapter();
      for (const token of ['', 'a'.repeat(37), 'not url safe!', 123, 'token.with.dots']) {
        const error = await captureError(adapter.searchPredictions({ input: 'x', sessionToken: token }));
        expect(error.reason).toBe('invalid_request');
      }
      expect(httpClient.postCalls).toHaveLength(0);
    });

    test('locationBias is forwarded as a circle with the default radius', async () => {
      const { adapter, httpClient } = createAdapter();
      await adapter.searchPredictions({
        input: 'x',
        locationBias: { latitude: -9.97, longitude: -67.84 },
      });

      expect(httpClient.postCalls[0].body.locationBias).toEqual({
        circle: { center: { latitude: -9.97, longitude: -67.84 }, radius: 50000 },
      });
    });

    test('locationBias honours a custom radius', async () => {
      const { adapter, httpClient } = createAdapter();
      await adapter.searchPredictions({
        input: 'x',
        locationBias: { latitude: -9.97, longitude: -67.84, radius_meters: 1500 },
      });

      expect(httpClient.postCalls[0].body.locationBias.circle.radius).toBe(1500);
    });

    test('an omitted locationBias is not sent to the provider', async () => {
      const { adapter, httpClient } = createAdapter();
      await adapter.searchPredictions({ input: 'x' });
      expect(httpClient.postCalls[0].body).not.toHaveProperty('locationBias');
    });

    test('an invalid locationBias is invalid_request without any HTTP call', async () => {
      const { adapter, httpClient } = createAdapter();
      for (const bias of [
        { latitude: 91, longitude: 0 },
        { latitude: -9.97, longitude: -181 },
        { latitude: 'x', longitude: 0 },
        { latitude: -9.97 },
        [1, 2],
        { latitude: -9.97, longitude: -67.84, radius_meters: 0 },
        { latitude: -9.97, longitude: -67.84, radius_meters: 50001 },
        { latitude: -9.97, longitude: -67.84, radius_meters: 1.5 },
      ]) {
        const error = await captureError(adapter.searchPredictions({ input: 'x', locationBias: bias }));
        expect(error.reason).toBe('invalid_request');
      }
      expect(httpClient.postCalls).toHaveLength(0);
    });

    test('invalid input is invalid_request without any HTTP call', async () => {
      const { adapter, httpClient } = createAdapter();
      for (const input of [undefined, null, 42, '', '   ', 'x'.repeat(201)]) {
        const error = await captureError(adapter.searchPredictions({ input }));
        expect(error.reason).toBe('invalid_request');
      }
      expect(httpClient.postCalls).toHaveLength(0);
    });
  });

  describe('place details', () => {
    test('normalizes the details payload and sends the exact query params', async () => {
      const { adapter, httpClient } = createAdapter();
      const place = await adapter.getPlace({ placeId: PLACE_ID });

      expect(place).toEqual({
        placeId: PLACE_ID,
        placeName: 'Contax',
        formattedAddress: 'Estrada Dias Martins, 123 - Rio Branco, AC',
        latitude: -9.9747,
        longitude: -67.8076,
      });
      expect(httpClient.getCalls).toHaveLength(1);
      expect(httpClient.getCalls[0].url).toBe(`${GOOGLE_PLACES_ENDPOINT_BASE}/places/${PLACE_ID}`);
      expect(httpClient.getCalls[0].url).not.toContain(API_KEY);
      expect(httpClient.getCalls[0].config.params).toEqual({ languageCode: 'pt-BR', regionCode: 'br' });
      expect(httpClient.getCalls[0].config.timeout).toBe(DEFAULT_TIMEOUT_MS);
      expect(httpClient.getCalls[0].config.headers['X-Goog-Api-Key']).toBe(API_KEY);
    });

    test('getPlace forwards sessionToken as a query param and omits it otherwise', async () => {
      const { adapter, httpClient } = createAdapter();
      await adapter.getPlace({ placeId: PLACE_ID, sessionToken: SESSION_TOKEN });
      expect(httpClient.getCalls[0].config.params.sessionToken).toBe(SESSION_TOKEN);

      await adapter.getPlace({ placeId: PLACE_ID });
      expect(httpClient.getCalls[1].config.params).not.toHaveProperty('sessionToken');
    });

    test('a missing provider id or optional fields degrade to safe nulls', async () => {
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient({
          get: {
            status: 200,
            data: { location: { latitude: 1, longitude: 2 } },
          },
        }),
      });

      expect(await adapter.getPlace({ placeId: 'ChIJrequested' })).toEqual({
        placeId: 'ChIJrequested',
        placeName: null,
        formattedAddress: null,
        latitude: 1,
        longitude: 2,
      });
    });

    test('strips a leading places/ from the requested placeId', async () => {
      const { adapter, httpClient } = createAdapter();
      const place = await adapter.getPlace({ placeId: `places/${PLACE_ID}` });

      expect(httpClient.getCalls[0].url).toBe(`${GOOGLE_PLACES_ENDPOINT_BASE}/places/${PLACE_ID}`);
      expect(httpClient.getCalls[0].url).not.toContain('places/places/');
      expect(place.placeId).toBe(PLACE_ID);
    });

    test('invalid placeId is invalid_request without any HTTP call', async () => {
      const { adapter, httpClient } = createAdapter();
      for (const placeId of [undefined, null, '', '   ', 'places/', 'x'.repeat(501), 42]) {
        const error = await captureError(adapter.getPlace({ placeId }));
        expect(error.reason).toBe('invalid_request');
      }
      expect(httpClient.getCalls).toHaveLength(0);
    });

    test('details without a finite in-range location are malformed_response', async () => {
      for (const location of [
        undefined,
        null,
        {},
        { latitude: 'x', longitude: 'y' },
        { latitude: 91, longitude: 0 },
        { latitude: -9.97 },
        // The (0,0) sentinel is a PROVIDER defect, never a client validation
        // error: an explicit selection cannot be finalized there.
        { latitude: 0, longitude: 0 },
      ]) {
        const { adapter, httpClient } = createAdapter({
          httpClient: createStubHttpClient({
            get: {
              status: 200,
              data: { id: PLACE_ID, displayName: { text: 'X' }, location },
            },
          }),
        });

        const error = await captureError(adapter.getPlace({ placeId: PLACE_ID }));
        expect(error.reason).toBe('malformed_response');
        expect(httpClient.getCalls).toHaveLength(1);
      }
    });

    test('oversized provider text is truncated to the presentation ceiling, never fatal', async () => {
      const longName = 'N'.repeat(900);
      const longAddress = 'A'.repeat(900);
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient({
          get: {
            status: 200,
            data: {
              id: PLACE_ID,
              displayName: { text: longName },
              formattedAddress: longAddress,
              location: { latitude: -9.97, longitude: -67.8 },
            },
          },
        }),
      });

      const place = await adapter.getPlace({ placeId: PLACE_ID });
      expect(place.placeName).toHaveLength(500);
      expect(place.formattedAddress).toHaveLength(500);
    });

    test('getPlace forwards an explicit languageCode and rejects an invalid one', async () => {
      const { adapter, httpClient } = createAdapter();
      await adapter.getPlace({ placeId: PLACE_ID, languageCode: 'en' });
      expect(httpClient.getCalls[0].config.params.languageCode).toBe('en');

      // An empty value is "absent", exactly like the session token.
      await adapter.getPlace({ placeId: PLACE_ID, languageCode: '' });
      expect(httpClient.getCalls[1].config.params.languageCode).toBe('pt-BR');

      for (const languageCode of [42, 'x', 'x'.repeat(36)]) {
        const error = await captureError(adapter.getPlace({ placeId: PLACE_ID, languageCode }));
        expect(error.reason).toBe('invalid_request');
      }
      expect(httpClient.getCalls).toHaveLength(2);
    });
  });

  describe('provider statuses', () => {
    test.each([
      [400, 'invalid_provider_request'],
      [401, 'request_denied'],
      [403, 'request_denied'],
      [404, 'place_not_found'],
      [429, 'quota_exceeded'],
      [500, 'provider_error'],
    ])('HTTP %i is classified as %s', async (status, reason) => {
      const failure = Object.assign(new Error(`Request failed with status code ${status}`), {
        response: { status, data: { error: { message: `key ${API_KEY}` } } },
      });
      const { adapter, httpClient } = createAdapter({
        httpClient: createStubHttpClient({ post: { error: failure } }),
      });

      const error = await captureError(adapter.searchPredictions({ input: 'x' }));
      expect(error).toBeInstanceOf(PlacesProviderError);
      expect(error.code).toBe('places_provider_error');
      expect(error.reason).toBe(reason);
      expect(error.details).toEqual({ status });
      expect(httpClient.postCalls).toHaveLength(reason === 'provider_error' ? 2 : 1);
    });

    test('an HTTP 403 is a non-retryable request_denied', async () => {
      const denied = Object.assign(new Error('Request failed with status code 403'), {
        response: { status: 403 },
      });
      const { adapter, httpClient } = createAdapter({
        httpClient: createStubHttpClient({ post: { error: denied } }),
      });

      const error = await captureError(adapter.searchPredictions({ input: 'x' }));
      expect(error.reason).toBe('request_denied');
      expect(httpClient.postCalls).toHaveLength(1);
    });

    test('a 404 on details is place_not_found and never retried', async () => {
      const notFound = Object.assign(new Error('Request failed with status code 404'), {
        response: { status: 404 },
      });
      const { adapter, httpClient } = createAdapter({
        httpClient: createStubHttpClient({ get: { error: notFound } }),
      });

      const error = await captureError(adapter.getPlace({ placeId: PLACE_ID }));
      expect(error.reason).toBe('place_not_found');
      expect(httpClient.getCalls).toHaveLength(1);
    });
  });

  describe('transport failures and retry policy', () => {
    test('a timeout is retried once and then succeeds', async () => {
      const timeout = Object.assign(new Error('timeout of 2500ms exceeded'), { code: 'ECONNABORTED' });
      const { adapter, httpClient } = createAdapter({
        httpClient: createStubHttpClient({ post: [{ error: timeout }, autocompleteResponse()] }),
      });

      const result = await adapter.searchPredictions({ input: 'x' });
      expect(result.predictions).toHaveLength(1);
      expect(httpClient.postCalls).toHaveLength(2);
    });

    test('an exhausted timeout surfaces as timeout after maxAttempts', async () => {
      const timeout = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
      const { adapter, httpClient } = createAdapter({
        httpClient: createStubHttpClient({ post: { error: timeout } }),
      });

      const error = await captureError(adapter.searchPredictions({ input: 'x' }));
      expect(error.reason).toBe('timeout');
      expect(httpClient.postCalls).toHaveLength(2);
    });

    test('a network failure is retried once', async () => {
      const network = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
      const { adapter, httpClient } = createAdapter({
        httpClient: createStubHttpClient({ post: { error: network } }),
      });

      const error = await captureError(adapter.searchPredictions({ input: 'x' }));
      expect(error.reason).toBe('network_failure');
      expect(httpClient.postCalls).toHaveLength(2);
    });

    test('rejects an invalid retry budget at construction', () => {
      expect(() => createGooglePlacesAdapter({ maxAttempts: 0 })).toThrow(TypeError);
      expect(() => createGooglePlacesAdapter({ maxAttempts: 3 })).toThrow(TypeError);
      expect(() => createGooglePlacesAdapter({ timeoutMs: 0 })).toThrow(TypeError);
      expect(() => createGooglePlacesAdapter({ retryDelayMs: -1 })).toThrow(TypeError);
    });
  });

  describe('key hygiene and safe errors', () => {
    test('a missing dedicated key is configuration_missing and never calls the provider', async () => {
      const original = process.env[GOOGLE_PLACES_KEY_VAR];
      delete process.env[GOOGLE_PLACES_KEY_VAR];
      try {
        const httpClient = createStubHttpClient({ post: autocompleteResponse() });
        const adapter = createGooglePlacesAdapter({ httpClient, retryDelayMs: 0 });

        const error = await captureError(adapter.searchPredictions({ input: 'x' }));
        expect(error.reason).toBe('configuration_missing');
        expect(httpClient.postCalls).toHaveLength(0);
      } finally {
        if (original === undefined) delete process.env[GOOGLE_PLACES_KEY_VAR];
        else process.env[GOOGLE_PLACES_KEY_VAR] = original;
      }
    });

    test('the adapter never falls back to the Maps, Routes or Geocoding key', async () => {
      const original = process.env[GOOGLE_PLACES_KEY_VAR];
      const injected = {
        GOOGLE_MAPS_API_KEY: 'browser-key',
        GOOGLE_ROUTES_API_KEY: 'routes-key',
        GOOGLE_GEOCODING_API_KEY: 'geocoding-key',
      };
      const previous = {};
      for (const [key, value] of Object.entries(injected)) {
        previous[key] = process.env[key];
        process.env[key] = value;
      }
      delete process.env[GOOGLE_PLACES_KEY_VAR];
      try {
        const httpClient = createStubHttpClient({ post: autocompleteResponse() });
        const adapter = createGooglePlacesAdapter({ httpClient, retryDelayMs: 0 });

        const error = await captureError(adapter.searchPredictions({ input: 'x' }));
        expect(error.reason).toBe('configuration_missing');
        expect(httpClient.postCalls).toHaveLength(0);
      } finally {
        if (original === undefined) delete process.env[GOOGLE_PLACES_KEY_VAR];
        else process.env[GOOGLE_PLACES_KEY_VAR] = original;
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });

    test('no failure ever exposes the API key, the session token or the provider payload', async () => {
      const denied = Object.assign(new Error('Request failed with status code 403'), {
        response: {
          status: 403,
          data: { error: { message: `key ${API_KEY} token ${SESSION_TOKEN}`, status: 'PERMISSION_DENIED' } },
        },
      });
      const { adapter } = createAdapter({
        httpClient: createStubHttpClient({ post: { error: denied } }),
      });

      const error = await captureError(
        adapter.searchPredictions({ input: 'x', sessionToken: SESSION_TOKEN })
      );
      const serialized = `${error.message} ${JSON.stringify(error.details || {})} ${error.stack || ''}`;
      expect(serialized).not.toContain(API_KEY);
      expect(serialized).not.toContain(SESSION_TOKEN);
      expect(serialized).not.toContain('PERMISSION_DENIED');
    });
  });

  describe('configuration (SERVICE_LOCATION_PLACES)', () => {
    test('the vocabulary is frozen and the default is none', () => {
      expect(SERVICE_LOCATION_PLACES_VAR).toBe('SERVICE_LOCATION_PLACES');
      expect(SERVICE_LOCATION_PLACES_KINDS).toEqual(['none', 'google']);
      expect(resolveServiceLocationPlacesKind({})).toBe('none');
      expect(resolveServiceLocationPlacesKind({ [SERVICE_LOCATION_PLACES_VAR]: '' })).toBe('none');
      expect(resolveServiceLocationPlacesKind({ [SERVICE_LOCATION_PLACES_VAR]: '   ' })).toBe('none');
      expect(resolveServiceLocationPlacesKind({ [SERVICE_LOCATION_PLACES_VAR]: 'google' })).toBe('google');
    });

    test('an unknown kind throws SERVICE_LOCATION_PLACES_INVALID', () => {
      let error = null;
      try {
        resolveServiceLocationPlacesKind({ [SERVICE_LOCATION_PLACES_VAR]: 'fixture' });
      } catch (caught) {
        error = caught;
      }
      expect(error).not.toBeNull();
      expect(error.code).toBe('SERVICE_LOCATION_PLACES_INVALID');
    });

    test('google without its dedicated key is a fail-fast configuration error', () => {
      let error = null;
      try {
        assertServiceLocationPlacesSafe({ [SERVICE_LOCATION_PLACES_VAR]: 'google' });
      } catch (caught) {
        error = caught;
      }
      expect(error).not.toBeNull();
      expect(error.code).toBe('SERVICE_LOCATION_PLACES_KEY_MISSING');
    });

    test('google never falls back to the Maps, Routes or Geocoding key', () => {
      for (const env of [
        { [SERVICE_LOCATION_PLACES_VAR]: 'google', GOOGLE_MAPS_API_KEY: 'browser' },
        { [SERVICE_LOCATION_PLACES_VAR]: 'google', GOOGLE_ROUTES_API_KEY: 'routes' },
        { [SERVICE_LOCATION_PLACES_VAR]: 'google', GOOGLE_GEOCODING_API_KEY: 'geocoding' },
      ]) {
        expect(() => assertServiceLocationPlacesSafe(env)).toThrow(/GOOGLE_PLACES_API_KEY/);
      }
    });

    test('google with the dedicated key is accepted; none never demands a key', () => {
      expect(assertServiceLocationPlacesSafe({
        [SERVICE_LOCATION_PLACES_VAR]: 'google',
        GOOGLE_PLACES_API_KEY: 'dedicated-key',
      })).toBe('google');
      expect(assertServiceLocationPlacesSafe({ [SERVICE_LOCATION_PLACES_VAR]: 'none' })).toBe('none');
    });
  });
});
