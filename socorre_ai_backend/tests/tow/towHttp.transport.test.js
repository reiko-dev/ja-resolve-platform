jest.mock('../../src/config/database', () => require('../auth/helpers/authTransportDb').db);
jest.mock('../../src/models/EmergencyRequest', () => ({
  findById: jest.fn(),
  start: jest.fn(),
  complete: jest.fn(),
  completeWithProposal: jest.fn(),
  validateTowProposalPrice: jest.fn().mockResolvedValue({ valid: true, minimumAcceptedPrice: 90 }),
}));
jest.mock('../../src/services/NotificationServiceNew', () => ({ sendNotification: jest.fn() }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createApp } = require('../../src/app');
const EmergencyRequest = require('../../src/models/EmergencyRequest');
const { getJwtSecret } = require('../../src/config/jwt');
const { db, initSchema, reset, createUser } = require('../auth/helpers/authTransportDb');

describe('HTTP transport real: lifecycle tow', () => {
  let app;
  let partnerToken;
  let partnerId;

  beforeAll(async () => {
    await initSchema();
    app = createApp();
  });

  beforeEach(async () => {
    await reset();
    const password = await bcrypt.hash('Senha123', 4);
    const user = await createUser({ role: 'partner', password });
    const [partner] = await db('partners').insert({ user_id: user.id, type: 'tow', business_name: 'Tow Test' }).returning('*');
    partnerToken = jwt.sign({ userId: user.id, role: 'partner' }, getJwtSecret(), { expiresIn: '1h' });
    partnerId = partner.id;
    EmergencyRequest.findById.mockReset();
    EmergencyRequest.start.mockReset();
    EmergencyRequest.completeWithProposal.mockReset();
    EmergencyRequest.validateTowProposalPrice.mockResolvedValue({ valid: true, minimumAcceptedPrice: 90 });
    return partner;
  });

  test('rota real aceita parceiro atribuído', async () => {
    EmergencyRequest.findById.mockResolvedValue({ id: 1, user_id: 2, request_type: 'tow', status: 'accepted', partner_id: partnerId });
    EmergencyRequest.start.mockResolvedValue({ id: 1, status: 'in_progress' });

    const response = await request(app)
      .post('/api/emergency-requests/1/start')
      .set('Authorization', `Bearer ${partnerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(EmergencyRequest.start).toHaveBeenCalledWith('1', partnerId);
  });

  test('rota real devolve 401 sem Bearer', async () => {
    const response = await request(app).post('/api/emergency-requests/1/start');
    expect(response.status).toBe(401);
  });
});
