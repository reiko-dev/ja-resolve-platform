/**
 * MVP-06 — CASH payment application service.
 *
 * Three operations, all under the canonical `/tow/requests/{requestId}` resource:
 *
 *   `selectMethod`      PUT  /tow/requests/{requestId}/payment-method
 *   `markCashReceived`  POST /tow/requests/{requestId}/cash-received
 *   `getSummary`        GET  /tow/requests/{requestId}/payment
 *
 * Amount authority (the single most important rule of this delivery):
 *
 *   amount_cents = tow_assignments.final_price_amount_cents
 *
 * The value is read from the canonical assignment INSIDE the transaction that
 * creates the payment row, and it was itself copied from the locked winning
 * proposal at accept time. It is NEVER read from a request body, a query
 * parameter, a mobile-computed value, the current tariff, a new route quote or a
 * legacy decimal column. `markCashReceived` accepts no body at all, which makes
 * a client-supplied amount impossible rather than merely ignored.
 *
 * Creation rule (documented decision, see `05-payment-authority.md`):
 *   The payment row is created lazily on the FIRST financial write — the
 *   customer selecting `cash`, or the assigned partner confirming receipt —
 *   whichever happens first. `getSummary` never writes. This guarantees one
 *   payment (enforced by `UNIQUE(tow_request_id)` / `UNIQUE(assignment_id)`), a
 *   frozen accepted amount, a rehydratable status and an idempotent
 *   confirmation, with the smallest possible architecture and no clock-driven
 *   pre-creation.
 *
 * Idempotency authority:
 *   The `Idempotency-Key` header is validated (422, 8–128 chars) BEFORE any
 *   transaction opens, but it is NOT the idempotency authority. The canonical
 *   row is: a retry finds the existing payment and returns it unchanged, and a
 *   replay with a DIFFERENT valid key still returns the same payment. This is
 *   the same design the module already uses for accept (proposal id) and for
 *   execution (canonical state).
 *
 * Authz:
 *   `selectMethod` is the owning CUSTOMER's (`req.user.id`) and is checked with
 *   `lockRequestForCustomer` before any state is inspected.
 *   `markCashReceived` is the ASSIGNED PARTNER's (`req.user.partner_id`) and is
 *   checked with `lockJobForPartner`, so a foreign partner gets 403 before it can
 *   use the error code as a state oracle.
 *   `getSummary` serves the owning customer OR the assigned partner, exactly
 *   like the tracking read.
 *
 * Completion prerequisite:
 *   Cash can only be RECEIVED on a `COMPLETED` Tow. `ASSIGNED`, `EN_ROUTE`,
 *   `ARRIVED`, `IN_TRANSIT`, `SEARCHING`, `NEGOTIATING` and `CANCELLED` all
 *   answer `409 invalid_tow_state`. The assignment row survives release, so the
 *   amount authority is still resolvable after completion — which is why the
 *   separate confirmation operation loses nothing and needs no fused transaction.
 */
'use strict';

const {
  TowError,
  buildTowPaymentRecord,
  buildTowPaymentDto,
  emptyPaymentSummary,
  validateSelectPaymentMethodInput,
  validateCashReceivedInput,
  validateIdempotencyKey,
  assertAssignedPartner,
} = require('../domain');
const { requireCanonicalRequestId, lockRequestForCustomer, lockJobForPartner } = require('./job-lock');

