/**
 * SERVICE LOCATION — ResolutionSource vocabulary (frozen).
 *
 * Exactly these four values. There is deliberately NO `REVERSE_GEOCODE`:
 * reverse geocoding is enrichment of a coordinate, never an origin.
 *
 *   USER_SELECTED_PLACE  the user chose an Autocomplete suggestion (or a Map POI
 *                        when the renderer can deliver a placeId). The only
 *                        source allowed to carry a `placeId`/`placeName`.
 *   USER_PIN             the user tapped a generic point on the map. Coordinates
 *                        only; a reverse-geocoded address is presentation.
 *   CURRENT_LOCATION     a device GPS fix. Coordinates only.
 *   SAVED_ADDRESS        reserved for the future saved-address flow; no Phase 5
 *                        endpoint produces it.
 */
'use strict';

const { validationError } = require('./errors');

const RESOLUTION_SOURCES = Object.freeze([
  'USER_SELECTED_PLACE',
  'USER_PIN',
  'CURRENT_LOCATION',
  'SAVED_ADDRESS',
]);

const EXPLICIT_PLACE_SOURCE = 'USER_SELECTED_PLACE';
const USER_PIN_SOURCE = 'USER_PIN';
const CURRENT_LOCATION_SOURCE = 'CURRENT_LOCATION';
const SAVED_ADDRESS_SOURCE = 'SAVED_ADDRESS';

function isResolutionSource(value) {
  return typeof value === 'string' && RESOLUTION_SOURCES.includes(value);
}

function validateResolutionSource(value, field = 'resolution_source') {
  if (!isResolutionSource(value)) {
    throw validationError(
      `${field} must be one of ${RESOLUTION_SOURCES.join(', ')}`,
      { field }
    );
  }
  return value;
}

module.exports = {
  RESOLUTION_SOURCES,
  EXPLICIT_PLACE_SOURCE,
  USER_PIN_SOURCE,
  CURRENT_LOCATION_SOURCE,
  SAVED_ADDRESS_SOURCE,
  isResolutionSource,
  validateResolutionSource,
};
