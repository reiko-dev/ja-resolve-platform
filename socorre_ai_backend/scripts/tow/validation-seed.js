#!/usr/bin/env node
/**
 * Tow local validation profile — deterministic validation seed.
 *
 * Creates the FIXED, self-describing cast a human tester needs against the
 * disposable validation database (`.env.validation`, port 55433):
 *
 *   - CUSTOMER  `cliente.validacao@socorre.com.br`  (role `user`)
 *   - PARTNER   `parceiro.validacao@socorre.com.br` (role `partner`, tow,
 *               approved, online, available) + one active TowVehicle +
 *               one approved `vehicle_license` document
 *   - ADMIN     `admin.validacao@socorre.com.br`    (role `admin`)
 *   - the canonical `service_modules` row for `tow`, enabled
 *
 * The seed is:
 *   - IDEMPOTENT: it deletes the known validation accounts first (dependents
 *     cascade from `users`/`partners`), then inserts them again, so running it
 *     twice always yields the same state;
 *   - DETERMINISTIC: every timestamp comes from one injected `now`; the same
 *     instant produces the same rows;
 *   - OPERATIONAL: the partner satisfies the real matching predicate
 *     (`domain/matching.js` + `domain/eligibility.js` + `domain/documents.js`),
 *     so `POST /tow/requests` + `GET /tow/partner/opportunities` work on it;
 *   - SECRET-SAFE: the bcrypt hash is NEVER returned in logs or descriptions.
 *     The plaintext validation password is intentionally printed by the CLI so
 *     a tester can log in; it is a throwaway local credential only.
 *
 * Credentials (password resolution order):
 *   options.password -> TOW_VALIDATION_PASSWORD -> DEFAULT_VALIDATION_PASSWORD
 *
 * Usage:
 *   node scripts/tow/validation-seed.js
 */
'use strict';

const bcrypt = require('bcryptjs');

// The validation profile is the only env file a standalone run may read. Set
// before any harness module is required (db-connection/pg-guard load it).
process.env.TOW_TEST_ENV_FILE = process.env.TOW_TEST_ENV_FILE || '.env.validation';
process.env.TOW_TEST_PG_PROJECT = process.env.TOW_TEST_PG_PROJECT || 'socorre-tow-validation';

const BCRYPT_ROUNDS = 12;
const DEFAULT_VALIDATION_PASSWORD = 'Validacao123!';
const PASSWORD_ENV_VAR = 'TOW_VALIDATION_PASSWORD';
const DOCUMENT_VALIDITY_DAYS = 365;

/** Fixed identities of the validation cast. Imported by the smoke, never duplicated. */
const VALIDATION_ACCOUNTS = Object.freeze({
  CUSTOMER: Object.freeze({
    email: 'cliente.validacao@socorre.com.br',
    name: 'Cliente Validação',
    phone: '+5511999990001',
    role: 'user',
  }),
  PARTNER: Object.freeze({
    email: 'parceiro.validacao@socorre.com.br',
    name: 'Parceiro Validação',
    phone: '+5511999990002',
    role: 'partner',
    onboardingPartnerType: 'tow',
    onboardingStage: 'approved',
  }),
  ADMIN: Object.freeze({
    email: 'admin.validacao@socorre.com.br',
    name: 'Admin Validação',
    phone: null,
    role: 'admin',
  }),
});

const PARTNER_PROFILE = Object.freeze({
  type: 'tow',
  business_name: 'Guincho Validação',
  address: 'Av. Paulista, 1000 - São Paulo/SP',
  latitude: -23.561684,
  longitude: -46.655981,
  is_verified: true,
  is_available: true,
  is_online: true,
  approval_status: 'approved',
});

