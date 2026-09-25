/**
 * TOW CLIENT DEMO — deterministic demo cast and the safety gate of the demo
 * tooling (`demo-seed`, `demo-reset-session`, `demo-status`).
 *
 * This module owns ONE thing: the explicit, fail-closed authorization required
 * to touch a demo database. The demo database is NEVER reachable by accident:
 *
 *   1. the database name MUST end with `_demo` (e.g. `socorre_ai_tow_demo`) and
 *      must not contain any production-flavoured hint (prod/live/vps/homolog/
 *      staging/main/master);
 *   2. the target must be explicit (host/port/name/user/password), loopback and
 *      never a privileged role; connection URLs are refused;
 *   3. `TOW_DEMO_ENV=demo` is mandatory — a human statement that this target is
 *      the demonstration environment, not production;
 *   4. every command additionally requires its own opt-in flag
 *      (`TOW_DEMO_SEED=1`, `TOW_DEMO_RESET_SESSION=1`).
 *
 * The demo credentials are NEVER hardcoded: `TOW_DEMO_PASSWORD` must come from
 * the environment (on the VPS it lives in a mode-0600 shared file outside the
 * repository) and is never printed, logged or returned.
 *
 * The accounts below are the ONLY accounts the demo tooling ever creates,
 * updates or deletes. `deleteDemoTowData` never touches another user's data.
 */
'use strict';

const path = require('path');
const knexFactory = require('knex');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const ENV_FILE = path.join(BACKEND_DIR, '.env');

const DEMO_ENV_VAR = 'TOW_DEMO_ENV';
const DEMO_ENV_VALUE = 'demo';
const SEED_FLAG = 'TOW_DEMO_SEED';
const RESET_FLAG = 'TOW_DEMO_RESET_SESSION';
const PASSWORD_VAR = 'TOW_DEMO_PASSWORD';
const MIN_PASSWORD_LENGTH = 10;

const DEMO_DB_SUFFIX = '_demo';

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1'];
const WILDCARD_HOSTS = ['0.0.0.0', '::', '[::]', '*'];

/** Any of these in the database name refuses the demo target outright. */
const FORBIDDEN_NAME_HINTS = ['prod', 'production', 'live', 'vps', 'homolog', 'staging', 'main', 'master'];

/** A demo target must never run as one of these roles. */
const FORBIDDEN_USER_HINTS = ['prod', 'root', 'postgres', 'admin', 'superuser'];

/** Fixed identities of the demo cast. Referenced by every demo command. */
const DEMO_ACCOUNTS = Object.freeze({
  CUSTOMER: Object.freeze({
    email: 'cliente.demo@jaresolve.com.br',
    name: 'Cliente Demonstração',
    phone: '+5511999990001',
    role: 'user',
  }),
  PARTNER: Object.freeze({
    email: 'parceiro.demo@jaresolve.com.br',
    name: 'Parceiro Demonstração',
    phone: '+5511999990002',
    role: 'partner',
    onboardingPartnerType: 'tow',
    onboardingStage: 'approved',
  }),
});

/** São Paulo downtown. The demo request starts at the partner's own position. */
const DEMO_PARTNER_PROFILE = Object.freeze({
  type: 'tow',
  business_name: 'Guincho Demonstração',
  address: 'Av. Paulista, 1000 - São Paulo/SP',
  latitude: -23.561684,
  longitude: -46.655981,
  is_verified: true,
  is_available: true,
  is_online: true,
  approval_status: 'approved',
});

/** Canonical demonstration destination (Praça da Sé), ~1.5 km from the partner. */
const DEMO_DESTINATION = Object.freeze({
  latitude: -23.5475,
  longitude: -46.6388,
  formatted_address: 'Praça da Sé, São Paulo/SP',
});

const DEMO_TOW_VEHICLE_PROFILE = Object.freeze({
  plate: 'DEM1A23',
  make: 'Volvo',
  model: 'FH 460',
  year: 2020,
  equipment_type: 'flatbed',
  supported_vehicle_classes: Object.freeze([
    'motorcycle',
    'light_vehicle',
    'medium_truck',
    'heavy_truck',
  ]),
  max_towed_weight_kg: 8000,
  active: true,
  minimum_charge_cents: 15000,
  included_km: 5,
  price_per_additional_km_cents: 500,
});

