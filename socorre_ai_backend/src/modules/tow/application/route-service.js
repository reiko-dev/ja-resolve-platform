/**
 * B5 — `GET /tow/requests/{requestId}/route` application service
 * (`getTowRequestRoute`, canonical `TowRouteSnapshot`).
 *
 * This is the route VISUALIZATION read of the Tow flow: the owning customer or
 * the assigned partner reads the request's own pickup -> destination route —
 * the authoritative distance/duration plus the Google-compatible
 * `encoded_polyline` the mobile renders. It is deliberately NOT a pricing
 * operation: no tariff is loaded, no price is computed and no `final_price` /
 * `amount_cents` member exists anywhere in the response. The accepted
 * proposal/assignment snapshot stays the ONLY pricing authority.
 *
 * WHY RECOMPUTE ON READ (instead of persisting the polyline)
 * ----------------------------------------------------------
 * `createRouteQuote` owns the geometry, but the polyline is currently dropped
 * before persistence: `tow_request_proposals` stores the two legs (distance and
 * duration only), and no additive migration exists for a byte column. Persisting
 * it would create a SECOND, mutable geometry copy whose lifetime has to be
 * reasoned about (reassignment, cancellation, partial writes) for decoration
 * data that is cheap to re-ask. The runtime therefore calls the SAME
 * `RouteProvider` port the quote already uses, on read, with the request's
 * pickup as `origin` and its destination as `destination` (single-leg mode).
 * The response geometry and the authoritative distance therefore always
 * describe the same request route, and a provider failure is a 503 with NO
 * geometry rather than a stale or fabricated line. No migration is added.
 *
 * PRE-ASSIGNMENT vs POST-ASSIGNMENT
 * ---------------------------------
 * The snapshot is the REQUEST route before and after assignment: the canonical
 * runtime owns no partner/truck origin point for this read (the accepted
 * proposal's frozen provider leg stays on the pricing snapshot) and no
 * persisted polyline, so `route_quote.provider_to_pickup` is never fabricated.
 * The contract does not declare a partner-origin member for `TowRouteSnapshot`
 * beyond the optional base `RouteQuote` leg; this service therefore returns the
 * request route and omits the absent leg. A future delivery that owns a
 * canonical partner-origin geometry may add it without changing this contract.
 *
 * AUTHORIZATION (contract tags: Tow Customer + Tow Partner)
 * ---------------------------------------------------------
 *   - the OWNING customer may read (`not_request_owner` 403 otherwise);
 *   - the ASSIGNED partner may read (`not_assigned_partner` 403 otherwise —
 *     the same `tow_assignments.partner_id` authority every execution write
 *     checks, so a released assignment stops authorizing);
 *   - a non-canonical or unknown id is `not_found` (404) before the database is
 *     asked to compare an integer column against garbage.
 *
 * The identity comes exclusively from the authenticated context; the query and
 * the body can never widen it.
 */
'use strict';

const {
  TowError,
  externalDependencyError,
  validateGeoPoint,
  assertAssignedPartner,
  buildTowRouteSnapshot,
} = require('../domain');
const { requireCanonicalRequestId } = require('./job-lock');

function createRouteService({ routeProvider, towRequestRepository, assignmentRepository, clock }) {
  if (!routeProvider || typeof routeProvider.computeRoute !== 'function') {
    throw new TypeError('createRouteService requires a RouteProvider port');
  }
  if (!towRequestRepository) throw new TypeError('createRouteService requires a towRequestRepository port');
  if (!assignmentRepository) throw new TypeError('createRouteService requires an assignmentRepository port');
  if (!clock || typeof clock.now !== 'function') {
    throw new TypeError('createRouteService requires a clock port');
  }

  /**
   * The two-principal read. Exactly one identity is supplied by the controller:
   * `customerId` for a customer, `partnerId` for a tow partner.
   */
  async function getRequestRoute({ requestId, customerId = null, partnerId = null } = {}) {
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

    // Validate BEFORE the provider call: a malformed persisted point must never
    // spend a provider call and then fail as an availability incident.
    const pickup = validateGeoPoint(request.pickup, 'pickup');
    const destination = validateGeoPoint(request.destination, 'destination');

    let route;
    try {
      route = await routeProvider.computeRoute({ origin: pickup, destination });
    } catch {
      // A transport failure and a malformed provider payload are identical from
      // the caller's perspective: the authoritative route could not be
      // established, so there is no geometry and no estimate. The original
      // error is discarded rather than attached: it can carry a key, a raw
      // payload or a stack, and the 503 must leak none of them.
      throw externalDependencyError('Route provider is unavailable');
    }

    return buildTowRouteSnapshot({ request, route, generatedAt: clock.now() });
  }

  return { getRequestRoute };
}

module.exports = { createRouteService };
