/**
 * SERVICE LOCATION — the canonical ServiceLocation value object.
 *
 *   ServiceLocation
 *   ├── latitude           operational authority (with longitude)
 *   ├── longitude          operational authority (with latitude)
 *   ├── formattedAddress?  presentation snapshot / enrichment
 *   ├── placeId?           durable explicit-place identity
 *   ├── placeName?         ephemeral presentation of an explicit place
 *   └── resolutionSource   USER_SELECTED_PLACE | USER_PIN | CURRENT_LOCATION | SAVED_ADDRESS
 *
 * Identity invariants (enforced here, never in a widget or adapter):
 *
 *   1. placeId != null            => resolutionSource === USER_SELECTED_PLACE
 *   2. USER_SELECTED_PLACE        => placeId != null
 *   3. placeName != null          => placeId != null
 *   4. an invalid coordinate (not finite, out of range or (0,0)) is never built
 *
 * The geocoder/reverse-geocoder can only ever fill `formattedAddress`: there is
 * no builder that lets an enrichment result mint a place identity.
 *
 * Pure domain: no HTTP, no environment, no clock, no provider vocabulary.
 */
'use strict';

const { assertOperationalGeoPoint } = require('./geo');
const { validationError } = require('./errors');
const {
  EXPLICIT_PLACE_SOURCE,
  USER_PIN_SOURCE,
  CURRENT_LOCATION_SOURCE,
  SAVED_ADDRESS_SOURCE,
  validateResolutionSource,
} = require('./resolution-source');

const MAX_FORMATTED_ADDRESS_LENGTH = 500;
const MAX_PLACE_ID_LENGTH = 500;
const MAX_PLACE_NAME_LENGTH = 500;

function normalizeText(value, field, maxLength) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw validationError(`${field} must be a string`, { field });
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed === '') return null;
  if (trimmed.length > maxLength) {
    throw validationError(`${field} must be at most ${maxLength} characters`, { field });
  }
  return trimmed;
}

function normalizePlaceId(value) {
  const placeId = normalizeText(value, 'place_id', MAX_PLACE_ID_LENGTH);
  if (placeId === null) return null;
  // Google resource names may leak from a client; store the bare id only.
  const bare = placeId.startsWith('places/') ? placeId.slice('places/'.length) : placeId;
  if (bare === '') {
    throw validationError('place_id must not be an empty resource name', { field: 'place_id' });
  }
  return bare;
}

/**
 * Builds a frozen ServiceLocation, validating coordinates and identity.
 *
 * @param {object} input
 * @param {number} input.latitude
 * @param {number} input.longitude
 * @param {string|null} [input.formattedAddress]
 * @param {string|null} [input.placeId]
 * @param {string|null} [input.placeName]
 * @param {string} input.resolutionSource
 * @returns {Readonly<object>}
 */
function buildServiceLocation(input = {}) {
  const resolutionSource = validateResolutionSource(input.resolutionSource);
  const point = assertOperationalGeoPoint(
    { latitude: input.latitude, longitude: input.longitude },
    'location'
  );
  const formattedAddress = normalizeText(
    input.formattedAddress,
    'formatted_address',
    MAX_FORMATTED_ADDRESS_LENGTH
  );
  const placeId = normalizePlaceId(input.placeId);
  const placeName = normalizeText(input.placeName, 'place_name', MAX_PLACE_NAME_LENGTH);

  if (placeId !== null && resolutionSource !== EXPLICIT_PLACE_SOURCE) {
    throw validationError(
      'place_id is only valid with resolution_source=USER_SELECTED_PLACE',
      { field: 'place_id', reason: 'identity_conflict' }
    );
  }
  if (resolutionSource === EXPLICIT_PLACE_SOURCE && placeId === null) {
    throw validationError(
      'USER_SELECTED_PLACE requires a place_id',
      { field: 'place_id', reason: 'identity_missing' }
    );
  }
  if (placeName !== null && placeId === null) {
    throw validationError(
      'place_name requires a place_id; a generic coordinate never carries a place name',
      { field: 'place_name', reason: 'identity_missing' }
    );
  }

  return Object.freeze({
    latitude: point.latitude,
    longitude: point.longitude,
    formattedAddress,
    placeId,
    placeName,
    resolutionSource,
  });
}

/**
 * Explicit place selected from Autocomplete / a POI with a placeId.
 * The only builder allowed to set place identity.
 */
function buildExplicitPlaceLocation({ placeId, placeName = null, formattedAddress = null, latitude, longitude }) {
  return buildServiceLocation({
    latitude,
    longitude,
    formattedAddress,
    placeId,
    placeName,
    resolutionSource: EXPLICIT_PLACE_SOURCE,
  });
}

/**
 * Generic coordinate (map pin, GPS fix or future saved address).
 * `formattedAddress` is enrichment; identity fields are structurally impossible
 * through this builder.
 */
function buildCoordinateLocation({
  latitude,
  longitude,
  formattedAddress = null,
  resolutionSource = USER_PIN_SOURCE,
}) {
  if (resolutionSource === EXPLICIT_PLACE_SOURCE) {
    throw validationError(
      'USER_SELECTED_PLACE must be built from an explicit place, never from a coordinate',
      { field: 'resolution_source', reason: 'identity_conflict' }
    );
  }
  if (![USER_PIN_SOURCE, CURRENT_LOCATION_SOURCE, SAVED_ADDRESS_SOURCE].includes(resolutionSource)) {
    validateResolutionSource(resolutionSource);
  }
  return buildServiceLocation({
    latitude,
    longitude,
    formattedAddress,
    placeId: null,
    placeName: null,
    resolutionSource,
  });
}

module.exports = {
  MAX_FORMATTED_ADDRESS_LENGTH,
  MAX_PLACE_ID_LENGTH,
  MAX_PLACE_NAME_LENGTH,
  buildServiceLocation,
  buildExplicitPlaceLocation,
  buildCoordinateLocation,
};
