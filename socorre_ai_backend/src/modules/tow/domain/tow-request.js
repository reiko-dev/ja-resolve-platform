/**
 * MVP-03 — the canonical `TowRequest` aggregate.
 *
 * The module keeps a SINGLE tow request authority. The legacy
 * `emergency_requests` subsystem stores tow work as `type: 'other'` +
 * `request_type: 'tow'` with unconstrained text columns
 * (`docs/evidence/mvp-03/02-legacy-audit.md` §2), which cannot enforce the
 * canonical state machine or the idempotency contract; the decision to own a
 * canonical table instead of reusing it is recorded in
 * `docs/evidence/mvp-03/03-persistence-decision.md`.
 *
 * This file owns three things and nothing else:
 *   1. the canonical vocabulary (states, terminal reasons, frozen input shape);
 *   2. `validateCreateTowRequestInput` — the single normalizer, which freezes a
 *      payload into the exact aggregate input and rejects everything else
 *      (`additionalProperties: false`). Client-supplied price or distance can
 *      never enter the aggregate: pricing is the RouteProvider's authority
 *      (MVP-02) and distance is derived, never submitted.
 *   3. `buildTowRequestRecord` / `buildTowRequestDto` — the persistence record
 *      and the contract DTO.
 *
 * No pricing, no route, no HTTP, no storage concern lives here.
 */
'use strict';

const { MODULE_KEY } = require('./identity');
const { VEHICLE_CLASSES, requiresWeight } = require('./vehicle-classes');
const { validationError } = require('./errors');
const { assertOperationalGeoPoint } = require('./geo');
const { isRowId } = require('./ids');
const {
  PAYMENT_METHOD,
  PAYMENT_METHOD_DTO,
  emptyPaymentSummary,
} = require('./tow-payment');
const {
  isCancellableTowRequestState,
  isTowExecutionState,
  isTerminalTowRequestState,
  progressActionForState,
} = require('./tow-request-state-machine');

/** Canonical lifecycle states of a tow request (contract enum). */
const TOW_REQUEST_STATES = Object.freeze([
  'SEARCHING',
  'NEGOTIATING',
  'ASSIGNED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_TRANSIT',
  'COMPLETION_PENDING',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTED',
]);

/**
 * A newly created request is always `SEARCHING`. Creation never assigns, never
 * quotes and never expires: MVP-03 has no state machine, no scheduler and no
 * proposal flow, so `SEARCHING` is the only state this delivery can produce.
 */
const INITIAL_TOW_REQUEST_STATE = 'SEARCHING';

/**
 * MVP-04 — the states in which a request still accepts NEW proposals.
 *
 * A request becomes `NEGOTIATING` the moment its first proposal exists (see
 * `application/proposal-service.js`); it stays matchable, because a second
 * partner may still propose until the customer accepts one. `ASSIGNED` and
 * everything after it is closed to new offers.
 */
const OPEN_TOW_REQUEST_STATES = Object.freeze(['SEARCHING', 'NEGOTIATING']);

/**
 * MVP-04/MVP-05 — the ONLY actions the module may advertise on a request.
 *
 * `accept_proposal` is the customer's MVP-04 action. The five MVP-05 tokens are
 * the execution vocabulary: four partner progress steps and `cancel`, which
 * either party may be offered while the request is still cancellable.
 * Counteroffer, payment, rematch, rating and every other unimplemented action
 * are deliberately absent: the contract freezes the vocabulary, and the module
 * must never advertise what it does not implement.
 */
const REQUEST_ALLOWED_ACTIONS = Object.freeze({
  ACCEPT_PROPOSAL: 'accept_proposal',
  START_EN_ROUTE: 'start_en_route',
  MARK_ARRIVED: 'mark_arrived',
  START_IN_TRANSIT: 'start_in_transit',
  FINISH_SERVICE: 'finish_service',
  CANCEL: 'cancel',
});

/**
 * Who is looking at the request. `allowed_actions` is VIEWER-AWARE because the
 * same state offers different things to the two parties: in `ARRIVED` the
 * assigned partner may `start_in_transit` or `cancel`, while the customer may
 * only `cancel` — the customer never drives the partner's milestones.
 *
 * `customer` is the default so every MVP-03/MVP-04 call site that predates the
 * viewer keeps its exact previous answer.
 */
