/**
 * PLATFORM SERVICE CATALOG — the canonical lifecycle vocabulary.
 *
 *   ACTIVE    visible in the catalog, may start new business
 *   INACTIVE  visible in the catalog, temporarily unavailable, blocks new business
 *   SOON      visible in the catalog, not launched yet, blocks new business
 *   DELETED   hidden from the public catalog (kept for history/administration),
 *             blocks new business
 *
 * This vocabulary is PLATFORM-level: it describes the product lifecycle of a
 * service the platform offers, never a partner online/offline flag and never a
 * request state. The Tow module consumes it for `service_key=tow`; it does not
 * own it.
 *
 * `status` is the authority. The legacy `enabled` boolean is a derived
 * compatibility projection (`ACTIVE => true`) kept in sync by the repository.
 */
'use strict';

const { validationError } = require('./errors');

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
function serviceStatusOf(row) {
  if (row && isServiceStatus(row.status)) return row.status;
  if (row && row.enabled === true) return ACTIVE_SERVICE_STATUS;
  return 'INACTIVE';
}

function isServiceActive(row) {
  return serviceStatusOf(row) === ACTIVE_SERVICE_STATUS;
}

module.exports = {
  SERVICE_STATUSES,
  ACTIVE_SERVICE_STATUS,
  isServiceStatus,
  validateServiceStatus,
  serviceStatusToEnabled,
  serviceStatusOf,
  isServiceActive,
};
