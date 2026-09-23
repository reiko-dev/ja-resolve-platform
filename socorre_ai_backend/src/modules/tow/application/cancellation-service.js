/**
 * MVP-05 / ISSUE #6 — cancellation, by either principal of the job.
 *
 *   `POST /tow/requests/{requestId}/cancel`          owning customer
 *   `POST /tow/requests/{requestId}/cancel-partner`  assigned partner
 *
 * Both routes are the SAME operation with a different owner predicate, so they
 * share one implementation and cannot drift apart. What differs is only:
 *
 *   - WHO is checked (owner-first): the customer is matched against
 *     `tow_requests.customer_id` (403 `not_request_owner`), the partner against
 *     `tow_assignments.partner_id` (403 `not_assigned_partner`). The check runs
 *     BEFORE the state is read, so a foreign caller cannot use the error as a
 *     state oracle — an already-cancelled job answers 403, not 200;
 *   - the SCOPE: ISSUE #6 grants the CUSTOMER every non-terminal phase —
 *     `SEARCHING`, `NEGOTIATING`, `ASSIGNED`, `EN_ROUTE`, `ARRIVED`,
 *     `IN_TRANSIT` — because a request not yet `COMPLETED`/`CANCELLED` is still
 *     the customer's to withdraw and this delivery has no fee, debt, refund or
 *     wallet to settle. The partner stays pre-transit
 *     (`ASSIGNED`/`EN_ROUTE`/`ARRIVED`), exactly as the frozen partner
 *     operation declares. `classifyCancellation(state, actorType)` is the whole
 *     authority for that difference;
 *   - the REASON: the partner must supply one (`RequiredReasonInput`, 1..2000);
 *     the customer's is optional (<= 1000) and is stored as `null` when absent;
 *   - the ATTRIBUTION: `cancelled_by_actor_type` is `customer` or `partner`, and
 *     `cancelled_by_actor_id` is the acting `users.id` / `partners.id`.
 *
 * Everything else is shared and is the reason this file is short:
 *
 *   - NO ASSIGNMENT IS REQUIRED for the customer: `SEARCHING`/`NEGOTIATING`
 *     persist exactly like the execution phases, and the request is no longer
 *     acceptable by a proposal (acceptance is state-guarded). A live proposal
 *     is left untouched as history — this delivery owns no withdrawal-on-cancel
 *     rule and close no proposal silently;
 *   - a replay while already `CANCELLED` is a 200 READ of the canonical row: the
 *     original `cancelled_at`, attribution and reason are returned unchanged,
 *     the milestone is never re-stamped and the assignment is never re-released;
 *   - the release happens in the SAME transaction as the state change, guarded by
 *     `released_at IS NULL`, so a cancelled job frees its partner exactly once
 *     and the assignment row survives as history. When there is no assignment
 *     the guarded release is a no-op and no row is invented;
 *   - `financial_consequence` is the frozen zero of this delivery (no fee, no
 *     debt, no refund) — see `domain/cancellation.js`. A previously selected
 *     CASH payment is NOT refunded, reversed or touched: cancelling only closes
 *     the request, it never writes a financial row.
 *
 * No module gate: cancelling an already-assigned job is DRAIN work.
 */
'use strict';

const {
  validateIdempotencyKey,
  validateCustomerCancellationInput,
  validatePartnerCancellationInput,
  buildTowRequestDto,
  buildAssignmentDto,
  allowedActionsForRequest,
  buildCancellationFinancialConsequence,
  classifyCancellation,
  invalidTransitionError,
  milestoneColumnForState,
  terminalReasonForCancellation,
  releaseReasonForTerminalState,
  TRANSITION_OUTCOMES,
} = require('../domain');
const { lockRequestForCustomer, lockJobForPartner } = require('./job-lock');
const { paymentSummaryFor } = require('./payment-summary');

const CANCELLED = 'CANCELLED';

