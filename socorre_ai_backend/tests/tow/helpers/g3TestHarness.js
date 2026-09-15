/**
 * G3 — harness HTTP compartilhado para as regressões de nearby/coordenadas e
 * de propostas de guincho.
 *
 * Mesmo padrão dos gates G1/G2: SQLite em memória substituindo
 * `src/config/database`, schema criado à mão, app real (`createApp()`) dirigido
 * por supertest. Este arquivo NÃO é um teste (não casa com o testMatch do
 * Jest); é apenas infraestrutura reutilizada por:
 *   - tests/tow/g3NearbyCoordinates.test.js
 *   - tests/tow/g3TowProposals.test.js
 */
const knex = require('knex');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getJwtSecret } = require('../../../src/config/jwt');

function createDatabase() {
  return knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
  });
}

async function initSchema(db) {
  await db.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable();
    table.string('email', 100).unique().notNullable();
    table.string('password', 255).notNullable();
    table.string('phone', 20);
    table.string('role', 20).defaultTo('user');
    table.integer('is_active').defaultTo(1);
    table.timestamp('created_at');
    table.timestamp('updated_at');
  });

  await db.schema.createTable('partners', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned();
    table.string('type', 50);
    table.string('business_name', 100);
    table.string('phone', 20);
    table.string('email', 100);
    table.string('document', 30);
    table.string('approval_status', 30).defaultTo('approved');
    table.integer('is_verified').defaultTo(1);
    table.integer('is_online').defaultTo(1);
    table.integer('is_available').defaultTo(1);
    table.integer('accepts_emergency_calls').defaultTo(1);
    table.decimal('rating', 3, 2).defaultTo(0);
    table.integer('total_reviews').defaultTo(0);
    table.decimal('latitude', 10, 8);
    table.decimal('longitude', 11, 8);
    table.string('tow_truck_type', 50);
    table.integer('tow_capacity_kg');
    table.integer('has_winch');
    table.timestamp('created_at');
    table.timestamp('updated_at');
  });

  await db.schema.createTable('revoked_tokens', (table) => {
    table.string('token_hash', 64).primary();
    table.integer('user_id').unsigned().notNullable();
    table.timestamp('expires_at').notNullable();
  });

  await db.schema.createTable('system_settings', (table) => {
    table.increments('id').primary();
    table.string('setting_key', 100).unique().notNullable();
    table.text('setting_value');
    table.timestamp('created_at');
    table.timestamp('updated_at');
  });

  await db.schema.createTable('emergency_requests', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned();
    table.integer('partner_id').unsigned();
    table.string('type', 30).defaultTo('other');
    table.string('request_type', 30).defaultTo('mechanic');
    table.string('status', 30).defaultTo('pending');
    table.string('proposal_status', 40);
    table.integer('selected_proposal_id').unsigned();
    table.text('description');
    table.string('location_type', 30);
    table.decimal('latitude', 10, 8);
    table.decimal('longitude', 11, 8);
    table.text('address');
    table.string('urgency', 20).defaultTo('medium');
    table.decimal('estimated_price', 10, 2);
    table.decimal('final_price', 10, 2);
    table.text('price_breakdown');
    table.text('vehicle_info');
    table.text('photos');
    table.integer('is_urgent').defaultTo(0);
    table.decimal('vehicle_origin_latitude', 10, 8);
    table.decimal('vehicle_origin_longitude', 11, 8);
    table.text('vehicle_origin_address');
    table.decimal('vehicle_destination_latitude', 10, 8);
    table.decimal('vehicle_destination_longitude', 11, 8);
    table.text('vehicle_destination_address');
    table.string('vehicle_type', 100);
    table.text('vehicle_notes');
    table.string('landmarks', 255);
    table.text('solution_description');
    table.text('parts_used');
    table.text('notes');
    table.text('cancellation_reason');
    table.text('cancellation_by');
    table.integer('max_proposals').defaultTo(0);
    table.integer('proposals_received').defaultTo(0);
    table.decimal('search_radius_km', 10, 2);
    table.timestamp('proposal_selection_deadline');
    table.timestamp('last_proposal_at');
    table.datetime('accepted_at');
    table.datetime('started_at');
    table.datetime('completed_at');
    table.datetime('cancelled_at');
    table.timestamp('created_at');
    table.timestamp('updated_at');
  });

  await db.schema.createTable('tow_proposals', (table) => {
    table.increments('id').primary();
    table.integer('emergency_request_id').unsigned();
    table.integer('partner_id').unsigned();
    table.decimal('proposed_price', 10, 2);
    table.integer('estimated_time_minutes');
    table.text('message');
    table.string('tow_truck_type', 50);
    table.integer('tow_capacity_kg');
    table.integer('has_winch');
    table.decimal('partner_distance_km', 10, 2);
    table.string('status', 30).defaultTo('pending');
    table.timestamp('expires_at');
    table.integer('view_count').defaultTo(0);
    table.timestamp('last_viewed_at');
    table.datetime('accepted_at');
    table.datetime('responded_at');
    table.timestamp('created_at');
    table.timestamp('updated_at');
  });

  // Migration 044 (índice parcial) reproduzida no SQLite do harness.
  await db.raw(
    "CREATE UNIQUE INDEX tow_proposals_one_pending_per_partner ON tow_proposals (emergency_request_id, partner_id) WHERE status = 'pending'"
  );
}

