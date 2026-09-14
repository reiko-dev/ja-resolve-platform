/**
 * Opt-in PostgreSQL E2E: run with TOW_POSTGRES_E2E=1 and a disposable test DB.
 * It boots the real Express app, auth middleware, routes, controllers and
 * PostgreSQL persistence for the assigned tow lifecycle.
 */
const enabled = process.env.TOW_POSTGRES_E2E === '1';

const describePostgres = enabled ? describe : describe.skip;
const request = require('supertest');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('../../src/config/database');
const { createApp } = require('../../src/app');
const EmergencyRequest = require('../../src/models/EmergencyRequest');
const { getJwtSecret } = require('../../src/config/jwt');

describePostgres('PostgreSQL E2E: fluxo HTTP de guincho', () => {
  let app;
  let partnerToken;
  let emergencyId;

  beforeAll(async () => {
    await db.migrate.latest({ directory: path.resolve(__dirname, '../../database/migrations') });
    app = createApp();
    await db.raw('TRUNCATE tow_proposals, emergency_requests, partners, users RESTART IDENTITY CASCADE');

    const now = new Date();
    const [user] = await db('users').insert({
      name: 'Cliente E2E', email: 'cliente-e2e@example.com', password: 'hash',
      phone: '+5511999999999', role: 'user', is_active: true,
    }).returning('*');
    const [partnerUser] = await db('users').insert({
      name: 'Guincho E2E', email: 'guincho-e2e@example.com', password: 'hash',
      phone: '+5511999999998', role: 'partner', is_active: true,
    }).returning('*');
    const [partner] = await db('partners').insert({
      user_id: partnerUser.id, type: 'tow', business_name: 'Guincho E2E',
      address: 'Acre', phone: '+5511999999998',
    }).returning('*');
    const [emergency] = await db('emergency_requests').insert({
      user_id: user.id, type: 'other', request_type: 'tow',
      description: 'Veículo precisa de guincho', location_type: 'roadside',
      latitude: -9.97, longitude: -67.81, address: 'Acre', status: 'accepted',
      proposal_status: 'proposal_selected', partner_id: partner.id,
      proposal_selection_deadline: new Date(Date.now() + 3600000),
      max_proposals: 5, proposals_received: 1, estimated_price: 120,
      price_breakdown: JSON.stringify({ total_estimated_price: 90 }),
      accepted_at: now, created_at: now, updated_at: now,
    }).returning('*');
    emergencyId = emergency.id;
    const [proposal] = await db('tow_proposals').insert({
      emergency_request_id: emergency.id, partner_id: partner.id,
      proposed_price: 120, estimated_time_minutes: 30,
      expires_at: new Date(Date.now() + 3600000), status: 'accepted',
      accepted_at: now, created_at: now, updated_at: now,
    }).returning('*');
    await db('emergency_requests').where('id', emergency.id).update({ selected_proposal_id: proposal.id });
    partnerToken = jwt.sign({ userId: partnerUser.id, role: 'partner' }, getJwtSecret(), { expiresIn: '1h' });
  });

  afterAll(async () => {
    await db.destroy();
  });

  test('parceiro inicia e conclui, persistindo estados no PostgreSQL', async () => {
    const started = await request(app)
      .post(`/api/emergency-requests/${emergencyId}/start`)
      .set('Authorization', `Bearer ${partnerToken}`);
    expect(started.status).toBe(200);
    expect((await db('emergency_requests').where('id', emergencyId).first()).status).toBe('in_progress');

    const completed = await request(app)
      .post(`/api/emergency-requests/${emergencyId}/complete`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ final_price: 120, solution_description: 'Atendimento concluído', parts_used: [] });
    expect(completed.status).toBe(200);
    const persisted = await db('emergency_requests').where('id', emergencyId).first();
    expect(persisted.status).toBe('completed');
    expect(Number(persisted.final_price)).toBe(120);
  });

  test('aceite concorrente no PostgreSQL escolhe exatamente uma proposta', async () => {
    const now = new Date();
    const [user] = await db('users').insert({
      name: 'Cliente Concorrência', email: 'cliente-concorrencia@example.com', password: 'hash',
      phone: '+5511999999996', role: 'user', is_active: true,
    }).returning('*');
    const [partnerUser] = await db('users').insert({
      name: 'Guincho Concorrência', email: 'guincho-concorrencia@example.com', password: 'hash',
      phone: '+5511999999995', role: 'partner', is_active: true,
    }).returning('*');
    const [partner] = await db('partners').insert({
      user_id: partnerUser.id, type: 'tow', business_name: 'Guincho Concorrência',
      address: 'Acre', phone: '+5511999999995',
    }).returning('*');
    const [emergency] = await db('emergency_requests').insert({
      user_id: user.id, type: 'other', request_type: 'tow', description: 'Pedido concorrente de guincho',
      location_type: 'roadside', latitude: -9.97, longitude: -67.81, address: 'Acre',
      status: 'pending', proposal_status: 'awaiting_proposals',
      proposal_selection_deadline: new Date(Date.now() + 3600000), max_proposals: 5,
      proposals_received: 2, price_breakdown: JSON.stringify({ total_estimated_price: 90 }),
      created_at: now, updated_at: now,
    }).returning('*');
    const [first] = await db('tow_proposals').insert({
      emergency_request_id: emergency.id, partner_id: 1, proposed_price: 120,
      estimated_time_minutes: 30, expires_at: new Date(Date.now() + 3600000),
      created_at: now, updated_at: now,
    }).returning('*');
    const [second] = await db('tow_proposals').insert({
      emergency_request_id: emergency.id, partner_id: partner.id, proposed_price: 130,
      estimated_time_minutes: 35, expires_at: new Date(Date.now() + 3600000),
      created_at: now, updated_at: now,
    }).returning('*');

    const results = await Promise.all([
      EmergencyRequest.acceptProposal(emergency.id, first.id),
      EmergencyRequest.acceptProposal(emergency.id, second.id),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await db('emergency_requests').where('id', emergency.id).first()).status).toBe('accepted');
  });
});
