const { createDatabaseAccessor } = require('./databaseAccessor');

const {
  accessor: knex,
  setDatabase: injectDatabase,
  resetDatabase: restoreDatabase,
} = createDatabaseAccessor();
const usesSqlite = () => knex.client.config.client === 'sqlite3';
const legacyOrder = (order) => order && ({ ...order,
  total_amount: order.total_amount == null ? order.total_amount : Number(order.total_amount).toFixed(2),
});

const Review = require('./Review');

class DeliveryOrder {
  // Injeção de banco para testes (SQLite em memória). O singleton de produção
  // permanece intacto e é restaurado por `resetDatabase`.
  static setDatabase(testDatabase) {
    injectDatabase(testDatabase);
    return this;
  }

  static resetDatabase() {
    restoreDatabase();
    return this;
  }

  // Criar nova ordem de entrega
  static async create(orderData) {
    const [order] = await knex('delivery_orders').insert(orderData).returning('*');
    return usesSqlite() ? legacyOrder(order) : order;
  }

  // Buscar por ID
  static async findById(id) {
    if (usesSqlite()) {
      return legacyOrder(await knex('delivery_orders')
        .select('delivery_orders.*', 'users.name as user_name', 'users.phone as user_phone',
          'partners.business_name as motoboy_name', 'partners.phone as motoboy_phone')
        .join('users', 'delivery_orders.user_id', 'users.id')
        .leftJoin('partners', 'delivery_orders.motoboy_id', 'partners.id')
        .where('delivery_orders.id', id).first() || null);
    }
    const order = await knex('delivery_orders')
      .select(
        'delivery_orders.*',
        'users.name as user_name',
        'users.phone as user_phone',
        'partners.business_name as motoboy_name',
        'partners.phone as motoboy_phone'
      )
      .join('users', 'delivery_orders.user_id', 'users.id')
      .leftJoin('partners', 'delivery_orders.motoboy_id', 'partners.id')
      .where('delivery_orders.id', id)
      .first();

    if (!order) return null;
    if (order.tracking_info) {
      const tracking = typeof order.tracking_info === 'string'
        ? JSON.parse(order.tracking_info)
        : order.tracking_info;
      order.tracking_history = tracking.tracking_history || tracking;
    }
    return order;
  }

