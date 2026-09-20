/**
 * MVP-02 — Google Routes API v2 adapter (the only HTTP-aware file in the module).
 *
 * Verified contract — see `docs/evidence/mvp-02/02-google-routes-contract.md`:
 *
 *   POST https://routes.googleapis.com/directions/v2:computeRoutes
 *   Content-Type: application/json
 *   X-Goog-Api-Key: <server-side key>        (never the browser Maps key)
 *   X-Goog-FieldMask: routes.legs.distanceMeters,routes.legs.duration,routes.polyline.encodedPolyline
 *
 * The pickup is sent as a single non-`via` intermediate waypoint, so ONE request
 * returns both leg boundaries from Google itself — `legs[0]` is provider -> pickup
 * and `legs[1]` is pickup -> destination — plus one continuous encoded polyline
 * for the whole trip. A `via: true` waypoint would collapse the route into a
 * single leg, so it is never set.
 *
 * The adapter never estimates anything: an unexpected leg count is a hard
 * `malformed_response`, not something to be split by ratio or replaced by a
 * straight-line distance.
 */
'use strict';

const axios = require('axios');
const { validateGeoPoint } = require('../../domain');
const { RouteProviderError } = require('./route-provider-error');

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const FIELD_MASK = 'routes.legs.distanceMeters,routes.legs.duration,routes.polyline.encodedPolyline';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function invalidConfiguration(message) {
  return new RouteProviderError('configuration_invalid', message);
}

function malformed(field) {
  return new RouteProviderError('malformed_response', 'Route provider returned an unusable response', { field });
}

function waypoint(point) {
  return { location: { latLng: { latitude: point.latitude, longitude: point.longitude } } };
}

function parseDistanceMeters(value, field) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw malformed(`${field}.distance_meters`);
  }
  return value;
}

/**
 * Google returns `duration` as a protobuf Duration string with up to nine
 * fractional digits ("165s", "900.5s", "900.123456789s"). Seconds are converted
 * exactly from the decimal digits and rounded half-up; no float ever touches the
 * value. More than nine fractional digits is outside the protobuf Duration
 * contract and is a `malformed_response`, never silently truncated or rounded.
 */
const SECONDS_DECIMAL_PATTERN = /^(\d+)(?:\.(\d{1,9}))?$/;
const SECONDS_STRING_PATTERN = /^(\d+)(?:\.(\d{1,9}))?s$/;

function parseDurationSeconds(value, field) {
  let text;

  if (typeof value === 'string') {
    const match = SECONDS_STRING_PATTERN.exec(value);
    if (!match) throw malformed(`${field}.duration_seconds`);
    text = match[2] === undefined ? match[1] : `${match[1]}.${match[2]}`;
  } else if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && !/[eE]/.test(String(value))) {
    text = String(value);
  } else {
    throw malformed(`${field}.duration_seconds`);
  }

  const [, wholePart, fractionPart = ''] = SECONDS_DECIMAL_PATTERN.exec(text) || [];
  if (wholePart === undefined) throw malformed(`${field}.duration_seconds`);

  const whole = BigInt(wholePart);
  const rounded = fractionPart.length > 0 && fractionPart[0] >= '5' ? whole + 1n : whole;
  if (rounded > MAX_SAFE_BIGINT) throw malformed(`${field}.duration_seconds`);

  return Number(rounded);
}

function parseLeg(raw, field) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw malformed(field);
  }
  return Object.freeze({
    distance_meters: parseDistanceMeters(raw.distanceMeters, field),
    duration_seconds: parseDurationSeconds(raw.duration, field),
  });
}

/**
 * Optional geometry: a missing or unusable polyline yields `null` rather than
 * failing the quote. The polyline is decoration for the map; the authoritative
 * distance lives in the legs.
 */
function parsePolyline(route) {
  const polyline = route.polyline;
  if (!polyline || typeof polyline !== 'object') return null;
  return typeof polyline.encodedPolyline === 'string' ? polyline.encodedPolyline : null;
}

