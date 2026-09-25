#!/usr/bin/env node
/**
 * TOW CLIENT DEMO — deterministic demo seed.
 *
 * Creates (or restores) the FIXED, self-describing cast the Client/Partner
 * Android demo needs against the demo database:
 *
 *   - CUSTOMER  `cliente.demo@jaresolve.com.br`  (role `user`)
 *   - PARTNER   `parceiro.demo@jaresolve.com.br` (role `partner`, type `tow`,
 *               approved, online, available, inside the matching radius) with
 *               one active TowVehicle and its approved `vehicle_license`
 *   - the canonical `service_modules` row for `tow`, enabled/ACTIVE
 *
 * Properties:
 *   - IDEMPOTENT: any previous demo-scoped Tow data (requests/proposals/
 *     assignments/payments/tracking of the two demo accounts) is removed first,
 *     then the cast is upserted. Running it twice yields the same state.
 *   - DETERMINISTIC: one injected `now` feeds every timestamp.
 *   - OPERATIONAL: the partner satisfies the real matching predicate
 *     (`domain/matching.js`): type `tow`, active vehicle, approved document,
 *     `is_online`, `is_available`, non-null coordinates inside the radius.
 *     Without that state `GET /tow/partner/opportunities` returns `[]`.
 *   - SCOPED: it NEVER deletes or updates an account other than the two demo
 *     e-mails. There is no `db:reset`, no `DROP`, no table truncation.
 *   - SECRET-SAFE: the password comes from `TOW_DEMO_PASSWORD` and is never
 *     printed, logged or returned.
 *
 * Guard (fail-closed, see `demo-config.js`): requires `TOW_DEMO_ENV=demo`,
 * `TOW_DEMO_SEED=1`, an explicit loopback target whose database name ends with
 * `_demo`, and refuses privileged users and connection URLs.
 *
 * Usage (VPS):
 *   set -a; source /var/www/socorre-ai/shared/backend.env; set +a
 *   set -a; source /var/www/socorre-ai/shared/demo-tow.env; set +a
 *   TOW_DEMO_ENV=demo TOW_DEMO_SEED=1 node scripts/tow/demo-seed.js
 */
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const {
  BACKEND_DIR,
  DEMO_ACCOUNTS,
  DEMO_EMAILS,
  DEMO_PARTNER_PROFILE,
  DEMO_TOW_VEHICLE_PROFILE,
  DEMO_TOW_VEHICLE_DOCUMENT_PROFILE,
  DOCUMENT_VALIDITY_DAYS,
  assertDemoAuthorized,
  describeDemoTarget,
  resolveDemoPassword,
  createDemoConnection,
} = require('./demo-config');

const BCRYPT_ROUNDS = 12;

class DemoSeedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DemoSeedError';
    this.code = 'DEMO_SEED_FAILED';
  }
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

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))];
}

/** Migration names on disk (`database/migrations`). */
function migrationFiles() {
  const dir = path.resolve(BACKEND_DIR, 'database', 'migrations');
  return fs.readdirSync(dir).filter((name) => name.endsWith('.js')).sort();
}

/**
 * Fail closed when the demo database was not built by the canonical baseline:
 * a missing `knex_migrations` table or a pending migration must stop the seed
 * before any row is written.
 */
async function assertDemoSchemaReady(db) {
  let applied;
  try {
    applied = await db('knex_migrations').pluck('name');
  } catch (error) {
    throw new DemoSeedError(
      'database has no "knex_migrations" table: it was not built by the canonical migrations. '
        + 'Apply `database/migrations` (knex migrate:latest) before seeding.'
    );
  }
  const appliedSet = new Set(applied.map((name) => String(name)));
  const pending = migrationFiles().filter((name) => !appliedSet.has(name));
  if (pending.length > 0) {
    throw new DemoSeedError(
      `database has ${pending.length} pending migration(s): ${pending.join(', ')}. `
        + 'Apply the canonical migrations before seeding.'
    );
  }
  return { applied: appliedSet.size, files: migrationFiles().length };
}

/** Resolve the demo accounts' rows (never another user's). */
async function findDemoIdentities(db) {
  const rows = DEMO_EMAILS.length
    ? await db('users').select('id', 'email', 'role').whereRaw(
      `LOWER(email) IN (${DEMO_EMAILS.map(() => '?').join(', ')})`,
      DEMO_EMAILS
    )
    : [];
  const userIds = rows.map((row) => row.id);
  const partners = userIds.length
    ? await db('partners').select('id', 'user_id').whereIn('user_id', userIds)
    : [];
  return {
    users: rows,
    userIds,
    partnerIds: partners.map((partner) => partner.id),
  };
}

