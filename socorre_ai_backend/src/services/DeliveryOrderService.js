const DeliveryOrder = require('../models/DeliveryOrderModel');
const Product = require('../models/Product');
const Partner = require('../models/Partner');
const NotificationService = require('./NotificationService');
const SystemSettings = require('./SystemSettings');

class DeliveryOrderService {
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

      if (!['posto_combustivel', 'auto_pecas'].includes(store.type)) {
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
      const orderDataComplete = {
        order_type,
        store_id,
        customer_id: customerId,
        pickup_address,
        pickup_latitude,
        pickup_longitude,
        delivery_address,
        delivery_latitude,
        delivery_longitude,
        items: JSON.stringify(validatedItems.items),
        items_total: validatedItems.itemsTotal,
        items_count: validatedItems.itemsCount,
        delivery_fee: deliveryFeeData.total_fee,
        platform_fee: platformFee,
        platform_fee_percent: platformFeePercent,
        motoboy_fee: motoboyFee,
        motoboy_fee_percent: motoboyFeePercent,
        total_amount: totalAmount,
        customer_notes
      };

      const order = await DeliveryOrder.create(orderDataComplete);

      // Notificar motoboys próximos
      await this.notifyNearbyMotoboys(order);

      // Notificar loja
      await NotificationService.sendNotification(
        store_id,
        'Novo pedido de delivery!',
        `Novo pedido de ${order_type} recebido`,
        {
          type: 'new_delivery_order',
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

      // Notificar cliente e loja
      await NotificationService.sendNotification(
        order.customer_id,
        'Motoboy a caminho!',
        `Seu pedido foi aceito por ${motoboy.business_name}`,
        {
          type: 'delivery_accepted',
          order_id: orderId,
          motoboy_id
        }
      );

      await NotificationService.sendNotification(
        order.store_id,
        'Pedido aceito',
        `Seu pedido foi aceito por ${motoboy.business_name}`,
        {
          type: 'delivery_accepted_store',
          order_id: orderId,
          motoboy_id
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
      await NotificationService.sendNotification(
        order.customer_id,
        'Pedido a caminho!',
        'Seu pedido está a caminho do destino',
        {
          type: 'delivery_in_transit',
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

      // Notificar cliente e loja
      await NotificationService.sendNotification(
        order.customer_id,
        'Pedido entregue!',
        'Seu pedido foi entregue com sucesso',
        {
          type: 'delivery_completed',
          order_id: orderId
        }
      );

      await NotificationService.sendNotification(
        order.store_id,
        'Pedido entregue',
        'O pedido foi entregue ao cliente',
        {
          type: 'delivery_completed_store',
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
        await NotificationService.sendNotification(
          order.motoboy_id,
          'Pedido cancelado',
          'O cliente cancelou o pedido',
          {
            type: 'delivery_cancelled',
            order_id: orderId
          }
        );
      }

      if (cancelledBy === 'motoboy' || cancelledBy === 'store') {
        await NotificationService.sendNotification(
          order.customer_id,
          'Pedido cancelado',
          'Seu pedido foi cancelado',
          {
            type: 'delivery_cancelled',
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

      return await DeliveryOrder.rate(orderId, parseInt(rating), comment);
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

        if (product.store_id !== storeId) {
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
      const motoboys = await DeliveryOrder.findAvailableForMotoboys(
        order.pickup_latitude,
        order.pickup_longitude,
        10 // raio de 10km
      );

      for (const motoboy of motoboys) {
        await NotificationService.sendNotification(
          motoboy.partner_id,
          'Novo pedido de delivery!',
          `Pedido de ${order.order_type} disponível próximo de você`,
          {
            type: 'new_delivery_order',
            order_id: order.id,
            order_type: order.order_type,
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
    return parseFloat(setting?.setting_value || '20.0');
  }

  static async getMotoboyFeePercent() {
    const setting = await SystemSettings.findByKey('delivery_motoboy_fee_percent');
    return parseFloat(setting?.setting_value || '80.0');
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
      if (!['posto_combustivel', 'auto_pecas'].includes(store.type)) {
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
