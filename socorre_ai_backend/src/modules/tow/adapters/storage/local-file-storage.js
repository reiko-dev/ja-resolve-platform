/**
 * MVP-01 EXT — local filesystem implementation of the private FileStorage port.
 *
 * Infrastructure adapter: the only MVP-01 layer allowed to touch the
 * filesystem. The application sees only `save/read/remove`.
 *
 * Privacy guarantee (EXT-MVP01-1): the base directory lives OUTSIDE the public
 * web tree (never `uploads/`). There is deliberately no public URL capability —
 * bytes are only reachable through the authenticated download endpoints, which
 * read them via this port.
 *
 * Durability guarantee (EXT-MVP01-3): in production `TOW_DOCUMENT_STORAGE_DIR`
 * is mandatory and must resolve OUTSIDE the running backend release tree. This
 * prevents the `rsync --delete` release tree from ever holding (and therefore
 * deleting) durable document blobs while PostgreSQL metadata survives. The
 * deploy scripts provision `/var/lib/socorre-ai/private/tow-documents`
 * (mirroring `SERVICE_PHOTO_STORAGE_DIR`). Dev/test may fall back to the
 * git-ignored `<backend>/private/tow-documents`; production may not.
 *
 * Files created here are private on POSIX: directories `0700`, files `0600`,
 * enforced with an explicit `chmod` so a permissive umask cannot widen them.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// storage -> adapters -> tow -> modules -> src -> backend
const BACKEND_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..');
const DEFAULT_SUBDIR = ['private', 'tow-documents'];
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
// Deployment fallback recommended to operators; never assumed at runtime.
const RECOMMENDED_DIR = '/var/lib/socorre-ai/private/tow-documents';

class TowStorageConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TowStorageConfigError';
    this.code = 'tow_storage_config_error';
  }
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/** True when `child` is `parent` itself or lives under it. */
function isInsideOrEqual(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function hasPathSegment(target, segment) {
  return path.resolve(target).split(path.sep).includes(segment);
}

/**
 * Replaceable deploy-tree markers used by the homolog release layout
 * (`<root>/staging/backend`) and the release archives (`<root>/releases/...`).
 * Storage must never live inside either, even when the running process is
 * started from a different directory.
 */
function isReleaseTreePath(target) {
  const segments = path.resolve(target).split(path.sep);
  if (segments.includes('releases')) return true;
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (segments[index] === 'staging' && segments[index + 1] === 'backend') return true;
  }
  return false;
}

/**
 * Resolve the authoritative storage root.
 *
 * - explicit `baseDir` option or `TOW_DOCUMENT_STORAGE_DIR` wins (absolute);
 * - production without it -> configuration error (no release-local fallback);
 * - production location inside the running backend release tree or containing
 *   an `uploads` segment -> configuration error naming the offending path;
 * - dev/test fallback -> `<backend>/private/tow-documents` (git-ignored).
 */
function resolveStorageDir(options = {}) {
  const configured = options.baseDir !== undefined && options.baseDir !== null
    ? options.baseDir
    : process.env.TOW_DOCUMENT_STORAGE_DIR;
  const hasConfigured = configured !== undefined
    && configured !== null
    && String(configured).trim() !== '';

  if (!hasConfigured) {
    if (isProduction()) {
      throw new TowStorageConfigError(
        'TOW_DOCUMENT_STORAGE_DIR is required in production: configure a '
          + `persistent private directory outside the application release tree (e.g. ${RECOMMENDED_DIR})`
      );
    }
    return path.resolve(BACKEND_DIR, ...DEFAULT_SUBDIR);
  }

  const resolved = path.resolve(String(configured).trim());

  if (resolved === path.parse(resolved).root) {
    throw new TowStorageConfigError(
      `TOW_DOCUMENT_STORAGE_DIR must not be the filesystem root (${resolved})`
    );
  }

  if (isProduction()) {
    if (isInsideOrEqual(BACKEND_DIR, resolved) || isReleaseTreePath(resolved)) {
      throw new TowStorageConfigError(
        'TOW_DOCUMENT_STORAGE_DIR points inside the running backend release tree '
          + `(${resolved}); configure a persistent directory outside the application tree `
          + `(e.g. ${RECOMMENDED_DIR})`
      );
    }
    if (hasPathSegment(resolved, 'uploads')) {
      throw new TowStorageConfigError(
        'TOW_DOCUMENT_STORAGE_DIR must not point into the public uploads tree '
          + `(${resolved})`
      );
    }
  }

  return resolved;
}

function safeExtension(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

function chmodBestEffort(target, mode) {
  try {
    fs.chmodSync(target, mode);
  } catch (error) {
    /* exotic platforms (e.g. Windows) have no POSIX mode; never fatal */
  }
}

function createLocalFileStorage(options = {}) {
  const baseDir = resolveStorageDir(options);

  /** Create `dir` (and parents) private on POSIX, umask-proof. */
  function ensurePrivateDir(dir) {
    fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    let current = path.resolve(dir);
    while (isInsideOrEqual(baseDir, current)) {
      chmodBestEffort(current, DIR_MODE);
      if (current === baseDir) break;
      current = path.dirname(current);
    }
  }

  /**
   * Resolve a storage key inside `baseDir`, refusing traversal outside it. Keys
   * are generated internally, but a compromised/forged key must never read or
   * delete arbitrary files.
   */
  function resolveKey(key) {
    const normalized = String(key || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const absolute = path.resolve(baseDir, normalized);
    if (absolute !== baseDir && !absolute.startsWith(`${baseDir}${path.sep}`)) {
      throw new Error('storage key escapes the base directory');
    }
    return absolute;
  }

  async function save({ buffer, originalName, keyPrefix = 'tow-vehicles' }) {
    const relativeDir = String(keyPrefix).replace(/^\/+|\/+$/g, '');
    const filename = `${crypto.randomBytes(10).toString('hex')}${safeExtension(originalName)}`;
    const key = `${relativeDir}/${filename}`;
    const absolute = resolveKey(key);
    ensurePrivateDir(path.dirname(absolute));
    await fs.promises.writeFile(absolute, buffer, { mode: FILE_MODE });
    try {
      await fs.promises.chmod(absolute, FILE_MODE);
    } catch (error) {
      /* exotic platforms without POSIX modes; best-effort */
    }
    return { key };
  }

  async function read(key) {
    return fs.promises.readFile(resolveKey(key));
  }

  async function remove(key) {
    const absolute = resolveKey(key);
    try {
      await fs.promises.unlink(absolute);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  return { save, read, remove, baseDir };
}

module.exports = {
  createLocalFileStorage,
  resolveStorageDir,
  TowStorageConfigError,
  BACKEND_DIR,
  RECOMMENDED_DIR,
};
