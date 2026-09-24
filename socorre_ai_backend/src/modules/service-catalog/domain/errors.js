/**
 * PLATFORM SERVICE CATALOG — domain errors.
 *
 * A module-local error type carrying the canonical `error.code` of the composed
 * contract envelope `{success:false, message, error:{code, details?}}`. The HTTP
 * layer is the only place allowed to translate it into a response.
 *
 * The codes are the platform vocabulary already published by the Tow contract
 * (`validation_error`, `not_found`, `conflict`), so a platform catalog failure
 * keeps the same machine-readable shape consumers already handle.
 */
'use strict';

const ERROR_STATUS = Object.freeze({
  validation_error: 422,
  not_found: 404,
  conflict: 409,
});

const CATALOG_ERROR_CODES = Object.freeze(Object.keys(ERROR_STATUS));

class ServiceCatalogError extends Error {
  constructor(code, message, options = {}) {
    super(message || code);
    this.name = 'ServiceCatalogError';
    this.code = code;
    this.httpStatus = options.httpStatus || ERROR_STATUS[code] || 500;
    if (options.details && typeof options.details === 'object') {
      this.details = options.details;
    }
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, ServiceCatalogError);
    }
  }
}

function isServiceCatalogError(value) {
  return value instanceof ServiceCatalogError;
}

function validationError(message, details) {
  return new ServiceCatalogError('validation_error', message, { details });
}

function notFoundError(message, details) {
  return new ServiceCatalogError('not_found', message, { details });
}

function conflictError(message, details) {
  return new ServiceCatalogError('conflict', message, { details });
}

module.exports = {
  ERROR_STATUS,
  CATALOG_ERROR_CODES,
  ServiceCatalogError,
  isServiceCatalogError,
  validationError,
  notFoundError,
  conflictError,
};
