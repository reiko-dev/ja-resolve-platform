/**
 * MVP-05 — the frozen input shapes of the execution, tracking and cancellation
 * operations.
 *
 * Every one of these mirrors a schema of the canonical contract and rejects
 * everything the schema rejects (`additionalProperties: false`):
 *
 *   - `LocationInput`     `POST /arrived`, `POST /finish`   `{location: GeoPoint}`
 *   - `TrackingPoint`     `POST /tracking`                  `{latitude, longitude, recorded_at}`
 *   - `RequiredReasonInput` `POST /cancel-partner`          `{reason}` (1..2000)
 *   - customer cancel     `POST /cancel`                    optional `{reason}` (<= 1000)
 *
 * Two rules are shared by all four and are worth stating once:
 *
 *   1. VALIDATION RUNS BEFORE ANY WRITE. Every validator here is pure and is
 *      called before the transaction is opened, so an invalid payload can never
 *      leave a milestone, a release or a tracking row behind.
 *   2. NO CLIENT VALUE EVER BECOMES A PERSISTED INSTANT. The bodies of
 *      `/arrived` and `/finish` carry a location the module ACKNOWLEDGES but does
 *      not store (the milestone instant is the backend clock's); only the
 *      tracking `recorded_at` is persisted, and it is persisted as the point's
 *      own observation instant, never as the request's.
 *
 * The coordinate rule is the range-only `validateGeoPoint` of MVP-02: the
 * contract declares `minimum`/`maximum` and nothing else, so this module does not
 * invent the additional `(0, 0)` operational rule for a body it merely
 * acknowledges.
 */
'use strict';

const { validationError } = require('./errors');
const { validateGeoPoint } = require('./geo');
const { requireIsoInstant } = require('./instants');

/** Contract `RequiredReasonInput.reason`. */
const PARTNER_CANCELLATION_REASON_MAX_LENGTH = 2000;

/** Contract `POST /cancel` optional body `reason`. */
const CUSTOMER_CANCELLATION_REASON_MAX_LENGTH = 1000;

const LOCATION_INPUT_KEYS = Object.freeze(['location']);
const GEO_POINT_KEYS = Object.freeze(['latitude', 'longitude', 'formatted_address']);
const TRACKING_POINT_KEYS = Object.freeze(['latitude', 'longitude', 'recorded_at']);
const CANCELLATION_KEYS = Object.freeze(['reason']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rejectUnknownKeys(value, allowed, field) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw validationError(`${field}.${key} is not an accepted field`, { field: `${field}.${key}` });
    }
  }
}

/** `null`/absent/blank -> `null`; otherwise the trimmed string, length-checked. */
function optionalText(value, field, maxLength) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw validationError(`${field} must be a string`, { field });
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) {
    throw validationError(`${field} must be at most ${maxLength} characters`, { field });
  }
  return trimmed;
}

/**
 * `LocationInput` — the acknowledgement body of `/arrived` and `/finish`.
 *
 * @param {unknown} payload
 * @returns {Readonly<{location: {latitude: number, longitude: number, formatted_address: string|null}}>}
 */
function validateLocationInput(payload) {
  if (!isPlainObject(payload)) {
    throw validationError('body must be an object with a location', { field: 'body' });
  }
  rejectUnknownKeys(payload, LOCATION_INPUT_KEYS, 'body');

  const location = payload.location;
  if (!isPlainObject(location)) {
    throw validationError('location must be an object with latitude and longitude', { field: 'location' });
  }
  rejectUnknownKeys(location, GEO_POINT_KEYS, 'location');

  const point = validateGeoPoint(location, 'location');
  return Object.freeze({
    location: Object.freeze({
      latitude: point.latitude,
      longitude: point.longitude,
      formatted_address: optionalText(location.formatted_address, 'location.formatted_address', 500),
    }),
  });
}

/**
 * `TrackingPoint` — the ONLY client-supplied instant of this delivery.
 *
 * @param {unknown} payload
 * @returns {Readonly<{latitude: number, longitude: number, recorded_at: string}>}
 */
function validateTrackingPoint(payload) {
  if (!isPlainObject(payload)) {
    throw validationError('body must be an object with latitude, longitude and recorded_at', { field: 'body' });
  }
  rejectUnknownKeys(payload, TRACKING_POINT_KEYS, 'body');

  const point = validateGeoPoint(payload, 'body');
  if (typeof payload.recorded_at !== 'string') {
    throw validationError('recorded_at must be an ISO-8601 instant string', { field: 'recorded_at' });
  }

  return Object.freeze({
    latitude: point.latitude,
    longitude: point.longitude,
    recorded_at: requireIsoInstant(payload.recorded_at, 'recorded_at'),
  });
}

/**
 * `POST /cancel` — the body is OPTIONAL and the reason is optional within it.
 *
 * `undefined`/`null`/`{}` all mean "the customer gave no reason", which is the
 * truthful `null` the contract's `reason: [string, 'null']` allows.
 *
 * @param {unknown} payload
 * @returns {Readonly<{reason: string|null}>}
 */
function validateCustomerCancellationInput(payload) {
  if (payload === undefined || payload === null) return Object.freeze({ reason: null });
  if (!isPlainObject(payload)) {
    throw validationError('body must be an object', { field: 'body' });
  }
  rejectUnknownKeys(payload, CANCELLATION_KEYS, 'body');
  return Object.freeze({
    reason: optionalText(payload.reason, 'reason', CUSTOMER_CANCELLATION_REASON_MAX_LENGTH),
  });
}

/**
 * `RequiredReasonInput` — the partner must say why the job is being dropped.
 *
 * @param {unknown} payload
 * @returns {Readonly<{reason: string}>}
 */
function validatePartnerCancellationInput(payload) {
  if (!isPlainObject(payload)) {
    throw validationError('body must be an object with a reason', { field: 'body' });
  }
  rejectUnknownKeys(payload, CANCELLATION_KEYS, 'body');

  const reason = optionalText(payload.reason, 'reason', PARTNER_CANCELLATION_REASON_MAX_LENGTH);
  if (reason === null) {
    throw validationError('reason is required', { field: 'reason' });
  }
  return Object.freeze({ reason });
}

module.exports = {
  PARTNER_CANCELLATION_REASON_MAX_LENGTH,
  CUSTOMER_CANCELLATION_REASON_MAX_LENGTH,
  validateLocationInput,
  validateTrackingPoint,
  validateCustomerCancellationInput,
  validatePartnerCancellationInput,
};
