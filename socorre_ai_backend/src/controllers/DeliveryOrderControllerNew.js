const DeliveryOrder = require('../models/DeliveryOrderModel');
const DeliveryOrderService = require('../services/DeliveryOrderService');
const Partner = require('../models/Partner');

class DeliveryOrderController {
  static parseJson(value, fallback = null) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;

    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  static normalizeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  static serializeOrder(order) {
    if (!order) return null;

    const priceBreakdown = DeliveryOrderController.parseJson(order.price_breakdown, {});
    const trackingInfo = DeliveryOrderController.parseJson(order.tracking_info, {});
    const storeInfo = DeliveryOrderController.parseJson(order.store_info, {});
    const items = typeof order.items === 'string'
      ? DeliveryOrderController.parseJson(order.items, [])
      : (order.items || []);

    return {
      ...order,
      order_type: order.order_type || order.type,
      store_id: order.store_id || storeInfo.id || null,
      store_name: order.store_name || storeInfo.business_name || null,
      customer_id: order.customer_id || order.user_id || null,
      items,
      items_total: DeliveryOrderController.normalizeNumber(priceBreakdown.items_total ?? order.items_price),
      items_count: parseInt(priceBreakdown.items_count ?? items.length, 10) || 0,
      platform_fee: DeliveryOrderController.normalizeNumber(priceBreakdown.platform_fee),
      platform_fee_percent: DeliveryOrderController.normalizeNumber(priceBreakdown.platform_fee_percent),
      motoboy_fee: DeliveryOrderController.normalizeNumber(priceBreakdown.motoboy_fee),
      motoboy_fee_percent: DeliveryOrderController.normalizeNumber(priceBreakdown.motoboy_fee_percent),
      total_amount: DeliveryOrderController.normalizeNumber(priceBreakdown.total_amount ?? order.total_price),
      estimated_time_minutes: order.estimated_time_minutes || order.estimated_delivery_minutes || null,
      actual_time_minutes: order.actual_time_minutes || order.actual_delivery_minutes || null,
      customer_notes: order.customer_notes || order.notes || null,
      cancellation_reason: order.status === 'cancelled' ? (order.cancellation_reason || order.notes || null) : null,
      tracking_history: trackingInfo.tracking_history || [],
      distance_km: DeliveryOrderController.normalizeNumber(order.distance_km ?? order.pickup_distance_km, null),
      payment_status: order.payment_status || 'pending'
    };
  }

  static serializeList(orders = []) {
    return orders.map(order => DeliveryOrderController.serializeOrder(order));
  }

  static async getCurrentPartnerId(req) {
    if (req.user.partner_id) {
      return req.user.partner_id;
    }

    const partner = await Partner.findByUserId(req.user.id);
    return partner?.id || null;
  }

  /**
   * Traduz o erro de domínio para o status HTTP do contrato: inexistência →
   * 404, autorização → 403 e validação/conflito conhecido → 400. Erros
   * desconhecidos permanecem 500 com mensagem segura (sem SQL/stack).
   */
  static errorResponse(res, error) {
    console.error('Erro no delivery novo:', error);

    const message = error.message || 'Erro interno do servidor';
    const lower = message.toLowerCase();

    // 'não encontrad' cobre "não encontrado" e "não encontrada" (ex.: loja).
    if (lower.includes('não encontrad')) {
      return res.status(404).json({ success: false, message });
    }

    if (lower.includes('acesso negado') || lower.includes('apenas motoboys')) {
      return res.status(403).json({ success: false, message });
    }

    if (
      lower.includes('inválido') ||
      lower.includes('obrigatóri') || // obrigatório/obrigatória/obrigatórias
      lower.includes('disponível') ||
      lower.includes('compatível') ||
      lower.includes('assinatura ativa') ||
      lower.includes('estoque') ||
      lower.includes('não pertence') || // produto de outra loja
      lower.includes('rating deve ser') || // rating fora de 1..5
      lower.includes('apenas pedidos entregues') // avaliação de pedido não entregue
    ) {
      return res.status(400).json({ success: false, message });
    }

    return res.status(500).json({ success: false, message });
  }

  static async create(req, res) {
    try {
      const order = await DeliveryOrderService.createOrder(req.body, req.user.id);

      res.status(201).json({
        success: true,
        data: DeliveryOrderController.serializeOrder(order),
        message: 'Pedido criado com sucesso'
      });
    } catch (error) {
      return DeliveryOrderController.errorResponse(res, error);
    }
  }

  static async findByCustomer(req, res) {
    try {
      const orders = await DeliveryOrderService.getCustomerOrders(req.user.id, req.query.status);

      res.json({
        success: true,
        data: DeliveryOrderController.serializeList(orders)
      });
    } catch (error) {
      return DeliveryOrderController.errorResponse(res, error);
    }
  }

