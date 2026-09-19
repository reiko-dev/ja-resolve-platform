/**
 * MVP-01 EXT-MVP01-3 — DEPLOYMENT DURABILITY suite (static/config assertions).
 *
 * Private Tow document storage must survive a code release. The homolog deploy
 * publishes with `rsync -a --delete "$REPO/socorre_ai_backend/" "$STAGING/backend/"`,
 * so anything under the backend tree is replaceable and can be deleted while the
 * PostgreSQL metadata survives. These assertions pin the supported deployments to
 * a durable directory OUTSIDE the repository backend tree, mirroring the existing
 * `SERVICE_PHOTO_STORAGE_DIR` convention:
 *
 *   - production + homolog PM2 ecosystems export TOW_DOCUMENT_STORAGE_DIR;
 *   - production + homolog deploy scripts create it with mode 700;
 *   - the configured root is NOT inside the homolog rsync source/release tree;
 *   - the backend Compose services define the env var + a named volume (and the
 *     legacy-off service does not).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BACKEND_DIR = path.join(REPO_ROOT, 'socorre_ai_backend');
const STORAGE_DIR = '/var/lib/socorre-ai/private/tow-documents';

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function expectDurableLocation(storageDir, { backendDir = BACKEND_DIR } = {}) {
  const resolved = path.resolve(storageDir);
  expect(resolved).toBe(STORAGE_DIR);
  expect(isInside(backendDir, resolved)).toBe(false);
  expect(isInside(REPO_ROOT, resolved)).toBe(false);
}

function lineContaining(source, needle) {
  return source.split('\n').find((line) => line.includes(needle));
}

describe('MVP-01 EXT-MVP01-3 — Tow storage durability (deployment config)', () => {
  test('production PM2 ecosystem exports a durable TOW_DOCUMENT_STORAGE_DIR', () => {
    const ecosystem = require(path.join(BACKEND_DIR, 'ecosystem.config.js'));
    const app = ecosystem.apps.find((entry) => entry.name === 'socorre-ai-backend');
    expect(app).toBeTruthy();
    expect(app.env_production.NODE_ENV).toBe('production');
    expect(app.env_production.TOW_DOCUMENT_STORAGE_DIR).toBe(STORAGE_DIR);
    expectDurableLocation(app.env_production.TOW_DOCUMENT_STORAGE_DIR);
  });

  test('homolog PM2 ecosystem exports a durable TOW_DOCUMENT_STORAGE_DIR', () => {
    const ecosystem = require(path.join(REPO_ROOT, 'scripts/homolog/ecosystem.homolog.config.js'));
    const app = ecosystem.apps.find((entry) => entry.name === 'socorre-ai-homolog-backend');
    expect(app).toBeTruthy();
    expect(app.env.NODE_ENV).toBe('production');
    expect(app.env.TOW_DOCUMENT_STORAGE_DIR).toBe(STORAGE_DIR);
    expectDurableLocation(app.env.TOW_DOCUMENT_STORAGE_DIR);
  });

  test('production deploy script creates the tow-documents dir with mode 700', () => {
    const line = lineContaining(read('scripts/deploy-production.sh'), 'tow-documents');
    expect(line).toBeTruthy();
    expect(line).toMatch(/install -d/);
    expect(line).toMatch(/-m 700/);
    expect(line).toContain('/private/tow-documents');
  });

  test('homolog deploy script creates the tow-documents dir with mode 700', () => {
    const line = lineContaining(read('scripts/homolog/deploy-homolog.sh'), 'tow-documents');
    expect(line).toBeTruthy();
    expect(line).toMatch(/install -d/);
    expect(line).toMatch(/-m 700/);
    expect(line).toContain('/private/tow-documents');
  });

  test('the homolog rsync source is $REPO/socorre_ai_backend/ and storage is outside it', () => {
    const script = read('scripts/homolog/deploy-homolog.sh');
    expect(script).toContain('"$REPO/socorre_ai_backend/" "$STAGING/backend/"');
    expect(script).toMatch(/rsync -a --delete/);

    const repoBackend = '/var/www/socorre-ai/repository/socorre_ai_backend';
    expect(isInside(repoBackend, STORAGE_DIR)).toBe(false);
  });

  test('bootstrap-vps.sh does not provision the private photo dirs (nothing to mirror)', () => {
    const script = read('scripts/homolog/bootstrap-vps.sh');
    expect(script).not.toContain('service-photos');
    expect(script).not.toContain('tow-documents');
  });

  test('backend Compose services mount a durable named volume for Tow documents', () => {
    for (const file of ['docker-compose-simple.yml', 'docker-compose.yml']) {
      const doc = yaml.load(read(file));
      const backend = doc.services.backend;
      expect(backend).toBeTruthy();

      const environment = (backend.environment || []).map(String);
      expect(environment).toContain(`TOW_DOCUMENT_STORAGE_DIR=${STORAGE_DIR}`);

      const volumes = (backend.volumes || []).map(String);
      expect(volumes).toContain(`tow_document_data:${STORAGE_DIR}`);

      expect(Object.prototype.hasOwnProperty.call(doc.volumes || {}, 'tow_document_data')).toBe(true);
    }
  });

  test('the legacy-off Compose service does not get the Tow storage config', () => {
    for (const file of ['docker-compose-simple.yml', 'docker-compose.yml']) {
      const doc = yaml.load(read(file));
      const legacy = doc.services.backend_legacy_off;
      if (!legacy) continue;

      const environment = (legacy.environment || []).map(String);
      expect(environment.some((entry) => entry.includes('TOW_DOCUMENT_STORAGE_DIR'))).toBe(false);

      const volumes = (legacy.volumes || []).map(String);
      expect(volumes.some((entry) => entry.includes('tow_document_data'))).toBe(false);
    }
  });

  test('env.production.example documents TOW_DOCUMENT_STORAGE_DIR', () => {
    const example = read('socorre_ai_backend/env.production.example');
    expect(example).toMatch(/SERVICE_PHOTO_STORAGE_DIR=/);
    expect(example).toContain(`TOW_DOCUMENT_STORAGE_DIR=${STORAGE_DIR}`);
  });
});
