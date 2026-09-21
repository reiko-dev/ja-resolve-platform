/**
 * MVP-05 — the four partner progress operations.
 *
 *   `start_en_route`    ASSIGNED    -> EN_ROUTE     `POST /tow/requests/{requestId}/en-route`
 *   `mark_arrived`      EN_ROUTE    -> ARRIVED      `POST /tow/requests/{requestId}/arrived`
 *   `start_in_transit`  ARRIVED     -> IN_TRANSIT   `POST /tow/requests/{requestId}/in-transit`
 *   `finish_service`    IN_TRANSIT  -> COMPLETED    `POST /tow/requests/{requestId}/finish`
 *
 * All four are the SAME operation with a different edge of the frozen graph, so
 * there is exactly one implementation and no per-endpoint rule can drift.
 *
 * The guarantees, in the order they are enforced:
 *
 *   1. `Idempotency-Key` is validated (422) BEFORE the transaction opens;
 *   2. `arrived`/`finish` validate their `LocationInput` body (422) before the
 *      transaction opens. The body is an ACKNOWLEDGEMENT: the module never
 *      stores it, because the milestone instant must be the backend clock's, not
 *      a client timestamp;
 *   3. the job is locked and its assigned partner verified (403 before 409);
 *   4. the transition is classified by the pure state machine:
 *        - REPLAY  — the request is ALREADY in the target state: the canonical
 *          row is returned with 200 and nothing is written. This is the whole
 *          idempotency authority of the delivery: canonical state, not a key
 *          table, so a replay with a different valid key is still a read;
 *        - ILLEGAL — 409 `invalid_tow_transition` with `details.from/to`;
 *        - APPLY   — a guarded CAS write (`WHERE state = :from`) sets the state
 *          and the milestone instant in ONE statement. Zero rows affected means
 *          a concurrent writer won; the loser re-reads and is either a replay
 *          (200) or a conflict (409), never a silent double milestone;
 *   5. a terminal transition (COMPLETED) releases the assignment in the SAME
 *      transaction: `released_at` + `release_reason`, guarded by
 *      `released_at IS NULL`. The assignment row is never deleted, so the job
 *      stays in the partner's history and the customer's recovery still resolves
 *      the same partner, vehicle and price.
 *
 * NOT here, deliberately: `moduleService.assertNewBusinessAllowed()`. Finishing
 * an already-assigned job is DRAIN work, not new business; a disabled module
 * must never strand a customer on the roadside (see `docs/evidence/mvp-05/08-graceful-drain.md`).
 */
'use strict';

const {
  validateIdempotencyKey,
  validateLocationInput,
  buildTowRequestDto,
  buildAssignmentDto,
  allowedActionsForRequest,
  classifyTransition,
  invalidTransitionError,
  milestoneColumnForState,
  releaseReasonForTerminalState,
  isTerminalTowRequestState,
  TRANSITION_OUTCOMES,
  EXECUTION_TARGET_STATE_BY_OPERATION,
} = require('../domain');
const { lockJobForPartner } = require('./job-lock');
const { paymentSummaryFor } = require('./payment-summary');

/** Operations whose contract body is a `LocationInput` acknowledgement. */
const LOCATION_ACKNOWLEDGING_OPERATIONS = Object.freeze(['mark_arrived', 'finish_service']);

function createExecutionService({
  settingsService,
  towRequestRepository,
  assignmentRepository,
  paymentRepository = null,
  unitOfWork,
  clock,
}) {
  if (!settingsService) throw new TypeError('createExecutionService requires a settingsService');
  if (!towRequestRepository) throw new TypeError('createExecutionService requires a towRequestRepository port');
  if (!assignmentRepository) throw new TypeError('createExecutionService requires an assignmentRepository port');
  if (!unitOfWork) throw new TypeError('createExecutionService requires a unitOfWork port');
  if (!clock) throw new TypeError('createExecutionService requires a clock port');

  /**
   * @param {object} input
   * @param {string} input.operation one of `EXECUTION_TARGET_STATE_BY_OPERATION`
   */
  async function transition({ partnerId, requestId, operation, payload, idempotencyKey } = {}) {
    const target = EXECUTION_TARGET_STATE_BY_OPERATION[operation];
    if (!target) throw new TypeError(`unknown execution operation: ${operation}`);

    // 1–2. Frozen input shape, before any lock and before any write.
    validateIdempotencyKey(idempotencyKey);
    if (LOCATION_ACKNOWLEDGING_OPERATIONS.includes(operation)) {
      validateLocationInput(payload);
    }

    const now = clock.now();
    const outcome = await unitOfWork.run(async (trx) => {
      const requests = towRequestRepository.withTransaction(trx);
      const assignments = assignmentRepository.withTransaction(trx);

      const { request, assignment } = await lockJobForPartner({
        requests,
        assignments,
        requestId,
        partnerId,
      });

      const verdict = classifyTransition(request.state, target);
      if (verdict === TRANSITION_OUTCOMES.REPLAY) {
        return { request, assignment, applied: false };
      }
      if (verdict === TRANSITION_OUTCOMES.ILLEGAL) {
        throw invalidTransitionError(request.state, target);
      }

      const updated = await requests.applyExecutionTransition(request.id, {
        from: request.state,
        to: target,
        milestoneColumn: milestoneColumnForState(target),
        updatedAt: now,
      });

      if (!updated) {
        // Lost the CAS race (only reachable where row locks are absent). The
        // winner's commit is the canonical state: replay it, or conflict.
        const current = await requests.findById(request.id);
        if (current && classifyTransition(current.state, target) === TRANSITION_OUTCOMES.REPLAY) {
          return { request: current, assignment, applied: false };
        }
        throw invalidTransitionError(current ? current.state : request.state, target);
      }

      let released = null;
      if (isTerminalTowRequestState(target)) {
        released = await assignments.releaseByRequestId(request.id, {
          reason: releaseReasonForTerminalState(target),
          releasedAt: now,
        });
      }

      return { request: updated, assignment: released ? released.row : assignment, applied: true };
    });

    const settings = await settingsService.get();
    return buildTowRequestDto(outcome.request, {
      max_radius_km: settings.tow_max_radius_km,
      assignment: outcome.assignment ? buildAssignmentDto(outcome.assignment) : null,
      payment: await paymentSummaryFor(paymentRepository, outcome.request.id),
      allowed_actions: allowedActionsForRequest({
        state: outcome.request.state,
        has_live_proposal: false,
        viewer: 'partner',
      }),
    });
  }

  return {
    startEnRoute: (input) => transition({ ...input, operation: 'start_en_route' }),
    markArrived: (input) => transition({ ...input, operation: 'mark_arrived' }),
    startInTransit: (input) => transition({ ...input, operation: 'start_in_transit' }),
    finishService: (input) => transition({ ...input, operation: 'finish_service' }),
    transition,
  };
}

module.exports = { createExecutionService, LOCATION_ACKNOWLEDGING_OPERATIONS };
