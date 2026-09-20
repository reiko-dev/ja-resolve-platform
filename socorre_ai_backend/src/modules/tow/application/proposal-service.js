/**
 * MVP-04 — partner-facing proposal service.
 *
 * Owns the three partner/customer operations of the proposal lifecycle:
 *   - `createForPartner`  `POST /tow/requests/{requestId}/proposals`
 *   - `listForRequest`    `GET  /tow/requests/{requestId}/proposals` (owner-only)
 *   - `listForPartner`    `GET  /tow/partner/proposals`
 *   - `withdraw`          `POST /tow/proposals/{proposalId}/withdraw`
 *
 * Guarantees enforced here:
 *   - the MODULE GATE runs FIRST, before validation and before any provider
 *     call: a disabled module is a 409 with ZERO Google calls;
 *   - the price is NEVER an input. The body must be empty; a client that names a
 *     price, a distance or an identity is refused with 422 before anything is
 *     read or called;
 *   - ELIGIBILITY IS REVALIDATED at creation time through the very same pure
 *     policy that decides the MVP-03 opportunity feed (`evaluateTowMatch`). The
 *     create path therefore cannot be more permissive than the feed, and it
 *     cannot be stricter either: whatever the partner could see, the partner can
 *     propose on. A request the partner cannot see is a 404 — never a 409 — so a
 *     partner cannot probe requests outside its frozen radius;
 *   - the RouteProvider is called ONLY after every cheap and absolute check has
 *     passed, so an ineligible attempt never consumes a provider call and never
 *     writes a row;
 *   - the proposal SNAPSHOTS the route, the tariff, the vehicle description and
 *     the partner's business name. Later edits never rewrite an existing offer;
 *   - creation is idempotent through `(partner_id, idempotency_key)`: a replay
 *     returns the SAME proposal and does not re-price, a replay with a different
 *     vehicle is a 409 `idempotency_conflict`, and a SECOND live proposal for the
 *     same request is a 409 `proposal_already_active`;
 *   - the first proposal moves the request `SEARCHING -> NEGOTIATING`. The
 *     transition is guarded in SQL, so two partners proposing at the same moment
 *     cannot fight over it.
 *
 * Deliberately out of scope (documented, not invented): a maximum number of
 * proposals per request. No TOW-PROP rule mandates one and no Tow setting
 * defines one, so the module does not impose a limit it cannot configure.
 */
'use strict';

const {
  TowError,
  isTowRequestId,
  isTowProposalId,
  isOpenTowRequestState,
  TOW_PROPOSAL_STATUSES,
  validateCreateTowProposalInput,
  validateIdempotencyKey,
  canonicalProposalFingerprintSource,
  buildTowProposalRecord,
  buildTowProposalDto,
  assertProposalActionable,
  evaluateTowMatch,
  summarizeDocumentStatus,
} = require('../domain');
const { validateListQuery } = require('./list-query');

/** Proposal statuses a partner may filter by (contract enum, unchanged). */
const PROPOSAL_FILTER_STATUSES = TOW_PROPOSAL_STATUSES;

