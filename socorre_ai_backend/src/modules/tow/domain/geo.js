/**
 * MVP-02 — geographic coordinate invariants.
 *
 * A coordinate is validated *before* any provider call: sending a malformed
 * point to Google and then reporting the resulting 400 as a provider outage
 * would hide a caller bug behind an availability incident.
 *
 * The accepted range is the WGS84 range Google documents for `LatLng`
 * (latitude [-90, 90], longitude [-180, 180]); the values are passed through
 * unchanged so the backend stays authoritative about what it asked for.
 *
 * MVP-03 adds two things and changes nothing above:
 *
 *   1. the *operational* coordinate rule (finite, in range, and not the
 *      `(0, 0)` "null island" sentinel). `validateGeoPoint` deliberately keeps
 *      its range-only semantics, because a provider request may legitimately
 *      name any WGS84 point; only a *matching* candidate must be operational.
 *      The rule mirrors the one the legacy subsystem enforces
 *      (`EmergencyRequestService.assertOperationalCoordinates`,
 *      `reason: 'zero_zero'`) without importing any of its code.
 *
 *   2. the geodesic distance primitive used for radius filtering and
 *      deterministic ordering. It is a numerically stable `atan2`
 *      great-circle distance over the IUGG mean Earth radius expressed in
 *      METRES. It is *not* a fallback for the route/pricing authority: the
 *      price always comes from the RouteProvider (MVP-02), and the legacy
 *      `6371 * acos(...)` expression is never reused. See
 *      `docs/evidence/mvp-03/01-current-state-delta.md` §3.
 */
'use strict';

const { validationError } = require('./errors');

/** IUGG mean Earth radius, in metres (6371.0088 km). */
const EARTH_MEAN_RADIUS_METERS = 6371008.8;

function requireCoordinate(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw validationError(`${field} must be a finite number`, { field });
  }
  return value;
}

/**
 * Validates and freezes a `{ latitude, longitude }` pair.
 *
 * @param {{ latitude: number, longitude: number }} point
 * @param {string} [field] name used in the validation error, e.g. `pickup`
 * @returns {{ latitude: number, longitude: number }} frozen copy
 */
function validateGeoPoint(point, field = 'location') {
  if (!point || typeof point !== 'object' || Array.isArray(point)) {
    throw validationError(`${field} must be an object with latitude and longitude`, { field });
  }

  const latitude = requireCoordinate(point.latitude, `${field}.latitude`);
  const longitude = requireCoordinate(point.longitude, `${field}.longitude`);

  if (latitude < -90 || latitude > 90) {
    throw validationError(`${field}.latitude must be between -90 and 90`, { field: `${field}.latitude` });
  }
  if (longitude < -180 || longitude > 180) {
    throw validationError(`${field}.longitude must be between -180 and 180`, { field: `${field}.longitude` });
  }

  return Object.freeze({ latitude, longitude });
}

/**
 * `(0, 0)` is the canonical "no location registered" sentinel in this platform
 * (a partner row whose coordinates were never filled in, a mobile client that
 * failed to acquire a fix). It is a legal WGS84 point and an illegal
 * operational one.
 */
function isZeroZero(point) {
  return point.latitude === 0 && point.longitude === 0;
}

/** True when the point is a usable *operational* location (not just in range). */
function isOperationalGeoPoint(point) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) return false;
  const { latitude, longitude } = point;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude)) return false;
  if (typeof longitude !== 'number' || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  return !isZeroZero({ latitude, longitude });
}

/** Same rule as `isOperationalGeoPoint`, but throws the canonical 422. */
function assertOperationalGeoPoint(point, field = 'location') {
  if (isOperationalGeoPoint(point)) {
    return Object.freeze({ latitude: point.latitude, longitude: point.longitude });
  }

  if (point && typeof point === 'object' && !Array.isArray(point)
    && typeof point.latitude === 'number' && typeof point.longitude === 'number'
    && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && isZeroZero(point)) {
    throw validationError(
      `${field} must not be the (0,0) sentinel; register the real operational location`,
      { field, reason: 'zero_zero' }
    );
  }

  // Fall back to the range rule so the message names the offending component.
  validateGeoPoint(point, field);
  throw validationError(`${field} must be an operational location`, { field, reason: 'not_operational' });
}