/**
 * Delete ONLY the demo-scoped Tow data. Deletion order respects the RESTRICT
 * constraints between `tow_assignments`/`tow_payments` and their parents, so an
 * assigned demo request can always be removed without touching the schema.
 */
async function deleteDemoTowData(db, identities) {
  const { userIds, partnerIds } = identities;
  const counts = {
    payments: 0, tracking: 0, assignments: 0, proposals: 0, requests: 0,
  };

  let requestIds = userIds.length
    ? await db('tow_requests').whereIn('customer_id', userIds).pluck('id')
    : [];
  if (partnerIds.length > 0) {
    const assigned = await db('tow_assignments').whereIn('partner_id', partnerIds).pluck('tow_request_id');
    const proposed = await db('tow_request_proposals')
      .whereIn('partner_id', partnerIds)
      .pluck('tow_request_id');
    requestIds = unique([...requestIds, ...assigned, ...proposed]);
  }

  if (requestIds.length > 0) {
    counts.payments = Number(await db('tow_payments').whereIn('tow_request_id', requestIds).del()) || 0;
    counts.tracking = Number(await db('tow_request_tracking').whereIn('tow_request_id', requestIds).del()) || 0;
    counts.assignments = Number(await db('tow_assignments').whereIn('tow_request_id', requestIds).del()) || 0;
    counts.proposals = Number(await db('tow_request_proposals').whereIn('tow_request_id', requestIds).del()) || 0;
    counts.requests = Number(await db('tow_requests').whereIn('id', requestIds).del()) || 0;
  }

  if (partnerIds.length > 0) {
    counts.proposals += Number(
      await db('tow_request_proposals').whereIn('partner_id', partnerIds).del()
    ) || 0;
  }

  return counts;
}

/** Restore the demo partner to the operational state matching requires. */
async function restoreDemoPartnerOperational(db, partnerIds, now) {
  if (!partnerIds || partnerIds.length === 0) return 0;
  return Number(await db('partners').whereIn('id', partnerIds).update({
    type: DEMO_PARTNER_PROFILE.type,
    business_name: DEMO_PARTNER_PROFILE.business_name,
    address: DEMO_PARTNER_PROFILE.address,
    latitude: DEMO_PARTNER_PROFILE.latitude,
    longitude: DEMO_PARTNER_PROFILE.longitude,
    is_verified: DEMO_PARTNER_PROFILE.is_verified,
    is_available: DEMO_PARTNER_PROFILE.is_available,
    is_online: DEMO_PARTNER_PROFILE.is_online,
    approval_status: DEMO_PARTNER_PROFILE.approval_status,
    approved_at: now,
    updated_at: now,
  })) || 0;
}

/** Ensure the canonical Tow module registry row exists and is enabled/ACTIVE. */
async function ensureTowModuleEnabled(db, now) {
  // The canonical keys live in the migration that owns the row.
  // eslint-disable-next-line global-require
  const { MODULE_ROW } = require('../../database/migrations/003_mvp01_tow_foundation');
  const existing = await db('service_modules').where({ module_key: MODULE_ROW.module_key }).first();
  if (existing) {
    await db('service_modules').where({ id: existing.id }).update({
      service_key: MODULE_ROW.service_key,
      partner_type: MODULE_ROW.partner_type,
      name: 'Guincho',
      status: 'ACTIVE',
      enabled: true,
      disabled_reason: null,
      updated_at: now,
    });
    return { created: false, enabled: true };
  }
  await db('service_modules').insert({
    ...MODULE_ROW,
    name: 'Guincho',
    status: 'ACTIVE',
    sort_order: 0,
    enabled: true,
    created_at: now,
    updated_at: now,
  });
  return { created: true, enabled: true };
}

async function upsertDemoUser(db, account, passwordHash, now) {
  const existing = await db('users')
    .whereRaw('LOWER(email) = ?', [account.email.toLowerCase()])
    .first();
  const values = {
    name: account.name,
    email: account.email,
    password: passwordHash,
    phone: account.phone,
    role: account.role,
    is_active: true,
    email_verified: true,
    onboarding_partner_type: account.onboardingPartnerType || null,
    onboarding_stage: account.onboardingStage || null,
    updated_at: now,
  };
  if (existing) {
    await db('users').where({ id: existing.id }).update(values);
    return { id: existing.id, created: false };
  }
  const [row] = await db('users').insert({ ...values, created_at: now }).returning('id');
  return { id: insertedId(row), created: true };
}