function createPaymentService({
  towRequestRepository,
  assignmentRepository,
  towPaymentRepository,
  unitOfWork,
  clock,
}) {
  if (!towRequestRepository) throw new TypeError('createPaymentService requires a towRequestRepository port');
  if (!assignmentRepository) throw new TypeError('createPaymentService requires an assignmentRepository port');
  if (!towPaymentRepository) throw new TypeError('createPaymentService requires a towPaymentRepository port');
  if (!unitOfWork) throw new TypeError('createPaymentService requires a unitOfWork port');
  if (!clock) throw new TypeError('createPaymentService requires a clock port');

  /** Amount authority: the frozen accepted price of the canonical assignment. */

  /**
   * `PUT /tow/requests/{requestId}/payment-method`
   *
   * The owning customer picks a method. MVP-06 implements only `cash`; the
   * validation layer rejects `card`/`pix` and `payment_source_token` with 422
   * BEFORE the transaction opens, so an unsupported method inserts zero rows.
   */
  async function selectMethod({ customerId, requestId, payload, idempotencyKey } = {}) {
    validateIdempotencyKey(idempotencyKey);
    const input = validateSelectPaymentMethodInput(payload);

    const now = clock.now();
    const row = await unitOfWork.run(async (trx) => {
      const requests = towRequestRepository.withTransaction(trx);
      const assignments = assignmentRepository.withTransaction(trx);
      const payments = towPaymentRepository.withTransaction(trx);

      const request = await lockRequestForCustomer({ requests, requestId, customerId });

      const existing = await payments.findByRequestId(request.id);
      if (existing) return existing;

      if (request.state === 'CANCELLED') {
        throw new TowError('invalid_tow_state', 'A cancelled tow request cannot select a payment method', {
          details: { state: request.state },
        });
      }

      const assignment = await assignments.findByRequestId(request.id);
      if (!assignment) {
        throw new TowError('invalid_tow_state', 'A payment method requires an assigned Tow job', {
          details: { state: request.state, reason: 'no_assignment' },
        });
      }

      const record = buildTowPaymentRecord({
        tow_request_id: assignment.tow_request_id,
        assignment_id: assignment.id,
        amount_cents: assignment.final_price_amount_cents,
        currency: assignment.final_price_currency,
        status: 'PENDING',
        created_at: now,
        updated_at: now,
      });

      const { row: created } = await payments.createForAssignment(record);
      if (!created) {
        throw new TowError('conflict', 'The Tow payment could not be created');
      }
      return created;
    });

    return buildTowPaymentDto(row);
  }

  /**
   * `POST /tow/requests/{requestId}/cash-received`
   *
   * The ASSIGNED partner confirms the cash was handed over, on a `COMPLETED`
   * Tow. A missing payment row is created lazily as `RECEIVED` (a partner can
   * always be handed cash, even if the customer never tapped "cash"); an
   * existing `PENDING` row is moved to `RECEIVED` by a guarded update; an
   * existing `RECEIVED` row is returned unchanged (same `received_at`).
   */
  async function markCashReceived({ partnerId, requestId, payload, idempotencyKey } = {}) {
    validateIdempotencyKey(idempotencyKey);
    validateCashReceivedInput(payload);

    const now = clock.now();
    const row = await unitOfWork.run(async (trx) => {
      const requests = towRequestRepository.withTransaction(trx);
      const assignments = assignmentRepository.withTransaction(trx);
      const payments = towPaymentRepository.withTransaction(trx);

      const { request, assignment } = await lockJobForPartner({
        requests,
        assignments,
        requestId,
        partnerId,
      });

      if (request.state !== 'COMPLETED') {
        throw new TowError(
          'invalid_tow_state',
          'Cash can only be received for a COMPLETED tow request',
          { details: { state: request.state } }
        );
      }

      const existing = await payments.findByRequestId(request.id);
      if (existing) {
        if (existing.status === 'RECEIVED') return existing;
        const { row: received } = await payments.markReceived(request.id, {
          receivedAt: now,
          receivedByPartnerId: assignment.partner_id,
          updatedAt: now,
        });
        if (received) return received;
        // Only reachable where row locks are absent (the SQLite harness). The
        // winner's committed row is the canonical one.
        return payments.findByRequestId(request.id);
      }

      const record = buildTowPaymentRecord({
        tow_request_id: assignment.tow_request_id,
        assignment_id: assignment.id,
        amount_cents: assignment.final_price_amount_cents,
        currency: assignment.final_price_currency,
        status: 'RECEIVED',
        received_at: now,
        received_by_partner_id: assignment.partner_id,
        created_at: now,
        updated_at: now,
      });

      const { row: created } = await payments.createForAssignment(record);
      if (!created) throw new TowError('conflict', 'The Tow payment could not be created');
      if (created.status === 'RECEIVED') return created;

      // A concurrent selector created the row as PENDING between our read and
      // our insert: canonicalize it with the same guarded transition.
      const { row: received } = await payments.markReceived(request.id, {
        receivedAt: now,
        receivedByPartnerId: assignment.partner_id,
        updatedAt: now,
      });
      return received || payments.findByRequestId(request.id);
    });

    return buildTowPaymentDto(row);
  }

  /**
   * `GET /tow/requests/{requestId}/payment`
   *
   * Read-only rehydration for the owning customer or the assigned partner. When
   * no payment row exists it answers the truthful empty `NOT_SELECTED` summary —
   * a read never writes.
   */
  async function getSummary({ requestId, customerId = null, partnerId = null } = {}) {
    requireCanonicalRequestId(requestId);

    const request = await towRequestRepository.findById(requestId);
    if (!request) throw new TowError('not_found', 'Tow request not found');

    if (customerId !== null && customerId !== undefined) {
      if (String(request.customer_id) !== String(customerId)) {
        throw new TowError('not_request_owner', 'Tow request belongs to another customer');
      }
    } else {
      const assignment = await assignmentRepository.findByRequestId(request.id);
      assertAssignedPartner(assignment, partnerId);
    }

    const row = await towPaymentRepository.findByRequestId(request.id);
    return row ? buildTowPaymentDto(row) : emptyPaymentSummary(request.id);
  }

  return { selectMethod, markCashReceived, getSummary };
}

module.exports = { createPaymentService };
