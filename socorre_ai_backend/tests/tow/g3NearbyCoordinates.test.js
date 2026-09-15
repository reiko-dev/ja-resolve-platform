/**
 * G3 — GET /api/emergency-requests/nearby: coordenadas, raio e oportunidades.
 *
 * Aceite coberto (docs/gauntlet/TASKSPEC.yaml, G3):
 *   1. rota é Bearer partner/admin (401/403) e só devolve oportunidades tow
 *      reais: status pending + proposal_status awaiting_proposals + deadline
 *      futuro;
 *   2. coordenadas explícitas são um par válido (finito, dentro dos limites,
 *      nunca 0,0); parceiro sem par explícito usa partners.latitude/longitude;
 *      admin sem par explícito => 400 coordenadas obrigatórias; cadastro
 *      ausente/null/NaN/Infinity/0,0 => 400 partner_onboarding_required;
 *   3. raio finito > 0 (default vigente 15 km), invalid_radius caso contrário;
 *   4. ordenação por distância crescente;
 *   5. exclude_proposed=true remove apenas a proposta *pending* do próprio
 *      parceiro; withdrawn/rejected/expired não removem a oportunidade.
 */
process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../src/config/database', () => require('./helpers/g3TestHarness').createDatabase());
jest.mock('../../src/services/NotificationServiceNew', () => ({ sendNotification: jest.fn() }));
jest.mock('../../src/services/paymentService', () => ({
  createTowEmergencyPayment: jest.fn(),
  createTowCancellationFeePayment: jest.fn(),
  getEmergencyActiveServicePayment: jest.fn(),
  cancelPayment: jest.fn(),
  getEmergencyPaymentSummary: jest.fn(),
}));

const request = require('supertest');
const db = require('../../src/config/database');
const { createApp } = require('../../src/app');
const harness = require('./helpers/g3TestHarness');

const NEARBY = '/api/emergency-requests/nearby';
const SAO_PAULO = { latitude: -23.5505, longitude: -46.6333 };

let app;

beforeAll(async () => {
  await harness.initSchema(db);
  app = createApp();
});

beforeEach(async () => {
  await harness.resetDatabase(db);
});

afterAll(async () => {
  await db.destroy();
});

async function seedScenario() {
  const requester = await harness.seedUser(db, { role: 'user' });
  const admin = await harness.seedUser(db, { role: 'admin' });
  const partnerUserA = await harness.seedUser(db, { role: 'partner' });
  const partnerUserB = await harness.seedUser(db, { role: 'partner' });
  const partnerA = await harness.seedPartner(db, partnerUserA.id, { business_name: 'Guincho A' });
  const partnerB = await harness.seedPartner(db, partnerUserB.id, { business_name: 'Guincho B' });
  const mechanicUser = await harness.seedUser(db, { role: 'partner' });
  const mechanic = await harness.seedPartner(db, mechanicUser.id, { type: 'mechanic', business_name: 'Mecânica' });

  return { requester, admin, partnerUserA, partnerUserB, partnerA, partnerB, mechanicUser, mechanic };
}

function get(query, user) {
  return request(app).get(NEARBY).set(harness.authorize(user)).query(query);
}

describe('nearby — autenticação e papéis', () => {
  test('sem Bearer => 401', async () => {
    await seedScenario();
    const response = await request(app).get(NEARBY).query({ type: 'tow', ...SAO_PAULO });
    expect(response.status).toBe(401);
  });

  test('token inválido => 401', async () => {
    const response = await request(app)
      .get(NEARBY)
      .set({ Authorization: 'Bearer token-invalido' })
      .query({ type: 'tow', ...SAO_PAULO });
    expect(response.status).toBe(401);
  });

  test('usuário comum => 403 sem tocar no banco de oportunidades', async () => {
    const { requester, partnerA } = await seedScenario();
    await harness.seedEmergency(db, { user_id: requester.id });
    void partnerA;

    const response = await get({ type: 'tow', ...SAO_PAULO }, requester);
    expect(response.status).toBe(403);
    expect(response.body).not.toHaveProperty('data');
  });

  test('parceiro e admin são aceitos', async () => {
    const { partnerUserA, admin } = await seedScenario();
    expect((await get({ type: 'tow', ...SAO_PAULO }, partnerUserA)).status).toBe(200);
    expect((await get({ type: 'tow', ...SAO_PAULO }, admin)).status).toBe(200);
  });
});

