/**
 * PLATFORM SERVICE CATALOG — application service.
 *
 * Owns the persisted platform registry, the canonical lifecycle status and the
 * public/admin projections. There is exactly one writer (`setStatus`) and one
 * authority (`status`); every other surface is a read.
 *
 * Semantics:
 *   - `listCatalog()` is the PUBLIC catalog: a SUCCESSFUL response is the
 *     authoritative, complete catalog. `DELETED` services are omitted; absence
 *     therefore means "not part of the public catalog" and a consumer must not
 *     substitute a local default.
 *   - `ensureService(key)` lazily creates the registry row for an INITIAL
 *     service key that is missing (the same lazy default the Tow module always
 *     had for `tow`). It never resets an existing row.
 *   - `ensureInitialServices()` is the idempotent provisioning path used by
 *     migration 010; it only inserts missing rows.
 *   - `setStatus` requires a reason to move away from ACTIVE, clears it on
 *     ACTIVE, and is idempotent: a repeated status is a read.
 */
'use strict';

const {
  SERVICE_STATUSES,
  validateServiceStatus,
  serviceStatusToEnabled,
  initialServiceByKey,
  INITIAL_SERVICES,
  notFoundError,
  validationError,
} = require('../domain');

/** The public catalog item shape. `key` is the stable identity. */
function toPublicItem(row) {
  return Object.freeze({
    id: String(row.id),
    key: row.key,
    name: row.name || row.service_key || row.key,
    status: row.status,
    disabled_reason: row.disabled_reason ?? null,
    sort_order: row.sort_order,
  });
}

/** The admin view: every row, DELETED included (administration needs history). */
function toAdminItem(row) {
  return Object.freeze({
    ...toPublicItem(row),
    enabled: row.enabled === true,
    updated_by: row.updated_by ?? null,
    updated_at: row.updated_at ?? null,
  });
}

function createCatalogService({ catalogRepository }) {
  if (!catalogRepository) throw new TypeError('createCatalogService requires a catalogRepository port');

  async function getService(key) {
    return catalogRepository.getByKey(key);
  }

  async function ensureService(key) {
    const existing = await getService(key);
    if (existing) return existing;
    const initial = initialServiceByKey(key);
    if (!initial) {
      throw notFoundError(`Unknown service key "${key}"`, { field: 'key', key });
    }
    return catalogRepository.createDefault({
      key: initial.key,
      name: initial.name,
      status: 'ACTIVE',
      sort_order: initial.sortOrder,
    });
  }

  /**
   * Idempotent provisioning of the initial platform services. Existing rows are
   * preserved exactly (status, name, ordering); this only fills gaps.
   */
  async function ensureInitialServices() {
    for (const service of INITIAL_SERVICES) {
      // Sequential on purpose: deterministic ordering and a simple conflict path.
      // eslint-disable-next-line no-await-in-loop
      await catalogRepository.insertIfMissing({
        key: service.key,
        name: service.name,
        status: 'ACTIVE',
        sort_order: service.sortOrder,
      });
    }
    return listCatalog();
  }

  /** The PUBLIC catalog: DELETED omitted, ordered by the repository. */
  async function listCatalog() {
    const rows = await catalogRepository.listAll();
    return rows.filter((row) => row.status !== 'DELETED').map(toPublicItem);
  }

  /** The ADMIN catalog: every lifecycle state, DELETED included. */
  async function listAdmin() {
    const rows = await catalogRepository.listAll();
    return rows.map(toAdminItem);
  }

  /**
   * The canonical lifecycle transition for ONE service key. A reason is
   * required away from ACTIVE and cleared on ACTIVE; a repeated status is a
   * read. Unknown (non-initial, non-provisioned) keys answer 404.
   */
  async function setStatus({ key, status, reason, updatedBy = null } = {}) {
    const next = validateServiceStatus(status);
    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if (next !== 'ACTIVE' && trimmedReason.length === 0) {
      throw validationError('reason is required', { field: 'reason' });
    }

    const current = await ensureService(key);
    if (current.status === next) return current;

    return catalogRepository.setStatus({
      key,
      status: next,
      reason: trimmedReason.length === 0 ? null : trimmedReason,
      updatedBy,
    });
  }

  /** Legacy compatibility: the released boolean maps to ACTIVE/INACTIVE. */
  async function setEnabled({ key, enabled, reason, updatedBy = null } = {}) {
    if (typeof enabled !== 'boolean') {
      throw validationError('enabled must be a boolean', { field: 'enabled' });
    }
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw validationError('reason is required', { field: 'reason' });
    }
    const current = await ensureService(key);
    if (current.enabled === enabled) return current;
    return catalogRepository.setEnabled({
      key,
      enabled,
      reason: reason.trim(),
      updatedBy,
    });
  }

  return {
    getService,
    ensureService,
    ensureInitialServices,
    listCatalog,
    listAdmin,
    setStatus,
    setEnabled,
    serviceStatusToEnabled,
    statuses: () => SERVICE_STATUSES,
  };
}

module.exports = { createCatalogService, toPublicItem, toAdminItem };
