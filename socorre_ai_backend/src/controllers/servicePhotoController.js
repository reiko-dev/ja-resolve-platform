/**
 * G2 — Controller das fotos privadas de guincho.
 *
 * Endpoints (montados em /api/upload, já sob `auth`):
 *   POST /emergency-requests/:id/photos            (JSON base64 -> 201/200)
 *   GET  /emergency-requests/:id/photos/:photo_type (binário privado ou JSON)
 *
 * Regras: acesso restrito ao dono, ao parceiro atribuído e a admin; no máximo
 * uma foto por tipo; retry devolve 200 com o mesmo recurso; o arquivo só é
 * escrito dentro da transação que grava a URL (sem órfão, sem URL inválida);
 * nunca expor caminho absoluto/chave de armazenamento.
 */
const EmergencyRequest = require('../models/EmergencyRequest');
const EmergencyRequestController = require('./emergencyRequestController');
const servicePhotoStorage = require('../services/servicePhotoStorage');
const { emergencyRequestSchemas } = require('../middleware/validation');

const { ServicePhotoError } = servicePhotoStorage;

// Erros de armazenamento seguros de expor ao cliente (400/413/415/422 e 503
// quando o diretório privado não está configurado). O restante vira 500
// genérico para não vazar caminho, SQL ou detalhe interno.
const CLIENT_SAFE_STORAGE_STATUS = new Set([400, 413, 415, 422, 503]);

function isClientSafeStorageError(error) {
  return error instanceof ServicePhotoError && CLIENT_SAFE_STORAGE_STATUS.has(error.status);
}

function invalidPayload(res, error) {
  return res.status(400).json({
    success: false,
    message: 'Dados inválidos',
    errors: error.details.map(detail => detail.message),
  });
}

function respondStorageError(res, error) {
  if (isClientSafeStorageError(error)) {
    return res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }

  return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
}

function existingPhotoUrl(request, photoType) {
  const columns = EmergencyRequest.photoColumns(photoType);
  return columns ? request?.[columns.url] || null : null;
}

/** Payload público da foto: metadados úteis, nunca caminho/chave interna. */
function publicPhotoPayload(request, photoType) {
  const metadata = EmergencyRequest.parsePhotoMetadata(request, photoType) || {};
  const { storage_key, ...safeMetadata } = metadata;

  return {
    emergency_request_id: request.id,
    photo_type: photoType,
    photo_url: existingPhotoUrl(request, photoType),
    mime_type: safeMetadata.mime_type || null,
    size_bytes: Number.isFinite(safeMetadata.size_bytes) ? safeMetadata.size_bytes : null,
    width: safeMetadata.width ?? null,
    height: safeMetadata.height ?? null,
    metadata: safeMetadata,
  };
}

function wantsJsonRepresentation(req) {
  if (String(req.query?.format || '').toLowerCase() === 'json') {
    return true;
  }

  const accept = typeof req.get === 'function' ? String(req.get('accept') || '') : '';
  return accept.toLowerCase().includes('application/json');
}

