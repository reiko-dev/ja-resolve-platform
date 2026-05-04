const DeliveryOrder = require('../models/DeliveryOrderModel');
const Product = require('../models/Product');
const Partner = require('../models/Partner');
const PurchaseOrder = require('../models/PurchaseOrder');
const NotificationService = require('./NotificationServiceNew');
const SystemSettings = require('../models/SystemSettings');

class DeliveryOrderService {
  static parseJsonField(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;

    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  static isCompatibleStoreType(type) {
    return ['gas_station', 'auto_parts', 'posto_combustivel', 'auto_pecas'].includes(type);
  }

  static getOrderTypeForStore(storeType) {
    if (['gas_station', 'posto_combustivel'].includes(storeType)) {
      return 'fuel';
    }

    return 'auto_parts';
  }

  static getPurchaseOrderDeliveryMode(purchaseOrder) {
    const priceBreakdown = this.parseJsonField(purchaseOrder.price_breakdown, {});
    const paymentInfo = this.parseJsonField(purchaseOrder.payment_info, {});
    return priceBreakdown.delivery_mode || paymentInfo.delivery_mode || (purchaseOrder.delivery_motoboy_id ? 'app_motoboy' : 'store_delivery');
  }

  static async notifyStore(storeId, title, message, data = {}) {
    try {
      await NotificationService.sendPartnerNotification(storeId, title, message, data);
    } catch (error) {
      console.error('Falha ao notificar loja:', error);
    }
  }

  static async notifyUser(userId, title, message, data = {}) {
    try {
      await NotificationService.sendNotification(userId, title, message, data);
    } catch (error) {
      console.error('Falha ao notificar usuário:', error);
    }
  }

  // Criar novo pedido de delivery
  static async createOrder(orderData, customerId) {
    try {
      const { 
        order_type, 
        store_id, 
        items, 
        pickup_address, 
        pickup_latitude, 
        pickup_longitude,
        delivery_address, 
        delivery_latitude, 
        delivery_longitude,
        customer_notes 
      } = orderData;

      // Validar dados
      if (!order_type || !store_id || !items || !pickup_address || !delivery_address) {
        throw new Error('Dados obrigatórios: order_type, store_id, items, pickup_address, delivery_address');
      }

      // Validar tipo
      const validTypes = ['fuel', 'auto_parts'];
      if (!validTypes.includes(order_type)) {
        throw new Error('Tipo de pedido inválido');
      }

      // Verificar se loja existe e tem assinatura ativa
      const store = await Partner.findById(store_id);
      if (!store) {
        throw new Error('Loja não encontrada');
      }

      if (!this.isCompatibleStoreType(store.type)) {
        throw new Error('Loja não é compatível com este tipo de pedido');
      }

      const hasActiveSubscription = await Partner.hasActiveSubscription(store_id);
      if (!hasActiveSubscription) {
        throw new Error('Loja não possui assinatura ativa');
      }

      // Validar itens e calcular totais
      const validatedItems = await this.validateAndCalculateItems(items, store_id);

      // Calcular taxas de delivery
      const deliveryFeeData = await DeliveryOrder.calculateDeliveryFee(
        pickup_latitude, 
        pickup_longitude, 
        delivery_latitude, 
        delivery_longitude
      );

      // Buscar configurações de comissão
      const platformFeePercent = await this.getPlatformFeePercent();
      const motoboyFeePercent = await this.getMotoboyFeePercent();

      const platformFee = deliveryFeeData.total_fee * (platformFeePercent / 100);
      const motoboyFee = deliveryFeeData.total_fee * (motoboyFeePercent / 100);

      const totalAmount = validatedItems.itemsTotal + deliveryFeeData.total_fee;

      // Criar pedido
      const priceBreakdown = {
        items_total: validatedItems.itemsTotal,
        items_count: validatedItems.itemsCount,
        delivery_fee: deliveryFeeData.total_fee,
        platform_fee: platformFee,
        platform_fee_percent: platformFeePercent,
        motoboy_fee: motoboyFee,
        motoboy_fee_percent: motoboyFeePercent,
        total_amount: totalAmount
      };

      const orderDataComplete = {
        user_id: customerId,
        type: order_type,
        pickup_address,
        pickup_latitude,
        pickup_longitude,
        delivery_address,
        delivery_latitude,
        delivery_longitude,
        items: JSON.stringify(validatedItems.items),
        items_description: validatedItems.items.map(item => `${item.quantity}x ${item.name}`).join(', '),
        delivery_fee: deliveryFeeData.total_fee,
        items_price: validatedItems.itemsTotal,
        total_price: totalAmount,
        price_breakdown: JSON.stringify(priceBreakdown),
        estimated_delivery_minutes: deliveryFeeData.estimated_time_minutes,
        distance_km: deliveryFeeData.distance_km,
        store_info: JSON.stringify({
          id: store.id,
          business_name: store.business_name,
          phone: store.phone,
          address: store.address
        }),
        notes: customer_notes || null
      };

      const order = await DeliveryOrder.create(orderDataComplete);

      await this.notifyNearbyMotoboys(order);
      await this.notifyStore(
        store_id,
        'Novo pedido de delivery!',
        `Novo pedido de ${order_type} recebido`,
        {
          type: 'delivery.order.created',
          order_id: order.id,
          customer_id: customerId
        }
      );

      return order;
    } catch (error) {
      console.error('Erro ao criar pedido de delivery:', error);
      throw error;
    }
  }

  // Aceitar pedido (motoboy)
  static async acceptOrder(orderId, motoboyId) {
    try {
      const order = await DeliveryOrder.findById(orderId);
      if (!order) {
        throw new Error('Pedido não encontrado');
      }

      if (order.status !== 'pending') {
        throw new Error('Pedido não está mais disponível');
      }

      // Verificar se é motoboy
      const motoboy = await Partner.findById(motoboyId);
      if (!motoboy || motoboy.type !== 'motoboy') {
        throw new Error('Apenas motoboys podem aceitar pedidos');
      }

      const acceptedOrder = await DeliveryOrder.accept(orderId, motoboyId);
      const linkedPurchaseOrderId = this.parseJsonField(acceptedOrder?.price_breakdown, {}).purchase_order_id;

      if (linkedPurchaseOrderId) {
        await PurchaseOrder.assignMotoboy(linkedPurchaseOrderId, motoboyId);
      }

      // Notificar cliente e loja
      await this.notifyUser(
        order.customer_id,
        'Motoboy a caminho!',
        `Seu pedido foi aceito por ${motoboy.business_name}`,
        {
          type: 'delivery.order.accepted',
          order_id: orderId,
          motoboy_id: motoboyId
        }
      );

      await this.notifyStore(
        order.store_id,
        'Pedido aceito',
        `Seu pedido foi aceito por ${motoboy.business_name}`,
        {
          type: 'delivery.order.accepted',
          order_id: orderId,
          motoboy_id: motoboyId
        }
      );

      return acceptedOrder;
    } catch (error) {
      console.error('Erro ao aceitar pedido:', error);
      throw error;
    }
  }

  // Iniciar delivery (pegou o produto)
  static async startDelivery(orderId, motoboyId) {
    try {
      const order = await DeliveryOrder.findById(orderId);
      if (!order || order.motoboy_id !== motoboyId) {
        throw new Error('Acesso negado');
      }

      if (order.status !== 'accepted') {
        throw new Error('Status inválido para iniciar delivery');
      }

      const startedOrder = await DeliveryOrder.startDelivery(orderId);

      // Notificar cliente
      await this.notifyUser(
        order.customer_id,
        'Pedido a caminho!',
        'Seu pedido está a caminho do destino',
        {
          type: 'delivery.order.picked_up',
          order_id: orderId
        }
      );

      return startedOrder;
    } catch (error) {
      console.error('Erro ao iniciar delivery:', error);
      throw error;
    }
  }

  // Em trânsito
  static async inTransit(orderId, motoboyId) {
    try {
      const order = await DeliveryOrder.findById(orderId);
      if (!order || order.motoboy_id !== motoboyId) {
        throw new Error('Acesso negado');
      }

      return await DeliveryOrder.inTransit(orderId);
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      throw error;
    }
  }

  // Completar delivery
  static async completeDelivery(orderId, motoboyId, actualTimeMinutes = null) {
    try {
      const order = await DeliveryOrder.findById(orderId);
      if (!order || order.motoboy_id !== motoboyId) {
        throw new Error('Acesso negado');
      }

      const completedOrder = await DeliveryOrder.complete(orderId, actualTimeMinutes);
      const linkedPurchaseOrderId = this.parseJsonField(completedOrder?.price_breakdown, {}).purchase_order_id;

      if (linkedPurchaseOrderId) {
        await PurchaseOrder.deliver(linkedPurchaseOrderId);
      }

      // Notificar cliente e loja
      await this.notifyUser(
        order.customer_id,
        'Pedido entregue!',
        'Seu pedido foi entregue com sucesso',
        {
          type: 'delivery.order.delivered',
          order_id: orderId
        }
      );

      await this.notifyStore(
        order.store_id,
        'Pedido entregue',
        'O pedido foi entregue ao cliente',
        {
          type: 'delivery.order.delivered',
          order_id: orderId
        }
      );

      return completedOrder;
    } catch (error) {
      console.error('Erro ao completar delivery:', error);
      throw error;
    }
  }

  // Cancelar pedido
  static async cancelOrder(orderId, reason = null, cancelledBy = 'customer') {
    try {
      const order = await DeliveryOrder.findById(orderId);
      if (!order) {
        throw new Error('Pedido não encontrado');
      }

      const cancelledOrder = await DeliveryOrder.cancel(orderId, reason, cancelledBy);

      // Notificar partes interessadas
      if (cancelledBy === 'customer' && order.motoboy_id) {
        await this.notifyUser(
          order.motoboy_id,
          'Pedido cancelado',
          'O cliente cancelou o pedido',
          {
            type: 'delivery.order.cancelled',
            order_id: orderId
          }
        );
      }

      if (cancelledBy === 'motoboy' || cancelledBy === 'store') {
        await this.notifyUser(
          order.customer_id,
          'Pedido cancelado',
          'Seu pedido foi cancelado',
          {
            type: 'delivery.order.cancelled',
            order_id: orderId
          }
        );
      }

      return cancelledOrder;
    } catch (error) {
      console.error('Erro ao cancelar pedido:', error);
      throw error;
    }
  }

  // Atualizar localização (rastreamento)
  static async updateLocation(orderId, motoboyId, latitude, longitude) {
    try {
      const order = await DeliveryOrder.findById(orderId);
      if (!order || order.motoboy_id !== motoboyId) {
        throw new Error('Acesso negado');
      }

      return await DeliveryOrder.updateLocation(orderId, latitude, longitude);
    } catch (error) {
      console.error('Erro ao atualizar localização:', error);
      throw error;
    }
  }

  // Avaliar pedido
  static async rateOrder(orderId, customerId, rating, comment) {
    try {
      if (!rating || rating < 1 || rating > 5) {
        throw new Error('Rating deve ser entre 1 e 5');
      }

      const order = await DeliveryOrder.findById(orderId);
      if (!order) {
        throw new Error('Pedido não encontrado');
      }

      if (order.customer_id !== customerId) {
        throw new Error('Acesso negado');
      }

      if (order.status !== 'delivered') {
        throw new Error('Apenas pedidos entregues podem ser avaliados');
      }

      return await DeliveryOrder.rate(orderId, customerId, parseInt(rating), comment);
    } catch (error) {
      console.error('Erro ao avaliar pedido:', error);
      throw error;
    }
  }

  // Buscar pedidos disponíveis para motoboys
  static async getAvailableOrders(latitude, longitude, radius = 10, orderType = null) {
    try {
      if (!latitude || !longitude) {
        throw new Error('Coordenadas obrigatórias: latitude, longitude');
      }

      return await DeliveryOrder.findAvailableForMotoboys(
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(radius),
        orderType
      );
    } catch (error) {
      console.error('Erro ao buscar pedidos disponíveis:', error);
      throw error;
    }
  }

  // Buscar pedidos do cliente
  static async getCustomerOrders(customerId, status = null) {
    try {
      return await DeliveryOrder.findByCustomer(customerId, status);
    } catch (error) {
      console.error('Erro ao buscar pedidos do cliente:', error);
      throw error;
    }
  }

  // Buscar pedidos da loja
  static async getStoreOrders(storeId, status = null) {
    try {
      return await DeliveryOrder.findByStore(storeId, status);
    } catch (error) {
      console.error('Erro ao buscar pedidos da loja:', error);
      throw error;
    }
  }

  // Buscar pedidos do motoboy
  static async getMotoboyOrders(motoboyId, status = null) {
    try {
      return await DeliveryOrder.findByMotoboy(motoboyId, status);
    } catch (error) {
      console.error('Erro ao buscar pedidos do motoboy:', error);
      throw error;
    }
  }

  // Validar e calcular itens do pedido
  static async validateAndCalculateItems(items, storeId) {
    try {
      let itemsTotal = 0;
      let itemsCount = 0;
      const validatedItems = [];

      for (const item of items) {
        const product = await Product.findById(item.product_id);
        if (!product) {
          throw new Error(`Produto ${item.product_id} não encontrado`);
        }

        if (Number(product.store_id) !== Number(storeId)) {
          throw new Error(`Produto ${product.name} não pertence a esta loja`);
        }

        if (product.stock < item.quantity) {
          throw new Error(`Produto ${product.name} sem estoque suficiente`);
        }

        const itemTotal = product.price * item.quantity;
        itemsTotal += itemTotal;
        itemsCount += item.quantity;

        validatedItems.push({
          product_id: item.product_id,
          name: product.name,
          price: product.price,
          quantity: item.quantity,
          total: itemTotal
        });
      }

      return {
        items: validatedItems,
        itemsTotal,
        itemsCount
      };
    } catch (error) {
      console.error('Erro ao validar itens:', error);
      throw error;
    }
  }

  // Notificar motoboys próximos
  static async notifyNearbyMotoboys(order) {
    try {
      const motoboys = await Partner.findByProximity(
        order.pickup_latitude,
        order.pickup_longitude,
        10,
        'motoboy'
      );

      for (const motoboy of motoboys) {
        await NotificationService.sendPartnerNotification(
          motoboy.id,
          'Novo pedido de delivery!',
          `Pedido de ${order.order_type || order.type} disponível próximo de você`,
          {
            type: 'delivery.order.available',
            order_id: order.id,
            order_type: order.order_type || order.type,
            delivery_fee: order.delivery_fee
          }
        );
      }

      return motoboys.length;
    } catch (error) {
      console.error('Erro ao notificar motoboys:', error);
      return 0;
    }
  }

  // Obter estatísticas
  static async getStats() {
    try {
      return await DeliveryOrder.getStats();
    } catch (error) {
      console.error('Erro ao obter estatísticas:', error);
      throw error;
    }
  }

  static async ensureOrderForPurchaseOrder(purchaseOrder) {
    const deliveryMode = this.getPurchaseOrderDeliveryMode(purchaseOrder);
    if (deliveryMode !== 'app_motoboy') {
      return null;
    }

    const existingOrder = await DeliveryOrder.findByPurchaseOrderId(purchaseOrder.id);
    if (existingOrder) {
      return existingOrder;
    }

    if (!purchaseOrder.delivery_address || !purchaseOrder.delivery_latitude || !purchaseOrder.delivery_longitude) {
      throw new Error('Pedido com app_motoboy exige endereço e coordenadas de entrega');
    }

    const store = await Partner.findById(purchaseOrder.store_id);
    if (!store) {
      throw new Error('Loja não encontrada');
    }

    if (!store.address || !store.latitude || !store.longitude) {
      throw new Error('Loja sem endereço e coordenadas válidas para criar delivery');
    }

    const hasActiveSubscription = await Partner.hasActiveSubscription(purchaseOrder.store_id);
    if (!hasActiveSubscription) {
      throw new Error('Loja não possui assinatura ativa');
    }

    const items = Array.isArray(purchaseOrder.items)
      ? purchaseOrder.items
      : this.parseJsonField(purchaseOrder.items, []);

    const itemCount = items.reduce((sum, item) => sum + (parseInt(item.quantity, 10) || 0), 0);
    const deliveryFee = parseFloat(purchaseOrder.delivery_fee || 0) || 0;
    const itemsTotal = parseFloat(purchaseOrder.subtotal || 0) || 0;
    const totalAmount = parseFloat(purchaseOrder.total_price || 0) || 0;
    const platformFeePercent = await this.getPlatformFeePercent();
    const motoboyFeePercent = await this.getMotoboyFeePercent();
    const platformFee = deliveryFee * (platformFeePercent / 100);
    const motoboyFee = deliveryFee * (motoboyFeePercent / 100);

    const deliveryOrder = await DeliveryOrder.create({
      user_id: purchaseOrder.user_id,
      type: this.getOrderTypeForStore(store.type),
      items: JSON.stringify(items),
      items_description: purchaseOrder.items_description || items.map(item => `${item.quantity}x ${item.name || `produto ${item.product_id}`}`).join(', '),
      pickup_address: store.address,
      pickup_latitude: store.latitude,
      pickup_longitude: store.longitude,
      delivery_address: purchaseOrder.delivery_address,
      delivery_latitude: purchaseOrder.delivery_latitude,
      delivery_longitude: purchaseOrder.delivery_longitude,
      delivery_instructions: purchaseOrder.delivery_instructions || purchaseOrder.special_instructions || null,
      status: 'pending',
      delivery_fee: deliveryFee,
      items_price: itemsTotal,
      total_price: totalAmount,
      price_breakdown: JSON.stringify({
        items_total: itemsTotal,
        items_count: itemCount,
        delivery_fee: deliveryFee,
        platform_fee: platformFee,
        platform_fee_percent: platformFeePercent,
        motoboy_fee: motoboyFee,
        motoboy_fee_percent: motoboyFeePercent,
        total_amount: totalAmount,
        purchase_order_id: purchaseOrder.id,
        delivery_mode: deliveryMode,
        source: 'purchase_order'
      }),
      estimated_delivery_minutes: purchaseOrder.estimated_delivery_minutes || null,
      distance_km: null,
      store_info: JSON.stringify({
        id: store.id,
        business_name: store.business_name,
        phone: store.phone,
        address: store.address
      }),
      payment_method: purchaseOrder.payment_method || 'cash',
      payment_status: purchaseOrder.payment_status || 'pending',
      notes: purchaseOrder.notes || null
    });

    await this.notifyNearbyMotoboys(deliveryOrder);

    await this.notifyUser(
      purchaseOrder.user_id,
      'Entrega por motoboy liberada',
      'Seu pedido está pronto e já pode ser aceito por um motoboy.',
      {
        type: 'purchase_order.out_for_delivery',
        purchase_order_id: purchaseOrder.id,
        delivery_order_id: deliveryOrder.id
      }
    );

    return deliveryOrder;
  }

  // Obter resumo do pedido para dashboard
  static async getOrderSummary(orderId) {
    try {
      const order = await DeliveryOrder.findById(orderId);
      if (!order) {
        throw new Error('Pedido não encontrado');
      }

      const items = JSON.parse(order.items || '[]');
      
      return {
        order,
        items,
        status_info: {
          can_cancel: ['pending', 'accepted'].includes(order.status),
          can_rate: order.status === 'delivered',
          can_track: ['accepted', 'picked_up', 'in_transit'].includes(order.status)
        },
        time_info: {
          estimated_time: order.estimated_time_minutes,
          actual_time: order.actual_time_minutes,
          created_at: order.created_at,
          accepted_at: order.accepted_at,
          delivered_at: order.delivered_at
        },
        payment_info: {
          total_amount: order.total_amount,
          items_total: order.items_total,
          delivery_fee: order.delivery_fee,
          platform_fee: order.platform_fee,
          motoboy_fee: order.motoboy_fee
        }
      };
    } catch (error) {
      console.error('Erro ao obter resumo do pedido:', error);
      throw error;
    }
  }

  // Métodos auxiliares
  static async getPlatformFeePercent() {
    const setting = await SystemSettings.findByKey('delivery_platform_fee_percent');
    return parseFloat(setting ?? 20);
  }

  static async getMotoboyFeePercent() {
    const setting = await SystemSettings.findByKey('delivery_motoboy_fee_percent');
    return parseFloat(setting ?? 80);
  }

  // Validar dados do pedido
  static validateOrderData(data) {
    const errors = [];

    // Validar tipo
    const validTypes = ['fuel', 'auto_parts'];
    if (!data.order_type || !validTypes.includes(data.order_type)) {
      errors.push('Tipo de pedido inválido. Tipos válidos: ' + validTypes.join(', '));
    }

    // Validar itens
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      errors.push('Itens do pedido são obrigatórios');
    }

    // Validar endereços
    if (!data.pickup_address) {
      errors.push('Endereço de retirada é obrigatório');
    }

    if (!data.delivery_address) {
      errors.push('Endereço de entrega é obrigatório');
    }

    // Validar coordenadas
    if (!data.pickup_latitude || !data.pickup_longitude) {
      errors.push('Coordenadas de retirada são obrigatórias');
    }

    if (!data.delivery_latitude || !data.delivery_longitude) {
      errors.push('Coordenadas de entrega são obrigatórias');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Verificar se loja pode receber pedidos
  static async canStoreReceiveOrders(storeId) {
    try {
      const store = await Partner.findById(storeId);
      
      if (!store) {
        return { canReceive: false, reason: 'Loja não encontrada' };
      }

      // Verificar se é posto ou auto peças
      if (!this.isCompatibleStoreType(store.type)) {
        return { 
          canReceive: false, 
          reason: 'Apenas postos de combustível e auto peças podem receber pedidos de delivery' 
        };
      }

      // Verificar se tem assinatura ativa
      const hasActiveSubscription = await Partner.hasActiveSubscription(storeId);
      if (!hasActiveSubscription) {
        return { 
          canReceive: false, 
          reason: 'Loja não possui assinatura ativa' 
        };
      }

      // Verificar se está disponível
      if (!store.is_available) {
        return { 
          canReceive: false, 
          reason: 'Loja não está disponível' 
        };
      }

      return { canReceive: true };
    } catch (error) {
      console.error('Erro ao verificar se loja pode receber pedidos:', error);
      return { canReceive: false, reason: 'Erro ao verificar dados da loja' };
    }
  }

  // Buscar pedidos com filtros avançados
  static async getOrdersWithFilters(filters = {}) {
    try {
      const { page = 1, limit = 10, status, order_type, store_id, customer_id, motoboy_id } = filters;

      const filterData = {};
      if (status) filterData.status = status;
      if (order_type) filterData.order_type = order_type;
      if (store_id) filterData.store_id = parseInt(store_id);
      if (customer_id) filterData.customer_id = parseInt(customer_id);
      if (motoboy_id) filterData.motoboy_id = parseInt(motoboy_id);

      return await DeliveryOrder.findAll(parseInt(page), parseInt(limit), filterData);
    } catch (error) {
      console.error('Erro ao buscar pedidos com filtros:', error);
      throw error;
    }
  }

  // Processar expiração de pedidos pendentes
  static async processPendingOrderExpirations() {
    try {
      // Buscar pedidos pendentes há mais de 30 minutos
      const thirtyMinutesAgo = new Date();
      thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);

      const expiredOrders = await DeliveryOrder.findAll(1, 100, {
        status: 'pending',
        created_to: thirtyMinutesAgo.toISOString()
      });

      const results = [];
      for (const order of expiredOrders.data.orders) {
        try {
          await this.cancelOrder(order.id, 'Pedido expirado por tempo limite', 'system');
          results.push(order.id);

          // Notificar loja
          await NotificationService.sendNotification(
            order.store_id,
            'Pedido expirado',
            'Seu pedido expirou por tempo limite',
            {
              type: 'order_expired',
              order_id: order.id
            }
          );
        } catch (error) {
          console.error(`Erro ao expirar pedido ${order.id}:`, error);
        }
      }

      return results;
    } catch (error) {
      console.error('Erro ao processar expiração de pedidos:', error);
      throw error;
    }
  }
}

module.exports = DeliveryOrderService;
