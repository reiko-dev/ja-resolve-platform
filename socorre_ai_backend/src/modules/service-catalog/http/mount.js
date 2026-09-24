/**
 * PLATFORM SERVICE CATALOG — HTTP mount.
 */
'use strict';

const { buildServiceCatalogServices } = require('../composition');
const { createServiceCatalogRouter, createAdminServiceCatalogRouter } = require('./routes');

function createServiceCatalogModule(options = {}) {
  const services = buildServiceCatalogServices(options);
  return {
    services,
    publicRouter: createServiceCatalogRouter({ services }),
    adminRouter: createAdminServiceCatalogRouter({ services }),
  };
}

module.exports = { createServiceCatalogModule };
