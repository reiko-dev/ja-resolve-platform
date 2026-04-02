const request = require('supertest');
const app = require('../../src/server');

describe('Tow Proposals API', () => {
  let authToken;
  
  beforeAll(async () => {
    // Criar token de teste para autenticação
    authToken = global.testUtils.generateTestToken(1, 'admin');
  });
  
  describe('POST /api/tow-proposals', () => {
    it('deve criar uma nova proposta de guincho', async () => {
      const proposalData = {
        emergency_request_id: 1,
        partner_id: 1,
        estimated_value: 150.00,
        estimated_time_minutes: 30,
        notes: 'Test proposal'
      };
      
      const response = await request(app)
        .post('/api/tow-proposals')
        .set('Authorization', `Bearer ${authToken}`)
        .send(proposalData)
        .expect(201);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.emergency_request_id).toBe(1);
      expect(response.body.data.estimated_value).toBe('150.00');
    });
    
    it('deve validar dados obrigatórios', async () => {
      const invalidData = {
        estimated_value: 150.00
      };
      
      const response = await request(app)
        .post('/api/tow-proposals')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('validation');
    });
    
    it('deve requer autenticação', async () => {
      const proposalData = {
        emergency_request_id: 1,
        partner_id: 1,
        estimated_value: 150.00,
        estimated_time_minutes: 30
      };
      
      const response = await request(app)
        .post('/api/tow-proposals')
        .send(proposalData)
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('unauthorized');
    });
  });
  
  describe('GET /api/tow-proposals', () => {
    beforeEach(async () => {
      // Criar propostas de teste
      await global.testUtils.createTestEmergencyRequest();
      await global.testUtils.createTestPartner();
    });
    
    it('deve listar propostas com paginação', async () => {
      const response = await request(app)
        .get('/api/tow-proposals')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.proposals).toBeDefined();
      expect(Array.isArray(response.body.data.proposals)).toBe(true);
      expect(response.body.data.pagination).toBeDefined();
    });
    
    it('deve filtrar por status', async () => {
      const response = await request(app)
        .get('/api/tow-proposals?status=pending')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      // Verificar se todas as propostas retornadas têm status 'pending'
      response.body.data.proposals.forEach(proposal => {
        expect(proposal.status).toBe('pending');
      });
    });
    
    it('deve filtrar por parceiro', async () => {
      const response = await request(app)
        .get('/api/tow-proposals?partner_id=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      // Verificar se todas as propostas retornadas pertencem ao parceiro 1
      response.body.data.proposals.forEach(proposal => {
        expect(proposal.partner_id).toBe(1);
      });
    });
  });
  
  describe('GET /api/tow-proposals/:id', () => {
    it('deve retornar proposta específica', async () => {
      // Criar proposta de teste
      await global.testUtils.createTestEmergencyRequest();
      await global.testUtils.createTestPartner();
      
      const proposalData = {
        emergency_request_id: 1,
        partner_id: 1,
        estimated_value: 150.00,
        estimated_time_minutes: 30
      };
      
      const createResponse = await request(app)
        .post('/api/tow-proposals')
        .set('Authorization', `Bearer ${authToken}`)
        .send(proposalData)
        .expect(201);
      
      const proposalId = createResponse.body.data.id;
      
      const response = await request(app)
        .get(`/api/tow-proposals/${proposalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(proposalId);
      expect(response.body.data.emergency_request_id).toBe(1);
    });
    
    it('deve retornar 404 se proposta não existir', async () => {
      const response = await request(app)
        .get('/api/tow-proposals/999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });
  });
  
  describe('PATCH /api/tow-proposals/:id/status', () => {
    it('deve atualizar status da proposta', async () => {
      // Criar proposta de teste
      await global.testUtils.createTestEmergencyRequest();
      await global.testUtils.createTestPartner();
      
      const proposalData = {
        emergency_request_id: 1,
        partner_id: 1,
        estimated_value: 150.00,
        estimated_time_minutes: 30
      };
      
      const createResponse = await request(app)
        .post('/api/tow-proposals')
        .set('Authorization', `Bearer ${authToken}`)
        .send(proposalData)
        .expect(201);
      
      const proposalId = createResponse.body.data.id;
      
      const response = await request(app)
        .patch(`/api/tow-proposals/${proposalId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'accepted' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('accepted');
      expect(response.body.data.responded_at).toBeDefined();
    });
    
    it('deve validar status permitidos', async () => {
      const response = await request(app)
        .patch('/api/tow-proposals/1/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'invalid_status' })
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('validation');
    });
  });
  
  describe('GET /api/tow-proposals/stats', () => {
    it('deve retornar estatísticas das propostas', async () => {
      const response = await request(app)
        .get('/api/tow-proposals/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.total_proposals).toBeDefined();
      expect(response.body.data.pending_proposals).toBeDefined();
      expect(response.body.data.accepted_proposals).toBeDefined();
      expect(response.body.data.rejected_proposals).toBeDefined();
      expect(response.body.data.proposal_success_rate).toBeDefined();
    });
  });
  
  describe('DELETE /api/tow-proposals/:id', () => {
    it('deve deletar proposta', async () => {
      // Criar proposta de teste
      await global.testUtils.createTestEmergencyRequest();
      await global.testUtils.createTestPartner();
      
      const proposalData = {
        emergency_request_id: 1,
        partner_id: 1,
        estimated_value: 150.00,
        estimated_time_minutes: 30
      };
      
      const createResponse = await request(app)
        .post('/api/tow-proposals')
        .set('Authorization', `Bearer ${authToken}`)
        .send(proposalData)
        .expect(201);
      
      const proposalId = createResponse.body.data.id;
      
      const response = await request(app)
        .delete(`/api/tow-proposals/${proposalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted');
      
      // Verificar se foi deletado
      await request(app)
        .get(`/api/tow-proposals/${proposalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});
