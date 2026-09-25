/**
 * SERVICE LOCATION — Google Places API (New) adapter.
 *
 * The ONLY place in the platform that knows the Places (New) JSON vocabulary.
 * It speaks exactly two endpoints, and nothing else is reachable through it:
 *
 *   POST {base}/places:autocomplete   body: { input, sessionToken?, locationBias?, languageCode, regionCode }
 *   GET  {base}/places/{placeId}      params: { languageCode, regionCode, sessionToken? }
 *
 * `searchNearby`/`searchText` are deliberately NOT implemented: they would mint
 * place identity for coordinates, which the frozen architecture forbids (§9).
 *
 * Contract (Places API New, `places.googleapis.com/v1`):
 *
 *   autocomplete response.suggestions[]:
 *     placePrediction.placeId | placePrediction.place
 *     placePrediction.text.text
 *     placePrediction.structuredFormat.mainText.text
 *     placePrediction.structuredFormat.secondaryText.text
 *     queryPrediction.* -> IGNORED (not a selectable place)
 *
 *   details response: { id, displayName.text, formattedAddress, location.{latitude,longitude} }
 *
 * Field masks are minimum-viable and frozen: `displayName` is a Pro-SKU field
 * required by the explicit-place presentation rule; no `reviews`, `photos`,
 * `ratings`, `phone`, `website`, `openingHours` or `primaryType` is ever asked.
 *
 * Key hygiene: this adapter reads ONLY `GOOGLE_PLACES_API_KEY` (or an explicitly
 * injected `apiKey`). It never falls back to `GOOGLE_MAPS_API_KEY`,
 * `GOOGLE_ROUTES_API_KEY` or `GOOGLE_GEOCODING_API_KEY`. The key travels in the
 * `X-Goog-Api-Key` header and is resolved per call — a missing key degrades one
 * operation (`configuration_missing`) instead of breaking module startup.
 *
 * Failure policy: every failure is a `PlacesProviderError` with a safe reason.
 * Messages/details never carry the key, the full request URL, the provider
 * payload or the session token. Only `timeout`, `network_failure` and
 * `provider_error` are retried, at most once.
 */
'use strict';

const axios = require('axios');
const { validateGeoPoint, isOperationalGeoPoint } = require('../../domain/geo');
const {
  PlacesProviderError,
  isRetryableReason,
} = require('./places-provider-error');

const GOOGLE_PLACES_ENDPOINT_BASE = 'https://places.googleapis.com/v1';
const GOOGLE_PLACES_KEY_VAR = 'GOOGLE_PLACES_API_KEY';

const AUTOCOMPLETE_FIELD_MASK = 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text';
const PLACE_DETAILS_FIELD_MASK = 'id,displayName,formattedAddress,location';

/** Short on purpose: a search suggestion must never hold the surface hostage. */
const DEFAULT_TIMEOUT_MS = 2500;
/** One attempt plus at most ONE short retry for a transient failure. */
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 150;

const DEFAULT_LANGUAGE_CODE = 'pt-BR';
const DEFAULT_REGION_CODE = 'br';

const DEFAULT_LOCATION_BIAS_RADIUS_METERS = 50000;
const MAX_LOCATION_BIAS_RADIUS_METERS = 50000;
const MAX_INPUT_LENGTH = 200;
const MAX_PLACE_ID_LENGTH = 500;
/** Same ceiling as the domain/DB presentation fields; longer provider text is truncated, never fatal. */
const MAX_PLACE_TEXT_LENGTH = 500;
/** Google hard limit: ≤ 36 ASCII chars, URL/filename-safe base64 alphabet. */
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,36}$/;
const PLACES_RESOURCE_PREFIX = 'places/';

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function invalidRequest(message, details) {
  return new PlacesProviderError('invalid_request', message, details);
}

function malformedResponse(message, details) {
  return new PlacesProviderError('malformed_response', message, details);
}