function degreesToRadiansValue(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance in metres between two `{ latitude, longitude }` points.
 *
 * The `atan2` form of the spherical law of cosines is used instead of the
 * `acos` form: it stays accurate for short distances (a 50 m pair is a
 * meaningless `acos` argument difference) and it cannot leave the domain of the
 * inverse trigonometric function on floating-point rounding.
 *
 * Returns `NaN` when either point is not a finite, in-range pair: callers must
 * treat a non-finite distance as "not a candidate", never as zero.
 *
 * @returns {number} metres
 */
function geodesicDistanceMeters(from, to) {
  if (!from || !to) return Number.NaN;
  const lat1 = Number(from.latitude);
  const lon1 = Number(from.longitude);
  const lat2 = Number(to.latitude);
  const lon2 = Number(to.longitude);
  if (![lat1, lon1, lat2, lon2].every((value) => Number.isFinite(value))) return Number.NaN;
  if (Math.abs(lat1) > 90 || Math.abs(lat2) > 90) return Number.NaN;
  if (Math.abs(lon1) > 180 || Math.abs(lon2) > 180) return Number.NaN;

  const phi1 = degreesToRadiansValue(lat1);
  const phi2 = degreesToRadiansValue(lat2);
  const deltaPhi = degreesToRadiansValue(lat2 - lat1);
  const deltaLambda = degreesToRadiansValue(lon2 - lon1);

  const sinHalfPhi = Math.sin(deltaPhi / 2);
  const sinHalfLambda = Math.sin(deltaLambda / 2);
  const a = sinHalfPhi * sinHalfPhi + Math.cos(phi1) * Math.cos(phi2) * sinHalfLambda * sinHalfLambda;

  return 2 * EARTH_MEAN_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Inclusive radius test in kilometres. An invalid point is never within. */
function isWithinRadius(center, candidate, radiusKm) {
  if (!isOperationalGeoPoint(center) || !isOperationalGeoPoint(candidate)) return false;
  const radius = Number(radiusKm);
  if (!Number.isFinite(radius) || radius <= 0) return false;
  return geodesicDistanceMeters(center, candidate) <= radius * 1000;
}

/**
 * A conservative latitude/longitude envelope for a radius around a point.
 *
 * Used only as a cheap pre-filter by callers that want a bounded SQL query; the
 * authoritative decision is always `isWithinRadius`. Longitude degrees shrink
 * with latitude, so the envelope is widened by `cos(latitude)` and clamped at
 * the poles and at the antimeridian.
 */
function boundingBoxForRadius(center, radiusKm) {
  const point = assertOperationalGeoPoint(center, 'center');
  const radius = Number(radiusKm);
  if (!Number.isFinite(radius) || radius <= 0) {
    throw validationError('radiusKm must be a positive finite number', { field: 'radiusKm' });
  }

  const angular = (radius * 1000) / EARTH_MEAN_RADIUS_METERS;
  const deltaLat = (angular * 180) / Math.PI;
  const cosLatitude = Math.max(Math.cos(degreesToRadiansValue(point.latitude)), Number.EPSILON);
  const deltaLon = Math.min((angular * 180) / Math.PI / cosLatitude, 180);

  return Object.freeze({
    min_latitude: Math.max(point.latitude - deltaLat, -90),
    max_latitude: Math.min(point.latitude + deltaLat, 90),
    min_longitude: Math.max(point.longitude - deltaLon, -180),
    max_longitude: Math.min(point.longitude + deltaLon, 180),
  });
}

module.exports = {
  EARTH_MEAN_RADIUS_METERS,
  validateGeoPoint,
  isZeroZero,
  isOperationalGeoPoint,
  assertOperationalGeoPoint,
  geodesicDistanceMeters,
  isWithinRadius,
  boundingBoxForRadius,
};