  static async findByStore(req, res) {
    try {
      const storeId = await DeliveryOrderController.getCurrentPartnerId(req);
      if (!storeId) {
        return res.status(403).json({ success: false, message: 'Parceiro da loja não encontrado' });
      }

      const orders = await DeliveryOrderService.getStoreOrders(storeId, req.query.status);

      res.json({
        success: true,
        data: DeliveryOrderController.serializeList(orders)
      });
    } catch (error) {
      return DeliveryOrderController.errorResponse(res, error);
    }
  }

  static async findByMotoboy(req, res) {
    try {
      const motoboyId = await DeliveryOrderController.getCurrentPartnerId(req);
      if (!motoboyId) {
        return res.status(403).json({ success: false, message: 'Motoboy não encontrado' });
      }

      const orders = await DeliveryOrderService.getMotoboyOrders(motoboyId, req.query.status);

      res.json({
        success: true,
        data: DeliveryOrderController.serializeList(orders)
      });
    } catch (error) {
      return DeliveryOrderController.errorResponse(res, error);
    }
  }

  static async findAvailable(req, res) {
    try {
      let { latitude, longitude, radius, order_type } = req.query;

      if (!latitude || !longitude) {
        const partnerId = await DeliveryOrderController.getCurrentPartnerId(req);
        const partner = partnerId ? await Partner.findById(partnerId) : null;

        if (partner?.latitude && partner?.longitude) {
          latitude = partner.latitude;
          longitude = partner.longitude;
        }
      }

      const orders = await DeliveryOrderService.getAvailableOrders(
        latitude,
        longitude,
        radius || 10,
        order_type || null
      );

      res.json({
        success: true,
        data: DeliveryOrderController.serializeList(orders)
      });
    } catch (error) {
      return DeliveryOrderController.errorResponse(res, error);
    }
  }

  static async accept(req, res) {
    try {
      const motoboyId = await DeliveryOrderController.getCurrentPartnerId(req);
      if (!motoboyId) {
        return res.status(403).json({ success: false, message: 'Motoboy não encontrado' });
      }

      const order = await DeliveryOrderService.acceptOrder(req.params.id, motoboyId);

      res.json({
        success: true,
        data: DeliveryOrderController.serializeOrder(order),
        message: 'Pedido aceito com sucesso'
      });
    } catch (error) {
      return DeliveryOrderController.errorResponse(res, error);
    }
  }

  static async start(req, res) {
    try {
      const motoboyId = await DeliveryOrderController.getCurrentPartnerId(req);
      if (!motoboyId) {
        return res.status(403).json({ success: false, message: 'Motoboy não encontrado' });
      }

      const order = await DeliveryOrderService.startDelivery(req.params.id, motoboyId);

      res.json({
        success: true,
        data: DeliveryOrderController.serializeOrder(order),
        message: 'Coleta iniciada com sucesso'
      });
    } catch (error) {
      return DeliveryOrderController.errorResponse(res, error);
    }
  }

  static async inTransit(req, res) {
    try {
      const motoboyId = await DeliveryOrderController.getCurrentPartnerId(req);
      if (!motoboyId) {
        return res.status(403).json({ success: false, message: 'Motoboy não encontrado' });
      }

      const order = await DeliveryOrderService.inTransit(req.params.id, motoboyId);

      res.json({
        success: true,
        data: DeliveryOrderController.serializeOrder(order),
        message: 'Pedido em trânsito'
      });
    } catch (error) {
      return DeliveryOrderController.errorResponse(res, error);
    }
  }

  static async complete(req, res) {
    try {
      const motoboyId = await DeliveryOrderController.getCurrentPartnerId(req);
      if (!motoboyId) {
        return res.status(403).json({ success: false, message: 'Motoboy não encontrado' });
      }

      const order = await DeliveryOrderService.completeDelivery(
        req.params.id,
        motoboyId,
        req.body.actual_time_minutes || null
      );

      res.json({
        success: true,
        data: DeliveryOrderController.serializeOrder(order),
        message: 'Pedido entregue com sucesso'
      });
    } catch (error) {
      return DeliveryOrderController.errorResponse(res, error);
    }
  }

