const request = require('supertest');
const app = require('../../src/server');

describe('Delivery Orders API', () => {
  let authToken;
  
  beforeAll(async () => {
    // Criar token de teste para autenticação
    authToken = global.testUtils.generateTestToken(1, 'admin');
  });
  
  describe('POST /api/delivery-orders', () => {
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
        items: [
          {
            product_id: 1,
            name: 'Gasolina',
            price: 50.00,
            quantity: 1,
            total: 50.00
          }
        ],
        items_total: 50.00,
        items_count: 1,
        delivery_fee: 10.00,
        platform_fee: 5.00,
        motoboy_fee: 5.00,
        total_amount: 65.00,
        estimated_time_minutes: 30
      };
      
      const response = await request(app)
        .post('/api/delivery-orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData)
        .expect(201);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.order_type).toBe('fuel');
      expect(response.body.data.store_id).toBe(1);
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.total_amount).toBe('65.00');
    });
    
    it('deve validar dados obrigatórios', async () => {
      const invalidData = {
        order_type: 'fuel'
      };
      
      const response = await request(app)
        .post('/api/delivery-orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('validation');
    });
    
    it('deve requer autenticação', async () => {
      const orderData = {
        order_type: 'fuel',
        store_id: 1,
        customer_id: 1,
        pickup_address: 'Rua Teste, 123',
        pickup_latitude: -23.5505,
        pickup_longitude: -46.6333,
        delivery_address: 'Rua Destino, 456',
        delivery_latitude: -23.5605,
        delivery_longitude: -46.6433,
        items: [{ name: 'Gasolina', price: 50.00, quantity: 1 }],
        total_amount: 65.00
      };
      
      const response = await request(app)
        .post('/api/delivery-orders')
        .send(orderData)
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('unauthorized');
    });
  });
  
  describe('GET /api/delivery-orders', () => {
    it('deve listar ordens com paginação', async () => {
      const response = await request(app)
        .get('/api/delivery-orders')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.orders).toBeDefined();
      expect(Array.isArray(response.body.data.orders)).toBe(true);
      expect(response.body.data.pagination).toBeDefined();
    });
    
    it('deve filtrar por status', async () => {
      const response = await request(app)
        .get('/api/delivery-orders?status=pending')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      // Verificar se todas as ordens retornadas têm status 'pending'
      response.body.data.orders.forEach(order => {
        expect(order.status).toBe('pending');
      });
    });
    
    it('deve filtrar por tipo', async () => {
      const response = await request(app)
        .get('/api/delivery-orders?order_type=fuel')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      // Verificar se todas as ordens retornadas são do tipo 'fuel'
      response.body.data.orders.forEach(order => {
        expect(order.order_type).toBe('fuel');
      });
    });
    
    it('deve filtrar por motoboy', async () => {
      const response = await request(app)
        .get('/api/delivery-orders?motoboy_id=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      // Verificar se todas as ordens retornadas pertencem ao motoboy 1
      response.body.data.orders.forEach(order => {
        expect(order.motoboy_id).toBe(1);
      });
    });
  });
  
  describe('GET /api/delivery-orders/:id', () => {
    it('deve retornar ordem específica', async () => {
      // Criar ordem de teste
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
        items: [{ name: 'Gasolina', price: 50.00, quantity: 1 }],
        items_total: 50.00,
        items_count: 1,
        delivery_fee: 10.00,
        platform_fee: 5.00,
        motoboy_fee: 5.00,
        total_amount: 65.00
      };
      
      const createResponse = await request(app)
        .post('/api/delivery-orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData)
        .expect(201);
      
      const orderId = createResponse.body.data.id;
      
      const response = await request(app)
        .get(`/api/delivery-orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(orderId);
      expect(response.body.data.order_type).toBe('fuel');
    });
    
    it('deve retornar 404 se ordem não existir', async () => {
      const response = await request(app)
        .get('/api/delivery-orders/999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });
  });
  
  describe('PATCH /api/delivery-orders/:id/status', () => {
    it('deve atualizar status da ordem', async () => {
      // Criar ordem de teste
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
        items: [{ name: 'Gasolina', price: 50.00, quantity: 1 }],
        items_total: 50.00,
        items_count: 1,
        delivery_fee: 10.00,
        platform_fee: 5.00,
        motoboy_fee: 5.00,
        total_amount: 65.00
      };
      
      const createResponse = await request(app)
        .post('/api/delivery-orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData)
        .expect(201);
      
      const orderId = createResponse.body.data.id;
      
      const response = await request(app)
        .patch(`/api/delivery-orders/${orderId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          status: 'accepted',
          motoboy_id: 1,
          motoboy_name: 'Test Motoboy'
        })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('accepted');
      expect(response.body.data.motoboy_id).toBe(1);
      expect(response.body.data.accepted_at).toBeDefined();
    });
    
    it('deve validar status permitidos', async () => {
      const response = await request(app)
        .patch('/api/delivery-orders/1/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'invalid_status' })
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('validation');
    });
  });
  
  describe('POST /api/delivery-orders/:id/tracking', () => {
    it('deve adicionar ponto de rastreamento', async () => {
      // Criar ordem de teste
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
        items: [{ name: 'Gasolina', price: 50.00, quantity: 1 }],
        items_total: 50.00,
        items_count: 1,
        delivery_fee: 10.00,
        platform_fee: 5.00,
        motoboy_fee: 5.00,
        total_amount: 65.00
      };
      
      const createResponse = await request(app)
        .post('/api/delivery-orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData)
        .expect(201);
      
      const orderId = createResponse.body.data.id;
      
      const trackingData = {
        latitude: -23.5505,
        longitude: -46.6333,
        status: 'in_transit'
      };
      
      const response = await request(app)
        .post(`/api/delivery-orders/${orderId}/tracking`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(trackingData)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.tracking_history).toBeDefined();
      expect(Array.isArray(response.body.data.tracking_history)).toBe(true);
      expect(response.body.data.tracking_history).toHaveLength(1);
    });
  });
  
  describe('GET /api/delivery-orders/stats', () => {
    it('deve retornar estatísticas das ordens', async () => {
      const response = await request(app)
        .get('/api/delivery-orders/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.total_orders).toBeDefined();
      expect(response.body.data.pending_orders).toBeDefined();
      expect(response.body.data.accepted_orders).toBeDefined();
      expect(response.body.data.delivered_orders).toBeDefined();
      expect(response.body.data.average_delivery_time).toBeDefined();
      expect(response.body.data.delivery_success_rate).toBeDefined();
      expect(response.body.data.total_revenue).toBeDefined();
    });
  });
  
  describe('GET /api/delivery-orders/available', () => {
    it('deve retornar ordens disponíveis para motoboys', async () => {
      const response = await request(app)
        .get('/api/delivery-orders/available')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // Verificar se todas as ordens retornadas estão com status 'pending'
      response.body.data.forEach(order => {
        expect(order.status).toBe('pending');
      });
    });
  });
  
  describe('POST /api/delivery-orders/:id/rating', () => {
    it('deve adicionar avaliação à ordem', async () => {
      // Criar ordem de teste
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
        items: [{ name: 'Gasolina', price: 50.00, quantity: 1 }],
        items_total: 50.00,
        items_count: 1,
        delivery_fee: 10.00,
        platform_fee: 5.00,
        motoboy_fee: 5.00,
        total_amount: 65.00
      };
      
      const createResponse = await request(app)
        .post('/api/delivery-orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData)
        .expect(201);
      
      const orderId = createResponse.body.data.id;
      
      // Primeiro atualizar status para delivered
      await request(app)
        .patch(`/api/delivery-orders/${orderId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'delivered' });
      
      const ratingData = {
        rating: 5,
        comment: 'Excellent service!'
      };
      
      const response = await request(app)
        .post(`/api/delivery-orders/${orderId}/rating`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(ratingData)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.rating).toBe(5);
      expect(response.body.data.review_comment).toBe('Excellent service!');
      expect(response.body.data.reviewed_at).toBeDefined();
    });
  });
});
