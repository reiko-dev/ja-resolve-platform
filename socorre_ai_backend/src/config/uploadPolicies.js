const path = require('path');

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

const GENERIC_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const GENERIC_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
]);

const PARTNER_DOCUMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/octet-stream',
]);

const PARTNER_DOCUMENT_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
  '.heif',
  '.pdf',
]);

function getNormalizedExtension(filename = '') {
  return path.extname(filename).toLowerCase();
}

function validateMimeAndExtension({ mimeType, filename, allowedMimeTypes, allowedExtensions }) {
  const normalizedMimeType = (mimeType || '').toLowerCase();
  const normalizedExtension = getNormalizedExtension(filename);

  return allowedMimeTypes.has(normalizedMimeType) && allowedExtensions.has(normalizedExtension);
}

function decodeBase64Image(image = '') {
  const normalized = image.replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(normalized, 'base64');
}

function validateGenericImagePayload({ image, filename, mimeType }) {
  if (!image || !filename) {
    return 'Imagem e nome do arquivo são obrigatórios';
  }

  const normalizedMimeType = (mimeType || '').toLowerCase();
  const inferredMimeType = normalizedMimeType || inferMimeTypeFromFilename(filename);

  const isAllowed = validateMimeAndExtension({
    mimeType: inferredMimeType,
    filename,
    allowedMimeTypes: GENERIC_IMAGE_MIME_TYPES,
    allowedExtensions: GENERIC_IMAGE_EXTENSIONS,
  });

  if (!isAllowed) {
    return 'Tipo de arquivo não permitido.';
  }

  const buffer = decodeBase64Image(image);
  if (buffer.length > MAX_UPLOAD_SIZE_BYTES) {
    return 'Arquivo muito grande. O limite é 5 MB.';
  }

  return null;
}

function inferMimeTypeFromFilename(filename = '') {
  const extension = getNormalizedExtension(filename);
  const mapping = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
  };

  return mapping[extension] || '';
}

module.exports = {
  MAX_UPLOAD_SIZE_BYTES,
  GENERIC_IMAGE_MIME_TYPES,
  GENERIC_IMAGE_EXTENSIONS,
  PARTNER_DOCUMENT_MIME_TYPES,
  PARTNER_DOCUMENT_EXTENSIONS,
  decodeBase64Image,
  getNormalizedExtension,
  inferMimeTypeFromFilename,
  validateGenericImagePayload,
  validateMimeAndExtension,
};