  static async cancel(req, res) {
    try {
      const order = await DeliveryOrder.findById(req.params.id);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Pedido não encontrado' });
      }

      let cancelledBy = 'customer';
      if (req.user.role === 'partner') {
        const partnerId = await DeliveryOrderController.getCurrentPartnerId(req);
        if (partnerId && String(order.motoboy_id) === String(partnerId)) {
          cancelledBy = 'motoboy';
        } else if (partnerId && String(order.store_id) === String(partnerId)) {
          cancelledBy = 'store';
        } else {
          return res.status(403).json({ success: false, message: 'Acesso negado' });
        }
      } else if (req.user.role === 'admin') {
        cancelledBy = 'admin';
      } else if (String(order.user_id) !== String(req.user.id)) {
        return res.status(403).json({ success: false, message: 'Acesso negado' });
      }

      const cancelledOrder = await DeliveryOrderService.cancelOrder(
        req.params.id,
        req.body.reason || null,
        cancelledBy
      );

      res.json({
        success: true,
        data: DeliveryOrderController.serializeOrder(cancelledOrder),
        message: 'Pedido cancelado com sucesso'
      });
    } catch (error) {
      return DeliveryOrderController.errorResponse(res, error);
    }
  }

  static async updateLocation(req, res) {
    try {
      const motoboyId = await DeliveryOrderController.getCurrentPartnerId(req);
      if (!motoboyId) {
        return res.status(403).json({ success: false, message: 'Motoboy não encontrado' });
      }

      const order = await DeliveryOrderService.updateLocation(
        req.params.id,
        motoboyId,
        req.body.latitude,
        req.body.longitude
      );

      res.json({
        success: true,
        data: DeliveryOrderController.serializeOrder(order),
        message: 'Localização atualizada com sucesso'
      });
    } catch (error) {
      return DeliveryOrderController.errorResponse(res, error);
    }
  }

  static async rate(req, res) {
    try {
      const order = await DeliveryOrderService.rateOrder(
        req.params.id,
        req.user.id,
        req.body.rating,
        req.body.comment || req.body.review_comment || null
      );

      res.json({
        success: true,
        data: DeliveryOrderController.serializeOrder(order),
        message: 'Avaliação registrada com sucesso'
      });
    } catch (error) {
      return DeliveryOrderController.errorResponse(res, error);
    }
  }

  static async getById(req, res) {
    try {
      const order = await DeliveryOrder.findById(req.params.id);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Pedido não encontrado' });
      }

      if (req.user.role !== 'admin') {
        const partnerId = await DeliveryOrderController.getCurrentPartnerId(req);
        const isCustomer = String(order.user_id) === String(req.user.id);
        const isAssignedMotoboy = partnerId && String(order.motoboy_id) === String(partnerId);
        const isStoreOwner = partnerId && String(order.store_id) === String(partnerId);

        if (!isCustomer && !isAssignedMotoboy && !isStoreOwner) {
          return res.status(403).json({ success: false, message: 'Acesso negado' });
        }
      }

      res.json({
        success: true,
        data: DeliveryOrderController.serializeOrder(order)
      });
    } catch (error) {
      return DeliveryOrderController.errorResponse(res, error);
    }
  }

  static async getStats(req, res) {
    try {
      const stats = await DeliveryOrderService.getStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      return DeliveryOrderController.errorResponse(res, error);
    }
  }

  static async getMotoboyStats(req, res) {
    try {
      const motoboyId = await DeliveryOrderController.getCurrentPartnerId(req);
      if (!motoboyId) {
        return res.status(403).json({ success: false, message: 'Motoboy não encontrado' });
      }

      const stats = await DeliveryOrder.getMotoboyStats(motoboyId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      return DeliveryOrderController.errorResponse(res, error);
    }
  }

  static async getMotoboyHistory(req, res) {
    try {
      const motoboyId = await DeliveryOrderController.getCurrentPartnerId(req);
      if (!motoboyId) {
        return res.status(403).json({ success: false, message: 'Motoboy não encontrado' });
      }

      const history = await DeliveryOrder.findByMotoboy(
        motoboyId,
        req.query.status || null,
        {
          page: req.query.page || 1,
          limit: req.query.limit || 20,
          startDate: req.query.start_date || null,
          endDate: req.query.end_date || null
        }
      );

      res.json({
        success: true,
        data: {
          orders: DeliveryOrderController.serializeList(history.orders),
          pagination: {
            page: history.page,
            limit: history.limit,
            total: history.total,
            totalPages: history.totalPages
          }
        }
      });
    } catch (error) {
      return DeliveryOrderController.errorResponse(res, error);
    }
  }

  static async getAll(req, res) {
    try {
      const page = req.query.page || 1;
      const limit = req.query.limit || 10;
      const filters = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        status: req.query.status || null,
        order_type: req.query.order_type || null,
        store_id: req.query.store_id || null,
        customer_id: req.query.customer_id || null,
        motoboy_id: req.query.motoboy_id || null
      };

      const result = await DeliveryOrderService.getOrdersWithFilters(filters);

      res.json({
        success: true,
        data: DeliveryOrderController.serializeList(result.orders),
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });
    } catch (error) {
      return DeliveryOrderController.errorResponse(res, error);
    }
  }
}

module.exports = DeliveryOrderController;
