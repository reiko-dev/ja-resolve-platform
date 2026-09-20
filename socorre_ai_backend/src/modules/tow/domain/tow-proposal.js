/**
 * MVP-04 — the Tow proposal aggregate.
 *
 * A proposal is a PARTNER's offer to serve ONE tow request with ONE of the
 * partner's vehicles, priced by the SERVER. It is the first canonical Tow
 * aggregate that is not the customer's: the customer owns the request, the
 * partner owns the proposal, and the customer's acceptance is what turns a
 * proposal into an assignment (see `domain/assignment.js`).
 *
 * Authority boundaries (TOW-PROP-001..006 / TOW-API-CONTRACT.md §6):
 *   - the PRICE is never an input. The partner posts an EMPTY body; the amount
 *     comes from the frozen tariff snapshot of the vehicle and the authoritative
 *     route quote (MVP-02). `FORBIDDEN_PROPOSAL_INPUT_KEYS` is the executable
 *     form of that rule: a client that tries to name a price is refused with
 *     `validation_error`, not silently ignored;
 *   - the DISTANCE is never re-derived. The stored per-leg meters/seconds are
 *     the ones the RouteProvider returned, and the stored total must be exactly
 *     their sum — re-checked on the way OUT (`buildTowProposalDto`) so a row
 *     corrupted outside the module can never be served as a price basis;
 *   - the proposal freezes a SNAPSHOT (route, tariff, vehicle description,
 *     partner display name). A later vehicle edit, tariff change or partner
 *     rename must not rewrite what the customer was offered and accepted. The
 *     snapshot is also why the DTO needs no join;
 *   - `COUNTERED` belongs to the frozen contract enum but is NOT reachable in
 *     MVP-04: there is no counteroffer flow, so the module never writes it. The
 *     value is named here, in the enum owner, and nowhere else.
 *
 * `node:crypto` is deliberately absent: the deterministic fingerprint SOURCE
 * lives here, the SHA-256 digest belongs to the persistence adapter.
 */
'use strict';

const { TowError, validationError } = require('./errors');
const { isRowId } = require('./ids');
const { createRouteQuote } = require('./route');
const { requireSafeNonNegativeInteger } = require('./integers');
const { toIsoInstant, requireIsoInstant, instantMillis } = require('./instants');
const { isEquipmentType, isVehicleClass } = require('./vehicle-classes');
const { DOCUMENT_STATUSES } = require('./documents');

/** Frozen contract enum order (TOW-API-CONTRACT.md §3 `TowProposalStatus`). */
const TOW_PROPOSAL_STATUSES = Object.freeze([
  'ACTIVE',
  'COUNTERED',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'EXPIRED',
  'CLOSED',
]);

const INITIAL_TOW_PROPOSAL_STATUS = 'ACTIVE';

/**
 * The only status a partner/customer action may act on. Everything else is
 * already decided, withdrawn or expired, and the answer is
 * `proposal_not_actionable` — never a silent no-op.
 */
const ACTIONABLE_PROPOSAL_STATUSES = Object.freeze(['ACTIVE']);

/**
 * Keys a partner must never send when creating a proposal.
 *
 * The contract declares the create body as `additionalProperties: false` with no
 * properties at all. This list exists so the refusal is EXPLICIT and testable
 * (`validation_error` naming the offending key) instead of a generic "unknown
 * field": server pricing is a product invariant, and a request that tries to
 * influence the price must fail loudly.
 */
const FORBIDDEN_PROPOSAL_INPUT_KEYS = Object.freeze([
  'price',
  'amount',
  'amount_cents',
  'proposed_price',
  'price_amount_cents',
  'currency',
  'estimated_price',
  'route_distance',
  'route_total_distance_meters',
  'distance_meters',
  'tariff',
  'pricing',
  'partner_id',
  'tow_vehicle_id',
  'vehicle_id',
  'status',
  'expires_at',
]);

const VEHICLE_SNAPSHOT_KEYS = Object.freeze([
  'plate',
  'make',
  'model',
  'year',
  'equipment_type',
  'supported_vehicle_classes',
  'max_towed_weight_kg',
  'document_status',
  'active',
]);

