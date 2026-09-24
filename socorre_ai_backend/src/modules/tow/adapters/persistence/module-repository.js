/**
 * MVP-01 — persistence adapter for the platform service registry (Knex).
 * SERVICE CATALOG — `status` is the canonical lifecycle; `enabled` is a derived
 * compatibility projection written in sync on every write, so old readers keep
 * answering while the status stays the single authority.
 */
'use strict';

const { serviceStatusToEnabled, serviceStatusOf } = require('../../domain');

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapModuleRow(row) {
  if (!row) return null;
  const status = serviceStatusOf({
    status: row.status,
    enabled: row.enabled === true || row.enabled === 1 || row.enabled === 't',
  });
  return {
    id: row.id,
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

function createModuleRepository(db) {
  if (!db) throw new TypeError('createModuleRepository requires a knex instance');

  async function getByKey(key) {
    return mapModuleRow(await db('service_modules').where({ module_key: key }).first());
  }

  async function createDefault(row) {
    const status = row.status || 'ACTIVE';
    try {
      const [created] = await db('service_modules')
        .insert({
          module_key: row.module_key,
          service_key: row.service_key,
          partner_type: row.partner_type,
          name: row.name ?? null,
          status,
          sort_order: row.sort_order ?? 0,
          enabled: serviceStatusToEnabled(status),
        })
        .returning('*');
      return mapModuleRow(created);
    } catch (error) {
      // Idempotent under a race: the unique module_key makes the loser re-read.
      const existing = await getByKey(row.module_key);
      if (existing) return existing;
      throw error;
    }
  }

  /**
   * The ONLY write path of the registry: `status` and its derived `enabled`
   * projection move together, so the two can never disagree.
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
  async function listServices() {
    const rows = await db('service_modules')
      .select('*')
      .orderBy('sort_order', 'asc')
      .orderBy('module_key', 'asc');
    return rows.map(mapModuleRow);
  }

  return { getByKey, createDefault, setStatus, setEnabled, listServices };
}

module.exports = { createModuleRepository, mapModuleRow };
