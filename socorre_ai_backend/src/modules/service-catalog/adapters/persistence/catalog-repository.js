/**
 * PLATFORM SERVICE CATALOG — persistence adapter for the platform service
 * registry (`service_modules`, Knex).
 *
 * `service_modules` remains the single registry table: the platform catalog
 * does NOT create a second source of truth. `status` is the canonical
 * lifecycle; `enabled` is a derived compatibility projection written in sync on
 * every write, so old readers keep answering while the status stays the
 * authority.
 *
 * `module_key` is the unique identity of a registry row; for a catalog-only
 * service (no dedicated backend module) it equals `service_key` and
 * `partner_type`.
 */
'use strict';

const { serviceStatusToEnabled, serviceStatusOf, SOON_SERVICE_STATUS } = require('../../domain');

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapCatalogRow(row) {
  if (!row) return null;
  const status = serviceStatusOf({
    status: row.status,
    enabled: row.enabled === true || row.enabled === 1 || row.enabled === 't',
  });
  return {
    id: row.id,
    key: row.module_key,
    module_key: row.module_key,
    service_key: row.service_key,
    partner_type: row.partner_type,
    name: row.name ?? null,
    status,
    sort_order: toNumber(row.sort_order) ?? 0,
    // Derived projection: never a second authority.
    enabled: serviceStatusToEnabled(status),
    disabled_reason: row.disabled_reason ?? null,
    updated_by: row.updated_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function createCatalogRepository(db) {
  if (!db) throw new TypeError('createCatalogRepository requires a knex instance');

  async function getByKey(key) {
    return mapCatalogRow(await db('service_modules').where({ module_key: key }).first());
  }

  /**
   * The application boundary always passes an explicit `status` (the launch
   * policy of INITIAL_SERVICES). If a caller ever omits it, persistence fails
   * CLOSED: the row is provisioned as SOON, never as an implicitly launched
   * ACTIVE service.
   */
  async function createDefault(row) {
    const status = row.status ?? SOON_SERVICE_STATUS;
    try {
      const [created] = await db('service_modules')
        .insert({
          module_key: row.key,
          service_key: row.service_key || row.key,
          partner_type: row.partner_type || row.key,
          name: row.name ?? null,
          status,
          sort_order: row.sort_order ?? 0,
          enabled: serviceStatusToEnabled(status),
        })
        .returning('*');
      return mapCatalogRow(created);
    } catch (error) {
      // Idempotent under a race: the unique module_key makes the loser re-read.
      const existing = await getByKey(row.key);
      if (existing) return existing;
      throw error;
    }
  }

  /**
   * Provisioning primitive: inserts the row only when the key is absent and
   * NEVER touches an existing row (status, name and ordering are preserved).
   * Like `createDefault`, a missing `status` fails CLOSED to SOON.
   */
  async function insertIfMissing(row) {
    const status = row.status ?? SOON_SERVICE_STATUS;
    await db('service_modules')
      .insert({
        module_key: row.key,
        service_key: row.service_key || row.key,
        partner_type: row.partner_type || row.key,
        name: row.name ?? null,
        status,
        sort_order: row.sort_order ?? 0,
        enabled: serviceStatusToEnabled(status),
      })
      .onConflict('module_key')
      .ignore();
    return getByKey(row.key);
  }

  /**
   * The ONLY status write path of the registry: `status` and its derived
   * `enabled` projection move together, so the two can never disagree.
   */
  async function setStatus({ key, status, reason = null, updatedBy = null }) {
    await db('service_modules')
      .where({ module_key: key })
      .update({
        status,
        enabled: serviceStatusToEnabled(status),
        disabled_reason: status === 'ACTIVE' ? null : reason,
        updated_by: updatedBy,
        updated_at: db.fn.now(),
      });
    return getByKey(key);
  }

  /** Legacy compatibility entry point: maps the boolean into ACTIVE/INACTIVE. */
  async function setEnabled({ key, enabled, reason, updatedBy = null }) {
    return setStatus({
      key,
      status: enabled ? 'ACTIVE' : 'INACTIVE',
      reason,
      updatedBy,
    });
  }

  /** The whole registry, catalog order. DELETED filtering is a product rule. */
  async function listAll() {
    const rows = await db('service_modules')
      .select('*')
      .orderBy('sort_order', 'asc')
      .orderBy('module_key', 'asc');
    return rows.map(mapCatalogRow);
  }

  return { getByKey, createDefault, insertIfMissing, setStatus, setEnabled, listAll };
}

module.exports = { createCatalogRepository, mapCatalogRow };