  // Buscar ordens por usuário
  static async findByUser(userId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const [orders, total] = await Promise.all([
      knex('delivery_orders')
        .select(
          'delivery_orders.*',
          'partners.business_name as motoboy_name',
          'partners.phone as motoboy_phone'
        )
        .leftJoin('partners', 'delivery_orders.motoboy_id', 'partners.id')
        .where('delivery_orders.user_id', userId)
        .limit(limit)
        .offset(offset)
        .orderBy('delivery_orders.created_at', 'desc'),
      
      knex('delivery_orders')
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

  // Buscar ordens por motoboy
  static async findByMotoboy(motoboyId, page = 1, limit = 10) {
    if (usesSqlite()) {
      const [orders, totalRow] = await Promise.all([
        knex('delivery_orders').where('motoboy_id', motoboyId)
          .limit(limit).offset((page - 1) * limit).orderBy('created_at', 'desc'),
        knex('delivery_orders').where('motoboy_id', motoboyId).count('* as count').first(),
      ]);
      const total = Number(totalRow.count) || 0;
      return { orders: orders.map(legacyOrder), total, page, limit, totalPages: Math.ceil(total / limit) };
    }
    const offset = (page - 1) * limit;
    
    const [orders, total] = await Promise.all([
      knex('delivery_orders')
        .select(
          'delivery_orders.*',
          'users.name as user_name',
          'users.phone as user_phone'
        )
        .join('users', 'delivery_orders.user_id', 'users.id')
        .where('delivery_orders.motoboy_id', motoboyId)
        .limit(limit)
        .offset(offset)
        .orderBy('delivery_orders.created_at', 'desc'),
      
      knex('delivery_orders')
        .where('motoboy_id', motoboyId)
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

  // Listar ordens por status (contrato legado)
  static async findByStatus(status, { limit, offset } = {}) {
    let query = knex('delivery_orders')
      .select('delivery_orders.*')
      .where('delivery_orders.status', status)
      .orderBy('delivery_orders.created_at', 'desc');

    if (limit) query = query.limit(limit);
    if (offset) query = query.offset(offset);

    return await query;
  }

  // Atualizar status da ordem. Aceita `metadata` como string (observação, como
  // usado pelo controller legado) ou objeto com campos atualizáveis.
  static async updateStatus(id, status, metadata = {}) {
    const now = knex.fn.now();
    const patch = { status, updated_at: now };

    if (status === 'accepted') patch.accepted_at = now;
    if (status === 'picked_up') patch.picked_up_at = now;
    if (status === 'delivered') patch.delivered_at = now;

    if (typeof metadata === 'string') {
      patch.notes = metadata;
    } else if (metadata && typeof metadata === 'object') {
      const updatableFields = [
        'motoboy_id',
        'notes',
        'delivery_proof',
        'estimated_delivery_minutes',
        'actual_delivery_minutes',
        'payment_method',
        'payment_status',
        'tracking_info',
      ];

      updatableFields.forEach((field) => {
        if (metadata[field] !== undefined) patch[field] = metadata[field];
      });

      if (status === 'cancelled' && metadata.cancellation_reason) {
        patch.notes = metadata.cancellation_reason;
      }
    }

    const [order] = await knex('delivery_orders').where('id', id).update(patch).returning('*');
    if (!order) throw new Error(`Ordem ${id} não encontrada`);
    return order;
  }

  // Adicionar ponto de rastreamento. O histórico é persistido como JSON na
  // coluna `tracking_info` e devolvido também em `tracking_history`.
  static async addTrackingPoint(id, point) {
    const order = await knex('delivery_orders').where('id', id).first();
    if (!order) throw new Error(`Ordem ${id} não encontrada`);

    let stored = {};
    if (order.tracking_info) {
      stored = typeof order.tracking_info === 'string'
        ? JSON.parse(order.tracking_info)
        : order.tracking_info;

      if (Array.isArray(stored)) stored = { tracking_history: stored };
    }

    const history = Array.isArray(stored.tracking_history) ? stored.tracking_history : [];
    history.push({ ...point, timestamp: (point && point.timestamp) || new Date().toISOString() });

    const update = { tracking_info: JSON.stringify({ ...stored, tracking_history: history }), updated_at: knex.fn.now() };
    const [updated] = await knex('delivery_orders').where('id', id)
      .update(update)
      .returning('*');

    return { ...updated, tracking_history: history };
  }

  // Buscar ordens próximas (para motoboys)
  static async findNearby(latitude, longitude, radius = 20, type = null) {
    let query = knex('delivery_orders')
      .select(
        'delivery_orders.*',
        'users.name as user_name',
        'users.phone as user_phone',
        knex.raw(`
          6371 * acos(
            cos(radians(?)) * cos(radians(pickup_latitude)) * 
            cos(radians(pickup_longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(pickup_latitude))
          ) AS distance
        `, [latitude, longitude, latitude])
      )
      .join('users', 'delivery_orders.user_id', 'users.id')
      .where('delivery_orders.status', 'pending')
      .having('distance', '<=', radius)
      .orderBy('distance');

    if (type) {
      query = query.where('delivery_orders.type', type);
    }

    return await query;
  }

  // Aceitar ordem
  static async accept(id, motoboyId, estimatedTime) {
    const [order] = await knex('delivery_orders')
      .where('id', id)
      .where('status', 'pending')
      .update({
        motoboy_id: motoboyId,
        status: 'accepted',
        estimated_delivery_minutes: estimatedTime,
        accepted_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    return order;
  }

  // Marcar como coletado
  static async pickup(id) {
    const [order] = await knex('delivery_orders')
      .where('id', id)
      .where('status', 'accepted')
      .update({
        status: 'picked_up',
        picked_up_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    return order;
  }

  // Marcar como em trânsito
  static async inTransit(id) {
    const [order] = await knex('delivery_orders')
      .where('id', id)
      .where('status', 'picked_up')
      .update({
        status: 'in_transit',
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    return order;
  }

  // Marcar como entregue
  static async deliver(id, deliveryProof = null) {
    const [order] = await knex('delivery_orders')
      .where('id', id)
      .where('status', 'in_transit')
      .update({
        status: 'delivered',
        delivered_at: knex.fn.now(),
        delivery_proof: deliveryProof ? JSON.stringify(deliveryProof) : null,
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    return order;
  }

  // Cancelar ordem
  static async cancel(id, reason = null) {
    const [order] = await knex('delivery_orders')
      .where('id', id)
      .whereIn('status', ['pending', 'accepted'])
      .update({
        status: 'cancelled',
        notes: reason,
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    return order;
  }

  // Avaliar entrega
  static async rate(id, userId, rating, comment) {
    const [order] = await knex('delivery_orders')
      .where('id', id)
      .where('status', 'delivered')
      .update({
        rating,
        review_comment: comment,
        reviewed_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    if (order && order.motoboy_id) {
      await Review.upsertOperationalReview({
        user_id: userId,
        partner_id: order.motoboy_id,
        rating,
        comment,
        entity_type: 'delivery_order',
        entity_id: order.id
      });
    }
    
    return order;
  }

  // Atualizar rating do motoboy
  static async updateMotoboyRating(motoboyId) {
    const stats = await knex('delivery_orders')
      .where('motoboy_id', motoboyId)
      .where('rating', '>', 0)
      .select(
        knex.raw('AVG(rating) as avg_rating'),
        knex.raw('COUNT(*) as total_reviews')
      )
      .first();

    if (stats) {
      await knex('partners')
        .where('id', motoboyId)
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
    
    let query = knex('delivery_orders')
      .select(
        'delivery_orders.*',
        'users.name as user_name',
        'partners.business_name as motoboy_name'
      )
      .join('users', 'delivery_orders.user_id', 'users.id')
      .leftJoin('partners', 'delivery_orders.motoboy_id', 'partners.id');

    // Aplicar filtros
    if (filters.type) {
      query = query.where('delivery_orders.type', filters.type);
    }
    if (filters.status) {
      query = query.where('delivery_orders.status', filters.status);
    }
    if (filters.urgency) {
      query = query.where('delivery_orders.urgency', filters.urgency);
    }
    if (filters.date_from) {
      query = query.where('delivery_orders.created_at', '>=', filters.date_from);
    }
    if (filters.date_to) {
      query = query.where('delivery_orders.created_at', '<=', filters.date_to);
    }

    // Query para contar total
    const countQuery = knex('delivery_orders')
      .join('users', 'delivery_orders.user_id', 'users.id')
      .leftJoin('partners', 'delivery_orders.motoboy_id', 'partners.id');
    
    // Aplicar filtros na query de contagem
    if (filters.type) {
      countQuery.where('delivery_orders.type', filters.type);
    }
    if (filters.status) {
      countQuery.where('delivery_orders.status', filters.status);
    }
    if (filters.urgency) {
      countQuery.where('delivery_orders.urgency', filters.urgency);
    }
    if (filters.date_from) {
      countQuery.where('delivery_orders.created_at', '>=', filters.date_from);
    }
    if (filters.date_to) {
      countQuery.where('delivery_orders.created_at', '<=', filters.date_to);
    }

    const [orders, total] = await Promise.all([
      query.limit(limit).offset(offset).orderBy('delivery_orders.created_at', 'desc'),
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
    const stats = await knex('delivery_orders')
      .select(
        knex.raw('COUNT(*) as total'),
        knex.raw("COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending"),
        knex.raw("COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted"),
        knex.raw("COUNT(CASE WHEN status = 'picked_up' THEN 1 END) as picked_up"),
        knex.raw("COUNT(CASE WHEN status = 'in_transit' THEN 1 END) as in_transit"),
        knex.raw("COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered"),
        knex.raw("COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled"),
        knex.raw("COUNT(CASE WHEN type = 'fuel' THEN 1 END) as fuel"),
        knex.raw("COUNT(CASE WHEN type = 'parts' THEN 1 END) as parts"),
        knex.raw("COUNT(CASE WHEN type = 'food' THEN 1 END) as food"),
        knex.raw('AVG(total_price) as avg_price'),
        knex.raw('AVG(actual_delivery_minutes) as avg_delivery_time'),
        knex.raw('SUM(COALESCE(total_price, 0)) as total_revenue')
      )
      .first();

    const total = Number(stats.total) || 0;
    const pending = Number(stats.pending) || 0;
    const delivered = Number(stats.delivered) || 0;
    const averageDeliveryTime = stats.avg_delivery_time === null || stats.avg_delivery_time === undefined
      ? null
      : Number(stats.avg_delivery_time);

    return {
      ...stats,
      total,
      pending,
      delivered,
      avg_delivery_time: averageDeliveryTime,
      // Aliases de compatibilidade com o contrato legado do modelo.
      total_orders: total,
      pending_orders: pending,
      delivered_orders: delivered,
      average_delivery_time: averageDeliveryTime,
      delivery_success_rate: total ? Number(((delivered / total) * 100).toFixed(2)) : 0,
      total_revenue: Number(stats.total_revenue || 0).toFixed(2),
    };
  }
}

module.exports = DeliveryOrder;
