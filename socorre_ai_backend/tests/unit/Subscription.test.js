const knex = require('knex');
const Subscription = require('../../src/models/Subscription');

// Valores monetários vêm como string no PostgreSQL (numeric) e como número no
// SQLite; a comparação normaliza para número e usa precisão controlada.
const expectMoney = (value, expected) => {
  expect(Number(value)).toBeCloseTo(expected, 2);
};

const isoDate = (value) => (
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
);

describe('Subscription Model', () => {
  let testDb;

  const dateOnly = (daysFromNow) => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toISOString().slice(0, 10);
  };

  // Payload alinhado ao schema produtivo (migration 024).
  const subscriptionData = (overrides = {}) => ({
    partner_id: 1,
    type: 'mecanico',
    monthly_fee: 99.9,
    due_date: '2024-01-31',
    next_billing_date: '2024-01-31',
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
      table.string('email');
      table.string('phone');
    });

    await testDb.schema.createTable('partners', (table) => {
      table.increments('id').primary();
      table.integer('user_id');
      table.string('business_name');
      table.string('type');
      table.string('phone');
    });

    // Espelha as colunas usadas pelo modelo em produção (migration 024).
    await testDb.schema.createTable('subscriptions', (table) => {
      table.increments('id').primary();
      table.integer('partner_id');
      table.string('type').notNullable();
      table.decimal('monthly_fee', 10, 2).notNullable();
      table.date('due_date').notNullable();
      table.date('next_billing_date').notNullable();
      table.string('status').defaultTo('pending_payment');
      table.string('payment_method');
      table.string('payment_gateway');
      table.string('gateway_subscription_id');
      table.boolean('auto_renew').defaultTo(true);
      table.text('billing_address');
      table.text('notes');
      table.integer('failed_attempts').defaultTo(0);
      table.timestamp('last_payment_attempt');
      table.timestamp('last_successful_payment');
      table.timestamp('created_at').defaultTo(testDb.fn.now());
      table.timestamp('updated_at').defaultTo(testDb.fn.now());
    });

    Subscription.setDatabase(testDb);
  });

  afterAll(async () => {
    Subscription.resetDatabase();
    await testDb.destroy();
  });

  beforeEach(async () => {
    await testDb('subscriptions').del();
    await testDb('partners').del();
    await testDb('users').del();

    await testDb('users').insert([
      { id: 1, name: 'Parceiro Teste', email: 'parceiro@teste.com' },
      { id: 2, name: 'Parceiro Dois', email: 'parceiro2@teste.com' }
    ]);
    await testDb('partners').insert([
      { id: 1, user_id: 1, business_name: 'Oficina Teste', type: 'mecanico' },
      { id: 2, user_id: 2, business_name: 'Posto Teste', type: 'posto_combustivel' }
    ]);
  });

  describe('create', () => {
    it('deve criar uma nova assinatura', async () => {
      const subscription = await Subscription.create(subscriptionData());

      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();
      expect(subscription.partner_id).toBe(1);
      expect(subscription.type).toBe('mecanico');
      expectMoney(subscription.monthly_fee, 99.9);
      // Default do schema produtivo (migration 024).
      expect(subscription.status).toBe('pending_payment');
    });

    it('deve lançar erro se dados obrigatórios faltarem', async () => {
      const invalidData = {
        monthly_fee: 99.9
      };

      await expect(Subscription.create(invalidData))
        .rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('deve encontrar assinatura por ID', async () => {
      const created = await Subscription.create(subscriptionData());

      const found = await Subscription.findById(created.id);

      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
      expect(found.partner_id).toBe(1);
      expect(found.business_name).toBe('Oficina Teste');
    });

    it('deve retornar null se assinatura não existir', async () => {
      const found = await Subscription.findById(999);
      expect(found).toBeNull();
    });
  });

  describe('findByPartner', () => {
    it('deve encontrar assinaturas por parceiro', async () => {
      await Subscription.create(subscriptionData());

      // Contrato produtivo: retorna a assinatura mais recente do parceiro.
      const subscription = await Subscription.findByPartner(1);

      expect(subscription).toBeDefined();
      expect(subscription.partner_id).toBe(1);
      expect(subscription.type).toBe('mecanico');
    });

    it('deve retornar null se parceiro não tiver assinatura', async () => {
      const subscription = await Subscription.findByPartner(999);
      expect(subscription).toBeNull();
    });
  });

  describe('findActive', () => {
    it('deve encontrar apenas assinaturas ativas', async () => {
      await Subscription.create(subscriptionData({
        partner_id: 1,
        type: 'mecanico',
        monthly_fee: 99.9,
        status: 'active'
      }));

      await Subscription.create(subscriptionData({
        partner_id: 2,
        type: 'posto_combustivel',
        monthly_fee: 199.9,
        status: 'cancelled'
      }));

      const activeSubscriptions = await Subscription.findActive();

      expect(activeSubscriptions).toHaveLength(1);
      expect(activeSubscriptions[0].status).toBe('active');
      expect(activeSubscriptions[0].partner_id).toBe(1);
    });
  });

  describe('updateStatus', () => {
    it('deve atualizar status da assinatura', async () => {
      const subscription = await Subscription.create(subscriptionData({ status: 'active' }));

      const updated = await Subscription.updateStatus(subscription.id, 'cancelled', 'Test cancellation');

      expect(updated.status).toBe('cancelled');
      expect(updated.notes).toBe('Test cancellation');
      expect(updated.auto_renew).toBeFalsy();
    });
  });

  describe('processPayment', () => {
    it('deve processar pagamento da assinatura', async () => {
      const nextBillingDate = dateOnly(30);
      const subscription = await Subscription.create(subscriptionData({
        status: 'pending_payment',
        failed_attempts: 1
      }));

      const updated = await Subscription.processPayment(subscription.id, nextBillingDate);

      expect(updated.last_successful_payment).toBeDefined();
      expect(isoDate(updated.next_billing_date)).toBe(nextBillingDate);
      expect(updated.failed_attempts).toBe(0);
      expect(updated.status).toBe('active');
    });
  });

  describe('findExpiringSoon', () => {
    it('deve encontrar assinaturas que expiram em breve', async () => {
      const soon = dateOnly(5); // 5 dias a partir de hoje

      await Subscription.create(subscriptionData({
        partner_id: 1,
        status: 'active',
        due_date: soon,
        next_billing_date: soon
      }));

      const expiringSoon = await Subscription.findExpiringSoon(7); // Próximos 7 dias

      expect(expiringSoon).toHaveLength(1);
      expect(expiringSoon[0].partner_id).toBe(1);
    });
  });

  describe('getStats', () => {
    it('deve retornar estatísticas das assinaturas', async () => {
      await Subscription.create(subscriptionData({
        partner_id: 1,
        type: 'mecanico',
        monthly_fee: 99.9,
        status: 'active'
      }));

      await Subscription.create(subscriptionData({
        partner_id: 2,
        type: 'posto_combustivel',
        monthly_fee: 199.9,
        status: 'expired'
      }));

      await Subscription.create(subscriptionData({
        partner_id: 3,
        type: 'auto_pecas',
        monthly_fee: 149.9,
        status: 'cancelled'
      }));

      const stats = await Subscription.getStats();

      expect(stats.total_subscriptions).toBe(3);
      expect(stats.active_subscriptions).toBe(1);
      expect(stats.expired_subscriptions).toBe(1);
      expect(stats.cancelled_subscriptions).toBe(1);
      expectMoney(stats.monthly_revenue, 99.9); // apenas assinaturas ativas
      expectMoney(stats.average_subscription_value, 149.9); // média das 3

      // Contrato produtivo preservado junto dos aliases legados.
      expect(stats.total).toBe(3);
      expect(stats.active).toBe(1);
      expect(stats.expired).toBe(1);
      expect(stats.cancelled).toBe(1);
    });
  });
});
