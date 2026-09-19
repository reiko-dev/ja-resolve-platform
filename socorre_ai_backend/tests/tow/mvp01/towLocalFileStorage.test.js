/**
 * MVP-01 EXT — UNIT suite for the private local FileStorage adapter.
 *
 * Proves the storage contract is private-read only (EXT-MVP01-1) and durable
 * outside the replaceable release tree (EXT-MVP01-3):
 *   - the default directory lives OUTSIDE the public `uploads/` tree;
 *   - `save` returns only `{ key }` (never a public URL) and `read` returns the
 *     stored bytes;
 *   - there is no `urlFor` public-URL capability on the implementation;
 *   - a key that tries to escape the base directory is refused;
 *   - the private directory is git-ignored;
 *   - production REQUIRES `TOW_DOCUMENT_STORAGE_DIR` and rejects a path inside
 *     the running backend release tree or inside `uploads/`;
 *   - created directories are 0700 and files 0600 on POSIX (umask-proof).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createLocalFileStorage,
  resolveStorageDir,
  TowStorageConfigError,
  BACKEND_DIR,
} = require('../../../src/modules/tow/adapters/storage/local-file-storage');

const POSIX = process.platform !== 'win32';

/** Run `fn` with the given env snapshot, restoring the previous values. */
function withEnv(overrides, fn) {
  const saved = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of saved.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('MVP-01 EXT UNIT — private local file storage', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tow-private-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('the default base directory is outside the public uploads tree', () => {
    const previous = process.env.TOW_DOCUMENT_STORAGE_DIR;
    delete process.env.TOW_DOCUMENT_STORAGE_DIR;
    try {
      const storage = createLocalFileStorage();
      const baseDir = path.resolve(storage.baseDir);
      expect(baseDir).toContain(`${path.sep}private${path.sep}tow-documents`);
      expect(baseDir.split(path.sep)).not.toContain('uploads');
    } finally {
      if (previous === undefined) delete process.env.TOW_DOCUMENT_STORAGE_DIR;
      else process.env.TOW_DOCUMENT_STORAGE_DIR = previous;
    }
  });

  test('the env override is honoured', () => {
    const storage = createLocalFileStorage({ baseDir: dir });
    expect(path.resolve(storage.baseDir)).toBe(path.resolve(dir));
  });

  test('save returns only a key; read returns the bytes; remove deletes them', async () => {
    const storage = createLocalFileStorage({ baseDir: dir });
    const saved = await storage.save({
      buffer: Buffer.from('secret-bytes'),
      originalName: 'crlv.jpg',
      mimeType: 'image/jpeg',
    });

    expect(saved).toEqual({ key: expect.any(String) });
    expect(saved).not.toHaveProperty('url');
    expect(typeof storage.urlFor).toBe('undefined');

    const buffer = await storage.read(saved.key);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString()).toBe('secret-bytes');

    await storage.remove(saved.key);
    await expect(storage.read(saved.key)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('a key that escapes the base directory is refused', async () => {
    const storage = createLocalFileStorage({ baseDir: dir });
    await expect(storage.read('../../etc/passwd')).rejects.toThrow(/escapes/);
    await expect(storage.remove('../../etc/passwd')).rejects.toThrow(/escapes/);
  });

  test('the private directory is git-ignored', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
    const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/socorre_ai_backend\/private/);
  });
});

describe('MVP-01 EXT-MVP01-3 UNIT — production storage location fail-fast', () => {
  test('production without TOW_DOCUMENT_STORAGE_DIR throws (no release-local fallback)', () => {
    withEnv({ NODE_ENV: 'production', TOW_DOCUMENT_STORAGE_DIR: undefined }, () => {
      expect(() => createLocalFileStorage()).toThrow(TowStorageConfigError);
      expect(() => createLocalFileStorage()).toThrow(/TOW_DOCUMENT_STORAGE_DIR is required in production/);
    });
  });

  test('production rejects an empty TOW_DOCUMENT_STORAGE_DIR', () => {
    withEnv({ NODE_ENV: 'production', TOW_DOCUMENT_STORAGE_DIR: '   ' }, () => {
      expect(() => createLocalFileStorage()).toThrow(/TOW_DOCUMENT_STORAGE_DIR is required in production/);
    });
  });

  test('production rejects a path inside the running backend release tree', () => {
    const insideBackend = path.join(BACKEND_DIR, 'private', 'tow-documents');
    withEnv({ NODE_ENV: 'production', TOW_DOCUMENT_STORAGE_DIR: insideBackend }, () => {
      expect(() => createLocalFileStorage()).toThrow(/inside the running backend release tree/);
      expect(() => createLocalFileStorage()).toThrow(new RegExp(insideBackend.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });
  });

  test('production rejects a staging/backend release-tree path', () => {
    const releasePath = path.join(BACKEND_DIR, '..', 'staging', 'backend', 'private', 'tow-documents');
    withEnv({ NODE_ENV: 'production', TOW_DOCUMENT_STORAGE_DIR: releasePath }, () => {
      expect(() => createLocalFileStorage()).toThrow(/inside the running backend release tree/);
    });
  });

  test('production rejects a path inside a releases tree', () => {
    const releasesPath = path.join(path.parse(BACKEND_DIR).root, 'var', 'www', 'socorre-ai', 'releases', '20260101', 'private');
    withEnv({ NODE_ENV: 'production', TOW_DOCUMENT_STORAGE_DIR: releasesPath }, () => {
      expect(() => createLocalFileStorage()).toThrow(/inside the running backend release tree/);
    });
  });

  test('production rejects a path containing an uploads segment', () => {
    const uploadsPath = path.join(path.parse(BACKEND_DIR).root, 'var', 'www', 'uploads', 'tow-documents');
    withEnv({ NODE_ENV: 'production', TOW_DOCUMENT_STORAGE_DIR: uploadsPath }, () => {
      expect(() => createLocalFileStorage()).toThrow(/public uploads tree/);
    });
  });

  test('production honours an explicit persistent path outside the release tree', () => {
    const persistent = '/var/lib/socorre-ai/private/tow-documents';
    withEnv({ NODE_ENV: 'production', TOW_DOCUMENT_STORAGE_DIR: persistent }, () => {
      const storage = createLocalFileStorage();
      expect(path.resolve(storage.baseDir)).toBe(persistent);
    });
  });

  test('dev/test fallback stays <backend>/private/tow-documents', () => {
    withEnv({ NODE_ENV: 'test', TOW_DOCUMENT_STORAGE_DIR: undefined }, () => {
      const resolved = resolveStorageDir();
      expect(resolved).toBe(path.join(BACKEND_DIR, 'private', 'tow-documents'));
      expect(resolved).not.toContain('uploads');
    });
  });
});

describe('MVP-01 EXT-MVP01-3 UNIT — POSIX permissions', () => {
  test('created directories are 0700 and document files 0600 on POSIX', async () => {
    if (!POSIX) {
      // Windows has no POSIX mode bits; the adapter degrades best-effort there.
      // This is the only platform where the assertion is skipped.
      return;
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tow-modes-'));
    try {
      const storage = createLocalFileStorage({ baseDir: dir });
      const saved = await storage.save({ buffer: Buffer.from('private'), originalName: 'crlv.jpg' });

      const filePath = path.join(dir, ...saved.key.split('/'));
      const fileMode = fs.statSync(filePath).mode & 0o777;
      const dirMode = fs.statSync(path.dirname(filePath)).mode & 0o777;

      expect(dirMode).toBe(0o700);
      expect(fileMode).toBe(0o600);
      expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
