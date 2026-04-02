const knex = require('../config/database');

class DeliveryOrder {
  // Criar novo pedido de delivery
  static async create(orderData) {
    const [order] = await knex('delivery_orders').insert(orderData).returning('*');
    return order;
  }

  // Buscar por ID
  static async findById(id) {
    return await knex('delivery_orders')
      .select(
        'delivery_orders.*',
        'partners.business_name as store_name',
        'partners.phone as store_phone',
        'partners.address as store_address',
        'users.name as customer_name',
        'users.phone as customer_phone',
        'motoboy.business_name as motoboy_name',
        'motoboy.phone as motoboy_phone'
      )
      .leftJoin('partners', 'delivery_orders.store_id', 'partners.id')
      .leftJoin('users', 'delivery_orders.customer_id', 'users.id')
      .leftJoin('partners as motoboy', 'delivery_orders.motoboy_id', 'motoboy.id')
      .where('delivery_orders.id', id)
      .first();
  }

  // Buscar pedidos do cliente
  static async findByCustomer(customerId, status = null) {
    let query = knex('delivery_orders')
      .select(
        'delivery_orders.*',
        'partners.business_name as store_name',
        'partners.phone as store_phone'
      )
      .leftJoin('partners', 'delivery_orders.store_id', 'partners.id')
      .where('delivery_orders.customer_id', customerId);

    if (status) {
      query = query.where('delivery_orders.status', status);
    }

    return await query.order('delivery_orders.created_at', 'desc');
  }

  // Buscar pedidos disponíveis para motoboys (próximos)
  static async findAvailableForMotoboys(latitude, longitude, radius = 10, orderType = null) {
    let query = knex('delivery_orders')
      .select(
        'delivery_orders.*',
        'partners.business_name as store_name',
        'partners.address as store_address',
        'partners.latitude as store_latitude',
        'partners.longitude as store_longitude',
        'users.name as customer_name',
        knex.raw(`
          6371 * acos(
            cos(radians(?)) * cos(radians(pickup_latitude)) * 
            cos(radians(pickup_longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(pickup_latitude))
          ) AS pickup_distance_km
        `, [latitude, longitude, latitude])
      )
      .leftJoin('partners', 'delivery_orders.store_id', 'partners.id')
      .leftJoin('users', 'delivery_orders.customer_id', 'users.id')
      .where('delivery_orders.status', 'pending')
      .whereNull('delivery_orders.motoboy_id')
      .having('pickup_distance_km', '<=', radius);

    if (orderType) {
      query = query.where('delivery_orders.order_type', orderType);
    }

    return await query.order('pickup_distance_km', 'asc');
  }

  // Aceitar pedido (motoboy)
  static async accept(orderId, motoboyId) {
    const [order] = await knex('delivery_orders')
      .where('id', orderId)
      .where('status', 'pending')
      .whereNull('motoboy_id')
      .update({
        motoboy_id: motoboyId,
        status: 'accepted',
        accepted_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
      .returning('*');

    return order;
  }

  // Completar delivery
  static async complete(orderId, actualTimeMinutes = null) {
    const [order] = await knex('delivery_orders')
      .where('id', orderId)
      .where('status', 'in_transit')
      .update({
        status: 'delivered',
        delivered_at: knex.fn.now(),
        actual_time_minutes: actualTimeMinutes,
        updated_at: knex.fn.now()
      })
      .returning('*');

    return order;
  }

  // Cancelar pedido
  static async cancel(orderId, reason = null, cancelledBy = 'customer') {
    const [order] = await knex('delivery_orders')
      .where('id', orderId)
      .whereIn('status', ['pending', 'accepted'])
      .update({
        status: 'cancelled',
        cancelled_at: knex.fn.now(),
        cancellation_reason: reason,
        updated_at: knex.fn.now()
      })
      .returning('*');

    return order;
  }

  // Estatísticas
  static async getStats() {
    const stats = await knex('delivery_orders')
      .select(
        knex.raw('COUNT(*) as total'),
        knex.raw('COUNT(CASE WHEN status = "pending" THEN 1 END) as pending'),
        knex.raw('COUNT(CASE WHEN status = "delivered" THEN 1 END) as delivered'),
        knex.raw('COUNT(CASE WHEN order_type = "fuel" THEN 1 END) as fuel'),
        knex.raw('COUNT(CASE WHEN order_type = "auto_parts" THEN 1 END) as auto_parts'),
        knex.raw('SUM(total_amount) as total_revenue'),
        knex.raw('AVG(total_amount) as avg_order_value')
      )
      .first();

    return stats;
  }

  // Calcular distância entre dois pontos
  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}

module.exports = DeliveryOrder;
