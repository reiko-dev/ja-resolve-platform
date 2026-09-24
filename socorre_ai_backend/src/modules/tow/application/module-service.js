/**
 * MVP-01 — Tow module application service.
 *
 * SERVICE CATALOG — the registry, the lifecycle status and the public catalog
 * are PLATFORM-level and owned by `modules/service-catalog`. This service is
 * the Tow module's consumption seam for `service_key=tow`: it keeps the frozen
 * Tow surface (module status, legacy toggle, public catalog projection) while
 * every read/write is delegated to the platform catalog, so there is exactly
 * one authority and one writer.
 *
 * Every platform failure is translated into the Tow error vocabulary so the
 * released `error.code` envelope of the Tow endpoints does not change.
 */
'use strict';

const {
  MODULE_KEY,
  TowError,
  validationError,
  validateServiceStatus,
  assertModuleEnabled,
  GRACEFUL_DRAIN_CONTRACT,
} = require('../domain');

/** Translate a platform catalog error into the frozen Tow error vocabulary. */
function toTowError(error) {
  if (error instanceof TowError) return error;
  if (error && typeof error.code === 'string') {
    return new TowError(error.code, error.message, { details: error.details });
  }
  return error;
}

function createModuleService({ catalogService }) {
  if (!catalogService) throw new TypeError('createModuleService requires a catalogService port');

  /** The Tow registry row; lazily created exactly as before. */
  async function getStatus() {
    return catalogService.ensureService(MODULE_KEY);
  }

  /**
   * Legacy toggle (released contract): maps `enabled` into ACTIVE/INACTIVE.
   * The reason stays mandatory exactly as the frozen operation declares.
   */
  async function setEnabled({ enabled, reason, adminUserId = null } = {}) {
    try {
      if (typeof enabled !== 'boolean') {
        throw validationError('enabled must be a boolean', { field: 'enabled' });
      }
      if (typeof reason !== 'string' || reason.trim().length === 0) {
        throw validationError('reason is required', { field: 'reason' });
      }

      const current = await getStatus();
      // Idempotent: a repeated toggle never rewrites metadata nor duplicates rows.
      if (current.enabled === enabled) return current;

      return await catalogService.setEnabled({
        key: MODULE_KEY,
        enabled,
        reason: reason.trim(),
        updatedBy: adminUserId,
      });
    } catch (error) {
      throw toTowError(error);
    }
  }

  /**
   * The canonical lifecycle transition for Tow. A reason is required to move
   * AWAY from ACTIVE and is cleared when it becomes ACTIVE again. Idempotent:
   * a repeated status is a read.
   */
  async function setStatus({ status, reason, adminUserId = null } = {}) {
    try {
      const next = validateServiceStatus(status);
      const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
      if (next !== 'ACTIVE' && trimmedReason.length === 0) {
        throw validationError('reason is required', { field: 'reason' });
      }

      const current = await getStatus();
      if (current.status === next) return current;

      return await catalogService.setStatus({
        key: MODULE_KEY,
        status: next,
        reason: trimmedReason.length === 0 ? null : trimmedReason,
        updatedBy: adminUserId,
      });
    } catch (error) {
      throw toTowError(error);
    }
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
   * COMPATIBILITY projection of the platform catalog for `GET /tow/services`.
   * The canonical catalog is `GET /api/service-catalog`; this path is kept so
   * released mobile builds keep working, and it exposes the same items plus the
   * stable `key` (additive).
   */
  async function listCatalog() {
    await getStatus();
    const rows = await catalogService.listCatalog();
    return rows.map((row) => Object.freeze({
      id: String(row.id),
      key: row.key,
      name: row.name || row.key,
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