function createProposalService({
  moduleService,
  settingsService,
  partnerRepository,
  vehicleRepository,
  documentRepository,
  towRequestRepository,
  towProposalRepository,
  quoteService,
  clock,
}) {
  if (!moduleService) throw new TypeError('createProposalService requires a moduleService');
  if (!settingsService) throw new TypeError('createProposalService requires a settingsService');
  if (!partnerRepository) throw new TypeError('createProposalService requires a partnerRepository port');
  if (!vehicleRepository) throw new TypeError('createProposalService requires a vehicleRepository port');
  if (!documentRepository) throw new TypeError('createProposalService requires a documentRepository port');
  if (!towRequestRepository) throw new TypeError('createProposalService requires a towRequestRepository port');
  if (!towProposalRepository) throw new TypeError('createProposalService requires a towProposalRepository port');
  if (!quoteService) throw new TypeError('createProposalService requires a quoteService');
  if (!clock) throw new TypeError('createProposalService requires a clock port');

  function notFound() {
    return new TowError('not_found', 'Tow request not found');
  }

  /**
   * The eligibility verdict of `(request, authenticated partner)`.
   *
   * `outside_radius` becomes a 404 on purpose: the feed never showed that
   * request, so admitting that it exists would leak the customer's pickup
   * location to a partner outside the frozen search radius.
   */
  function assertMatchable(match) {
    if (match.matched) return match;
    if (match.code === 'outside_radius') throw notFound();
    if (match.code === 'validation_error') {
      throw new TowError('validation_error', 'Tow request coordinates are not usable', {
        details: { reasons: [...match.reasons] },
      });
    }
    throw new TowError(match.code, 'The partner cannot propose on this request', {
      details: { reasons: [...match.reasons] },
    });
  }

  /** The status filter of a list query, validated against the contract enum. */
  function parseStatusFilter(query) {
    const raw = query ? query.status : undefined;
    if (raw === undefined || raw === null || raw === '') return null;
    if (Array.isArray(raw) || typeof raw !== 'string' || !PROPOSAL_FILTER_STATUSES.includes(raw)) {
      throw new TowError('validation_error', `status must be one of ${PROPOSAL_FILTER_STATUSES.join(', ')}`, {
        details: { field: 'status' },
      });
    }
    return raw;
  }

  async function createForPartner({ partnerId, requestId, idempotencyKey, body } = {}) {
    // 1. Module gate FIRST: a disabled module must fail identically for a brand
    //    new attempt and for a replay, and must never reach the provider.
    const moduleStatus = await moduleService.assertNewBusinessAllowed();

    // 2. The frozen input shape (empty) and the key window.
    validateCreateTowProposalInput(body);
    const key = validateIdempotencyKey(idempotencyKey);

    // 3. A non-canonical id can never match a row: 404 without touching the DB.
    if (!isTowRequestId(requestId)) throw notFound();
    const towRequest = await towRequestRepository.findById(requestId);
    if (!towRequest) throw notFound();

    // 4. Eligibility revalidation, identical to the opportunity feed. Resolved
    //    before the replay so the CURRENT vehicle is known: the replay must be
    //    able to prove it was made with that same vehicle.
    const now = clock.now();
    const partner = await partnerRepository.findById(partnerId);
    const vehicle = partner ? await vehicleRepository.findActiveByPartner(partner.id) : null;

    // 5. Replay BEFORE any quote: an attempt that already succeeded returns its
    //    own result without re-pricing. `partnerId` is the authenticated
    //    identity, never a client field.
    if (vehicle) {
      const replay = await towProposalRepository.findReplay({
        partnerId,
        idempotencyKey: key,
        fingerprintSource: canonicalProposalFingerprintSource({
          partner_id: partner.id,
          tow_request_id: towRequest.id,
          tow_vehicle_id: vehicle.id,
        }),
      });
      if (replay) {
        if (!replay.same_payload) {
          throw new TowError('idempotency_conflict', 'Idempotency-Key was already used with a different payload');
        }
        return buildTowProposalDto(replay.row);
      }
    }

    const documents = vehicle ? await documentRepository.listByVehicle(vehicle.id) : [];
    const match = assertMatchable(evaluateTowMatch({
      request: towRequest,
      partner,
      moduleStatus,
      vehicle,
      documents,
      now,
    }));

    // 6. The request must still be open to new offers.
    if (!isOpenTowRequestState(towRequest.state)) {
      throw new TowError(
        towRequest.state === 'ASSIGNED' ? 'request_already_assigned' : 'proposal_not_actionable',
        'This tow request no longer accepts proposals',
        { details: { state: towRequest.state } },
      );
    }

    // 7. One live proposal per (request, partner) — the partial index is the
    //    structural guarantee, this is the honest error.
    const active = await towProposalRepository.findActiveForPartnerAndRequest({
      partnerId: partner.id,
      requestId: towRequest.id,
    });
    if (active) {
      throw new TowError('proposal_already_active', 'This partner already has an active proposal for this request');
    }

    // 8. The authoritative quote — the ONLY price source, and the first provider
    //    call of the whole operation.
    const settings = await settingsService.get();
    const quote = await quoteService.quoteTow({
      // The provider's own position, the request's frozen endpoints and the
      // vehicle's stored tariff: exactly the three inputs the opportunity feed
      // quotes with, so the partner sees the same number it was offered.
      provider: { latitude: partner.latitude, longitude: partner.longitude },
      pickup: towRequest.pickup,
      destination: towRequest.destination,
      tariff: vehicle.pricing,
    });

    const expiresAt = new Date(now.getTime() + settings.tow_proposal_expiry_minutes * 60 * 1000);
    const record = buildTowProposalRecord({
      tow_request_id: towRequest.id,
      partner_id: partner.id,
      tow_vehicle_id: vehicle.id,
      route_quote: quote.route_quote,
      pricing_snapshot: quote.pricing_snapshot,
      price: quote.calculated_price,
      vehicle_snapshot: {
        plate: vehicle.plate,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        equipment_type: vehicle.equipment_type,
        supported_vehicle_classes: vehicle.supported_vehicle_classes,
        max_towed_weight_kg: vehicle.max_towed_weight_kg,
        document_status: summarizeDocumentStatus(documents, now),
        active: vehicle.active,
      },
      partner_business_name: partner.business_name,
      expires_at: expiresAt,
      idempotency_key: key,
      created_at: now,
      updated_at: now,
    });

    // 9. Atomic create-or-replay. The fingerprint source stays transient: the
    //    adapter persists only its digest.
    const { row, created, same_payload: samePayload } = await towProposalRepository.createIdempotent(record, {
      fingerprintSource: canonicalProposalFingerprintSource({
        partner_id: partner.id,
        tow_request_id: towRequest.id,
        tow_vehicle_id: vehicle.id,
      }),
    });
    if (!samePayload) {
      throw new TowError('idempotency_conflict', 'Idempotency-Key was already used with a different payload');
    }

    // 10. First proposal opens the negotiation. Guarded in SQL and idempotent by
    //     construction: a concurrent second partner changes 0 rows.
    if (created) {
      await towRequestRepository.markNegotiating(towRequest.id, { updatedAt: now });
    }

    return buildTowProposalDto(row);
  }

  async function listForRequest({ customerId, requestId, query } = {}) {
    const filters = validateListQuery(query, { states: [] });
    const status = parseStatusFilter(query);

    if (!isTowRequestId(requestId)) throw notFound();
    const towRequest = await towRequestRepository.findById(requestId);
    if (!towRequest) throw notFound();
    if (String(towRequest.customer_id) !== String(customerId)) {
      throw new TowError('not_request_owner', 'This tow request belongs to another customer');
    }

    const { rows, total } = await towProposalRepository.listByRequest(requestId, {
      limit: filters.limit,
      offset: filters.offset,
      status,
    });

    return {
      items: rows.map(buildTowProposalDto),
      request_state: towRequest.state,
      meta: { page: filters.page, limit: filters.limit, total },
    };
  }

  async function listForPartner({ partnerId, query } = {}) {
    const filters = validateListQuery(query, { states: [] });
    const status = parseStatusFilter(query);

    const { rows, total } = await towProposalRepository.listByPartner(partnerId, {
      limit: filters.limit,
      offset: filters.offset,
      status,
    });

    return {
      items: rows.map(buildTowProposalDto),
      meta: { page: filters.page, limit: filters.limit, total },
    };
  }

  async function withdraw({ partnerId, proposalId } = {}) {
    // The module gate is first on every write path, withdraw included.
    await moduleService.assertNewBusinessAllowed();

    if (!isTowProposalId(proposalId)) throw new TowError('not_found', 'Tow proposal not found');
    const proposal = await towProposalRepository.findById(proposalId);
    if (!proposal) throw new TowError('not_found', 'Tow proposal not found');
    if (String(proposal.partner_id) !== String(partnerId)) {
      throw new TowError('forbidden', 'This tow proposal belongs to another partner');
    }

    const now = clock.now();
    assertProposalActionable(proposal, now);

    const updated = await towProposalRepository.markWithdrawn(proposal.id, { decidedAt: now });
    return buildTowProposalDto(updated);
  }

  return { createForPartner, listForRequest, listForPartner, withdraw };
}

module.exports = { createProposalService };