const DEMO_TOW_VEHICLE_DOCUMENT_PROFILE = Object.freeze({
  document_type: 'vehicle_license',
  filename: 'demo-seed-vehicle-license.pdf',
  original_name: 'crlv-demonstracao.pdf',
  file_path: 'demo-fixtures/demo-seed-vehicle-license.pdf',
  file_url: 'demo-fixtures/demo-seed-vehicle-license.pdf',
  mime_type: 'application/pdf',
  file_size: 0,
  status: 'approved',
});

/**
 * Customer vehicle used by the canonical demo request. The Client app owns its
 * local garage; the backend receives the vehicle inline on `POST /tow/requests`
 * exactly as the app sends it.
 */
const DEMO_REQUEST_VEHICLE = Object.freeze({
  class: 'light_vehicle',
  make: 'Fiat',
  model: 'Argo',
  year: 2019,
  weight_kg: 1160,
  plate: 'DEM1B23',
});

const DOCUMENT_VALIDITY_DAYS = 365;

/** All demo e-mails, lowercase, in deterministic order. */
const DEMO_EMAILS = Object.freeze([
  DEMO_ACCOUNTS.CUSTOMER.email.toLowerCase(),
  DEMO_ACCOUNTS.PARTNER.email.toLowerCase(),
]);

class DemoGuardError extends Error {
  constructor(violations) {
    super(
      'Refusing to use a database that is not the authorized Tow demo target:\n'
        + violations.map((violation) => `  - ${violation}`).join('\n')
    );
    this.name = 'DemoGuardError';
    this.code = 'UNSAFE_DEMO_TARGET';
    this.violations = violations;
  }
}

class DemoPasswordError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DemoPasswordError';
    this.code = 'DEMO_PASSWORD_MISSING';
  }
}

/** The target the demo command would read/write. Password intentionally included for the connection only. */
function resolveDemoTarget(env = process.env) {
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    demoEnv: env[DEMO_ENV_VAR],
    hasConnectionUrl: Boolean(
      (env.DATABASE_URL && String(env.DATABASE_URL).trim())
        || (env.PostgreSQL && String(env.PostgreSQL).trim())
    ),
  };
}

function isDemoDatabaseName(name) {
  const value = String(name || '').trim().toLowerCase();
  if (!value) return false;
  return value.endsWith(DEMO_DB_SUFFIX);
}

/**
 * @param {object} [env]
 * @param {{ purpose: 'seed'|'reset-session'|'status' }} options
 * @returns {{ safe: boolean, target: object, violations: string[] }}
 */
function checkDemoAuthorization(env = process.env, options = {}) {
  const purpose = options.purpose;
  const target = resolveDemoTarget(env);
  const violations = [];

  if (!['seed', 'reset-session', 'status'].includes(purpose)) {
    violations.push(`unknown demo purpose "${purpose}" (expected seed, reset-session or status)`);
  }

  // 1. Per-command explicit opt-in. `status` only reads, so it needs no flag.
  if (purpose === 'seed' && String(env[SEED_FLAG] || '') !== '1') {
    violations.push(`${SEED_FLAG} must be exactly "1" to authorize the demo seed`);
  }
  if (purpose === 'reset-session' && String(env[RESET_FLAG] || '') !== '1') {
    violations.push(`${RESET_FLAG} must be exactly "1" to authorize the demo session reset`);
  }

  // 2. Human statement that the target is the demo environment.
  if (String(target.demoEnv || '').trim() !== DEMO_ENV_VALUE) {
    violations.push(`${DEMO_ENV_VAR} must be exactly "${DEMO_ENV_VALUE}"`);
  }

  // 3. Explicit target (no implicit localhost/5432/postgres).
  for (const [label, value] of [
    ['DB_HOST', target.host],
    ['DB_PORT', target.port],
    ['DB_NAME', target.database],
    ['DB_USER', target.user],
    ['DB_PASSWORD', target.password],
  ]) {
    if (value === undefined || value === null || String(value).trim() === '') {
      violations.push(`${label} must be set explicitly`);
    }
  }

  // 4. Connection URLs may point anywhere — refuse them.
  if (target.hasConnectionUrl) {
    violations.push('DATABASE_URL/PostgreSQL must not be set: the demo tooling only accepts an explicit host/port/database/user');
  }

  // 5. Loopback only.
  const host = String(target.host || '').trim().toLowerCase();
  if (WILDCARD_HOSTS.includes(host)) {
    violations.push(`DB_HOST must not be a wildcard bind address, got "${target.host}"`);
  } else if (host && !LOOPBACK_HOSTS.includes(host)) {
    violations.push(`DB_HOST must be loopback, got "${target.host}"`);
  }

  // 6. Database name: mandatory `_demo` suffix, never a production hint.
  const database = String(target.database || '').trim();
  if (database) {
    const lowered = database.toLowerCase();
    const hint = FORBIDDEN_NAME_HINTS.find((item) => lowered.includes(item));
    if (hint) {
      violations.push(`database name "${database}" contains the forbidden hint "${hint}"`);
    } else if (!isDemoDatabaseName(database)) {
      violations.push(`database name "${database}" is not a demo database (it must end with "${DEMO_DB_SUFFIX}")`);
    }
  }

  // 7. Never as a privileged/administrative role.
  const user = String(target.user || '').toLowerCase();
  if (user) {
    const hint = FORBIDDEN_USER_HINTS.find((item) => user.includes(item));
    if (hint) violations.push(`DB_USER "${target.user}" looks like a privileged user ("${hint}")`);
  }

  return { safe: violations.length === 0, target, violations };
}

