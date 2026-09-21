/**
 * Canonical instant normalization for the Tow module.
 *
 * Three representations of the same moment reach the domain:
 *   - `Date` — PostgreSQL `timestamptz` and the Clock port;
 *   - the SQLite harness TEXT `'YYYY-MM-DD HH:MM:SS.mmm'`;
 *   - an ISO-8601 string from a client or a JSON body.
 *
 * Every stored timestamp is normalized to one ISO-8601 instant on the way out so
 * a DTO never leaks a driver detail, and a record builder never persists a
 * half-parsed date. The SQLite form is not parseable by `Date` in every runtime,
 * so it is rewritten explicitly instead of hoped for.
 */
'use strict';

const { validationError } = require('./errors');

/**
 * Normalizes any persisted timestamp representation to an ISO-8601 instant.
 *
 * @param {unknown} value `Date`, epoch-ms number, ISO string, SQLite text, null
 * @returns {string|null} the ISO instant, or the original text when unparseable
 */
function toIsoInstant(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    return Number.isFinite(fromNumber.getTime()) ? fromNumber.toISOString() : null;
  }
  const text = String(value).trim();
  if (text.length === 0) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : text;
}

/**
 * @param {unknown} value candidate instant
 * @param {string} field used in the validation error
 * @returns {string} a guaranteed ISO-8601 instant
 * @throws {TowError} `validation_error` when the value is absent or unparseable
 */
function requireIsoInstant(value, field) {
  const instant = toIsoInstant(value);
  if (instant === null || Number.isNaN(Date.parse(instant))) {
    throw validationError(`${field} must be an ISO-8601 instant`, { field });
  }
  return instant;
}

/** Epoch milliseconds of an instant, or `NaN` when it is not one. */
function instantMillis(value) {
  const instant = toIsoInstant(value);
  return instant === null ? Number.NaN : Date.parse(instant);
}

module.exports = { toIsoInstant, requireIsoInstant, instantMillis };
