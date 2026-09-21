/**
 * MVP-04 — the atomic assignment.
 *
 * `POST /tow/proposals/{proposalId}/accept` is the single place in the module
 * where a proposal becomes a job. Everything about it is designed around one
 * requirement: **exactly one assignment per request, ever**.
 *
 * How that is guaranteed, in order of authority:
 *   1. the whole accept runs in ONE database transaction (`UnitOfWork`);
 *   2. the request row is locked (`SELECT ... FOR UPDATE` on PostgreSQL) so two
 *      simultaneous accepts of two proposals of the same request serialize, and
 *      the loser OBSERVES the winner instead of racing it;
 *   3. the winner's proposal row is locked too, so the same proposal cannot be
 *      accepted twice;
 *   4. the write itself relies on the database, never on a read-then-write
 *      decision: `tow_assignments.tow_request_id` is UNIQUE (one assignment per
 *      request, ever) and `tow_assignments.proposal_id` is UNIQUE (the accept
 *      idempotency key). The partial unique indexes on the live rows add the
 *      occupancy rule: a partner or a vehicle already on a job cannot be given a
 *      second one.
 *
 * The `Idempotency-Key` header is REQUIRED by the canonical contract and is
 * validated (8–128 chars, the shared domain validator) before the transaction is
 * opened, but it is NOT the idempotency authority: the proposal id is. Replaying
 * an accept of the same proposal returns the SAME assignment — with a different
 * valid key as well — because a second job for the same proposal is impossible by
 * construction.
 *
 * The response is the full `TowRequestResponse`: the customer sees the request
 * in its new `ASSIGNED` state, with the frozen final price and an empty
 * `allowed_actions` (nothing further is legal on an assigned request).
 */
'use strict';

const {
  TowError,
  isTowProposalId,
  isOpenTowRequestState,
  buildTowRequestDto,
  buildAssignmentRecord,
  buildAssignmentDto,
  assertProposalActionable,
  allowedActionsForRequest,
  validateIdempotencyKey,
} = require('../domain');
const { paymentSummaryFor } = require('./payment-summary');

