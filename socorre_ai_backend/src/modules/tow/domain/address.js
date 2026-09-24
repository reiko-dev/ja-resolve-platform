/**
 * TOW ROUND — address normalization and deterministic formatting (domain).
 *
 * The address resolver adapter hands over a provider-neutral candidate
 * (`street`, `number`, `neighborhood`, `city`, `state`, `state_code`,
 * `postal_code`, `country`) plus the provider's confidence signals
 * (`location_type`, `partial_match`). This file owns the PRODUCT rules:
 *
 *   1. normalization — every component is trimmed, internal whitespace is
 *      collapsed, and `null`/`""`/`"   "` are all equivalent to absent;
 *   2. confidence policy — a low-confidence answer never contributes
 *      street/number, and `S/N` is only inferred from a high-confidence answer;
 *   3. deduplication — a component repeated by the provider is emitted once;
 *   4. the deterministic formatter (rules A–J) — the same components always
 *      produce the same string, on every client and every read;
 *   5. `NO_ADDRESS` — when nothing useful exists the answer is `null`, never a
 *      coordinate string.
 *
 * Pure domain: no HTTP, no environment, no clock, no randomness.
 *
 * Provider evidence used for the precedence (Rio Branco/AC probes, 2026-09-23):
 * bairro arrives as `sublocality`/`sublocality_level_1` (`neighborhood` absent),
 * city as `administrative_area_level_2` (`locality` absent) and the UF as
 * `administrative_area_level_1.short_name`. The adapter applies that precedence
 * and this file only formats what it receives.
 */
'use strict';

/** Same ceiling as `tow_requests.*_formatted_address` (VARCHAR(500)). */
const MAX_FORMATTED_ADDRESS_LENGTH = 500;

const HIGH_CONFIDENCE_LOCATION_TYPES = Object.freeze(['ROOFTOP', 'RANGE_INTERPOLATED']);
const LOW_CONFIDENCE_LOCATION_TYPES = Object.freeze(['APPROXIMATE', 'GEOMETRIC_CENTER']);

function clean(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed === '' ? null : trimmed;
}

function sameText(a, b) {
  return a !== null && b !== null && a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR');
}

/**
 * Confidence of a provider answer.
 *
 *   low      — `partial_match` or APPROXIMATE/GEOMETRIC_CENTER: `S/N` is never
 *              inferred. APPROXIMATE/partial_match additionally discard
 *              street/number (the point itself is uncertain) and keep only
 *              territorial components; GEOMETRIC_CENTER keeps a real street but
 *              claims nothing about its number;
 *   high     — ROOFTOP/RANGE_INTERPOLATED: full rules, including `S/N`;
 *   unknown  — no `location_type` at all: the components are real (they are used)
 *              but no precision claim is made, so `S/N` is never inferred.
 */
function confidenceOf(address) {
  if (address.partial_match === true) return 'low';
  if (LOW_CONFIDENCE_LOCATION_TYPES.includes(address.location_type)) return 'low';
  if (HIGH_CONFIDENCE_LOCATION_TYPES.includes(address.location_type)) return 'high';
  return 'unknown';
}

/**
 * @param {object|null} candidate provider-neutral components + confidence
 * @returns {object|null} frozen, normalized copy, or null when unusable
 */
function normalizeResolvedAddress(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;

  return Object.freeze({
    street: clean(candidate.street),
    number: clean(candidate.number),
    neighborhood: clean(candidate.neighborhood),
    city: clean(candidate.city),
    state: clean(candidate.state),
    state_code: clean(candidate.state_code),
    postal_code: clean(candidate.postal_code),
    country: clean(candidate.country),
    location_type: clean(candidate.location_type),
    partial_match: candidate.partial_match === true,
  });
}

/**
 * The deterministic `formatted_address` of a resolved candidate.
 *
 * Rules (exact output):
 *   A  street + number + neighborhood     "Rua X, 125 - Bairro"
 *   B  street + neighborhood (no number)  "Rua X, S/N - Bairro"
 *   C  street + number                    "Rua X, 125"
 *   D  street only                        "Rua X, S/N"
 *   E  neighborhood + city + state        "Bairro - Cidade, UF"
 *   F  neighborhood only                  "Bairro"
 *   G  city + state                       "Cidade - UF"
 *   H  city only                          "Cidade"
 *   I  state only                         "UF" (long name as fallback)
 *   J  nothing useful                     null
 *
 * `S/N` means exactly one thing: the geocoding succeeded, a street exists and
 * the provider returned no `street_number` — with high confidence. A failed or
 * low-confidence answer never produces `S/N`, and coordinates are never used.
 *
 * @param {object|null} candidate
 * @returns {string|null}
 */
function formatResolvedAddress(candidate) {
  const address = normalizeResolvedAddress(candidate);
  if (!address) return null;

  const confidence = confidenceOf(address);
  // APPROXIMATE / partial_match: the point itself is uncertain, so the street is
  // not presented as if it were the exact place — territorial components only.
  // GEOMETRIC_CENTER (and unknown confidence) keeps a real street but never
  // claims `S/N`, because the absence of a number is not evidence there.
  const dropStreet = address.partial_match === true || address.location_type === 'APPROXIMATE';

  const street = dropStreet ? null : address.street;
  const number = dropStreet ? null : address.number;
  let neighborhood = address.neighborhood;
  let city = address.city;
  const state = address.state_code || address.state;

  // Deduplication: never emit the same text twice ("Rio Branco - Rio Branco, AC").
  if (sameText(neighborhood, city)) neighborhood = null;
  if (sameText(neighborhood, street)) neighborhood = null;
  if (sameText(city, address.state)) city = null;

  let formatted = null;

  if (street) {
    const snAllowed = confidence === 'high';
    if (number) {
      formatted = `${street}, ${number}`;
    } else if (snAllowed) {
      formatted = `${street}, S/N`;
    } else {
      // Unknown confidence with no number: keep the real street, claim nothing.
      formatted = street;
    }
    if (neighborhood) formatted = `${formatted} - ${neighborhood}`;
  } else if (neighborhood && city && state) {
    formatted = `${neighborhood} - ${city}, ${state}`;
  } else if (neighborhood && city) {
    formatted = `${neighborhood} - ${city}`;
  } else if (neighborhood) {
    formatted = neighborhood;
  } else if (city && state) {
    formatted = `${city} - ${state}`;
  } else if (city) {
    formatted = city;
  } else if (state) {
    formatted = state;
  }

  if (formatted === null) return null;
  // Defensive cap: the value is persisted in a VARCHAR(500) column.
  return formatted.length > MAX_FORMATTED_ADDRESS_LENGTH
    ? formatted.slice(0, MAX_FORMATTED_ADDRESS_LENGTH)
    : formatted;
}

module.exports = {
  MAX_FORMATTED_ADDRESS_LENGTH,
  HIGH_CONFIDENCE_LOCATION_TYPES,
  LOW_CONFIDENCE_LOCATION_TYPES,
  confidenceOf,
  normalizeResolvedAddress,
  formatResolvedAddress,
};
