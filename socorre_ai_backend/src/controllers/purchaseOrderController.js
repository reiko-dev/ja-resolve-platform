const PurchaseOrder = require('../models/PurchaseOrder');
const Partner = require('../models/Partner');
const DeliveryOrderService = require('../services/DeliveryOrderService');

// Valores canônicos de `purchase_orders.payment_method` (migration 011).
const CANONICAL_PAYMENT_METHODS = Object.freeze(['cash', 'card', 'pix', 'app']);

// E2E-010: o app cliente envia `credit_card`; o backend aceita o alias e
// persiste o valor canônico oficial (`card`).
const PAYMENT_METHOD_ALIASES = Object.freeze({ credit_card: 'card' });

// E2E-011: padrões de detalhe interno (SQL, constraint, driver, stack) que
// nunca podem ser refletidos na resposta ao cliente.
const INTERNAL_ERROR_DETAILS = /(insert\s+into|update\s+.+\s+set|delete\s+from|select\s+.+\s+from|check constraint|constraint\s+"|relation\s+"|violates|undefined binding|postgres|sqlite|knex|(^|\n)\s*at\s+\S)/i;

class PurchaseOrderController {
  static parseJson(value, fallback = null) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;

    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  static serializeOrder(order) {
    if (!order) return null;

    const items = PurchaseOrderController.parseJson(order.items, []);
    const priceBreakdown = PurchaseOrderController.parseJson(order.price_breakdown, {});
    const paymentInfo = PurchaseOrderController.parseJson(order.payment_info, {});
    const deliveryMode = priceBreakdown.delivery_mode || paymentInfo.delivery_mode || (order.delivery_motoboy_id ? 'app_motoboy' : 'store_delivery');

    return {
      ...order,
      items,
      total_items_quantity: order.total_items_quantity || items.reduce((sum, item) => sum + (parseInt(item.quantity, 10) || 0), 0),
      subtotal: order.subtotal !== null ? parseFloat(order.subtotal) : null,
      delivery_fee: order.delivery_fee !== null ? parseFloat(order.delivery_fee) : null,
      total_price: order.total_price !== null ? parseFloat(order.total_price) : null,
      delivery_mode: order.delivery_mode || deliveryMode,
      price_breakdown: priceBreakdown,
      payment_info: paymentInfo
    };
  }

  static serializeList(orders = []) {
    return orders.map(order => PurchaseOrderController.serializeOrder(order));
  }

  static isCompatibleStoreType(type) {
    return ['gas_station', 'auto_parts', 'posto_combustivel', 'auto_pecas'].includes(type);
  }

  static async getCurrentPartner(req) {
    if (req.user.partner_id) {
      return Partner.findById(req.user.partner_id);
    }

    return Partner.findByUserId(req.user.id);
  }

  // E2E-010/E2E-011 — contrato de erro do endpoint.
  // Somente mensagens de negócio conhecidas definem 400/403/404. Qualquer
  // outra mensagem (incluindo SQL/constraint/stack do driver) vira 500
  // genérico; o detalhe completo permanece apenas no log server-side.
  static errorResponse(res, error) {
    console.error('Erro em pedidos de compra:', error);

    const message = error && typeof error.message === 'string' ? error.message : '';
    const status = PurchaseOrderController.resolveBusinessErrorStatus(message);

    if (status === null || INTERNAL_ERROR_DETAILS.test(message)) {
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }

    return res.status(status).json({
      success: false,
      message
    });
  }

  static resolveBusinessErrorStatus(message) {
    const lower = message.toLowerCase();

    if (lower.includes('não encontrad')) {
      return 404;
    }

    if (lower.includes('acesso negado') || lower.includes('não autorizado')) {
      return 403;
    }

    if (
      lower.includes('obrigatório') ||
      lower.includes('inválido') ||
      lower.includes('assinatura ativa') ||
      lower.includes('compatível') ||
      lower.includes('só pode')
    ) {
      return 400;
    }

    return null;
  }

  // Aceita o alias documentado do Mobile (`credit_card`) e devolve sempre um
  // valor canônico, validado antes de qualquer INSERT (E2E-010).
  static normalizePaymentMethod(value) {
    const candidate = typeof value === 'string' ? value.trim().toLowerCase() : value;
    const canonical = PAYMENT_METHOD_ALIASES[candidate] || candidate;

    if (!CANONICAL_PAYMENT_METHODS.includes(canonical)) {
      throw new Error('payment_method inválido');
    }

    return canonical;
  }

