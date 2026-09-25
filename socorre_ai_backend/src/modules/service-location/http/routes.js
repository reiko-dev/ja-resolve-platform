/**
 * SERVICE LOCATION — routers.
 *
 * Mounted by `src/app.js` at `/api/locations`. Both endpoints require an
 * authenticated user and are additionally rate-limited per user: the Google key
 * is never reachable anonymously.
 *
 * `rateLimit: false` disables the per-user limiter (tests); an object forwards
 * `{windowMs,max}`; the default enables the 60 req/min policy.
 */
'use strict';

const express = require('express');
const { auth } = require('../../../middleware/auth');
const { createServiceLocationController } = require('./controller');
const { createPlaceSearchRateLimiter } = require('./rate-limit');

function createServiceLocationRouter({ services, rateLimit }) {
  const router = express.Router();
  const controller = createServiceLocationController({
    placeSearchService: services.placeSearchService,
    locationResolutionService: services.locationResolutionService,
  });

  const guards = [auth];
  if (rateLimit !== false) {
    guards.push(createPlaceSearchRateLimiter(typeof rateLimit === 'object' && rateLimit !== null ? rateLimit : {}));
  }

  router.post('/autocomplete', ...guards, controller.autocomplete);
  router.get('/places/:placeId', ...guards, controller.getPlace);

  return router;
}

module.exports = { createServiceLocationRouter };
