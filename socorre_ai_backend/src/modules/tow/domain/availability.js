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
 *
 * SERVICE CATALOG — the lifecycle vocabulary is PLATFORM-level and owned by
 * `modules/service-catalog/domain`. Tow consumes it for `service_key=tow`; it
 * re-exports the vocabulary so the module's existing consumers keep one import
 * path, and keeps here only the Tow-specific drain policy.
 */
'use strict';

const {
  SERVICE_STATUSES,
  ACTIVE_SERVICE_STATUS,
  isServiceStatus,
  validateServiceStatus,
  serviceStatusToEnabled,
  serviceStatusOf,
} = require('../../service-catalog/domain/status');

const { TowError } = require('./errors');
const { MODULE_KEY } = require('./identity');

const GRACEFUL_DRAIN_CONTRACT = Object.freeze({
  blocksNewBusiness: true,
  preservesAdministration: true,
  drainsAssignedWork: true,
  closesUnassignedRequests: false,
  phase: 'MVP',
});

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