function createAssignmentService({
  moduleService,
  settingsService,
  towRequestRepository,
  towProposalRepository,
  assignmentRepository,
  paymentRepository = null,
  unitOfWork,
  clock,
}) {
  if (!moduleService) throw new TypeError('createAssignmentService requires a moduleService');
  if (!settingsService) throw new TypeError('createAssignmentService requires a settingsService');
  if (!towRequestRepository) throw new TypeError('createAssignmentService requires a towRequestRepository port');
  if (!towProposalRepository) throw new TypeError('createAssignmentService requires a towProposalRepository port');
  if (!assignmentRepository) throw new TypeError('createAssignmentService requires an assignmentRepository port');
  if (!unitOfWork) throw new TypeError('createAssignmentService requires a unitOfWork port');
  if (!clock) throw new TypeError('createAssignmentService requires a clock port');

  /**
   * The transactional body.
   *
   * The three repositories it receives are ALREADY bound to `trx`: a query
   * issued on the pool while this transaction is open would escape it (and would
   * deadlock the single-connection SQLite harness), so every read and every write
   * below goes through these handles.
   */
  async function acceptWithin({ customerId, proposalId, now }, { requests, proposals, assignmentRepository }) {
    const proposal = await proposals.findById(proposalId);
    if (!proposal) throw new TowError('not_found', 'Tow proposal not found');

    const towRequest = await requests.findById(proposal.tow_request_id);
    if (!towRequest) throw new TowError('not_found', 'Tow request not found');
    if (String(towRequest.customer_id) !== String(customerId)) {
      throw new TowError('not_request_owner', 'Tow request belongs to another customer');
    }

    // Serialization point: every accept of this request passes through this lock.
    //
    // The row the lock RETURNS is the state committed by whoever held the lock
    // before us, and it is the only one the guards and the response may use. The
    // snapshot read above predates the serialization point: on PostgreSQL a loser
    // that kept it would answer `proposal_not_actionable` about a request another
    // transaction has already assigned, and an idempotent replay would report a
    // stale `NEGOTIATING`. A loser must OBSERVE the winner.
    const lockedRequest = (await requests.lockById(towRequest.id)) || towRequest;

    // Replayed accept. Checked BEFORE the state guards on purpose: the request of
    // a successful accept is `ASSIGNED`, which would otherwise be reported as a
    // conflict instead of the idempotent replay the contract promises.
    const existing = await assignmentRepository.findByProposalId(proposal.id);
    if (existing) return { assignment: existing, request: lockedRequest };

    if (lockedRequest.state === 'ASSIGNED') {
      throw new TowError('request_already_assigned', 'This tow request is already assigned to another proposal');
    }
    if (!isOpenTowRequestState(lockedRequest.state)) {
      throw new TowError('proposal_not_actionable', 'This tow request no longer accepts a proposal', {
        details: { state: lockedRequest.state },
      });
    }

    const locked = (await proposals.lockById(proposal.id)) || proposal;
    assertProposalActionable(locked, now);

    const record = buildAssignmentRecord({
      tow_request_id: locked.tow_request_id,
      proposal_id: locked.id,
      partner_id: locked.partner_id,
      tow_vehicle_id: locked.tow_vehicle_id,
      final_price: { amount_cents: locked.price_amount_cents, currency: locked.price_currency },
      vehicle_snapshot: { plate: locked.vehicle_plate },
      assigned_at: now,
      created_at: now,
      updated_at: now,
    });

    // The database decides. A pre-read could not: between the read and the write
    // another transaction may commit.
    const { row, conflict } = await assignmentRepository.createForProposal(record);

    if (conflict === 'proposal') {
      const winner = await assignmentRepository.findByProposalId(proposal.id);
      if (winner) return { assignment: winner, request: lockedRequest };
      throw new TowError('request_already_assigned', 'This tow request is already assigned to another proposal');
    }
    if (conflict === 'request') {
      throw new TowError('request_already_assigned', 'This tow request is already assigned to another proposal');
    }
    if (conflict) {
      // A live assignment already occupies this partner or this vehicle. The
      // module has no `partner_busy` code in the frozen contract: the honest
      // answer is the generic 409 `conflict`.
      throw new TowError('conflict', 'The partner or the vehicle is already on a live job', {
        details: { reason: conflict },
      });
    }

    const assignedRequest = await requests.markAssigned(lockedRequest.id, { updatedAt: now });
    await proposals.markAccepted(locked.id, { decidedAt: now });
    await proposals.closeActiveForRequestExcept(lockedRequest.id, { exceptProposalId: locked.id, decidedAt: now });

    return { assignment: row, request: assignedRequest || lockedRequest };
  }

  async function accept({ customerId, proposalId, idempotencyKey } = {}) {
    // 1. Module gate FIRST: a disabled module never assigns, and never replays.
    await moduleService.assertNewBusinessAllowed();

    // 2. The canonical `Idempotency-Key` header is REQUIRED (8–128 chars). It is
    //    validated with the SAME domain validator the create paths use — never a
    //    second length policy — and BEFORE the transaction is opened, so a
    //    missing or malformed header inserts zero assignment rows and changes no
    //    proposal state. The key is deliberately NOT the idempotency authority:
    //    `proposal_id` plus the PostgreSQL unique constraints remain that
    //    authority, so a replay with a different valid key still returns the SAME
    //    assignment.
    validateIdempotencyKey(idempotencyKey);

    // 3. A non-canonical id can never match a row.
    if (!isTowProposalId(proposalId)) throw new TowError('not_found', 'Tow proposal not found');

    const now = clock.now();
    const outcome = await unitOfWork.run(async (trx) => acceptWithin({ customerId, proposalId, now }, {
      requests: towRequestRepository.withTransaction(trx),
      proposals: towProposalRepository.withTransaction(trx),
      assignmentRepository: assignmentRepository.withTransaction(trx),
    }));

    const settings = await settingsService.get();
    return buildTowRequestDto(outcome.request, {
      max_radius_km: settings.tow_max_radius_km,
      assignment: buildAssignmentDto(outcome.assignment),
      payment: await paymentSummaryFor(paymentRepository, outcome.request.id),
      allowed_actions: allowedActionsForRequest({
        state: outcome.request.state,
        has_live_proposal: false,
        viewer: 'customer',
      }),
    });
  }

  return { accept };
}

module.exports = { createAssignmentService };
