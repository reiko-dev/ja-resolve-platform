/**
 * T00 — Tow test factories (database-backed, current/legacy schema only).
 *
 * These factories persist rows in the EXISTING schema
 * (`users`, `partners`, `emergency_requests`, `tow_proposals`,
 * `system_settings`) through `tests/helpers/testDb.js`, so they work on the
 * SQLite harness and on the opt-in PostgreSQL harness alike.
 *
 * They deliberately do NOT create Tow v1 tables (`tow_vehicles`,
 * `vehicle_documents`, `tow_audit_events`, payout batches): those do not exist
 * yet and are T01+ deliverables. See docs/tow/T00-LEGACY-TO-TARGET-MAPPING.md.
 *
 * Every default is deterministic: no `Date.now()`, no `Math.random()`. Time
 * values come from the injected fake clock (or a fixed default instant) so the
 * same test run twice produces byte-identical rows.
 */
'use strict';

const testDb = require('../testDb');
const { createFakeClock } = require('./clock');

const DEFAULT_INSTANT = '2026-01-15T12:00:00.000Z';

function toSqliteTimestamp(instant) {
  return testDb.sqliteTimestamp(instant);
}

function toSqliteEpochMs(instant) {
  return testDb.sqliteEpochMs(instant);
}

/**
 * Deterministic, collision-free identifier sequence.
 *
 * Counters are process-local and monotonic per prefix, so fixtures created in
 * the same file never collide on a unique column (email, ...) while remaining
 * reproducible: the same test file, run twice in the same order, produces the
 * same identifiers. Pass `sequenceStart` to force a fixed starting point.
 */
const sequenceCounters = new Map();

function resetSequences(prefix) {
  if (prefix) sequenceCounters.delete(prefix);
  else sequenceCounters.clear();
}

function createSequence(prefix, start) {
  if (Number.isInteger(start)) sequenceCounters.set(prefix, start - 1);
  return () => {
    const next = (sequenceCounters.get(prefix) || 0) + 1;
    sequenceCounters.set(prefix, next);
    return `${prefix}-${String(next).padStart(4, '0')}`;
  };
}

// ---------------------------------------------------------------------------
// Users / partners
// ---------------------------------------------------------------------------

/** Tow customer (role `user`). */
async function createTowCustomer(overrides = {}) {
  const { sequenceStart, ...rest } = overrides;
  const next = createSequence('tow-customer', sequenceStart);
  const id = next();
  const user = await testDb.createUser({
    name: 'Cliente Tow',
    email: `${id}@example.test`,
    phone: '11990000001',
    role: 'user',
    ...rest,
  });
  return user;
}

/** Tow partner: `partners.type = 'tow'`, online+available, approved. */
async function createTowPartner(overrides = {}) {
  const { userOverrides = {}, sequenceStart, ...partnerOverrides } = overrides;
  const next = createSequence('tow-partner', sequenceStart);
  const id = next();
  const user = await testDb.createUser({
    name: 'Parceiro Tow',
    email: `${id}-user@example.test`,
    phone: '11990000002',
    role: 'partner',
    ...userOverrides,
  });
  const partner = await testDb.createPartner({
    user_id: user.id,
    type: 'tow',
    business_name: `Guincho ${id}`,
    latitude: -23.561684,
    longitude: -46.655981,
    is_verified: 1,
    is_available: 1,
    is_online: 1,
    approval_status: 'approved',
    ...partnerOverrides,
  });
  return { user, partner };
}

/** Platform admin (role `admin`). */
async function createTowAdmin(overrides = {}) {
  const { sequenceStart, ...rest } = overrides;
  const next = createSequence('tow-admin', sequenceStart);
  const id = next();
  return testDb.createUser({
    name: 'Admin Tow',
    email: `${id}@example.test`,
    phone: '11990000003',
    role: 'admin',
    ...rest,
  });
}

// ---------------------------------------------------------------------------
// Tow requests / proposals (current schema)
// ---------------------------------------------------------------------------

/**
 * Tow request row in `emergency_requests` (`type='tow'`, `request_type='tow'`).
 * Defaults are a plausible São Paulo → Santo André tow with a 30-minute
 * selection deadline anchored on the injected clock.
 */
