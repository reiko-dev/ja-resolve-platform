/**
 * SERVICE LOCATION — module barrel.
 *
 * Re-exports the pure domain, the application services and the composition
 * root. `http/**` is intentionally not re-exported so requiring this module
 * never pulls Express into a consumer.
 */
'use strict';

const domain = require('./domain');
const application = require('./application');
const { buildServiceLocationServices } = require('./composition');

module.exports = {
  ...domain,
  ...application,
  buildServiceLocationServices,
  domain,
  application,
};
