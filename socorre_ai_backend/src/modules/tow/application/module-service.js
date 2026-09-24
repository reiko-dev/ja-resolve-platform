/**
 * MVP-01 — Tow module application service.
 * SERVICE CATALOG — owns the persisted registry, the canonical lifecycle status
 * and the public catalog projection. The domain's availability policy remains
 * the only decision "may new business start?".
 */
'use strict';

const {
  MODULE_KEY,
  SERVICE_KEY,
  PARTNER_TYPE,
  TowError,
  validationError,
  validateServiceStatus,
  assertModuleEnabled,
  GRACEFUL_DRAIN_CONTRACT,
} = require('../domain');

function createModuleService({ moduleRepository }) {
  if (!moduleRepository) throw new TypeError('createModuleService requires a moduleRepository port');

  async function getStatus() {
    const existing = await moduleRepository.getByKey(MODULE_KEY);
    if (existing) return existing;
    return moduleRepository.createDefault({
      module_key: MODULE_KEY,
      service_key: SERVICE_KEY,
      partner_type: PARTNER_TYPE,
      name: 'Guincho',
      status: 'ACTIVE',
      sort_order: 0,
    });
  }

  /**
   * Legacy toggle (released contract): maps `enabled` into ACTIVE/INACTIVE.
   * The reason stays mandatory exactly as the frozen operation declares.
   */
  async function setEnabled({ enabled, reason, adminUserId = null } = {}) {
    if (typeof enabled !== 'boolean') {
      throw validationError('enabled must be a boolean', { field: 'enabled' });
    }
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw validationError('reason is required', { field: 'reason' });
    }

    const current = await getStatus();
    // Idempotent: a repeated toggle never rewrites metadata nor duplicates rows.
    if (current.enabled === enabled) return current;

    return moduleRepository.setEnabled({
      key: MODULE_KEY,
      enabled,
      reason: reason.trim(),
      updatedBy: adminUserId,
    });
  }

  /**
   * The canonical lifecycle transition. A reason is required to move a service
   * AWAY from ACTIVE (the catalog shows why it is unavailable) and is cleared
   * when it becomes ACTIVE again. Idempotent: a repeated status is a read.
   */
  async function setStatus({ status, reason, adminUserId = null } = {}) {
    const next = validateServiceStatus(status);
    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if (next !== 'ACTIVE' && trimmedReason.length === 0) {
      throw validationError('reason is required', { field: 'reason' });
    }

    const current = await getStatus();
    if (current.status === next) return current;

    return moduleRepository.setStatus({
      key: MODULE_KEY,
      status: next,
      reason: trimmedReason.length === 0 ? null : trimmedReason,
      updatedBy: adminUserId,
    });
  }

  async function assertNewBusinessAllowed() {
    const status = await getStatus();
    assertModuleEnabled(status);
    return status;
  }

  async function requireById(id) {
    const status = await getStatus();
    if (String(status.id) !== String(id)) throw new TowError('not_found', 'Tow module not found');
    return status;
  }

  /**
   * The PUBLIC service catalog consumed by the apps: DELETED services are hidden
   * (they may stay in the registry for history/administration), the rest are
   * ordered by `sort_order`. `status` and `disabled_reason` are the product truth
   * — the apps never infer availability from `enabled`.
   */
  async function listCatalog() {
    // The platform's own service always exists in the catalog: this is the same
    // lazy default `getStatus` uses (migration 003 seeds the row on a real
    // database, so this only matters for a registry that was never touched).
    await getStatus();
    const rows = await moduleRepository.listServices();
    return rows
      .filter((row) => row.status !== 'DELETED')
      .map((row) => Object.freeze({
        id: String(row.id),
        name: row.name || row.service_key,
        status: row.status,
        disabled_reason: row.disabled_reason ?? null,
        sort_order: row.sort_order,
      }));
  }

  return {
    getStatus,
    setEnabled,
    setStatus,
    listCatalog,
    assertNewBusinessAllowed,
    requireById,
    gracefulDrainContract: () => GRACEFUL_DRAIN_CONTRACT,
  };
}

module.exports = { createModuleService };
