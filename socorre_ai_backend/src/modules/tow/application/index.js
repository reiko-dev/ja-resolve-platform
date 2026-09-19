/**
 * MVP-01 — application barrel.
 * MVP-02 — adds the route/pricing quote operation.
 */
'use strict';

const { createModuleService } = require('./module-service');
const { createVehicleService } = require('./vehicle-service');
const { createDocumentService } = require('./document-service');
const { createSettingsService } = require('./settings-service');
const { createEligibilityService } = require('./eligibility-service');
const { createQuoteService } = require('./quote-service');

module.exports = {
  createModuleService,
  createVehicleService,
  createDocumentService,
  createSettingsService,
  createEligibilityService,
  createQuoteService,
};
