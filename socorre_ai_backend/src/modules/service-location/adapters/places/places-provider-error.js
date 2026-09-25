/**
 * SERVICE LOCATION — infrastructure failure type for the Places provider adapter.
 *
 * This type lives in the adapter layer on purpose: it is how the Google Places
 * (New) adapter reports *why* it could not answer a search or details request.
 * The application layer collapses every reason into the frozen HTTP envelope
 * (`http/error-mapper.js`), so nothing outside the adapter may branch on the
 * provider vocabulary.
 *
 * The message and `details` are deliberately free of provider payloads, keys and
 * session tokens: `details` may only carry safe scalars such as an HTTP status
 * or the name of a malformed field (non-scalars are dropped defensively). A
 * Places failure is never a ServiceLocation failure by itself.
 */
'use strict';

const REASONS = Object.freeze([
  // The dedicated key is absent: a configuration problem, never a request error.
  'configuration_missing',
  // Caller-side malformed input: the request never reached the provider.
  'invalid_request',
  // The provider answered, but the named place does not exist (or is obsolete).
  'place_not_found',
  // Transient transport problems — the only reasons a short retry is allowed.
  'timeout',
  'network_failure',
  'provider_error',
  // Provider answers that an immediate retry cannot fix.
  'quota_exceeded',
  'request_denied',
  'invalid_provider_request',
  // The provider answered, but the payload was unusable.
  'malformed_response',
]);

/** Reasons a single short retry is allowed to attempt. */
const RETRYABLE_REASONS = Object.freeze([
  'timeout',
  'network_failure',
  'provider_error',
]);

/** `details` is for safe scalars only; objects, arrays and payloads are dropped. */
function sanitizeDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const safe = {};
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
    }
  }
  return Object.keys(safe).length === 0 ? null : Object.freeze(safe);
}

class PlacesProviderError extends Error {
  constructor(reason, message, details) {
    super(message || `Places provider failed: ${reason}`);
    this.name = 'PlacesProviderError';
    this.code = 'places_provider_error';
    this.reason = reason;
    const safeDetails = sanitizeDetails(details);
    if (safeDetails) {
      this.details = safeDetails;
    }
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, PlacesProviderError);
    }
  }
}

function isRetryableReason(reason) {
  return RETRYABLE_REASONS.includes(reason);
}

module.exports = {
  PlacesProviderError,
  PLACES_PROVIDER_ERROR_REASONS: REASONS,
  PLACES_PROVIDER_RETRYABLE_REASONS: RETRYABLE_REASONS,
  isRetryableReason,
};
