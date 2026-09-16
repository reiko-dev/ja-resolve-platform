/**
 * Dashboard — contrato ATUAL (`GET /api/dashboard/stats`).
 *
 * Histórico: a suíte original validava um dashboard legado que não existe mais
 * (rotas `/revenue/monthly`, `/partners/distribution`, `/services/status`,
 * `/subscriptions/status`, `/products/stock`, `/metrics/performance`,
 * `/recent-activity` e dezenas de campos). A única rota publicada hoje é
 * `GET /api/dashboard/stats` (admin), que responde com os agregados definidos em
 * `src/controllers/dashboardController.js`. Os testes abaixo refletem esse
 * contrato e usam fixtures determinísticas no SQLite de `tests/helpers/testDb.js`.
 */
jest.mock('../../src/config/database', () => require('../helpers/testDb').db);

const { api } = require('../helpers/api');
const {
  db,
  reset,
  createUser,
  createPartner,
  createEmergencyRequest,
} = require('../helpers/testDb');
const { createAuthedUser } = require('../helpers/auth');

// Campos publicados pelo contrato atual do dashboard.
const STATS_FIELDS = [
  'totalUsers', 'totalPartners', 'activeUsers',
  'totalPartnersNew', 'totalMechanics', 'totalMotoboys', 'totalStores',
  'verifiedPartners', 'availablePartners', 'onlinePartners', 'averagePartnerRating',
  'totalServices', 'availableServices',
  'totalEmergencyRequests', 'pendingEmergencyRequests', 'acceptedEmergencyRequests',
  'completedEmergencyRequests', 'inProgressEmergencyRequests',
  'totalDeliveryOrders', 'pendingDeliveryOrders', 'deliveredOrders',
  'totalPurchaseOrders', 'pendingPurchaseOrders', 'deliveredPurchaseOrders',
  'totalAppointments', 'pendingAppointments', 'completedAppointments', 'inProgressAppointments',
  'totalReviews', 'verifiedReviews',
  'totalRevenue', 'emergencyRevenue', 'deliveryRevenue', 'purchaseRevenue',
  'emergencyCompletionRate', 'deliveryCompletionRate', 'purchaseCompletionRate',
  'partnerVerificationRate', 'partnerOnlineRate',
];

// Rotas do dashboard legado removidas do backend.
const REMOVED_ROUTES = [
  '/api/dashboard/revenue/monthly',
  '/api/dashboard/partners/distribution',
  '/api/dashboard/services/status',
  '/api/dashboard/subscriptions/status',
  '/api/dashboard/products/stock',
  '/api/dashboard/metrics/performance',
  '/api/dashboard/recent-activity',
];

