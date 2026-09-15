/**
 * G2 — Armazenamento privado local das fotos de guincho (VPS Hostinger).
 *
 * Contrato (docs/gauntlet/TASKSPEC-G2.yaml):
 *   - raiz configurada por SERVICE_PHOTO_STORAGE_DIR; nada fora dela é escrito;
 *   - JPEG/WebP reais (formato detectado pelo sharp, não pelo MIME declarado);
 *   - teto de 5 MB por entrada; maior lado <= 1920 px sem ampliar;
 *   - nome UUID; diretórios 0700; arquivos 0600; sem traversal/symlink;
 *   - nunca expor caminho absoluto (a chave persistida é relativa);
 *   - arquivo temporário no mesmo filesystem + rename atômico.
 *
 * Este módulo não conhece HTTP nem banco: só valida/normaliza o payload e
 * materializa/remove o arquivo. A orquestração transacional (uma atualização
 * por foto, sem órfão) fica no model EmergencyRequest/controller.
 */
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

const PHOTO_TYPES = Object.freeze(['pickup', 'delivery']);
const ALLOWED_PHOTO_MIME_TYPES = Object.freeze(['image/jpeg', 'image/webp']);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTO_DIMENSION = 1920;
const MAX_FILENAME_LENGTH = 255;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const FORMAT_BY_MIME = Object.freeze({ 'image/jpeg': 'jpeg', 'image/webp': 'webp' });
const EXTENSIONS_BY_FORMAT = Object.freeze({ jpeg: ['.jpg', '.jpeg'], webp: ['.webp'] });
// G2 — chave persistida aceita apenas "<id>/<pickup|delivery>-<uuid>.<jpg|webp>".
// Prefixos arbitrários (ex.: "<id>/engine-...") não são chaves do contrato.
const STORAGE_KEY_PATTERN = /^[1-9][0-9]*\/(pickup|delivery)-[0-9a-f-]{36}\.(jpg|webp)$/;

class ServicePhotoError extends Error {
  constructor(code, message, { status = 400, cause = null } = {}) {
    super(message);
    this.name = 'ServicePhotoError';
    this.code = code;
    this.status = status;
    if (cause) {
      this.cause = cause;
    }
  }
}

function isPhotoType(photoType) {
  return typeof photoType === 'string' && PHOTO_TYPES.includes(photoType);
}

/**
 * Raiz do armazenamento privado. Resolvida a cada chamada (nunca no import)
 * para que o processo suba mesmo sem a variável configurada e para que os
 * testes possam apontar para um diretório temporário.
 */
function getStorageRoot() {
  const configured = process.env.SERVICE_PHOTO_STORAGE_DIR;
  if (!configured || String(configured).trim().length === 0) {
    throw new ServicePhotoError(
      'photo_storage_not_configured',
      'Armazenamento privado de fotos não configurado',
      { status: 503 }
    );
  }

  const root = path.resolve(String(configured).trim());
  if (root === path.parse(root).root) {
    throw new ServicePhotoError(
      'photo_storage_not_configured',
      'Armazenamento privado de fotos não configurado',
      { status: 503 }
    );
  }

  return root;
}

/**
 * Nome de arquivo enviado pelo cliente: aceitamos apenas basename simples.
 * Qualquer separador, traversal, byte nulo ou nome vazio é rejeitado.
 */
function sanitizeFilename(filename) {
  if (typeof filename !== 'string') {
    throw new ServicePhotoError('invalid_filename', 'filename é obrigatório');
  }

  const trimmed = filename.trim();
  if (!trimmed || trimmed.length > MAX_FILENAME_LENGTH) {
    throw new ServicePhotoError('invalid_filename', 'filename inválido');
  }
  if (/[\u0000-\u001f\u007f]/.test(trimmed) || /[\\/]/.test(trimmed)) {
    throw new ServicePhotoError('invalid_filename', 'filename deve ser um nome de arquivo simples');
  }
  if (trimmed === '.' || trimmed === '..') {
    throw new ServicePhotoError('invalid_filename', 'filename inválido');
  }

  return trimmed;
}

