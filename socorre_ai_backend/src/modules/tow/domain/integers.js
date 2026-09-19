/**
 * MVP-02 — exact integer arithmetic guards.
 *
 * Every distance, duration and money value in the Tow module is a non-negative
 * safe integer in its canonical unit (meters, seconds, cents). Binary floating
 * point is never a source of truth, so values are rejected at the boundary
 * rather than silently truncated, and sums are checked for overflow instead of
 * degrading into an approximate number.
 */
'use strict';

const { validationError } = require('./errors');

/** Largest integer that can be compared and summed without losing precision. */
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {number} the validated integer
 */
function requireSafeNonNegativeInteger(value, field) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw validationError(`${field} must be a non-negative safe integer`, { field });
  }
  return value;
}

/**
 * Exact sum of two non-negative safe integers.
 *
 * @param {number} left
 * @param {number} right
 * @param {string} field used in the overflow error
 * @returns {number}
 */
function addSafeIntegers(left, right, field) {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) {
    throw validationError(`${field} overflowed the safe integer range`, { field });
  }
  return sum;
}

module.exports = {
  MAX_SAFE_INTEGER,
  requireSafeNonNegativeInteger,
  addSafeIntegers,
};
