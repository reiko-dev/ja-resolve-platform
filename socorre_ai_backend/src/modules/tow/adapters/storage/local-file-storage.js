/**
 * MVP-01 — local filesystem implementation of the FileStorage port.
 *
 * Infrastructure adapter: the only MVP-01 layer allowed to touch the
 * filesystem. The application sees only `save/remove/urlFor`.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_PUBLIC_BASE = '/uploads/tow-documents';

function defaultBaseDir() {
  if (process.env.TOW_DOCUMENT_STORAGE_DIR) return process.env.TOW_DOCUMENT_STORAGE_DIR;
  // storage -> adapters -> tow -> modules -> src -> backend
  return path.resolve(__dirname, '..', '..', '..', '..', '..', 'uploads', 'tow-documents');
}

function safeExtension(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

function createLocalFileStorage(options = {}) {
  const baseDir = options.baseDir || defaultBaseDir();
  const publicBaseUrl = options.publicBaseUrl
    || process.env.TOW_DOCUMENT_PUBLIC_BASE
    || DEFAULT_PUBLIC_BASE;

  function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
  }

  function urlFor(key) {
    return `${publicBaseUrl}/${key}`;
  }

  async function save({ buffer, originalName, keyPrefix = 'tow-vehicles' }) {
    const relativeDir = String(keyPrefix).replace(/^\/+|\/+$/g, '');
    const filename = `${crypto.randomBytes(10).toString('hex')}${safeExtension(originalName)}`;
    const key = `${relativeDir}/${filename}`;
    const absolute = path.join(baseDir, relativeDir, filename);
    ensureDir(path.dirname(absolute));
    await fs.promises.writeFile(absolute, buffer);
    return { key, url: urlFor(key) };
  }

  async function remove(key) {
    const absolute = path.join(baseDir, key);
    try {
      await fs.promises.unlink(absolute);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  return { save, remove, urlFor, baseDir };
}

module.exports = { createLocalFileStorage, DEFAULT_PUBLIC_BASE };