  // Coordenadas não numéricas quebrariam o binding do INSERT em PostgreSQL e
  // virariam 500 com detalhe do driver (E2E-011). Rejeitar antes do INSERT
  // mantém a resposta determinística e segura.
  static normalizeCoordinate(value, field) {
    if (value === undefined || value === null) {
      return null;
    }

    const candidate = typeof value === 'string' ? value.trim() : value;
    const parsed = typeof candidate === 'string' ? Number(candidate) : candidate;

    if (candidate === '' || typeof parsed !== 'number' || !Number.isFinite(parsed)) {
      throw new Error(`${field} inválido`);
    }

    return parsed;
  }

  static async assertStoreAccess(req, order) {
    if (req.user.role === 'admin') {
      return;
    }

    const partner = await PurchaseOrderController.getCurrentPartner(req);
    if (!partner || String(partner.id) !== String(order.store_id)) {
      throw new Error('Acesso negado ao pedido da loja');
    }
  }

  static async assertUserOrStoreAccess(req, order) {
    if (req.user.role === 'admin') {
      return;
    }

    if (String(order.user_id) === String(req.user.id)) {
      return;
    }

    const partner = await PurchaseOrderController.getCurrentPartner(req);
    if (partner && String(partner.id) === String(order.store_id)) {
      return;
    }

    throw new Error('Acesso negado ao pedido');
  }

  // Buscar todos os pedidos de compra
  static async getAll(req, res) {
    try {
      const { page = 1, limit = 10, type, status, urgency, search } = req.query;
      
      const filters = {
        type,
        status,
        urgency,
        search
      };

      const result = await PurchaseOrder.findAll(
        parseInt(page),
        parseInt(limit),
        filters
      );

      res.json({
        success: true,
        data: PurchaseOrderController.serializeList(result.orders),
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });
    } catch (error) {
      console.error('Erro ao buscar pedidos de compra:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar pedido por ID
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const order = await PurchaseOrder.findById(id);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Pedido de compra não encontrado'
        });
      }