describe('nearby — coordenadas explícitas', () => {
  test('par válido responde 200 com search normalizado', async () => {
    const { partnerUserA } = await seedScenario();
    const response = await get({ type: 'tow', ...SAO_PAULO }, partnerUserA);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.search).toEqual({
      latitude: SAO_PAULO.latitude,
      longitude: SAO_PAULO.longitude,
      radius: 15,
      coordinate_source: 'query',
    });
  });

  test('somente latitude => 400 invalid_coordinates', async () => {
    const { partnerUserA } = await seedScenario();
    const response = await get({ type: 'tow', latitude: -23.55 }, partnerUserA);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_coordinates');
  });

  test('somente longitude => 400 invalid_coordinates', async () => {
    const { partnerUserA } = await seedScenario();
    const response = await get({ type: 'tow', longitude: -46.63 }, partnerUserA);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_coordinates');
  });

  test('par não numérico => 400 invalid_coordinates', async () => {
    const { partnerUserA } = await seedScenario();
    const response = await get({ type: 'tow', latitude: 'abc', longitude: 'def' }, partnerUserA);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_coordinates');
  });

  test('coordenadas 0,0 explícitas => 400 invalid_coordinates', async () => {
    const { partnerUserA } = await seedScenario();
    const response = await get({ type: 'tow', latitude: 0, longitude: 0 }, partnerUserA);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_coordinates');
  });

  test('fora dos limites => 400 invalid_coordinates', async () => {
    const { partnerUserA } = await seedScenario();
    expect((await get({ type: 'tow', latitude: 91, longitude: 10 }, partnerUserA)).body.code).toBe('invalid_coordinates');
    expect((await get({ type: 'tow', latitude: 10, longitude: -181 }, partnerUserA)).body.code).toBe('invalid_coordinates');
  });

  test('coordenada infinita (string Infinity) => 400 invalid_coordinates', async () => {
    const { partnerUserA } = await seedScenario();
    const response = await get({ type: 'tow', latitude: 'Infinity', longitude: '10' }, partnerUserA);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_coordinates');
  });

  test('par vazio explícito (latitude=&longitude=) => 400 invalid_coordinates, sem fallback cadastral', async () => {
    const { partnerUserA } = await seedScenario();
    const response = await get({ type: 'tow', latitude: '', longitude: '' }, partnerUserA);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_coordinates');
    // O parceiro TEM cadastro válido; ainda assim o par explícito vazio não pode
    // cair silenciosamente para partners.latitude/longitude.
    expect(response.body).not.toHaveProperty('search.coordinate_source');
    expect(response.body).not.toHaveProperty('data');
  });

  test('latitude vazia + longitude ausente => 400 invalid_coordinates (par incompleto, não fallback)', async () => {
    const { partnerUserA } = await seedScenario();
    const response = await get({ type: 'tow', latitude: '' }, partnerUserA);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_coordinates');
  });

  test('latitude só com espaços => 400 invalid_coordinates', async () => {
    const { partnerUserA } = await seedScenario();
    const response = await get({ type: 'tow', latitude: '   ', longitude: '-46.63' }, partnerUserA);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_coordinates');
  });
});

describe('nearby — raio', () => {
  test('default é 15 km quando omitido', async () => {
    const { partnerUserA } = await seedScenario();
    const response = await get({ type: 'tow', ...SAO_PAULO }, partnerUserA);
    expect(response.body.search.radius).toBe(15);
  });

  test('raio explícito finito > 0 é aceito', async () => {
    const { partnerUserA } = await seedScenario();
    const response = await get({ type: 'tow', ...SAO_PAULO, radius: 3.5 }, partnerUserA);
    expect(response.status).toBe(200);
    expect(response.body.search.radius).toBe(3.5);
  });

  test.each(['0', '-5', 'abc', 'Infinity', '-Infinity', 'NaN'])('raio %s => 400 invalid_radius', async (radius) => {
    const { partnerUserA } = await seedScenario();
    const response = await get({ type: 'tow', ...SAO_PAULO, radius }, partnerUserA);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_radius');
  });
});

