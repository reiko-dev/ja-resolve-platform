/**
 * TOW ROUND — infrastructure failure type for the address resolver adapter.
 *
 * This type lives in the adapter layer on purpose: it is how the Google
 * Geocoding adapter reports *why* it could not resolve a coordinate. The
 * application layer collapses every reason into the same controlled behaviour
 * (a safe log + `formatted_address = null`), so nothing outside the adapter may
 * branch on the provider vocabulary.
 *
 * The message and `details` are deliberately free of provider payloads, keys and
 * stacks: `details` may only carry safe scalars such as an HTTP status or the
 * name of a malformed field. A geocoding failure is NEVER a Tow create failure.
 */
'use strict';

const REASONS = Object.freeze([
  // The dedicated key is absent: a configuration problem, never a request error.
  'configuration_missing',
  // Caller-side malformed coordinates: the request never reached the provider.
  'invalid_request',
  // Transient transport problems — the only reasons a short retry is allowed.
  'timeout',
  'network_failure',
  'provider_error',
  'unknown_provider_error',
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
  'unknown_provider_error',
]);

class AddressResolverError extends Error {
  constructor(reason, message, details) {
    super(message || `Address resolver failed: ${reason}`);
    this.name = 'AddressResolverError';
    this.code = 'address_resolver_error';
    this.reason = reason;
    if (details && typeof details === 'object') {
      this.details = details;
    }
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, AddressResolverError);
    }
  }
}

function isRetryableReason(reason) {
  return RETRYABLE_REASONS.includes(reason);
}

module.exports = {
  AddressResolverError,
  ADDRESS_RESOLVER_ERROR_REASONS: REASONS,
  ADDRESS_RESOLVER_RETRYABLE_REASONS: RETRYABLE_REASONS,
  isRetryableReason,
};
