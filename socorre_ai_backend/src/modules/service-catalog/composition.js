/**
 * PLATFORM SERVICE CATALOG — composition root.
 *
 * The only place the pure layers meet Knex. The Tow module builds the same
 * services and consumes them for `service_key=tow`.
 */
'use strict';

const { createCatalogService } = require('./application');
const { createCatalogRepository } = require('./adapters/persistence/catalog-repository');

function buildServiceCatalogServices(options = {}) {
  // eslint-disable-next-line global-require
  const db = options.db || require('../../config/database');
  const catalogRepository = createCatalogRepository(db);
  return {
    db,
    catalogRepository,
    catalogService: createCatalogService({ catalogRepository }),
  };
}

module.exports = { buildServiceCatalogServices };