const REQUEST_VIEWERS = Object.freeze(['customer', 'partner']);

/** Canonical terminal reasons (contract enum). MVP-03 produces none of them. */
const TERMINAL_REASONS = Object.freeze([
  'NO_PROVIDER_AVAILABLE',
  'SERVICE_DISABLED',
  'CUSTOMER_CANCELLED',
  'PARTNER_CANCELLED',
  'CUSTOMER_NO_SHOW',
  'PARTNER_NO_SHOW',
  'ADMIN_OVERRIDE',
]);

const TOW_REQUEST_LIMITS = Object.freeze({
  make: 100,
  model: 100,
  plate: 10,
  formatted_address: 500,
  place_id: 500,
  problem_description: 2000,
  observations: 4000,
});

const VEHICLE_YEAR_MIN = 1900;
const VEHICLE_YEAR_MAX = 2200;

/**
 * SERVICE LOCATION — the resolution sources a TOW CLIENT may send.
 *
 * The frozen vocabulary has four members (ADR §2), but `SAVED_ADDRESS` is
 * reserved for the deferred saved-address flow and no Phase 5 endpoint produces
 * it, so a create payload carrying it is refused with the same 422 as any
 * unknown value. The source is validated here and deliberately NEVER persisted
 * (ADR §8): explicit identity is derivable from `place_id != null`, and the
 * generic sources are address-only.
 */
const TOW_PLACE_RESOLUTION_SOURCES = Object.freeze([
  'USER_SELECTED_PLACE',
  'USER_PIN',
  'CURRENT_LOCATION',
]);

/** The only source allowed to travel with a `place_id` (ADR §2 rule 1/2). */
const EXPLICIT_PLACE_SOURCE = 'USER_SELECTED_PLACE';

/** A provider resource id may arrive as `places/{id}`; storage is the bare id. */
const PLACES_RESOURCE_PREFIX = 'places/';

const CREATE_INPUT_KEYS = Object.freeze([
  'pickup',
  'destination',
  'vehicle',
  'problem_description',
  'observations',
  'payment_method',
]);

const GEO_POINT_KEYS = Object.freeze([
  'latitude',
  'longitude',
  'formatted_address',
  // SERVICE LOCATION — additive explicit-identity input. `place_name` is
  // deliberately absent: strict unknown keys keep rejecting it (ADR §8).
  'place_id',
  'resolution_source',
]);

const VEHICLE_KEYS = Object.freeze(['class', 'make', 'model', 'year', 'weight_kg', 'plate']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * True for an id that can identify a row (`1`, `'1'`), false for anything a
 * persistence layer must never be asked to compare against an integer column.
 * The rule is shared with the MVP-04 aggregates (`domain/ids.js`).
 */
function isTowRequestId(value) {
  return isRowId(value);
}

/** @param {string} state @returns {boolean} true while new proposals are allowed */
function isOpenTowRequestState(state) {
  return OPEN_TOW_REQUEST_STATES.includes(state);
}

/**
 * The truthful `allowed_actions` of a request, from the point of view of one
 * party.
 *
 * The two halves of the lifecycle never claim each other's states:
 *   - OPEN (`SEARCHING`/`NEGOTIATING`): the customer is offered
 *     `accept_proposal` while at least one proposal is still live, and `cancel`
 *     unconditionally — a request is never hostage to a negotiation (ISSUE #6).
 *     A partner is offered nothing here: proposing is the partner's move, but it
 *     is a write against the REQUEST's proposal collection, not an action on the
 *     request, and MVP-04 deliberately never advertised it.
 *   - EXECUTION (`ASSIGNED`…`IN_TRANSIT`): the assigned partner is offered the
 *     next progress step (`start_en_route`, `mark_arrived`, `start_in_transit`,
 *     `finish_service`); both parties are offered `cancel` while the request is
 *     still cancellable for THEM. The customer never sees a partner milestone.
 *   - TERMINAL (`COMPLETED`/`CANCELLED`): nothing, for either party.
 *
 * `cancel` is offered from the actor-aware cancellable scope
 * (`isCancellableTowRequestState`): every non-terminal state for the customer,
 * the pre-transit execution states only for the partner. The list is truthful,
 * not aspirational: it never names an action that the caller cannot complete
 * right now.
 *
 * @param {{state: string, has_live_proposal?: boolean, viewer?: 'customer'|'partner'}} input
 * @returns {readonly string[]} frozen, possibly empty
 */
function allowedActionsForRequest({ state, has_live_proposal: hasLiveProposal, viewer = 'customer' } = {}) {
  const actions = [];
  const isCustomer = viewer === 'customer';
  const actorType = isCustomer ? 'customer' : 'partner';

  if (isOpenTowRequestState(state)) {
    if (isCustomer && hasLiveProposal === true) actions.push(REQUEST_ALLOWED_ACTIONS.ACCEPT_PROPOSAL);
  } else if (isTowExecutionState(state) && !isTerminalTowRequestState(state)) {
    if (!isCustomer) {
      const progress = progressActionForState(state);
      if (progress) actions.push(progress);
    }
  }

  if (!isTerminalTowRequestState(state) && isCancellableTowRequestState(state, actorType)) {
    actions.push(REQUEST_ALLOWED_ACTIONS.CANCEL);
  }

  return Object.freeze(actions);
}

function rejectUnknownKeys(value, allowed, field) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw validationError(`${field}.${key} is not an accepted field`, { field: `${field}.${key}` });
    }
  }
}

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw validationError(`${field} must be a string`, { field });
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) {
    throw validationError(`${field} must be at most ${maxLength} characters`, { field });
  }
  return trimmed;
}

