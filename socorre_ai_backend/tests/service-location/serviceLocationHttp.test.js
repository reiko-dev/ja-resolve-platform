/**
 * SERVICE LOCATION — HTTP proxy end to end (supertest, fake provider).
 *
 * Proves the authenticated, rate-limited proxy boundary and the frozen wire
 * contract. The provider is injected: ZERO real Google requests.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../src/config/database', () => require('../helpers/testDb').db);

const request = require('supertest');
const testDb = require('../helpers/testDb');
const { createApp } = require('../../src/app');
const { createTowCustomerAuth } = require('../helpers/tow/auth');
const { PlacesProviderError } = require('../../src/modules/service-location/adapters/places/places-provider-error');

const AUTOCOMPLETE = '/api/locations/autocomplete';
const detailsPath = (placeId) => `/api/locations/places/${placeId}`;
const TOKEN = '44f7a0c9-1234-4abc-9def-0123456789ab';

describe('SERVICE LOCATION — HTTP proxy', () => {
  let app;
  let auth;
  let places;

  beforeAll(async () => {
    await testDb.reset();
    places = { searchPredictions: jest.fn(), getPlace: jest.fn() };
    app = createApp({
      serviceLocation: { placesProvider: places, rateLimit: false },
    }).listen(0);
    auth = await createTowCustomerAuth();
  });

  afterAll(async () => {
    await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
    await testDb.reset();
  });

  beforeEach(() => {
    places.searchPredictions.mockReset();
    places.getPlace.mockReset();
  });

  describe('authentication', () => {
    test('autocomplete requires a bearer token', async () => {
      const response = await request(app).post(AUTOCOMPLETE).send({ input: 'contax', session_token: TOKEN });
      expect(response.status).toBe(401);
    });

    test('place details requires a bearer token', async () => {
      const response = await request(app).get(detailsPath('ChIJabc'));
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/locations/autocomplete', () => {
    test('returns the frozen wire shape and forwards token + bias', async () => {
      places.searchPredictions.mockResolvedValue({
        predictions: [{
          placeId: 'ChIJabc',
          primaryText: 'Contax',
          secondaryText: 'Estrada Dias Martins, Rio Branco - AC',
        }],
      });

      const bias = { latitude: -9.97, longitude: -67.84, radius_meters: 5000 };
      const response = await request(app)
        .post(AUTOCOMPLETE)
        .set(auth.headers)
        .send({ input: '  contax  ', session_token: TOKEN, location_bias: bias });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          predictions: [{
            place_id: 'ChIJabc',
            primary_text: 'Contax',
            secondary_text: 'Estrada Dias Martins, Rio Branco - AC',
          }],
        },
      });
      expect(places.searchPredictions).toHaveBeenCalledWith({
        input: 'contax',
        sessionToken: TOKEN,
        locationBias: bias,
      });
    });

    test('an empty provider answer is a 200 with an empty list', async () => {
      places.searchPredictions.mockResolvedValue({ predictions: [] });

      const response = await request(app)
        .post(AUTOCOMPLETE)
        .set(auth.headers)
        .send({ input: 'zzzz', session_token: TOKEN });

      expect(response.status).toBe(200);
      expect(response.body.data.predictions).toEqual([]);
    });

    test.each([
      ['unknown body key', { input: 'a', session_token: TOKEN, extra: 1 }],
      ['missing input', { session_token: TOKEN }],
      ['blank input', { input: '   ', session_token: TOKEN }],
      ['missing session token', { input: 'a' }],
      ['short session token', { input: 'a', session_token: 'abc' }],
      ['token with invalid chars', { input: 'a', session_token: '####################################' }],
      ['unknown bias key', { input: 'a', session_token: TOKEN, location_bias: { latitude: 1, longitude: 2, zoom: 3 } }],
      ['bias latitude out of range', { input: 'a', session_token: TOKEN, location_bias: { latitude: 91, longitude: 2 } }],
      ['bias radius out of range', { input: 'a', session_token: TOKEN, location_bias: { latitude: 1, longitude: 2, radius_meters: 50001 } }],
    ])('rejects %s with 422 validation_error and no provider call', async (_label, body) => {
      const response = await request(app).post(AUTOCOMPLETE).set(auth.headers).send(body);

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ success: false, error: { code: 'validation_error' } });
      expect(places.searchPredictions).not.toHaveBeenCalled();
    });

    test.each([
      ['timeout', 'upstream_unavailable', 503],
      ['quota_exceeded', 'upstream_unavailable', 503],
      ['request_denied', 'upstream_rejected', 502],
      ['malformed_response', 'upstream_rejected', 502],
    ])('maps provider %s to %s', async (reason, code, status) => {
      places.searchPredictions.mockRejectedValue(new PlacesProviderError(reason, 'safe'));

      const response = await request(app)
        .post(AUTOCOMPLETE)
        .set(auth.headers)
        .send({ input: 'contax', session_token: TOKEN });

      expect(response.status).toBe(status);
      expect(response.body).toMatchObject({ success: false, error: { code } });
      expect(JSON.stringify(response.body)).not.toContain('safe');
    });
  });

  describe('GET /api/locations/places/:placeId', () => {
    test('returns the explicit place and forwards the session token', async () => {
      places.getPlace.mockResolvedValue({
        placeId: 'ChIJabc',
        placeName: 'Contax',
        formattedAddress: 'Estrada Dias Martins, Rio Branco - AC',
        latitude: -9.974,
        longitude: -67.807,
      });

      const response = await request(app)
        .get(detailsPath('ChIJabc'))
        .query({ session_token: TOKEN })
        .set(auth.headers);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          place_id: 'ChIJabc',
          place_name: 'Contax',
          formatted_address: 'Estrada Dias Martins, Rio Branco - AC',
          latitude: -9.974,
          longitude: -67.807,
        },
      });
      expect(places.getPlace).toHaveBeenCalledWith({ placeId: 'ChIJabc', sessionToken: TOKEN });
    });

    test('an obsolete place is 404 not_found', async () => {
      places.getPlace.mockRejectedValue(new PlacesProviderError('place_not_found', 'safe'));

      const response = await request(app).get(detailsPath('ChIJgone')).set(auth.headers);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, error: { code: 'not_found' } });
    });

    test('an invalid session token in the query is rejected before the provider', async () => {
      const response = await request(app)
        .get(detailsPath('ChIJabc'))
        .query({ session_token: 'nope' })
        .set(auth.headers);

      expect(response.status).toBe(422);
      expect(places.getPlace).not.toHaveBeenCalled();
    });

    test('a provider outage is 503 and blocks the selection', async () => {
      places.getPlace.mockRejectedValue(new PlacesProviderError('network_failure', 'safe'));

      const response = await request(app).get(detailsPath('ChIJabc')).set(auth.headers);

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ success: false, error: { code: 'upstream_unavailable' } });
    });
  });

  describe('provider not configured', () => {
    test('answers a controlled 503 instead of crashing the app', async () => {
      const unconfigured = createApp({
        serviceLocation: { placesProvider: null, rateLimit: false },
      }).listen(0);

      try {
        const response = await request(unconfigured)
          .post(AUTOCOMPLETE)
          .set(auth.headers)
          .send({ input: 'contax', session_token: TOKEN });

        expect(response.status).toBe(503);
        expect(response.body).toMatchObject({ success: false, error: { code: 'upstream_unavailable' } });
      } finally {
        await new Promise((resolve) => { unconfigured.closeAllConnections?.(); unconfigured.close(resolve); });
      }
    });
  });

  describe('per-user rate limit', () => {
    test('the third request with max=2 is 429 rate_limited', async () => {
      places.searchPredictions.mockResolvedValue({ predictions: [] });
      const limited = createApp({
        serviceLocation: { placesProvider: places, rateLimit: { windowMs: 60_000, max: 2 } },
      }).listen(0);

      try {
        const body = { input: 'contax', session_token: TOKEN };
        const first = await request(limited).post(AUTOCOMPLETE).set(auth.headers).send(body);
        const second = await request(limited).post(AUTOCOMPLETE).set(auth.headers).send(body);
        const third = await request(limited).post(AUTOCOMPLETE).set(auth.headers).send(body);

        expect([first.status, second.status]).toEqual([200, 200]);
        expect(third.status).toBe(429);
        expect(third.body).toMatchObject({ success: false, error: { code: 'rate_limited' } });
      } finally {
        await new Promise((resolve) => { limited.closeAllConnections?.(); limited.close(resolve); });
      }
    });
  });
});