function assertDemoAuthorized(env = process.env, options = {}) {
  const result = checkDemoAuthorization(env, options);
  if (!result.safe) throw new DemoGuardError(result.violations);
  return result.target;
}

/** Password-free description, safe for logs and CI output. */
function describeDemoTarget(target) {
  return `postgresql://${target.user}@${target.host}:${target.port}/${target.database}`;
}

/** Required demo password; never defaulted, never logged. */
function resolveDemoPassword(env = process.env) {
  const value = env[PASSWORD_VAR] === undefined || env[PASSWORD_VAR] === null
    ? ''
    : String(env[PASSWORD_VAR]);
  if (value.trim() === '') {
    throw new DemoPasswordError(
      `${PASSWORD_VAR} is not set: the demo seed never uses a default credential. `
        + 'Set it in the environment (VPS: /var/www/socorre-ai/shared/demo-tow.env, mode 0600) and retry.'
    );
  }
  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new DemoPasswordError(
      `${PASSWORD_VAR} must have at least ${MIN_PASSWORD_LENGTH} characters`
    );
  }
  return value;
}

/** Knex connection for an ALREADY-AUTHORIZED demo target. */
function createDemoConnection(target) {
  if (!target || typeof target !== 'object') {
    throw new TypeError('createDemoConnection requires a resolved demo target');
  }
  return knexFactory({
    client: 'postgresql',
    connection: {
      host: target.host,
      port: Number(target.port),
      database: target.database,
      user: target.user,
      password: target.password,
    },
    pool: { min: 0, max: 5 },
    acquireConnectionTimeout: 10_000,
  });
}

module.exports = {
  BACKEND_DIR,
  ENV_FILE,
  DEMO_ENV_VAR,
  DEMO_ENV_VALUE,
  SEED_FLAG,
  RESET_FLAG,
  PASSWORD_VAR,
  MIN_PASSWORD_LENGTH,
  DEMO_DB_SUFFIX,
  LOOPBACK_HOSTS,
  WILDCARD_HOSTS,
  FORBIDDEN_NAME_HINTS,
  FORBIDDEN_USER_HINTS,
  DEMO_ACCOUNTS,
  DEMO_EMAILS,
  DEMO_PARTNER_PROFILE,
  DEMO_DESTINATION,
  DEMO_TOW_VEHICLE_PROFILE,
  DEMO_TOW_VEHICLE_DOCUMENT_PROFILE,
  DEMO_REQUEST_VEHICLE,
  DOCUMENT_VALIDITY_DAYS,
  DemoGuardError,
  DemoPasswordError,
  resolveDemoTarget,
  isDemoDatabaseName,
  checkDemoAuthorization,
  assertDemoAuthorized,
  describeDemoTarget,
  resolveDemoPassword,
  createDemoConnection,
};
