/**
 * MVP-01 — Tow routers (thin controllers + authz middleware).
 *
 * Mounted by `src/app.js` at `/api/tow` (partner/customer) and
 * `/api/admin/tow` (admin), matching the contract `servers: [/api]` and the
 * T00 probe expectation of `/api/tow/*` / `/api/admin/tow/*`.
 *
 * MVP-04 adds EXACTLY five proposal-lifecycle routes (proposal create/list for a
 * request, the partner proposal list, accept, withdraw) plus the canonical
 * partner job rehydration route (`GET /partner/jobs`, EXT-MVP04-1).
 *
 * MVP-05 adds EXACTLY eight execution/tracking/cancellation routes, all of them
 * under the canonical `/requests/{requestId}` resource: the four partner
 * milestones, the two cancellations and the tracking read/write pair.
 *
 * Counteroffer, payments, ETA, tracking HISTORY, the legacy global
 * partner-location push endpoint and every other unimplemented operation stay
 * unrouted: an unimplemented operation must 404 rather than pretend. (That
 * legacy path is deliberately not spelled out here — the architecture suites
 * assert it never appears in this file, comments included.)
 */
'use strict';

const express = require('express');
const { auth } = require('../../../middleware/auth');
const {
  requireAdmin,
  requireTowPartner,
  requireCustomer,
  requireCustomerOrTowPartner,
} = require('./middleware');
const { createModuleController } = require('./module-controller');
const { createVehicleController } = require('./vehicle-controller');
const { createDocumentController } = require('./document-controller');
const { createSettingsController } = require('./settings-controller');
const {
  createTowRequestController,
  createMatchingController,
} = require('./tow-request-controller');
const { createProposalController } = require('./proposal-controller');
const { createExecutionController } = require('./execution-controller');
const { createTrackingController } = require('./tracking-controller');
const { createCancellationController } = require('./cancellation-controller');