async function createTowRequest(overrides = {}) {
  const {
    clock = createFakeClock(DEFAULT_INSTANT),
    customer,
    customerOverrides = {},
    sequenceStart,
    ...rest
  } = overrides;
  const next = createSequence('tow-request', sequenceStart);
  const id = next();
  // `customerOverrides` must reach the auto-created customer; when an explicit
  // `customer` is supplied it is used as-is (the overrides describe the
  // customer this factory would have created).
  const user = customer || (await createTowCustomer({ sequenceStart, ...customerOverrides }));
  const nowIso = clock.isoNow();
  const deadlineIso = new Date(clock.nowMs() + 30 * 60 * 1000).toISOString();

  const row = await testDb.createEmergencyRequest({
    user_id: user.id,
    type: 'tow',
    request_type: 'tow',
    description: `Guincho ${id}: carro não liga`,
    latitude: -23.561684,
    longitude: -46.655981,
    address: 'Av. Paulista, 1578 - São Paulo - SP',
    status: 'pending',
    urgency: 'medium',
    proposal_status: 'collecting',
    proposal_selection_deadline: deadlineIso,
    max_proposals: 5,
    proposals_received: 0,
    search_radius_km: 15,
    vehicle_origin_address: 'Av. Paulista, 1578 - São Paulo - SP',
    vehicle_origin_latitude: -23.561684,
    vehicle_origin_longitude: -46.655981,
    vehicle_destination_address: 'Rua das Figueiras, 100 - Santo André - SP',
    vehicle_destination_latitude: -23.6639,
    vehicle_destination_longitude: -46.531,
    vehicle_type: 'car',
    vehicle_notes: 'Veículo na garagem do prédio',
    created_at: toSqliteTimestamp(nowIso),
    updated_at: toSqliteTimestamp(nowIso),
    ...rest,
  });
  return { request: row, customer: user, clock };
}

/** Tow proposal row in `tow_proposals` for a given request/partner. */
async function createTowProposalFor(overrides = {}) {
  const {
    request,
    partner,
    clock = createFakeClock(DEFAULT_INSTANT),
    sequenceStart,
    ...rest
  } = overrides;
  const next = createSequence('tow-proposal', sequenceStart);
  const id = next();

  const towRequest = request || (await createTowRequest({ clock, sequenceStart })).request;
  const towPartner = partner || (await createTowPartner({ sequenceStart })).partner;
  const nowIso = clock.isoNow();
  const expiresAt = toSqliteTimestamp(new Date(clock.nowMs() + 15 * 60 * 1000).toISOString());

  const row = await testDb.createTowProposal({
    emergency_request_id: towRequest.id,
    partner_id: towPartner.id,
    proposed_price: 250,
    estimated_time_minutes: 40,
    message: `Proposta ${id}: chego em 40 minutos`,
    status: 'pending',
    expires_at: expiresAt,
    created_at: toSqliteTimestamp(nowIso),
    updated_at: toSqliteTimestamp(nowIso),
    ...rest,
  });
  return { proposal: row, request: towRequest, partner: towPartner, clock };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const TOW_SETTING_DEFAULTS = Object.freeze({
  tow_platform_fixed_fee_cents: 500,
  tow_cancellation_fee_cents: 1500,
  tow_max_platform_fee_debt_cents: 5000,
});

/** Persist Tow settings rows in `system_settings` (integer cents). */
async function createTowSettings(overrides = {}) {
  const values = { ...TOW_SETTING_DEFAULTS, ...overrides };
  const rows = {};
  for (const [key, value] of Object.entries(values)) {
    rows[key] = await testDb.setSetting(key, value, { data_type: 'number', category: 'tow' });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Scenario composer
// ---------------------------------------------------------------------------

/**
 * Compose a deterministic Tow scenario in one call:
 * customer + two tow partners + one open request + one pending proposal.
 *
 * The scenario is a fixture only: it creates no Tow v1 state machine, no
 * matching and no pricing.
 */
async function createTowScenario(options = {}) {
  const {
    clock = createFakeClock(options.start || DEFAULT_INSTANT),
    settings = true,
  } = options;
  const customer = await createTowCustomer({ sequenceStart: options.sequenceStart });
  const first = await createTowPartner({ sequenceStart: options.sequenceStart });
  const second = await createTowPartner({ sequenceStart: options.sequenceStart ? options.sequenceStart + 100 : undefined });
  const { request } = await createTowRequest({
    clock,
    customer,
    sequenceStart: options.sequenceStart,
  });
  const { proposal } = await createTowProposalFor({
    request,
    partner: first.partner,
    clock,
    sequenceStart: options.sequenceStart,
  });
  const settingsRows = settings ? await createTowSettings() : null;
  return {
    clock,
    customer,
    partners: [first, second],
    request,
    proposal,
    settings: settingsRows,
  };
}

module.exports = {
  DEFAULT_INSTANT,
  TOW_SETTING_DEFAULTS,
  createSequence,
  resetSequences,
  createTowCustomer,
  createTowPartner,
  createTowAdmin,
  createTowRequest,
  createTowProposalFor,
  createTowSettings,
  createTowScenario,
  toSqliteTimestamp,
  toSqliteEpochMs,
};