const TOW_VEHICLE_PROFILE = Object.freeze({
  plate: 'VAL1A23',
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

const TOW_VEHICLE_DOCUMENT_PROFILE = Object.freeze({
  document_type: 'vehicle_license',
  filename: 'validation-seed-vehicle-license.pdf',
  original_name: 'crlv-validacao.pdf',
  file_path: 'validation-fixtures/validation-seed-vehicle-license.pdf',
  file_url: 'validation-fixtures/validation-seed-vehicle-license.pdf',
  mime_type: 'application/pdf',
  file_size: 0,
  status: 'approved',
});

/** All validation e-mails, in deterministic deletion order. */
const VALIDATION_EMAILS = Object.freeze([
  VALIDATION_ACCOUNTS.CUSTOMER.email,
  VALIDATION_ACCOUNTS.PARTNER.email,
  VALIDATION_ACCOUNTS.ADMIN.email,
]);

/** Resolve the local validation password (never a production credential). */
function resolveValidationPassword(env = process.env) {
  const override = env[PASSWORD_ENV_VAR];
  if (override !== undefined && override !== null && String(override) !== '') {
    return String(override);
  }
  return DEFAULT_VALIDATION_PASSWORD;
}

/** Extract the id from whatever `returning('id')` yields. */
function insertedId(row) {
  if (row === undefined || row === null) return null;
  if (typeof row === 'object') return row.id === undefined ? null : row.id;
  return row;
}

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

/** Delete the known validation accounts; dependents cascade (partners -> vehicles -> documents). */
async function deleteValidationAccounts(db) {
  let deleted = 0;
  for (const email of VALIDATION_EMAILS) {
    // eslint-disable-next-line no-await-in-loop
    const count = await db('users').whereRaw('LOWER(email) = ?', [email.toLowerCase()]).del();
    deleted += Number(count) || 0;
  }
  return deleted;
}

async function insertValidationUser(db, account, passwordHash, now) {
  const [row] = await db('users')
    .insert({
      name: account.name,
      email: account.email,
      password: passwordHash,
      phone: account.phone,
      role: account.role,
      is_active: true,
      email_verified: true,
      onboarding_partner_type: account.onboardingPartnerType || null,
      onboarding_stage: account.onboardingStage || null,
      created_at: now,
      updated_at: now,
    })
    .returning('id');
  return insertedId(row);
}

/** Ensure the canonical Tow module registry row exists and is enabled. */
async function ensureTowModuleEnabled(db, now) {
  // The canonical keys live in the migration that owns the row.
  // eslint-disable-next-line global-require
  const { MODULE_ROW } = require('../../database/migrations/003_mvp01_tow_foundation');
  const existing = await db('service_modules').where({ module_key: MODULE_ROW.module_key }).first();
  if (existing) {
    await db('service_modules').where({ id: existing.id }).update({
      service_key: MODULE_ROW.service_key,
      partner_type: MODULE_ROW.partner_type,
      enabled: true,
      disabled_reason: null,
      updated_at: now,
    });
    return { created: false, enabled: true };
  }
  await db('service_modules').insert({
    ...MODULE_ROW,
    enabled: true,
    created_at: now,
    updated_at: now,
  });
  return { created: true, enabled: true };
}

/**
 * Seed the validation cast. Deletes the known validation accounts first, so the
 * result is identical no matter how many times it runs.
 *
 * @param {import('knex').Knex} db guard-checked validation connection
 * @param {{ password?: string, env?: object, now?: Date }} [options]
 * @returns {Promise<{ password: string, emails: object, ids: object, serviceModule: object }>}
 */
async function seedValidation(db, options = {}) {
  if (!db || typeof db !== 'function' || typeof db.transaction !== 'function') {
    throw new TypeError('seedValidation requires a Knex connection (guard-checked validation target)');
  }
  const now = options.now ? toDate(options.now) : new Date();
  const password = options.password !== undefined && String(options.password) !== ''
    ? String(options.password)
    : resolveValidationPassword(options.env || process.env);
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const expiresAt = new Date(now.getTime() + DOCUMENT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

  return db.transaction(async (trx) => {
    const deleted = await deleteValidationAccounts(trx);

    const customerId = await insertValidationUser(
      trx,
      VALIDATION_ACCOUNTS.CUSTOMER,
      passwordHash,
      now
    );
    const partnerUserId = await insertValidationUser(
      trx,
      VALIDATION_ACCOUNTS.PARTNER,
      passwordHash,
      now
    );
    const adminId = await insertValidationUser(
      trx,
      VALIDATION_ACCOUNTS.ADMIN,
      passwordHash,
      now
    );

    const [partnerRow] = await trx('partners')
      .insert({
        user_id: partnerUserId,
        type: PARTNER_PROFILE.type,
        business_name: PARTNER_PROFILE.business_name,
        address: PARTNER_PROFILE.address,
        phone: VALIDATION_ACCOUNTS.PARTNER.phone,
        latitude: PARTNER_PROFILE.latitude,
        longitude: PARTNER_PROFILE.longitude,
        is_verified: PARTNER_PROFILE.is_verified,
        is_available: PARTNER_PROFILE.is_available,
        is_online: PARTNER_PROFILE.is_online,
        approval_status: PARTNER_PROFILE.approval_status,
        approved_at: now,
        approved_by: adminId,
        created_at: now,
        updated_at: now,
      })
      .returning('id');
    const partnerId = insertedId(partnerRow);

    const [vehicleRow] = await trx('tow_vehicles')
      .insert({
        partner_id: partnerId,
        plate: TOW_VEHICLE_PROFILE.plate,
        make: TOW_VEHICLE_PROFILE.make,
        model: TOW_VEHICLE_PROFILE.model,
        year: TOW_VEHICLE_PROFILE.year,
        equipment_type: TOW_VEHICLE_PROFILE.equipment_type,
        // JSON TEXT on purpose: node-postgres would serialize a JS array as a
        // PostgreSQL array literal, which is not valid jsonb.
        supported_vehicle_classes: JSON.stringify([...TOW_VEHICLE_PROFILE.supported_vehicle_classes]),
        max_towed_weight_kg: TOW_VEHICLE_PROFILE.max_towed_weight_kg,
        active: TOW_VEHICLE_PROFILE.active,
        minimum_charge_cents: TOW_VEHICLE_PROFILE.minimum_charge_cents,
        included_km: TOW_VEHICLE_PROFILE.included_km,
        price_per_additional_km_cents: TOW_VEHICLE_PROFILE.price_per_additional_km_cents,
        created_at: now,
        updated_at: now,
      })
      .returning('id');
    const towVehicleId = insertedId(vehicleRow);

    const [documentRow] = await trx('tow_vehicle_documents')
      .insert({
        tow_vehicle_id: towVehicleId,
        partner_id: partnerId,
        document_type: TOW_VEHICLE_DOCUMENT_PROFILE.document_type,
        filename: TOW_VEHICLE_DOCUMENT_PROFILE.filename,
        original_name: TOW_VEHICLE_DOCUMENT_PROFILE.original_name,
        file_path: TOW_VEHICLE_DOCUMENT_PROFILE.file_path,
        file_url: TOW_VEHICLE_DOCUMENT_PROFILE.file_url,
        mime_type: TOW_VEHICLE_DOCUMENT_PROFILE.mime_type,
        file_size: TOW_VEHICLE_DOCUMENT_PROFILE.file_size,
        status: TOW_VEHICLE_DOCUMENT_PROFILE.status,
        expires_at: expiresAt,
        verified_by: adminId,
        verified_at: now,
        uploaded_at: now,
        created_at: now,
        updated_at: now,
      })
      .returning('id');
    const towVehicleDocumentId = insertedId(documentRow);

    const serviceModule = await ensureTowModuleEnabled(trx, now);

    return {
      // Local-only credential: the CLI prints it, callers must never persist it.
      password,
      replacedAccounts: deleted,
      emails: {
        customer: VALIDATION_ACCOUNTS.CUSTOMER.email,
        partner: VALIDATION_ACCOUNTS.PARTNER.email,
        admin: VALIDATION_ACCOUNTS.ADMIN.email,
      },
      ids: {
        customer: customerId,
        partnerUser: partnerUserId,
        admin: adminId,
        partner: partnerId,
        towVehicle: towVehicleId,
        towVehicleDocument: towVehicleDocumentId,
      },
      serviceModule,
    };
  });
}

/** Password-free summary for logs and evidence. */
function describeSeedResult(result) {
  return [
    `validation accounts seeded (replaced ${result.replacedAccounts} account(s)):`,
    `customer=${result.emails.customer} (id=${result.ids.customer})`,
    `partner=${result.emails.partner} (user id=${result.ids.partnerUser}, partner id=${result.ids.partner})`,
    `admin=${result.emails.admin} (id=${result.ids.admin})`,
    `tow vehicle ${TOW_VEHICLE_PROFILE.plate} (id=${result.ids.towVehicle}) active, `
    + `document ${TOW_VEHICLE_DOCUMENT_PROFILE.document_type} approved (id=${result.ids.towVehicleDocument})`,
    `service_modules tow enabled (${result.serviceModule.created ? 'created' : 'already present'})`,
  ].join('\n  ');
}

/** Print the cast, the local password and the summary (never the bcrypt hash). */
function printSeedResult(result) {
  console.log(`[validation:seed] ${describeSeedResult(result)}`);
  console.log(`[validation:seed] password (local only): ${result.password}`);
}

async function main() {
  // Lazy requires: the harness modules have module-level env loading, so the
  // profile defaults above must be in place first. Nothing is read or connected
  // until this point.
  // eslint-disable-next-line global-require
  const { createConnection, resolvePurpose, loadPurposeEnv } = require('./db-connection');
  // Standalone-reachable CLI: enforce the `*_validation_test` namespace too.
  // Lazy require: validation-env requires this module, so this avoids a cycle
  // at module initialization (by the time main() runs, this module is loaded).
  // eslint-disable-next-line global-require
  const { assertValidationDatabaseName } = require('./validation-env');
  const purpose = resolvePurpose(process.argv.slice(2));
  loadPurposeEnv(purpose);
  assertValidationDatabaseName();
  const db = createConnection({ purpose });
  try {
    const result = await seedValidation(db);
    printSeedResult(result);
  } finally {
    await db.destroy();
  }
}

// Exports are assigned BEFORE the CLI entrypoint runs: `main()` lazily requires
// `./validation-env`, which requires this module back, so the exports must be
// complete by the time that cycle happens (otherwise the require sees a partial
// module).
module.exports = {
  BCRYPT_ROUNDS,
  DEFAULT_VALIDATION_PASSWORD,
  PASSWORD_ENV_VAR,
  DOCUMENT_VALIDITY_DAYS,
  VALIDATION_ACCOUNTS,
  VALIDATION_EMAILS,
  PARTNER_PROFILE,
  TOW_VEHICLE_PROFILE,
  TOW_VEHICLE_DOCUMENT_PROFILE,
  resolveValidationPassword,
  deleteValidationAccounts,
  ensureTowModuleEnabled,
  seedValidation,
  describeSeedResult,
  printSeedResult,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`[validation:seed] ${error && error.message ? error.message : error}`);
    process.exitCode = 1;
  });
}