/** @param {unknown} value @returns {boolean} */
function isTowProposalId(value) {
  return isRowId(value);
}

function requireText(value, field, { maxLength = 255 } = {}) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationError(`${field} is required`, { field });
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw validationError(`${field} exceeds ${maxLength} characters`, { field });
  }
  return text;
}

function optionalText(value, field, options) {
  if (value === null || value === undefined) return null;
  return requireText(value, field, options);
}

function requireBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw validationError(`${field} must be a boolean`, { field });
  }
  return value;
}

/**
 * Validates the create body: it must be ABSENT, `null`, or an EMPTY object.
 *
 * @param {unknown} input the raw (already JSON-parsed) request body
 * @returns {{}} the canonical empty input
 */
function validateCreateTowProposalInput(input) {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('the proposal create body must be an empty object', { field: 'body' });
  }
  const keys = Object.keys(input);
  const forbidden = keys.filter((key) => FORBIDDEN_PROPOSAL_INPUT_KEYS.includes(key));
  if (forbidden.length > 0) {
    throw validationError('a Tow proposal is priced by the server; the price is never an input', {
      fields: forbidden.sort(),
    });
  }
  if (keys.length > 0) {
    throw validationError('the proposal create body must be empty', { fields: keys.sort() });
  }
  return {};
}

/**
 * The transient fingerprint SOURCE of a create attempt.
 *
 * Two requests with the same idempotency key are the same attempt only when this
 * source is byte-identical. Because the create body is always empty, the source
 * is the (partner, request, vehicle) triple: a partner that retries with a
 * different vehicle is making a different offer, and the frozen contract
 * requires `idempotency_conflict` rather than a silent replay.
 *
 * @returns {string} deterministic, adapter-hashable source
 */
function canonicalProposalFingerprintSource({ partner_id: partnerId, tow_request_id: requestId, tow_vehicle_id: vehicleId }) {
  return JSON.stringify({
    partner_id: String(partnerId),
    tow_request_id: String(requestId),
    tow_vehicle_id: String(vehicleId),
  });
}

/**
 * Normalizes the authoritative route quote into its four stored values.
 *
 * @returns {{provider_to_pickup: object|null, pickup_to_destination: object|null,
 *   total_distance_meters: number, total_duration_seconds: number}}
 */
function normalizeRouteQuote(routeQuote) {
  if (!routeQuote || typeof routeQuote !== 'object' || Array.isArray(routeQuote)) {
    throw validationError('route_quote is required', { field: 'route_quote' });
  }
  const quote = createRouteQuote({
    provider_to_pickup: routeQuote.provider_to_pickup,
    pickup_to_destination: routeQuote.pickup_to_destination,
  });
  return {
    provider_to_pickup: quote.provider_to_pickup,
    pickup_to_destination: quote.pickup_to_destination,
    total_distance_meters: quote.total_distance_meters,
    total_duration_seconds: quote.total_duration_seconds,
  };
}

/** The server-side money value: integer cents, `BRL`, non-negative. */
function normalizePrice(price) {
  if (!price || typeof price !== 'object' || Array.isArray(price)) {
    throw validationError('price is required', { field: 'price' });
  }
  if (price.currency !== 'BRL') {
    throw validationError('price.currency must be BRL', { field: 'price.currency' });
  }
  return {
    amount_cents: requireSafeNonNegativeInteger(price.amount_cents, 'price.amount_cents'),
    currency: 'BRL',
  };
}

/** The frozen tariff snapshot that produced the price. */
function normalizePricingSnapshot(pricingSnapshot) {
  if (!pricingSnapshot || typeof pricingSnapshot !== 'object' || Array.isArray(pricingSnapshot)) {
    throw validationError('pricing_snapshot is required', { field: 'pricing_snapshot' });
  }
  return {
    minimum_charge_cents: requireSafeNonNegativeInteger(
      pricingSnapshot.minimum_charge_cents, 'pricing_snapshot.minimum_charge_cents',
    ),
    included_meters: requireSafeNonNegativeInteger(
      pricingSnapshot.included_meters, 'pricing_snapshot.included_meters',
    ),
    price_per_additional_km_cents: requireSafeNonNegativeInteger(
      pricingSnapshot.price_per_additional_km_cents, 'pricing_snapshot.price_per_additional_km_cents',
    ),
  };
}

