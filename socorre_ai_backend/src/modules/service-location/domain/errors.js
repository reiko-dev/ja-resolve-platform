/**
 * SERVICE LOCATION — domain errors.
 *
 * Same envelope vocabulary as the Service Catalog and the Tow module:
 * `{ success:false, message, error:{ code, details? } }`. The HTTP layer is the
 * only place allowed to translate a domain error into a response.
 *
 * `upstream_*` codes describe the Google Places boundary:
 *   upstream_unavailable — provider timeout/network/5xx/quota, not configured
 *   upstream_rejected    — provider denied our key or answered unusably
 *   rate_limited         — OUR per-user limiter, never the provider quota
 */
'use strict';

const ERROR_STATUS = Object.freeze({
  validation_error: 422,
  not_found: 404,
  upstream_unavailable: 503,
  upstream_rejected: 502,
  rate_limited: 429,
});

const SERVICE_LOCATION_ERROR_CODES = Object.freeze(Object.keys(ERROR_STATUS));

class ServiceLocationError extends Error {
  constructor(code, message, options = {}) {
    super(message || code);
    this.name = 'ServiceLocationError';
    this.code = code;
    this.httpStatus = options.httpStatus || ERROR_STATUS[code] || 500;
    if (options.details && typeof options.details === 'object') {
      this.details = options.details;
    }
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, ServiceLocationError);
    }
  }
}

function isServiceLocationError(value) {
  return value instanceof ServiceLocationError;
}

function validationError(message, details) {
  return new ServiceLocationError('validation_error', message, { details });
}

function notFoundError(message, details) {
  return new ServiceLocationError('not_found', message, { details });
}

function upstreamUnavailableError(message, details) {
  return new ServiceLocationError('upstream_unavailable', message, { details });
}

function upstreamRejectedError(message, details) {
  return new ServiceLocationError('upstream_rejected', message, { details });
}

function rateLimitedError(message, details) {
  return new ServiceLocationError('rate_limited', message, { details });
}

module.exports = {
  ERROR_STATUS,
  SERVICE_LOCATION_ERROR_CODES,
  ServiceLocationError,
  isServiceLocationError,
  validationError,
  notFoundError,
  upstreamUnavailableError,
  upstreamRejectedError,
  rateLimitedError,
};
