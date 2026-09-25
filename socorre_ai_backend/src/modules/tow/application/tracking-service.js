/**
 * MVP-05 — current partner tracking.
 *
 *   `write`  `POST /tow/requests/{requestId}/tracking`   assigned partner, 202
 *   `read`   `GET  /tow/requests/{requestId}/tracking`   owner customer OR assigned partner
 *
 * The delivery is CURRENT POSITION ONLY. There is no trail, no ETA, no
 * geofence and no route call: the response's `route` is composed from the
 * canonical request's own `pickup`/`destination` columns, so reading tracking
 * never spends a RouteProvider call and never invents a second route authority.
 *
 * WRITE authority is the assignment (`tow_assignments.partner_id`), exactly like
 * the milestone operations: a valid tow partner holding another job is a 403
 * `not_assigned_partner`, and the check runs BEFORE the state is inspected.
 *
 * WRITE legality is the state machine's: only the four non-terminal execution
 * states accept a point. A terminal job is a 409 `invalid_tow_state` (with
 * `details.state`) — the position of a finished job is not a thing this delivery
 * stores.
 *
 * WRITE ordering is monotonic on the CLIENT instant (`recorded_at`, persisted as
 * `observed_at`): a strictly older point is a 409 `stale_tracking_update` with
 * `details.recorded_at`, and it leaves the stored row untouched. An equal
 * instant is accepted (a device may re-send the same fix with a better
 * accuracy), a newer one replaces. A client clock running ahead of the backend is
 * accepted rather than clamped: `received_at` is the backend's own instant, so
 * the anomaly stays visible instead of being silently rewritten.
 *
 * READ authority is ownership OR assignment, and the two are indistinguishable
 * from the outside: a customer who is not the owner gets 403 `not_request_owner`
 * and a partner who is not the assignee gets 403 `not_assigned_partner`, so
 * neither can probe a foreign job's existence beyond what the module already
 * tells them.
 *
 * No module gate: tracking is DRAIN work for an already-assigned job.
 */
'use strict';

const {
  TowError,
  validateIdempotencyKey,
  validateTrackingPoint,
  isTowExecutionState,
  isTerminalTowRequestState,
  invalidStateError,
  assertAssignedPartner,
} = require('../domain');
const { requireCanonicalRequestId, lockJobForPartner } = require('./job-lock');

/**
 * SERVICE LOCATION — the truthful no-op enricher used when no `PlaceDetails`
 * provider is wired (see `place-name-enrichment.js`).
 */
const DEFAULT_PLACE_NAME_ENRICHER = Object.freeze({
  enrichPoints: async () => ({ pickup: null, destination: null }),
});

