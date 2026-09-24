/**
 * Tow address resolver kind — reverse geocoding is OPTIONAL enrichment.
 *
 * The resolver is OFF by default (`TOW_ADDRESS_RESOLVER=none`): the create path
 * must never gain a network dependency by accident, and the deterministic test
 * harness must never call Google. Production/validation that wants the backend
 * fallback sets `TOW_ADDRESS_RESOLVER=google` explicitly.
 *
 * Key hygiene: the Google Geocoding adapter reads ONLY
 * `GOOGLE_GEOCODING_API_KEY`. This module refuses `google` without that key at
 * startup (fail-fast configuration error) instead of silently falling back to
 * `GOOGLE_ROUTES_API_KEY`, `GOOGLE_MAPS_API_KEY` or any `REACT_APP_*` variable —
 * a browser key is public by construction and a Routes key is a different
 * authorization.
 *
 * This startup guard is deliberately different from a runtime provider failure:
 *
 *   - misconfiguration (`google` without a key) fails FAST at boot, so an
 *     operator cannot believe the fallback is active when it is not;
 *   - a provider failure at runtime (timeout, quota, 5xx, ZERO_RESULTS) is
 *     swallowed by the application, logged with a safe reason, and the Tow is
 *     created normally with `formatted_address = null`.
 */
'use strict';

const TOW_ADDRESS_RESOLVER_VAR = 'TOW_ADDRESS_RESOLVER';
const TOW_ADDRESS_RESOLVER_KINDS = Object.freeze(['google', 'none']);
const DEFAULT_KIND = 'none';
const GOOGLE_GEOCODING_KEY_VAR = 'GOOGLE_GEOCODING_API_KEY';

function readConfiguredKind(env) {
  const raw = env ? env[TOW_ADDRESS_RESOLVER_VAR] : undefined;
  if (raw === undefined || raw === null) return DEFAULT_KIND;
  const value = String(raw).trim();
  return value === '' ? DEFAULT_KIND : value;
}

function hasEffectiveValue(env, key) {
  const value = env ? env[key] : undefined;
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Resolves `TOW_ADDRESS_RESOLVER` from the environment.
 *
 * Allowed values are exactly `google` and `none` (default when unset or empty).
 * Any other value throws — a typo must never disable the resolver silently.
 *
 * @param {object} [env] environment map, defaults to `process.env`
 * @returns {'google'|'none'}
 */
function resolveTowAddressResolverKind(env = process.env) {
  const kind = readConfiguredKind(env);
  if (!TOW_ADDRESS_RESOLVER_KINDS.includes(kind)) {
    const error = new Error(
      `${TOW_ADDRESS_RESOLVER_VAR}="${kind}" is not a Tow address resolver; allowed values are ${TOW_ADDRESS_RESOLVER_KINDS.join(', ')}`
    );
    error.code = 'TOW_ADDRESS_RESOLVER_INVALID';
    throw error;
  }
  return kind;
}

/**
 * Resolves the kind and refuses `google` without its dedicated key.
 *
 * The key is never read from another variable: an explicit `google` without
 * `GOOGLE_GEOCODING_API_KEY` is a configuration error (fail-fast), not a silent
 * degradation to a different credential.
 *
 * @param {object} [env] environment map, defaults to `process.env`
 * @returns {'google'|'none'}
 */
function assertTowAddressResolverSafe(env = process.env) {
  const kind = resolveTowAddressResolverKind(env);
  if (kind === 'google' && !hasEffectiveValue(env, GOOGLE_GEOCODING_KEY_VAR)) {
    const error = new Error(
      `${TOW_ADDRESS_RESOLVER_VAR}=google requires ${GOOGLE_GEOCODING_KEY_VAR}; `
        + 'the address resolver never falls back to GOOGLE_ROUTES_API_KEY, GOOGLE_MAPS_API_KEY or REACT_APP_* keys'
    );
    error.code = 'TOW_ADDRESS_RESOLVER_KEY_MISSING';
    throw error;
  }
  return kind;
}

module.exports = {
  TOW_ADDRESS_RESOLVER_VAR,
  TOW_ADDRESS_RESOLVER_KINDS,
  DEFAULT_TOW_ADDRESS_RESOLVER_KIND: DEFAULT_KIND,
  GOOGLE_GEOCODING_KEY_VAR,
  resolveTowAddressResolverKind,
  assertTowAddressResolverSafe,
};
