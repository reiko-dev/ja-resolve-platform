/**
 * MVP-02 — authoritative route quote value object.
 *
 * The route quote is the immutable, serializable result of asking the route
 * provider for `provider -> pickup -> destination`. It is the ONLY distance the
 * module is allowed to price: the total is the exact integer sum of the legs
 * Google returned, never a re-derived, scaled or estimated figure.
 *
 * Both legs stay individually observable so a later snapshot (MVP-03) can show
 * the customer and the partner where the distance came from.
 */
'use strict';

const { validationError } = require('./errors');
const { requireSafeNonNegativeInteger, addSafeIntegers } = require('./integers');

function normalizeLeg(leg, field) {
  if (!leg || typeof leg !== 'object' || Array.isArray(leg)) {
    throw validationError(`${field} must be a route leg object`, { field });
  }
  return Object.freeze({
    distance_meters: requireSafeNonNegativeInteger(leg.distance_meters, `${field}.distance_meters`),
    duration_seconds: requireSafeNonNegativeInteger(leg.duration_seconds, `${field}.duration_seconds`),
  });
}

function normalizePolyline(encodedPolyline) {
  if (encodedPolyline === null || encodedPolyline === undefined) return null;
  if (typeof encodedPolyline !== 'string') {
    throw validationError('encoded_polyline must be a string or null', { field: 'encoded_polyline' });
  }
  return encodedPolyline;
}

/**
 * Builds the frozen route quote.
 *
 * @param {object} legs
 * @param {{ distance_meters: number, duration_seconds: number }|null} [legs.provider_to_pickup]
 * @param {{ distance_meters: number, duration_seconds: number }|null} [legs.pickup_to_destination]
 * @param {string|null} [legs.encoded_polyline]
 * @returns {Readonly<object>}
 */
function createRouteQuote({ provider_to_pickup: providerToPickup = null, pickup_to_destination: pickupToDestination = null, encoded_polyline: encodedPolyline = null } = {}) {
  const toPickup = providerToPickup === null || providerToPickup === undefined
    ? null
    : normalizeLeg(providerToPickup, 'provider_to_pickup');
  const toDestination = pickupToDestination === null || pickupToDestination === undefined
    ? null
    : normalizeLeg(pickupToDestination, 'pickup_to_destination');

  if (!toPickup && !toDestination) {
    throw validationError('a route quote requires at least one leg');
  }

  return Object.freeze({
    provider_to_pickup: toPickup,
    pickup_to_destination: toDestination,
    total_distance_meters: addSafeIntegers(
      toPickup ? toPickup.distance_meters : 0,
      toDestination ? toDestination.distance_meters : 0,
      'total_distance_meters',
    ),
    total_duration_seconds: addSafeIntegers(
      toPickup ? toPickup.duration_seconds : 0,
      toDestination ? toDestination.duration_seconds : 0,
      'total_duration_seconds',
    ),
    encoded_polyline: normalizePolyline(encodedPolyline),
  });
}

module.exports = { createRouteQuote };