function createTowRouter({ services, uploadMiddleware }) {
  const router = express.Router();
  const moduleController = createModuleController({ moduleService: services.moduleService });
  const vehicleController = createVehicleController({ vehicleService: services.vehicleService });
  const documentController = createDocumentController({ documentService: services.documentService });
  const towRequestController = createTowRequestController({ towRequestService: services.towRequestService });
  const matchingController = createMatchingController({ matchingService: services.matchingService });
  const proposalController = createProposalController({
    proposalService: services.proposalService,
    assignmentService: services.assignmentService,
  });
  const executionController = createExecutionController({ executionService: services.executionService });
  const trackingController = createTrackingController({ trackingService: services.trackingService });
  const cancellationController = createCancellationController({
    cancellationService: services.cancellationService,
  });

  router.get('/module-status', moduleController.getPublicStatus);

  // MVP-03 — canonical tow requests (customer side).
  router.post('/requests', auth, requireCustomer, towRequestController.create);
  router.get('/requests', auth, requireCustomer, towRequestController.list);
  router.get('/requests/:requestId', auth, requireCustomer, towRequestController.get);

  // MVP-04 — the proposal lifecycle. A partner prices an open request, the
  // customer lists what came in and accepts exactly one; a partner may withdraw
  // their own offer while it is still actionable.
  router.post('/requests/:requestId/proposals', auth, requireTowPartner, proposalController.create);
  router.get('/requests/:requestId/proposals', auth, requireCustomer, proposalController.listForRequest);
  router.get('/partner/proposals', auth, requireTowPartner, proposalController.listForPartner);
  router.post('/proposals/:proposalId/accept', auth, requireCustomer, proposalController.accept);
  router.post('/proposals/:proposalId/withdraw', auth, requireTowPartner, proposalController.withdraw);

  // MVP-04 EXT — canonical partner job rehydration (EXT-MVP04-1). The partner
  // reads its OWN jobs from the same `tow_assignments` authority the customer
  // recovery path uses; the identity comes only from `req.user.partner_id`.
  router.get('/partner/jobs', auth, requireTowPartner, towRequestController.listJobsForPartner);

  // MVP-05 — service execution. The four milestones of the frozen graph, driven
  // by the ASSIGNED partner only (`req.user.partner_id`). Each is the same
  // application operation with a different edge, so the order rule lives in the
  // state machine and never in the routing table.
  router.post('/requests/:requestId/en-route', auth, requireTowPartner, executionController.startEnRoute);
  router.post('/requests/:requestId/arrived', auth, requireTowPartner, executionController.markArrived);
  router.post('/requests/:requestId/in-transit', auth, requireTowPartner, executionController.startInTransit);
  router.post('/requests/:requestId/finish', auth, requireTowPartner, executionController.finishService);

  // MVP-05 — basic cancellation. Both routes are legal only before IN_TRANSIT;
  // the customer path checks ownership, the partner path checks the assignment.
  router.post('/requests/:requestId/cancel', auth, requireCustomer, cancellationController.cancelByCustomer);
  router.post('/requests/:requestId/cancel-partner', auth, requireTowPartner, cancellationController.cancelByPartner);

  // MVP-05 — current position. The write is the assigned partner's; the read is
  // the only two-principal route of the module (owner customer OR assigned
  // partner), which is why it carries its own guard.
  router.get('/requests/:requestId/tracking', auth, requireCustomerOrTowPartner, trackingController.read);
  router.post('/requests/:requestId/tracking', auth, requireTowPartner, trackingController.write);

  // MVP-03 — partner opportunity feed (geographic matching).
  router.get('/partner/opportunities', auth, requireTowPartner, matchingController.listOpportunities);

  router.get('/vehicles', auth, requireTowPartner, vehicleController.list);
  router.post('/vehicles', auth, requireTowPartner, vehicleController.create);
  router.get('/vehicles/:vehicleId', auth, requireTowPartner, vehicleController.get);
  router.patch('/vehicles/:vehicleId', auth, requireTowPartner, vehicleController.update);
  router.delete('/vehicles/:vehicleId', auth, requireTowPartner, vehicleController.remove);
  router.post('/vehicles/:vehicleId/activate', auth, requireTowPartner, vehicleController.activate);
  router.post('/vehicles/:vehicleId/deactivate', auth, requireTowPartner, vehicleController.deactivate);

  router.get('/vehicles/:vehicleId/documents', auth, requireTowPartner, documentController.listForVehicle);
  router.post('/vehicles/:vehicleId/documents', auth, requireTowPartner, uploadMiddleware, documentController.upload);
  router.delete('/vehicles/:vehicleId/documents/:documentId', auth, requireTowPartner, documentController.remove);
  // Authenticated byte transport (EXT-MVP01-1). Documented as a candidate for a
  // future contract revision; the frozen OpenAPI is not silently changed.
  router.get('/vehicles/:vehicleId/documents/:documentId/download', auth, requireTowPartner, documentController.download);

  return router;
}

function createAdminTowRouter({ services }) {
  const router = express.Router();
  const moduleController = createModuleController({ moduleService: services.moduleService });
  const documentController = createDocumentController({ documentService: services.documentService });
  const settingsController = createSettingsController({ settingsService: services.settingsService });

  router.get('/module', auth, requireAdmin, moduleController.adminGet);
  router.patch('/module', auth, requireAdmin, moduleController.adminToggle);

  router.get('/settings', auth, requireAdmin, settingsController.get);
  router.patch('/settings', auth, requireAdmin, settingsController.patch);

  router.get('/vehicle-documents', auth, requireAdmin, documentController.adminList);
  router.get('/vehicle-documents/:documentId', auth, requireAdmin, documentController.adminGet);
  router.post('/vehicle-documents/:documentId/approve', auth, requireAdmin, documentController.adminApprove);
  router.post('/vehicle-documents/:documentId/reject', auth, requireAdmin, documentController.adminReject);
  // Authenticated byte transport (EXT-MVP01-1); candidate for a future contract
  // revision, not part of the frozen OpenAPI.
  router.get('/vehicle-documents/:documentId/download', auth, requireAdmin, documentController.adminDownload);

  return router;
}

module.exports = { createTowRouter, createAdminTowRouter };
