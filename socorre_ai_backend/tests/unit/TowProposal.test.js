const knex = require('knex');
const TowProposal = require('../../src/models/TowProposal');

// Valores monetários vêm como string no PostgreSQL (numeric) e como número no
// SQLite; a comparação normaliza para número e usa precisão controlada.
const expectMoney = (value, expected) => {
  expect(Number(value)).toBeCloseTo(expected, 2);
};

describe('TowProposal Model', () => {
  let testDb;

  const futureDate = (minutes = 30) => new Date(Date.now() + minutes * 60 * 1000);

  // Payload alinhado ao schema produtivo (migration 025).
  const proposalData = (overrides = {}) => ({
    emergency_request_id: 1,
    partner_id: 1,
    proposed_price: 150.0,
    estimated_time_minutes: 30,
    message: 'Test proposal',
    expires_at: futureDate(),
    ...overrides
  });

  beforeAll(async () => {
    testDb = knex({
      client: 'sqlite3',
      connection: ':memory:',
      useNullAsDefault: true
    });

    await testDb.schema.createTable('users', (table) => {
      table.increments('id').primary();
      table.string('name');
      table.string('phone');
    });

    await testDb.schema.createTable('partners', (table) => {
      table.increments('id').primary();
      table.integer('user_id');
      table.string('business_name');
      table.string('phone');
      table.decimal('rating', 3, 2);
      table.decimal('latitude', 10, 8);
      table.decimal('longitude', 11, 8);
    });

    await testDb.schema.createTable('emergency_requests', (table) => {
      table.increments('id').primary();
      table.integer('user_id');
      table.string('type');
      table.text('description');
      table.decimal('latitude', 10, 8);
      table.decimal('longitude', 11, 8);
      table.text('address');
      table.string('urgency').defaultTo('medium');
    });

    // Espelha as colunas usadas pelo modelo em produção (migration 025).
    await testDb.schema.createTable('tow_proposals', (table) => {
      table.increments('id').primary();
      table.integer('emergency_request_id');
      table.integer('partner_id');
      table.decimal('proposed_price', 10, 2).notNullable();
      table.integer('estimated_time_minutes').notNullable();
      table.text('message');
      table.string('tow_truck_type');
      table.integer('tow_capacity_kg');
      table.boolean('has_winch').defaultTo(false);
      table.text('equipment_details');
      table.string('status').defaultTo('pending');
      table.timestamp('expires_at').notNullable();
      table.timestamp('accepted_at');
      table.timestamp('responded_at');
      table.integer('view_count').defaultTo(0);
      table.timestamp('last_viewed_at');
      table.decimal('partner_distance_km', 5, 2);
      table.integer('partner_eta_minutes');
      table.timestamp('created_at').defaultTo(testDb.fn.now());
      table.timestamp('updated_at').defaultTo(testDb.fn.now());
    });

    // Mesma regra da migration 044: uma proposta pendente por parceiro/emergência.
    await testDb.raw(
      "CREATE UNIQUE INDEX tow_proposals_pending_unique ON tow_proposals (emergency_request_id, partner_id) WHERE status = 'pending'"
    );

    TowProposal.setDatabase(testDb);
  });

  afterAll(async () => {
    TowProposal.resetDatabase();
    await testDb.destroy();
  });

  beforeEach(async () => {
    await testDb('tow_proposals').del();
    await testDb('emergency_requests').del();
    await testDb('partners').del();
    await testDb('users').del();

    await testDb('users').insert([
      { id: 1, name: 'Cliente Teste', phone: '5511999999999' },
      { id: 2, name: 'Cliente Dois', phone: '5511977777777' }
    ]);
    await testDb('partners').insert([
      { id: 1, user_id: 1, business_name: 'Parceiro Teste', phone: '5511988888888' },
      { id: 2, user_id: 2, business_name: 'Parceiro Dois', phone: '5511966666666' }
    ]);
    await testDb('emergency_requests').insert([
      { id: 1, user_id: 1, type: 'tow', description: 'Emergência 1' },
      { id: 2, user_id: 1, type: 'tow', description: 'Emergência 2' },
      { id: 3, user_id: 2, type: 'tow', description: 'Emergência 3' }
    ]);
  });

  describe('create', () => {
    it('deve criar uma nova proposta de guincho', async () => {
      const proposal = await TowProposal.create(proposalData());

      expect(proposal).toBeDefined();
      expect(proposal.id).toBeDefined();
      expect(proposal.emergency_request_id).toBe(1);
      expect(proposal.partner_id).toBe(1);
      expectMoney(proposal.proposed_price, 150.0);
      expect(proposal.status).toBe('pending');
    });

    it('deve lançar erro se dados obrigatórios faltarem', async () => {
      const invalidData = {
        proposed_price: 150.0
      };

      await expect(TowProposal.create(invalidData))
        .rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('deve encontrar proposta por ID', async () => {
      const created = await TowProposal.create(proposalData());

      const found = await TowProposal.findById(created.id);

      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
      expect(found.emergency_request_id).toBe(1);
      expect(found.business_name).toBe('Parceiro Teste');
    });

    it('deve retornar null se proposta não existir', async () => {
      const found = await TowProposal.findById(999);
      expect(found).toBeNull();
    });
  });

  describe('findByEmergencyRequest', () => {
    it('deve encontrar propostas por solicitação de emergência', async () => {
      await TowProposal.create(proposalData());

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
      await TowProposal.create(proposalData());

      const proposals = await TowProposal.findByPartner(1);

      expect(proposals).toHaveLength(1);
      expect(proposals[0].partner_id).toBe(1);
      expect(proposals[0].user_name).toBe('Cliente Teste');
    });
  });

  describe('updateStatus', () => {
    it('deve atualizar status da proposta', async () => {
      const proposal = await TowProposal.create(proposalData());

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
      const proposal = await TowProposal.create(proposalData());

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
      await TowProposal.create(proposalData({
        emergency_request_id: 1,
        partner_id: 1,
        proposed_price: 150.0,
        estimated_time_minutes: 30,
        status: 'pending'
      }));

      await TowProposal.create(proposalData({
        emergency_request_id: 2,
        partner_id: 1,
        proposed_price: 200.0,
        estimated_time_minutes: 45,
        status: 'accepted'
      }));

      await TowProposal.create(proposalData({
        emergency_request_id: 3,
        partner_id: 2,
        proposed_price: 100.0,
        estimated_time_minutes: 20,
        status: 'rejected'
      }));

      const stats = await TowProposal.getStats();

      expect(stats.total_proposals).toBe(3);
      expect(stats.pending_proposals).toBe(1);
      expect(stats.accepted_proposals).toBe(1);
      expect(stats.rejected_proposals).toBe(1);
      expect(stats.average_response_time).toBeDefined();
      expect(stats.proposal_success_rate).toBe(33.33); // 1/3 * 100

      // Contrato produtivo preservado junto dos aliases legados.
      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(1);
      expect(stats.accepted).toBe(1);
      expect(stats.rejected).toBe(1);
    });
  });
});
