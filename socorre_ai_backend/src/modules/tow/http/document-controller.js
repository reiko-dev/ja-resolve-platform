/**
 * MVP-01 — TowVehicle document controller (thin).
 *
 * Parses only transport concerns (multipart field, query filters) and delegates
 * every rule to the application service.
 */
'use strict';

const { handle } = require('./error-mapper');
const { serializeDocument } = require('./serialize');

function pageMeta(items, page, limit) {
  return { page, limit, total: items.length, total_pages: items.length === 0 ? 0 : Math.ceil(items.length / limit) };
}

function createDocumentController({ documentService }) {
  return {
    listForVehicle: handle(async (req, res) => {
      const documents = await documentService.listForVehicle({
        partnerId: req.user.partner_id,
        vehicleId: req.params.vehicleId,
      });
      res.json({ success: true, data: { items: documents.map(serializeDocument) } });
    }),

    upload: handle(async (req, res) => {
      const document = await documentService.upload({
        partnerId: req.user.partner_id,
        vehicleId: req.params.vehicleId,
        file: req.file,
        documentType: req.body ? req.body.document_type : undefined,
        expiresAt: req.body ? req.body.expires_at : null,
      });
      res.status(201).json({ success: true, data: serializeDocument(document) });
    }),

    remove: handle(async (req, res) => {
      const result = await documentService.remove({
        partnerId: req.user.partner_id,
        vehicleId: req.params.vehicleId,
        documentId: req.params.documentId,
      });
      res.json({ success: true, data: result });
    }),

    adminList: handle(async (req, res) => {
      const page = Number.parseInt(req.query.page, 10) > 0 ? Number.parseInt(req.query.page, 10) : 1;
      const limit = Number.parseInt(req.query.limit, 10) > 0 ? Number.parseInt(req.query.limit, 10) : 20;
      const documents = await documentService.listAll({
        status: req.query.status,
        partner_id: req.query.partner_id,
        vehicle_id: req.query.vehicle_id,
        limit,
        offset: (page - 1) * limit,
      });
      res.json({
        success: true,
        data: { items: documents.map(serializeDocument), meta: pageMeta(documents, page, limit) },
      });
    }),

    adminGet: handle(async (req, res) => {
      const document = await documentService.getById(req.params.documentId);
      res.json({ success: true, data: serializeDocument(document) });
    }),

    adminApprove: handle(async (req, res) => {
      const document = await documentService.approve({
        documentId: req.params.documentId,
        adminUserId: req.user ? req.user.id : null,
      });
      res.json({ success: true, data: serializeDocument(document) });
    }),

    adminReject: handle(async (req, res) => {
      const document = await documentService.reject({
        documentId: req.params.documentId,
        reason: req.body ? req.body.reason : undefined,
        adminUserId: req.user ? req.user.id : null,
      });
      res.json({ success: true, data: serializeDocument(document) });
    }),
  };
}

module.exports = { createDocumentController };
