/**
 * G1 — Controller do ciclo de vida tow (start/complete).
 *
 * Prova, com o model mockado, a matriz de autorização de
 * docs/MOBILE-AUTH-TOW-CONTRACT-V1.md §4.4/§6, as transições accepted →
 * in_progress → completed, a idempotência de repetições sequenciais e
 * concorrentes e a ausência de efeitos duplicados (mutação, cobrança,
 * notificação).
 *
 * O transporte HTTP real (auth middleware + rotas + controller + model +
 * banco) é coberto em towHttp.transport.test.js.
 *
 * BUSINESS_RULE_AMBIGUITY (TASKSPEC §ambiguities): o contrato não decide se a
 * repetição idempotente responde 200 com o recurso atual ou 409. G1 preserva o
 * comportamento já publicado (200 com o recurso atual, sem novos efeitos) e o
 * estende à repetição concorrente que perde a corrida para o mesmo destino.
 * Transição incompatível (ex.: cancelamento venceu) permanece 400 com
 * current_status, nunca 200.
 */
jest.mock('../../src/models/EmergencyRequest', () => ({
  findById: jest.fn(),
  start: jest.fn(),
  complete: jest.fn(),
  completeWithProposal: jest.fn(),
  validateTowProposalPrice: jest.fn(),
}));
jest.mock('../../src/models/Subscription', () => ({}));
jest.mock('../../src/models/Partner', () => ({}));
jest.mock('../../src/config/database', () => jest.fn());
jest.mock('../../src/services/paymentService', () => ({
  createTowEmergencyPayment: jest.fn(),
  createTowCancellationFeePayment: jest.fn(),
  getEmergencyActiveServicePayment: jest.fn(),
  cancelPayment: jest.fn(),
  getEmergencyPaymentSummary: jest.fn(),
}));
jest.mock('../../src/services/NotificationServiceNew', () => ({ sendNotification: jest.fn() }));

const EmergencyRequest = require('../../src/models/EmergencyRequest');
const paymentService = require('../../src/services/paymentService');
const NotificationService = require('../../src/services/NotificationServiceNew');
const controller = require('../../src/controllers/emergencyRequestController');

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function startRequest({ id = 1, user }) {
  return { params: { id }, user, body: {} };
}

function completeRequest({ id = 1, user, body = { final_price: 120 } }) {
  return { params: { id }, user, body };
}

const OWNER_ID = 20;
const ASSIGNED_PARTNER_ID = 9;

const ACCEPTED_TOW = {
  id: 1,
  user_id: OWNER_ID,
  request_type: 'tow',
  status: 'accepted',
  partner_id: ASSIGNED_PARTNER_ID,
};
const IN_PROGRESS_TOW = { ...ACCEPTED_TOW, status: 'in_progress' };
const COMPLETED_TOW = { ...ACCEPTED_TOW, status: 'completed' };

const ASSIGNED_PARTNER = { id: OWNER_ID, partner_id: ASSIGNED_PARTNER_ID, role: 'partner' };
const OTHER_PARTNER = { id: 21, partner_id: 10, role: 'partner' };
const PARTNER_WITHOUT_PARTNER_ROW = { id: 22, partner_id: null, role: 'partner' };
const OWNER_CLIENT = { id: OWNER_ID, partner_id: null, role: 'user' };
const ADMIN = { id: 1, partner_id: null, role: 'admin' };

function expectNoBillingEffects() {
  expect(paymentService.createTowEmergencyPayment).not.toHaveBeenCalled();
  expect(paymentService.createTowCancellationFeePayment).not.toHaveBeenCalled();
  expect(paymentService.getEmergencyActiveServicePayment).not.toHaveBeenCalled();
  expect(paymentService.cancelPayment).not.toHaveBeenCalled();
}

