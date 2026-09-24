/**
 * TOW ROUND — Google Geocoding API adapter (reverse geocoding).
 *
 * The ONLY place in the module that knows the Google Geocoding vocabulary. It
 * receives a `{ latitude, longitude }` point and answers a provider-neutral
 * candidate — or `null` when the provider has no address for that point
 * (`NO_ADDRESS`). Formatting, S/N policy and confidence rules belong to
 * `domain/address.js`, never here.
 *
 * Verified contract (probes against Rio Branco/AC, 2026-09-23):
 *
 *   GET https://maps.googleapis.com/maps/api/geocode/json
 *       ?latlng=<lat>,<lng>&language=pt-BR&region=br&key=<server-side key>
 *
 *   response.status: OK | ZERO_RESULTS | OVER_QUERY_LIMIT | REQUEST_DENIED |
 *                    INVALID_REQUEST | UNKNOWN_ERROR
 *   response.results[0].address_components[]: { long_name, short_name, types[] }
 *   response.results[0].formatted_address
 *   response.results[0].geometry.location_type:
 *     ROOFTOP | RANGE_INTERPOLATED | GEOMETRIC_CENTER | APPROXIMATE
 *   response.results[0].partial_match
 *
 * Empirically, in Rio Branco/AC the bairro arrives as `sublocality` +
 * `sublocality_level_1` (`neighborhood` is absent) and the city arrives as
 * `administrative_area_level_2` (`locality` is absent); the UF arrives in
 * `administrative_area_level_1.short_name`. The extraction precedence below
 * encodes exactly that evidence.
 *
 * Key hygiene: this adapter reads ONLY `GOOGLE_GEOCODING_API_KEY` (or an
 * explicitly injected `apiKey`). It never falls back to `GOOGLE_ROUTES_API_KEY`,
 * `GOOGLE_MAPS_API_KEY` or any `REACT_APP_*` variable — a browser key is public
 * by construction and a Routes key is a different authorization.
 *
 * Failure policy: every failure is an `AddressResolverError` with a safe reason.
 * The application converts it into a safe log + `formatted_address = null`; a
 * geocoding failure must never block `POST /tow/requests`.
 */
'use strict';

const axios = require('axios');
const { validateGeoPoint } = require('../../domain');
const {
  AddressResolverError,
  isRetryableReason,
} = require('./address-resolver-error');

const ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';
const LANGUAGE = 'pt-BR';
const REGION = 'br';

/** Short on purpose: enrichment must never hold `POST /tow/requests` hostage. */
const DEFAULT_TIMEOUT_MS = 2000;
/** One attempt plus at most ONE short retry for a transient failure. */
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 150;

