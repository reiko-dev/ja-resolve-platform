/**
 * SERVICE LOCATION — HTTP mount.
 */
'use strict';

const { buildServiceLocationServices } = require('../composition');
const { createServiceLocationRouter } = require('./routes');

function createServiceLocationModule(options = {}) {
  const services = buildServiceLocationServices(options);
  return {
    services,
    publicRouter: createServiceLocationRouter({ services, rateLimit: options.rateLimit }),
  };
}

module.exports = { createServiceLocationModule };
