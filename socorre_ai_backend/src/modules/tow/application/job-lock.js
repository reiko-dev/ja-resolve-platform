/**
 * MVP-05 — the transactional preamble shared by every write of this delivery.
 *
 * The order of the four steps is the security and consistency contract, not an
 * implementation detail:
 *
 *   1. CANONICAL ID — a non-canonical path segment can never name a row, so it
 *      is answered 404 before an integer column is asked to compare against
 *      `'abc'`;
 *   2. LOCK — `SELECT ... FOR UPDATE` on the request is what serializes two
 *      partners (or a partner and the customer) acting on the same job. On the
 *      SQLite harness, where row locks do not exist, the guarded CAS write of
 *      the repository is the equivalent serialization point;
 *   3. OWNERSHIP — the authenticated principal is checked against the row's own
 *      authority (`customer_id`, or `tow_assignments.partner_id`) BEFORE the
 *      state is inspected, so a foreign caller can never use the error code as a
 *      state oracle;
 *   4. the caller then classifies the transition and writes.
 *
 * All three functions return the locked request row (and, for the partner path,
 * the assignment) and throw the canonical `TowError`s: `not_found` (404),
 * `not_request_owner` (403) and `not_assigned_partner` (403).
 */
'use strict';

const { TowError, isTowRequestId, assertAssignedPartner } = require('../domain');

/** 404 for anything that cannot be a canonical id, before touching the database. */
function requireCanonicalRequestId(requestId) {
  if (!isTowRequestId(requestId)) {
    throw new TowError('not_found', 'Tow request not found');
  }
  return requestId;
}

/**
 * Locks a request for a write by its OWNING CUSTOMER.
 *
 * @throws {TowError} `not_found` | `not_request_owner`
 */
async function lockRequestForCustomer({ requests, requestId, customerId }) {
  requireCanonicalRequestId(requestId);

  const request = await requests.lockById(requestId);
  if (!request) throw new TowError('not_found', 'Tow request not found');

  if (String(request.customer_id) !== String(customerId)) {
    throw new TowError('not_request_owner', 'Tow request belongs to another customer');
  }
  return request;
}

/**
 * Locks a request for a write by its ASSIGNED PARTNER.
 *
 * @returns {Promise<{request: object, assignment: object}>}
 * @throws {TowError} `not_found` | `not_assigned_partner`
 */
async function lockJobForPartner({ requests, assignments, requestId, partnerId }) {
  requireCanonicalRequestId(requestId);

  const request = await requests.lockById(requestId);
  if (!request) throw new TowError('not_found', 'Tow request not found');

  const assignment = await assignments.findByRequestId(requestId);
  assertAssignedPartner(assignment, partnerId);

  return { request, assignment };
}

module.exports = { requireCanonicalRequestId, lockRequestForCustomer, lockJobForPartner };
