/**
 * MVP-04 — canonical row-id predicate.
 *
 * Every canonical Tow aggregate is identified by a positive integer primary
 * key, and every path parameter arrives from the client as a STRING. The
 * persistence layer must therefore never be asked to compare an integer column
 * against `'abc'`, `'1;DROP TABLE'` or `'1.5'`: a non-canonical id can never
 * match a row, and the honest answer is `not_found`, not a driver error and not
 * a 500.
 *
 * The predicate is deliberately strict: a string is accepted only when it is
 * entirely digits (surrounding whitespace trimmed) and its numeric value is a
 * positive integer, so `' 7 '` identifies row 7 while `'7a'`, `'0'`, `'-1'` and
 * `'1.5'` identify nothing.
 */
'use strict';

/**
 * @param {unknown} value candidate id (`1`, `'42'`, `' 7 '`)
 * @returns {boolean} true when `value` can identify a positive-integer row
 */
function isRowId(value) {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0;
  if (typeof value !== 'string') return false;
  return /^\d+$/.test(value.trim()) && Number(value.trim()) > 0;
}

module.exports = { isRowId };