describe('nearby — cadastro do parceiro como fallback', () => {
  test('sem par explícito usa partners.latitude/longitude', async () => {
    const { partnerUserA } = await seedScenario();
    const response = await get({ type: 'tow' }, partnerUserA);

    expect(response.status).toBe(200);
    expect(response.body.search.coordinate_source).toBe('partner_registration');
    expect(response.body.search.latitude).toBeCloseTo(-23.5505, 6);
    expect(response.body.search.longitude).toBeCloseTo(-46.6333, 6);
  });

  test('cadastro com latitude nula => 400 partner_onboarding_required', async () => {
    const { partnerUserA, partnerA } = await seedScenario();
    await db('partners').where('id', partnerA.id).update({ latitude: null });

    const response = await get({ type: 'tow' }, partnerUserA);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('partner_onboarding_required');
  });

  test('cadastro 0,0 => 400 partner_onboarding_required (nunca fallback silencioso)', async () => {
    const { partnerUserA, partnerA } = await seedScenario();
    await db('partners').where('id', partnerA.id).update({ latitude: 0, longitude: 0 });

    const response = await get({ type: 'tow' }, partnerUserA);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('partner_onboarding_required');
  });

  test('cadastro não numérico => 400 partner_onboarding_required', async () => {
    const { partnerUserA, partnerA } = await seedScenario();
    await db('partners').where('id', partnerA.id).update({ latitude: 'NaN', longitude: '-46.63' });

    const response = await get({ type: 'tow' }, partnerUserA);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('partner_onboarding_required');
  });

  test('role partner sem registro de parceiro => 400 partner_onboarding_required', async () => {
    const orphan = await harness.seedUser(db, { role: 'partner' });
    const response = await get({ type: 'tow' }, orphan);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('partner_onboarding_required');
  });

  test('admin sem par explícito => 400 coordinates_required', async () => {
    const { admin } = await seedScenario();
    const response = await get({ type: 'tow' }, admin);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('coordinates_required');
  });

  test('admin com par explícito é aceito', async () => {
    const { admin } = await seedScenario();
    const response = await get({ type: 'tow', ...SAO_PAULO }, admin);
    expect(response.status).toBe(200);
    expect(response.body.search.coordinate_source).toBe('query');
  });
});

describe('nearby — oportunidades tow reais', () => {
  test('só lista pending + awaiting_proposals + deadline futuro do tipo tow', async () => {
    const { requester, partnerUserA } = await seedScenario();
    const valid = await harness.seedEmergency(db, { user_id: requester.id });
    await harness.seedEmergency(db, { user_id: requester.id, proposal_status: 'proposal_selected' });
    await harness.seedEmergency(db, { user_id: requester.id, status: 'accepted' });
    await harness.seedEmergency(db, {
      user_id: requester.id,
      proposal_selection_deadline: Date.now() - 60 * 1000,
    });
    await harness.seedEmergency(db, { user_id: requester.id, request_type: 'mechanic', proposal_status: null });

    const response = await get({ type: 'tow', ...SAO_PAULO }, partnerUserA);

    expect(response.status).toBe(200);
    expect(response.body.data.map((item) => item.id)).toEqual([valid.id]);
    expect(response.body.count).toBe(1);
  });

  test('respeita o raio e ordena por distância crescente', async () => {
    const { requester, partnerUserA } = await seedScenario();
    const perto = await harness.seedEmergency(db, {
      user_id: requester.id,
      latitude: -23.5515,
      longitude: -46.6343,
    });
    const longe = await harness.seedEmergency(db, {
      user_id: requester.id,
      latitude: -23.6,
      longitude: -46.7,
    });
    await harness.seedEmergency(db, {
      user_id: requester.id,
      latitude: -22.9068,
      longitude: -43.1729, // Rio de Janeiro, fora do raio de 10 km
    });

    const response = await get({ type: 'tow', ...SAO_PAULO, radius: 10 }, partnerUserA);

    expect(response.status).toBe(200);
    expect(response.body.data.map((item) => item.id)).toEqual([perto.id, longe.id]);
    const distances = response.body.data.map((item) => Number(item.distance));
    expect(distances[0]).toBeLessThanOrEqual(distances[1]);
  });

  test('type=mechanic preserva a listagem legada de mecânicos', async () => {
    const { requester, partnerUserA } = await seedScenario();
    const mechanical = await harness.seedEmergency(db, {
      user_id: requester.id,
      request_type: 'mechanic',
      proposal_status: null,
    });
    await harness.seedEmergency(db, { user_id: requester.id });

    const response = await get({ type: 'mechanic', ...SAO_PAULO }, partnerUserA);

    expect(response.status).toBe(200);
    expect(response.body.data.map((item) => item.id)).toEqual([mechanical.id]);
  });

  test('linhas legadas com coordenada nula, fora dos limites ou 0,0 não viram oportunidade tow', async () => {
    const { requester, partnerUserA } = await seedScenario();
    const valid = await harness.seedEmergency(db, { user_id: requester.id });
    const semCoordenada = await harness.seedEmergency(db, { user_id: requester.id });
    await db('emergency_requests').where('id', semCoordenada.id).update({ latitude: null, longitude: null });
    const foraDosLimites = await harness.seedEmergency(db, { user_id: requester.id, latitude: 91.5, longitude: 10 });
    const zeroZero = await harness.seedEmergency(db, { user_id: requester.id, latitude: 0, longitude: 0 });

    const response = await get({ type: 'tow', ...SAO_PAULO, radius: 30000 }, partnerUserA);

    expect(response.status).toBe(200);
    expect(response.body.data.map((item) => item.id)).toEqual([valid.id]);
    expect(response.body.data.map((item) => item.id)).not.toContain(semCoordenada.id);
    expect(response.body.data.map((item) => item.id)).not.toContain(foraDosLimites.id);
    expect(response.body.data.map((item) => item.id)).not.toContain(zeroZero.id);
  });
});