/**
 * Decodifica base64 estrito (aceitando data URL) e aplica o teto de 5 MB
 * antes de entregar o buffer ao sharp.
 */
function decodeBase64Image(image) {
  if (typeof image !== 'string' || image.trim().length === 0) {
    throw new ServicePhotoError('invalid_base64', 'image deve ser base64 válido');
  }

  let payload = image.trim();
  let dataUrlMime = null;

  if (/^data:/i.test(payload)) {
    const match = payload.match(/^data:([a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+);base64,(.*)$/is);
    if (!match) {
      throw new ServicePhotoError('invalid_base64', 'image deve ser base64 válido');
    }
    dataUrlMime = match[1].toLowerCase();
    payload = match[2];
  }

  payload = payload.replace(/\s+/g, '');

  if (!payload || payload.length % 4 !== 0 || !BASE64_PATTERN.test(payload)) {
    throw new ServicePhotoError('invalid_base64', 'image deve ser base64 válido');
  }

  const maxBase64Length = Math.ceil(MAX_PHOTO_BYTES / 3) * 4;
  if (payload.length > maxBase64Length) {
    throw new ServicePhotoError('photo_too_large', 'Arquivo muito grande. O limite é 5 MB.');
  }

  const buffer = Buffer.from(payload, 'base64');
  if (!buffer.length) {
    throw new ServicePhotoError('invalid_base64', 'image deve ser base64 válido');
  }
  if (buffer.length > MAX_PHOTO_BYTES) {
    throw new ServicePhotoError('photo_too_large', 'Arquivo muito grande. O limite é 5 MB.');
  }

  // Buffer.from é leniente com padding/alfabeto; a re-codificação garante que
  // o payload era base64 canônico e não lixo silenciosamente descartado.
  const canonical = buffer.toString('base64').replace(/=+$/, '');
  if (canonical !== payload.replace(/=+$/, '')) {
    throw new ServicePhotoError('invalid_base64', 'image deve ser base64 válido');
  }

  return { buffer, dataUrlMime };
}

function assertDeclaredMimeMatches({ mimeType, dataUrlMime }) {
  const normalizedMimeType = String(mimeType || '').trim().toLowerCase();

  if (!ALLOWED_PHOTO_MIME_TYPES.includes(normalizedMimeType)) {
    throw new ServicePhotoError('unsupported_mime_type', 'Somente imagens JPEG e WebP são aceitas.');
  }

  if (dataUrlMime && dataUrlMime !== normalizedMimeType) {
    throw new ServicePhotoError('mime_mismatch', 'mimeType diverge do conteúdo enviado.');
  }

  return normalizedMimeType;
}

/**
 * Valida o payload declarado, confirma o formato real pelo sharp, normaliza a
 * orientação EXIF e redimensiona o maior lado para <= 1920 px sem ampliar.
 */
async function processServicePhotoPayload({ image, filename, mimeType, photoType }) {
  if (!isPhotoType(photoType)) {
    throw new ServicePhotoError('invalid_photo_type', 'photo_type deve ser pickup ou delivery');
  }

  const originalFilename = sanitizeFilename(filename);
  const { buffer, dataUrlMime } = decodeBase64Image(image);
  const declaredMimeType = assertDeclaredMimeMatches({ mimeType, dataUrlMime });

  let metadata;
  try {
    metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch (error) {
    throw new ServicePhotoError('invalid_image', 'Arquivo não é uma imagem JPEG ou WebP válida.', {
      cause: error,
    });
  }

  const realFormat = metadata.format;
  if (!realFormat || FORMAT_BY_MIME[declaredMimeType] !== realFormat) {
    throw new ServicePhotoError(
      'mime_mismatch',
      'O conteúdo real da imagem diverge do mimeType declarado.'
    );
  }

  const declaredExtension = path.extname(originalFilename).toLowerCase();
  if (declaredExtension && !EXTENSIONS_BY_FORMAT[realFormat].includes(declaredExtension)) {
    throw new ServicePhotoError('mime_mismatch', 'A extensão do arquivo diverge do conteúdo real.');
  }

  let normalized;
  try {
    normalized = await sharp(buffer, { failOn: 'error' })
      .rotate() // aplica a orientação EXIF e remove os metadados na saída
      .resize({
        width: MAX_PHOTO_DIMENSION,
        height: MAX_PHOTO_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toFormat(realFormat)
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    throw new ServicePhotoError('invalid_image', 'Não foi possível processar a imagem enviada.', {
      cause: error,
    });
  }

  return {
    buffer: normalized.data,
    mimeType: declaredMimeType,
    format: normalized.info.format,
    width: normalized.info.width,
    height: normalized.info.height,
    sizeBytes: normalized.info.size,
    sourceSizeBytes: buffer.length,
    sha256: crypto.createHash('sha256').update(normalized.data).digest('hex'),
    originalFilename,
  };
}

function assertWithinRoot(root, candidate) {
  const resolved = path.resolve(candidate);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ServicePhotoError('unsafe_storage_path', 'Caminho de armazenamento inválido', {
      status: 500,
    });
  }
  return resolved;
}

async function ensurePrivateDirectory(directory) {
  await fsp.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fsp.lstat(directory);

  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new ServicePhotoError('unsafe_storage_path', 'Caminho de armazenamento inválido', {
      status: 500,
    });
  }

  // Reforça 0700 mesmo quando o diretório já existia com permissão mais ampla.
  await fsp.chmod(directory, 0o700).catch(() => {});
}

function assertRequestIdSegment(requestId) {
  const segment = String(requestId);
  if (!/^[1-9][0-9]*$/.test(segment)) {
    throw new ServicePhotoError('invalid_request_id', 'Identificador de solicitação inválido');
  }
  return segment;
}

/**
 * Escreve a foto processada em <root>/<id>/<photoType>-<uuid>.<ext>.
 * Temp + fsync + rename no mesmo diretório: nunca existe arquivo parcial no
 * caminho final e nenhum arquivo temporário sobrevive a uma falha.
 */
async function storeServicePhoto({ requestId, photoType, processed }) {
  if (!isPhotoType(photoType)) {
    throw new ServicePhotoError('invalid_photo_type', 'photo_type deve ser pickup ou delivery');
  }
  if (!processed || !Buffer.isBuffer(processed.buffer) || !processed.format) {
    throw new ServicePhotoError('invalid_image', 'Imagem processada inválida');
  }

  const root = getStorageRoot();
  const idSegment = assertRequestIdSegment(requestId);
  const requestDirectory = assertWithinRoot(root, path.join(root, idSegment));

  await ensurePrivateDirectory(root);
  await ensurePrivateDirectory(requestDirectory);

  const extension = EXTENSIONS_BY_FORMAT[processed.format][0];
  const filename = `${photoType}-${crypto.randomUUID()}${extension}`;
  const finalPath = assertWithinRoot(root, path.join(requestDirectory, filename));
  const temporaryPath = assertWithinRoot(
    root,
    path.join(requestDirectory, `.${filename}.${crypto.randomUUID()}.tmp`)
  );

  let handle = null;
  try {
    handle = await fsp.open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(processed.buffer);
    await handle.sync();
    await handle.close();
    handle = null;
    await fsp.rename(temporaryPath, finalPath);
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
    }
    await fsp.unlink(temporaryPath).catch(() => {});
    throw new ServicePhotoError('photo_write_failed', 'Não foi possível armazenar a foto', {
      status: 500,
      cause: error,
    });
  }

  await fsp.chmod(finalPath, 0o600).catch(() => {});

  const stat = await fsp.stat(finalPath);
  if (stat.size !== processed.buffer.length) {
    await fsp.unlink(finalPath).catch(() => {});
    throw new ServicePhotoError('photo_write_failed', 'Não foi possível armazenar a foto', {
      status: 500,
    });
  }

  return {
    storageKey: `${idSegment}/${filename}`,
    absolutePath: finalPath,
    sizeBytes: stat.size,
  };
}

/**
 * Resolve uma chave persistida ("<id>/<arquivo>") para caminho absoluto,
 * recusando traversal, symlink e qualquer saída da raiz privada.
 */
async function resolveStoredPhotoPath(storageKey) {
  const root = getStorageRoot();

  if (typeof storageKey !== 'string' || !STORAGE_KEY_PATTERN.test(storageKey)) {
    throw new ServicePhotoError('invalid_storage_key', 'Referência de foto inválida', {
      status: 500,
    });
  }

  const absolutePath = assertWithinRoot(root, path.join(root, ...storageKey.split('/')));
  let stat;
  try {
    stat = await fsp.lstat(absolutePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new ServicePhotoError('photo_not_found', 'Foto não encontrada no armazenamento', {
        status: 500,
      });
    }
    throw new ServicePhotoError('photo_read_failed', 'Não foi possível ler a foto', {
      status: 500,
      cause: error,
    });
  }

  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new ServicePhotoError('unsafe_storage_path', 'Referência de foto inválida', {
      status: 500,
    });
  }

  return { absolutePath, sizeBytes: stat.size };
}