/** `input`: required string, 1..200 chars after trim. */
function readInput(input) {
  if (typeof input !== 'string') {
    throw invalidRequest('input must be a string');
  }
  const value = input.trim();
  if (value.length < 1 || value.length > MAX_INPUT_LENGTH) {
    throw invalidRequest(`input must be 1..${MAX_INPUT_LENGTH} characters after trim`);
  }
  return value;
}

/**
 * `sessionToken` is optional and forwarded verbatim. Google hard limits are
 * enforced here so a malformed token never reaches the provider.
 */
function readSessionToken(sessionToken) {
  if (sessionToken === undefined || sessionToken === null) return null;
  if (typeof sessionToken !== 'string' || !SESSION_TOKEN_PATTERN.test(sessionToken)) {
    throw invalidRequest('sessionToken must be 1..36 URL/filename-safe base64 characters');
  }
  return sessionToken;
}

/**
 * `locationBias` is optional (a bias, never a restriction). The center goes
 * through the canonical Tow WGS84 validator — never duplicated here.
 */
function readLocationBias(locationBias) {
  if (locationBias === undefined || locationBias === null) return null;

  let center;
  try {
    center = validateGeoPoint(locationBias, 'location_bias');
  } catch {
    throw invalidRequest('location_bias must be a WGS84 point');
  }

  const rawRadius = locationBias.radius_meters;
  const radius = rawRadius === undefined ? DEFAULT_LOCATION_BIAS_RADIUS_METERS : rawRadius;
  if (!Number.isSafeInteger(radius) || radius < 1 || radius > MAX_LOCATION_BIAS_RADIUS_METERS) {
    throw invalidRequest(
      `location_bias.radius_meters must be an integer between 1 and ${MAX_LOCATION_BIAS_RADIUS_METERS}`
    );
  }

  return { latitude: center.latitude, longitude: center.longitude, radius };
}

/** `placeId`: non-empty string ≤ 500 chars; a `places/` resource prefix is stripped. */
function readPlaceId(placeId) {
  if (typeof placeId !== 'string') {
    throw invalidRequest('placeId must be a string');
  }
  const trimmed = placeId.trim();
  const bare = trimmed.startsWith(PLACES_RESOURCE_PREFIX)
    ? trimmed.slice(PLACES_RESOURCE_PREFIX.length)
    : trimmed;
  if (bare === '' || bare.length > MAX_PLACE_ID_LENGTH) {
    throw invalidRequest(`placeId must be 1..${MAX_PLACE_ID_LENGTH} characters`);
  }
  return bare;
}

/** Trimmed non-empty string or null. Provider text is presentation-only. */
function readText(container, key, maxLength) {
  if (!container || typeof container !== 'object') return null;
  const value = container[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return maxLength !== undefined && trimmed.length > maxLength
    ? trimmed.slice(0, maxLength)
    : trimmed;
}

/**
 * Optional per-call language override (IETF BCP-47-ish). Google rejects an
 * invalid `languageCode` with INVALID_ARGUMENT, so a caller bug is validated
 * here before any provider call.
 */
function readLanguageCode(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw invalidRequest('languageCode must be a string');
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 35) {
    throw invalidRequest('languageCode must be 2..35 characters');
  }
  return trimmed;
}

function readPredictionPlaceId(prediction) {
  const direct = readText(prediction, 'placeId');
  if (direct !== null) return direct;

  const resource = readText(prediction, 'place');
  if (resource === null) return null;
  const stripped = resource.startsWith(PLACES_RESOURCE_PREFIX)
    ? resource.slice(PLACES_RESOURCE_PREFIX.length)
    : resource;
  return stripped === '' ? null : stripped;
}

/**
 * Provider autocomplete payload -> `{ predictions: [...] }`.
 *
 * Only `placePrediction` entries with a placeId and a primary text survive;
 * `queryPrediction` is ignored entirely. Empty/missing suggestions are a valid
 * empty result (Places API New has no `ZERO_RESULTS` status).
 */
