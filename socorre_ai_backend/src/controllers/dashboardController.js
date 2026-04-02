const db = require('../config/database');

const getDashboardStats = async (req, res) => {
  try {
    // Contar usuários por tipo
    const [usersCount] = await db('users').where('role', 'user').count('* as count');
    const [partnersCount] = await db('users').where('role', 'partner').count('* as count');
    const [activeUsersCount] = await db('users').where('is_active', true).count('* as count');

    // Contar parceiros (nova estrutura)
    const [totalPartnersCount] = await db('partners').count('* as count');
    const [mechanicsCount] = await db('partners').where('type', 'mechanic').count('* as count');
    const [motoboysCount] = await db('partners').where('type', 'motoboy').count('* as count');
    const [storesCount] = await db('partners').where('type', 'store').count('* as count');
    const [verifiedPartnersCount] = await db('partners').where('is_verified', true).count('* as count');
    const [availablePartnersCount] = await db('partners').where('is_available', true).count('* as count');
    const [onlinePartnersCount] = await db('partners').where('is_online', true).count('* as count');

    // Contar serviços
    const [servicesCount] = await db('partner_services').count('* as count');
    const [availableServicesCount] = await db('partner_services').where('is_available', true).count('* as count');

    // Contar solicitações de emergência
    const [emergencyRequestsCount] = await db('emergency_requests').count('* as count');
    const [pendingEmergencyCount] = await db('emergency_requests').where('status', 'pending').count('* as count');
    const [acceptedEmergencyCount] = await db('emergency_requests').where('status', 'accepted').count('* as count');
    const [completedEmergencyCount] = await db('emergency_requests').where('status', 'completed').count('* as count');
    const [inProgressEmergencyCount] = await db('emergency_requests').where('status', 'in_progress').count('* as count');

    // Contar ordens de entrega
    const [deliveryOrdersCount] = await db('delivery_orders').count('* as count');
    const [pendingDeliveryCount] = await db('delivery_orders').where('status', 'pending').count('* as count');
    const [deliveredCount] = await db('delivery_orders').where('status', 'delivered').count('* as count');

    // Contar pedidos de compra
    const [purchaseOrdersCount] = await db('purchase_orders').count('* as count');
    const [pendingPurchaseCount] = await db('purchase_orders').where('status', 'pending').count('* as count');
    const [deliveredPurchaseCount] = await db('purchase_orders').where('status', 'delivered').count('* as count');

    // Contar agendamentos (legado)
    const [appointmentsCount] = await db('appointments').count('* as count');
    const [pendingAppointmentsCount] = await db('appointments').where('status', 'pending').count('* as count');
    const [completedAppointmentsCount] = await db('appointments').where('status', 'completed').count('* as count');
    const [inProgressAppointmentsCount] = await db('appointments').where('status', 'in_progress').count('* as count');

    // Contar avaliações
    const [reviewsCount] = await db('reviews').count('* as count');
    const [verifiedReviewsCount] = await db('reviews').where('is_verified', true).count('* as count');

    // Calcular rating médio dos parceiros
    const [avgRating] = await db('partners').avg('rating as avg_rating');

    // Receita total (emergências + entregas + compras)
    const [emergencyRevenue] = await db('emergency_requests').where('status', 'completed').sum('final_price as total');
    const [deliveryRevenue] = await db('delivery_orders').where('status', 'delivered').sum('total_price as total');
    const [purchaseRevenue] = await db('purchase_orders').where('status', 'delivered').sum('total_price as total');

    // Estatísticas reais
    const realStats = {
      // Usuários
      totalUsers: parseInt(usersCount.count) || 0,
      totalPartners: parseInt(partnersCount.count) || 0,
      activeUsers: parseInt(activeUsersCount.count) || 0,
      
      // Parceiros (nova estrutura)
      totalPartnersNew: parseInt(totalPartnersCount.count) || 0,
      totalMechanics: parseInt(mechanicsCount.count) || 0,
      totalMotoboys: parseInt(motoboysCount.count) || 0,
      totalStores: parseInt(storesCount.count) || 0,
      verifiedPartners: parseInt(verifiedPartnersCount.count) || 0,
      availablePartners: parseInt(availablePartnersCount.count) || 0,
      onlinePartners: parseInt(onlinePartnersCount.count) || 0,
      averagePartnerRating: parseFloat(avgRating.avg_rating || 0).toFixed(1),
      
      // Serviços
      totalServices: parseInt(servicesCount.count) || 0,
      availableServices: parseInt(availableServicesCount.count) || 0,
      
      // Solicitações de emergência
      totalEmergencyRequests: parseInt(emergencyRequestsCount.count) || 0,
      pendingEmergencyRequests: parseInt(pendingEmergencyCount.count) || 0,
      acceptedEmergencyRequests: parseInt(acceptedEmergencyCount.count) || 0,
      completedEmergencyRequests: parseInt(completedEmergencyCount.count) || 0,
      inProgressEmergencyRequests: parseInt(inProgressEmergencyCount.count) || 0,
      
      // Ordens de entrega
      totalDeliveryOrders: parseInt(deliveryOrdersCount.count) || 0,
      pendingDeliveryOrders: parseInt(pendingDeliveryCount.count) || 0,
      deliveredOrders: parseInt(deliveredCount.count) || 0,
      
      // Pedidos de compra
      totalPurchaseOrders: parseInt(purchaseOrdersCount.count) || 0,
      pendingPurchaseOrders: parseInt(pendingPurchaseCount.count) || 0,
      deliveredPurchaseOrders: parseInt(deliveredPurchaseCount.count) || 0,
      
      // Agendamentos (legado)
      totalAppointments: parseInt(appointmentsCount.count) || 0,
      pendingAppointments: parseInt(pendingAppointmentsCount.count) || 0,
      completedAppointments: parseInt(completedAppointmentsCount.count) || 0,
      inProgressAppointments: parseInt(inProgressAppointmentsCount.count) || 0,
      
      // Avaliações
      totalReviews: parseInt(reviewsCount.count) || 0,
      verifiedReviews: parseInt(verifiedReviewsCount.count) || 0,
      
      // Receita
      totalRevenue: parseFloat(emergencyRevenue.total || 0) + 
                   parseFloat(deliveryRevenue.total || 0) + 
                   parseFloat(purchaseRevenue.total || 0),
      emergencyRevenue: parseFloat(emergencyRevenue.total || 0),
      deliveryRevenue: parseFloat(deliveryRevenue.total || 0),
      purchaseRevenue: parseFloat(purchaseRevenue.total || 0),
      
      // Métricas calculadas
      emergencyCompletionRate: emergencyRequestsCount.count > 0 ? 
        Math.round((completedEmergencyCount.count / emergencyRequestsCount.count) * 100) : 0,
      deliveryCompletionRate: deliveryOrdersCount.count > 0 ? 
        Math.round((deliveredCount.count / deliveryOrdersCount.count) * 100) : 0,
      purchaseCompletionRate: purchaseOrdersCount.count > 0 ? 
        Math.round((deliveredPurchaseCount.count / purchaseOrdersCount.count) * 100) : 0,
      partnerVerificationRate: totalPartnersCount.count > 0 ? 
        Math.round((verifiedPartnersCount.count / totalPartnersCount.count) * 100) : 0,
      partnerOnlineRate: totalPartnersCount.count > 0 ? 
        Math.round((onlinePartnersCount.count / totalPartnersCount.count) * 100) : 0
    };

    res.json({
      success: true,
      message: 'Estatísticas carregadas com sucesso',
      data: realStats
    });
  } catch (error) {
    console.error('Erro ao carregar estatísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

module.exports = {
  getDashboardStats
};
