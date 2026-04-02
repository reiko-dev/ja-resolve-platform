const request = require('supertest');
const app = require('../../src/server');

describe('Dashboard API', () => {
  let authToken;
  
  beforeAll(async () => {
    // Criar token de teste para autenticação
    authToken = global.testUtils.generateTestToken(1, 'admin');
  });
  
  describe('GET /api/dashboard/stats', () => {
    it('deve retornar estatísticas completas do dashboard', async () => {
      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      
      const stats = response.body.data;
      
      // Verificar estatísticas de usuários
      expect(stats.totalUsers).toBeDefined();
      expect(stats.totalPartnersNew).toBeDefined();
      expect(stats.activeUsers).toBeDefined();
      
      // Verificar estatísticas de parceiros
      expect(stats.totalMechanics).toBeDefined();
      expect(stats.totalMotoboys).toBeDefined();
      expect(stats.totalStores).toBeDefined();
      expect(stats.verifiedPartners).toBeDefined();
      expect(stats.availablePartners).toBeDefined();
      expect(stats.onlinePartners).toBeDefined();
      expect(stats.averagePartnerRating).toBeDefined();
      
      // Verificar estatísticas de serviços
      expect(stats.totalServices).toBeDefined();
      expect(stats.availableServices).toBeDefined();
      
      // Verificar estatísticas de emergências
      expect(stats.totalEmergencyRequests).toBeDefined();
      expect(stats.pendingEmergencyRequests).toBeDefined();
      expect(stats.acceptedEmergencyRequests).toBeDefined();
      expect(stats.completedEmergencyRequests).toBeDefined();
      expect(stats.inProgressEmergencyRequests).toBeDefined();
      
      // Verificar estatísticas de propostas de guincho
      expect(stats.totalTowProposals).toBeDefined();
      expect(stats.pendingTowProposals).toBeDefined();
      expect(stats.acceptedTowProposals).toBeDefined();
      expect(stats.rejectedTowProposals).toBeDefined();
      expect(stats.averageProposalResponseTime).toBeDefined();
      expect(stats.proposalSuccessRate).toBeDefined();
      
      // Verificar estatísticas de deliveries
      expect(stats.totalDeliveryOrders).toBeDefined();
      expect(stats.pendingDeliveryOrders).toBeDefined();
      expect(stats.acceptedDeliveryOrders).toBeDefined();
      expect(stats.pickedUpDeliveryOrders).toBeDefined();
      expect(stats.inTransitDeliveryOrders).toBeDefined();
      expect(stats.deliveredDeliveryOrders).toBeDefined();
      expect(stats.cancelledDeliveryOrders).toBeDefined();
      expect(stats.averageDeliveryTime).toBeDefined();
      expect(stats.deliverySuccessRate).toBeDefined();
      
      // Verificar estatísticas de assinaturas
      expect(stats.totalSubscriptions).toBeDefined();
      expect(stats.activeSubscriptions).toBeDefined();
      expect(stats.expiredSubscriptions).toBeDefined();
      expect(stats.cancelledSubscriptions).toBeDefined();
      expect(stats.pendingPaymentSubscriptions).toBeDefined();
      expect(stats.expiringSoonSubscriptions).toBeDefined();
      expect(stats.subscriptionRevenue).toBeDefined();
      
      // Verificar estatísticas de produtos
      expect(stats.totalProducts).toBeDefined();
      expect(stats.activeProducts).toBeDefined();
      expect(stats.lowStockProducts).toBeDefined();
      expect(stats.outOfStockProducts).toBeDefined();
      expect(stats.featuredProducts).toBeDefined();
      
      // Verificar estatísticas de receita
      expect(stats.totalRevenue).toBeDefined();
      expect(stats.emergencyRevenue).toBeDefined();
      expect(stats.deliveryRevenue).toBeDefined();
      expect(stats.purchaseRevenue).toBeDefined();
      expect(stats.subscriptionRevenue).toBeDefined();
      expect(stats.proposalRevenue).toBeDefined();
      expect(stats.productRevenue).toBeDefined();
      
      // Verificar métricas calculadas
      expect(stats.emergencyCompletionRate).toBeDefined();
      expect(stats.deliveryCompletionRate).toBeDefined();
      expect(stats.purchaseCompletionRate).toBeDefined();
      expect(stats.partnerVerificationRate).toBeDefined();
      expect(stats.partnerOnlineRate).toBeDefined();
      
      // Verificar novas métricas
      expect(stats.averageProposalValue).toBeDefined();
      expect(stats.averageDeliveryValue).toBeDefined();
      expect(stats.averageSubscriptionValue).toBeDefined();
      expect(stats.partnerSatisfactionScore).toBeDefined();
      expect(stats.systemHealthScore).toBeDefined();
    });
    
    it('deve requer autenticação', async () => {
      const response = await request(app)
        .get('/api/dashboard/stats')
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('unauthorized');
    });
    
    it('deve requer papel de admin', async () => {
      const userToken = global.testUtils.generateTestToken(1, 'user');
      
      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('forbidden');
    });
  });
  
  describe('GET /api/dashboard/revenue/monthly', () => {
    it('deve retornar receita mensal', async () => {
      const response = await request(app)
        .get('/api/dashboard/revenue/monthly')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // Verificar estrutura dos dados mensais
      if (response.body.data.length > 0) {
        const monthData = response.body.data[0];
        expect(monthData.month).toBeDefined();
        expect(monthData.year).toBeDefined();
        expect(monthData.emergency).toBeDefined();
        expect(monthData.delivery).toBeDefined();
        expect(monthData.subscription).toBeDefined();
        expect(monthData.product).toBeDefined();
        expect(monthData.proposal).toBeDefined();
        expect(monthData.total).toBeDefined();
      }
    });
  });
  
  describe('GET /api/dashboard/partners/distribution', () => {
    it('deve retornar distribuição de parceiros', async () => {
      const response = await request(app)
        .get('/api/dashboard/partners/distribution')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // Verificar estrutura dos dados de distribuição
      if (response.body.data.length > 0) {
        const typeData = response.body.data[0];
        expect(typeData.type).toBeDefined();
        expect(typeData.count).toBeDefined();
        expect(typeData.percentage).toBeDefined();
        expect(['mechanic', 'motoboy', 'gas_station', 'auto_parts', 'tow']).toContain(typeData.type);
      }
    });
  });
  
  describe('GET /api/dashboard/services/status', () => {
    it('deve retornar status dos serviços', async () => {
      const response = await request(app)
        .get('/api/dashboard/services/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      
      const serviceStatus = response.body.data;
      
      // Verificar estrutura dos status de emergências
      expect(serviceStatus.emergency).toBeDefined();
      expect(serviceStatus.emergency.pending).toBeDefined();
      expect(serviceStatus.emergency.in_progress).toBeDefined();
      expect(serviceStatus.emergency.completed).toBeDefined();
      expect(serviceStatus.emergency.cancelled).toBeDefined();
      
      // Verificar estrutura dos status de deliveries
      expect(serviceStatus.delivery).toBeDefined();
      expect(serviceStatus.delivery.pending).toBeDefined();
      expect(serviceStatus.delivery.accepted).toBeDefined();
      expect(serviceStatus.delivery.picked_up).toBeDefined();
      expect(serviceStatus.delivery.in_transit).toBeDefined();
      expect(serviceStatus.delivery.delivered).toBeDefined();
      expect(serviceStatus.delivery.cancelled).toBeDefined();
      
      // Verificar estrutura das propostas
      expect(serviceStatus.proposals).toBeDefined();
      expect(serviceStatus.proposals.pending).toBeDefined();
      expect(serviceStatus.proposals.accepted).toBeDefined();
      expect(serviceStatus.proposals.rejected).toBeDefined();
    });
  });
  
  describe('GET /api/dashboard/subscriptions/status', () => {
    it('deve retornar status das assinaturas', async () => {
      const response = await request(app)
        .get('/api/dashboard/subscriptions/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      
      const subscriptionStatus = response.body.data;
      
      expect(subscriptionStatus.active).toBeDefined();
      expect(subscriptionStatus.expired).toBeDefined();
      expect(subscriptionStatus.cancelled).toBeDefined();
      expect(subscriptionStatus.pending_payment).toBeDefined();
      expect(subscriptionStatus.suspended).toBeDefined();
    });
  });
  
  describe('GET /api/dashboard/products/stock', () => {
    it('deve retornar status de estoque de produtos', async () => {
      const response = await request(app)
        .get('/api/dashboard/products/stock')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      
      const stockStatus = response.body.data;
      
      expect(stockStatus.total).toBeDefined();
      expect(stockStatus.active).toBeDefined();
      expect(stockStatus.low_stock).toBeDefined();
      expect(stockStatus.out_of_stock).toBeDefined();
      expect(stockStatus.featured).toBeDefined();
    });
  });
  
  describe('GET /api/dashboard/metrics/performance', () => {
    it('deve retornar métricas de performance', async () => {
      const response = await request(app)
        .get('/api/dashboard/metrics/performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      
      const performance = response.body.data;
      
      expect(performance.average_response_time).toBeDefined();
      expect(performance.average_completion_time).toBeDefined();
      expect(performance.partner_efficiency).toBeDefined();
      expect(performance.customer_satisfaction).toBeDefined();
      expect(performance.system_uptime).toBeDefined();
      expect(performance.error_rate).toBeDefined();
    });
  });
  
  describe('GET /api/dashboard/recent-activity', () => {
    it('deve retornar atividades recentes', async () => {
      const response = await request(app)
        .get('/api/dashboard/recent-activity')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // Verificar estrutura das atividades recentes
      if (response.body.data.length > 0) {
        const activity = response.body.data[0];
        expect(activity.type).toBeDefined();
        expect(activity.description).toBeDefined();
        expect(activity.timestamp).toBeDefined();
        expect(activity.entity_id).toBeDefined();
        expect(['user', 'partner', 'emergency_request', 'delivery_order', 'subscription', 'product']).toContain(activity.type);
      }
    });
  });
});
