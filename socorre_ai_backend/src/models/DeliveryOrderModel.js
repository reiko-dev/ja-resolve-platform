const knex = require('../config/database');
const SystemSettings = require('./SystemSettings');
const Review = require('./Review');

class DeliveryOrder {
  static baseSelect() {
    return [
      'delivery_orders.*',
      knex.raw('delivery_orders.user_id as customer_id'),
      knex.raw('delivery_orders.type as order_type'),
      knex.raw('delivery_orders.estimated_delivery_minutes as estimated_time_minutes'),
      knex.raw('delivery_orders.actual_delivery_minutes as actual_time_minutes'),
      'users.name as customer_name',
      'users.phone as customer_phone',
      'motoboy.business_name as motoboy_name',
      'motoboy.phone as motoboy_phone',
      knex.raw("store_info::json->>'id' as store_id"),
      knex.raw("store_info::json->>'business_name' as store_name"),
      knex.raw("store_info::json->>'phone' as store_phone"),
      knex.raw("store_info::json->>'address' as store_address")
    ];
  }

  static async create(orderData) {
    const [order] = await knex('delivery_orders').insert(orderData).returning('*');
    return this.findById(order.id);
  }

  static async findById(id) {
    return await knex('delivery_orders')
      .select(this.baseSelect())
      .leftJoin('users', 'delivery_orders.user_id', 'users.id')
      .leftJoin('partners as motoboy', 'delivery_orders.motoboy_id', 'motoboy.id')
      .where('delivery_orders.id', id)
      .first();
  }

  static async findByCustomer(customerId, status = null) {
    let query = knex('delivery_orders')
      .select(this.baseSelect())
      .leftJoin('users', 'delivery_orders.user_id', 'users.id')
      .leftJoin('partners as motoboy', 'delivery_orders.motoboy_id', 'motoboy.id')
      .where('delivery_orders.user_id', customerId);

    if (status) {
      query = query.where('delivery_orders.status', status);
    }

    return await query.orderBy('delivery_orders.created_at', 'desc');
  }

  static async findByStore(storeId, status = null) {
    let query = knex('delivery_orders')
      .select(this.baseSelect())
      .leftJoin('users', 'delivery_orders.user_id', 'users.id')
      .leftJoin('partners as motoboy', 'delivery_orders.motoboy_id', 'motoboy.id')
      .whereRaw("store_info::json->>'id' = ?", [String(storeId)]);

    if (status) {
      query = query.where('delivery_orders.status', status);
    }

    return await query.orderBy('delivery_orders.created_at', 'desc');
  }

  static async findByPurchaseOrderId(purchaseOrderId) {
    return await knex('delivery_orders')
      .select(this.baseSelect())
      .leftJoin('users', 'delivery_orders.user_id', 'users.id')
      .leftJoin('partners as motoboy', 'delivery_orders.motoboy_id', 'motoboy.id')
      .whereRaw("COALESCE(delivery_orders.price_breakdown::json->>'purchase_order_id', '') = ?", [String(purchaseOrderId)])
      .orderBy('delivery_orders.created_at', 'desc')
      .first();
  }

  static async findByMotoboy(motoboyId, status = null, options = {}) {
    const { page, limit, startDate, endDate } = options;
    let query = knex('delivery_orders')
      .select(this.baseSelect())
      .leftJoin('users', 'delivery_orders.user_id', 'users.id')
      .leftJoin('partners as motoboy', 'delivery_orders.motoboy_id', 'motoboy.id')
      .where('delivery_orders.motoboy_id', motoboyId);

    if (status) {
      query = query.where('delivery_orders.status', status);
    }

    if (startDate) {
      query = query.where('delivery_orders.created_at', '>=', startDate);
    }

    if (endDate) {
      query = query.where('delivery_orders.created_at', '<=', endDate);
    }

    query = query.orderBy('delivery_orders.created_at', 'desc');

    if (!page || !limit) {
      return await query;
    }

    const currentPage = parseInt(page, 10);
    const currentLimit = parseInt(limit, 10);
    const offset = (currentPage - 1) * currentLimit;

    const countQuery = knex('delivery_orders')
      .where('delivery_orders.motoboy_id', motoboyId);

    if (status) {
      countQuery.where('delivery_orders.status', status);
    }

    if (startDate) {
      countQuery.where('delivery_orders.created_at', '>=', startDate);
    }

    if (endDate) {
      countQuery.where('delivery_orders.created_at', '<=', endDate);
    }

    const [orders, total] = await Promise.all([
      query.limit(currentLimit).offset(offset),
      countQuery.count('* as count').first()
    ]);

    return {
      orders,
      total: parseInt(total.count, 10) || 0,
      page: currentPage,
      limit: currentLimit,
      totalPages: Math.ceil((parseInt(total.count, 10) || 0) / currentLimit)
    };
  }

