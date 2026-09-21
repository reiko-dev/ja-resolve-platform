/**
 * MVP-01 — application barrel.
 * MVP-02 — adds the route/pricing quote operation.
 * MVP-03 — adds the canonical TowRequest and the geographic matching operations.
 * MVP-04 — adds the proposal lifecycle and the atomic assignment.
 * MVP-05 — adds service execution, current partner tracking and basic
 *          cancellation, plus the shared ownership-first transactional lock.
 * MVP-06 — adds the canonical CASH payment aggregate (method selection, cash
 *          receipt confirmation, payment rehydration).
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
const { createProposalService } = require('./proposal-service');
const { createAssignmentService } = require('./assignment-service');
const { createExecutionService } = require('./execution-service');
const { createTrackingService } = require('./tracking-service');
const { createCancellationService } = require('./cancellation-service');
const { createPaymentService } = require('./payment-service');
const { lockJobForPartner, lockRequestForCustomer, requireCanonicalRequestId } = require('./job-lock');
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
  createProposalService,
  createAssignmentService,
  createExecutionService,
  createTrackingService,
  createCancellationService,
  createPaymentService,
  lockJobForPartner,
  lockRequestForCustomer,
  requireCanonicalRequestId,
  validateListQuery,
};
