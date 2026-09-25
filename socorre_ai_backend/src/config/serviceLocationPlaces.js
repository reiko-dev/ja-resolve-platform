/**
 * Service location places kind — Google Places (New) is the only backend Places
 * implementation, and it is OPTIONAL.
 *
 * The proxy is OFF by default (`SERVICE_LOCATION_PLACES=none`): the search
 * surface must never gain a network dependency by accident and the deterministic
 * test harness must never call Google. Production/validation that wants the
 * backend proxy sets `SERVICE_LOCATION_PLACES=google` explicitly.
 *
 * Key hygiene: the Google Places adapter reads ONLY `GOOGLE_PLACES_API_KEY`.
 * This module refuses `google` without that key at startup (fail-fast
 * configuration error) instead of silently falling back to
 * `GOOGLE_MAPS_API_KEY`, `GOOGLE_ROUTES_API_KEY` or
 * `GOOGLE_GEOCODING_API_KEY` — a browser key is public by construction, a Routes
 * key is a different authorization and the Geocoding key is a different SKU.
 *
 * This startup guard is deliberately different from a runtime provider failure:
 *
 *   - misconfiguration (`google` without a key) fails FAST at boot, so an
 *     operator cannot believe the proxy is active when it is not;
 *   - a provider failure at runtime (timeout, quota, 5xx, denial) is translated
 *     by `http/error-mapper.js` into the frozen error envelope and the search
 *     surface retries; the backend never invents suggestions.
 */
'use strict';

const SERVICE_LOCATION_PLACES_VAR = 'SERVICE_LOCATION_PLACES';
const SERVICE_LOCATION_PLACES_KINDS = Object.freeze(['none', 'google']);
const DEFAULT_SERVICE_LOCATION_PLACES_KIND = 'none';
const GOOGLE_PLACES_KEY_VAR = 'GOOGLE_PLACES_API_KEY';

function readConfiguredKind(env) {
  const raw = env ? env[SERVICE_LOCATION_PLACES_VAR] : undefined;
  if (raw === undefined || raw === null) return DEFAULT_SERVICE_LOCATION_PLACES_KIND;
  const value = String(raw).trim();
  return value === '' ? DEFAULT_SERVICE_LOCATION_PLACES_KIND : value;
}

function hasEffectiveValue(env, key) {
  const value = env ? env[key] : undefined;
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Resolves `SERVICE_LOCATION_PLACES` from the environment.
 *
 * Allowed values are exactly `none` (the default when unset or empty) and
 * `google`. Any other value throws — a typo must never disable the proxy
 * silently nor enable it by accident.
 *
 * @param {object} [env] environment map, defaults to `process.env`
 * @returns {'none'|'google'}
 */
function resolveServiceLocationPlacesKind(env = process.env) {
  const kind = readConfiguredKind(env);
  if (!SERVICE_LOCATION_PLACES_KINDS.includes(kind)) {
    const error = new Error(
      `${SERVICE_LOCATION_PLACES_VAR}="${kind}" is not a service location places provider; allowed values are ${SERVICE_LOCATION_PLACES_KINDS.join(', ')}`
    );
    error.code = 'SERVICE_LOCATION_PLACES_INVALID';
    throw error;
  }
  return kind;
}

/**
 * Resolves the kind and refuses `google` without its dedicated key.
 *
 * The key is never read from another variable: an explicit `google` without
 * `GOOGLE_PLACES_API_KEY` is a configuration error (fail-fast), not a silent
 * degradation to a different credential. `none` never demands a key.
 *
 * @param {object} [env] environment map, defaults to `process.env`
 * @returns {'none'|'google'}
 */
function assertServiceLocationPlacesSafe(env = process.env) {
  const kind = resolveServiceLocationPlacesKind(env);
  if (kind === 'google' && !hasEffectiveValue(env, GOOGLE_PLACES_KEY_VAR)) {
    const error = new Error(
      `${SERVICE_LOCATION_PLACES_VAR}=google requires ${GOOGLE_PLACES_KEY_VAR}; `
        + 'the places proxy never falls back to GOOGLE_MAPS_API_KEY, GOOGLE_ROUTES_API_KEY or GOOGLE_GEOCODING_API_KEY'
    );
    error.code = 'SERVICE_LOCATION_PLACES_KEY_MISSING';
    throw error;
  }
  return kind;
}

module.exports = {
  SERVICE_LOCATION_PLACES_VAR,
  SERVICE_LOCATION_PLACES_KINDS,
  DEFAULT_SERVICE_LOCATION_PLACES_KIND,
  GOOGLE_PLACES_KEY_VAR,
  resolveServiceLocationPlacesKind,
  assertServiceLocationPlacesSafe,
};
