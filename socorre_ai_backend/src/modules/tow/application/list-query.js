/**
 * MVP-03 — shared query contract for the paginated list endpoints.
 *
 * Both `GET /tow/requests` (customer history) and
 * `GET /tow/partner/opportunities` (partner feed) return
 * `{ items, meta: { page, limit, total } }`. The defaults and the ceiling are
 * part of the frozen contract: page 1, limit 20, maximum 100.
 *
 * Strict on purpose: an out-of-range page or a malformed date is a 422
 * `validation_error`, never a silent fallback to the default. Silently ignoring
 * `?limit=100000` would hide a client bug and turn a bounded query into an
 * unbounded one.
 */
'use strict';

const { validationError, TOW_REQUEST_STATES } = require('../domain');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseInteger(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) {
    throw validationError(`${field} must be a single value`, { field });
  }
  if (typeof value === 'string' && !/^-?\d+$/.test(value.trim())) {
    throw validationError(`${field} must be an integer`, { field });
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw validationError(`${field} must be an integer`, { field });
  }
  return parsed;
}

function parseInstant(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value) || typeof value !== 'string') {
    throw validationError(`${field} must be an ISO-8601 instant`, { field });
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw validationError(`${field} must be an ISO-8601 instant`, { field });
  }
  return parsed;
}

/**
 * @param {object} query raw `req.query`
 * @param {{ states?: readonly string[] }} [options]
 * @returns {{ page: number, limit: number, offset: number, state: string|null, from: Date|null, to: Date|null }}
 */
function validateListQuery(query = {}, options = {}) {
  const states = options.states || TOW_REQUEST_STATES;

  const page = parseInteger(query.page, 'page');
  if (page !== null && page < 1) {
    throw validationError('page must be greater than or equal to 1', { field: 'page' });
  }

  const limit = parseInteger(query.limit, 'limit');
  if (limit !== null && (limit < 1 || limit > MAX_LIMIT)) {
    throw validationError(`limit must be between 1 and ${MAX_LIMIT}`, { field: 'limit' });
  }

  let state = null;
  if (query.state !== undefined && query.state !== null && query.state !== '') {
    if (Array.isArray(query.state) || typeof query.state !== 'string' || !states.includes(query.state)) {
      throw validationError(`state must be one of ${states.join(', ')}`, { field: 'state' });
    }
    state = query.state;
  }

  const from = parseInstant(query.from, 'from');
  const to = parseInstant(query.to, 'to');
  if (from && to && from.getTime() > to.getTime()) {
    throw validationError('from must not be after to', { field: 'from' });
  }

  const resolvedPage = page === null ? DEFAULT_PAGE : page;
  const resolvedLimit = limit === null ? DEFAULT_LIMIT : limit;

  return {
    page: resolvedPage,
    limit: resolvedLimit,
    offset: (resolvedPage - 1) * resolvedLimit,
    state,
    from,
    to,
  };
}

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  validateListQuery,
};