function createTrackingService({
  towRequestRepository,
  assignmentRepository,
  trackingRepository,
  unitOfWork,
  clock,
  trackingEvents = null,
  placeNameEnricher = DEFAULT_PLACE_NAME_ENRICHER,
}) {
  if (!towRequestRepository) throw new TypeError('createTrackingService requires a towRequestRepository port');
  if (!assignmentRepository) throw new TypeError('createTrackingService requires an assignmentRepository port');
  if (!trackingRepository) throw new TypeError('createTrackingService requires a trackingRepository port');
  if (!unitOfWork) throw new TypeError('createTrackingService requires a unitOfWork port');
  if (!clock) throw new TypeError('createTrackingService requires a clock port');
  if (trackingEvents !== null && typeof trackingEvents.publishTrackingUpdated !== 'function') {
    throw new TypeError('createTrackingService trackingEvents must expose publishTrackingUpdated');
  }
  // A missing provider is the no-op enricher, never a crash on read.
  const enricher = placeNameEnricher ?? DEFAULT_PLACE_NAME_ENRICHER;
  if (typeof enricher.enrichPoints !== 'function') {
    throw new TypeError('createTrackingService placeNameEnricher must expose enrichPoints');
  }

  /** The contract's `TrackingPoint`: the stored observation, never the backend clock. */
  function toPointDto(point) {
    return {
      latitude: point.latitude,
      longitude: point.longitude,
      recorded_at: requireIso(point.observed_at),
    };
  }

  function requireIso(value) {
    // The adapter already maps instants; this keeps the DTO honest even if a
    // driver hands back a raw `Date`.
    return value instanceof Date ? value.toISOString() : value;
  }

  async function write({ partnerId, requestId, payload, idempotencyKey } = {}) {
    // 1. Key window, then the frozen point shape. Both before any write.
    validateIdempotencyKey(idempotencyKey);
    const point = validateTrackingPoint(payload);

    const now = clock.now();
    let canonicalRequestId = null;
    const outcome = await unitOfWork.run(async (trx) => {
      const requests = towRequestRepository.withTransaction(trx);
      const assignments = assignmentRepository.withTransaction(trx);
      const tracking = trackingRepository.withTransaction(trx);

      const { request } = await lockJobForPartner({ requests, assignments, requestId, partnerId });

      if (!isTowExecutionState(request.state) || isTerminalTowRequestState(request.state)) {
        throw invalidStateError(request.state, 'Tracking is not accepted for a terminal tow request');
      }

      canonicalRequestId = request.id;
      return tracking.upsertCurrentPoint({
        tow_request_id: request.id,
        partner_id: partnerId,
        latitude: point.latitude,
        longitude: point.longitude,
        observed_at: point.recorded_at,
        received_at: now,
      });
    });

    if (outcome.stale) {
      throw new TowError('stale_tracking_update', 'A newer tracking point is already stored', {
        details: { recorded_at: point.recorded_at },
      });
    }

    // TOW ROUND — the invalidation signal is published at the SAME point the
    // position is persisted: after the transaction committed, only for the
    // write that actually applied (a stale point already threw above), and
    // never for a terminal request (the state guard runs inside the
    // transaction, before the upsert). The payload carries the canonical
    // request id and the BACKEND instant; the consumer still reconciles through
    // REST. A transport failure is logged and swallowed: the persisted point is
    // the authority, so the write must not fail because a socket is down.
    if (trackingEvents !== null && outcome.applied) {
      try {
        trackingEvents.publishTrackingUpdated({
          request_id: String(canonicalRequestId),
          received_at: requireIso(outcome.point.received_at),
        });
      } catch (error) {
        console.error(
          'Tow tracking event publish failed:',
          error && error.message ? error.message : error
        );
      }
    }

    return toPointDto(outcome.point);
  }

  async function read({ requestId, customerId = null, partnerId = null } = {}) {
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

    const latest = await trackingRepository.findByRequestId(request.id);

    const pickup = {
      latitude: Number(request.pickup.latitude),
      longitude: Number(request.pickup.longitude),
      formatted_address: request.pickup.formatted_address ?? null,
    };
    const destination = {
      latitude: Number(request.destination.latitude),
      longitude: Number(request.destination.longitude),
      formatted_address: request.destination.formatted_address ?? null,
    };
    // SERVICE LOCATION — the persisted place identity travels WITH the
    // ephemeral name: place_id is durable identity (indefinitely storable), and
    // without it the clients' identity invariant drops the name (a place name
    // is never presented without its place id). Omitted for generic points and
    // historical rows, preserving the legacy response exactly.
    if (request.pickup.place_id !== null && request.pickup.place_id !== undefined) {
      pickup.place_id = request.pickup.place_id;
    }
    if (request.destination.place_id !== null && request.destination.place_id !== undefined) {
      destination.place_id = request.destination.place_id;
    }

    // SERVICE LOCATION — tracking is a DETAILED read: when a point carries a
    // persisted `place_id`, the ephemeral `place_name` is attached best-effort.
    // The enricher never throws and never runs on write; a provider outage
    // simply leaves the point address-only, exactly like a legacy row.
    const placeNames = await enricher.enrichPoints({
      pickup: { place_id: request.pickup.place_id ?? null },
      destination: { place_id: request.destination.place_id ?? null },
    });
    if (typeof placeNames.pickup === 'string' && placeNames.pickup.trim() !== '') {
      pickup.place_name = placeNames.pickup.trim();
    }
    if (typeof placeNames.destination === 'string' && placeNames.destination.trim() !== '') {
      destination.place_name = placeNames.destination.trim();
    }

    return {
      latest: latest ? toPointDto(latest) : null,
      route: { pickup, destination },
    };
  }

  return { write, read };
}

module.exports = { createTrackingService };
