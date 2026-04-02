const knex = require('../config/database');

class PurchaseOrder {
  // Criar novo pedido de compra
  static async create(orderData) {
    const [order] = await knex('purchase_orders').insert(orderData).returning('*');
    return order;
  }

  // Buscar por ID
  static async findById(id) {
    return await knex('purchase_orders')
      .select(
        'purchase_orders.*',
        'users.name as user_name',
        'users.phone as user_phone',
        'stores.business_name as store_name',
        'stores.phone as store_phone',
        'motoboys.business_name as motoboy_name',
        'motoboys.phone as motoboy_phone'
      )
      .join('users', 'purchase_orders.user_id', 'users.id')
      .leftJoin('partners as stores', 'purchase_orders.store_id', 'stores.id')
      .leftJoin('partners as motoboys', 'purchase_orders.delivery_motoboy_id', 'motoboys.id')
      .where('purchase_orders.id', id)
      .first();
  }

  // Buscar pedidos por usuário
  static async findByUser(userId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const [orders, total] = await Promise.all([
      knex('purchase_orders')
        .select(
          'purchase_orders.*',
          'stores.business_name as store_name',
          'motoboys.business_name as motoboy_name'
        )
        .leftJoin('partners as stores', 'purchase_orders.store_id', 'stores.id')
        .leftJoin('partners as motoboys', 'purchase_orders.delivery_motoboy_id', 'motoboys.id')
        .where('purchase_orders.user_id', userId)
        .limit(limit)
        .offset(offset)
        .orderBy('purchase_orders.created_at', 'desc'),
      
      knex('purchase_orders')
        .where('user_id', userId)
        .count('* as count')
        .first()
    ]);

    return {
      orders,
      total: total.count,
      page,
      limit,
      totalPages: Math.ceil(total.count / limit)
    };
  }

  // Buscar pedidos por loja
  static async findByStore(storeId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const [orders, total] = await Promise.all([
      knex('purchase_orders')
        .select(
          'purchase_orders.*',
          'users.name as user_name',
          'users.phone as user_phone',
          'motoboys.business_name as motoboy_name'
        )
        .join('users', 'purchase_orders.user_id', 'users.id')
        .leftJoin('partners as motoboys', 'purchase_orders.delivery_motoboy_id', 'motoboys.id')
        .where('purchase_orders.store_id', storeId)
        .limit(limit)
        .offset(offset)
        .orderBy('purchase_orders.created_at', 'desc'),
      
      knex('purchase_orders')
        .where('store_id', storeId)
        .count('* as count')
        .first()
    ]);

    return {
      orders,
      total: total.count,
      page,
      limit,
      totalPages: Math.ceil(total.count / limit)
    };
  }

  // Buscar pedidos por motoboy
  static async findByMotoboy(motoboyId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const [orders, total] = await Promise.all([
      knex('purchase_orders')
        .select(
          'purchase_orders.*',
          'users.name as user_name',
          'users.phone as user_phone',
          'stores.business_name as store_name'
        )
        .join('users', 'purchase_orders.user_id', 'users.id')
        .leftJoin('partners as stores', 'purchase_orders.store_id', 'stores.id')
        .where('purchase_orders.delivery_motoboy_id', motoboyId)
        .limit(limit)
        .offset(offset)
        .orderBy('purchase_orders.created_at', 'desc'),
      
      knex('purchase_orders')
        .where('delivery_motoboy_id', motoboyId)
        .count('* as count')
        .first()
    ]);

    return {
      orders,
      total: total.count,
      page,
      limit,
      totalPages: Math.ceil(total.count / limit)
    };
  }

