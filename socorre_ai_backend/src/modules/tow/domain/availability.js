/**
 * MVP-01 — Tow module availability policy.
 *
 * The single domain decision "may new business start?" consumed by later MVP
 * deliveries. MVP semantics are exactly:
 *
 *   disabled = stop NEW business
 *            + preserve partner/vehicle/document administration
 *            + allow already-ASSIGNED work to drain
 *
 * Advanced SEARCHING/NEGOTIATING shutdown and disable-vs-assignment races are
 * Phase 2 (#33) and are deliberately not implemented here.
 */
'use strict';

const { TowError, validationError } = require('./errors');
const { MODULE_KEY } = require('./identity');

const GRACEFUL_DRAIN_CONTRACT = Object.freeze({
  blocksNewBusiness: true,
  preservesAdministration: true,
  drainsAssignedWork: true,
  closesUnassignedRequests: false,
  phase: 'MVP',
});

/**
 * SERVICE CATALOG — the canonical lifecycle of a platform service.
 *
 *   ACTIVE    visible in the catalog, may start new requests
 *   INACTIVE  visible in the catalog, temporarily unavailable, blocks new requests
 *   SOON      visible in the catalog, not launched yet, blocks new requests
 *   DELETED   hidden from the public catalog, blocks new requests
 *
 * This is the PRODUCT lifecycle of the service offered by the platform. It is
 * deliberately NOT partner online/offline, partner available/unavailable, or a
 * request state.
 *
 * `status` is the authority. The legacy `enabled` boolean is a derived
 * compatibility projection kept in sync by the repository; when a caller passes
 * only `enabled` (an old reader), the status is inferred from it.
 */
const SERVICE_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE', 'SOON', 'DELETED']);
const ACTIVE_SERVICE_STATUS = 'ACTIVE';

function isServiceStatus(value) {
  return typeof value === 'string' && SERVICE_STATUSES.includes(value);
}

/** Validates a requested status, throwing the canonical 422 when unknown. */
function validateServiceStatus(value) {
  if (!isServiceStatus(value)) {
    throw validationError(`status must be one of ${SERVICE_STATUSES.join(', ')}`, { field: 'status' });
  }
  return value;
}

/** The derived legacy projection: only ACTIVE means "new business allowed". */
function serviceStatusToEnabled(status) {
  return status === ACTIVE_SERVICE_STATUS;
}

/** The status of a registry row, with the legacy `enabled` fallback. */
function serviceStatusOf(moduleStatus) {
  if (moduleStatus && isServiceStatus(moduleStatus.status)) return moduleStatus.status;
  if (moduleStatus && moduleStatus.enabled === true) return ACTIVE_SERVICE_STATUS;
  return 'INACTIVE';
}

function isModuleEnabled(moduleStatus) {
  return serviceStatusOf(moduleStatus) === ACTIVE_SERVICE_STATUS;
}

/**
 * The single decision "may NEW business start?".
 *
 * Every non-ACTIVE status blocks it with the established
 * `service_module_disabled` (409) — the code the frozen contract already
 * publishes — and carries the precise catalog status in `details` so a consumer
 * can distinguish INACTIVE / SOON / DELETED without a new error vocabulary.
 */
function assertModuleEnabled(moduleStatus, message) {
  if (!isModuleEnabled(moduleStatus)) {
    throw new TowError('service_module_disabled', message || 'Tow module is disabled', {
      details: { module_key: MODULE_KEY, status: serviceStatusOf(moduleStatus) },
    });
  }
  return true;
}

module.exports = {
  GRACEFUL_DRAIN_CONTRACT,
  SERVICE_STATUSES,
  ACTIVE_SERVICE_STATUS,
  isServiceStatus,
  validateServiceStatus,
  serviceStatusToEnabled,
  serviceStatusOf,
  isModuleEnabled,
  assertModuleEnabled,
};