/** The frozen vehicle description the customer is shown. */
function normalizeVehicleSnapshot(vehicleSnapshot) {
  if (!vehicleSnapshot || typeof vehicleSnapshot !== 'object' || Array.isArray(vehicleSnapshot)) {
    throw validationError('vehicle_snapshot is required', { field: 'vehicle_snapshot' });
  }
  const classes = vehicleSnapshot.supported_vehicle_classes;
  if (!Array.isArray(classes) || classes.length === 0 || !classes.every(isVehicleClass)) {
    throw validationError('vehicle_snapshot.supported_vehicle_classes must be a non-empty list of vehicle classes', {
      field: 'vehicle_snapshot.supported_vehicle_classes',
    });
  }
  if (!isEquipmentType(vehicleSnapshot.equipment_type)) {
    throw validationError('vehicle_snapshot.equipment_type is not a canonical equipment type', {
      field: 'vehicle_snapshot.equipment_type',
    });
  }
  if (!DOCUMENT_STATUSES.includes(vehicleSnapshot.document_status)) {
    throw validationError('vehicle_snapshot.document_status is not a canonical document status', {
      field: 'vehicle_snapshot.document_status',
    });
  }
  const year = vehicleSnapshot.year;
  if (year !== null && year !== undefined) {
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      throw validationError('vehicle_snapshot.year must be between 1900 and 2200', { field: 'vehicle_snapshot.year' });
    }
  }
  const weight = vehicleSnapshot.max_towed_weight_kg;
  if (weight !== null && weight !== undefined) {
    if (!Number.isInteger(weight) || weight < 1) {
      throw validationError('vehicle_snapshot.max_towed_weight_kg must be at least 1', {
        field: 'vehicle_snapshot.max_towed_weight_kg',
      });
    }
  }
  return {
    plate: requireText(vehicleSnapshot.plate, 'vehicle_snapshot.plate', { maxLength: 20 }),
    make: requireText(vehicleSnapshot.make, 'vehicle_snapshot.make', { maxLength: 100 }),
    model: requireText(vehicleSnapshot.model, 'vehicle_snapshot.model', { maxLength: 100 }),
    year: year === undefined ? null : year,
    equipment_type: vehicleSnapshot.equipment_type,
    supported_vehicle_classes: Object.freeze([...classes]),
    max_towed_weight_kg: weight === undefined ? null : weight,
    document_status: vehicleSnapshot.document_status,
    active: vehicleSnapshot.active === undefined ? true : requireBoolean(vehicleSnapshot.active, 'vehicle_snapshot.active'),
  };
}

/**
 * Builds the persistable proposal record.
 *
 * The returned object maps 1:1 onto the `tow_request_proposals` columns minus
 * `id` (assigned by the database) and minus `idempotency_fingerprint` (the
 * adapter hashes `canonicalProposalFingerprintSource`).
 *
 * @param {object} input
 * @returns {Readonly<object>}
 */
