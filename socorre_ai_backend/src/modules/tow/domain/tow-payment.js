/**
 * MVP-06 — the CASH payment aggregate (domain).
 *
 * One payment per Tow request/assignment, one method (`CASH`), one currency
 * (`BRL`), one integer-cents amount, and the minimal status model the delivery
 * brief allows:
 *
 *   PENDING   the customer selected cash; nothing has been handed over yet
 *   RECEIVED  the assigned partner confirmed the cash was received
 *
 * The persistence vocabulary is deliberately smaller than the frozen consumer
 * vocabulary. The contract `PaymentStatus` enum is the CONSUMER contract (it
 * also describes CARD/PIX states that MVP-06 does not implement), so the DTO is
 * a projection, never a copy:
 *
 *   no row     -> NOT_SELECTED
 *   PENDING    -> CASH_SELECTED
 *   RECEIVED   -> CASH_RECEIVED
 *
 * Amount authority: the caller (application service) must pass the amount it
 * read from `tow_assignments.final_price_amount_cents`. This module never
 * derives a price, never reads a tariff, never calls a route provider and never
 * accepts a client-supplied amount — `buildTowPaymentRecord` only validates the
 * shape it is given, and the only request shape it accepts from a client is
 * `{ method }`.
 *
 * Money is always a non-negative safe integer of cents. No decimal arithmetic
 * exists in this file, on purpose.
 */
'use strict';

const { validationError } = require('./errors');
const { requireSafeNonNegativeInteger } = require('./integers');
const { requireIsoInstant, toIsoInstant } = require('./instants');
const { isRowId } = require('./ids');

/** The one method MVP-06 implements, in persistence vocabulary. */
const PAYMENT_METHOD = 'CASH';
/** The same method in consumer (contract) vocabulary. */
const PAYMENT_METHOD_DTO = 'cash';
/** The only currency the Tow module accepts. */
const PAYMENT_CURRENCY = 'BRL';

/** Persistence status model — intentionally the minimum. */
const PAYMENT_STATUSES = Object.freeze(['PENDING', 'RECEIVED']);

/** Persistence status -> frozen consumer `PaymentStatus` member. */
const PAYMENT_STATUS_DTO = Object.freeze({
  PENDING: 'CASH_SELECTED',
  RECEIVED: 'CASH_RECEIVED',
});

/** The contract `PaymentStatus` for "nothing exists yet". */
const PAYMENT_STATUS_NOT_SELECTED = 'NOT_SELECTED';

