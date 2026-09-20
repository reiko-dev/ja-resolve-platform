/**
 * MVP-03 — customer-facing TowRequest application service.
 *
 * Owns the three customer operations of this delivery:
 *   - `create`  `POST /tow/requests`  (idempotent, module-gated, radius frozen)
 *   - `getForCustomer`  `GET /tow/requests/{requestId}`  (owner-only)
 *   - `listForCustomer` `GET /tow/requests`  (own history, paginated)
 *
 * Guarantees enforced here:
 *   - the MODULE GATE runs first, before validation, before the idempotent
 *     replay and before any write: a disabled module never persists a request
 *     and never replays an old one (409 `service_module_disabled`);
 *   - creation is idempotent through the repository's atomic
 *     `(customer_id, idempotency_key)` resolution. A replay with the same
 *     payload returns the SAME request; a replay with a different payload is a
 *     409 `idempotency_conflict` and changes nothing;
 *   - the radius is frozen from `tow_initial_radius_km` AT CREATION TIME and
 *     persisted on the row; later settings changes never re-scope a request;
 *   - the new request is always `SEARCHING`. MVP-03 has no state machine, no
 *     assignment, no expiry and no scheduler, so nothing else is reachable;
 *   - reading is strictly owner-scoped. A foreign request is a 403
 *     `not_request_owner` (never a 404), so the caller learns the id exists but
 *     is not theirs — the legacy contract of the module and the honest answer
 *     for a support flow.
 *
 * MVP-04 EXT: reads now report the ASSIGNMENT and the truthful `allowed_actions`.
 * Both are resolved in batch for a page of requests (two queries, never one per
 * row): the assignment comes from `tow_assignments` — the only authority on
 * occupancy — and `accept_proposal` is offered only while the request is open AND
 * at least one proposal is still actionable. A request with no live proposal
 * therefore advertises no action, which is the honest answer at that instant.
 */
'use strict';

const {
  TowError,
  isTowRequestId,
  validateCreateTowRequestInput,
  validateIdempotencyKey,
  canonicalFingerprintSource,
  buildTowRequestRecord,
  buildTowRequestDto,
  buildAssignmentDto,
  allowedActionsForRequest,
} = require('../domain');
const { validateListQuery } = require('./list-query');

function createTowRequestService({
  moduleService,
  settingsService,
  towRequestRepository,
  towProposalRepository = null,
  assignmentRepository = null,
  clock,
}) {
  if (!moduleService) throw new TypeError('createTowRequestService requires a moduleService');
  if (!settingsService) throw new TypeError('createTowRequestService requires a settingsService');
  if (!towRequestRepository) throw new TypeError('createTowRequestService requires a towRequestRepository port');
  if (!clock) throw new TypeError('createTowRequestService requires a clock port');

  function toDto(row, settings, extras = {}) {
    return buildTowRequestDto(row, {
      max_radius_km: settings.tow_max_radius_km,
      assignment: extras.assignment ?? null,
      allowed_actions: extras.allowed_actions ?? [],
    });
  }

  /** Which of these requests have at least one actionable proposal right now? */
  async function liveRequestIds(rows) {
    if (!towProposalRepository || rows.length === 0) return new Set();
    const ids = await towProposalRepository.findLiveRequestIds(rows.map((row) => row.id), {
      now: clock.now(),
    });
    return new Set(ids.map(String));
  }

  function actionsFor(row, liveIds) {
    return allowedActionsForRequest({
      state: row.state,
      has_live_proposal: liveIds.has(String(row.id)),
    });
  }

  async function create({ customerId, payload, idempotencyKey } = {}) {
    // 1. Module gate. Evaluated before ANY other step: a disabled module must
    //    fail identically for a brand new request and for a replay.
    await moduleService.assertNewBusinessAllowed();

    // 2. Frozen input shape + key window.
    const input = validateCreateTowRequestInput(payload);
    const key = validateIdempotencyKey(idempotencyKey);

    // 3. The radius is a creation-time snapshot, not a live reference.
    const settings = await settingsService.get();
    const record = buildTowRequestRecord({
      input,
      customerId,
      radiusKm: settings.tow_initial_radius_km,
      idempotencyKey: key,
      now: clock.now(),
    });

    // 4. Atomic create-or-replay. The fingerprint source stays transient: the
    //    adapter persists only its digest.
    const { row, same_payload: samePayload } = await towRequestRepository.createIdempotent(record, {
      fingerprintSource: canonicalFingerprintSource(input),
    });

    if (!samePayload) {
      throw new TowError(
        'idempotency_conflict',
        'Idempotency-Key was already used with a different payload'
      );
    }

    return toDto(row, settings);
  }

  async function getForCustomer({ customerId, requestId } = {}) {
    // A non-canonical id can never match a row; answering 404 here also keeps
    // garbage away from the database (an integer column must not be asked to
    // compare against 'abc').
    if (!isTowRequestId(requestId)) {
      throw new TowError('not_found', 'Tow request not found');
    }

    const own = await towRequestRepository.findByIdForCustomer(requestId, customerId);
    if (own) {
      const settings = await settingsService.get();
      const assignment = assignmentRepository
        ? await assignmentRepository.findByRequestId(own.id)
        : null;
      const liveIds = await liveRequestIds([own]);
      return toDto(own, settings, {
        assignment: assignment ? buildAssignmentDto(assignment) : null,
        allowed_actions: actionsFor(own, liveIds),
      });
    }

    const existing = await towRequestRepository.findById(requestId);
    if (existing) {
      throw new TowError('not_request_owner', 'Tow request belongs to another customer');
    }
    throw new TowError('not_found', 'Tow request not found');
  }

  async function listForCustomer({ customerId, query } = {}) {
    const filters = validateListQuery(query);
    const settings = await settingsService.get();

    const { rows, total } = await towRequestRepository.listForCustomer(customerId, {
      limit: filters.limit,
      offset: filters.offset,
      state: filters.state,
      from: filters.from,
      to: filters.to,
    });

    const assignments = assignmentRepository
      ? await assignmentRepository.findByRequestIds(rows.map((row) => row.id))
      : [];
    const assignmentByRequest = new Map(assignments.map((row) => [String(row.tow_request_id), row]));
    const liveIds = await liveRequestIds(rows);

    return {
      items: rows.map((row) => toDto(row, settings, {
        assignment: assignmentByRequest.has(String(row.id))
          ? buildAssignmentDto(assignmentByRequest.get(String(row.id)))
          : null,
        allowed_actions: actionsFor(row, liveIds),
      })),
      meta: { page: filters.page, limit: filters.limit, total },
    };
  }

  return { create, getForCustomer, listForCustomer };
}

module.exports = { createTowRequestService };