async function upsertDemoPartner(db, userId, now) {
  const existing = await db('partners').where({ user_id: userId }).first();
  const values = {
    type: DEMO_PARTNER_PROFILE.type,
    business_name: DEMO_PARTNER_PROFILE.business_name,
    address: DEMO_PARTNER_PROFILE.address,
    phone: DEMO_ACCOUNTS.PARTNER.phone,
    latitude: DEMO_PARTNER_PROFILE.latitude,
    longitude: DEMO_PARTNER_PROFILE.longitude,
    is_verified: DEMO_PARTNER_PROFILE.is_verified,
    is_available: DEMO_PARTNER_PROFILE.is_available,
    is_online: DEMO_PARTNER_PROFILE.is_online,
    approval_status: DEMO_PARTNER_PROFILE.approval_status,
    approved_at: now,
    updated_at: now,
  };
  if (existing) {
    await db('partners').where({ id: existing.id }).update(values);
    return { id: existing.id, created: false };
  }
  const [row] = await db('partners')
    .insert({ ...values, user_id: userId, created_at: now })
    .returning('id');
  return { id: insertedId(row), created: true };
}

async function upsertDemoTowVehicle(db, partnerId, now) {
  const values = {
    partner_id: partnerId,
    plate: DEMO_TOW_VEHICLE_PROFILE.plate,
    make: DEMO_TOW_VEHICLE_PROFILE.make,
    model: DEMO_TOW_VEHICLE_PROFILE.model,
    year: DEMO_TOW_VEHICLE_PROFILE.year,
    equipment_type: DEMO_TOW_VEHICLE_PROFILE.equipment_type,
    // JSON TEXT on purpose: node-postgres would serialize a JS array as a
    // PostgreSQL array literal, which is not valid jsonb.
    supported_vehicle_classes: JSON.stringify([...DEMO_TOW_VEHICLE_PROFILE.supported_vehicle_classes]),
    max_towed_weight_kg: DEMO_TOW_VEHICLE_PROFILE.max_towed_weight_kg,
    active: DEMO_TOW_VEHICLE_PROFILE.active,
    minimum_charge_cents: DEMO_TOW_VEHICLE_PROFILE.minimum_charge_cents,
    included_km: DEMO_TOW_VEHICLE_PROFILE.included_km,
    price_per_additional_km_cents: DEMO_TOW_VEHICLE_PROFILE.price_per_additional_km_cents,
    updated_at: now,
  };
  let existing = await db('tow_vehicles').where({ partner_id: partnerId, active: true }).first();
  if (!existing) {
    existing = await db('tow_vehicles')
      .where({ partner_id: partnerId, plate: DEMO_TOW_VEHICLE_PROFILE.plate })
      .first();
  }
  if (existing) {
    await db('tow_vehicles').where({ id: existing.id }).update(values);
    return { id: existing.id, created: false, partnerId };
  }
  const [row] = await db('tow_vehicles')
    .insert({ ...values, created_at: now })
    .returning('id');
  return { id: insertedId(row), created: true, partnerId };
}

