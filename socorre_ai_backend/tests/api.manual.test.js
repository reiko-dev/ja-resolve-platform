// Teste manual dos novos endpoints da API
const request = require('supertest');
const app = require('../src/server');

describe('API Endpoints Manual Test', () => {
  let authToken;
  
  beforeAll(() => {
    // Criar token de teste
    const jwt = require('jsonwebtoken');
    authToken = jwt.sign(
      { 
        id: 1, 
        email: 'admin@test.com',
        role: 'admin' 
      },
      'test-jwt-secret-key',
      { expiresIn: '1h' }
    );
  });
  
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
      const userToken = require('jsonwebtoken').sign(
        { 
          id: 2, 
          email: 'user@test.com',
          role: 'user' 
        },
        'test-jwt-secret-key',
        { expiresIn: '1h' }
      );
      
      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});
