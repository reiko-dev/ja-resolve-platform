/**
 * MVP-03 — customer-facing TowRequest application service.
 *
 * Owns the three customer operations of this delivery:
 *   - `create`  `POST /tow/requests`  (idempotent, module-gated, radius frozen)
 *   - `getForCustomer`  `GET /tow/requests/{requestId}`  (owner-only)
 *   - `listForCustomer` `GET /tow/requests`  (own history, paginated)
 *
 * MVP-04 EXT adds the fourth read, the partner mirror of the same authority:
 *   - `listJobsForPartner` `GET /tow/partner/jobs`  (own jobs, paginated)
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
 * TOW ROUND — HYBRID ADDRESS RESOLUTION:
 *   - a client-sent `formatted_address` is preserved verbatim (only the existing
 *     trim/500-char normalization applies) and the resolver is NOT called;
 *   - when an endpoint arrives without an address (absent/null/""/whitespace),
 *     the optional `AddressResolver` port is asked once, best-effort. A provider
 *     failure is logged with a safe reason and the create proceeds with `null`:
 *     geocoding is enrichment, never an operational requirement;
 *   - a known `(customer_id, idempotency_key)` retry skips the resolver
 *     entirely; the atomic create-or-replay and the RAW-payload fingerprint keep
 *     the public idempotency semantics unchanged.
 *
 * MVP-04 EXT: reads now report the ASSIGNMENT and the truthful `allowed_actions`.
 * Both are resolved in batch for a page of requests (two queries, never one per
 * row): the assignment comes from `tow_assignments` — the only authority on
 * occupancy — and `accept_proposal` is offered only while the request is open AND
 * at least one proposal is still actionable. A request with no live proposal
 * therefore advertises no action, which is the honest answer at that instant.
 *
 * SERVICE LOCATION: `getForCustomer` (the customer request DETAIL) may attach
 * the EPHEMERAL `place_name` of an explicit selection through the optional
 * `placeNameEnricher`. Every list — `listForCustomer`, `listJobsForPartner` and
 * the partner opportunity feed — deliberately does NOT enrich: a page of N
 * requests must never become N provider calls. `place_id` is persisted identity
 * and is emitted by the DTO whenever present.
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
  formatResolvedAddress,
} = require('../domain');
const { validateListQuery } = require('./list-query');
const { paymentSummaryFor, paymentSummariesFor } = require('./payment-summary');

/**
 * SERVICE LOCATION — the truthful no-op enricher used when no `PlaceDetails`
 * provider is wired. An absent provider resolves both names to `null` without
 * any call, so every pre-Service-Location test keeps working unchanged.
 */
const DEFAULT_PLACE_NAME_ENRICHER = Object.freeze({
  enrichPoints: async () => ({ pickup: null, destination: null }),
});

