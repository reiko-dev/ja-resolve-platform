jest.mock('../../src/config/database', () => ({
  transaction: async (callback) => callback({}),
}));

const Partner = require('../../src/models/Partner');
const PartnerController = require('../../src/controllers/partnerController');
const TowProposalService = require('../../src/services/TowProposalService');
const EmergencyRequest = require('../../src/models/EmergencyRequest');

describe('Contratos de onboarding e localização do parceiro', () => {
  afterEach(() => jest.restoreAllMocks());

  test.each([
    [undefined, -46, 'invalid_coordinates'],
    [-23, undefined, 'invalid_coordinates'],
    ['abc', -46, 'invalid_coordinates'],
    [91, -46, 'invalid_coordinates'],
    [-23, 181, 'invalid_coordinates'],
    [0, 0, 'invalid_coordinates'],
  ])('rejeita coordenadas inválidas (%p, %p)', (latitude, longitude, code) => {
    expect(PartnerController.parseOperationalCoordinates(latitude, longitude)).toEqual({
      error: code,
      message: expect.any(String),
    });
  });

  test('aceita par finito dentro dos limites', () => {
    expect(PartnerController.parseOperationalCoordinates('-23.55', '-46.63'))
      .toEqual({ latitude: -23.55, longitude: -46.63 });
  });

  test('onboarding persiste coordenadas no payload atômico', async () => {
    const created = { id: 7, type: 'tow', latitude: -23.55, longitude: -46.63 };
    const createOrUpdate = jest.spyOn(Partner, 'createOrUpdate').mockResolvedValue(created);
    jest.spyOn(Partner, 'findByUserId').mockResolvedValue(created);
    jest.spyOn(Partner, 'getRequiredDocuments').mockReturnValue([]);
    jest.spyOn(PartnerController, '_buildOnboardingStatus').mockResolvedValue({});
    jest.spyOn(require('../../src/models/User'), 'update').mockResolvedValue({});

    const req = {
      user: { id: 7, name: 'Operador', phone: '5511999999999' },
      body: { partner_type: 'tow', company_name: 'Guincho Teste', phone: '5511999999999', address: 'Rua A', latitude: -23.55, longitude: -46.63 },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await PartnerController.completeOnboarding(req, res);

    expect(createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: -23.55, longitude: -46.63 }),
      expect.objectContaining({ trx: expect.anything() }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('retorna 200 e parceiro atualizado ao mover localização', async () => {
    const updated = { id: 7, latitude: -23.55, longitude: -46.63 };
    jest.spyOn(Partner, 'updateLocation').mockResolvedValue(updated);
    const req = { params: { id: '7' }, body: { latitude: -23.55, longitude: -46.63 } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await PartnerController.updateLocation(req, res);
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: updated }));
  });

  test('tow onboardado pode propor, mas só parceiro aprovado acessa dashboard', async () => {
    jest.spyOn(EmergencyRequest, 'canReceiveProposals').mockResolvedValue(true);
    jest.spyOn(require('../../src/models/TowProposal'), 'hasPartnerProposed').mockResolvedValue(false);
    jest.spyOn(Partner, 'findById').mockResolvedValue({
      type: 'tow', is_available: true, is_verified: true, accepts_emergency_calls: true,
    });

    await expect(TowProposalService.canPartnerPropose(1, 1)).resolves.toEqual({ canPropose: true });
    expect(Partner.canAccessDashboard({ type: 'tow', approval_status: 'documents_required' })).toBe(false);
    expect(Partner.canAccessDashboard({ type: 'tow', approval_status: 'approved' })).toBe(true);
  });
});
