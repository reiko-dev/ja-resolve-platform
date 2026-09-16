// Teste manual dos novos endpoints da API
//
// O app é exercitado contra o SQLite em memória de tests/helpers/testDb.js
// (mesmo harness das demais suítes) e os tokens seguem o contrato oficial de
// src/middleware/auth.js: claim `userId` + usuário real e ativo no banco.
jest.mock('../src/config/database', () => require('./helpers/testDb').db);

const request = require('supertest');
const app = require('../src/server');
const { createAuthedUser } = require('./helpers/auth');

describe('API Endpoints Manual Test', () => {
  describe('POST /api/tow-proposals', () => {
    it('deve retornar 401 se não autenticado', async () => {
      const response = await request(app)
        .post('/api/tow-proposals')
        .send({
          emergency_request_id: 1,
          partner_id: 1,
          estimated_value: 150.00,
          estimated_time_minutes: 30
        });
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
    
    it('deve retornar 401 com token inválido', async () => {
      const response = await request(app)
        .post('/api/tow-proposals')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          emergency_request_id: 1,
          partner_id: 1,
          estimated_value: 150.00,
          estimated_time_minutes: 30
        });
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
  
  describe('GET /api/subscriptions', () => {
    it('deve retornar 401 se não autenticado', async () => {
      const response = await request(app)
        .get('/api/subscriptions');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
  
  describe('GET /api/delivery-orders', () => {
    it('deve retornar 401 se não autenticado', async () => {
      const response = await request(app)
        .get('/api/delivery-orders');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
  
  describe('GET /api/dashboard/stats', () => {
    it('deve retornar 401 se não autenticado', async () => {
      const response = await request(app)
        .get('/api/dashboard/stats');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
    
    it('deve retornar 403 se não for admin', async () => {
      // Fixture determinística: usuário comum persistido no banco e token na
      // claim `userId` — sem isso o middleware não encontra o usuário (401).
      const { token } = await createAuthedUser({
        role: 'user',
        email: 'user@test.com',
      });

      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});