function createTowRequestService({
  moduleService,
  settingsService,
  towRequestRepository,
  towProposalRepository = null,
  assignmentRepository = null,
  paymentRepository = null,
  addressResolver = null,
  placeNameEnricher = DEFAULT_PLACE_NAME_ENRICHER,
  clock,
}) {
  if (!moduleService) throw new TypeError('createTowRequestService requires a moduleService');
  if (!settingsService) throw new TypeError('createTowRequestService requires a settingsService');
  if (!towRequestRepository) throw new TypeError('createTowRequestService requires a towRequestRepository port');
  if (!clock) throw new TypeError('createTowRequestService requires a clock port');
  if (addressResolver !== null && typeof addressResolver.resolve !== 'function') {
    throw new TypeError('createTowRequestService addressResolver must expose resolve');
  }
  // A missing provider is the no-op enricher, never a crash on a detail read.
  const enricher = placeNameEnricher ?? DEFAULT_PLACE_NAME_ENRICHER;
  if (typeof enricher.enrichPoints !== 'function') {
    throw new TypeError('createTowRequestService placeNameEnricher must expose enrichPoints');
  }

  /**
   * TOW ROUND — best-effort reverse geocoding of ONE endpoint that arrived
   * without a usable address.
   *
   * Never throws and never blocks the create: a provider failure is logged with
   * a safe reason (never a key, URL or payload) and the endpoint keeps
   * `formatted_address = null`. The domain formatter decides whether the
   * provider answer is a usable address (`NO_ADDRESS` -> null) — coordinates are
   * never turned into an address.
   */
  async function resolveMissingAddress(point) {
    try {
      const candidate = await addressResolver.resolve({
        latitude: point.latitude,
        longitude: point.longitude,
      });
      return formatResolvedAddress(candidate);
    } catch (error) {
      const reason = error && typeof error.reason === 'string' ? error.reason : 'unexpected';
      console.error(`tow_address_resolution_failed reason=${reason}`);
      return null;
    }
  }

  /**
   * Enriches ONLY the endpoints whose `formatted_address` is absent (the create
   * normalization already collapsed null/""/whitespace to null). A client-sent
   * address is preserved verbatim and never sent to the provider. Pickup and
   * destination resolve independently: one failure cannot affect the other.
   */
  async function enrichMissingAddresses(input) {
    const pickupMissing = input.pickup.formatted_address === null;
    const destinationMissing = input.destination.formatted_address === null;
    if (!pickupMissing && !destinationMissing) return input;

    const [pickupAddress, destinationAddress] = await Promise.all([
      pickupMissing ? resolveMissingAddress(input.pickup) : Promise.resolve(input.pickup.formatted_address),
      destinationMissing
        ? resolveMissingAddress(input.destination)
        : Promise.resolve(input.destination.formatted_address),
    ]);

    return Object.freeze({
      ...input,
      pickup: Object.freeze({ ...input.pickup, formatted_address: pickupAddress }),
      destination: Object.freeze({ ...input.destination, formatted_address: destinationAddress }),
    });
  }

  function toDto(row, settings, extras = {}) {
    return buildTowRequestDto(row, {
      max_radius_km: settings.tow_max_radius_km,
      assignment: extras.assignment ?? null,
      allowed_actions: extras.allowed_actions ?? [],
      payment: extras.payment ?? null,
      // SERVICE LOCATION — read-time only, and only when a detailed surface
      // asked for it. Lists never pass `placeNames`, so they never call the
      // provider (no N+1, ADR §8).
      placeNames: extras.placeNames,
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

  /**
   * MVP-05 EXT — `allowed_actions` is VIEWER-AWARE.
   *
   * The same canonical row advertises different legal actions to the customer
   * (who may cancel while the job is not yet in transit) and to the assigned
   * partner (who drives the milestones and may also cancel before pickup). The
   * viewer is a property of the CALLER, never of the row: it is supplied by the
   * service method that already knows which principal it authenticated
   * (`getForCustomer`/`listForCustomer` -> `customer`,
   * `listJobsForPartner` -> `partner`), and it defaults to the customer because
   * that is the narrower surface.
   */
  function actionsFor(row, liveIds, viewer = 'customer') {
    return allowedActionsForRequest({
      state: row.state,
      has_live_proposal: liveIds.has(String(row.id)),
      viewer,
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

    // 3b. TOW ROUND — address enrichment is best-effort and ONLY for endpoints
    //     that arrived without an address. A known (customer, key) retry is
    //     detected first so a replay never spends a geocoding call; the atomic
    //     create-or-replay below remains the idempotency authority and the
    //     fingerprint keeps being built from the RAW payload.
    let resolvedInput = input;
    const needsAddress = input.pickup.formatted_address === null
      || input.destination.formatted_address === null;
    if (addressResolver !== null && needsAddress) {
      const known = await towRequestRepository.findByCustomerAndKey(customerId, key);
      if (!known) resolvedInput = await enrichMissingAddresses(input);
    }

    const record = buildTowRequestRecord({
      input: resolvedInput,
      customerId,
      radiusKm: settings.tow_initial_radius_km,
      idempotencyKey: key,
      now: clock.now(),
    });

    // 4. Atomic create-or-replay. The fingerprint source stays transient: the
    //    adapter persists only its digest. It is built from the RAW payload,
    //    not from the already-normalized input, because the fingerprint source
    //    normalizes internally — feeding it a normalized input would re-validate
    //    the persistence vocabulary (`CASH`) as if it were a client value.
    const { row, same_payload: samePayload } = await towRequestRepository.createIdempotent(record, {
      fingerprintSource: canonicalFingerprintSource(payload),
    });

    if (!samePayload) {
      throw new TowError(
        'idempotency_conflict',
        'Idempotency-Key was already used with a different payload'
      );
    }

    // MVP-06: a replay is a READ of the same canonical row. If the request has
    // since been assigned and/or paid, the response must project exactly what
    // the recovery endpoints project — never a stale empty assignment/payment.
    // The same truthfulness applies to `allowed_actions`: a fresh SEARCHING
    // request is cancellable by its owner (ISSUE #6), and a replay of a row that
    // has since received proposals must offer `accept_proposal` exactly as the
    // recovery read does.
    const assignment = assignmentRepository
      ? await assignmentRepository.findByRequestId(row.id)
      : null;
    const liveIds = await liveRequestIds([row]);
    return toDto(row, settings, {
      assignment: assignment ? buildAssignmentDto(assignment) : null,
      allowed_actions: actionsFor(row, liveIds),
      payment: await paymentSummaryFor(paymentRepository, row.id),
    });
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
      // SERVICE LOCATION — the customer request DETAIL is a detailed surface:
      // it may attach the ephemeral `place_name` of an explicit selection. The
      // enricher never throws, so a provider outage cannot fail this read.
      const placeNames = await enricher.enrichPoints({
        pickup: own.pickup,
        destination: own.destination,
      });
      return toDto(own, settings, {
        assignment: assignment ? buildAssignmentDto(assignment) : null,
        allowed_actions: actionsFor(own, liveIds),
        payment: await paymentSummaryFor(paymentRepository, own.id),
        placeNames,
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
    const payments = await paymentSummariesFor(paymentRepository, rows.map((row) => row.id));
    const liveIds = await liveRequestIds(rows);

    return {
      items: rows.map((row) => toDto(row, settings, {
        assignment: assignmentByRequest.has(String(row.id))
          ? buildAssignmentDto(assignmentByRequest.get(String(row.id)))
          : null,
        allowed_actions: actionsFor(row, liveIds),
        payment: payments.get(String(row.id)) ?? null,
      })),
      meta: { page: filters.page, limit: filters.limit, total },
    };
  }

  /**
   * MVP-04 EXT — `GET /tow/partner/jobs`: the jobs OWNED by the authenticated
   * partner.
   *
   * The authority is exactly the one the customer recovery path reads:
   * `tow_assignments` decides which jobs exist, and `buildAssignmentDto` renders
   * the four contract members. The request is projected by the shared
   * `buildTowRequestDto`, so for the same request the customer and the partner
   * see the IDENTICAL `partner_id`, `tow_vehicle_id`, `final_price` and
   * `assigned_at` — there is no second DTO and no second assignment state.
   *
   * `partnerId` is always `req.user.partner_id`; it is never read from the query,
   * the body or the path, so a partner cannot widen the row set.
   *
   * Filters, all validated by the shared `validateListQuery`:
   *   - `state`  → the request state (canonical enum);
   *   - `page`/`limit` → the module pagination convention (1/20, max 100);
   *   - `from`/`to` → INCLUSIVE bounds on `assignment.assigned_at`, the only
   *     timestamp a job owns (documented in the canonical contract, draft.8).
   */
  async function listJobsForPartner({ partnerId, query } = {}) {
    const filters = validateListQuery(query);
    const settings = await settingsService.get();

    const { rows, total } = await assignmentRepository.listForPartner(partnerId, {
      limit: filters.limit,
      offset: filters.offset,
      state: filters.state,
      from: filters.from,
      to: filters.to,
    });

    const requests = await towRequestRepository.findByIds(rows.map((row) => row.tow_request_id));
    const requestById = new Map(requests.map((row) => [String(row.id), row]));
    const payments = await paymentSummariesFor(paymentRepository, requests.map((row) => row.id));
    const liveIds = await liveRequestIds(requests);

    return {
      items: rows
        .filter((row) => requestById.has(String(row.tow_request_id)))
        .map((row) => {
          const towRequest = requestById.get(String(row.tow_request_id));
          return toDto(towRequest, settings, {
            assignment: buildAssignmentDto(row),
            allowed_actions: actionsFor(towRequest, liveIds, 'partner'),
            payment: payments.get(String(towRequest.id)) ?? null,
          });
        }),
      meta: { page: filters.page, limit: filters.limit, total },
    };
  }

  return { create, getForCustomer, listForCustomer, listJobsForPartner };
}

module.exports = { createTowRequestService };
