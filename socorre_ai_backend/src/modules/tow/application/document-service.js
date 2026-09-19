/**
 * MVP-01 — TowVehicle document application service.
 *
 * Upload persists bytes through the FileStorage port and records only metadata;
 * approval/rejection is admin-only and drives operational eligibility through
 * the domain document policy.
 */
'use strict';

const {
  TowError,
  validationError,
  ALLOWED_DOCUMENT_TYPES,
  DOCUMENT_STATUSES,
} = require('../domain');

const ALLOWED_MIME_TYPES = Object.freeze(['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function createDocumentService({ documentRepository, vehicleRepository, storage, clock }) {
  if (!documentRepository) throw new TypeError('createDocumentService requires a documentRepository port');
  if (!vehicleRepository) throw new TypeError('createDocumentService requires a vehicleRepository port');
  if (!storage) throw new TypeError('createDocumentService requires a storage port');
  if (!clock) throw new TypeError('createDocumentService requires a clock port');

  async function requireOwnedVehicle(partnerId, vehicleId) {
    const vehicle = await vehicleRepository.findByPartnerAndId(partnerId, vehicleId);
    if (!vehicle) throw new TowError('not_found', 'TowVehicle not found');
    return vehicle;
  }

  async function requireDocument(documentId) {
    const document = await documentRepository.findById(documentId);
    if (!document) throw new TowError('not_found', 'TowVehicle document not found');
    return document;
  }

  async function upload({ partnerId, vehicleId, file, documentType, expiresAt = null }) {
    await requireOwnedVehicle(partnerId, vehicleId);
    if (!ALLOWED_DOCUMENT_TYPES.includes(documentType)) {
      throw validationError(`unsupported document_type "${documentType}"`, { field: 'document_type' });
    }
    if (!file || !file.buffer) {
      throw validationError('file is required', { field: 'file' });
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw validationError('file must be JPEG, PNG or PDF', { field: 'file' });
    }
    if (Number.isFinite(file.size) && file.size > MAX_FILE_SIZE_BYTES) {
      throw validationError('file must be at most 5MB', { field: 'file' });
    }

    const saved = await storage.save({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      keyPrefix: `tow-vehicles/${vehicleId}`,
    });

    return documentRepository.insert({
      tow_vehicle_id: vehicleId,
      partner_id: partnerId,
      document_type: documentType,
      filename: saved.key,
      original_name: file.originalname,
      file_path: saved.key,
      file_url: saved.url,
      mime_type: file.mimetype,
      file_size: file.size,
      status: 'pending',
      expires_at: expiresAt || null,
    });
  }

  async function listForVehicle({ partnerId, vehicleId }) {
    await requireOwnedVehicle(partnerId, vehicleId);
    return documentRepository.listByVehicle(vehicleId);
  }

  async function remove({ partnerId, vehicleId, documentId }) {
    await requireOwnedVehicle(partnerId, vehicleId);
    const document = await requireDocument(documentId);
    if (String(document.tow_vehicle_id) !== String(vehicleId)) {
      throw new TowError('not_found', 'TowVehicle document not found');
    }
    await documentRepository.remove(document.id);
    return { id: document.id, deleted: true };
  }

  async function listAll(filters = {}) {
    return documentRepository.list(filters);
  }

  async function getById(documentId) {
    return requireDocument(documentId);
  }

  async function approve({ documentId, adminUserId = null }) {
    const document = await requireDocument(documentId);
    if (document.status === 'approved') return document; // idempotent
    return documentRepository.updateStatus(document.id, {
      status: 'approved',
      rejection_reason: null,
      verified_by: adminUserId,
      verified_at: clock.now(),
    });
  }

  async function reject({ documentId, reason, adminUserId = null }) {
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw validationError('reason is required', { field: 'reason' });
    }
    const document = await requireDocument(documentId);
    return documentRepository.updateStatus(document.id, {
      status: 'rejected',
      rejection_reason: reason.trim(),
      verified_by: adminUserId,
      verified_at: clock.now(),
    });
  }

  return { upload, listForVehicle, remove, listAll, getById, approve, reject, DOCUMENT_STATUSES };
}

module.exports = { createDocumentService, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES };
