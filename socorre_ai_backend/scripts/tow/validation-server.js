#!/usr/bin/env node
/**
 * Tow local validation environment — REAL backend launcher.
 *
 * Starts the production server stack (`src/server.js`) against the disposable
 * validation database, loading ONLY `.env.validation` explicitly:
 *
 *   npm run start:validation
 *
 * Why a launcher instead of `node src/server.js`: the default entrypoint loads
 * `socorre_ai_backend/.env` (development/production), which is exactly the file
 * the validation profile must never read. This launcher loads the validation
 * file first, so every module initialized afterwards (`src/config/database.js`,
 * `src/config/jwt.js`, ...) sees the validation values. `dotenv` never
 * overrides an already-set variable, so shell overrides still win and a stray
 * `.env` cannot replace them.
 *
 * It refuses to start with `NODE_ENV=production` or with a connection URL
 * (`DATABASE_URL` / `PostgreSQL`), because the development branch of
 * `src/config/postgresConnection.js` would prefer such a URL and could reach a
 * non-validation database.
 *
 * Prints (never a secret): profile file, password-free database target, local
 * URL, LAN URL, the resolved Tow payment mode and route provider kind.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const dotenv = require('dotenv');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const ENV_FILE = path.join(BACKEND_DIR, '.env.validation');

// The validation profile is the only configuration source. Fail with the exact
// recovery step when it is missing — never fall back to `.env` / `.env.test`.
if (!fs.existsSync(ENV_FILE)) {
  console.error(
    `[validation] ${ENV_FILE} not found: copy the tracked example first:\n`
    + '  cp .env.validation.example .env.validation'
  );
  process.exit(1);
}

// Explicit path only: `dotenv.config()` without a path (used by src/*) loads
// `.env`, which must never configure the validation profile.
dotenv.config({ path: ENV_FILE });

// Harmless here (no harness is loaded), kept for symmetry with validation-env.
process.env.TOW_TEST_ENV_FILE = process.env.TOW_TEST_ENV_FILE || '.env.validation';
process.env.TOW_TEST_PG_PROJECT = process.env.TOW_TEST_PG_PROJECT || 'socorre-tow-validation';

if ((process.env.NODE_ENV || 'development') === 'production') {
  console.error(
    '[validation] refusing to start: NODE_ENV=production. '
    + 'The validation launcher only runs the development profile.'
  );
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATABASE = `${process.env.DB_USER || 'tow_validation'}@${process.env.DB_HOST || '127.0.0.1'}:`
  + `${process.env.DB_PORT || '55433'}/${process.env.DB_NAME || 'socorre_tow_validation_test'}`;

/** First non-internal IPv4 address, or `null` when the machine has none. */
function lanAddress() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry && entry.family === 'IPv4' && entry.internal === false) {
        return entry.address;
      }
    }
  }
  return null;
}

/** `unavailable` for a missing optional module; the message otherwise. */
function unavailableReason(error) {
  if (error && error.code === 'MODULE_NOT_FOUND') return 'unavailable';
  return `unavailable (${error && error.message ? error.message : error})`;
}

/**
 * Resolved payment mode description. The config module is created by the
 * runtime configuration delivery and is optional from this launcher's point of
 * view: when it is absent (or misconfigured) the line says `unavailable`
 * instead of crashing — the app itself still fails loudly on a bad value.
 */
function describePaymentMode() {
  try {
    // eslint-disable-next-line global-require
    const mod = require('../../src/config/towPaymentMode');
    if (typeof mod.assertTowPaymentModeSafe === 'function'
      && typeof mod.describeTowPaymentMode === 'function') {
      return mod.describeTowPaymentMode(mod.assertTowPaymentModeSafe(process.env));
    }
    return 'unavailable (unexpected towPaymentMode module shape)';
  } catch (error) {
    return unavailableReason(error);
  }
}

/** Resolved route provider kind; same lazy/optional contract as above. */
function describeRouteProviderKind() {
  try {
    // eslint-disable-next-line global-require
    const mod = require('../../src/config/towRouteProvider');
    if (typeof mod.assertTowRouteProviderSafe === 'function') {
      return mod.assertTowRouteProviderSafe(process.env);
    }
    if (typeof mod.resolveTowRouteProviderKind === 'function') {
      return mod.resolveTowRouteProviderKind(process.env);
    }
    return 'unavailable (unexpected towRouteProvider module shape)';
  } catch (error) {
    return unavailableReason(error);
  }
}

function printBanner() {
  const lan = lanAddress();
  console.log(`[validation] profile: ${ENV_FILE}`);
  console.log(`[validation] database: postgresql://${DATABASE}`);
  console.log(`[validation] local URL: http://127.0.0.1:${PORT}`);
  console.log(`[validation] LAN URL: ${lan ? `http://${lan}:${PORT}` : 'unavailable (no external IPv4 interface)'}`);
  console.log(`[validation] payment mode: ${describePaymentMode()}`);
  console.log(`[validation] route provider: ${describeRouteProviderKind()}`);
  console.log(`[validation] NODE_ENV=${process.env.NODE_ENV || 'development'}`);
}

printBanner();

// `src/server` materializes the app (and the Knex connection config) at import
// time, so the URL guard must run AFTER the import: that is when a development
// `.env` could have injected a connection URL.
// eslint-disable-next-line global-require
const serverModule = require('../../src/server');

if (process.env.DATABASE_URL || process.env.PostgreSQL) {
  console.error(
    '[validation] refusing to start: DATABASE_URL/PostgreSQL is set (or was injected by `.env`). '
    + 'The validation profile resolves host/port/database/user from .env.validation only.'
  );
  process.exit(1);
}

// eslint-disable-next-line global-require
const { getPostgresConnection } = require('../../src/config/postgresConnection');
if (typeof getPostgresConnection('development') === 'string') {
  console.error(
    '[validation] refusing to start: the resolved development connection is a URL, not the '
    + 'explicit validation target. Remove DATABASE_URL/PostgreSQL from the environment.'
  );
  process.exit(1);
}

console.log('[validation] starting the real backend...');
serverModule.startServer({ port: PORT, host: HOST });