function normalizeSuggestions(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw malformedResponse('Places provider returned an unusable autocomplete response', { field: 'suggestions' });
  }

  const suggestions = data.suggestions;
  if (suggestions === undefined || suggestions === null) {
    return { predictions: [] };
  }
  if (!Array.isArray(suggestions)) {
    throw malformedResponse('Places provider returned an unusable autocomplete response', { field: 'suggestions' });
  }

  const predictions = [];
  for (const entry of suggestions) {
    if (!entry || typeof entry !== 'object') continue;
    const prediction = entry.placePrediction;
    // `queryPrediction` (and any other shape) is not a selectable place.
    if (!prediction || typeof prediction !== 'object') continue;

    const placeId = readPredictionPlaceId(prediction);
    if (placeId === null) continue;

    const structured = prediction.structuredFormat && typeof prediction.structuredFormat === 'object'
      ? prediction.structuredFormat
      : null;
    const primaryText = readText(structured && structured.mainText, 'text')
      ?? readText(prediction.text, 'text');
    if (primaryText === null) continue;

    predictions.push({
      placeId,
      primaryText,
      secondaryText: readText(structured && structured.secondaryText, 'text'),
    });
  }

  return { predictions };
}

/**
 * Provider details payload -> the frozen `PlaceDetailsPort` shape.
 *
 * A finite, in-range location is mandatory: without an authoritative coordinate
 * an explicit selection cannot be finalized (the text is never geocoded).
 */
function normalizePlace(data, requestedPlaceId) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw malformedResponse('Places provider returned an unusable place response', { field: 'place' });
  }

  // An explicit selection cannot be finalized without an OPERATIONAL
  // coordinate: a missing, out-of-range or (0,0) provider point is a provider
  // defect, never a client validation error (ADR §5.3).
  const location = {
    latitude: Number(data.location?.latitude),
    longitude: Number(data.location?.longitude),
  };
  if (!isOperationalGeoPoint(location)) {
    throw malformedResponse('Places provider returned a place without a usable location', { field: 'location' });
  }

  const id = readText(data, 'id');

  return {
    placeId: id === null ? requestedPlaceId : id,
    placeName: readText(data.displayName, 'text', MAX_PLACE_TEXT_LENGTH),
    formattedAddress: readText(data, 'formattedAddress', MAX_PLACE_TEXT_LENGTH),
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

/** HTTP/transport failure -> safe `PlacesProviderError` (never the raw payload). */
function classifyTransportError(error) {
  const response = error && error.response;
  if (response) {
    const status = Number(response.status);
    if (status === 400) {
      return new PlacesProviderError('invalid_provider_request', 'Places provider rejected the request', { status });
    }
    if (status === 401 || status === 403) {
      return new PlacesProviderError('request_denied', 'Places provider denied the request', { status });
    }
    if (status === 404) {
      return new PlacesProviderError('place_not_found', 'Places provider did not find the place', { status });
    }
    if (status === 429) {
      return new PlacesProviderError('quota_exceeded', 'Places provider quota was exceeded', { status });
    }
    if (status >= 500) {
      return new PlacesProviderError('provider_error', 'Places provider could not process the request', { status });
    }
    return new PlacesProviderError('request_denied', 'Places provider denied the request', { status });
  }

  const code = error && error.code;
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ERR_CANCELED') {
    return new PlacesProviderError('timeout', 'Places provider did not answer in time');
  }
  return new PlacesProviderError('network_failure', 'Places provider could not be reached');
}

/**
 * @param {object} [options]
 * @param {string} [options.apiKey] defaults to `process.env.GOOGLE_PLACES_API_KEY`
 * @param {{ post: Function, get: Function }} [options.httpClient] injectable for tests
 * @param {string} [options.endpointBase]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxAttempts] 1 or 2 (at most one short retry)
 * @param {number} [options.retryDelayMs]
 * @param {string} [options.languageCode] defaults to `pt-BR`
 * @param {string} [options.regionCode] defaults to `br`
 */