describe('nearby — exclude_proposed', () => {
  test('exclui apenas a proposta pending do próprio parceiro', async () => {
    const { requester, partnerUserA, partnerA, partnerB } = await seedScenario();
    const comProposta = await harness.seedEmergency(db, { user_id: requester.id });
    const semProposta = await harness.seedEmergency(db, { user_id: requester.id });
    await harness.seedProposal(db, { emergency_request_id: comProposta.id, partner_id: partnerA.id });
    await harness.seedProposal(db, { emergency_request_id: comProposta.id, partner_id: partnerB.id });

    const semExclusao = await get({ type: 'tow', ...SAO_PAULO }, partnerUserA);
    expect(semExclusao.body.data.map((item) => item.id).sort()).toEqual([comProposta.id, semProposta.id].sort());

    const comExclusao = await get({ type: 'tow', ...SAO_PAULO, exclude_proposed: true }, partnerUserA);
    expect(comExclusao.body.data.map((item) => item.id)).toEqual([semProposta.id]);
  });

  test('withdrawn/rejected/expired não excluem a oportunidade', async () => {
    const { requester, partnerUserA, partnerA } = await seedScenario();
    const retirada = await harness.seedEmergency(db, { user_id: requester.id });
    const rejeitada = await harness.seedEmergency(db, { user_id: requester.id });
    const expirada = await harness.seedEmergency(db, { user_id: requester.id });

    await harness.seedProposal(db, {
      emergency_request_id: retirada.id,
      partner_id: partnerA.id,
      status: 'withdrawn',
    });
    await harness.seedProposal(db, {
      emergency_request_id: rejeitada.id,
      partner_id: partnerA.id,
      status: 'rejected',
    });
    await harness.seedProposal(db, {
      emergency_request_id: expirada.id,
      partner_id: partnerA.id,
      status: 'expired',
    });

    const response = await get({ type: 'tow', ...SAO_PAULO, exclude_proposed: true }, partnerUserA);
    const ids = response.body.data.map((item) => item.id).sort();

    expect(ids).toEqual([retirada.id, rejeitada.id, expirada.id].sort());
  });

  test('exclude_proposed=false/ausente mantém a oportunidade', async () => {
    const { requester, partnerUserA, partnerA } = await seedScenario();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id });
    await harness.seedProposal(db, { emergency_request_id: emergency.id, partner_id: partnerA.id });

    expect((await get({ type: 'tow', ...SAO_PAULO }, partnerUserA)).body.data).toHaveLength(1);
    expect((await get({ type: 'tow', ...SAO_PAULO, exclude_proposed: 'false' }, partnerUserA)).body.data).toHaveLength(1);
    expect((await get({ type: 'tow', ...SAO_PAULO, exclude_proposed: true }, partnerUserA)).body.data).toHaveLength(0);
  });

  test('proposta pending de outro parceiro não exclui nada', async () => {
    const { requester, partnerUserA, partnerB } = await seedScenario();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id });
    await harness.seedProposal(db, { emergency_request_id: emergency.id, partner_id: partnerB.id });

    const response = await get({ type: 'tow', ...SAO_PAULO, exclude_proposed: true }, partnerUserA);
    expect(response.body.data.map((item) => item.id)).toEqual([emergency.id]);
  });

  test('admin não tem partner_id: exclude_proposed não remove oportunidades', async () => {
    const { requester, admin, partnerA } = await seedScenario();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id });
    await harness.seedProposal(db, { emergency_request_id: emergency.id, partner_id: partnerA.id });

    const response = await get({ type: 'tow', ...SAO_PAULO, exclude_proposed: true }, admin);
    expect(response.body.data.map((item) => item.id)).toEqual([emergency.id]);
  });
});