const GOOGLE_GEOCODING_KEY_VAR = 'GOOGLE_GEOCODING_API_KEY';

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/** `long_name` preferred, `short_name` as fallback (e.g. `route` abbreviations). */
function componentValue(component) {
  if (!component || typeof component !== 'object') return null;
  const value = component.long_name || component.short_name;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** First present type wins; later types are fallbacks, never overrides. */
function pickComponent(map, types) {
  for (const type of types) {
    const value = componentValue(map.get(type));
    if (value !== null) return value;
  }
  return null;
}

/** Same as `pickComponent`, but `short_name` first (the UF code). */
function pickShortComponent(map, types) {
  for (const type of types) {
    const component = map.get(type);
    if (!component) continue;
    const value = component.short_name || component.long_name;
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

/** `types[]` -> component, first occurrence wins (Google may tag duplicates). */
function componentMap(result) {
  const map = new Map();
  const components = Array.isArray(result.address_components) ? result.address_components : [];
  for (const component of components) {
    const types = Array.isArray(component && component.types) ? component.types : [];
    for (const type of types) {
      if (!map.has(type)) map.set(type, component);
    }
  }
  return map;
}

/**
 * The provider-neutral candidate. Confidence signals are carried verbatim so the
 * domain can be conservative with street/number without re-reading Google.
 */
function extractAddress(result) {
  const map = componentMap(result);
  const geometry = result.geometry && typeof result.geometry === 'object' ? result.geometry : {};

  return Object.freeze({
    // `neighborhood` is the generic type; Brazilian bairros come as sublocality
    // levels (verified in Rio Branco), so they are the documented fallbacks.
    neighborhood: pickComponent(map, ['neighborhood', 'sublocality_level_1', 'sublocality']),
    // In Brazil the município is `administrative_area_level_2`; `locality` is the
    // documented fallback for other regions.
    city: pickComponent(map, ['administrative_area_level_2', 'locality']),
    state: pickComponent(map, ['administrative_area_level_1']),
    state_code: pickShortComponent(map, ['administrative_area_level_1']),
    street: pickComponent(map, ['route']),
    number: pickComponent(map, ['street_number']),
    postal_code: pickComponent(map, ['postal_code']),
    country: pickComponent(map, ['country']),
    location_type: typeof geometry.location_type === 'string' ? geometry.location_type : null,
    partial_match: result.partial_match === true,
  });
}

/**
 * @param {object} [options]
 * @param {string} [options.apiKey] defaults to `process.env.GOOGLE_GEOCODING_API_KEY`
 * @param {{ get: Function }} [options.httpClient] injectable for tests
 * @param {string} [options.endpoint]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxAttempts]
 * @param {number} [options.retryDelayMs]
 */
function createGoogleGeocodingAdapter(options = {}) {
  const httpClient = options.httpClient || axios;
  const endpoint = options.endpoint || ENDPOINT;
  const timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
  const maxAttempts = options.maxAttempts === undefined ? DEFAULT_MAX_ATTEMPTS : options.maxAttempts;
  const retryDelayMs = options.retryDelayMs === undefined ? DEFAULT_RETRY_DELAY_MS : options.retryDelayMs;

  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('timeoutMs must be a positive integer');
  }
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 2) {
    throw new TypeError('maxAttempts must be 1 or 2 (at most one short retry)');
  }
  if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0) {
    throw new TypeError('retryDelayMs must be a non-negative integer');
  }

  // Resolved per call and never captured at construction: a missing key degrades
  // one operation (NO_ADDRESS) instead of breaking module startup.
  function resolveApiKey() {
    const apiKey = options.apiKey !== undefined ? options.apiKey : process.env[GOOGLE_GEOCODING_KEY_VAR];
    if (typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new AddressResolverError(
        'configuration_missing',
        `${GOOGLE_GEOCODING_KEY_VAR} is not configured for the address resolver`
      );
    }
    return apiKey;
  }

  function classifyTransportError(error) {
    const response = error && error.response;
    if (response) {
      const status = Number(response.status);
      if (status === 429) {
        return new AddressResolverError('quota_exceeded', 'Address provider quota was exceeded', { status });
      }
      if (status >= 500) {
        return new AddressResolverError('provider_error', 'Address provider rejected the request', { status });
      }
      // Any other HTTP rejection (401/403/400/...): retrying immediately cannot
      // fix it, so it is classified as a non-retryable denial.
      return new AddressResolverError('request_denied', 'Address provider denied the request', { status });
    }
    const code = error && error.code;
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ERR_CANCELED') {
      return new AddressResolverError('timeout', 'Address provider did not answer in time');
    }
    return new AddressResolverError('network_failure', 'Address provider could not be reached');
  }

  /**
   * `OK`/`ZERO_RESULTS` -> candidate|null; every other provider status -> a safe
   * error. `UNKNOWN_ERROR` is the only provider status allowed a short retry.
   */
  function extractOrThrow(data) {
    if (!data || typeof data !== 'object' || typeof data.status !== 'string') {
      throw new AddressResolverError('malformed_response', 'Address provider returned an unusable response', {
        field: 'status',
      });
    }

    switch (data.status) {
      case 'OK': {
        const results = Array.isArray(data.results) ? data.results : [];
        const first = results[0];
        if (!first || typeof first !== 'object') return null;
        return extractAddress(first);
      }
      case 'ZERO_RESULTS':
        return null;
      case 'OVER_QUERY_LIMIT':
        throw new AddressResolverError('quota_exceeded', 'Address provider quota was exceeded');
      case 'REQUEST_DENIED':
        throw new AddressResolverError('request_denied', 'Address provider denied the request');
      case 'INVALID_REQUEST':
        throw new AddressResolverError('invalid_provider_request', 'Address provider rejected the coordinates');
      case 'UNKNOWN_ERROR':
        throw new AddressResolverError('unknown_provider_error', 'Address provider could not process the request');
      default:
        throw new AddressResolverError('malformed_response', 'Address provider returned an unknown status', {
          field: 'status',
        });
    }
  }

  /**
   * @param {{ latitude: number, longitude: number }} point
   * @returns {Promise<object|null>} frozen candidate, or null for NO_ADDRESS
   */
  async function resolve(point = {}) {
    // Coordinates are validated before any provider call: a caller bug must not
    // be reported as a provider outage.
    let location;
    try {
      location = validateGeoPoint(point, 'location');
    } catch {
      throw new AddressResolverError('invalid_request', 'Address resolver requires a WGS84 point');
    }
    const apiKey = resolveApiKey();

    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        const response = await httpClient.get(endpoint, {
          timeout: timeoutMs,
          params: {
            latlng: `${location.latitude},${location.longitude}`,
            language: LANGUAGE,
            region: REGION,
            key: apiKey,
          },
        });
        return extractOrThrow(response && response.data);
      } catch (error) {
        const resolverError = error instanceof AddressResolverError
          ? error
          : classifyTransportError(error);
        if (!isRetryableReason(resolverError.reason) || attempt >= maxAttempts) {
          throw resolverError;
        }
        await sleep(retryDelayMs);
      }
    }
  }

  return { name: 'google-geocoding', resolve };
}

module.exports = {
  createGoogleGeocodingAdapter,
  GOOGLE_GEOCODING_ENDPOINT: ENDPOINT,
  GOOGLE_GEOCODING_KEY_VAR,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_DELAY_MS,
  // Exported for the unit suite: the extraction is the part worth pinning.
  extractAddress,
};
