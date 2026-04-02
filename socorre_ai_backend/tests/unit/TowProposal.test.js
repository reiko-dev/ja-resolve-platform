const TowProposal = require('../../src/models/TowProposal');
const knex = require('knex');

describe('TowProposal Model', () => {
  let testDb;
  
  beforeAll(async () => {
    testDb = knex({
      client: 'sqlite3',
      connection: ':memory:',
      useNullAsDefault: true
    });
    
    // Criar tabela de testes
    await testDb.schema.createTable('tow_proposals', (table) => {
      table.increments('id').primary();
      table.integer('emergency_request_id').notNullable();
      table.integer('partner_id').notNullable();
      table.decimal('estimated_value', 10, 2).notNullable();
      table.integer('estimated_time_minutes').notNullable();
      table.text('notes');
      table.string('status').defaultTo('pending');
      table.timestamp('responded_at');
      table.timestamp('created_at').defaultTo(testDb.fn.now());
      table.timestamp('updated_at').defaultTo(testDb.fn.now());
    });
  });
  
  afterAll(async () => {
    await testDb.destroy();
  });
  
  beforeEach(async () => {
    await testDb('tow_proposals').del();
  });
  
  describe('create', () => {
    it('deve criar uma nova proposta de guincho', async () => {
      const proposalData = {
        emergency_request_id: 1,
        partner_id: 1,
        estimated_value: 150.00,
        estimated_time_minutes: 30,
        notes: 'Test proposal'
      };
      
      const proposal = await TowProposal.create(proposalData);
      
      expect(proposal).toBeDefined();
      expect(proposal.id).toBeDefined();
      expect(proposal.emergency_request_id).toBe(1);
      expect(proposal.partner_id).toBe(1);
      expect(proposal.estimated_value).toBe('150.00');
      expect(proposal.status).toBe('pending');
    });
    
    it('deve lançar erro se dados obrigatórios faltarem', async () => {
      const invalidData = {
        estimated_value: 150.00
      };
      
      await expect(TowProposal.create(invalidData))
        .rejects.toThrow();
    });
  });
  
  describe('findById', () => {
    it('deve encontrar proposta por ID', async () => {
      const proposalData = {
        emergency_request_id: 1,
        partner_id: 1,
        estimated_value: 150.00,
        estimated_time_minutes: 30
      };
      
      const created = await TowProposal.create(proposalData);
      const found = await TowProposal.findById(created.id);
      
      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
      expect(found.emergency_request_id).toBe(1);
    });
    
    it('deve retornar null se proposta não existir', async () => {
      const found = await TowProposal.findById(999);
      expect(found).toBeNull();
    });
  });
  
  describe('findByEmergencyRequest', () => {
    it('deve encontrar propostas por solicitação de emergência', async () => {
      const proposalData = {
        emergency_request_id: 1,
        partner_id: 1,
        estimated_value: 150.00,
        estimated_time_minutes: 30
      };
      
      await TowProposal.create(proposalData);
      
      const proposals = await TowProposal.findByEmergencyRequest(1);
      
      expect(proposals).toHaveLength(1);
      expect(proposals[0].emergency_request_id).toBe(1);
    });
    
    it('deve retornar array vazio se não houver propostas', async () => {
      const proposals = await TowProposal.findByEmergencyRequest(999);
      expect(proposals).toHaveLength(0);
    });
  });
  
  describe('findByPartner', () => {
    it('deve encontrar propostas por parceiro', async () => {
      const proposalData = {
        emergency_request_id: 1,
        partner_id: 1,
        estimated_value: 150.00,
        estimated_time_minutes: 30
      };
      
      await TowProposal.create(proposalData);
      
      const proposals = await TowProposal.findByPartner(1);
      
      expect(proposals).toHaveLength(1);
      expect(proposals[0].partner_id).toBe(1);
    });
  });
  
  describe('updateStatus', () => {
    it('deve atualizar status da proposta', async () => {
      const proposalData = {
        emergency_request_id: 1,
        partner_id: 1,
        estimated_value: 150.00,
        estimated_time_minutes: 30
      };
      
      const proposal = await TowProposal.create(proposalData);
      
      const updated = await TowProposal.updateStatus(proposal.id, 'accepted');
      
      expect(updated.status).toBe('accepted');
      expect(updated.responded_at).toBeDefined();
    });
    
    it('deve lançar erro se proposta não existir', async () => {
      await expect(TowProposal.updateStatus(999, 'accepted'))
        .rejects.toThrow();
    });
  });
  
  describe('delete', () => {
    it('deve deletar proposta', async () => {
      const proposalData = {
        emergency_request_id: 1,
        partner_id: 1,
        estimated_value: 150.00,
        estimated_time_minutes: 30
      };
      
      const proposal = await TowProposal.create(proposalData);
      
      const deleted = await TowProposal.delete(proposal.id);
      
      expect(deleted).toBe(true);
      
      const found = await TowProposal.findById(proposal.id);
      expect(found).toBeNull();
    });
    
    it('deve retornar false se proposta não existir', async () => {
      const deleted = await TowProposal.delete(999);
      expect(deleted).toBe(false);
    });
  });
  
  describe('getStats', () => {
    it('deve retornar estatísticas das propostas', async () => {
      // Criar propostas de teste
      await TowProposal.create({
        emergency_request_id: 1,
        partner_id: 1,
        estimated_value: 150.00,
        estimated_time_minutes: 30,
        status: 'pending'
      });
      
      await TowProposal.create({
        emergency_request_id: 2,
        partner_id: 1,
        estimated_value: 200.00,
        estimated_time_minutes: 45,
        status: 'accepted'
      });
      
      await TowProposal.create({
        emergency_request_id: 3,
        partner_id: 2,
        estimated_value: 100.00,
        estimated_time_minutes: 20,
        status: 'rejected'
      });
      
      const stats = await TowProposal.getStats();
      
      expect(stats.total_proposals).toBe(3);
      expect(stats.pending_proposals).toBe(1);
      expect(stats.accepted_proposals).toBe(1);
      expect(stats.rejected_proposals).toBe(1);
      expect(stats.average_response_time).toBeDefined();
      expect(stats.proposal_success_rate).toBe(33.33); // 1/3 * 100
    });
  });
});