function createCancellationService({
  settingsService,
  towRequestRepository,
  assignmentRepository,
  paymentRepository = null,
  unitOfWork,
  clock,
}) {
  if (!settingsService) throw new TypeError('createCancellationService requires a settingsService');
  if (!towRequestRepository) throw new TypeError('createCancellationService requires a towRequestRepository port');
  if (!assignmentRepository) throw new TypeError('createCancellationService requires an assignmentRepository port');
  if (!unitOfWork) throw new TypeError('createCancellationService requires a unitOfWork port');
  if (!clock) throw new TypeError('createCancellationService requires a clock port');

  /**
   * @param {object} input
   * @param {'customer'|'partner'} input.actorType
   * @param {unknown} input.actorId `users.id` or `partners.id`, per actor type
   * @param {(context: object) => Promise<object>} input.lock ownership-first lock
   */
  async function cancel({ actorType, actorId, reason, requestId, idempotencyKey, lock } = {}) {
    validateIdempotencyKey(idempotencyKey);

    const now = clock.now();
    const outcome = await unitOfWork.run(async (trx) => {
      const requests = towRequestRepository.withTransaction(trx);
      const assignments = assignmentRepository.withTransaction(trx);

      const request = await lock({ requests, assignments });

      const verdict = classifyCancellation(request.state, actorType);
      if (verdict === TRANSITION_OUTCOMES.REPLAY) {
        return {
          request,
          assignment: await assignments.findByRequestId(request.id),
          applied: false,
        };
      }
      if (verdict === TRANSITION_OUTCOMES.ILLEGAL) {
        throw invalidTransitionError(request.state, CANCELLED);
      }

      const updated = await requests.applyExecutionTransition(request.id, {
        from: request.state,
        to: CANCELLED,
        milestoneColumn: milestoneColumnForState(CANCELLED),
        terminalReason: terminalReasonForCancellation(actorType),
        cancellation: {
          actor_type: actorType,
          actor_id: actorId,
          reason: reason ?? null,
        },
        updatedAt: now,
      });

      if (!updated) {
        // Lost the CAS race (only reachable where row locks are absent): the
        // winner's commit is canonical, so replay it or report the conflict.
        const current = await requests.findById(request.id);
        if (current && classifyCancellation(current.state, actorType) === TRANSITION_OUTCOMES.REPLAY) {
          return { request: current, assignment: await assignments.findByRequestId(request.id), applied: false };
        }
        throw invalidTransitionError(current ? current.state : request.state, CANCELLED);
      }

      const released = await assignments.releaseByRequestId(request.id, {
        reason: releaseReasonForTerminalState(CANCELLED),
        releasedAt: now,
      });

      return { request: updated, assignment: released.row, applied: true };
    });

    const settings = await settingsService.get();
    const viewer = actorType === 'partner' ? 'partner' : 'customer';
    return {
      request: buildTowRequestDto(outcome.request, {
        max_radius_km: settings.tow_max_radius_km,
        assignment: outcome.assignment ? buildAssignmentDto(outcome.assignment) : null,
        payment: await paymentSummaryFor(paymentRepository, outcome.request.id),
        allowed_actions: allowedActionsForRequest({
          state: outcome.request.state,
          has_live_proposal: false,
          viewer,
        }),
      }),
      financial_consequence: buildCancellationFinancialConsequence(actorType),
    };
  }

  async function cancelByCustomer({ customerId, requestId, payload, idempotencyKey } = {}) {
    const { reason } = validateCustomerCancellationInput(payload);
    return cancel({
      actorType: 'customer',
      actorId: customerId,
      reason,
      requestId,
      idempotencyKey,
      lock: ({ requests }) => lockRequestForCustomer({ requests, requestId, customerId }),
    });
  }

  async function cancelByPartner({ partnerId, requestId, payload, idempotencyKey } = {}) {
    const { reason } = validatePartnerCancellationInput(payload);
    return cancel({
      actorType: 'partner',
      actorId: partnerId,
      reason,
      requestId,
      idempotencyKey,
      lock: async ({ requests, assignments }) => {
        const { request } = await lockJobForPartner({ requests, assignments, requestId, partnerId });
        return request;
      },
    });
  }

  return { cancelByCustomer, cancelByPartner };
}

module.exports = { createCancellationService, CANCELLED };
