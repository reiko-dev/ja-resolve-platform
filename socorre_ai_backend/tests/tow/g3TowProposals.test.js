/**
 * G3 — propostas de guincho: criação, duplicidade, withdraw e cancel.
 *
 * Aceite coberto (docs/gauntlet/TASKSPEC.yaml, G3):
 *   3. POST /api/emergency-requests rejeita 0,0/coordenadas inválidas antes do
 *      INSERT;
 *   4. POST /api/tow-proposals: só parceiro tow; parceiro e emergência com
 *      localização válida; 404 para emergência inexistente; 400 para
 *      fechada/expirada/não-tow; 409 para duplicata sequencial e concorrente,
 *      sem contador/notificação duplicados (migration 044 preservada);
 *   5. POST /api/tow-proposals/:id/withdraw: dono, 200 só em transição real
 *      pending→withdrawn, repetição 400, outro parceiro 403, inexistente 404,
 *      histórico preservado (edição formal = withdraw + novo POST);
 *   6. cancel continua apenas do usuário dono/admin; parceiro (mesmo
 *      atribuído) recebe 403 sem mutação.
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
const NotificationService = require('../../src/services/NotificationServiceNew');
const EmergencyRequest = require('../../src/models/EmergencyRequest');
const harness = require('./helpers/g3TestHarness');

const EMERGENCIES = '/api/emergency-requests';
const PROPOSALS = '/api/tow-proposals';

let app;

beforeAll(async () => {
  await harness.initSchema(db);
  app = createApp();
});

beforeEach(async () => {
  await harness.resetDatabase(db);
  NotificationService.sendNotification.mockClear();
});

afterAll(async () => {
  await db.destroy();
});

async function seedTowPricing() {
  await harness.seedSetting(db, 'tow_price_per_km', 5);
  await harness.seedSetting(db, 'tow_platform_fixed_fee', 10);
  await harness.seedSetting(db, 'tow_minimum_charge', 50);
  await harness.seedSetting(db, 'tow_cancellation_fee', 20);
}

async function seedActors() {
  const requester = await harness.seedUser(db, { role: 'user' });
  const otherUser = await harness.seedUser(db, { role: 'user' });
  const admin = await harness.seedUser(db, { role: 'admin' });
  const partnerUserA = await harness.seedUser(db, { role: 'partner' });
  const partnerUserB = await harness.seedUser(db, { role: 'partner' });
  const partnerA = await harness.seedPartner(db, partnerUserA.id, { business_name: 'Guincho A' });
  const partnerB = await harness.seedPartner(db, partnerUserB.id, { business_name: 'Guincho B' });
  const mechanicUser = await harness.seedUser(db, { role: 'partner' });
  const mechanic = await harness.seedPartner(db, mechanicUser.id, { type: 'mechanic', business_name: 'Mecânica' });

  return {
    requester,
    otherUser,
    admin,
    partnerUserA,
    partnerUserB,
    partnerA,
    partnerB,
    mechanicUser,
    mechanic,
  };
}

function proposalPayload(overrides = {}) {
  return {
    emergency_request_id: null,
    proposed_price: 120,
    estimated_time_minutes: 30,
    message: 'Chego em 20 minutos',
    ...overrides,
  };
}

function emergencyCreatePayload(overrides = {}) {
  return {
    type: 'other',
    request_type: 'tow',
    description: 'Veículo quebrado na rodovia',
    vehicle_info: { brand: 'Fiat', model: 'Uno', year: 2020 },
    location_type: 'roadside',
    latitude: -23.5505,
    longitude: -46.6333,
    address: 'Av. Paulista, 1000',
    ...overrides,
  };
}

function post(path, user, body) {
  const req = request(app).post(path);
  return user ? req.set(harness.authorize(user)).send(body) : req.send(body);
}

describe('POST /api/emergency-requests — coordenadas antes do INSERT', () => {
  test('0,0 => 400 invalid_coordinates e nenhum registro criado', async () => {
    const { requester } = await seedActors();
    await seedTowPricing();

    const response = await post(EMERGENCIES, requester, emergencyCreatePayload({ latitude: 0, longitude: 0 }));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_coordinates');
    expect(await db('emergency_requests').count('* as total').first()).toEqual({ total: 0 });
  });

  test('coordenada ausente => 400 do schema (Joi) e nenhum registro', async () => {
    const { requester } = await seedActors();
    const payload = emergencyCreatePayload();
    delete payload.longitude;

    const response = await post(EMERGENCIES, requester, payload);

    expect(response.status).toBe(400);
    expect(await db('emergency_requests').count('* as total').first()).toEqual({ total: 0 });
  });

  test('par origin/destination incompleto => 400 invalid_coordinates antes do INSERT', async () => {
    const { requester } = await seedActors();
    await seedTowPricing();

    const response = await post(
      EMERGENCIES,
      requester,
      emergencyCreatePayload({ vehicle_origin_latitude: -23.55 })
    );

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_coordinates');
    expect(await db('emergency_requests').count('* as total').first()).toEqual({ total: 0 });
  });

  test('par destination incompleto (só longitude) => 400 invalid_coordinates', async () => {
    const { requester } = await seedActors();

    const response = await post(
      EMERGENCIES,
      requester,
      emergencyCreatePayload({ vehicle_destination_longitude: -46.6 })
    );

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_coordinates');
    expect(await db('emergency_requests').count('* as total').first()).toEqual({ total: 0 });
  });

  test('0,0 em par opcional => 400 invalid_coordinates antes do INSERT', async () => {
    const { requester } = await seedActors();

    const response = await post(
      EMERGENCIES,
      requester,
      emergencyCreatePayload({ vehicle_destination_latitude: 0, vehicle_destination_longitude: 0 })
    );

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_coordinates');
    expect(await db('emergency_requests').count('* as total').first()).toEqual({ total: 0 });
  });

  test('coordenada ausente no schema => 400 invalid_coordinates (não invalid_payload)', async () => {
    const { requester } = await seedActors();
    const payload = emergencyCreatePayload();
    delete payload.latitude;

    const response = await post(EMERGENCIES, requester, payload);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_coordinates');
    expect(await db('emergency_requests').count('* as total').first()).toEqual({ total: 0 });
  });

  test('falha não-coordenada do schema continua 400 invalid_payload', async () => {
    const { requester } = await seedActors();

    const response = await post(
      EMERGENCIES,
      requester,
      emergencyCreatePayload({ description: 'curto' })
    );

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_payload');
    expect(await db('emergency_requests').count('* as total').first()).toEqual({ total: 0 });
  });

  test('tow válido cria pedido com awaiting_proposals', async () => {
    const { requester } = await seedActors();
    await seedTowPricing();
    await harness.seedPartner(db, requester.id, { type: 'tow' });

    const response = await post(EMERGENCIES, requester, emergencyCreatePayload());

    expect(response.status).toBe(201);
    expect(response.body.data.request_type).toBe('tow');
    expect(response.body.data.proposal_status).toBe('awaiting_proposals');

    const stored = await db('emergency_requests').where('id', response.body.data.id).first();
    expect(stored.status).toBe('pending');
  });
});

describe('POST /api/tow-proposals — autorização', () => {
  test('sem token => 401', async () => {
    const response = await request(app).post(PROPOSALS).send(proposalPayload());
    expect(response.status).toBe(401);
  });

  test('usuário comum => 403', async () => {
    const { requester } = await seedActors();
    const response = await post(PROPOSALS, requester, proposalPayload({ emergency_request_id: 1 }));
    expect(response.status).toBe(403);
  });

  test('parceiro mecânico => 403 partner_not_tow e nenhuma proposta', async () => {
    const { requester, mechanicUser } = await seedActors();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id });

    const response = await post(PROPOSALS, mechanicUser, proposalPayload({ emergency_request_id: emergency.id }));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('partner_not_tow');
    expect(await db('tow_proposals').count('* as total').first()).toEqual({ total: 0 });
  });

  test('role partner sem cadastro => 403 partner_not_tow', async () => {
    const orphan = await harness.seedUser(db, { role: 'partner' });
    const response = await post(PROPOSALS, orphan, proposalPayload({ emergency_request_id: 1 }));
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('partner_not_tow');
  });
});

describe('POST /api/tow-proposals — payload e localização', () => {
  test('payload sem preço/tempo => 400 invalid_payload', async () => {
    const { requester, partnerUserA } = await seedActors();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id });

    const semPreco = await post(
      PROPOSALS,
      partnerUserA,
      proposalPayload({ emergency_request_id: emergency.id, proposed_price: null })
    );
    const semTempo = await post(
      PROPOSALS,
      partnerUserA,
      proposalPayload({ emergency_request_id: emergency.id, estimated_time_minutes: 0 })
    );

    expect(semPreco.status).toBe(400);
    expect(semPreco.body.code).toBe('invalid_payload');
    expect(semTempo.status).toBe(400);
    expect(semTempo.body.code).toBe('invalid_payload');
  });

  test('parceiro sem coordenadas válidas => 400 partner_onboarding_required', async () => {
    const { requester, partnerUserA, partnerA } = await seedActors();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id });
    await db('partners').where('id', partnerA.id).update({ latitude: null, longitude: null });

    const response = await post(PROPOSALS, partnerUserA, proposalPayload({ emergency_request_id: emergency.id }));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('partner_onboarding_required');
    expect(await db('tow_proposals').count('* as total').first()).toEqual({ total: 0 });
  });

  test('parceiro com 0,0 => 400 partner_onboarding_required', async () => {
    const { requester, partnerUserA, partnerA } = await seedActors();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id });
    await db('partners').where('id', partnerA.id).update({ latitude: 0, longitude: 0 });

    const response = await post(PROPOSALS, partnerUserA, proposalPayload({ emergency_request_id: emergency.id }));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('partner_onboarding_required');
  });

  test('emergência inexistente => 404 emergency_not_found', async () => {
    const { partnerUserA } = await seedActors();
    const response = await post(PROPOSALS, partnerUserA, proposalPayload({ emergency_request_id: 999999 }));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('emergency_not_found');
  });

  test.each([
    ['não-tow', { request_type: 'mechanic', proposal_status: null }],
    ['já aceita/fechada', { status: 'accepted' }],
    ['proposta já selecionada', { proposal_status: 'proposal_selected' }],
    ['deadline expirado', { proposal_selection_deadline: Date.now() - 60000 }],
    ['limite de propostas atingido', { proposals_received: 5, max_proposals: 5 }],
  ])('emergência %s => 400 emergency_not_accepting_proposals', async (_label, overrides) => {
    const { requester, partnerUserA } = await seedActors();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id, ...overrides });

    const response = await post(PROPOSALS, partnerUserA, proposalPayload({ emergency_request_id: emergency.id }));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('emergency_not_accepting_proposals');
    expect(await db('tow_proposals').count('* as total').first()).toEqual({ total: 0 });
  });

  test('emergência sem coordenadas válidas => 400 emergency_invalid_coordinates', async () => {
    const { requester, partnerUserA } = await seedActors();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id, latitude: 0, longitude: 0 });

    const response = await post(PROPOSALS, partnerUserA, proposalPayload({ emergency_request_id: emergency.id }));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('emergency_invalid_coordinates');
  });

  test('preço abaixo do piso configurado => 400 proposal_price_below_minimum', async () => {
    const { requester, partnerUserA } = await seedActors();
    const emergency = await harness.seedEmergency(db, {
      user_id: requester.id,
      price_breakdown: JSON.stringify({ minimum_charge: 500 }),
    });

    const response = await post(
      PROPOSALS,
      partnerUserA,
      proposalPayload({ emergency_request_id: emergency.id, proposed_price: 120 })
    );

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('proposal_price_below_minimum');
    expect(await db('tow_proposals').count('* as total').first()).toEqual({ total: 0 });
  });
});

describe('POST /api/tow-proposals — sucesso e duplicidade', () => {
  test('201 cria proposta pendente, incrementa contador e notifica uma vez', async () => {
    const { requester, partnerUserA } = await seedActors();
    const emergency = await harness.seedEmergency(db, {
      user_id: requester.id,
      price_breakdown: JSON.stringify({ minimum_charge: 50 }),
    });

    const response = await post(PROPOSALS, partnerUserA, proposalPayload({ emergency_request_id: emergency.id }));

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('pending');
    expect(Number(response.body.data.proposed_price)).toBe(120);

    const stored = await db('tow_proposals').where('id', response.body.data.id).first();
    expect(stored.status).toBe('pending');

    const updatedEmergency = await db('emergency_requests').where('id', emergency.id).first();
    expect(updatedEmergency.proposals_received).toBe(1);
    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
  });

  test('duplicata sequencial => 409 sem contador/notificação duplicados', async () => {
    const { requester, partnerUserA } = await seedActors();
    const emergency = await harness.seedEmergency(db, {
      user_id: requester.id,
      price_breakdown: JSON.stringify({ minimum_charge: 50 }),
    });

    const first = await post(PROPOSALS, partnerUserA, proposalPayload({ emergency_request_id: emergency.id }));
    const second = await post(PROPOSALS, partnerUserA, proposalPayload({ emergency_request_id: emergency.id }));

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('proposal_duplicate');

    expect(await db('tow_proposals').count('* as total').first()).toEqual({ total: 1 });
    const updatedEmergency = await db('emergency_requests').where('id', emergency.id).first();
    expect(updatedEmergency.proposals_received).toBe(1);
    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
  });

  test('duplicata concorrente => exatamente um 201 e um 409', async () => {
    const { requester, partnerUserA } = await seedActors();
    const emergency = await harness.seedEmergency(db, {
      user_id: requester.id,
      price_breakdown: JSON.stringify({ minimum_charge: 50 }),
    });

    const [first, second] = await Promise.all([
      post(PROPOSALS, partnerUserA, proposalPayload({ emergency_request_id: emergency.id })),
      post(PROPOSALS, partnerUserA, proposalPayload({ emergency_request_id: emergency.id })),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    expect(await db('tow_proposals').count('* as total').first()).toEqual({ total: 1 });
    const updatedEmergency = await db('emergency_requests').where('id', emergency.id).first();
    expect(updatedEmergency.proposals_received).toBe(1);
    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
  });

  test('parceiros distintos concorrentes => duas propostas e contador 2', async () => {
    const { requester, partnerUserA, partnerUserB } = await seedActors();
    const emergency = await harness.seedEmergency(db, {
      user_id: requester.id,
      price_breakdown: JSON.stringify({ minimum_charge: 50 }),
    });

    const [first, second] = await Promise.all([
      post(PROPOSALS, partnerUserA, proposalPayload({ emergency_request_id: emergency.id })),
      post(PROPOSALS, partnerUserB, proposalPayload({ emergency_request_id: emergency.id })),
    ]);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(await db('tow_proposals').count('* as total').first()).toEqual({ total: 2 });
    const updatedEmergency = await db('emergency_requests').where('id', emergency.id).first();
    expect(updatedEmergency.proposals_received).toBe(2);
  });

  test('parceiros distintos concorrentes na última vaga => exatamente um 201 e um 400 pelo limite', async () => {
    const { requester, partnerUserA, partnerUserB } = await seedActors();
    const emergency = await harness.seedEmergency(db, {
      user_id: requester.id,
      price_breakdown: JSON.stringify({ minimum_charge: 50 }),
      max_proposals: 1,
      proposals_received: 0,
    });

    const [first, second] = await Promise.all([
      post(PROPOSALS, partnerUserA, proposalPayload({ emergency_request_id: emergency.id })),
      post(PROPOSALS, partnerUserB, proposalPayload({ emergency_request_id: emergency.id })),
    ]);

    const statuses = [first.status, second.status].sort((left, right) => left - right);
    expect(statuses).toEqual([201, 400]);
    const rejected = [first, second].find((response) => response.status === 400);
    expect(rejected.body.code).toBe('emergency_not_accepting_proposals');

    expect(await db('tow_proposals').where('emergency_request_id', emergency.id).count('* as total').first())
      .toEqual({ total: 1 });
    const updatedEmergency = await db('emergency_requests').where('id', emergency.id).first();
    expect(updatedEmergency.proposals_received).toBe(1);
    expect(updatedEmergency.proposals_received).toBe(updatedEmergency.max_proposals);
    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
  });

  test('falha do incremento => rollback da proposta e contador intacto (atomicidade)', async () => {
    const { requester, partnerUserA } = await seedActors();
    const emergency = await harness.seedEmergency(db, {
      user_id: requester.id,
      price_breakdown: JSON.stringify({ minimum_charge: 50 }),
    });

    const incrementSpy = jest
      .spyOn(EmergencyRequest, 'incrementProposalCount')
      .mockRejectedValueOnce(new Error('falha simulada no incremento'));

    try {
      const response = await post(PROPOSALS, partnerUserA, proposalPayload({ emergency_request_id: emergency.id }));

      expect(response.status).toBe(500);
      expect(await db('tow_proposals').where('emergency_request_id', emergency.id).count('* as total').first())
        .toEqual({ total: 0 });
      const updatedEmergency = await db('emergency_requests').where('id', emergency.id).first();
      expect(updatedEmergency.proposals_received).toBe(0);
      expect(NotificationService.sendNotification).not.toHaveBeenCalled();
    } finally {
      incrementSpy.mockRestore();
    }
  });
});

describe('withdraw — proposals_received é histórico (BUSINESS_RULE_AMBIGUITY)', () => {
  test('withdraw não devolve a vaga: propostas_received permanece e novo POST só entra se houver vaga', async () => {
    const { requester, partnerUserA } = await seedActors();
    const emergency = await harness.seedEmergency(db, {
      user_id: requester.id,
      price_breakdown: JSON.stringify({ minimum_charge: 50 }),
      max_proposals: 2,
      proposals_received: 0,
    });

    const first = await post(PROPOSALS, partnerUserA, proposalPayload({ emergency_request_id: emergency.id }));
    expect(first.status).toBe(201);
    expect((await db('emergency_requests').where('id', emergency.id).first()).proposals_received).toBe(1);

    const withdrawn = await post(`${PROPOSALS}/${first.body.data.id}/withdraw`, partnerUserA);
    expect(withdrawn.status).toBe(200);

    // Decisão de produto pendente: `proposals_received` é contador histórico e
    // NÃO é decrementado no withdraw (ver G3-MUSE-FINDINGS-RESOLUTION.md).
    expect((await db('emergency_requests').where('id', emergency.id).first()).proposals_received).toBe(1);

    const second = await post(PROPOSALS, partnerUserA, proposalPayload({ emergency_request_id: emergency.id }));
    expect(second.status).toBe(201);
    expect((await db('emergency_requests').where('id', emergency.id).first()).proposals_received).toBe(2);
    expect(await db('tow_proposals').where('emergency_request_id', emergency.id).count('* as total').first())
      .toEqual({ total: 2 });
  });

  test('vaga consumida por proposta retirada não é reaberta para outro parceiro', async () => {
    const { requester, partnerUserA, partnerUserB } = await seedActors();
    const emergency = await harness.seedEmergency(db, {
      user_id: requester.id,
      price_breakdown: JSON.stringify({ minimum_charge: 50 }),
      max_proposals: 1,
      proposals_received: 0,
    });

    const first = await post(PROPOSALS, partnerUserA, proposalPayload({ emergency_request_id: emergency.id }));
    expect(first.status).toBe(201);
    expect((await post(`${PROPOSALS}/${first.body.data.id}/withdraw`, partnerUserA)).status).toBe(200);

    const fromOtherPartner = await post(PROPOSALS, partnerUserB, proposalPayload({ emergency_request_id: emergency.id }));
    expect(fromOtherPartner.status).toBe(400);
    expect(fromOtherPartner.body.code).toBe('emergency_not_accepting_proposals');
    expect((await db('emergency_requests').where('id', emergency.id).first()).proposals_received).toBe(1);
  });
});

describe('POST /api/tow-proposals/:id/withdraw', () => {
  test('sem token => 401; usuário comum => 403', async () => {
    const { requester, partnerA, partnerUserA } = await seedActors();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id });
    const proposal = await harness.seedProposal(db, {
      emergency_request_id: emergency.id,
      partner_id: partnerA.id,
    });

    expect((await request(app).post(`${PROPOSALS}/${proposal.id}/withdraw`)).status).toBe(401);
    expect((await post(`${PROPOSALS}/${proposal.id}/withdraw`, requester)).status).toBe(403);
    void partnerUserA;
  });

  test('proposta inexistente => 404 proposal_not_found', async () => {
    const { partnerUserA } = await seedActors();
    const response = await post(`${PROPOSALS}/999999/withdraw`, partnerUserA);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('proposal_not_found');
  });

  test('outro parceiro => 403 e proposta permanece pending', async () => {
    const { requester, partnerA, partnerUserB } = await seedActors();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id });
    const proposal = await harness.seedProposal(db, {
      emergency_request_id: emergency.id,
      partner_id: partnerA.id,
    });

    const response = await post(`${PROPOSALS}/${proposal.id}/withdraw`, partnerUserB);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('forbidden');
    const stored = await db('tow_proposals').where('id', proposal.id).first();
    expect(stored.status).toBe('pending');
  });

  test('pending -> withdrawn retorna 200 e preserva histórico', async () => {
    const { requester, partnerA, partnerUserA } = await seedActors();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id });
    const proposal = await harness.seedProposal(db, {
      emergency_request_id: emergency.id,
      partner_id: partnerA.id,
    });

    const response = await post(`${PROPOSALS}/${proposal.id}/withdraw`, partnerUserA);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('withdrawn');

    const stored = await db('tow_proposals').where('id', proposal.id).first();
    expect(stored).toBeTruthy();
    expect(stored.status).toBe('withdrawn');
    expect(stored.responded_at).toBeTruthy();
  });

  test('repetição => 400 proposal_not_pending', async () => {
    const { requester, partnerA, partnerUserA } = await seedActors();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id });
    const proposal = await harness.seedProposal(db, {
      emergency_request_id: emergency.id,
      partner_id: partnerA.id,
    });

    expect((await post(`${PROPOSALS}/${proposal.id}/withdraw`, partnerUserA)).status).toBe(200);
    const repeat = await post(`${PROPOSALS}/${proposal.id}/withdraw`, partnerUserA);

    expect(repeat.status).toBe(400);
    expect(repeat.body.code).toBe('proposal_not_pending');
  });

  test.each(['accepted', 'rejected', 'expired'])('status %s => 400 sem mutação', async (status) => {
    const { requester, partnerA, partnerUserA } = await seedActors();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id });
    const proposal = await harness.seedProposal(db, {
      emergency_request_id: emergency.id,
      partner_id: partnerA.id,
      status,
    });

    const response = await post(`${PROPOSALS}/${proposal.id}/withdraw`, partnerUserA);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('proposal_not_pending');
    const stored = await db('tow_proposals').where('id', proposal.id).first();
    expect(stored.status).toBe(status);
  });

  test('id inválido => 400 invalid_payload', async () => {
    const { partnerUserA } = await seedActors();
    const response = await post(`${PROPOSALS}/abc/withdraw`, partnerUserA);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_payload');
  });

  test('não existem rotas PATCH/DELETE de proposta (edição é withdraw + novo POST)', async () => {
    const { partnerUserA, partnerA, requester } = await seedActors();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id });
    const proposal = await harness.seedProposal(db, {
      emergency_request_id: emergency.id,
      partner_id: partnerA.id,
    });

    const auth = harness.authorize(partnerUserA);
    const patch = await request(app).patch(`${PROPOSALS}/${proposal.id}`).set(auth).send({ proposed_price: 99 });
    const del = await request(app).delete(`${PROPOSALS}/${proposal.id}`).set(auth);

    expect(patch.status).toBe(404);
    expect(del.status).toBe(404);
    const stored = await db('tow_proposals').where('id', proposal.id).first();
    expect(stored.status).toBe('pending');
    expect(Number(stored.proposed_price)).toBe(120);
  });
});

describe('POST /api/emergency-requests/:id/cancel', () => {
  test('dono cancela pedido tow e propostas pendentes viram rejected', async () => {
    const { requester, partnerA, partnerB } = await seedActors();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id });
    const proposalA = await harness.seedProposal(db, {
      emergency_request_id: emergency.id,
      partner_id: partnerA.id,
    });
    const proposalB = await harness.seedProposal(db, {
      emergency_request_id: emergency.id,
      partner_id: partnerB.id,
    });

    const response = await post(`${EMERGENCIES}/${emergency.id}/cancel`, requester, { reason: 'Resolvido' });

    expect(response.status).toBe(200);
    const stored = await db('emergency_requests').where('id', emergency.id).first();
    expect(stored.status).toBe('cancelled');
    expect(stored.cancellation_by).toBe('user');

    const storedA = await db('tow_proposals').where('id', proposalA.id).first();
    const storedB = await db('tow_proposals').where('id', proposalB.id).first();
    expect(storedA.status).toBe('rejected');
    expect(storedB.status).toBe('rejected');
  });

  test('admin cancela pedido de terceiro', async () => {
    const { requester, admin } = await seedActors();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id });

    const response = await post(`${EMERGENCIES}/${emergency.id}/cancel`, admin, {});

    expect(response.status).toBe(200);
    const stored = await db('emergency_requests').where('id', emergency.id).first();
    expect(stored.status).toBe('cancelled');
    expect(stored.cancellation_by).toBe('admin');
  });

  test('parceiro atribuído recebe 403 e nada muda', async () => {
    const { requester, partnerA, partnerUserA } = await seedActors();
    const emergency = await harness.seedEmergency(db, {
      user_id: requester.id,
      partner_id: partnerA.id,
      status: 'accepted',
      proposal_status: 'proposal_selected',
    });
    const proposal = await harness.seedProposal(db, {
      emergency_request_id: emergency.id,
      partner_id: partnerA.id,
      status: 'accepted',
    });

    const response = await post(`${EMERGENCIES}/${emergency.id}/cancel`, partnerUserA, { reason: 'Tentativa' });

    expect(response.status).toBe(403);
    const stored = await db('emergency_requests').where('id', emergency.id).first();
    expect(stored.status).toBe('accepted');
    expect(stored.cancellation_reason).toBeNull();
    const storedProposal = await db('tow_proposals').where('id', proposal.id).first();
    expect(storedProposal.status).toBe('accepted');
  });

  test('outro usuário recebe 403 e nada muda', async () => {
    const { requester, otherUser } = await seedActors();
    const emergency = await harness.seedEmergency(db, { user_id: requester.id });

    const response = await post(`${EMERGENCIES}/${emergency.id}/cancel`, otherUser, {});

    expect(response.status).toBe(403);
    const stored = await db('emergency_requests').where('id', emergency.id).first();
    expect(stored.status).toBe('pending');
  });

  test('pedido inexistente => 404', async () => {
    const { requester } = await seedActors();
    const response = await post(`${EMERGENCIES}/999999/cancel`, requester, {});
    expect(response.status).toBe(404);
  });
});
