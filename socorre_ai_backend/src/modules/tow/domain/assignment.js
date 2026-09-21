/**
 * MVP-04 — the Tow assignment aggregate.
 *
 * An assignment is the RESULT of the customer accepting exactly one proposal. It
 * is deliberately thin: it records WHO serves the request, with WHICH vehicle, at
 * the price that was frozen on the winning proposal, and when. It does not
 * restate the route, the tariff or the vehicle description — `proposal_id` is the
 * provenance link and the proposal row is the single snapshot authority, so the
 * two can never drift apart.
 *
 * Occupancy is derived from `released_at`, never from a status column:
 *   - `isAssignmentOccupied(row)` is the ONLY definition of "this partner/vehicle
 *     is on a job". A released assignment stops occupying, which is what makes
 *     the partial unique indexes of migration 005 correct;
 *   - `TowVehicle.active` and `partner.is_available` describe configuration and
 *     willingness to receive NEW work. Neither is occupancy.
 *
 * The aggregate has no `release()` yet: releasing a job belongs to the
 * cancellation/completion flows, which are out of MVP-04 scope. The column and
 * the predicate exist so those flows cannot later invent a different rule.
 *
 * MVP-05 EXT: the release FLOW still lives in the application layer (it is a
 * transaction over the request, the assignment and the clock), but the two
 * invariants it obeys are defined here — `assertAssignedPartner` (who may drive
 * or cancel a job) and `releasePatchFor` (what a release may write).
 */
'use strict';

const { validationError, TowError } = require('./errors');
const { isRowId } = require('./ids');
const { toIsoInstant, requireIsoInstant } = require('./instants');

/** Frozen contract member: the price the customer accepted. */
const INITIAL_ASSIGNMENT_RELEASE_REASON = null;

/** @param {unknown} value @returns {boolean} */
function isTowAssignmentId(value) {
  return isRowId(value);
}

/**
 * @param {object|null} assignment a stored assignment row (or the DTO)
 * @returns {boolean} true while the assignment holds a live job
 */
function isAssignmentOccupied(assignment) {
  if (!assignment || typeof assignment !== 'object') return false;
  return assignment.released_at === null || assignment.released_at === undefined;
}

/**
 * Builds the persistable assignment record created by an accept.
 *
 * The record maps 1:1 onto the `tow_assignments` columns minus `id`. The route,
 * the tariff and the vehicle description are NOT copied: they already exist on
 * the proposal this row points at.
 *
 * @param {object} input
 * @returns {Readonly<object>}
 */
function buildAssignmentRecord({
  tow_request_id: requestId,
  proposal_id: proposalId,
  partner_id: partnerId,
  tow_vehicle_id: vehicleId,
  final_price: finalPrice,
  vehicle_snapshot: vehicleSnapshot,
  assigned_at: assignedAt,
  created_at: createdAt,
  updated_at: updatedAt,
} = {}) {
  if (!isRowId(requestId)) throw validationError('tow_request_id must identify a tow request', { field: 'tow_request_id' });
  if (!isRowId(proposalId)) throw validationError('proposal_id must identify a proposal', { field: 'proposal_id' });
  if (!isRowId(partnerId)) throw validationError('partner_id must identify a partner', { field: 'partner_id' });
  if (!isRowId(vehicleId)) throw validationError('tow_vehicle_id must identify a tow vehicle', { field: 'tow_vehicle_id' });

  if (!finalPrice || typeof finalPrice !== 'object' || Array.isArray(finalPrice)) {
    throw validationError('final_price is required', { field: 'final_price' });
  }
  if (finalPrice.currency !== 'BRL') {
    throw validationError('final_price.currency must be BRL', { field: 'final_price.currency' });
  }
  const amountCents = finalPrice.amount_cents;
  if (typeof amountCents !== 'number' || !Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw validationError('final_price.amount_cents must be a non-negative safe integer', {
      field: 'final_price.amount_cents',
    });
  }

  if (!vehicleSnapshot || typeof vehicleSnapshot !== 'object' || Array.isArray(vehicleSnapshot)) {
    throw validationError('vehicle_snapshot is required', { field: 'vehicle_snapshot' });
  }
  const plate = vehicleSnapshot.plate;
  if (typeof plate !== 'string' || plate.trim() === '') {
    throw validationError('vehicle_snapshot.plate is required', { field: 'vehicle_snapshot.plate' });
  }

  return Object.freeze({
    tow_request_id: requestId,
    proposal_id: proposalId,
    partner_id: partnerId,
    tow_vehicle_id: vehicleId,
    final_price_amount_cents: amountCents,
    final_price_currency: 'BRL',
    vehicle_plate: plate.trim(),
    assigned_at: requireIsoInstant(assignedAt, 'assigned_at'),
    released_at: null,
    release_reason: INITIAL_ASSIGNMENT_RELEASE_REASON,
    created_at: requireIsoInstant(createdAt, 'created_at'),
    updated_at: requireIsoInstant(updatedAt, 'updated_at'),
  });
}

/**
 * MVP-05 — who may drive, track or cancel a job.
 *
 * The ONLY authority is `tow_assignments.partner_id`: the partner that won the
 * accept. A valid tow partner holding a different job is not "forbidden" in the
 * generic sense — the caller is authenticated and authorized for the module —
 * so the answer is the specific `not_assigned_partner` (403), which tells the
 * client the truth without leaking the request's state.
 *
 * The check is deliberately OWNERSHIP-FIRST and is performed before any state
 * inspection: a foreign partner must never be able to distinguish "the job is in
 * ARRIVED" from "the job is COMPLETED" by the error it receives.
 *
 * @param {object|null} assignment the request's assignment row (released or not)
 * @param {unknown} partnerId the authenticated partner's `partners.id`
 * @throws {TowError} `not_assigned_partner` when the assignment is missing or
 * belongs to somebody else
 */
function assertAssignedPartner(assignment, partnerId) {
  if (!assignment || typeof assignment !== 'object') {
    throw new TowError('not_assigned_partner', 'Tow request is not assigned to this partner');
  }
  if (String(assignment.partner_id) !== String(partnerId)) {
    throw new TowError('not_assigned_partner', 'Tow request is assigned to another partner');
  }
  return assignment;
}

/**
 * The public `Assignment` representation, embedded in `TowRequest`.
 * Exactly the four contract members: the customer sees who is coming, with what,
 * for how much, and since when. The internal ids and the release bookkeeping stay
 * inside the module.
 *
 * @param {object} row a stored assignment row (already mapped by the adapter)
 * @returns {object}
 */
function buildAssignmentDto(row) {
  if (!row || typeof row !== 'object') {
    throw validationError('a stored assignment row is required', { field: 'assignment' });
  }
  return {
    partner_id: String(row.partner_id),
    tow_vehicle_id: String(row.tow_vehicle_id),
    final_price: {
      amount_cents: row.final_price_amount_cents,
      currency: row.final_price_currency,
    },
    assigned_at: toIsoInstant(row.assigned_at),
  };
}

module.exports = {
  isTowAssignmentId,
  isAssignmentOccupied,
  assertAssignedPartner,
  buildAssignmentRecord,
  buildAssignmentDto,
};