describe('Dashboard API', () => {
  let adminHeaders;
  let userHeaders;

  // Fixtures determinísticas: cada teste começa com o mesmo estado.
  beforeEach(async () => {
    await reset();

    const admin = await createAuthedUser({ role: 'admin', name: 'Admin Teste' });
    adminHeaders = admin.headers;

    const regular = await createAuthedUser({ role: 'user', name: 'Usuário Comum' });
    userHeaders = regular.headers;

    const mechanicUser = await createUser({ role: 'partner', name: 'Mecânico' });
    const motoboyUser = await createUser({ role: 'partner', name: 'Motoboy' });

    await createPartner({
      user_id: mechanicUser.id,
      type: 'mechanic',
      business_name: 'Oficina Teste',
      is_verified: 1,
      is_available: 1,
      is_online: 1,
      rating: 4.5,
    });
    await createPartner({
      user_id: motoboyUser.id,
      type: 'motoboy',
      business_name: 'Motoboy Teste',
      is_verified: 0,
      is_available: 1,
      is_online: 0,
    });

    await db('partner_services').insert({ partner_id: 1, name: 'Troca de óleo', is_available: 1 });
    await db('partner_services').insert({ partner_id: 1, name: 'Serviço inativo', is_available: 0 });

    await createEmergencyRequest({ user_id: regular.user.id, status: 'pending' });
    await createEmergencyRequest({ user_id: regular.user.id, status: 'completed', final_price: 100 });

    await db('delivery_orders').insert({ user_id: regular.user.id, status: 'delivered', total_price: 20 });
    await db('purchase_orders').insert({ user_id: regular.user.id, store_id: 1, status: 'delivered', total_price: 30 });
    await db('appointments').insert({ user_id: regular.user.id, status: 'pending' });
    await db('reviews').insert({ user_id: regular.user.id, partner_id: 1, rating: 5, is_verified: 1 });
  });

  describe('GET /api/dashboard/stats', () => {
    it('deve retornar as estatísticas agregadas do contrato atual', async () => {
      const response = await api()
        .get('/api/dashboard/stats')
        .set(adminHeaders)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Estatísticas carregadas com sucesso');

      const stats = response.body.data;
      for (const field of STATS_FIELDS) {
        expect(stats[field]).toBeDefined();
      }

      // Usuários e parceiros
      expect(stats.totalUsers).toBe(1);
      expect(stats.totalPartners).toBe(2);
      expect(stats.activeUsers).toBe(4);
      expect(stats.totalPartnersNew).toBe(2);
      expect(stats.totalMechanics).toBe(1);
      expect(stats.totalMotoboys).toBe(1);
      expect(stats.totalStores).toBe(0);
      expect(stats.verifiedPartners).toBe(1);
      expect(stats.availablePartners).toBe(2);
      expect(stats.onlinePartners).toBe(1);
      expect(stats.averagePartnerRating).toBe('2.3');

      // Serviços
      expect(stats.totalServices).toBe(2);
      expect(stats.availableServices).toBe(1);

      // Emergências
      expect(stats.totalEmergencyRequests).toBe(2);
      expect(stats.pendingEmergencyRequests).toBe(1);
      expect(stats.completedEmergencyRequests).toBe(1);
      expect(stats.emergencyRevenue).toBe(100);

      // Deliveries / compras / agendamentos / avaliações
      expect(stats.totalDeliveryOrders).toBe(1);
      expect(stats.deliveredOrders).toBe(1);
      expect(stats.totalPurchaseOrders).toBe(1);
      expect(stats.deliveredPurchaseOrders).toBe(1);
      expect(stats.totalAppointments).toBe(1);
      expect(stats.pendingAppointments).toBe(1);
      expect(stats.totalReviews).toBe(1);
      expect(stats.verifiedReviews).toBe(1);

      // Receita consolidada e taxas
      expect(stats.deliveryRevenue).toBe(20);
      expect(stats.purchaseRevenue).toBe(30);
      expect(stats.totalRevenue).toBe(150);
      expect(stats.emergencyCompletionRate).toBe(50);
      expect(stats.deliveryCompletionRate).toBe(100);
      expect(stats.purchaseCompletionRate).toBe(100);
      expect(stats.partnerVerificationRate).toBe(50);
      expect(stats.partnerOnlineRate).toBe(50);
    });

    it('deve exigir autenticação', async () => {
      const response = await api()
        .get('/api/dashboard/stats')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Token de acesso não fornecido');
    });

    it('deve rejeitar token inválido', async () => {
      const response = await api()
        .get('/api/dashboard/stats')
        .set({ Authorization: 'Bearer token-invalido' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Token inválido');
    });

    it('deve exigir papel de admin (403 para usuário comum)', async () => {
      const response = await api()
        .get('/api/dashboard/stats')
        .set(userHeaders)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Acesso negado. Permissão insuficiente.');
    });
  });

  describe('rotas do dashboard legado', () => {
    it('não estão mais publicadas (404 documentado)', async () => {
      for (const route of REMOVED_ROUTES) {
        const response = await api()
          .get(route)
          .set(adminHeaders)
          .expect(404);

        expect(response.body.success).toBe(false);
      }
    });
  });
});
