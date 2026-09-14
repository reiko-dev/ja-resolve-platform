jest.mock('../../src/models/EmergencyRequest', () => ({
  findById: jest.fn(),
  start: jest.fn(),
  complete: jest.fn(),
  completeWithProposal: jest.fn(),
  validateTowProposalPrice: jest.fn().mockResolvedValue({ valid: true }),
}));
jest.mock('../../src/models/Subscription', () => ({}));
jest.mock('../../src/models/Partner', () => ({}));
jest.mock('../../src/config/database', () => jest.fn());
jest.mock('../../src/services/paymentService', () => ({}));
jest.mock('../../src/services/NotificationServiceNew', () => ({ sendNotification: jest.fn() }));

const EmergencyRequest = require('../../src/models/EmergencyRequest');
const controller = require('../../src/controllers/emergencyRequestController');
const NotificationService = require('../../src/services/NotificationServiceNew');

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('ciclo de vida de guincho', () => {
  afterEach(() => jest.clearAllMocks());

  test('parceiro atribuído inicia emergência aceita', async () => {
    const emergency = { id: 1, user_id: 20, request_type: 'tow', status: 'accepted', partner_id: 9 };
    EmergencyRequest.findById.mockResolvedValue(emergency);
    EmergencyRequest.start.mockResolvedValue({ ...emergency, status: 'in_progress' });

    const res = response();
    await controller.start({ params: { id: 1 }, user: { id: 20, partner_id: 9, role: 'partner' } }, res);

    expect(EmergencyRequest.start).toHaveBeenCalledWith(1, 9);
    expect(NotificationService.sendNotification).toHaveBeenCalledWith(
      20,
      'Guincho a caminho',
      expect.any(String),
      expect.objectContaining({ type: 'tow_started', emergency_request_id: 1 })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('iniciar novamente é idempotente', async () => {
    const emergency = { id: 1, user_id: 20, request_type: 'tow', status: 'in_progress', partner_id: 9 };
    EmergencyRequest.findById.mockResolvedValue(emergency);
    const res = response();

    await controller.start({ params: { id: 1 }, user: { id: 20, partner_id: 9, role: 'partner' } }, res);

    expect(EmergencyRequest.start).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: emergency, message: 'Solicitação já foi iniciada' });
  });

  test('parceiro diferente não pode iniciar', async () => {
    EmergencyRequest.findById.mockResolvedValue({ id: 1, status: 'accepted', partner_id: 9 });

    const res = response();
    await controller.start({ params: { id: 1 }, user: { id: 21, partner_id: 10, role: 'partner' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(EmergencyRequest.start).not.toHaveBeenCalled();
  });

  test('parceiro atribuído conclui somente emergência em andamento', async () => {
    const emergency = { id: 1, user_id: 20, request_type: 'tow', status: 'in_progress', partner_id: 9 };
    EmergencyRequest.findById.mockResolvedValue(emergency);
    EmergencyRequest.completeWithProposal.mockResolvedValue({ ...emergency, status: 'completed' });

    const res = response();
    await controller.complete({
      params: { id: 1 },
      user: { id: 20, partner_id: 9, role: 'partner' },
      body: { final_price: 120, solution_description: 'Atendimento concluído' },
    }, res);

    expect(EmergencyRequest.completeWithProposal).toHaveBeenCalledWith(1, 120, 'Atendimento concluído', undefined, 9);
    expect(NotificationService.sendNotification).toHaveBeenCalledWith(
      20,
      'Guincho concluído',
      expect.any(String),
      expect.objectContaining({ type: 'tow_completed', emergency_request_id: 1 })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('admin pode concluir emergência em andamento', async () => {
    const emergency = { id: 1, user_id: 20, request_type: 'tow', status: 'in_progress', partner_id: 9 };
    EmergencyRequest.findById.mockResolvedValue(emergency);
    EmergencyRequest.completeWithProposal.mockResolvedValue({ ...emergency, status: 'completed' });

    const res = response();
    await controller.complete({ params: { id: 1 }, user: { id: 1, role: 'admin' }, body: { final_price: 120 } }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('guincho exige preço final', async () => {
    EmergencyRequest.findById.mockResolvedValue({ id: 1, request_type: 'tow', status: 'in_progress', partner_id: 9 });
    const res = response();

    await controller.complete({ params: { id: 1 }, user: { id: 20, partner_id: 9, role: 'partner' }, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(EmergencyRequest.completeWithProposal).not.toHaveBeenCalled();
  });

  test('concluir novamente é idempotente', async () => {
    const emergency = { id: 1, request_type: 'tow', status: 'completed', partner_id: 9 };
    EmergencyRequest.findById.mockResolvedValue(emergency);
    const res = response();

    await controller.complete({ params: { id: 1 }, user: { id: 20, partner_id: 9, role: 'partner' }, body: { final_price: 120 } }, res);

    expect(EmergencyRequest.completeWithProposal).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: emergency, message: 'Solicitação já foi concluída' });
  });
});
