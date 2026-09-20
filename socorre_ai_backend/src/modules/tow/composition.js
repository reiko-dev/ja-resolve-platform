/**
 * MVP-01 — module composition root.
 * MVP-02 — wires the RouteProvider port and the route/pricing quote operation.
 * MVP-03 — wires the canonical TowRequest store and the geographic matching
 *          operations.
 *
 * Builds the application services from the infrastructure adapters. This is the
 * only place the pure layers meet Knex, HTTP, the filesystem and the system
 * clock, which keeps Domain/Application free of infrastructure imports.
 */
'use strict';

const {
  createModuleService,
  createVehicleService,
  createDocumentService,
  createSettingsService,
  createEligibilityService,
  createQuoteService,
  createTowRequestService,
  createMatchingService,
} = require('./application');
const { createModuleRepository } = require('./adapters/persistence/module-repository');
const { createVehicleRepository } = require('./adapters/persistence/vehicle-repository');
const { createDocumentRepository } = require('./adapters/persistence/document-repository');
const { createSettingsRepository } = require('./adapters/persistence/settings-repository');
const { createPartnerRepository } = require('./adapters/persistence/partner-repository');
const { createTowRequestRepository } = require('./adapters/persistence/tow-request-repository');
const { createLocalFileStorage } = require('./adapters/storage/local-file-storage');
const { createSystemClock } = require('./adapters/clock/system-clock');
const { createGoogleRoutesAdapter } = require('./adapters/routes/google-routes-adapter');

function buildTowServices(options = {}) {
  // eslint-disable-next-line global-require
  const db = options.db || require('../../config/database');
  const clock = options.clock || createSystemClock();
  const storage = options.storage || createLocalFileStorage();
  // The adapter reads its key lazily on the first call, so an unset
  // GOOGLE_ROUTES_API_KEY degrades one operation instead of failing startup.
  const routeProvider = options.routeProvider || createGoogleRoutesAdapter(options.routes);

  const moduleRepository = createModuleRepository(db);
  const vehicleRepository = createVehicleRepository(db);
  const documentRepository = createDocumentRepository(db);
  const settingsRepository = createSettingsRepository(db);
  const partnerRepository = createPartnerRepository(db);
  const towRequestRepository = createTowRequestRepository(db);

  const moduleService = createModuleService({ moduleRepository });
  const settingsService = createSettingsService({ settingsRepository, clock });
  const quoteService = createQuoteService({ routeProvider, vehicleRepository, clock });

  return {
    db,
    clock,
    storage,
    routeProvider,
    moduleRepository,
    vehicleRepository,
    documentRepository,
    settingsRepository,
    partnerRepository,
    towRequestRepository,
    moduleService,
    vehicleService: createVehicleService({ vehicleRepository, documentRepository, clock }),
    documentService: createDocumentService({ documentRepository, vehicleRepository, storage, clock }),
    settingsService,
    eligibilityService: createEligibilityService({
      moduleRepository,
      vehicleRepository,
      documentRepository,
      partnerRepository,
      clock,
    }),
    quoteService,
    towRequestService: createTowRequestService({
      moduleService,
      settingsService,
      towRequestRepository,
      clock,
    }),
    matchingService: createMatchingService({
      moduleService,
      settingsService,
      partnerRepository,
      vehicleRepository,
      documentRepository,
      towRequestRepository,
      quoteService,
      clock,
      ...(options.matching || {}),
    }),
  };
}

module.exports = { buildTowServices };
