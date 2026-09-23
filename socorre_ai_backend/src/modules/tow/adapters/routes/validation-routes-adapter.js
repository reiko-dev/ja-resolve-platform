/**
 * VALIDATION-ONLY — deterministic RouteProvider fixture. NEVER PRODUCTION.
 *
 * ⚠️  This adapter FABRICATES distances and durations from a straight-line
 * geodesic distance times a fixed detour factor. It talks to no network, reads
 * no key and knows nothing about real roads. It exists solely so the local
 * validation environment (which has no Google Routes server key) can exercise
 * the canonical quote/proposal/assignment flows end to end with stable numbers.
 *
 * Selection is explicit and guarded: `TOW_ROUTE_PROVIDER=validation-fixture`
 * plus `composition.js`, with `assertTowRouteProviderSafe()` refusing to boot
 * when `NODE_ENV`/`APP_ENV` is `production`. It is never a fallback — if the
 * Google adapter fails, the operation fails.
 *
 * The implementation satisfies exactly the frozen `RouteProvider` port: one
 * `computeRoute({ origin, destination, pickup })` call, the two leg boundaries
 * (or `provider_to_pickup: null` when there is no pickup), and one continuous
 * Google-encoded polyline over `origin -> pickup? -> destination`.
 */
'use strict';

const { validateGeoPoint, geodesicDistanceMeters } = require('../../domain');
const { RouteProviderError } = require('./route-provider-error');

const ADAPTER_NAME = 'validation-fixture-routes';
const DEFAULT_DETOUR_FACTOR = 1.35;
const FIXTURE_METERS_PER_SECOND = 11.1;

function invalidRequest(message, details) {
  return new RouteProviderError('invalid_request', message, details);
}

function parsePoint(point, field) {
  try {
    return validateGeoPoint(point, field);
  } catch (error) {
    throw invalidRequest(`${field} must be a WGS84 point with numeric latitude and longitude`, { field });
  }
}

/** One signed value of the Google polyline codec (precision 5). */
function encodeSignedValue(value) {
  let encodedValue = value < 0 ? ~(value << 1) : value << 1;
  let output = '';
  while (encodedValue >= 0x20) {
    output += String.fromCharCode((0x20 | (encodedValue & 0x1f)) + 63);
    encodedValue >>= 5;
  }
  output += String.fromCharCode(encodedValue + 63);
  return output;
}

/** Google polyline encoding (precision 5) over `{ latitude, longitude }` points. */
function encodePolyline(points) {
  let previousLatitude = 0;
  let previousLongitude = 0;
  let encoded = '';

  for (const point of points) {
    const latitude = Math.round(point.latitude * 1e5);
    const longitude = Math.round(point.longitude * 1e5);
    encoded += encodeSignedValue(latitude - previousLatitude);
    encoded += encodeSignedValue(longitude - previousLongitude);
    previousLatitude = latitude;
    previousLongitude = longitude;
  }

  return encoded;
}

function buildLeg(from, to, detourFactor) {
  const distanceMeters = Math.round(geodesicDistanceMeters(from, to) * detourFactor);
  return Object.freeze({
    distance_meters: distanceMeters,
    duration_seconds: Math.round(distanceMeters / FIXTURE_METERS_PER_SECOND),
  });
}

/**
 * @param {object} [options]
 * @param {number} [options.detourFactor] defaults to 1.35
 * @returns {{ name: string, computeRoute: Function }} RouteProvider port
 */
function createValidationRoutesAdapter(options = {}) {
  const detourFactor = options.detourFactor === undefined ? DEFAULT_DETOUR_FACTOR : options.detourFactor;
  if (typeof detourFactor !== 'number' || !Number.isFinite(detourFactor) || detourFactor <= 0) {
    throw invalidRequest('detourFactor must be a positive finite number', { field: 'detourFactor' });
  }

  async function computeRoute({ origin, destination, pickup } = {}) {
    const originPoint = parsePoint(origin, 'origin');
    const destinationPoint = parsePoint(destination, 'destination');
    const pickupPoint = pickup === undefined || pickup === null ? null : parsePoint(pickup, 'pickup');

    const points = pickupPoint === null
      ? [originPoint, destinationPoint]
      : [originPoint, pickupPoint, destinationPoint];

    const legs = [
      buildLeg(points[0], points[1], detourFactor),
      ...(pickupPoint === null ? [] : [buildLeg(points[1], points[2], detourFactor)]),
    ];

    return Object.freeze({
      provider_to_pickup: pickupPoint === null ? null : legs[0],
      pickup_to_destination: pickupPoint === null ? legs[0] : legs[1],
      encoded_polyline: encodePolyline(points),
    });
  }

  return { name: ADAPTER_NAME, computeRoute };
}

module.exports = {
  createValidationRoutesAdapter,
  DEFAULT_DETOUR_FACTOR,
};