  // Confirmar pedido
  static async confirm(id, estimatedDeliveryTime) {
    const [order] = await knex('purchase_orders')
      .where('id', id)
      .where('status', 'pending')
      .update({
        status: 'confirmed',
        estimated_delivery_minutes: estimatedDeliveryTime,
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    return order;
  }

  // Marcar como preparando
  static async preparing(id) {
    const [order] = await knex('purchase_orders')
      .where('id', id)
      .where('status', 'confirmed')
      .update({
        status: 'preparing',
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    return order;
  }

  // Marcar como pronto
  static async ready(id) {
    const [order] = await knex('purchase_orders')
      .where('id', id)
      .where('status', 'preparing')
      .update({
        status: 'ready',
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    return order;
  }

  // Atribuir motoboy
  static async assignMotoboy(id, motoboyId) {
    const [order] = await knex('purchase_orders')
      .where('id', id)
      .where('status', 'ready')
      .update({
        delivery_motoboy_id: motoboyId,
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    return order;
  }

  // Marcar como entregue
  static async deliver(id, deliveryProof = null) {
    const [order] = await knex('purchase_orders')
      .where('id', id)
      .where('status', 'ready')
      .update({
        status: 'delivered',
        delivered_at: knex.fn.now(),
        delivery_proof: deliveryProof ? JSON.stringify(deliveryProof) : null,
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    return order;
  }

  // Cancelar pedido
  static async cancel(id, reason = null) {
    const [order] = await knex('purchase_orders')
      .where('id', id)
      .whereIn('status', ['pending', 'confirmed', 'preparing'])
      .update({
        status: 'cancelled',
        notes: reason,
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    return order;
  }

  // Reembolsar pedido
  static async refund(id, reason = null) {
    const [order] = await knex('purchase_orders')
      .where('id', id)
      .whereIn('status', ['delivered', 'cancelled'])
      .update({
        status: 'refunded',
        notes: reason,
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    return order;
  }

  // Avaliar pedido
  static async rate(id, rating, comment) {
    const [order] = await knex('purchase_orders')
      .where('id', id)
      .where('status', 'delivered')
      .update({
        rating,
        review_comment: comment,
        reviewed_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    // Atualizar rating da loja
    if (order && order.store_id) {
      await this.updateStoreRating(order.store_id);
    }
    
    return order;
  }

  // Atualizar rating da loja
  static async updateStoreRating(storeId) {
    const stats = await knex('purchase_orders')
      .where('store_id', storeId)
      .where('rating', '>', 0)
      .select(
        knex.raw('AVG(rating) as avg_rating'),
        knex.raw('COUNT(*) as total_reviews')
      )
      .first();

    if (stats) {
      await knex('partners')
        .where('id', storeId)
        .update({
          rating: parseFloat(stats.avg_rating) || 0,
          total_reviews: stats.total_reviews || 0,
          updated_at: knex.fn.now()
        });
    }
  }

  // Buscar todas com filtros (admin)
  static async findAll(page = 1, limit = 10, filters = {}) {
    const offset = (page - 1) * limit;
    
    let query = knex('purchase_orders')
      .select(
        'purchase_orders.*',
        'users.name as user_name',
        'stores.business_name as store_name',
        'motoboys.business_name as motoboy_name'
      )
      .join('users', 'purchase_orders.user_id', 'users.id')
      .leftJoin('partners as stores', 'purchase_orders.store_id', 'stores.id')
      .leftJoin('partners as motoboys', 'purchase_orders.delivery_motoboy_id', 'motoboys.id');

    // Aplicar filtros
    if (filters.type) {
      query = query.where('purchase_orders.type', filters.type);
    }
    if (filters.status) {
      query = query.where('purchase_orders.status', filters.status);
    }
    if (filters.urgency) {
      query = query.where('purchase_orders.urgency', filters.urgency);
    }
    if (filters.date_from) {
      query = query.where('purchase_orders.created_at', '>=', filters.date_from);
    }
    if (filters.date_to) {
      query = query.where('purchase_orders.created_at', '<=', filters.date_to);
    }

    // Query para contar total
    const countQuery = knex('purchase_orders')
      .join('users', 'purchase_orders.user_id', 'users.id')
      .leftJoin('partners as stores', 'purchase_orders.store_id', 'stores.id')
      .leftJoin('partners as motoboys', 'purchase_orders.delivery_motoboy_id', 'motoboys.id');
    
    // Aplicar filtros na query de contagem
    if (filters.type) {
      countQuery.where('purchase_orders.type', filters.type);
    }
    if (filters.status) {
      countQuery.where('purchase_orders.status', filters.status);
    }
    if (filters.urgency) {
      countQuery.where('purchase_orders.urgency', filters.urgency);
    }
    if (filters.date_from) {
      countQuery.where('purchase_orders.created_at', '>=', filters.date_from);
    }
    if (filters.date_to) {
      countQuery.where('purchase_orders.created_at', '<=', filters.date_to);
    }

    const [orders, total] = await Promise.all([
      query.limit(limit).offset(offset).orderBy('purchase_orders.created_at', 'desc'),
      countQuery.count('* as count').first()
    ]);

    return {
      orders,
      total: total.count,
      page,
      limit,
      totalPages: Math.ceil(total.count / limit)
    };
  }

  // Estatísticas para dashboard
  static async getStats() {
    const stats = await knex('purchase_orders')
      .select(
        knex.raw('COUNT(*) as total'),
        knex.raw('COUNT(CASE WHEN status = "pending" THEN 1 END) as pending'),
        knex.raw('COUNT(CASE WHEN status = "confirmed" THEN 1 END) as confirmed'),
        knex.raw('COUNT(CASE WHEN status = "preparing" THEN 1 END) as preparing'),
        knex.raw('COUNT(CASE WHEN status = "ready" THEN 1 END) as ready'),
        knex.raw('COUNT(CASE WHEN status = "delivered" THEN 1 END) as delivered'),
        knex.raw('COUNT(CASE WHEN status = "cancelled" THEN 1 END) as cancelled'),
        knex.raw('COUNT(CASE WHEN status = "refunded" THEN 1 END) as refunded'),
        knex.raw('COUNT(CASE WHEN type = "emergency" THEN 1 END) as emergency'),
        knex.raw('COUNT(CASE WHEN type = "regular" THEN 1 END) as regular'),
        knex.raw('COUNT(CASE WHEN type = "scheduled" THEN 1 END) as scheduled'),
        knex.raw('SUM(CASE WHEN status = "delivered" THEN total_price ELSE 0 END) as total_revenue'),
        knex.raw('AVG(CASE WHEN status = "delivered" THEN total_price END) as avg_order_value')
      )
      .first();

    return stats;
  }
}

module.exports = PurchaseOrder;