function mapTransportError(error) {
  if (error && error.response) {
    const status = error.response.status;
    return new RouteProviderError('provider_error', 'Route provider rejected the request', {
      status: Number.isInteger(status) ? status : undefined,
    });
  }
  const code = error && error.code;
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ERR_CANCELED') {
    return new RouteProviderError('timeout', 'Route provider did not answer in time');
  }
  return new RouteProviderError('network_failure', 'Route provider could not be reached');
}

/**
 * @param {object} [options]
 * @param {string} [options.apiKey] defaults to `process.env.GOOGLE_ROUTES_API_KEY`
 * @param {{ post: Function }} [options.httpClient] injectable for tests
 * @param {string} [options.endpoint]
 * @param {number} [options.timeoutMs]
 */
function createGoogleRoutesAdapter(options = {}) {
  const httpClient = options.httpClient || axios;
  const endpoint = options.endpoint || ENDPOINT;
  const timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;

  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw invalidConfiguration('timeoutMs must be a positive integer');
  }

  // The key is resolved per call and never captured at construction, so a
  // missing secret degrades one operation instead of breaking module startup.
  function resolveApiKey() {
    const apiKey = options.apiKey !== undefined ? options.apiKey : process.env.GOOGLE_ROUTES_API_KEY;
    if (apiKey === undefined || apiKey === null) {
      throw new RouteProviderError('configuration_missing', 'Google Routes API key is not configured');
    }
    if (typeof apiKey !== 'string') {
      throw invalidConfiguration('Google Routes API key must be a string');
    }
    if (apiKey.trim() === '') {
      throw new RouteProviderError('configuration_missing', 'Google Routes API key is not configured');
    }
    return apiKey;
  }

  async function computeRoute({ origin, destination, pickup } = {}) {
    const originPoint = validateGeoPoint(origin, 'origin');
    const destinationPoint = validateGeoPoint(destination, 'destination');
    const pickupPoint = pickup === undefined || pickup === null ? null : validateGeoPoint(pickup, 'pickup');

    const apiKey = resolveApiKey();
    const body = {
      origin: waypoint(originPoint),
      destination: waypoint(destinationPoint),
      ...(pickupPoint ? { intermediates: [waypoint(pickupPoint)] } : {}),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      computeAlternativeRoutes: false,
      polylineQuality: 'HIGH_QUALITY',
      polylineEncoding: 'ENCODED_POLYLINE',
      units: 'METRIC',
      languageCode: 'pt-BR',
    };

    let response;
    try {
      response = await httpClient.post(endpoint, body, {
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
      });
    } catch (error) {
      throw mapTransportError(error);
    }

    const data = response && response.data;
    if (!data || typeof data !== 'object' || !Array.isArray(data.routes)) {
      throw malformed('routes');
    }
    if (data.routes.length === 0) {
      throw new RouteProviderError('empty_route', 'Route provider found no route');
    }

    const route = data.routes[0];
    if (!route || typeof route !== 'object' || Array.isArray(route)) {
      throw malformed('routes[0]');
    }

    const expectedLegCount = pickupPoint ? 2 : 1;
    if (!Array.isArray(route.legs) || route.legs.length !== expectedLegCount) {
      throw malformed('routes[0].legs');
    }

    const legs = route.legs.map((rawLeg, index) => parseLeg(rawLeg, `routes[0].legs[${index}]`));

    return Object.freeze({
      provider_to_pickup: pickupPoint ? legs[0] : null,
      pickup_to_destination: pickupPoint ? legs[1] : legs[0],
      encoded_polyline: parsePolyline(route),
    });
  }

  return { name: 'google-routes', computeRoute };
}

module.exports = {
  createGoogleRoutesAdapter,
  GOOGLE_ROUTES_ENDPOINT: ENDPOINT,
  GOOGLE_ROUTES_FIELD_MASK: FIELD_MASK,
  DEFAULT_TIMEOUT_MS,
};