async function resetDatabase(db) {
  await db('tow_proposals').del();
  await db('emergency_requests').del();
  await db('revoked_tokens').del();
  await db('system_settings').del();
  await db('partners').del();
  await db('users').del();
}

async function seedUser(db, { name = 'Usuário G3', email, role = 'user', isActive = 1 } = {}) {
  const [user] = await db('users')
    .insert({
      name,
      email: email || `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}@g3.test`,
      password: await bcrypt.hash('secret', 4),
      phone: '+5511999999999',
      role,
      is_active: isActive,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning('*');
  return user;
}

async function seedPartner(db, userId, overrides = {}) {
  const [partner] = await db('partners')
    .insert({
      user_id: userId,
      type: 'tow',
      business_name: overrides.business_name || 'Guincho G3',
      phone: '+5511999999999',
      email: overrides.email || null,
      approval_status: 'approved',
      is_verified: 1,
      is_online: 1,
      is_available: 1,
      accepts_emergency_calls: 1,
      rating: 4.5,
      total_reviews: 10,
      latitude: -23.5505,
      longitude: -46.6333,
      tow_truck_type: 'flatbed',
      tow_capacity_kg: 3000,
      has_winch: 1,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    })
    .returning('*');
  return partner;
}

async function seedSetting(db, settingKey, settingValue) {
  const [setting] = await db('system_settings')
    .insert({
      setting_key: settingKey,
      setting_value: String(settingValue),
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning('*');
  return setting;
}

async function seedEmergency(db, overrides = {}) {
  const now = Date.now();
  const [emergency] = await db('emergency_requests')
    .insert({
      user_id: overrides.user_id,
      partner_id: overrides.partner_id ?? null,
      type: overrides.type ?? 'other',
      request_type: overrides.request_type ?? 'tow',
      status: overrides.status ?? 'pending',
      proposal_status: overrides.proposal_status ?? 'awaiting_proposals',
      selected_proposal_id: null,
      description: overrides.description ?? 'Veículo precisa de guincho',
      location_type: 'roadside',
      latitude: overrides.latitude ?? -23.5505,
      longitude: overrides.longitude ?? -46.6333,
      address: overrides.address ?? 'Av. Paulista, São Paulo',
      urgency: 'medium',
      estimated_price: overrides.estimated_price ?? 150,
      price_breakdown: overrides.price_breakdown ?? JSON.stringify({ total_estimated_price: 150, minimum_charge: 100 }),
      max_proposals: overrides.max_proposals ?? 5,
      proposals_received: overrides.proposals_received ?? 0,
      search_radius_km: overrides.search_radius_km ?? 15,
      // Epoch ms: é o formato que o SQLite do harness entende tanto no filtro
      // SQL quanto na leitura JS (PostgreSQL usa timestamp real).
      proposal_selection_deadline:
        overrides.proposal_selection_deadline ?? now + 15 * 60 * 1000,
      created_at: new Date(now),
      updated_at: new Date(now),
    })
    .returning('*');
  return emergency;
}

async function seedProposal(db, overrides = {}) {
  const [proposal] = await db('tow_proposals')
    .insert({
      emergency_request_id: overrides.emergency_request_id,
      partner_id: overrides.partner_id,
      proposed_price: overrides.proposed_price ?? 120,
      estimated_time_minutes: overrides.estimated_time_minutes ?? 30,
      message: overrides.message ?? 'Posso atender',
      tow_truck_type: 'flatbed',
      tow_capacity_kg: 3000,
      has_winch: 1,
      partner_distance_km: overrides.partner_distance_km ?? 2.5,
      status: overrides.status ?? 'pending',
      expires_at: overrides.expires_at ?? new Date(Date.now() + 10 * 60 * 1000),
      responded_at: overrides.responded_at ?? null,
      accepted_at: overrides.accepted_at ?? null,
      created_at: overrides.created_at ?? new Date(),
      updated_at: new Date(),
    })
    .returning('*');
  return proposal;
}

/**
 * O segredo é resolvido em tempo de requisição: `tests/setup.js` define
 * JWT_SECRET no beforeAll global, depois do carregamento deste módulo.
 */
function tokenFor(user) {
  return jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), { expiresIn: '1h' });
}

function authorize(user) {
  return { Authorization: `Bearer ${tokenFor(user)}` };
}

module.exports = {
  createDatabase,
  initSchema,
  resetDatabase,
  seedUser,
  seedPartner,
  seedSetting,
  seedEmergency,
  seedProposal,
  tokenFor,
  authorize,
};
