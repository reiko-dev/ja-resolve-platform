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
 */
'use strict';

const { validationError } = require('./errors');

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

module.exports = { validateGeoPoint };