class ServicePhotoController {
  static async uploadEmergencyRequestPhoto(req, res) {
    try {
      const { id } = req.params;

      const validation = emergencyRequestSchemas.uploadPhoto.validate(req.body || {});
      if (validation.error) {
        return invalidPayload(res, validation.error);
      }

      const { photo_type: photoType, image, filename, mimeType } = validation.value;

      const emergency = await EmergencyRequest.findById(id);
      if (!emergency) {
        return res.status(404).json({ success: false, message: 'Solicitação não encontrada' });
      }

      if (!EmergencyRequestController.canAccessRequest(req, emergency)) {
        return res.status(403).json({ success: false, message: 'Acesso negado' });
      }

      // Retry idempotente: a foto do tipo já existe, nada é reescrito.
      if (existingPhotoUrl(emergency, photoType)) {
        return res.status(200).json({
          success: true,
          data: publicPhotoPayload(emergency, photoType),
          message: 'Foto já registrada para esta solicitação',
        });
      }

      let processed;
      try {
        servicePhotoStorage.getStorageRoot();
        processed = await servicePhotoStorage.processServicePhotoPayload({
          image,
          filename,
          mimeType,
          photoType,
        });
      } catch (error) {
        return respondStorageError(res, error);
      }

      const photoUrl = servicePhotoStorage.buildPhotoUrl(id, photoType);

      let result;
      try {
        result = await EmergencyRequest.attachServicePhoto(id, photoType, {
          url: photoUrl,
          store: async () => {
            const stored = await servicePhotoStorage.storeServicePhoto({
              requestId: id,
              photoType,
              processed,
            });

            return {
              metadata: {
                storage_key: stored.storageKey,
                mime_type: processed.mimeType,
                format: processed.format,
                width: processed.width,
                height: processed.height,
                size_bytes: processed.sizeBytes,
                source_size_bytes: processed.sourceSizeBytes,
                sha256: processed.sha256,
                original_filename: processed.originalFilename,
                uploaded_at: new Date().toISOString(),
                uploaded_by: req.user?.id ?? null,
              },
              rollback: () => servicePhotoStorage.removeStoredPhoto(stored.storageKey),
            };
          },
        });
      } catch (error) {
        console.error('Erro ao anexar foto da solicitação:', error);
        return respondStorageError(res, error);
      }

      if (result.status === 'missing') {
        return res.status(404).json({ success: false, message: 'Solicitação não encontrada' });
      }

      if (result.status === 'existing') {
        return res.status(200).json({
          success: true,
          data: publicPhotoPayload(result.request, photoType),
          message: 'Foto já registrada para esta solicitação',
        });
      }

      return res.status(201).json({
        success: true,
        data: publicPhotoPayload(result.request, photoType),
        message: 'Foto armazenada com sucesso',
      });
    } catch (error) {
      console.error('Erro ao processar upload de foto:', error);
      return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
  }

  static async getEmergencyRequestPhoto(req, res) {
    try {
      const { id, photo_type: photoType } = req.params;

      if (!servicePhotoStorage.isPhotoType(photoType)) {
        return res.status(400).json({
          success: false,
          message: 'photo_type deve ser pickup ou delivery',
        });
      }

      const emergency = await EmergencyRequest.findById(id);
      if (!emergency) {
        return res.status(404).json({ success: false, message: 'Solicitação não encontrada' });
      }

      if (!EmergencyRequestController.canAccessRequest(req, emergency)) {
        return res.status(403).json({ success: false, message: 'Acesso negado' });
      }

      const metadata = EmergencyRequest.parsePhotoMetadata(emergency, photoType);
      if (!existingPhotoUrl(emergency, photoType) || !metadata?.storage_key) {
        return res.status(404).json({
          success: false,
          message: 'Foto não encontrada para esta solicitação',
        });
      }

      let file;
      try {
        file = await servicePhotoStorage.readStoredPhoto(metadata.storage_key);
      } catch (error) {
        if (isClientSafeStorageError(error)) {
          return respondStorageError(res, error);
        }

        // Banco diz que a foto existe, mas o arquivo não está íntegro no
        // armazenamento: erro explícito, sem vazar caminho interno.
        console.error('Erro ao ler foto armazenada:', error);
        return res.status(500).json({
          success: false,
          code: 'photo_unavailable',
          message: 'Foto indisponível no armazenamento',
        });
      }

      if (wantsJsonRepresentation(req)) {
        return res.json({
          success: true,
          data: {
            ...publicPhotoPayload(emergency, photoType),
            encoding: 'base64',
            base64: file.buffer.toString('base64'),
          },
        });
      }

      const extension = servicePhotoStorage.fileExtensionForFormat(metadata.format);

      res.set('Content-Type', metadata.mime_type || 'application/octet-stream');
      res.set('Content-Length', String(file.buffer.length));
      res.set('Cache-Control', 'private, no-store');
      res.set('Pragma', 'no-cache');
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Disposition', `inline; filename="${photoType}-${emergency.id}${extension}"`);

      return res.status(200).send(file.buffer);
    } catch (error) {
      console.error('Erro ao servir foto da solicitação:', error);
      return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
  }
}

module.exports = ServicePhotoController;
