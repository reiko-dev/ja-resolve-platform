jest.mock('../../src/models/TowProposal', () => ({
  create: jest.fn(),
  hasPartnerProposed: jest.fn(),
}));
jest.mock('../../src/models/EmergencyRequest', () => ({
  canReceiveProposals: jest.fn(),
  getProposalExpiryMinutes: jest.fn(),
  hasPartnerProposed: jest.fn(),
  validateTowProposalPrice: jest.fn(),
  incrementProposalCount: jest.fn(),
  findById: jest.fn(),
}));
jest.mock('../../src/models/Partner', () => ({ findById: jest.fn(), calculateDistance: jest.fn() }));
jest.mock('../../src/services/NotificationServiceNew', () => ({}));

const TowProposal = require('../../src/models/TowProposal');
const EmergencyRequest = require('../../src/models/EmergencyRequest');
const Partner = require('../../src/models/Partner');
const controller = require('../../src/controllers/TowProposalController');

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

test('duplicata concorrente de proposta retorna 409', async () => {
  EmergencyRequest.canReceiveProposals.mockResolvedValue(true);
  TowProposal.hasPartnerProposed.mockResolvedValue(false);
  EmergencyRequest.getProposalExpiryMinutes.mockResolvedValue(10);
  EmergencyRequest.validateTowProposalPrice.mockResolvedValue({ valid: true, minimumAcceptedPrice: 90 });
  Partner.findById.mockResolvedValue({ type: 'tow', business_name: 'Tow', latitude: 0, longitude: 0 });
  Partner.calculateDistance.mockReturnValue(1);
  EmergencyRequest.findById.mockResolvedValue({ user_id: 20, latitude: 0, longitude: 0 });
  TowProposal.create.mockRejectedValue({
    code: 'SQLITE_CONSTRAINT_UNIQUE',
    message: 'UNIQUE constraint failed: tow_proposals.emergency_request_id, tow_proposals.partner_id',
  });

  const res = response();
  await controller.create({
    body: { emergency_request_id: 1, proposed_price: 120, estimated_time_minutes: 30 },
    user: { partner_id: 9 },
  }, res);

  expect(res.status).toHaveBeenCalledWith(409);
});
