const Subscription = require('../../src/models/Subscription');
const knex = require('knex');

describe('Subscription Model', () => {
  let testDb;
  
  beforeAll(async () => {
    testDb = knex({
      client: 'sqlite3',
      connection: ':memory:',
      useNullAsDefault: true
    });
    
    // Criar tabela de testes
    await testDb.schema.createTable('subscriptions', (table) => {
      table.increments('id').primary();
      table.integer('partner_id').notNullable();
      table.string('type').notNullable();
      table.string('status').defaultTo('active');
      table.decimal('monthly_fee', 10, 2).notNullable();
      table.date('start_date').notNullable();
      table.date('end_date').notNullable();
      table.date('due_date');
      table.timestamp('cancelled_at');
      table.text('cancellation_reason');
      table.boolean('auto_renew').defaultTo(true);
      table.string('payment_method');
      table.timestamp('last_payment_at');
      table.decimal('last_payment_amount', 10, 2);
      table.integer('failed_payment_attempts').defaultTo(0);
      table.date('next_billing_date');
      table.json('features');
      table.timestamp('created_at').defaultTo(testDb.fn.now());
      table.timestamp('updated_at').defaultTo(testDb.fn.now());
    });
  });
  
  afterAll(async () => {
    await testDb.destroy();
  });
  
  beforeEach(async () => {
    await testDb('subscriptions').del();
  });
  
  describe('create', () => {
    it('deve criar uma nova assinatura', async () => {
      const subscriptionData = {
        partner_id: 1,
        type: 'mechanic',
        monthly_fee: 99.90,
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        due_date: '2024-01-31'
      };
      
      const subscription = await Subscription.create(subscriptionData);
      
      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();
      expect(subscription.partner_id).toBe(1);
      expect(subscription.type).toBe('mechanic');
      expect(subscription.monthly_fee).toBe('99.90');
      expect(subscription.status).toBe('active');
    });
    
    it('deve lançar erro se dados obrigatórios faltarem', async () => {
      const invalidData = {
        monthly_fee: 99.90
      };
      
      await expect(Subscription.create(invalidData))
        .rejects.toThrow();
    });
  });
  
  describe('findById', () => {
    it('deve encontrar assinatura por ID', async () => {
      const subscriptionData = {
        partner_id: 1,
        type: 'mechanic',
        monthly_fee: 99.90,
        start_date: '2024-01-01',
        end_date: '2024-12-31'
      };
      
      const created = await Subscription.create(subscriptionData);
      const found = await Subscription.findById(created.id);
      
      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
      expect(found.partner_id).toBe(1);
    });
    
    it('deve retornar null se assinatura não existir', async () => {
      const found = await Subscription.findById(999);
      expect(found).toBeNull();
    });
  });
  
  describe('findByPartner', () => {
    it('deve encontrar assinaturas por parceiro', async () => {
      const subscriptionData = {
        partner_id: 1,
        type: 'mechanic',
        monthly_fee: 99.90,
        start_date: '2024-01-01',
        end_date: '2024-12-31'
      };
      
      await Subscription.create(subscriptionData);
      
      const subscriptions = await Subscription.findByPartner(1);
      
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].partner_id).toBe(1);
    });
  });
  
  describe('findActive', () => {
    it('deve encontrar apenas assinaturas ativas', async () => {
      await Subscription.create({
        partner_id: 1,
        type: 'mechanic',
        monthly_fee: 99.90,
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        status: 'active'
      });
      
      await Subscription.create({
        partner_id: 2,
        type: 'gas_station',
        monthly_fee: 199.90,
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        status: 'cancelled'
      });
      
      const activeSubscriptions = await Subscription.findActive();
      
      expect(activeSubscriptions).toHaveLength(1);
      expect(activeSubscriptions[0].status).toBe('active');
    });
  });
  
  describe('updateStatus', () => {
    it('deve atualizar status da assinatura', async () => {
      const subscriptionData = {
        partner_id: 1,
        type: 'mechanic',
        monthly_fee: 99.90,
        start_date: '2024-01-01',
        end_date: '2024-12-31'
      };
      
      const subscription = await Subscription.create(subscriptionData);
      
      const updated = await Subscription.updateStatus(subscription.id, 'cancelled', 'Test cancellation');
      
      expect(updated.status).toBe('cancelled');
      expect(updated.cancelled_at).toBeDefined();
      expect(updated.cancellation_reason).toBe('Test cancellation');
    });
  });
  
  describe('processPayment', () => {
    it('deve processar pagamento da assinatura', async () => {
      const subscriptionData = {
        partner_id: 1,
        type: 'mechanic',
        monthly_fee: 99.90,
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        failed_payment_attempts: 1
      };
      
      const subscription = await Subscription.create(subscriptionData);
      
      const updated = await Subscription.processPayment(subscription.id, 99.90);
      
      expect(updated.last_payment_at).toBeDefined();
      expect(updated.last_payment_amount).toBe('99.90');
      expect(updated.failed_payment_attempts).toBe(0);
      expect(updated.next_billing_date).toBeDefined();
    });
  });
  
  describe('findExpiringSoon', () => {
    it('deve encontrar assinaturas que expiram em breve', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5); // 5 dias a partir de hoje
      
      await Subscription.create({
        partner_id: 1,
        type: 'mechanic',
        monthly_fee: 99.90,
        start_date: '2024-01-01',
        end_date: futureDate.toISOString().split('T')[0],
        status: 'active'
      });
      
      const expiringSoon = await Subscription.findExpiringSoon(7); // Próximos 7 dias
      
      expect(expiringSoon).toHaveLength(1);
      expect(expiringSoon[0].partner_id).toBe(1);
    });
  });
  
  describe('getStats', () => {
    it('deve retornar estatísticas das assinaturas', async () => {
      await Subscription.create({
        partner_id: 1,
        type: 'mechanic',
        monthly_fee: 99.90,
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        status: 'active'
      });
      
      await Subscription.create({
        partner_id: 2,
        type: 'gas_station',
        monthly_fee: 199.90,
        start_date: '2024-01-01',
        end_date: '2024-06-30',
        status: 'expired'
      });
      
      await Subscription.create({
        partner_id: 3,
        type: 'auto_parts',
        monthly_fee: 149.90,
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        status: 'cancelled'
      });
      
      const stats = await Subscription.getStats();
      
      expect(stats.total_subscriptions).toBe(3);
      expect(stats.active_subscriptions).toBe(1);
      expect(stats.expired_subscriptions).toBe(1);
      expect(stats.cancelled_subscriptions).toBe(1);
      expect(stats.monthly_revenue).toBe('99.90');
      expect(stats.average_subscription_value).toBe('149.90');
    });
  });
});
