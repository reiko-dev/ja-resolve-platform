/**
 * MVP-03 — partner-facing geographic matching service.
 *
 * `GET /tow/partner/opportunities` answers, for the AUTHENTICATED partner:
 * "which open tow requests are mine to see right now, and what would each one
 * pay?".
 *
 * The feed is request-driven: the candidates are the OPEN requests
 * (`towRequestRepository.listSearchingCandidates`; `SEARCHING` plus the
 * `NEGOTIATING` requests MVP-04 keeps visible while competing proposals may
 * still arrive), and each candidate is
 * evaluated against the authenticated partner by the pure domain policy
 * `evaluateTowMatch` (module → partner identity → availability/online →
 * operational coordinates → MVP-01 eligibility → geodesic radius). This
 * mirrors the legacy partner-side nearby search and avoids a second, divergent
 * query authority.
 *
 * Guarantees enforced here:
 *   - SERVICE CATALOG — the catalog status is NOT a gate here: the feed serves
 *     requests that already exist, and their lifecycle must survive the service
 *     becoming INACTIVE/SOON/DELETED. The status gates NEW requests at creation
 *     only (`tow-request-service.create`);
 *   - the radius is the radius FROZEN on each request, never the live setting;
 *   - a request reaches the RouteProvider ONLY after it has been matched, so an
 *     ineligible or out-of-radius request can never consume a provider call;
 *   - the price is the authoritative MVP-02 quote computed live for the
 *     partner's active vehicle — never a persisted snapshot, never a
 *     straight-line estimate. A provider failure is a 503 and produces no feed
 *     at all (a partially quoted feed would be worse than none);
 *   - ordering is deterministic (distance ascending, then request id), and
 *     pagination slices that ordered list;
 *   - each item describes the opportunity TRUTHFULLY: the request, the actual
 *     active TowVehicle used for eligibility/quote, the authoritative route
 *     quote and price, and the MVP-01 compatibility verdict (carried through,
 *     never recomputed). `opportunity_expires_at` is `null` because MVP-03 owns
 *     no expiry.
 *
 * Deliberately deferred (documented, not silently dropped): a bounding-box
 * pre-filter in SQL. The radius is per-request (a frozen column), so an
 * indexable expression does not exist; MVP-03 scans the OLDEST open
 * (`SEARCHING`/`NEGOTIATING`) requests first (`created_at ASC`, anti-starvation)
 * with a documented cap instead. See
 * `docs/evidence/mvp-03/01-current-state-delta.md` §3.
 */
'use strict';

const {
  evaluateTowMatch,
  selectMatches,
  buildTowRequestDto,
} = require('../domain');
const { validateListQuery } = require('./list-query');

/** Documented scan cap for the candidate query (oldest open request first, `created_at ASC`). */
const DEFAULT_CANDIDATE_SCAN_LIMIT = 500;

function createMatchingService({
  settingsService,
  partnerRepository,
  vehicleRepository,
  documentRepository,
  towRequestRepository,
  quoteService,
  clock,
  candidateScanLimit = DEFAULT_CANDIDATE_SCAN_LIMIT,
}) {
  if (!settingsService) throw new TypeError('createMatchingService requires a settingsService');
  if (!partnerRepository) throw new TypeError('createMatchingService requires a partnerRepository port');
  if (!vehicleRepository) throw new TypeError('createMatchingService requires a vehicleRepository port');
  if (!documentRepository) throw new TypeError('createMatchingService requires a documentRepository port');
  if (!towRequestRepository) throw new TypeError('createMatchingService requires a towRequestRepository port');
  if (!quoteService) throw new TypeError('createMatchingService requires a quoteService');
  if (!clock) throw new TypeError('createMatchingService requires a clock port');

  async function listOpportunitiesForPartner({ partnerId, query } = {}) {
    const filters = validateListQuery(query, { states: [] });

    // 1. The authenticated partner's own operational context.
    const partner = await partnerRepository.findById(partnerId);
    const vehicle = partner ? await vehicleRepository.findActiveByPartner(partner.id) : null;
    const documents = vehicle ? await documentRepository.listByVehicle(vehicle.id) : [];

    // 2. Candidates, then the pure domain decision. No catalog-status gate: the
    //    feed serves requests that already exist.
    const candidates = await towRequestRepository.listSearchingCandidates({ limit: candidateScanLimit });
    const now = clock.now();
    const matches = [];
    for (const request of candidates) {
      const evaluation = evaluateTowMatch({
        request,
        partner,
        vehicle,
        documents,
        now,
      });
      if (evaluation.matched) {
        matches.push({
          request,
          distance_meters: evaluation.distance_meters,
          // MVP-01 verdict, carried through verbatim for the DTO.
          compatibility: evaluation.compatibility,
        });
      }
    }

    const ordered = selectMatches(matches);
    const page = ordered.slice(filters.offset, filters.offset + filters.limit);

    // 4. Quote ONLY what will be returned. A provider failure propagates as
    //    503 `external_dependency_unavailable` with no partial feed.
    const settings = await settingsService.get();
    const items = [];
    for (const match of page) {
      const quote = await quoteService.quoteTow({
        provider: { latitude: partner.latitude, longitude: partner.longitude },
        pickup: match.request.pickup,
        destination: match.request.destination,
        tariff: vehicle.pricing,
      });
      items.push({
        request: buildTowRequestDto(match.request, { max_radius_km: settings.tow_max_radius_km }),
        // The ACTUAL active vehicle used for eligibility and for the quote. The
        // transport projects it to `TowVehicleSummary` (no tariff, no
        // persistence-only columns).
        active_tow_vehicle: vehicle,
        route_quote: quote.route_quote,
        proposed_price: quote.calculated_price,
        compatibility: match.compatibility,
        // MVP-03 owns no expiry: there is no scheduler, no search timeout and no
        // opportunity/proposal lifecycle, so nothing can truthfully expire an
        // opportunity. The field is emitted as `null` (nullable/optional in the
        // contract) until the delivery that owns expiry semantics exists — it is
        // never fabricated from the proposal-expiry setting (MVP-04).
        opportunity_expires_at: null,
      });
    }

    return {
      items,
      meta: { page: filters.page, limit: filters.limit, total: ordered.length },
    };
  }

  return { listOpportunitiesForPartner };
}

module.exports = { createMatchingService, DEFAULT_CANDIDATE_SCAN_LIMIT };