describe('G1 ciclo de vida de guincho — autorização', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    EmergencyRequest.validateTowProposalPrice.mockResolvedValue({ valid: true, minimumAcceptedPrice: 90 });
  });

  test('404 quando o pedido não existe (antes de checar vínculo)', async () => {
    EmergencyRequest.findById.mockResolvedValue(undefined);
    const res = response();

    await controller.start(startRequest({ user: ASSIGNED_PARTNER }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(EmergencyRequest.start).not.toHaveBeenCalled();
  });

  test('parceiro não atribuído recebe 403 em start e complete', async () => {
    EmergencyRequest.findById.mockResolvedValue(ACCEPTED_TOW);

    const startRes = response();
    await controller.start(startRequest({ user: OTHER_PARTNER }), startRes);
    expect(startRes.status).toHaveBeenCalledWith(403);

    EmergencyRequest.findById.mockResolvedValue(IN_PROGRESS_TOW);
    const completeRes = response();
    await controller.complete(completeRequest({ user: OTHER_PARTNER }), completeRes);
    expect(completeRes.status).toHaveBeenCalledWith(403);

    expect(EmergencyRequest.start).not.toHaveBeenCalled();
    expect(EmergencyRequest.completeWithProposal).not.toHaveBeenCalled();
    expect(NotificationService.sendNotification).not.toHaveBeenCalled();
    expectNoBillingEffects();
  });

  test('cliente proprietário (role user) recebe 403 mesmo sendo dono do pedido', async () => {
    EmergencyRequest.findById.mockResolvedValue(ACCEPTED_TOW);

    const startRes = response();
    await controller.start(startRequest({ user: OWNER_CLIENT }), startRes);
    expect(startRes.status).toHaveBeenCalledWith(403);

    EmergencyRequest.findById.mockResolvedValue(IN_PROGRESS_TOW);
    const completeRes = response();
    await controller.complete(completeRequest({ user: OWNER_CLIENT }), completeRes);
    expect(completeRes.status).toHaveBeenCalledWith(403);

    expect(EmergencyRequest.start).not.toHaveBeenCalled();
    expect(EmergencyRequest.completeWithProposal).not.toHaveBeenCalled();
  });

  test('parceiro sem linha em partners não é tratado como atribuído', async () => {
    EmergencyRequest.findById.mockResolvedValue({ ...ACCEPTED_TOW, partner_id: null });
    const res = response();

    await controller.start(startRequest({ user: PARTNER_WITHOUT_PARTNER_ROW }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(EmergencyRequest.start).not.toHaveBeenCalled();
  });

  test('admin pode iniciar e concluir pedido atribuído a outro parceiro', async () => {
    EmergencyRequest.findById.mockResolvedValue(ACCEPTED_TOW);
    EmergencyRequest.start.mockResolvedValue(IN_PROGRESS_TOW);

    const startRes = response();
    await controller.start(startRequest({ user: ADMIN }), startRes);

    expect(EmergencyRequest.start).toHaveBeenCalledWith(1, null);
    expect(startRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

    EmergencyRequest.findById.mockResolvedValue(IN_PROGRESS_TOW);
    EmergencyRequest.completeWithProposal.mockResolvedValue(COMPLETED_TOW);

    const completeRes = response();
    await controller.complete(completeRequest({ user: ADMIN, body: { final_price: 120 } }), completeRes);

    expect(EmergencyRequest.completeWithProposal).toHaveBeenCalledWith(1, 120, undefined, undefined, null);
    expect(completeRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(2);
  });
});

describe('G1 ciclo de vida de guincho — transições', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    EmergencyRequest.validateTowProposalPrice.mockResolvedValue({ valid: true, minimumAcceptedPrice: 90 });
  });

  test('parceiro atribuído inicia emergência aceita e notifica uma vez', async () => {
    EmergencyRequest.findById.mockResolvedValue(ACCEPTED_TOW);
    EmergencyRequest.start.mockResolvedValue(IN_PROGRESS_TOW);

    const res = response();
    await controller.start(startRequest({ user: ASSIGNED_PARTNER }), res);

    expect(EmergencyRequest.start).toHaveBeenCalledWith(1, ASSIGNED_PARTNER_ID);
    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
    expect(NotificationService.sendNotification).toHaveBeenCalledWith(
      OWNER_ID,
      'Guincho a caminho',
      expect.any(String),
      expect.objectContaining({ type: 'tow_started', emergency_request_id: 1 })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expectNoBillingEffects();
  });

  test('start não é permitido em pending (400, sem mutação nem notificação)', async () => {
    EmergencyRequest.findById.mockResolvedValue({ ...ACCEPTED_TOW, status: 'pending' });
    const res = response();

    await controller.start(startRequest({ user: ASSIGNED_PARTNER }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ current_status: 'pending' }));
    expect(EmergencyRequest.start).not.toHaveBeenCalled();
    expect(NotificationService.sendNotification).not.toHaveBeenCalled();
  });

  test('start não é permitido em completed nem em cancelled', async () => {
    for (const status of ['completed', 'cancelled']) {
      jest.clearAllMocks();
      EmergencyRequest.findById.mockResolvedValue({ ...ACCEPTED_TOW, status });
      const res = response();

      await controller.start(startRequest({ user: ASSIGNED_PARTNER }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(EmergencyRequest.start).not.toHaveBeenCalled();
    }
  });

  test('parceiro atribuído conclui somente emergência em andamento', async () => {
    EmergencyRequest.findById.mockResolvedValue(IN_PROGRESS_TOW);
    EmergencyRequest.completeWithProposal.mockResolvedValue(COMPLETED_TOW);

    const res = response();
    await controller.complete(
      completeRequest({
        user: ASSIGNED_PARTNER,
        body: { final_price: 120, solution_description: 'Atendimento concluído', parts_used: ['cabo'] },
      }),
      res
    );

    expect(EmergencyRequest.completeWithProposal).toHaveBeenCalledWith(
      1,
      120,
      'Atendimento concluído',
      ['cabo'],
      ASSIGNED_PARTNER_ID
    );
    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
    expect(NotificationService.sendNotification).toHaveBeenCalledWith(
      OWNER_ID,
      'Guincho concluído',
      expect.any(String),
      expect.objectContaining({ type: 'tow_completed', emergency_request_id: 1 })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expectNoBillingEffects();
  });

  test('complete não é permitido em accepted/pending/cancelled (400, sem mutação)', async () => {
    for (const status of ['accepted', 'pending', 'cancelled']) {
      jest.clearAllMocks();
      EmergencyRequest.findById.mockResolvedValue({ ...ACCEPTED_TOW, status });
      const res = response();

      await controller.complete(completeRequest({ user: ASSIGNED_PARTNER }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ current_status: status }));
      expect(EmergencyRequest.completeWithProposal).not.toHaveBeenCalled();
      expect(EmergencyRequest.complete).not.toHaveBeenCalled();
      expect(NotificationService.sendNotification).not.toHaveBeenCalled();
    }
  });

  test('guincho exige preço final', async () => {
    EmergencyRequest.findById.mockResolvedValue(IN_PROGRESS_TOW);
    const res = response();

    await controller.complete(completeRequest({ user: ASSIGNED_PARTNER, body: {} }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(EmergencyRequest.completeWithProposal).not.toHaveBeenCalled();
  });

  test('final_price inválido ou negativo é rejeitado antes de qualquer leitura', async () => {
    // `null` NÃO entra nesta lista: Number(null) === 0 faz o guard atual aceitar
    // null quando o pedido não tem price_breakdown. Isso é lacuna de schema de
    // payload (G2 — "final_price inválido/negativo/abaixo do mínimo"), registrada
    // como ambiguidade; G1 não altera regra de preço.
    for (const finalPrice of [-1, 'abc', NaN, -0.01]) {
      jest.clearAllMocks();
      const res = response();

      await controller.complete(completeRequest({ user: ASSIGNED_PARTNER, body: { final_price: finalPrice } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(EmergencyRequest.findById).not.toHaveBeenCalled();
      expect(EmergencyRequest.completeWithProposal).not.toHaveBeenCalled();
    }
  });

  test('final_price abaixo do mínimo é rejeitado sem mutação', async () => {
    EmergencyRequest.findById.mockResolvedValue(IN_PROGRESS_TOW);
    EmergencyRequest.validateTowProposalPrice.mockResolvedValue({ valid: false, minimumAcceptedPrice: 90 });

    const res = response();
    await controller.complete(completeRequest({ user: ASSIGNED_PARTNER, body: { final_price: 50 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(EmergencyRequest.completeWithProposal).not.toHaveBeenCalled();
    expect(NotificationService.sendNotification).not.toHaveBeenCalled();
  });

  test('pedido mechanic usa complete sem exigir final_price', async () => {
    EmergencyRequest.findById.mockResolvedValue({
      id: 1,
      user_id: OWNER_ID,
      request_type: 'mechanic',
      status: 'in_progress',
      partner_id: ASSIGNED_PARTNER_ID,
    });
    EmergencyRequest.complete.mockResolvedValue({ id: 1, status: 'completed' });

    const res = response();
    await controller.complete(completeRequest({ user: ASSIGNED_PARTNER, body: {} }), res);

    expect(EmergencyRequest.complete).toHaveBeenCalledWith(1, undefined, undefined, undefined, ASSIGNED_PARTNER_ID);
    expect(EmergencyRequest.completeWithProposal).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('G1 ciclo de vida de guincho — idempotência', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('iniciar novamente é idempotente e não repete efeitos', async () => {
    EmergencyRequest.findById.mockResolvedValue(IN_PROGRESS_TOW);
    const res = response();

    await controller.start(startRequest({ user: ASSIGNED_PARTNER }), res);

    expect(EmergencyRequest.start).not.toHaveBeenCalled();
    expect(NotificationService.sendNotification).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: IN_PROGRESS_TOW,
      message: 'Solicitação já foi iniciada',
    });
    expectNoBillingEffects();
  });

  test('concluir novamente é idempotente e não repete efeitos', async () => {
    EmergencyRequest.findById.mockResolvedValue(COMPLETED_TOW);
    const res = response();

    await controller.complete(
      completeRequest({ user: ASSIGNED_PARTNER, body: { final_price: 999 } }),
      res
    );

    expect(EmergencyRequest.completeWithProposal).not.toHaveBeenCalled();
    expect(EmergencyRequest.complete).not.toHaveBeenCalled();
    expect(NotificationService.sendNotification).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: COMPLETED_TOW,
      message: 'Solicitação já foi concluída',
    });
    expectNoBillingEffects();
  });

  test('repetição de complete não revalida preço nem exige payload', async () => {
    EmergencyRequest.findById.mockResolvedValue(COMPLETED_TOW);
    const res = response();

    await controller.complete(completeRequest({ user: ASSIGNED_PARTNER, body: {} }), res);

    expect(EmergencyRequest.validateTowProposalPrice).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('G1 ciclo de vida de guincho — concorrência', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    EmergencyRequest.validateTowProposalPrice.mockResolvedValue({ valid: true, minimumAcceptedPrice: 90 });
  });

  test('duas requisições concorrentes de start: uma muta, a outra responde idempotente, uma notificação', async () => {
    EmergencyRequest.findById
      .mockResolvedValueOnce(ACCEPTED_TOW) // requisição A (pré-leitura)
      .mockResolvedValueOnce(ACCEPTED_TOW) // requisição B (pré-leitura)
      .mockResolvedValueOnce(IN_PROGRESS_TOW); // requisição B (releitura pós-corrida)
    EmergencyRequest.start
      .mockResolvedValueOnce(IN_PROGRESS_TOW) // A vence a atualização condicional
      .mockResolvedValueOnce(undefined); // B perde a corrida

    const resA = response();
    const resB = response();

    await Promise.all([
      controller.start(startRequest({ user: ASSIGNED_PARTNER }), resA),
      controller.start(startRequest({ user: ASSIGNED_PARTNER }), resB),
    ]);

    expect(EmergencyRequest.start).toHaveBeenCalledTimes(2);
    expect(resA.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(resB.json).toHaveBeenCalledWith({
      success: true,
      data: IN_PROGRESS_TOW,
      message: 'Solicitação já foi iniciada',
    });
    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
    expectNoBillingEffects();
  });

  test('duas requisições concorrentes de complete: uma muta, a outra responde idempotente, uma notificação', async () => {
    EmergencyRequest.findById
      .mockResolvedValueOnce(IN_PROGRESS_TOW)
      .mockResolvedValueOnce(IN_PROGRESS_TOW)
      .mockResolvedValueOnce(COMPLETED_TOW);
    EmergencyRequest.completeWithProposal
      .mockResolvedValueOnce(COMPLETED_TOW)
      .mockResolvedValueOnce(undefined);

    const resA = response();
    const resB = response();

    await Promise.all([
      controller.complete(completeRequest({ user: ASSIGNED_PARTNER }), resA),
      controller.complete(completeRequest({ user: ASSIGNED_PARTNER }), resB),
    ]);

    expect(EmergencyRequest.completeWithProposal).toHaveBeenCalledTimes(2);
    expect(resA.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(resB.json).toHaveBeenCalledWith({
      success: true,
      data: COMPLETED_TOW,
      message: 'Solicitação já foi concluída',
    });
    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
    expectNoBillingEffects();
  });

  test('start que perde a corrida para cancelamento retorna 400, nunca sucesso', async () => {
    EmergencyRequest.findById
      .mockResolvedValueOnce(ACCEPTED_TOW) // pré-leitura
      .mockResolvedValueOnce({ ...ACCEPTED_TOW, status: 'cancelled' }); // releitura
    EmergencyRequest.start.mockResolvedValue(undefined);

    const res = response();
    await controller.start(startRequest({ user: ASSIGNED_PARTNER }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ current_status: 'cancelled' }));
    expect(NotificationService.sendNotification).not.toHaveBeenCalled();
  });

  test('complete que perde a corrida para cancelamento retorna 400, nunca sucesso', async () => {
    EmergencyRequest.findById
      .mockResolvedValueOnce(IN_PROGRESS_TOW)
      .mockResolvedValueOnce({ ...IN_PROGRESS_TOW, status: 'cancelled' });
    EmergencyRequest.completeWithProposal.mockResolvedValue(undefined);

    const res = response();
    await controller.complete(completeRequest({ user: ASSIGNED_PARTNER }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ current_status: 'cancelled' }));
    expect(NotificationService.sendNotification).not.toHaveBeenCalled();
  });

  test('erro de banco vira 500 genérico sem vazar SQL/constraint/stack', async () => {
    EmergencyRequest.findById.mockRejectedValue(
      new Error('select * from "emergency_requests" where constraint "emergency_requests_status_check" fails')
    );

    const res = response();
    await controller.start(startRequest({ user: ASSIGNED_PARTNER }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = JSON.stringify(res.json.mock.calls[0][0]);
    expect(body).not.toMatch(/select|constraint|emergency_requests_status_check|at Object/i);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Erro interno do servidor' });
  });
});