async function readStoredPhoto(storageKey) {
  const { absolutePath, sizeBytes } = await resolveStoredPhotoPath(storageKey);
  try {
    const buffer = await fsp.readFile(absolutePath);
    return { buffer, sizeBytes };
  } catch (error) {
    throw new ServicePhotoError('photo_read_failed', 'Não foi possível ler a foto', {
      status: 500,
      cause: error,
    });
  }
}

/** Remoção best-effort usada no rollback da transação (nunca lança). */
async function removeStoredPhoto(storageKey) {
  try {
    const { absolutePath } = await resolveStoredPhotoPath(storageKey);
    await fsp.unlink(absolutePath);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * G2 — lista somente os arquivos que são chaves válidas do contrato sob a raiz
 * privada (`SERVICE_PHOTO_STORAGE_DIR` por padrão).
 *
 * Varredura estrita de dois níveis (<id>/<arquivo>): ignora symlinks (nunca
 * segue nem aponta para fora), ignora entradas que não casam com
 * STORAGE_KEY_PATTERN (temporários, lixo, diretórios desconhecidos) e nunca
 * retorna nada fora da raiz. Não expõe caminho absoluto ao chamador HTTP; o
 * caminho é usado apenas internamente para remoção segura.
 */
async function listStoredPhotoFiles({ root } = {}) {
  const storageRoot = path.resolve(root || getStorageRoot());

  let rootStat;
  try {
    rootStat = await fsp.lstat(storageRoot);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw new ServicePhotoError('photo_read_failed', 'Não foi possível ler o armazenamento privado', {
      status: 500,
      cause: error,
    });
  }

  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new ServicePhotoError('unsafe_storage_path', 'Caminho de armazenamento inválido', {
      status: 500,
    });
  }

  const files = [];
  const entries = await fsp.readdir(storageRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      continue;
    }

    const directoryPath = path.join(storageRoot, entry.name);
    const directoryStat = await fsp.lstat(directoryPath).catch(() => null);
    if (!directoryStat || directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
      continue;
    }

    const children = await fsp.readdir(directoryPath, { withFileTypes: true });
    for (const child of children) {
      if (!child.isFile() || child.isSymbolicLink()) {
        continue;
      }

      const storageKey = `${entry.name}/${child.name}`;
      if (!STORAGE_KEY_PATTERN.test(storageKey)) {
        continue;
      }

      files.push({ storageKey, absolutePath: path.join(directoryPath, child.name) });
    }
  }

  return files;
}