async function upsertDemoTowVehicleDocument(db, towVehicleId, partnerId, now) {
  return db.transaction(async (trx) => {
    const expiresAt = new Date(now.getTime() + DOCUMENT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
    const existing = await trx('tow_vehicle_documents')
      .where({
        tow_vehicle_id: towVehicleId,
        document_type: DEMO_TOW_VEHICLE_DOCUMENT_PROFILE.document_type,
      })
      .first();
    const values = {
      partner_id: partnerId,
      document_type: DEMO_TOW_VEHICLE_DOCUMENT_PROFILE.document_type,
      filename: DEMO_TOW_VEHICLE_DOCUMENT_PROFILE.filename,
      original_name: DEMO_TOW_VEHICLE_DOCUMENT_PROFILE.original_name,
      file_path: DEMO_TOW_VEHICLE_DOCUMENT_PROFILE.file_path,
      file_url: DEMO_TOW_VEHICLE_DOCUMENT_PROFILE.file_url,
      mime_type: DEMO_TOW_VEHICLE_DOCUMENT_PROFILE.mime_type,
      file_size: DEMO_TOW_VEHICLE_DOCUMENT_PROFILE.file_size,
      status: DEMO_TOW_VEHICLE_DOCUMENT_PROFILE.status,
      rejection_reason: null,
      expires_at: expiresAt,
      verified_at: now,
      updated_at: now,
    };
    if (existing) {
      await trx('tow_vehicle_documents').where({ id: existing.id }).update(values);
      return { id: existing.id, created: false };
    }
    const [row] = await trx('tow_vehicle_documents').insert({
      ...values,
      tow_vehicle_id: towVehicleId,
      uploaded_at: now,
      created_at: now,
    }).returning('id');
    return { id: insertedId(row), created: true };
  });
}

/**
 * Seed the demo cast. Idempotent: removes the demo-scoped Tow data first, then
 * upserts exactly the two demo accounts and their operational resources.
 */
async function seedDemo(db, options = {}) {
  if (!db || typeof db !== 'function' || typeof db.transaction !== 'function') {
    throw new TypeError('seedDemo requires a Knex connection (guard-checked demo target)');
  }
  const now = options.now ? toDate(options.now) : new Date();
  const password = options.password !== undefined && String(options.password) !== ''
    ? String(options.password)
    : resolveDemoPassword(options.env || process.env);
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const identities = await findDemoIdentities(db);

  return db.transaction(async (trx) => {
    const removed = await deleteDemoTowData(trx, identities);
    const customer = await upsertDemoUser(trx, DEMO_ACCOUNTS.CUSTOMER, passwordHash, now);
    const partnerUser = await upsertDemoUser(trx, DEMO_ACCOUNTS.PARTNER, passwordHash, now);
    const partner = await upsertDemoPartner(trx, partnerUser.id, now);
    const vehicle = await upsertDemoTowVehicle(trx, partner.id, now);
    const document = await upsertDemoTowVehicleDocument(trx, vehicle.id, partner.id, now);
    const serviceModule = await ensureTowModuleEnabled(trx, now);

    return {
      removed,
      ids: {
        customer: customer.id,
        partnerUser: partnerUser.id,
        partner: partner.id,
        towVehicle: vehicle.id,
        towVehicleDocument: document.id,
      },
      created: {
        customer: customer.created,
        partnerUser: partnerUser.created,
        partner: partner.created,
        towVehicle: vehicle.created,
        towVehicleDocument: document.created,
        serviceModule: serviceModule.created,
      },
      serviceModule,
    };
  });
}

async function main() {
  const target = assertDemoAuthorized(process.env, { purpose: 'seed' });
  const password = resolveDemoPassword(process.env);
  console.log(`[demo:seed] target: ${describeDemoTarget(target)}`);
  const db = createDemoConnection(target);
  try {
    const schema = await assertDemoSchemaReady(db);
    console.log(`[demo:seed] schema ready: ${schema.files} migration(s) on disk, ${schema.applied} applied`);
    const result = await seedDemo(db, { password, env: process.env });
    console.log('[demo:seed] demo-scoped Tow data removed before seeding:');
    for (const [table, count] of Object.entries(result.removed)) {
      console.log(`[demo:seed]   - ${table}: ${count}`);
    }
    console.log('[demo:seed] cast ready:');
    console.log(`[demo:seed]   customer: ${DEMO_ACCOUNTS.CUSTOMER.email} (id ${result.ids.customer})`);
    console.log(`[demo:seed]   partner:  ${DEMO_ACCOUNTS.PARTNER.email} (user ${result.ids.partnerUser}, partner ${result.ids.partner})`);
    console.log(`[demo:seed]   tow vehicle: ${DEMO_TOW_VEHICLE_PROFILE.plate} (id ${result.ids.towVehicle}), active`);
    console.log(`[demo:seed]   tow document: ${DEMO_TOW_VEHICLE_DOCUMENT_PROFILE.document_type} approved`);
    console.log(`[demo:seed]   module tow: enabled=${result.serviceModule.enabled}`);
    console.log('[demo:seed] password: provided by TOW_DEMO_PASSWORD (never printed)');
    console.log('DEMO_SEED=PASS');
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[demo:seed] ${error && error.message ? error.message : error}`);
    console.error('DEMO_SEED=FAIL');
    process.exitCode = 1;
  });
}

module.exports = {
  DemoSeedError,
  assertDemoSchemaReady,
  findDemoIdentities,
  deleteDemoTowData,
  restoreDemoPartnerOperational,
  ensureTowModuleEnabled,
  seedDemo,
};