function requiredText(value, field, maxLength) {
  const text = optionalText(value, field, maxLength);
  if (text === null) {
    throw validationError(`${field} is required`, { field });
  }
  return text;
}

/**
 * SERVICE LOCATION — optional explicit place id.
 *
 * `undefined`/`null`/blank are the generic-coordinate case (`place_id = null`).
 * A non-empty string is trimmed, a leading `places/` resource prefix is
 * stripped (the storage value is the bare provider id) and the result is
 * bounded to the same 500 characters the Service Location proxy accepts.
 */
function optionalPlaceId(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw validationError(`${field} must be a string`, { field });
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const bare = trimmed.startsWith(PLACES_RESOURCE_PREFIX)
    ? trimmed.slice(PLACES_RESOURCE_PREFIX.length)
    : trimmed;
  if (bare.length === 0) return null;
  if (bare.length > TOW_REQUEST_LIMITS.place_id) {
    throw validationError(
      `${field} must be at most ${TOW_REQUEST_LIMITS.place_id} characters`,
      { field }
    );
  }
  return bare;
}

/**
 * SERVICE LOCATION — the explicit/generic pair invariant (ADR §2), enforced
 * BEFORE anything is persisted:
 *
 *   - `place_id != null` requires `USER_SELECTED_PLACE`; any other source (or a
 *     source that is not part of the frozen vocabulary, e.g. `SAVED_ADDRESS` in
 *     Phase 5) is a 422;
 *   - `USER_SELECTED_PLACE` requires `place_id`;
 *   - a `place_id` with the source omitted is normalized to
 *     `USER_SELECTED_PLACE` (the user did select a place — the client simply
 *     did not repeat the reason);
 *   - omitting both is the legacy/generic payload and stays valid.
 *
 * The source is intentionally not returned: it is not persisted (ADR §8).
 */
function validatePlaceResolutionSource(value, placeId, field) {
  const sourceField = `${field}.resolution_source`;

  if (value === undefined || value === null) {
    if (placeId !== null) return EXPLICIT_PLACE_SOURCE;
    return null;
  }

  if (typeof value !== 'string' || !TOW_PLACE_RESOLUTION_SOURCES.includes(value)) {
    throw validationError(
      `${sourceField} must be one of ${TOW_PLACE_RESOLUTION_SOURCES.join(', ')}`,
      { field: sourceField }
    );
  }

  if (placeId === null) {
    if (value === EXPLICIT_PLACE_SOURCE) {
      throw validationError(
        `${sourceField} ${EXPLICIT_PLACE_SOURCE} requires ${field}.place_id`,
        { field }
      );
    }
    return value;
  }

  if (value !== EXPLICIT_PLACE_SOURCE) {
    throw validationError(
      `${field}.place_id requires ${sourceField} ${EXPLICIT_PLACE_SOURCE}`,
      { field: sourceField }
    );
  }
  return value;
}

