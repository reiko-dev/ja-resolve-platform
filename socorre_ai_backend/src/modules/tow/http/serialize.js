/**
 * MVP-01 — Tow DTO serializers (contract-shaped, string ids).
 */
'use strict';

function toIso(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function serializeModule(row) {
  return {
    module_key: row.module_key,
    service_key: row.service_key,
    enabled: row.enabled === true,
    disabled_reason: row.disabled_reason ?? null,
    updated_at: toIso(row.updated_at),
  };
}

function serializeAdminModule(row) {
  return {
    ...serializeModule(row),
    partner_type: row.partner_type,
    updated_by: row.updated_by ?? null,
    // MVP has no TowRequest state machine yet (MVP-03+); the drain counters are
    // therefore zero. Later deliveries replace these with real counts.
    affected_unassigned_requests: 0,
    assigned_requests_draining: 0,
  };
}

function serializeVehicle(row) {
  return {
    id: String(row.id),
    plate: row.plate,
    make: row.make,
    model: row.model,
    year: Number(row.year),
    equipment_type: row.equipment_type,
    supported_vehicle_classes: Array.isArray(row.supported_vehicle_classes)
      ? row.supported_vehicle_classes
      : [],
    max_towed_weight_kg: Number(row.max_towed_weight_kg),
    document_status: row.document_status || 'pending',
    active: row.active === true,
    pricing: {
      minimum_charge_cents: Number(row.pricing.minimum_charge_cents),
      included_km: Number(row.pricing.included_km),
      price_per_additional_km_cents: Number(row.pricing.price_per_additional_km_cents),
    },
  };
}

/**
 * The frozen `TowVehicleDocument` contract requires `file_url`, but the bytes
 * are private (EXT-MVP01-1). The field therefore carries the RELATIVE
 * authenticated download path for the response context — never a public
 * `/uploads/...` URL, an absolute URL or a filesystem path.
 */
function documentDownloadPath(row, scope) {
  if (scope === 'admin') {
    return `/api/admin/tow/vehicle-documents/${row.id}/download`;
  }
  return `/api/tow/vehicles/${row.vehicle_id}/documents/${row.id}/download`;
}

function serializeDocument(row, context = {}) {
  return {
    id: String(row.id),
    vehicle_id: String(row.vehicle_id),
    document_type: row.document_type,
    status: row.status,
    file_url: documentDownloadPath(row, context.scope),
    expires_at: toIso(row.expires_at),
    rejection_reason: row.rejection_reason ?? null,
    verified_by: row.verified_by === null || row.verified_by === undefined ? null : String(row.verified_by),
    verified_at: toIso(row.verified_at),
    created_at: toIso(row.created_at),
  };
}

/**
 * MVP-03 — partner opportunity item.
 *
 * The item is exactly `{request, proposed_price, route_quote}`. The distance and
 * duration live inside `route_quote` (the authoritative provider numbers), never
 * duplicated at the top level, and the geodesic distance used for filtering is
 * deliberately NOT serialized: it is a matching mechanism, not a commercial
 * number, and exposing it would invite a client to price from it.
 */
function serializeOpportunity(opportunity) {
  return {
    request: opportunity.request,
    proposed_price: {
      amount_cents: Number(opportunity.proposed_price.amount_cents),
      currency: opportunity.proposed_price.currency,
    },
    route_quote: {
      total_distance_meters: Number(opportunity.route_quote.total_distance_meters),
      total_duration_seconds: Number(opportunity.route_quote.total_duration_seconds),
    },
  };
}

module.exports = {
  serializeModule,
  serializeAdminModule,
  serializeVehicle,
  serializeDocument,
  serializeOpportunity,
  toIso,
};
