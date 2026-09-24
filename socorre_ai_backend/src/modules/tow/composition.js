/**
 * MVP-01 — module composition root.
 * MVP-02 — wires the RouteProvider port and the route/pricing quote operation.
 * MVP-03 — wires the canonical TowRequest store and the geographic matching
 *          operations.
 * MVP-04 — wires the proposal store, the assignment store and the UnitOfWork
 *          the atomic accept runs in.
 * MVP-05 — wires the current-position store and the execution, tracking and
 *          cancellation services over the same UnitOfWork.
 * MVP-06 — wires the canonical CASH payment store and service, and injects the
 *          payment projection into every TowRequest DTO producer.
 * B5 — wires the route visualization read over the SAME RouteProvider port the
 *      quote uses (recompute on read; no geometry is persisted).
 * TOW ROUND — wires the tracking invalidation publisher (Socket.IO adapter by
 *      default; injectable for tests) into the tracking service.
 * TOW ROUND — wires the optional reverse-geocoding enrichment
 *      (`TOW_ADDRESS_RESOLVER=none|google`, default `none`) into the TowRequest
 *      create path. A provider failure is best-effort only and never blocks a
 *      create; the adapter requires its own `GOOGLE_GEOCODING_API_KEY`.
 * VALIDATION — the route adapter kind and the payment mode are resolved from
 *      guarded config: the deterministic fixture and `mock` are explicit-env,
 *      validation-only selections that production refuses at startup.
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
  createProposalService,
  createAssignmentService,
  createExecutionService,
  createTrackingService,
  createCancellationService,
  createPaymentService,
  createRouteService,
} = require('./application');
const { buildServiceCatalogServices } = require('../service-catalog/composition');
const { createVehicleRepository } = require('./adapters/persistence/vehicle-repository');
const { createDocumentRepository } = require('./adapters/persistence/document-repository');
const { createSettingsRepository } = require('./adapters/persistence/settings-repository');
const { createPartnerRepository } = require('./adapters/persistence/partner-repository');
const { createTowRequestRepository } = require('./adapters/persistence/tow-request-repository');
const { createTowProposalRepository } = require('./adapters/persistence/tow-proposal-repository');
const { createAssignmentRepository } = require('./adapters/persistence/assignment-repository');
const { createTrackingRepository } = require('./adapters/persistence/tracking-repository');
const { createTowPaymentRepository } = require('./adapters/persistence/tow-payment-repository');
const { createLocalFileStorage } = require('./adapters/storage/local-file-storage');
const { createSystemClock } = require('./adapters/clock/system-clock');
const { createGoogleRoutesAdapter } = require('./adapters/routes/google-routes-adapter');
const { createValidationRoutesAdapter } = require('./adapters/routes/validation-routes-adapter');
const { createGoogleGeocodingAdapter } = require('./adapters/address/google-geocoding-adapter');
const { createSocketTrackingPublisher } = require('./adapters/events/socket-tracking-publisher');
const { resolveTowPaymentMode } = require('../../config/towPaymentMode');
const { assertTowRouteProviderSafe } = require('../../config/towRouteProvider');
const { assertTowAddressResolverSafe } = require('../../config/towAddressResolver');

/**
 * Maps the guarded `TOW_ROUTE_PROVIDER` kind to its adapter. `google` is the
 * production default; `validation-fixture` is selected only by explicit env and
 * is rejected in production by the same guard `createApp` uses. There is no
 * fallback between the two.
 */
function createConfiguredRouteProvider(routesOptions = {}, env = process.env) {
  const kind = assertTowRouteProviderSafe(env);
  if (kind === 'validation-fixture') {
    return createValidationRoutesAdapter(routesOptions);
  }
  return createGoogleRoutesAdapter(routesOptions);
}

/**
 * Maps the guarded `TOW_ADDRESS_RESOLVER` kind to its adapter. `none` (the
 * default) returns `null`: no resolver is wired and the create path keeps
 * whatever address the client sent. `google` requires its dedicated
 * `GOOGLE_GEOCODING_API_KEY` at startup (fail-fast) — the adapter never reuses
 * another Google key.
 */
function createConfiguredAddressResolver(addressOptions = {}, env = process.env) {
  const kind = assertTowAddressResolverSafe(env);
  if (kind === 'none') return null;
  return createGoogleGeocodingAdapter(addressOptions);
}