function normalizeGeoPoint(value, field) {
  if (!isPlainObject(value)) {
    throw validationError(`${field} must be an object with latitude and longitude`, { field });
  }
  rejectUnknownKeys(value, GEO_POINT_KEYS, field);
  const coordinates = assertOperationalGeoPoint(value, field);
  const placeId = optionalPlaceId(value.place_id, `${field}.place_id`);
  // Validated (and rejected when incoherent) even though the source itself is
  // NOT persisted: no durable consumer exists for it.
  validatePlaceResolutionSource(value.resolution_source, placeId, field);
  return Object.freeze({
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    formatted_address: optionalText(value.formatted_address, `${field}.formatted_address`, TOW_REQUEST_LIMITS.formatted_address),
    place_id: placeId,
  });
}

function normalizeVehicle(value) {
  if (!isPlainObject(value)) {
    throw validationError('vehicle must be an object', { field: 'vehicle' });
  }
  rejectUnknownKeys(value, VEHICLE_KEYS, 'vehicle');

  const vehicleClass = value.class;
  if (typeof vehicleClass !== 'string' || !VEHICLE_CLASSES.includes(vehicleClass)) {
    throw validationError(
      `vehicle.class must be one of ${VEHICLE_CLASSES.join(', ')}`,
      { field: 'vehicle.class' }
    );
  }

  let weightKg = null;
  if (value.weight_kg !== undefined && value.weight_kg !== null) {
    // Kilograms as a whole number: the persisted column is an integer and the
    // compatibility policy compares capacities in whole kilograms.
    if (!Number.isInteger(value.weight_kg) || value.weight_kg <= 0) {
      throw validationError('vehicle.weight_kg must be a positive integer', { field: 'vehicle.weight_kg' });
    }
    weightKg = value.weight_kg;
  }
  if (requiresWeight(vehicleClass) && weightKg === null) {
    throw validationError(
      `vehicle.weight_kg is required for ${vehicleClass}`,
      { field: 'vehicle.weight_kg' }
    );
  }

  let year = null;
  if (value.year !== undefined && value.year !== null) {
    if (!Number.isInteger(value.year) || value.year < VEHICLE_YEAR_MIN || value.year > VEHICLE_YEAR_MAX) {
      throw validationError(
        `vehicle.year must be an integer between ${VEHICLE_YEAR_MIN} and ${VEHICLE_YEAR_MAX}`,
        { field: 'vehicle.year' }
      );
    }
    year = value.year;
  }

  return Object.freeze({
    class: vehicleClass,
    make: requiredText(value.make, 'vehicle.make', TOW_REQUEST_LIMITS.make),
    model: requiredText(value.model, 'vehicle.model', TOW_REQUEST_LIMITS.model),
    year,
    weight_kg: weightKg,
    plate: optionalText(value.plate, 'vehicle.plate', TOW_REQUEST_LIMITS.plate),
  });
}

/**
 * The commercial payment choice is made BEFORE the request exists.
 *
 * The contract vocabulary is the consumer one (`PaymentMethod`), exactly like
 * `PUT /tow/requests/{requestId}/payment-method`; the persisted value is the
 * module's own `CASH` (the same vocabulary `tow_payments.method` uses). The
 * choice is a REQUIRED input: a request without a method cannot be created, so
 * a brand new Tow can never be born `NOT_SELECTED`.
 *
 * MVP implements exactly one member. `card` and `pix` are schema-valid in the
 * frozen contract (they describe Phase 2 / #33) but are refused here with an
 * explicit reason instead of being silently ignored, exactly like
 * `validateSelectPaymentMethodInput`. No alias (`CASH`, `dinheiro`, ...) is
 * accepted: the contract has one spelling and the runtime does not invent a
 * second.
 *
 * @param {unknown} value raw `payment_method` from the create payload
 * @returns {'CASH'} the persistence vocabulary member
 */
function normalizeTowRequestPaymentMethod(value) {
  if (value === undefined || value === null) {
    throw validationError('payment_method is required', { field: 'payment_method', reason: 'missing' });
  }
  if (typeof value !== 'string') {
    throw validationError('payment_method must be a string', { field: 'payment_method' });
  }
  if (value !== PAYMENT_METHOD_DTO) {
    throw validationError(
      `payment_method "${value}" is not implemented by the Tow MVP subset; only "cash" is available`,
      { field: 'payment_method', reason: 'method_not_supported_in_mvp', implemented: [PAYMENT_METHOD_DTO] }
    );
  }
  return PAYMENT_METHOD;
}

