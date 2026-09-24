/**
 * PLATFORM SERVICE CATALOG — DTO serializers (contract-shaped, string ids).
 */
'use strict';

function toIso(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** The public catalog item: `key` is the stable identity consumed by the apps. */
function serializeCatalogItem(row) {
  return {
    id: String(row.id),
    key: row.key,
    name: row.name,
    status: row.status,
    disabled_reason: row.disabled_reason ?? null,
    sort_order: row.sort_order,
  };
}

/** The admin item: the public shape plus the derived/compat fields. */
function serializeAdminItem(row) {
  return {
    ...serializeCatalogItem(row),
    enabled: row.enabled === true,
    updated_by: row.updated_by ?? null,
    updated_at: toIso(row.updated_at),
  };
}

module.exports = { serializeCatalogItem, serializeAdminItem, toIso };