function createGooglePlacesAdapter(options = {}) {
  const httpClient = options.httpClient || axios;
  const endpointBase = options.endpointBase || GOOGLE_PLACES_ENDPOINT_BASE;
  const timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
  const maxAttempts = options.maxAttempts === undefined ? DEFAULT_MAX_ATTEMPTS : options.maxAttempts;
  const retryDelayMs = options.retryDelayMs === undefined ? DEFAULT_RETRY_DELAY_MS : options.retryDelayMs;
  const languageCodeDefault = options.languageCode === undefined ? DEFAULT_LANGUAGE_CODE : options.languageCode;
  const regionCode = options.regionCode === undefined ? DEFAULT_REGION_CODE : options.regionCode;

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
  // one operation (configuration_missing) instead of breaking module startup.
  function resolveApiKey() {
    const apiKey = options.apiKey ?? process.env[GOOGLE_PLACES_KEY_VAR];
    if (typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new PlacesProviderError(
        'configuration_missing',
        `${GOOGLE_PLACES_KEY_VAR} is not configured for the places proxy`
      );
    }
    return apiKey;
  }

  /** At most one retry, only for a retryable reason, sleeping `retryDelayMs`. */
  async function withRetry(operation) {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        return await operation();
      } catch (error) {
        const placesError = error instanceof PlacesProviderError
          ? error
          : classifyTransportError(error);
        if (!isRetryableReason(placesError.reason) || attempt >= maxAttempts) {
          throw placesError;
        }
        await sleep(retryDelayMs);
      }
    }
  }

  /**
   * @param {{ input: string, sessionToken?: string, locationBias?: object }} params
   * @returns {Promise<{ predictions: Array<{placeId: string, primaryText: string, secondaryText: string|null}> }>}
   */
  async function searchPredictions({ input, sessionToken, locationBias } = {}) {
    // Caller bugs are validated before any provider call: a bad input must not
    // be reported as a provider outage.
    const normalizedInput = readInput(input);
    const normalizedToken = readSessionToken(sessionToken);
    const bias = readLocationBias(locationBias);
    const apiKey = resolveApiKey();

    const body = {
      input: normalizedInput,
      languageCode: languageCodeDefault,
      regionCode,
    };
    if (normalizedToken !== null) body.sessionToken = normalizedToken;
    if (bias !== null) {
      body.locationBias = {
        circle: {
          center: { latitude: bias.latitude, longitude: bias.longitude },
          radius: bias.radius,
        },
      };
    }

    const response = await withRetry(() => httpClient.post(
      `${endpointBase}/places:autocomplete`,
      body,
      {
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': AUTOCOMPLETE_FIELD_MASK,
        },
      }
    ));

    return normalizeSuggestions(response && response.data);
  }

  /**
   * @param {{ placeId: string, sessionToken?: string, languageCode?: string }} params
   * @returns {Promise<{ placeId: string, placeName: string|null, formattedAddress: string|null, latitude: number, longitude: number }>}
   */
  async function getPlace({ placeId, sessionToken, languageCode } = {}) {
    const normalizedPlaceId = readPlaceId(placeId);
    const normalizedToken = readSessionToken(sessionToken);
    const effectiveLanguageCode = readLanguageCode(languageCode) || languageCodeDefault;
    const apiKey = resolveApiKey();

    const params = { languageCode: effectiveLanguageCode, regionCode };
    if (normalizedToken !== null) params.sessionToken = normalizedToken;

    const response = await withRetry(() => httpClient.get(
      `${endpointBase}/places/${encodeURIComponent(normalizedPlaceId)}`,
      {
        timeout: timeoutMs,
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': PLACE_DETAILS_FIELD_MASK,
        },
        params,
      }
    ));

    return normalizePlace(response && response.data, normalizedPlaceId);
  }

  return { name: 'google-places', searchPredictions, getPlace };
}

module.exports = {
  createGooglePlacesAdapter,
  GOOGLE_PLACES_ENDPOINT_BASE,
  GOOGLE_PLACES_KEY_VAR,
  AUTOCOMPLETE_FIELD_MASK,
  PLACE_DETAILS_FIELD_MASK,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_DELAY_MS,
  // Exported for the unit suite: the normalization is the part worth pinning.
  normalizeSuggestions,
  normalizePlace,
};
