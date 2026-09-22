/**
 * B4 — Legacy Tow HTTP surface deprecation signals.
 *
 * Decision (B4): the canonical Tow API is `/api/tow/*`. The legacy surface
 * (`/api/tow-proposals*` and the Tow branches of `/api/emergency-requests*`)
 * is DEPRECATED NOW and will be removed later, after external consumers are
 * confirmed — see `docs/evidence/tow-zero-debt/B4-legacy-removal-issue.md`
 * (mobile repo) and `docs/tow/T00-LEGACY-TO-TARGET-MAPPING.md`.
 *
 * These helpers NEVER change status codes, bodies, side effects or
 * authorization: they only annotate the response with
 *   Deprecation: true
 *   Warning: 299 - "Deprecated legacy Tow API; use /api/tow/* (canonical)"
 *   Link: </api/tow/module-status>; rel="successor-version"
 *
 * `module-status` is the public discovery endpoint of the canonical
 * `/api/tow/*` namespace. No `Sunset` date is emitted while removal is
 * explicitly gated on external-consumer confirmation.
 */
'use strict';

const EmergencyRequestService = require('../services/EmergencyRequestService');

const LEGACY_TOW_SUCCESSOR = '/api/tow/module-status';
const LEGACY_TOW_WARNING =
  '299 - "Deprecated legacy Tow API; use /api/tow/* (canonical)"';

function applyLegacyTowDeprecationHeaders(res) {
  if (!res || typeof res.set !== 'function') {
    return;
  }
  if (typeof res.getHeader === 'function' && res.getHeader('Deprecation')) {
    return;
  }
  res.set('Deprecation', 'true');
  res.set('Warning', LEGACY_TOW_WARNING);
  res.set('Link', `<${LEGACY_TOW_SUCCESSOR}>; rel="successor-version"`);
}

function isTowRequestType(value) {
  return EmergencyRequestService.normalizeRequestType(value) === 'tow';
}

/**
 * Tow branch of `POST /api/emergency-requests`: the runtime resolves the type
 * from `request_type` only (`EmergencyRequestService.resolveRequestType`), so
 * the signal mirrors that exact rule.
 */
function legacyTowCreateDeprecation(req, res, next) {
  const body = req.body || {};
  if (isTowRequestType(body.request_type)) {
    applyLegacyTowDeprecationHeaders(res);
  }
  next();
}

/** Tow branch of `GET /api/emergency-requests/nearby` (`?type=tow`). */
function legacyTowNearbyDeprecation(req, res, next) {
  const query = req.query || {};
  if (isTowRequestType(query.type)) {
    applyLegacyTowDeprecationHeaders(res);
  }
  next();
}

/** Unconditional signal for every route of the legacy `/api/tow-proposals`. */
function legacyTowProposalsDeprecation(req, res, next) {
  applyLegacyTowDeprecationHeaders(res);
  next();
}

module.exports = {
  LEGACY_TOW_SUCCESSOR,
  LEGACY_TOW_WARNING,
  applyLegacyTowDeprecationHeaders,
  legacyTowCreateDeprecation,
  legacyTowNearbyDeprecation,
  legacyTowProposalsDeprecation,
};
