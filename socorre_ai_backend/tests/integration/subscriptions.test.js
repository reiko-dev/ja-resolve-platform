const request = require('supertest');
const app = require('../../src/server');

describe('Subscriptions API', () => {
  let authToken;
  
  beforeAll(async () => {
    // Criar token de teste para autenticação
    authToken = global.testUtils.generateTestToken(1, 'admin');
  });
  
  describe('POST /api/subscriptions', () => {
    it('deve criar uma nova assinatura', async () => {
      const subscriptionData = {
        partner_id: 1,
        type: 'mechanic',
        monthly_fee: 99.90,
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        due_date: '2024-01-31',
        auto_renew: true,
        payment_method: 'credit_card'
      };
      
      const response = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(subscriptionData)
        .expect(201);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.partner_id).toBe(1);
      expect(response.body.data.type).toBe('mechanic');
      expect(response.body.data.monthly_fee).toBe('99.90');
      expect(response.body.data.status).toBe('active');
    });
    
    it('deve validar dados obrigatórios', async () => {
      const invalidData = {
        monthly_fee: 99.90
      };
      
      const response = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('validation');
    });
    
    it('deve requer autenticação', async () => {
      const subscriptionData = {
        partner_id: 1,
        type: 'mechanic',
        monthly_fee: 99.90,
        start_date: '2024-01-01',
        end_date: '2024-12-31'
      };
      
      const response = await request(app)
        .post('/api/subscriptions')
        .send(subscriptionData)
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('unauthorized');
    });
  });
  
  describe('GET /api/subscriptions', () => {
    beforeEach(async () => {
      // Criar parceiro de teste
      await global.testUtils.createTestPartner();
    });
    
    it('deve listar assinaturas com paginação', async () => {
      const response = await request(app)
        .get('/api/subscriptions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.subscriptions).toBeDefined();
      expect(Array.isArray(response.body.data.subscriptions)).toBe(true);
      expect(response.body.data.pagination).toBeDefined();
    });
    
    it('deve filtrar por status', async () => {
      const response = await request(app)
        .get('/api/subscriptions?status=active')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      // Verificar se todas as assinaturas retornadas têm status 'active'
      response.body.data.subscriptions.forEach(subscription => {
        expect(subscription.status).toBe('active');
      });
    });
    
    it('deve filtrar por tipo', async () => {
      const response = await request(app)
        .get('/api/subscriptions?type=mechanic')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      // Verificar se todas as assinaturas retornadas são do tipo 'mechanic'
      response.body.data.subscriptions.forEach(subscription => {
        expect(subscription.type).toBe('mechanic');
      });
    });
    
    it('deve filtrar por parceiro', async () => {
      const response = await request(app)
        .get('/api/subscriptions?partner_id=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      // Verificar se todas as assinaturas retornadas pertencem ao parceiro 1
      response.body.data.subscriptions.forEach(subscription => {
        expect(subscription.partner_id).toBe(1);
      });
    });
  });
  
  describe('GET /api/subscriptions/:id', () => {
    it('deve retornar assinatura específica', async () => {
      // Criar parceiro de teste
      await global.testUtils.createTestPartner();
      
      const subscriptionData = {
        partner_id: 1,
        type: 'mechanic',
        monthly_fee: 99.90,
        start_date: '2024-01-01',
        end_date: '2024-12-31'
      };
      
      const createResponse = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(subscriptionData)
        .expect(201);
      
      const subscriptionId = createResponse.body.data.id;
      
      const response = await request(app)
        .get(`/api/subscriptions/${subscriptionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(subscriptionId);
      expect(response.body.data.partner_id).toBe(1);
    });
    
    it('deve retornar 404 se assinatura não existir', async () => {
      const response = await request(app)
        .get('/api/subscriptions/999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });
  });
  
  describe('PUT /api/subscriptions/:id', () => {
    it('deve atualizar assinatura', async () => {
      // Criar parceiro e assinatura de teste
      await global.testUtils.createTestPartner();
      
      const subscriptionData = {
        partner_id: 1,
        type: 'mechanic',
        monthly_fee: 99.90,
        start_date: '2024-01-01',
        end_date: '2024-12-31'
      };
      
      const createResponse = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(subscriptionData)
        .expect(201);
      
      const subscriptionId = createResponse.body.data.id;
      
      const updateData = {
        monthly_fee: 119.90,
        auto_renew: false
      };
      
      const response = await request(app)
        .put(`/api/subscriptions/${subscriptionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.monthly_fee).toBe('119.90');
      expect(response.body.data.auto_renew).toBe(false);
    });
  });
  
  describe('POST /api/subscriptions/:id/cancel', () => {
    it('deve cancelar assinatura', async () => {
      // Criar parceiro e assinatura de teste
      await global.testUtils.createTestPartner();
      
      const subscriptionData = {
        partner_id: 1,
        type: 'mechanic',
        monthly_fee: 99.90,
        start_date: '2024-01-01',
        end_date: '2024-12-31'
      };
      
      const createResponse = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(subscriptionData)
        .expect(201);
      
      const subscriptionId = createResponse.body.data.id;
      
      const response = await request(app)
        .post(`/api/subscriptions/${subscriptionId}/cancel`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'Customer request' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('cancelled');
      expect(response.body.data.cancellation_reason).toBe('Customer request');
      expect(response.body.data.cancelled_at).toBeDefined();
    });
  });
  
  describe('POST /api/subscriptions/:id/renew', () => {
    it('deve renovar assinatura', async () => {
      // Criar parceiro e assinatura de teste
      await global.testUtils.createTestPartner();
      
      const subscriptionData = {
        partner_id: 1,
        type: 'mechanic',
        monthly_fee: 99.90,
        start_date: '2024-01-01',
        end_date: '2024-12-31'
      };
      
      const createResponse = await request(app)
        .post('/api/subscriptions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(subscriptionData)
        .expect(201);
      
      const subscriptionId = createResponse.body.data.id;
      
      const response = await request(app)
        .post(`/api/subscriptions/${subscriptionId}/renew`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.end_date).toBeDefined();
      // Verificar se a data de fim foi estendida
      const newEndDate = new Date(response.body.data.end_date);
      const originalEndDate = new Date('2024-12-31');
      expect(newEndDate.getTime()).toBeGreaterThan(originalEndDate.getTime());
    });
  });
  
  describe('GET /api/subscriptions/stats', () => {
    it('deve retornar estatísticas das assinaturas', async () => {
      const response = await request(app)
        .get('/api/subscriptions/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.total_subscriptions).toBeDefined();
      expect(response.body.data.active_subscriptions).toBeDefined();
      expect(response.body.data.expired_subscriptions).toBeDefined();
      expect(response.body.data.cancelled_subscriptions).toBeDefined();
      expect(response.body.data.monthly_revenue).toBeDefined();
      expect(response.body.data.average_subscription_value).toBeDefined();
    });
  });
  
  describe('GET /api/subscriptions/expiring-soon', () => {
    it('deve retornar assinaturas que expiram em breve', async () => {
      const response = await request(app)
        .get('/api/subscriptions/expiring-soon?days=30')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // Se houver assinaturas, verificar se expiram em 30 dias
      response.body.data.forEach(subscription => {
        const expiryDate = new Date(subscription.end_date);
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        expect(expiryDate.getTime()).toBeLessThanOrEqual(thirtyDaysFromNow.getTime());
      });
    });
  });
});