      res.json({
        success: true,
        data: PurchaseOrderController.serializeOrder(order)
      });
    } catch (error) {
      console.error('Erro ao buscar pedido de compra:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Criar novo pedido de compra
  static async create(req, res) {
    try {
      const orderData = req.body;
      const {
        store_id,
        items,
        subtotal,
        total_price,
        delivery_mode,
        delivery_fee = 0,
        delivery_address = null,
        delivery_latitude = null,
        delivery_longitude = null,
        notes = null,
        payment_method = 'cash',
        payment_status = 'pending',
        urgency = 'medium',
        is_urgent = false
      } = orderData;

      if (!store_id || !Array.isArray(items) || items.length === 0 || subtotal === undefined || total_price === undefined || !delivery_mode) {
        throw new Error('Dados obrigatórios: store_id, items, subtotal, total_price, delivery_mode');
      }

      if (!['store_delivery', 'app_motoboy'].includes(delivery_mode)) {
        throw new Error('delivery_mode inválido');
      }

      // E2E-010: valida/normaliza antes de qualquer acesso ao banco para que
      // valores inválidos respondam 400 sem tentativa de INSERT.
      const paymentMethod = PurchaseOrderController.normalizePaymentMethod(payment_method);

      if (delivery_mode === 'app_motoboy' && (!delivery_address || !delivery_latitude || !delivery_longitude)) {
        throw new Error('Pedidos com app_motoboy exigem endereço e coordenadas de entrega');
      }

      const normalizedDeliveryLatitude = PurchaseOrderController.normalizeCoordinate(delivery_latitude, 'delivery_latitude');
      const normalizedDeliveryLongitude = PurchaseOrderController.normalizeCoordinate(delivery_longitude, 'delivery_longitude');

      const store = await Partner.findById(store_id);
      if (!store) {
        throw new Error('Loja não encontrada');
      }

      if (!PurchaseOrderController.isCompatibleStoreType(store.type)) {
        throw new Error('Loja não é compatível com pedidos de compra');
      }

      const hasActiveSubscription = await Partner.hasActiveSubscription(store_id);
      if (!hasActiveSubscription) {
        throw new Error('Loja não possui assinatura ativa');
      }

      const normalizedItems = items.map(item => ({
        product_id: item.product_id,
        name: item.name || null,
        quantity: parseInt(item.quantity, 10) || 0,
        unit_price: item.unit_price !== undefined ? parseFloat(item.unit_price) : null
      }));

      const totalItemsQuantity = normalizedItems.reduce((sum, item) => sum + item.quantity, 0);
      const itemsDescription = normalizedItems
        .map(item => `${item.quantity}x ${item.name || `produto ${item.product_id}`}`)
        .join(', ');

      const priceBreakdown = PurchaseOrderController.parseJson(orderData.price_breakdown, {});
      const paymentInfo = PurchaseOrderController.parseJson(orderData.payment_info, {});

      const order = await PurchaseOrder.create({
        user_id: req.user.id,
        store_id: parseInt(store_id, 10),
        type: orderData.type || 'regular',
        items: JSON.stringify(normalizedItems),
        items_description: itemsDescription,
        total_items_quantity: totalItemsQuantity,
        subtotal: parseFloat(subtotal),
        delivery_fee: parseFloat(delivery_fee) || 0,
        taxes: parseFloat(orderData.taxes || 0) || 0,
        discount: parseFloat(orderData.discount || 0) || 0,
        total_price: parseFloat(total_price),
        price_breakdown: JSON.stringify({
          ...priceBreakdown,
          delivery_mode
        }),
        status: 'pending',
        delivery_address,
        delivery_latitude: normalizedDeliveryLatitude,
        delivery_longitude: normalizedDeliveryLongitude,
        delivery_instructions: orderData.delivery_instructions || null,
        delivery_contact_name: orderData.delivery_contact_name || null,
        delivery_contact_phone: orderData.delivery_contact_phone || req.user.phone || null,
        has_delivery: true,
        scheduled_delivery_at: orderData.scheduled_delivery_at || null,
        payment_method: paymentMethod,
        payment_status,
        payment_info: JSON.stringify({
          ...paymentInfo,
          delivery_mode
        }),
        urgency,
        is_urgent: is_urgent === true,
        notes,
        special_instructions: orderData.special_instructions || null
      });
      
      res.status(201).json({
        success: true,
        message: 'Pedido de compra criado com sucesso',
        data: PurchaseOrderController.serializeOrder(order)
      });
    } catch (error) {
      return PurchaseOrderController.errorResponse(res, error);
    }
  }

  // Atualizar pedido de compra
  static async update(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      const order = await PurchaseOrder.update(id, updateData);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Pedido de compra não encontrado'
        });
      }

      res.json({
        success: true,
        message: 'Pedido de compra atualizado com sucesso',
        data: PurchaseOrderController.serializeOrder(order)
      });
    } catch (error) {
      console.error('Erro ao atualizar pedido de compra:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Deletar pedido de compra
  static async delete(req, res) {
    try {
      const { id } = req.params;
      const deleted = await PurchaseOrder.delete(id);
      
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Pedido de compra não encontrado'
        });
      }

      res.json({
        success: true,
        message: 'Pedido de compra deletado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao deletar pedido de compra:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar pedidos por usuário
  static async getByUser(req, res) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      
      const targetUserId = req.user.role === 'admin' ? parseInt(userId, 10) : req.user.id;
      const result = await PurchaseOrder.findByUser(
        targetUserId,
        parseInt(page),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: PurchaseOrderController.serializeList(result.orders),
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });
    } catch (error) {
      console.error('Erro ao buscar pedidos do usuário:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar pedidos por loja
  static async getByStore(req, res) {
    try {
      const { storeId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      
      let targetStoreId = parseInt(storeId, 10);
      if (req.user.role !== 'admin') {
        const partner = await PurchaseOrderController.getCurrentPartner(req);
        if (!partner) {
          throw new Error('Parceiro da loja não encontrado');
        }
        targetStoreId = partner.id;
      }

      const result = await PurchaseOrder.findByStore(
        targetStoreId,
        parseInt(page),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: PurchaseOrderController.serializeList(result.orders),
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });
    } catch (error) {
      console.error('Erro ao buscar pedidos da loja:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Atualizar status do pedido
  static async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      const existingOrder = await PurchaseOrder.findById(id);
      if (!existingOrder) {
        throw new Error('Pedido de compra não encontrado');
      }

      if (req.user.role === 'admin') {
        const order = await PurchaseOrder.updateStatus(id, status, notes);
        return res.json({
          success: true,
          message: 'Status atualizado com sucesso',
          data: PurchaseOrderController.serializeOrder(order)
        });
      }

      if (req.user.role === 'user') {
        if (String(existingOrder.user_id) !== String(req.user.id)) {
          throw new Error('Acesso negado ao pedido');
        }

        if (status !== 'cancelled') {
          throw new Error('Usuário final só pode cancelar o próprio pedido');
        }

        const order = await PurchaseOrder.cancel(id, notes || null);
        if (!order) {
          throw new Error('Pedido de compra não encontrado');
        }

        return res.json({
          success: true,
          message: 'Status atualizado com sucesso',
          data: PurchaseOrderController.serializeOrder(order)
        });
      }

      await PurchaseOrderController.assertStoreAccess(req, existingOrder);

      const allowedStoreStatuses = ['confirmed', 'preparing', 'ready', 'cancelled', 'delivered'];
      if (!allowedStoreStatuses.includes(status)) {
        throw new Error('Status inválido para atualização pela loja');
      }

      const order = await PurchaseOrder.updateStatus(id, status, notes);

      res.json({
        success: true,
        message: 'Status atualizado com sucesso',
        data: PurchaseOrderController.serializeOrder(order)
      });
    } catch (error) {
      return PurchaseOrderController.errorResponse(res, error);
    }
  }

  static async confirm(req, res) {
    try {
      const existingOrder = await PurchaseOrder.findById(req.params.id);
      if (!existingOrder) {
        throw new Error('Pedido de compra não encontrado');
      }

      await PurchaseOrderController.assertStoreAccess(req, existingOrder);

      const estimatedDeliveryTime = req.body.estimated_delivery_minutes || req.body.estimatedDeliveryTime || null;
      const order = await PurchaseOrder.confirm(req.params.id, estimatedDeliveryTime);
      if (!order) {
        throw new Error('Pedido de compra não encontrado');
      }

      res.json({
        success: true,
        message: 'Pedido confirmado com sucesso',
        data: PurchaseOrderController.serializeOrder(order)
      });
    } catch (error) {
      return PurchaseOrderController.errorResponse(res, error);
    }
  }

  static async prepare(req, res) {
    try {
      const existingOrder = await PurchaseOrder.findById(req.params.id);
      if (!existingOrder) {
        throw new Error('Pedido de compra não encontrado');
      }

      await PurchaseOrderController.assertStoreAccess(req, existingOrder);

      const order = await PurchaseOrder.preparing(req.params.id);
      if (!order) {
        throw new Error('Pedido de compra não encontrado');
      }

      res.json({
        success: true,
        message: 'Pedido em preparação',
        data: PurchaseOrderController.serializeOrder(order)
      });
    } catch (error) {
      return PurchaseOrderController.errorResponse(res, error);
    }
  }

  static async ready(req, res) {
    try {
      const existingOrder = await PurchaseOrder.findById(req.params.id);
      if (!existingOrder) {
        throw new Error('Pedido de compra não encontrado');
      }

      await PurchaseOrderController.assertStoreAccess(req, existingOrder);

      const order = await PurchaseOrder.ready(req.params.id);
      if (!order) {
        throw new Error('Pedido de compra não encontrado');
      }

      const deliveryOrder = await DeliveryOrderService.ensureOrderForPurchaseOrder(order);

      res.json({
        success: true,
        message: 'Pedido pronto para entrega',
        data: {
          ...PurchaseOrderController.serializeOrder(order),
          related_delivery_order_id: deliveryOrder?.id || null
        }
      });
    } catch (error) {
      return PurchaseOrderController.errorResponse(res, error);
    }
  }

  static async cancel(req, res) {
    try {
      const existingOrder = await PurchaseOrder.findById(req.params.id);
      if (!existingOrder) {
        throw new Error('Pedido de compra não encontrado');
      }

      await PurchaseOrderController.assertUserOrStoreAccess(req, existingOrder);

      const order = await PurchaseOrder.cancel(req.params.id, req.body.reason || req.body.notes || null);
      if (!order) {
        throw new Error('Pedido de compra não encontrado');
      }

      res.json({
        success: true,
        message: 'Pedido cancelado com sucesso',
        data: PurchaseOrderController.serializeOrder(order)
      });
    } catch (error) {
      return PurchaseOrderController.errorResponse(res, error);
    }
  }

  // Avaliar compra
  static async rate(req, res) {
    try {
      const { id } = req.params;
      const { rating, review_comment, comment } = req.body;

      const existingOrder = await PurchaseOrder.findById(id);
      if (!existingOrder) {
        return res.status(404).json({
          success: false,
          message: 'Pedido de compra não encontrado'
        });
      }

      if (req.user.role !== 'admin' && String(existingOrder.user_id) !== String(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado ao pedido'
        });
      }
      
      const order = await PurchaseOrder.rate(id, req.user.id, rating, review_comment || comment || null);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Pedido de compra não encontrado'
        });
      }

      res.json({
        success: true,
        message: 'Avaliação registrada com sucesso',
        data: PurchaseOrderController.serializeOrder(order)
      });
    } catch (error) {
      return PurchaseOrderController.errorResponse(res, error);
    }
  }

  // Estatísticas de compras
  static async getStats(req, res) {
    try {
      const stats = await PurchaseOrder.getStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }
}

module.exports = PurchaseOrderController;