  static async findAvailableForMotoboys(latitude, longitude, radius = 10, orderType = null) {
    const distanceExpression = `
      6371 * acos(
        cos(radians(?)) * cos(radians(pickup_latitude)) *
        cos(radians(pickup_longitude) - radians(?)) +
        sin(radians(?)) * sin(radians(pickup_latitude))
      )
    `;
    const distanceBindings = [latitude, longitude, latitude];

    let query = knex('delivery_orders')
      .select(
        this.baseSelect(),
        knex.raw(`${distanceExpression} AS pickup_distance_km`, distanceBindings)
      )
      .leftJoin('users', 'delivery_orders.user_id', 'users.id')
      .leftJoin('partners as motoboy', 'delivery_orders.motoboy_id', 'motoboy.id')
      .where('delivery_orders.status', 'pending')
      .whereNull('delivery_orders.motoboy_id')
      .whereRaw(`${distanceExpression} <= ?`, [...distanceBindings, radius]);

    if (orderType) {
      query = query.where('delivery_orders.type', orderType);
    }

    return await query.orderByRaw(`${distanceExpression} asc`, distanceBindings);
  }

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

    return order ? this.findById(order.id) : null;
  }

  static async startDelivery(orderId) {
    const [order] = await knex('delivery_orders')
      .where('id', orderId)
      .where('status', 'accepted')
      .update({
        status: 'picked_up',
        picked_up_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
      .returning('*');

    return order ? this.findById(order.id) : null;
  }

  static async inTransit(orderId) {
    const [order] = await knex('delivery_orders')
      .where('id', orderId)
      .where('status', 'picked_up')
      .update({
        status: 'in_transit',
        updated_at: knex.fn.now()
      })
      .returning('*');

    return order ? this.findById(order.id) : null;
  }

  static async complete(orderId, actualTimeMinutes = null) {
    const [order] = await knex('delivery_orders')
      .where('id', orderId)
      .where('status', 'in_transit')
      .update({
        status: 'delivered',
        delivered_at: knex.fn.now(),
        actual_delivery_minutes: actualTimeMinutes,
        updated_at: knex.fn.now()
      })
      .returning('*');

    return order ? this.findById(order.id) : null;
  }

  static async cancel(orderId, reason = null, cancelledBy = 'customer') {
    const notes = reason
      ? `[${cancelledBy}] ${reason}`
      : `[${cancelledBy}] Pedido cancelado`;

    const [order] = await knex('delivery_orders')
      .where('id', orderId)
      .whereIn('status', ['pending', 'accepted', 'picked_up'])
      .update({
        status: 'cancelled',
        notes,
        updated_at: knex.fn.now()
      })
      .returning('*');

    return order ? this.findById(order.id) : null;
  }

  static async updateLocation(orderId, latitude, longitude) {
    const currentOrder = await knex('delivery_orders').where('id', orderId).first();
    if (!currentOrder) {
      return null;
    }

    let trackingInfo = {};
    try {
      trackingInfo = currentOrder.tracking_info ? JSON.parse(currentOrder.tracking_info) : {};
    } catch (error) {
      trackingInfo = {};
    }

    const history = Array.isArray(trackingInfo.tracking_history)
      ? trackingInfo.tracking_history
      : [];

    history.push({
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      recorded_at: new Date().toISOString()
    });

    const [order] = await knex('delivery_orders')
      .where('id', orderId)
      .update({
        tracking_info: JSON.stringify({
          ...trackingInfo,
          current_latitude: parseFloat(latitude),
          current_longitude: parseFloat(longitude),
          tracking_history: history
        }),
        updated_at: knex.fn.now()
      })
      .returning('*');

    return order ? this.findById(order.id) : null;
  }

  static async rate(orderId, userId, rating, comment) {
    const [order] = await knex('delivery_orders')
      .where('id', orderId)
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

    return order ? this.findById(order.id) : null;
  }

  static async updateMotoboyRating(motoboyId) {
    const stats = await knex('delivery_orders')
      .where('motoboy_id', motoboyId)
      .whereNotNull('rating')
      .select(
        knex.raw('AVG(rating) as avg_rating'),
        knex.raw('COUNT(*) as total_reviews')
      )
      .first();

    if (!stats) {
      return;
    }

    await knex('partners')
      .where('id', motoboyId)
      .update({
        rating: parseFloat(stats.avg_rating) || 0,
        total_reviews: parseInt(stats.total_reviews, 10) || 0,
        updated_at: knex.fn.now()
      });
  }

  static async getStats() {
    return await knex('delivery_orders')
      .select(
        knex.raw("COUNT(*) as total"),
        knex.raw("COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending"),
        knex.raw("COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted"),
        knex.raw("COUNT(CASE WHEN status = 'picked_up' THEN 1 END) as picked_up"),
        knex.raw("COUNT(CASE WHEN status = 'in_transit' THEN 1 END) as in_transit"),
        knex.raw("COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered"),
        knex.raw("COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled"),
        knex.raw("COUNT(CASE WHEN type = 'fuel' THEN 1 END) as fuel"),
        knex.raw("COUNT(CASE WHEN type = 'auto_parts' THEN 1 END) as auto_parts"),
        knex.raw("SUM(CASE WHEN total_price IS NOT NULL THEN total_price ELSE 0 END) as total_revenue"),
        knex.raw("AVG(CASE WHEN total_price IS NOT NULL THEN total_price END) as avg_order_value")
      )
      .first();
  }

  static async getMotoboyStats(motoboyId) {
    return await knex('delivery_orders')
      .where('motoboy_id', motoboyId)
      .select(
        knex.raw("COUNT(*) as total"),
        knex.raw("COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending"),
        knex.raw("COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted"),
        knex.raw("COUNT(CASE WHEN status = 'picked_up' THEN 1 END) as picked_up"),
        knex.raw("COUNT(CASE WHEN status = 'in_transit' THEN 1 END) as in_transit"),
        knex.raw("COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered"),
        knex.raw("COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled"),
        knex.raw("SUM(CASE WHEN status = 'delivered' THEN COALESCE((price_breakdown::json->>'motoboy_fee')::numeric, 0) ELSE 0 END) as total_earnings"),
        knex.raw("AVG(CASE WHEN rating IS NOT NULL THEN rating END) as avg_rating")
      )
      .first();
  }

  static async calculateDeliveryFee(lat1, lon1, lat2, lon2) {
    const distanceKm = this.calculateDistance(
      parseFloat(lat1),
      parseFloat(lon1),
      parseFloat(lat2),
      parseFloat(lon2)
    );

    const baseFee = parseFloat(await SystemSettings.findByKey('delivery_base_fee')) || 8;
    const feePerKm = 2;
    const totalFee = baseFee + (distanceKm * feePerKm);

    return {
      distance_km: Number(distanceKm.toFixed(2)),
      total_fee: Number(totalFee.toFixed(2)),
      estimated_time_minutes: Math.max(20, Math.round(distanceKm * 4))
    };
  }

  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

module.exports = DeliveryOrder;
