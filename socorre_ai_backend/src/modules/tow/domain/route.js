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
const { requireIsoInstant } = require('./instants');

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

/**
 * The contract `GeoPoint` projection of a canonical request endpoint.
 *
 * This file deliberately does NOT import `domain/geo.js`: the geodesic/range
 * primitives are owned by the matching authority (`MVP-03 ARCH — the pricing
 * and route authority never import the matching primitive`). The application
 * service validates the canonical points with `validateGeoPoint` BEFORE the
 * provider call, so this function is a pure projection, exactly like
 * `buildTowRequestDto`'s point projection.
 */
function snapshotGeoPoint(point, field) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) {
    throw validationError(`${field} must be a canonical request point`, { field });
  }
  return Object.freeze({
    latitude: Number(point.latitude),
    longitude: Number(point.longitude),
    formatted_address: point.formatted_address ?? null,
  });
}

/**
 * B5 — the contract `TowRouteSnapshot` DTO of
 * `GET /tow/requests/{requestId}/route`.
 *
 * This is a VISUALIZATION projection, not a quote: `pickup`/`destination` are
 * the canonical request's own endpoints, `route_quote` carries the provider's
 * authoritative legs and totals, and `encoded_polyline` is the
 * Google-compatible geometry of that same route. It deliberately carries no
 * price member of any kind — the accepted proposal/assignment snapshot remains
 * the ONLY pricing authority, and this DTO must never be mistaken for it.
 *
 * `provider_to_pickup` is included ONLY when the provider actually returned it.
 * The declared base `RouteQuote` schema does not allow the member to be null, so
 * an absent leg is an ABSENT member: never a fabricated zero, never a
 * straight-line substitute and never a second route authority.
 *
 * @param {{request: object, route: object, generatedAt: unknown}} input
 * @returns {Readonly<object>}
 */
function buildTowRouteSnapshot({ request, route, generatedAt } = {}) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw validationError('request must be a canonical tow request row', { field: 'request' });
  }

  const quote = createRouteQuote(route);

  const routeQuote = {};
  if (quote.provider_to_pickup) routeQuote.provider_to_pickup = quote.provider_to_pickup;
  if (quote.pickup_to_destination) routeQuote.pickup_to_destination = quote.pickup_to_destination;
  routeQuote.total_distance_meters = quote.total_distance_meters;
  routeQuote.total_duration_seconds = quote.total_duration_seconds;

  return Object.freeze({
    request_id: String(request.id),
    pickup: snapshotGeoPoint(request.pickup, 'pickup'),
    destination: snapshotGeoPoint(request.destination, 'destination'),
    route_quote: Object.freeze(routeQuote),
    encoded_polyline: quote.encoded_polyline,
    generated_at: requireIsoInstant(generatedAt, 'generated_at'),
  });
}

module.exports = { createRouteQuote, buildTowRouteSnapshot };