function buildTowProposalRecord({
  tow_request_id: requestId,
  partner_id: partnerId,
  tow_vehicle_id: vehicleId,
  route_quote: routeQuote,
  pricing_snapshot: pricingSnapshot,
  price,
  vehicle_snapshot: vehicleSnapshot,
  partner_business_name: partnerBusinessName = null,
  expires_at: expiresAt,
  idempotency_key: idempotencyKey,
  created_at: createdAt,
  updated_at: updatedAt,
} = {}) {
  if (!isRowId(requestId)) throw validationError('tow_request_id must identify a tow request', { field: 'tow_request_id' });
  if (!isRowId(partnerId)) throw validationError('partner_id must identify a partner', { field: 'partner_id' });
  if (!isRowId(vehicleId)) throw validationError('tow_vehicle_id must identify a tow vehicle', { field: 'tow_vehicle_id' });

  const route = normalizeRouteQuote(routeQuote);
  const pricing = normalizePricingSnapshot(pricingSnapshot);
  const money = normalizePrice(price);
  const vehicle = normalizeVehicleSnapshot(vehicleSnapshot);
  const createdAtValue = requireIsoInstant(createdAt, 'created_at');
  const expiresAtValue = requireIsoInstant(expiresAt, 'expires_at');
  if (instantMillis(expiresAtValue) <= instantMillis(createdAtValue)) {
    throw validationError('expires_at must be after created_at', { field: 'expires_at' });
  }

  return Object.freeze({
    tow_request_id: requestId,
    partner_id: partnerId,
    tow_vehicle_id: vehicleId,
    status: INITIAL_TOW_PROPOSAL_STATUS,
    route_provider_to_pickup_distance_meters: route.provider_to_pickup ? route.provider_to_pickup.distance_meters : null,
    route_provider_to_pickup_duration_seconds: route.provider_to_pickup ? route.provider_to_pickup.duration_seconds : null,
    route_pickup_to_destination_distance_meters: route.pickup_to_destination ? route.pickup_to_destination.distance_meters : null,
    route_pickup_to_destination_duration_seconds: route.pickup_to_destination ? route.pickup_to_destination.duration_seconds : null,
    route_total_distance_meters: route.total_distance_meters,
    route_total_duration_seconds: route.total_duration_seconds,
    pricing_minimum_charge_cents: pricing.minimum_charge_cents,
    pricing_included_meters: pricing.included_meters,
    pricing_price_per_additional_km_cents: pricing.price_per_additional_km_cents,
    price_amount_cents: money.amount_cents,
    price_currency: money.currency,
    vehicle_plate: vehicle.plate,
    vehicle_make: vehicle.make,
    vehicle_model: vehicle.model,
    vehicle_year: vehicle.year,
    vehicle_equipment_type: vehicle.equipment_type,
    vehicle_supported_vehicle_classes: vehicle.supported_vehicle_classes,
    vehicle_max_towed_weight_kg: vehicle.max_towed_weight_kg,
    vehicle_document_status: vehicle.document_status,
    vehicle_active: vehicle.active,
    partner_business_name: optionalText(partnerBusinessName, 'partner_business_name'),
    expires_at: expiresAtValue,
    decided_at: null,
    idempotency_key: requireText(idempotencyKey, 'idempotency_key', { maxLength: 128 }),
    created_at: createdAtValue,
    updated_at: requireIsoInstant(updatedAt, 'updated_at'),
  });
}

/**
 * Rebuilds and RE-VALIDATES the authoritative route quote of a stored row.
 *
 * A total that does not equal the sum of its legs is a corrupt row: it must
 * never be served, because the customer would be looking at a price derived from
 * a distance nobody can reproduce.
 */
function storedRouteQuote(row) {
  const toPickup = row.route_provider_to_pickup_distance_meters === null
    && row.route_provider_to_pickup_duration_seconds === null
    ? null
    : {
      distance_meters: row.route_provider_to_pickup_distance_meters,
      duration_seconds: row.route_provider_to_pickup_duration_seconds,
    };
  const toDestination = row.route_pickup_to_destination_distance_meters === null
    && row.route_pickup_to_destination_duration_seconds === null
    ? null
    : {
      distance_meters: row.route_pickup_to_destination_distance_meters,
      duration_seconds: row.route_pickup_to_destination_duration_seconds,
    };

  const quote = createRouteQuote({ provider_to_pickup: toPickup, pickup_to_destination: toDestination });
  if (quote.total_distance_meters !== row.route_total_distance_meters) {
    throw validationError('the stored route total distance disagrees with its legs', {
      field: 'route_total_distance_meters',
    });
  }
  if (quote.total_duration_seconds !== row.route_total_duration_seconds) {
    throw validationError('the stored route total duration disagrees with its legs', {
      field: 'route_total_duration_seconds',
    });
  }

  const serialized = {
    total_distance_meters: quote.total_distance_meters,
    total_duration_seconds: quote.total_duration_seconds,
  };
  if (quote.provider_to_pickup) {
    serialized.provider_to_pickup = {
      distance_meters: quote.provider_to_pickup.distance_meters,
      duration_seconds: quote.provider_to_pickup.duration_seconds,
    };
  }
  if (quote.pickup_to_destination) {
    serialized.pickup_to_destination = {
      distance_meters: quote.pickup_to_destination.distance_meters,
      duration_seconds: quote.pickup_to_destination.duration_seconds,
    };
  }
  return serialized;
}

