/**
 * SERVICE LOCATION — per-user abuse control.
 *
 * The global app limiter already caps raw IP traffic; these two endpoints can
 * spend real Google quota per call, so an authenticated user gets an additional
 * ceiling. The Google key must never be usable as an open proxy.
 *
 * Keyed by the authenticated user only: `auth` always runs first, so an
 * anonymous request never reaches the limiter.
 */
'use strict';

const rateLimit = require('express-rate-limit');

const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_REQUESTS = 60;

function createPlaceSearchRateLimiter(options = {}) {
  const windowMs = options.windowMs === undefined ? DEFAULT_WINDOW_MS : options.windowMs;
  const max = options.max === undefined ? DEFAULT_MAX_REQUESTS : options.max;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user && req.user.id != null ? `user:${req.user.id}` : 'anonymous'),
    handler: (req, res) => res.status(429).json({
      success: false,
      message: 'Muitas buscas de local. Tente novamente em instantes.',
      error: { code: 'rate_limited' },
    }),
  });
}

module.exports = {
  createPlaceSearchRateLimiter,
  DEFAULT_WINDOW_MS,
  DEFAULT_MAX_REQUESTS,
};
