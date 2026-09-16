const knex = require('knex');
const DeliveryOrder = require('../../src/models/DeliveryOrder');

// Valores monetários vêm como string no PostgreSQL (numeric) e como número no
// SQLite; a comparação normaliza para número e usa precisão controlada.
const expectMoney = (value, expected) => {
  expect(Number(value)).toBeCloseTo(expected, 2);
};

describe('DeliveryOrder Model', () => {
  let testDb;

  const createUser = async (overrides = {}) => {
    const [user] = await testDb('users').insert({
      name: 'Cliente Teste',
      phone: '5511999999999',
      ...overrides
    }).returning('*');
    return user;
  };

  const createPartner = async (overrides = {}) => {
    const [partner] = await testDb('partners').insert({
      user_id: 1,
      business_name: 'Motoboy Teste',
      phone: '5511988888888',
      ...overrides
    }).returning('*');
    return partner;
  };

  // Payload alinhado ao schema produtivo (migration 010).
  const orderData = (overrides = {}) => ({
    user_id: 1,
    type: 'fuel',
    items: JSON.stringify([{ name: 'Gasolina', quantity: 1, price: 50.0 }]),
    items_price: 50.0,
    delivery_fee: 10.0,
    total_price: 65.0,
    pickup_address: 'Rua Teste, 123',
    pickup_latitude: -23.5505,
    pickup_longitude: -46.6333,
    delivery_address: 'Rua Destino, 456',
    delivery_latitude: -23.5605,
    delivery_longitude: -46.6433,
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
      table.integer('total_reviews').defaultTo(0);
    });

    // Espelha as colunas usadas pelo modelo em produção.
    await testDb.schema.createTable('delivery_orders', (table) => {
      table.increments('id').primary();
      table.integer('user_id');
      table.integer('motoboy_id');
      table.string('type').notNullable();
      table.text('items');
      table.text('items_description');
      table.text('pickup_location');
      table.decimal('pickup_latitude', 10, 8);
      table.decimal('pickup_longitude', 11, 8);
      table.text('pickup_address');
      table.text('pickup_instructions');
      table.text('delivery_location');
      table.decimal('delivery_latitude', 10, 8);
      table.decimal('delivery_longitude', 11, 8);
      table.text('delivery_address');
      table.text('delivery_instructions');
      table.string('status').defaultTo('pending');
      table.decimal('delivery_fee', 10, 2);
      table.decimal('items_price', 10, 2);
      table.decimal('total_price', 10, 2);
      table.text('price_breakdown');
      table.datetime('accepted_at');
      table.datetime('picked_up_at');
      table.datetime('delivered_at');
      table.integer('estimated_delivery_minutes');
      table.integer('actual_delivery_minutes');
      table.text('fuel_info');
      table.text('parts_info');
      table.text('store_info');
      table.string('urgency').defaultTo('medium');
      table.boolean('is_urgent').defaultTo(false);
      table.string('payment_method').defaultTo('cash');
      table.string('payment_status').defaultTo('pending');
      table.datetime('paid_at');
      table.integer('rating');
      table.text('review_comment');
      table.datetime('reviewed_at');
      table.text('notes');
      table.text('delivery_proof');
      table.text('tracking_info');
      table.decimal('distance_km', 8, 2);
      table.integer('view_count').defaultTo(0);
      table.integer('response_count').defaultTo(0);
      table.timestamp('created_at').defaultTo(testDb.fn.now());
      table.timestamp('updated_at').defaultTo(testDb.fn.now());
    });

    DeliveryOrder.setDatabase(testDb);
  });

  afterAll(async () => {
    DeliveryOrder.resetDatabase();
    await testDb.destroy();
  });

  beforeEach(async () => {
    await testDb('delivery_orders').del();
    await testDb('partners').del();
    await testDb('users').del();

    await createUser({ id: 1, name: 'Cliente Teste' });
    await createPartner({ id: 1, user_id: 1, business_name: 'Motoboy Teste' });
  });

  describe('create', () => {
    it('deve criar uma nova ordem de delivery', async () => {
      const order = await DeliveryOrder.create(orderData());

      expect(order).toBeDefined();
      expect(order.id).toBeDefined();
      expect(order.type).toBe('fuel');
      expect(order.user_id).toBe(1);
      expect(order.status).toBe('pending');
      expectMoney(order.total_price, 65.0);
    });

    it('deve lançar erro se dados obrigatórios faltarem', async () => {
      const invalidData = {
        user_id: 1,
        total_price: 65.0
      };

      await expect(DeliveryOrder.create(invalidData))
        .rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('deve encontrar ordem por ID', async () => {
      const created = await DeliveryOrder.create(orderData());

      const found = await DeliveryOrder.findById(created.id);

      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
      expect(found.type).toBe('fuel');
      expect(found.user_name).toBe('Cliente Teste');
    });

    it('deve retornar null se ordem não existir', async () => {
      const found = await DeliveryOrder.findById(999);
      expect(found).toBeNull();
    });
  });

  describe('findByStatus', () => {
    it('deve encontrar ordens por status', async () => {
      await DeliveryOrder.create(orderData({ status: 'pending' }));

      const orders = await DeliveryOrder.findByStatus('pending');

      expect(orders).toHaveLength(1);
      expect(orders[0].status).toBe('pending');
    });
  });

  describe('findByMotoboy', () => {
    it('deve encontrar ordens por motoboy', async () => {
      await DeliveryOrder.create(orderData({ motoboy_id: 1 }));

      const result = await DeliveryOrder.findByMotoboy(1);

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0].motoboy_id).toBe(1);
      expect(result.total).toBe(1);
    });
  });

  describe('updateStatus', () => {
    it('deve atualizar status da ordem', async () => {
      const order = await DeliveryOrder.create(orderData());

      const updated = await DeliveryOrder.updateStatus(order.id, 'accepted', { motoboy_id: 1, motoboy_name: 'Test Motoboy' });

      expect(updated.status).toBe('accepted');
      expect(updated.motoboy_id).toBe(1);
      expect(updated.accepted_at).toBeDefined();
    });

    it('deve lançar erro se ordem não existir', async () => {
      await expect(DeliveryOrder.updateStatus(999, 'accepted'))
        .rejects.toThrow();
    });
  });

  describe('addTrackingPoint', () => {
    it('deve adicionar ponto de rastreamento', async () => {
      const order = await DeliveryOrder.create(orderData());

      const trackingPoint = {
        latitude: -23.5505,
        longitude: -46.6333,
        status: 'in_transit'
      };

      const updated = await DeliveryOrder.addTrackingPoint(order.id, trackingPoint);

      expect(updated.tracking_history).toBeDefined();
      expect(Array.isArray(updated.tracking_history)).toBe(true);
      expect(updated.tracking_history).toHaveLength(1);
      expect(updated.tracking_history[0].latitude).toBeCloseTo(-23.5505, 4);

      // O histórico fica persistido na coluna produtiva `tracking_info`.
      const persisted = await DeliveryOrder.findById(order.id);
      const stored = JSON.parse(persisted.tracking_info);
      expect(stored.tracking_history).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    it('deve retornar estatísticas das ordens', async () => {
      await DeliveryOrder.create(orderData({
        status: 'delivered',
        actual_delivery_minutes: 30,
        total_price: 65.0
      }));

      await DeliveryOrder.create(orderData({
        type: 'parts',
        items_price: 50.0,
        delivery_fee: 15.0,
        total_price: 72.5,
        status: 'pending'
      }));

      const stats = await DeliveryOrder.getStats();

      expect(stats.total_orders).toBe(2);
      expect(stats.pending_orders).toBe(1);
      expect(stats.delivered_orders).toBe(1);
      expect(stats.average_delivery_time).toBe(30);
      expect(stats.delivery_success_rate).toBe(50); // 1/2 * 100
      expectMoney(stats.total_revenue, 137.5);

      // Contrato produtivo preservado junto dos aliases legados.
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(1);
      expect(stats.delivered).toBe(1);
    });
  });
});