/**
 * The contract projection of the persisted commercial choice. Historical rows
 * created before the field existed carry `null`; a NEW request always carries
 * `cash` (creation rejects anything else). An unknown persisted value is a
 * corrupt row and is refused rather than silently projected.
 */
function paymentMethodDto(paymentMethod) {
  if (paymentMethod === null || paymentMethod === undefined) return null;
  if (paymentMethod === PAYMENT_METHOD) return PAYMENT_METHOD_DTO;
  throw validationError('payment_method is not part of the Tow payment vocabulary', {
    field: 'payment_method',
  });
}

/**
 * Normalizes and freezes the frozen creation payload.
 *
 * @param {object} payload raw `POST /tow/requests` body
 * @returns {{pickup: object, destination: object, vehicle: object, problem_description: string, observations: string|null, payment_method: 'CASH'}} frozen
 */
function validateCreateTowRequestInput(payload) {
  if (!isPlainObject(payload)) {
    throw validationError('request body must be a JSON object', { field: 'body' });
  }
  rejectUnknownKeys(payload, CREATE_INPUT_KEYS, 'body');

  return Object.freeze({
    pickup: normalizeGeoPoint(payload.pickup, 'pickup'),
    destination: normalizeGeoPoint(payload.destination, 'destination'),
    vehicle: normalizeVehicle(payload.vehicle),
    problem_description: requiredText(
      payload.problem_description,
      'problem_description',
      TOW_REQUEST_LIMITS.problem_description
    ),
    observations: optionalText(payload.observations, 'observations', TOW_REQUEST_LIMITS.observations),
    payment_method: normalizeTowRequestPaymentMethod(payload.payment_method),
  });
}

function assertPositiveRadius(radiusKm) {
  const radius = Number(radiusKm);
  if (!Number.isFinite(radius) || radius <= 0) {
    throw validationError('matching radius must be a positive finite number', { field: 'matching_radius_km' });
  }
  return radius;
}

/**
 * Builds the persistence record. `state` is never a parameter: creation can
 * only produce `INITIAL_TOW_REQUEST_STATE`.
 *
 * @param {{input: object, customerId: number|string, radiusKm: number, idempotencyKey: string, now: Date|string}} params
 */
function buildTowRequestRecord({ input, customerId, radiusKm, idempotencyKey, now }) {
  if (!isPlainObject(input)) {
    throw validationError('input must be a normalized tow request input', { field: 'input' });
  }
  if (customerId === undefined || customerId === null || customerId === '') {
    throw validationError('customerId is required', { field: 'customer_id' });
  }
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) {
    throw validationError('idempotencyKey is required', { field: 'Idempotency-Key' });
  }

  const createdAt = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(createdAt.getTime())) {
    throw validationError('now must be a valid instant', { field: 'now' });
  }

  return Object.freeze({
    customer_id: customerId,
    state: INITIAL_TOW_REQUEST_STATE,
    terminal_reason: null,
    pickup: input.pickup,
    destination: input.destination,
    vehicle: input.vehicle,
    problem_description: input.problem_description,
    observations: input.observations,
    payment_method: input.payment_method,
    matching_radius_km: assertPositiveRadius(radiusKm),
    idempotency_key: idempotencyKey,
    created_at: createdAt,
    updated_at: createdAt,
  });
}

/**
 * Normalizes any persisted timestamp representation to an ISO-8601 instant.
 * PostgreSQL hands back a `Date`; the SQLite harness hands back the TEXT
 * `'YYYY-MM-DD HH:MM:SS.mmm'`; an epoch-ms number is accepted too.
 *
 * The implementation moved to `domain/instants.js` in MVP-04 (the proposal and
 * the assignment need exactly the same rule); it is re-exported here so every
 * existing caller and the MVP-03 contract stay untouched.
 */
const { toIsoInstant } = require('./instants');

