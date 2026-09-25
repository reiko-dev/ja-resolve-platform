/**
 * SERVICE LOCATION — domain barrel.
 *
 * Pure domain: ServiceLocation, ResolutionSource, error vocabulary and the
 * canonical geographic invariants (re-exported from Tow). No Express, Knex,
 * axios or provider import is allowed here.
 */
'use strict';

const errors = require('./errors');
const geo = require('./geo');
const resolutionSource = require('./resolution-source');
const serviceLocation = require('./service-location');

module.exports = {
  ...errors,
  ...geo,
  ...resolutionSource,
  ...serviceLocation,
};