/**
 * The public `TowProposal` representation.
 *
 * Internal columns (`idempotency_*`, raw `price_amount_cents`, the flat route
 * columns, `decided_at`, `vehicle_active`) are never exposed: the DTO is the
 * contract shape, and the contract has no room for the module's bookkeeping.
 * `counteroffer` is always `null` — the frozen contract requires the member, and
 * MVP-04 has no counteroffer.
 *
 * @param {object} row a stored proposal row (already mapped by the adapter)
 * @returns {object}
 */
function buildTowProposalDto(row) {
  if (!row || typeof row !== 'object') {
    throw validationError('a stored proposal row is required', { field: 'proposal' });
  }
  const dto = {
    id: String(row.id),
    request_id: String(row.tow_request_id),
    partner_id: String(row.partner_id),
    status: row.status,
    price: {
      amount_cents: row.price_amount_cents,
      currency: row.price_currency,
    },
    route_quote: storedRouteQuote(row),
    tow_vehicle: {
      id: String(row.tow_vehicle_id),
      plate: row.vehicle_plate,
      make: row.vehicle_make,
      model: row.vehicle_model,
      year: row.vehicle_year,
      equipment_type: row.vehicle_equipment_type,
      supported_vehicle_classes: Array.isArray(row.vehicle_supported_vehicle_classes)
        ? [...row.vehicle_supported_vehicle_classes]
        : row.vehicle_supported_vehicle_classes,
      max_towed_weight_kg: row.vehicle_max_towed_weight_kg,
      document_status: row.vehicle_document_status,
      active: row.vehicle_active === true || row.vehicle_active === 1,
    },
    counteroffer: null,
    expires_at: toIsoInstant(row.expires_at),
    created_at: toIsoInstant(row.created_at),
  };

  // Optional by contract: present only when the partner had a business name at
  // snapshot time. The DTO never joins to `partners` to fill it in later.
  const displayName = row.partner_business_name;
  if (typeof displayName === 'string' && displayName.trim() !== '') {
    dto.partner = { display_name: displayName };
  }
  return dto;
}

/**
 * A proposal is expired from the instant its deadline is REACHED: `now >=
 * expires_at`. Expiry is decided by the ACTION, never by a background job — the
 * module has no scheduler, so a stale row is only ever detected when somebody
 * tries to act on it.
 */
function isProposalExpired(proposal, now) {
  if (!proposal || proposal.expires_at === null || proposal.expires_at === undefined) return false;
  const deadline = instantMillis(proposal.expires_at);
  const instant = instantMillis(now);
  if (Number.isNaN(deadline) || Number.isNaN(instant)) return false;
  return instant >= deadline;
}

/**
 * The action-time guard shared by accept and withdraw.
 *
 * @throws {TowError} `proposal_not_actionable` when the proposal is not ACTIVE,
 *   `proposal_expired` when its deadline has passed
 */
function assertProposalActionable(proposal, now) {
  if (!proposal || !ACTIONABLE_PROPOSAL_STATUSES.includes(proposal.status)) {
    throw new TowError('proposal_not_actionable', 'This proposal is no longer actionable');
  }
  if (isProposalExpired(proposal, now)) {
    throw new TowError('proposal_expired', 'This proposal has expired');
  }
  return proposal;
}

module.exports = {
  TOW_PROPOSAL_STATUSES,
  INITIAL_TOW_PROPOSAL_STATUS,
  ACTIONABLE_PROPOSAL_STATUSES,
  FORBIDDEN_PROPOSAL_INPUT_KEYS,
  isTowProposalId,
  validateCreateTowProposalInput,
  canonicalProposalFingerprintSource,
  buildTowProposalRecord,
  buildTowProposalDto,
  isProposalExpired,
  assertProposalActionable,
};
