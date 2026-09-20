/**
 * MVP-01 — application barrel.
 * MVP-02 — adds the route/pricing quote operation.
 * MVP-03 — adds the canonical TowRequest and the geographic matching operations.
 */
'use strict';

const { createModuleService } = require('./module-service');
const { createVehicleService } = require('./vehicle-service');
const { createDocumentService } = require('./document-service');
const { createSettingsService } = require('./settings-service');
const { createEligibilityService } = require('./eligibility-service');
const { createQuoteService } = require('./quote-service');
const { createTowRequestService } = require('./tow-request-service');
const { createMatchingService } = require('./matching-service');
const { validateListQuery } = require('./list-query');

module.exports = {
  createModuleService,
  createVehicleService,
  createDocumentService,
  createSettingsService,
  createEligibilityService,
  createQuoteService,
  createTowRequestService,
  createMatchingService,
  validateListQuery,
};