function normalizePhotoReferences(references) {
  const keys = new Set();
  const prefixes = new Set();

  if (!references) {
    return { keys, prefixes };
  }

  if (Array.isArray(references) || references instanceof Set) {
    for (const key of references) {
      if (typeof key === 'string' && key.trim()) {
        keys.add(key.trim());
      }
    }
    return { keys, prefixes };
  }

  if (typeof references === 'object') {
    for (const key of references.keys || []) {
      if (typeof key === 'string' && key.trim()) {
        keys.add(key.trim());
      }
    }
    for (const prefix of references.prefixes || []) {
      if (typeof prefix === 'string' && prefix.trim()) {
        prefixes.add(prefix.trim());
      }
    }
  }

  return { keys, prefixes };
}

function isReferencedStorageKey(storageKey, { keys, prefixes }) {
  if (keys.has(storageKey)) {
    return true;
  }

  for (const prefix of prefixes) {
    if (storageKey.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

/**
 * G2 — reconciliação de órfãos do armazenamento privado.
 *
 * Lista apenas arquivos com chave válida sob a raiz e remove somente os que não
 * têm referência correspondente nas quatro colunas de foto do contrato
 * (`pickup_photo_url`/`pickup_photo_metadata`/`delivery_photo_url`/
 * `delivery_photo_metadata`), recebidas via `references` (chaves exatas e/ou
 * prefixos `<id>/<tipo>-`).
 *
 * `dryRun` é o padrão: nada é apagado sem opt-in explícito. Nunca apaga fora da
 * raiz, nunca segue symlink e nunca toca em arquivos sem chave válida.
 */
async function reconcileOrphanServicePhotos({ references = {}, dryRun = true, root } = {}) {
  const storageRoot = path.resolve(root || getStorageRoot());
  const normalized = normalizePhotoReferences(references);
  const files = await listStoredPhotoFiles({ root: storageRoot });
  const orphans = files.filter(file => !isReferencedStorageKey(file.storageKey, normalized));

  const report = {
    dry_run: Boolean(dryRun),
    scanned: files.length,
    referenced: files.length - orphans.length,
    orphaned: orphans.length,
    removed: 0,
    failed: 0,
    orphan_keys: orphans.map(orphan => orphan.storageKey),
  };

  if (dryRun || orphans.length === 0) {
    return report;
  }

  for (const orphan of orphans) {
    try {
      // Revalidação imediatamente antes do unlink: precisa continuar dentro da
      // raiz e ser arquivo regular (nunca symlink).
      const resolved = assertWithinRoot(storageRoot, orphan.absolutePath);
      const stat = await fsp.lstat(resolved);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        report.failed += 1;
        continue;
      }

      await fsp.unlink(resolved);
      report.removed += 1;
    } catch (error) {
      report.failed += 1;
    }
  }

  return report;
}

/** URL autenticada e estável da foto; nunca um caminho de filesystem. */
function buildPhotoUrl(requestId, photoType) {
  if (!isPhotoType(photoType)) {
    throw new ServicePhotoError('invalid_photo_type', 'photo_type deve ser pickup ou delivery');
  }
  return `/api/upload/emergency-requests/${encodeURIComponent(String(requestId))}/photos/${photoType}`;
}

function fileExtensionForFormat(format) {
  return EXTENSIONS_BY_FORMAT[format] ? EXTENSIONS_BY_FORMAT[format][0] : '.bin';
}

function fileExistsSync(filePath) {
  return fs.existsSync(filePath);
}

module.exports = {
  ServicePhotoError,
  PHOTO_TYPES,
  ALLOWED_PHOTO_MIME_TYPES,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_DIMENSION,
  STORAGE_KEY_PATTERN,
  getStorageRoot,
  isPhotoType,
  sanitizeFilename,
  decodeBase64Image,
  processServicePhotoPayload,
  storeServicePhoto,
  resolveStoredPhotoPath,
  readStoredPhoto,
  removeStoredPhoto,
  listStoredPhotoFiles,
  reconcileOrphanServicePhotos,
  buildPhotoUrl,
  fileExtensionForFormat,
  fileExistsSync,
};
