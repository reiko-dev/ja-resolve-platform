/**
 * MVP-03 — geographic matching of a tow request to an operational partner.
 *
 * MVP-03 matching is LEAN by design: a geodesic radius filter and nothing else.
 * There is no scoring, no ranking model, no batching, no proposal, no
 * assignment, no expiry and no scheduler. A partner either is a candidate or is
 * not; the only ordering is by distance and then by request id, so the same
 * data always produces the same list.
 *
 * Authority boundaries:
 *   - the radius is the request's FROZEN `matching_radius_km`, never the live
 *     `tow_initial_radius_km` setting (a settings change must not retroactively
 *     re-scope an existing search);
 *   - the distance is the geodesic primitive of `domain/geo.js` and is used for
 *     filtering/ordering ONLY. It is never a price and never a duration: the
 *     price comes from the RouteProvider quote (MVP-02), computed per
 *     opportunity by the application service;
 *   - eligibility is composed by `domain/eligibility.js` (MVP-01) — it is never
 *     re-implemented here. Module availability stays first so a disabled module
 *     always reports `service_module_disabled`.
 *
 * Exclusion codes are DIAGNOSTIC: they explain why a partner was left out and
 * are never returned to the partner. Only the module gate produces an HTTP
 * error (409 `service_module_disabled`).
 */
'use strict';

const { isModuleEnabled } = require('./availability');
const { PARTNER_TYPE } = require('./identity');
const { evaluateEligibility } = require('./eligibility');
const { isOperationalGeoPoint, geodesicDistanceMeters, isWithinRadius } = require('./geo');

/** Diagnostic exclusion codes (never serialized to a client). */
const MATCH_EXCLUSION_CODES = Object.freeze({
  MODULE_DISABLED: 'service_module_disabled',
  PARTNER_MISSING: 'partner_not_operational',
  OUTSIDE_RADIUS: 'outside_radius',
});

function excluded(code, reasons, distanceMeters = null) {
  return Object.freeze({ matched: false, code, reasons: Object.freeze(reasons), distance_meters: distanceMeters });
}

/**
 * The partner's operational location, or `null` when it cannot be used.
 *
 * `(0, 0)` is rejected on purpose: it is the "coordinates never registered"
 * sentinel, and treating it as a real point would put a partner in the Gulf of
 * Guinea and make it a candidate for nothing while looking available.
 */
function operationalLocation(partner) {
  const point = { latitude: partner.latitude, longitude: partner.longitude };
  return isOperationalGeoPoint(point) ? Object.freeze(point) : null;
}

/**
 * Evaluates one (request, partner) pair.
 *
 * Order (documented, deterministic): module → partner identity → availability →
 * online → operational coordinates → eligibility (vehicle/documents/class) →
 * radius. Cheap and absolute checks come first; the radius last, because it is
 * the only one that needs the distance computation.
 *
 * @returns {{matched: boolean, code: string|null, reasons: readonly string[], distance_meters: number|null}}
 */
function evaluateTowMatch({ request, partner, moduleStatus, vehicle, documents, now } = {}) {
  if (!isModuleEnabled(moduleStatus)) {
    return excluded(MATCH_EXCLUSION_CODES.MODULE_DISABLED, ['module_disabled']);
  }

  if (!partner) {
    return excluded(MATCH_EXCLUSION_CODES.PARTNER_MISSING, ['partner_missing']);
  }
  if (partner.type !== PARTNER_TYPE) {
    return excluded(MATCH_EXCLUSION_CODES.PARTNER_MISSING, ['partner_not_tow']);
  }
  if (partner.is_available !== true) {
    return excluded(MATCH_EXCLUSION_CODES.PARTNER_MISSING, ['partner_unavailable']);
  }
  if (partner.is_online !== true) {
    return excluded(MATCH_EXCLUSION_CODES.PARTNER_MISSING, ['partner_offline']);
  }

  const location = operationalLocation(partner);
  if (!location) {
    return excluded(MATCH_EXCLUSION_CODES.PARTNER_MISSING, ['partner_coordinates_invalid']);
  }

  const eligibility = evaluateEligibility({
    partner,
    moduleStatus,
    vehicle,
    documents,
    requested: { class: request.vehicle.class, weight_kg: request.vehicle.weight_kg },
    now,
  });
  if (!eligibility.eligible) {
    return excluded(eligibility.code, eligibility.reasons);
  }

  if (!isOperationalGeoPoint(request.pickup)) {
    return excluded('validation_error', ['request_coordinates_invalid']);
  }

  const distanceMeters = geodesicDistanceMeters(location, request.pickup);
  if (!Number.isFinite(distanceMeters)) {
    return excluded(MATCH_EXCLUSION_CODES.PARTNER_MISSING, ['distance_unavailable']);
  }

  // Inclusive boundary: exactly `radius` kilometres away is a match.
  if (!isWithinRadius(location, request.pickup, request.matching_radius_km)) {
    return excluded(MATCH_EXCLUSION_CODES.OUTSIDE_RADIUS, ['out_of_radius'], distanceMeters);
  }

  return Object.freeze({
    matched: true,
    code: null,
    reasons: Object.freeze([]),
    distance_meters: distanceMeters,
  });
}

/** Numeric-aware id comparison: `9` sorts before `10`. */
function compareRequestIds(left, right) {
  const a = String(left);
  const b = String(right);
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const difference = BigInt(a) - BigInt(b);
    if (difference !== 0n) return difference < 0n ? -1 : 1;
    return 0;
  }
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Deterministic ordering: distance ascending, then request id ascending.
 * Returns a new array; the input is never mutated.
 */
function selectMatches(matches) {
  const list = Array.isArray(matches) ? [...matches] : [];
  return list.sort((left, right) => {
    if (left.distance_meters !== right.distance_meters) {
      return left.distance_meters - right.distance_meters;
    }
    return compareRequestIds(left.request.id, right.request.id);
  });
}

module.exports = {
  MATCH_EXCLUSION_CODES,
  operationalLocation,
  evaluateTowMatch,
  selectMatches,
  compareRequestIds,
};
