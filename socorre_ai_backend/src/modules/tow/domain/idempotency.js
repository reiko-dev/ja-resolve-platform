/**
 * MVP-03 — idempotency contract of `POST /tow/requests`.
 *
 * The contract marks `Idempotency-Key` as REQUIRED (8–128 characters). The key
 * is scoped per customer, never global, and the pair
 * `(customer_id, idempotency_key)` is the uniqueness authority in the database
 * (`docs/evidence/mvp-03/03-persistence-decision.md` §3).
 *
 * Split of responsibilities:
 *   - this file owns the key WINDOW and the canonical fingerprint SOURCE;
 *   - the adapter owns hashing (`node:crypto` never enters Domain/Application)
 *     and the atomic insert-or-replay.
 *
 * `canonicalFingerprintSource` returns a deterministic, order-independent
 * string built from the *normalized* input. It is transient: only its SHA-256
 * digest is persisted, and only the digest is ever compared. Two payloads that
 * normalize to the same value are the same request; anything else is a
 * `409 idempotency_conflict`.
 */
'use strict';

const { validationError } = require('./errors');
const { validateCreateTowRequestInput } = require('./tow-request');

const IDEMPOTENCY_KEY_MIN_LENGTH = 8;
const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

/**
 * Validates the `Idempotency-Key` header value.
 *
 * @param {unknown} value raw header (Express gives `undefined` when absent)
 * @returns {string} the trimmed key
 */
function validateIdempotencyKey(value) {
  if (value === undefined || value === null) {
    throw validationError('Idempotency-Key header is required', {
      field: 'Idempotency-Key',
      reason: 'missing',
    });
  }
  if (Array.isArray(value) || typeof value !== 'string') {
    throw validationError('Idempotency-Key must be a single string header', { field: 'Idempotency-Key' });
  }

  const key = value.trim();
  if (key.length < IDEMPOTENCY_KEY_MIN_LENGTH) {
    throw validationError(
      `Idempotency-Key must be at least ${IDEMPOTENCY_KEY_MIN_LENGTH} characters`,
      { field: 'Idempotency-Key', reason: 'too_short' }
    );
  }
  if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw validationError(
      `Idempotency-Key must be at most ${IDEMPOTENCY_KEY_MAX_LENGTH} characters`,
      { field: 'Idempotency-Key', reason: 'too_long' }
    );
  }
  return key;
}

/**
 * Deterministic fingerprint source for a creation payload.
 *
 * The output is a JSON array in a fixed field order — never a JSON object,
 * whose key order would depend on the caller's serialization — built from the
 * normalized input. Numeric fields are normalized to their canonical decimal
 * form so `-23.5` and `-23.50` are the same request.
 *
 * TOW ROUND — the tag was bumped to `v2` when the commercial `payment_method`
 * became part of the normalized payload: a source format that ignored a field
 * of the payload would let a future second method replay as a different
 * commercial choice. Consequence, recorded honestly: a key persisted under
 * `v1` (before this delivery) no longer matches, so a retry of a pre-upgrade
 * attempt is a `409 idempotency_conflict` instead of a replay — the same answer
 * the payload itself would get, since creation now requires `payment_method`.
 */
function canonicalFingerprintSource(payload) {
  const input = validateCreateTowRequestInput(payload);
  const { pickup, destination, vehicle } = input;

  return JSON.stringify([
    'tow-request-create-v2',
    [
      pickup.latitude,
      pickup.longitude,
      pickup.formatted_address ?? '',
    ],
    [
      destination.latitude,
      destination.longitude,
      destination.formatted_address ?? '',
    ],
    [
      vehicle.class,
      vehicle.make,
      vehicle.model,
      vehicle.year === null ? '' : vehicle.year,
      vehicle.weight_kg === null ? '' : vehicle.weight_kg,
      vehicle.plate ?? '',
    ],
    input.problem_description,
    input.observations ?? '',
    input.payment_method,
  ]);
}

module.exports = {
  IDEMPOTENCY_KEY_MIN_LENGTH,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  validateIdempotencyKey,
  canonicalFingerprintSource,
};