/** Exactly the keys `SelectPaymentMethodInput` declares in the frozen contract. */
const SELECT_PAYMENT_METHOD_INPUT_KEYS = Object.freeze(['method', 'payment_source_token']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The truthful empty summary of a request that has no payment row.
 *
 * @param {unknown} requestId canonical request id
 * @returns {object} frozen contract-shaped `PaymentSummary`
 */
function emptyPaymentSummary(requestId) {
  return Object.freeze({
    request_id: requestId === null || requestId === undefined ? null : String(requestId),
    method: null,
    status: PAYMENT_STATUS_NOT_SELECTED,
    amount_cents: null,
    currency: null,
    can_start_service: false,
    pix: null,
  });
}

/**
 * `can_start_service` is informational, not a gate (the MVP-05 state machine
 * remains the only execution authority). It answers one question honestly: does
 * the chosen payment arrangement allow this job to begin?
 *
 * Cash is collected at the end of the service, so once cash is chosen the answer
 * is yes; before a method exists the answer is no.
 */
function canStartService(status) {
  return status === 'PENDING' || status === 'RECEIVED';
}

/**
 * Projects a persisted payment row to the frozen `PaymentSummary`.
 *
 * @param {object|null} row `tow_payments` row
 * @returns {object} frozen contract-shaped `PaymentSummary`
 */
function buildTowPaymentDto(row) {
  if (!row) return emptyPaymentSummary(null);

  const status = PAYMENT_STATUS_DTO[row.status];
  if (!status) {
    throw validationError('payment status is not part of the Tow payment vocabulary', {
      field: 'status',
    });
  }

  return Object.freeze({
    request_id: row.tow_request_id === null || row.tow_request_id === undefined
      ? null
      : String(row.tow_request_id),
    method: PAYMENT_METHOD_DTO,
    status,
    amount_cents: Number(row.amount_cents),
    currency: row.currency,
    can_start_service: canStartService(row.status),
    pix: null,
  });
}

/**
 * TOW ROUND — the TowPayment materialized automatically when a proposal wins.
 *
 * The commercial choice made BEFORE creation (`TowRequest.payment_method`) is
 * the only source of the method here: the accept flow never asks the customer
 * again, and the first-party journey never depends on the legacy
 * `PUT /tow/requests/{requestId}/payment-method`. This function is the single
 * place the two authorities are joined, so the consistency rule
 * (`TowRequest.payment_method == TowPayment.method`) cannot drift.
 *
 * A historical request (created before the commercial choice existed) carries
 * `null`; no method was ever chosen, so NOTHING is materialized and the request
 * keeps projecting the truthful `NOT_SELECTED` summary — the compatibility path
 * may still select cash explicitly.
 *
 * The amount/currency are copied verbatim from the assignment's frozen final
 * price (the only money authority of the module); this function never reads a
 * tariff, a route or a request body.
 *
 * @param {{request: object, assignment: object, now: Date|string}} input
 * @returns {object|null} frozen `tow_payments` record, or null for a historical request
 */
function buildTowPaymentRecordAtAssignment({ request, assignment, now } = {}) {
  const method = request ? request.payment_method : null;
  if (method === null || method === undefined) return null;

  if (method !== PAYMENT_METHOD) {
    throw validationError('the request commercial method is not part of the Tow payment vocabulary', {
      field: 'payment_method',
    });
  }
  if (!assignment || typeof assignment !== 'object') {
    throw validationError('assignment is required to materialize the Tow payment', { field: 'assignment' });
  }

  return buildTowPaymentRecord({
    tow_request_id: assignment.tow_request_id,
    assignment_id: assignment.id,
    amount_cents: assignment.final_price_amount_cents,
    currency: assignment.final_price_currency,
    status: 'PENDING',
    created_at: now,
    updated_at: now,
  });
}

/**
 * Validates `SelectPaymentMethodInput` for the MVP subset.
 *
 * The frozen schema accepts `card | pix | cash` and an optional
 * `payment_source_token`. MVP-06 implements exactly `cash` and no PSP flow, so
 * the other members are schema-valid but answer `422 validation_error` with an
 * explicit reason instead of being silently ignored. `payment_source_token` is
 * a PSP authorization token: there is no gateway to send it to in MVP-06, so
 * accepting it would be a lie.
 *
 * @param {unknown} payload request body
 * @returns {{method: 'cash'}} frozen normalized input
 */
function validateSelectPaymentMethodInput(payload) {
  if (!isPlainObject(payload)) {
    throw validationError('payment method payload must be an object', { field: 'body' });
  }
  for (const key of Object.keys(payload)) {
    if (!SELECT_PAYMENT_METHOD_INPUT_KEYS.includes(key)) {
      throw validationError(`body.${key} is not an accepted field`, { field: `body.${key}` });
    }
  }

  const { method, payment_source_token: paymentSourceToken } = payload;
  if (method === undefined || method === null) {
    throw validationError('body.method is required', { field: 'method', reason: 'missing' });
  }
  if (typeof method !== 'string') {
    throw validationError('body.method must be a string', { field: 'method' });
  }
  if (method !== PAYMENT_METHOD_DTO) {
    throw validationError(
      `body.method "${method}" is not implemented by the Tow MVP subset; only "cash" is available`,
      { field: 'method', reason: 'method_not_supported_in_mvp', implemented: [PAYMENT_METHOD_DTO] }
    );
  }
  if (paymentSourceToken !== undefined && paymentSourceToken !== null) {
    throw validationError(
      'body.payment_source_token is not supported for cash: the MVP has no payment gateway',
      { field: 'payment_source_token', reason: 'gateway_not_implemented' }
    );
  }

  return Object.freeze({ method: PAYMENT_METHOD_DTO });
}

/**
 * Validates the body of `POST /tow/requests/{requestId}/cash-received`.
 *
 * The frozen contract declares NO body for this operation. Any field is an
 * invented financial input (`amount_cents`, `currency`, `received_at`,
 * `partner_id`, ...) and is rejected, never ignored: silently dropping a client
 * amount would leave the caller believing it was accepted.
 *
 * @param {unknown} payload request body (Express gives `{}` for an empty body)
 */
function validateCashReceivedInput(payload) {
  if (payload === undefined || payload === null) return;
  if (!isPlainObject(payload)) {
    throw validationError('cash-received accepts no body', { field: 'body' });
  }
  const keys = Object.keys(payload);
  if (keys.length === 0) return;
  throw validationError(
    `cash-received accepts no body; "${keys[0]}" is not an accepted field (the amount is the accepted assignment price)`,
    { field: `body.${keys[0]}` }
  );
}

/**
 * Builds the persistence record of a Tow payment.
 *
 * @param {object} input
 * @param {number|string} input.tow_request_id
 * @param {number|string} input.assignment_id
 * @param {number} input.amount_cents authoritative cents (assignment final price)
 * @param {string} [input.currency]
 * @param {string} [input.status]
 * @param {unknown} [input.received_at]
 * @param {number|string|null} [input.received_by_partner_id]
 * @param {unknown} [input.created_at]
 * @param {unknown} [input.updated_at]
 * @returns {object} frozen record ready for the repository
 */
function buildTowPaymentRecord(input = {}) {
  const { tow_request_id: towRequestId, assignment_id: assignmentId } = input;

  if (!isRowId(towRequestId)) {
    throw new TypeError('buildTowPaymentRecord requires a canonical tow_request_id');
  }
  if (!isRowId(assignmentId)) {
    throw new TypeError('buildTowPaymentRecord requires a canonical assignment_id');
  }

  const amountCents = requireSafeNonNegativeInteger(input.amount_cents, 'amount_cents');
  const currency = input.currency === undefined ? PAYMENT_CURRENCY : input.currency;
  if (currency !== PAYMENT_CURRENCY) {
    throw validationError('currency must be BRL', { field: 'currency' });
  }

  const status = input.status === undefined ? 'PENDING' : input.status;
  if (!PAYMENT_STATUSES.includes(status)) {
    throw validationError(`status must be one of ${PAYMENT_STATUSES.join(', ')}`, { field: 'status' });
  }

  const receivedAt = input.received_at === undefined || input.received_at === null
    ? null
    : requireIsoInstant(input.received_at, 'received_at');
  const receivedBy = input.received_by_partner_id === undefined || input.received_by_partner_id === null
    ? null
    : input.received_by_partner_id;

  if (status === 'PENDING' && (receivedAt !== null || receivedBy !== null)) {
    throw validationError('a PENDING payment cannot have received_at or received_by_partner_id', {
      field: 'status',
    });
  }
  if (status === 'RECEIVED') {
    if (receivedAt === null) {
      throw validationError('a RECEIVED payment requires received_at', { field: 'received_at' });
    }
    if (!isRowId(receivedBy)) {
      throw validationError('a RECEIVED payment requires a canonical received_by_partner_id', {
        field: 'received_by_partner_id',
      });
    }
  }

  const isoTimestamp = input.created_at === undefined ? null : toIsoInstant(input.created_at);

  return Object.freeze({
    tow_request_id: Number(towRequestId),
    assignment_id: Number(assignmentId),
    method: PAYMENT_METHOD,
    amount_cents: amountCents,
    currency,
    status,
    received_at: receivedAt,
    received_by_partner_id: receivedBy === null ? null : Number(receivedBy),
    created_at: isoTimestamp,
    updated_at: input.updated_at === undefined ? isoTimestamp : toIsoInstant(input.updated_at),
  });
}

module.exports = {
  PAYMENT_METHOD,
  PAYMENT_METHOD_DTO,
  PAYMENT_CURRENCY,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_DTO,
  PAYMENT_STATUS_NOT_SELECTED,
  SELECT_PAYMENT_METHOD_INPUT_KEYS,
  canStartService,
  emptyPaymentSummary,
  buildTowPaymentDto,
  buildTowPaymentRecordAtAssignment,
  validateSelectPaymentMethodInput,
  validateCashReceivedInput,
  buildTowPaymentRecord,
};
