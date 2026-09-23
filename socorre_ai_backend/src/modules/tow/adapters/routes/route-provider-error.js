/**
 * MVP-02 — infrastructure failure type for the route provider adapter.
 *
 * This type lives in the adapter layer on purpose: it is how the adapter reports
 * *why* Google could not answer, and the application collapses every reason into
 * the single canonical `external_dependency_unavailable`. Nothing outside the
 * adapter may branch on `reason`.
 *
 * The message and `details` are deliberately free of provider payloads, keys and
 * stacks: `details` may only carry safe scalars such as an HTTP status or the
 * name of the leg that failed.
 */
'use strict';

const REASONS = Object.freeze([
  'configuration_missing',
  'configuration_invalid',
  // A caller-side malformed request (missing/non-numeric coordinates) is
  // reported by the validation-only fixture adapter as `invalid_request`: the
  // request never reached a provider, so no provider reason applies.
  'invalid_request',
  'timeout',
  'network_failure',
  'provider_error',
  'empty_route',
  'malformed_response',
]);

class RouteProviderError extends Error {
  constructor(reason, message, details) {
    super(message || `Route provider failed: ${reason}`);
    this.name = 'RouteProviderError';
    this.code = 'route_provider_error';
    this.reason = reason;
    if (details && typeof details === 'object') {
      this.details = details;
    }
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, RouteProviderError);
    }
  }
}

module.exports = { RouteProviderError, ROUTE_PROVIDER_ERROR_REASONS: REASONS };
