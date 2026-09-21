/**
 * MVP-01 — Tow domain errors.
 *
 * A single error type carries the canonical `error.code` of the composed
 * contract and the HTTP status policy of `TOW-API-CONTRACT.md` §2.8. The HTTP
 * layer is the only place allowed to translate it into a response envelope.
 */
'use strict';

const { MODULE_KEY } = require('./identity');

const ERROR_STATUS = Object.freeze({
  service_module_disabled: 409,
  validation_error: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  // MVP-03 — the frozen `Idempotency-Key` replay conflict ("same key, different
  // payload") and the owner-only read guard of `GET /tow/requests/{requestId}`.
  idempotency_conflict: 409,
  not_request_owner: 403,
  partner_not_operational: 409,
  vehicle_not_operational: 409,
  tow_document_required: 409,
  tow_document_not_approved: 409,
  vehicle_not_compatible: 409,
  external_dependency_unavailable: 503,
  // MVP-04 — the proposal lifecycle and the atomic assignment. All four are
  // domain CONFLICTS: the caller's intent was well-formed, the resource exists,
  // and the state of the world says no. `request_already_assigned` is also the
  // backstop of the `tow_assignments.tow_request_id` UNIQUE constraint, so a
  // losing concurrent accept reports the same code as a sequential one.
  proposal_already_active: 409,
  proposal_expired: 409,
  proposal_not_actionable: 409,
  request_already_assigned: 409,
  // MVP-05 — service execution, tracking and cancellation. `invalid_tow_state`
  // is "this request cannot do that at all in its current state" (a terminal
  // request accepts no tracking write), while `invalid_tow_transition` names the
  // illegal EDGE (`from` → `to`), so a client can tell a wrong-order call from a
  // call against a finished job. `not_assigned_partner` is the execution-side
  // sibling of `not_request_owner`: the caller is a valid tow partner, just not
  // the one holding this job. `stale_tracking_update` is a conflict by
  // construction — the point is well-formed but older than the stored one, and
  // accepting it would move the customer's map backwards.
  invalid_tow_state: 409,
  invalid_tow_transition: 409,
  not_assigned_partner: 403,
  stale_tracking_update: 409,
});

const TOW_ERROR_CODES = Object.freeze(Object.keys(ERROR_STATUS));

class TowError extends Error {
  constructor(code, message, options = {}) {
    super(message || code);
    this.name = 'TowError';
    this.code = code;
    this.httpStatus = options.httpStatus || ERROR_STATUS[code] || 500;
    if (options.details && typeof options.details === 'object') {
      this.details = options.details;
    }
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, TowError);
    }
  }
}

function isTowError(value) {
  return value instanceof TowError;
}

function validationError(message, details) {
  return new TowError('validation_error', message, { details });
}

/**
 * MVP-02 — the canonical failure for an external provider the module depends on
 * (the route provider today). The message is deliberately generic and carries no
 * `details`: a provider failure must never leak a key, a raw payload or an
 * internal stack to the caller. Callers must never substitute an estimate.
 */
function externalDependencyError(message) {
  return new TowError('external_dependency_unavailable', message || 'External dependency is unavailable');
}

module.exports = {
  ERROR_STATUS,
  TOW_ERROR_CODES,
  TowError,
  isTowError,
  validationError,
  externalDependencyError,
  MODULE_KEY,
};
