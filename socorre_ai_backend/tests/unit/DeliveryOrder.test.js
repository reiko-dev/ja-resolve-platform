const DeliveryOrder = require('../../src/models/DeliveryOrder');
const knex = require('knex');

describe('DeliveryOrder Model', () => {
  let testDb;
  
  beforeAll(async () => {
    testDb = knex({
      client: 'sqlite3',
      connection: ':memory:',
      useNullAsDefault: true
    });
    
    // Criar tabelas de testes
    await testDb.schema.createTable('delivery_orders', (table) => {
      table.increments('id').primary();
      table.string('order_type').notNullable();
      table.integer('store_id').notNullable();
      table.string('store_name').notNullable();
      table.integer('customer_id').notNullable();
      table.integer('motoboy_id');
      table.string('motoboy_name');
      table.text('pickup_address').notNullable();
      table.decimal('pickup_latitude', 10, 8).notNullable();
      table.decimal('pickup_longitude', 11, 8).notNullable();
      table.text('delivery_address').notNullable();
      table.decimal('delivery_latitude', 10, 8).notNullable();
      table.decimal('delivery_longitude', 11, 8).notNullable();
      table.json('items');
      table.decimal('items_total', 10, 2).notNullable();
      table.integer('items_count').notNullable();
      table.decimal('delivery_fee', 10, 2).notNullable();
      table.decimal('platform_fee', 10, 2).notNullable();
      table.decimal('motoboy_fee', 10, 2).notNullable();
      table.decimal('total_amount', 10, 2).notNullable();
      table.string('status').defaultTo('pending');
      table.timestamp('accepted_at');
      table.timestamp('picked_up_at');
      table.timestamp('in_transit_at');
      table.timestamp('delivered_at');
      table.integer('estimated_time_minutes');
      table.integer('actual_time_minutes');
      table.text('customer_notes');
      table.text('motoboy_notes');
      table.text('cancellation_reason');
      table.string('payment_status').defaultTo('pending');
      table.json('tracking_history');
      table.decimal('distance_km', 10, 2);
      table.integer('rating');
      table.text('review_comment');
      table.timestamp('reviewed_at');
      table.timestamp('created_at').defaultTo(testDb.fn.now());
      table.timestamp('updated_at').defaultTo(testDb.fn.now());
    });
  });
  
  afterAll(async () => {
    await testDb.destroy();
  });
  
  beforeEach(async () => {
    await testDb('delivery_orders').del();
  });
  
  describe('create', () => {
    it('deve criar uma nova ordem de delivery', async () => {
      const orderData = {
        order_type: 'fuel',
        store_id: 1,
        store_name: 'Test Store',
        customer_id: 1,
        pickup_address: 'Rua Teste, 123',
        pickup_latitude: -23.5505,
        pickup_longitude: -46.6333,
        delivery_address: 'Rua Destino, 456',
        delivery_latitude: -23.5605,
        delivery_longitude: -46.6433,
        items: [{ name: 'Gasolina', quantity: 1, price: 50.00 }],
        items_total: 50.00,
        items_count: 1,
        delivery_fee: 10.00,
        platform_fee: 5.00,
        motoboy_fee: 5.00,
        total_amount: 65.00
      };
      
      const order = await DeliveryOrder.create(orderData);
      
      expect(order).toBeDefined();
      expect(order.id).toBeDefined();
      expect(order.order_type).toBe('fuel');
      expect(order.store_id).toBe(1);
      expect(order.status).toBe('pending');
      expect(order.total_amount).toBe('65.00');
    });
    
    it('deve lançar erro se dados obrigatórios faltarem', async () => {
      const invalidData = {
        order_type: 'fuel'
      };
      
      await expect(DeliveryOrder.create(invalidData))
        .rejects.toThrow();
    });
  });
  
  describe('findById', () => {
    it('deve encontrar ordem por ID', async () => {
      const orderData = {
        order_type: 'fuel',
        store_id: 1,
        store_name: 'Test Store',
        customer_id: 1,
        pickup_address: 'Rua Teste, 123',
        pickup_latitude: -23.5505,
        pickup_longitude: -46.6333,
        delivery_address: 'Rua Destino, 456',
        delivery_latitude: -23.5605,
        delivery_longitude: -46.6433,
        items: [{ name: 'Gasolina', quantity: 1, price: 50.00 }],
        items_total: 50.00,
        items_count: 1,
        delivery_fee: 10.00,
        platform_fee: 5.00,
        motoboy_fee: 5.00,
        total_amount: 65.00
      };
      
      const created = await DeliveryOrder.create(orderData);
      const found = await DeliveryOrder.findById(created.id);
      
      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
      expect(found.order_type).toBe('fuel');
    });
    
    it('deve retornar null se ordem não existir', async () => {
      const found = await DeliveryOrder.findById(999);
      expect(found).toBeNull();
    });
  });
  
  describe('findByStatus', () => {
    it('deve encontrar ordens por status', async () => {
      const orderData = {
        order_type: 'fuel',
        store_id: 1,
        store_name: 'Test Store',
        customer_id: 1,
        pickup_address: 'Rua Teste, 123',
        pickup_latitude: -23.5505,
        pickup_longitude: -46.6333,
        delivery_address: 'Rua Destino, 456',
        delivery_latitude: -23.5605,
        delivery_longitude: -46.6433,
        items: [{ name: 'Gasolina', quantity: 1, price: 50.00 }],
        items_total: 50.00,
        items_count: 1,
        delivery_fee: 10.00,
        platform_fee: 5.00,
        motoboy_fee: 5.00,
        total_amount: 65.00,
        status: 'pending'
      };
      
      await DeliveryOrder.create(orderData);
      
      const orders = await DeliveryOrder.findByStatus('pending');
      
      expect(orders).toHaveLength(1);
      expect(orders[0].status).toBe('pending');
    });
  });
  
  describe('findByMotoboy', () => {
    it('deve encontrar ordens por motoboy', async () => {
      const orderData = {
        order_type: 'fuel',
        store_id: 1,
        store_name: 'Test Store',
        customer_id: 1,
        motoboy_id: 1,
        motoboy_name: 'Test Motoboy',
        pickup_address: 'Rua Teste, 123',
        pickup_latitude: -23.5505,
        pickup_longitude: -46.6333,
        delivery_address: 'Rua Destino, 456',
        delivery_latitude: -23.5605,
        delivery_longitude: -46.6433,
        items: [{ name: 'Gasolina', quantity: 1, price: 50.00 }],
        items_total: 50.00,
        items_count: 1,
        delivery_fee: 10.00,
        platform_fee: 5.00,
        motoboy_fee: 5.00,
        total_amount: 65.00
      };
      
      await DeliveryOrder.create(orderData);
      
      const orders = await DeliveryOrder.findByMotoboy(1);
      
      expect(orders).toHaveLength(1);
      expect(orders[0].motoboy_id).toBe(1);
    });
  });
  
  describe('updateStatus', () => {
    it('deve atualizar status da ordem', async () => {
      const orderData = {
        order_type: 'fuel',
        store_id: 1,
        store_name: 'Test Store',
        customer_id: 1,
        pickup_address: 'Rua Teste, 123',
        pickup_latitude: -23.5505,
        pickup_longitude: -46.6333,
        delivery_address: 'Rua Destino, 456',
        delivery_latitude: -23.5605,
        delivery_longitude: -46.6433,
        items: [{ name: 'Gasolina', quantity: 1, price: 50.00 }],
        items_total: 50.00,
        items_count: 1,
        delivery_fee: 10.00,
        platform_fee: 5.00,
        motoboy_fee: 5.00,
        total_amount: 65.00
      };
      
      const order = await DeliveryOrder.create(orderData);
      
      const updated = await DeliveryOrder.updateStatus(order.id, 'accepted', { motoboy_id: 1, motoboy_name: 'Test Motoboy' });
      
      expect(updated.status).toBe('accepted');
      expect(updated.motoboy_id).toBe(1);
      expect(updated.accepted_at).toBeDefined();
    });
  });
  
  describe('addTrackingPoint', () => {
    it('deve adicionar ponto de rastreamento', async () => {
      const orderData = {
        order_type: 'fuel',
        store_id: 1,
        store_name: 'Test Store',
        customer_id: 1,
        pickup_address: 'Rua Teste, 123',
        pickup_latitude: -23.5505,
        pickup_longitude: -46.6333,
        delivery_address: 'Rua Destino, 456',
        delivery_latitude: -23.5605,
        delivery_longitude: -46.6433,
        items: [{ name: 'Gasolina', quantity: 1, price: 50.00 }],
        items_total: 50.00,
        items_count: 1,
        delivery_fee: 10.00,
        platform_fee: 5.00,
        motoboy_fee: 5.00,
        total_amount: 65.00
      };
      
      const order = await DeliveryOrder.create(orderData);
      
      const trackingPoint = {
        latitude: -23.5505,
        longitude: -46.6333,
        status: 'in_transit'
      };
      
      const updated = await DeliveryOrder.addTrackingPoint(order.id, trackingPoint);
      
      expect(updated.tracking_history).toBeDefined();
      expect(Array.isArray(updated.tracking_history)).toBe(true);
      expect(updated.tracking_history).toHaveLength(1);
    });
  });
  
  describe('getStats', () => {
    it('deve retornar estatísticas das ordens', async () => {
      await DeliveryOrder.create({
        order_type: 'fuel',
        store_id: 1,
        store_name: 'Test Store',
        customer_id: 1,
        pickup_address: 'Rua Teste, 123',
        pickup_latitude: -23.5505,
        pickup_longitude: -46.6333,
        delivery_address: 'Rua Destino, 456',
        delivery_latitude: -23.5605,
        delivery_longitude: -46.6433,
        items: [{ name: 'Gasolina', quantity: 1, price: 50.00 }],
        items_total: 50.00,
        items_count: 1,
        delivery_fee: 10.00,
        platform_fee: 5.00,
        motoboy_fee: 5.00,
        total_amount: 65.00,
        status: 'delivered',
        actual_time_minutes: 30
      });
      
      await DeliveryOrder.create({
        order_type: 'auto_parts',
        store_id: 2,
        store_name: 'Auto Parts Store',
        customer_id: 2,
        pickup_address: 'Rua Teste 2, 123',
        pickup_latitude: -23.5505,
        pickup_longitude: -46.6333,
        delivery_address: 'Rua Destino 2, 456',
        delivery_latitude: -23.5605,
        delivery_longitude: -46.6433,
        items: [{ name: 'Óleo', quantity: 2, price: 25.00 }],
        items_total: 50.00,
        items_count: 2,
        delivery_fee: 15.00,
        platform_fee: 7.50,
        motoboy_fee: 7.50,
        total_amount: 72.50,
        status: 'pending'
      });
      
      const stats = await DeliveryOrder.getStats();
      
      expect(stats.total_orders).toBe(2);
      expect(stats.pending_orders).toBe(1);
      expect(stats.delivered_orders).toBe(1);
      expect(stats.average_delivery_time).toBe(30);
      expect(stats.delivery_success_rate).toBe(50); // 1/2 * 100
      expect(stats.total_revenue).toBe('137.50');
    });
  });
});
