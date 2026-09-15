/**
 * G3 opt-in PostgreSQL E2E: nearby tow, coordenadas, duplicidade de proposta
 * (índice parcial da migration 044) e withdraw contra PostgreSQL real.
 *
 * Rodar com TOW_POSTGRES_E2E=1 e DB_* apontando para um banco de teste
 * descartável:
 *   TOW_POSTGRES_E2E=1 npx jest tests/tow/g3TowPostgres.e2e.test.js --runInBand
 */
const enabled = process.env.TOW_POSTGRES_E2E === '1';

const describePostgres = enabled ? describe : describe.skip;
const request = require('supertest');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('../../src/config/database');
const { createApp } = require('../../src/app');
const { getJwtSecret } = require('../../src/config/jwt');

const EMERGENCIES = '/api/emergency-requests';
const PROPOSALS = '/api/tow-proposals';

describePostgres('PostgreSQL E2E G3: nearby, propostas e coordenadas', () => {
  let app;
  let client;
  let partnerA;
  let partnerB;
  let partnerNoCoords;
  let clientToken;
  let partnerAToken;
  let partnerBToken;
  let partnerNoCoordsToken;

  const baseEmergency = (overrides = {}) => ({
    type: 'other',
    request_type: 'tow',
    description: 'Veículo quebrado na rodovia',
    vehicle_info: { brand: 'Fiat', model: 'Uno', year: 2020 },
    location_type: 'roadside',
    latitude: -23.5505,
    longitude: -46.6333,
    address: 'Av. Paulista, 1000',
    ...overrides,
  });

  const post = (pathName, token, body) => {
    const req = request(app).post(pathName);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
  };

  const get = (pathName, token) => {
    const req = request(app).get(pathName);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  async function seedUser({ name, email, phone, role }) {
    const [user] = await db('users').insert({
      name, email, password: 'hash', phone, role, is_active: true,
    }).returning('*');
    return user;
  }

  // TRUNCATE ... users CASCADE também limpa system_settings (FK updated_by),
  // então as configurações de guincho são re-semeadas para o arquivo ser
  // independente da ordem de execução dos e2e.
  async function seedTowSettings() {
    const now = new Date();
    await db('system_settings').insert([
      { setting_key: 'tow_price_per_km', setting_value: '6', data_type: 'number', description: 'Preço por km', category: 'guincho', updated_at: now },
      { setting_key: 'tow_platform_fixed_fee', setting_value: '25', data_type: 'number', description: 'Taxa fixa', category: 'guincho', updated_at: now },
      { setting_key: 'tow_minimum_charge', setting_value: '90', data_type: 'number', description: 'Cobrança mínima', category: 'guincho', updated_at: now },
      { setting_key: 'tow_cancellation_fee', setting_value: '40', data_type: 'number', description: 'Taxa de cancelamento', category: 'guincho', updated_at: now },
    ]).onConflict('setting_key').merge(['setting_value', 'data_type', 'description', 'category', 'updated_at']);
  }

  async function seedPartner(type = 'tow', coords = { latitude: -23.5505, longitude: -46.6333 }) {
    const user = await seedUser({
      name: `Parceiro ${Date.now()}-${Math.random()}`,
      email: `parceiro-${Date.now()}-${Math.random()}@example.com`,
      phone: '+5511988888888',
      role: 'partner',
    });
    const [partner] = await db('partners').insert({
      user_id: user.id,
      type,
      business_name: 'Guincho E2E G3',
      address: 'São Paulo',
      phone: '+5511988888888',
      ...coords,
    }).returning('*');
    return { user, partner, token: jwt.sign({ userId: user.id, role: 'partner' }, getJwtSecret(), { expiresIn: '1h' }) };
  }

  beforeAll(async () => {
    await db.migrate.latest({ directory: path.resolve(__dirname, '../../database/migrations') });
    app = createApp();
    await db.raw('TRUNCATE tow_proposals, emergency_requests, partners, users RESTART IDENTITY CASCADE');
    await seedTowSettings();

    client = await seedUser({
      name: 'Cliente G3', email: 'cliente-g3-pg@example.com', phone: '+5511977777777', role: 'user',
    });
    clientToken = jwt.sign({ userId: client.id, role: 'user' }, getJwtSecret(), { expiresIn: '1h' });

    const a = await seedPartner();
    partnerA = a.partner;
    partnerAToken = a.token;

    const b = await seedPartner('tow', { latitude: -23.56, longitude: -46.64 });
    partnerB = b.partner;
    partnerBToken = b.token;

    const c = await seedPartner('tow', { latitude: null, longitude: null });
    partnerNoCoords = c.partner;
    partnerNoCoordsToken = c.token;
  });

  afterAll(async () => {
    await db.destroy();
  });

  test('nearby tow usa PostgreSQL real: deadline futuro, raio, exclude_proposed e cadastro do parceiro', async () => {
    const created = await post(EMERGENCIES, clientToken, baseEmergency());
    expect(created.status).toBe(201);
    const emergencyId = created.body.data.id;

    const persisted = await db('emergency_requests').where('id', emergencyId).first();
    expect(persisted.status).toBe('pending');
    expect(persisted.proposal_status).toBe('awaiting_proposals');
    expect(persisted.proposal_selection_deadline).toBeInstanceOf(Date);
    expect(persisted.proposal_selection_deadline.getTime()).toBeGreaterThan(Date.now());

    const nearby = await get(`${EMERGENCIES}/nearby?type=tow`, partnerAToken);
    expect(nearby.status).toBe(200);
    const ids = nearby.body.data.map((row) => row.id);
    expect(ids).toContain(emergencyId);
    expect(nearby.body.search.coordinate_source).toBe('partner_registration');

    const proposal = await post(PROPOSALS, partnerAToken, {
      emergency_request_id: emergencyId, proposed_price: 500, estimated_time_minutes: 30,
    });
    expect(proposal.status).toBe(201);

    const excluded = await get(`${EMERGENCIES}/nearby?type=tow&exclude_proposed=true`, partnerAToken);
    expect(excluded.body.data.map((row) => row.id)).not.toContain(emergencyId);

    const otherPartner = await get(`${EMERGENCIES}/nearby?type=tow`, partnerBToken);
    expect(otherPartner.body.data.map((row) => row.id)).toContain(emergencyId);

    const withdrawn = await post(`${PROPOSALS}/${proposal.body.data.id}/withdraw`, partnerAToken, {});
    expect(withdrawn.status).toBe(200);
    expect((await db('tow_proposals').where('id', proposal.body.data.id).first()).status).toBe('withdrawn');

    const repeat = await post(`${PROPOSALS}/${proposal.body.data.id}/withdraw`, partnerAToken, {});
    expect(repeat.status).toBe(400);
    expect(repeat.body.code).toBe('proposal_not_pending');

    // Índice parcial 044: após withdrawn, o mesmo parceiro pode propor de novo.
    const again = await post(PROPOSALS, partnerAToken, {
      emergency_request_id: emergencyId, proposed_price: 500, estimated_time_minutes: 25,
    });
    expect(again.status).toBe(201);
  });

  test('duplicata concorrente no PostgreSQL: índice parcial deixa exatamente uma proposta e um 409', async () => {
    const created = await post(EMERGENCIES, clientToken, baseEmergency({
      description: 'Segundo pedido para concorrência de propostas',
    }));
    expect(created.status).toBe(201);
    const emergencyId = created.body.data.id;

    const payload = {
      emergency_request_id: emergencyId, proposed_price: 500, estimated_time_minutes: 30,
    };
    const responses = await Promise.all([
      post(PROPOSALS, partnerBToken, payload),
      post(PROPOSALS, partnerBToken, payload),
    ]);
    const statuses = responses.map((response) => response.status).sort((x, y) => x - y);
    expect(statuses).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409).body.code).toBe('proposal_duplicate');

    const rows = await db('tow_proposals').where({ emergency_request_id: emergencyId, partner_id: partnerB.id });
    expect(rows).toHaveLength(1);
    const emergency = await db('emergency_requests').where('id', emergencyId).first();
    expect(Number(emergency.proposals_received)).toBe(1);
  });

  test('guardas de coordenadas no PostgreSQL: 0,0, raio, admin e parceiro sem cadastro', async () => {
    const before = await db('emergency_requests').count('* as total').first();
    const zeroZero = await post(EMERGENCIES, clientToken, baseEmergency({ latitude: 0, longitude: 0 }));
    expect(zeroZero.status).toBe(400);
    expect(zeroZero.body.code).toBe('invalid_coordinates');
    expect(await db('emergency_requests').count('* as total').first()).toEqual(before);

    const radius = await get(`${EMERGENCIES}/nearby?type=tow&latitude=-23.55&longitude=-46.63&radius=0`, partnerAToken);
    expect(radius.status).toBe(400);
    expect(radius.body.code).toBe('invalid_radius');

    const explicitZero = await get(`${EMERGENCIES}/nearby?type=tow&latitude=0&longitude=0`, partnerAToken);
    expect(explicitZero.status).toBe(400);
    expect(explicitZero.body.code).toBe('invalid_coordinates');

    const onboarding = await get(`${EMERGENCIES}/nearby?type=tow`, partnerNoCoordsToken);
    expect(onboarding.status).toBe(400);
    expect(onboarding.body.code).toBe('partner_onboarding_required');
    expect(partnerNoCoords.latitude).toBeNull();

    const admin = await seedUser({
      name: 'Admin G3', email: 'admin-g3-pg@example.com', phone: '+5511966666666', role: 'admin',
    });
    const adminToken = jwt.sign({ userId: admin.id, role: 'admin' }, getJwtSecret(), { expiresIn: '1h' });
    const adminNoCoords = await get(`${EMERGENCIES}/nearby?type=tow`, adminToken);
    expect(adminNoCoords.status).toBe(400);
    expect(adminNoCoords.body.code).toBe('coordinates_required');
  });
});