/**
 * The contract DTO of a tow request.
 *
 * Truthfulness rules:
 *   - `payment` is a PROJECTION of the canonical `tow_payments` aggregate. It is
 *     INJECTED by the application layer (`options.payment`), never derived here:
 *     a caller that has not loaded it emits the truthful empty `NOT_SELECTED`
 *     summary instead of guessing. There is no second payment truth and no
 *     mutable financial flag on the request row.
 *   - `assignment` is INJECTED for the same reason.
 *   - `allowed_actions` is INJECTED and viewer-aware; it defaults to the
 *     truthful empty list.
 *   - `placeNames` is INJECTED (`{ pickup, destination }`). The place NAME is
 *     ephemeral presentation data resolved at read time through the
 *     `PlaceDetails` port; it is never persisted (ADR §3/§8). `place_id`, on the
 *     other hand, IS persisted identity and is emitted whenever the record has
 *     one. Both members are ADDITIVE and OMITTED when absent, so a legacy row
 *     (or a legacy payload) serializes exactly as it did before Service
 *     Location.
 *
 * @param {object} record
 * @param {{max_radius_km: number, assignment?: object|null, allowed_actions?: readonly string[], payment?: object|null, placeNames?: {pickup?: string|null, destination?: string|null}}} options
 */
function buildGeoPointDto(point, placeName) {
  const dto = {
    latitude: Number(point.latitude),
    longitude: Number(point.longitude),
    formatted_address: point.formatted_address ?? null,
  };
  if (point.place_id !== null && point.place_id !== undefined) {
    dto.place_id = point.place_id;
  }
  if (typeof placeName === 'string' && placeName.trim() !== '') {
    dto.place_name = placeName.trim();
  }
  return Object.freeze(dto);
}

function buildTowRequestDto(record, options = {}) {
  if (!isPlainObject(record)) {
    throw validationError('record must be an object', { field: 'record' });
  }
  const maxRadius = Number(options.max_radius_km);
  const placeNames = isPlainObject(options.placeNames) ? options.placeNames : {};

  return Object.freeze({
    id: String(record.id),
    module_key: MODULE_KEY,
    state: record.state,
    terminal_reason: record.terminal_reason ?? null,
    customer_id: String(record.customer_id),
    pickup: buildGeoPointDto(record.pickup, placeNames.pickup),
    destination: buildGeoPointDto(record.destination, placeNames.destination),
    vehicle: Object.freeze({
      class: record.vehicle.class,
      make: record.vehicle.make,
      model: record.vehicle.model,
      year: record.vehicle.year ?? null,
      weight_kg: record.vehicle.weight_kg ?? null,
      plate: record.vehicle.plate ?? null,
    }),
    problem_description: record.problem_description,
    observations: record.observations ?? null,
    // The commercial choice made at creation. `null` only for historical rows
    // created before the field existed; a new request always carries `cash`.
    // This is NOT the financial execution state — `payment` (below) remains the
    // projection of `tow_payments` and the two can never disagree in the MVP,
    // because `cash` is the only implemented method.
    payment_method: paymentMethodDto(record.payment_method),
    matching: Object.freeze({
      current_radius_km: Number(record.matching_radius_km),
      max_radius_km: Number.isFinite(maxRadius) ? maxRadius : null,
      search_expires_at: null,
    }),
    payment: options.payment ?? emptyPaymentSummary(record.id),
    assignment: options.assignment ?? null,
    allowed_actions: Object.freeze(Array.isArray(options.allowed_actions) ? [...options.allowed_actions] : []),
    created_at: toIsoInstant(record.created_at),
    updated_at: toIsoInstant(record.updated_at),
  });
}

module.exports = {
  TOW_REQUEST_STATES,
  INITIAL_TOW_REQUEST_STATE,
  OPEN_TOW_REQUEST_STATES,
  REQUEST_ALLOWED_ACTIONS,
  REQUEST_VIEWERS,
  TERMINAL_REASONS,
  TOW_REQUEST_LIMITS,
  VEHICLE_YEAR_MIN,
  VEHICLE_YEAR_MAX,
  isTowRequestId,
  isOpenTowRequestState,
  allowedActionsForRequest,
  normalizeTowRequestPaymentMethod,
  paymentMethodDto,
  validateCreateTowRequestInput,
  buildTowRequestRecord,
  buildTowRequestDto,
  toIsoInstant,
};