function buildTowServices(options = {}) {
  // eslint-disable-next-line global-require
  const db = options.db || require('../../config/database');
  const clock = options.clock || createSystemClock();
  const storage = options.storage || createLocalFileStorage();
  // The adapter reads its key lazily on the first call, so an unset
  // GOOGLE_ROUTES_API_KEY degrades one operation instead of failing startup.
  const routeProvider = options.routeProvider || createConfiguredRouteProvider(options.routes);
  const paymentMode = options.paymentMode || resolveTowPaymentMode();
  // TOW ROUND — optional reverse-geocoding enrichment for requests that arrive
  // without an address. Default `none`; tests inject a fake or `null`.
  const addressResolver = options.addressResolver === undefined
    ? createConfiguredAddressResolver(options.address || {})
    : options.addressResolver;
  // TOW ROUND — the tracking invalidation publisher. Production uses the
  // Socket.IO adapter; tests inject a spy (or `null` to disable publishing).
  const trackingEvents = options.trackingEvents === undefined
    ? createSocketTrackingPublisher()
    : options.trackingEvents;

  // PLATFORM SERVICE CATALOG — the registry is platform-level; Tow consumes the
  // row for `service_key=tow` and never owns a second repository.
  const serviceCatalog = buildServiceCatalogServices({ db });
  const { catalogService } = serviceCatalog;
  const vehicleRepository = createVehicleRepository(db);
  const documentRepository = createDocumentRepository(db);
  const settingsRepository = createSettingsRepository(db);
  const partnerRepository = createPartnerRepository(db);
  const towRequestRepository = createTowRequestRepository(db);
  const towProposalRepository = createTowProposalRepository(db);
  const assignmentRepository = createAssignmentRepository(db);
  const trackingRepository = createTrackingRepository(db);
  const towPaymentRepository = createTowPaymentRepository(db);

  const moduleService = createModuleService({ catalogService });
  const settingsService = createSettingsService({ settingsRepository, clock });
  const quoteService = createQuoteService({ routeProvider, vehicleRepository, clock });

  /**
   * The UnitOfWork port: `db.transaction(fn)` hands the callback a transaction
   * handle, and every repository reaches that handle through
   * `withTransaction(trx)`. Keeping the transaction an explicit argument — rather
   * than a hidden ambient connection — is what makes "did this query join the
   * transaction?" answerable by reading the call site.
   */
  const unitOfWork = { run: (fn) => db.transaction(fn) };

  return {
    db,
    clock,
    storage,
    routeProvider,
    paymentMode,
    // TOW ROUND — `null` when `TOW_ADDRESS_RESOLVER=none` (the default).
    addressResolver,
    catalogService,
    vehicleRepository,
    documentRepository,
    settingsRepository,
    partnerRepository,
    towRequestRepository,
    towProposalRepository,
    assignmentRepository,
    trackingRepository,
    towPaymentRepository,
    unitOfWork,
    moduleService,
    vehicleService: createVehicleService({ vehicleRepository, documentRepository, clock }),
    documentService: createDocumentService({ documentRepository, vehicleRepository, storage, clock }),
    settingsService,
    eligibilityService: createEligibilityService({
      catalogService,
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
      towProposalRepository,
      assignmentRepository,
      paymentRepository: towPaymentRepository,
      addressResolver,
      clock,
    }),
    matchingService: createMatchingService({
      settingsService,
      partnerRepository,
      vehicleRepository,
      documentRepository,
      towRequestRepository,
      quoteService,
      clock,
      ...(options.matching || {}),
    }),
    proposalService: createProposalService({
      settingsService,
      partnerRepository,
      vehicleRepository,
      documentRepository,
      towRequestRepository,
      towProposalRepository,
      quoteService,
      clock,
    }),
    assignmentService: createAssignmentService({
      settingsService,
      towRequestRepository,
      towProposalRepository,
      assignmentRepository,
      paymentRepository: towPaymentRepository,
      unitOfWork,
      clock,
    }),
    executionService: createExecutionService({
      settingsService,
      towRequestRepository,
      assignmentRepository,
      paymentRepository: towPaymentRepository,
      unitOfWork,
      clock,
    }),
    trackingService: createTrackingService({
      towRequestRepository,
      assignmentRepository,
      trackingRepository,
      unitOfWork,
      clock,
      trackingEvents,
    }),
    cancellationService: createCancellationService({
      settingsService,
      towRequestRepository,
      assignmentRepository,
      paymentRepository: towPaymentRepository,
      unitOfWork,
      clock,
    }),
    paymentService: createPaymentService({
      towRequestRepository,
      assignmentRepository,
      towPaymentRepository,
      unitOfWork,
      clock,
    }),
    // B5 — read-only route visualization over the same RouteProvider port the
    // quote uses. No UnitOfWork: the read writes nothing.
    routeService: createRouteService({
      routeProvider,
      towRequestRepository,
      assignmentRepository,
      clock,
    }),
  };
}

module.exports = { buildTowServices, createConfiguredRouteProvider, createConfiguredAddressResolver };
