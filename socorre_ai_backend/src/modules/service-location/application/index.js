/**
 * SERVICE LOCATION — application barrel.
 */
'use strict';

const { PORT_NAMES } = require('./ports');
const { createPlaceSearchService } = require('./place-search-service');
const { createLocationResolutionService } = require('./location-resolution-service');

module.exports = {
  PORT_NAMES,
  createPlaceSearchService,
  createLocationResolutionService,
};
