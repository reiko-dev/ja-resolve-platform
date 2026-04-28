const DeliveryOrder = require('../models/DeliveryOrderModel');
const Product = require('../models/Product');
const Partner = require('../models/Partner');
const NotificationService = require('../services/NotificationServiceNew');

class DeliveryOrderController {
  // Criar novo pedido de delivery
  static async create(req, res) {
    try {
      const { 
        order_type, 
        store_id, 
        items, 
        pickup_address, 
        delivery_address,
        customer_notes 
      } = req.body;
      const customer_id = req.user.id;

      // Validar dados
      if (!order_type || !store_id || !items || !pickup_address || !delivery_address) {
        return res.status(400).json({ 
          error: 'Dados obrigatórios: order_type, store_id, items, pickup_address, delivery_address' 
        });
      }

      // Validar tipo
      const validTypes = ['fuel', 'auto_parts'];
      if (!validTypes.includes(order_type)) {
        return res.status(400).json({ 
          error: 'Tipo de pedido inválido' 
        });
      }

      // Verificar se loja existe e tem assinatura ativa
      const store = await Partner.findById(store_id);
      if (!store) {
        return res.status(404).json({ error: 'Loja não encontrada' });
      }

      const hasActiveSubscription = await Partner.hasActiveSubscription(store_id);
      if (!hasActiveSubscription) {
        return res.status(400).json({ 
          error: 'Loja não possui assinatura ativa' 
        });
      }

      // Criar pedido
      const orderData = {
        order_type,
        store_id,
        customer_id,
        pickup_address,
        delivery_address,
        items: JSON.stringify(items),
        items_total: items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        items_count: items.reduce((sum, item) => sum + item.quantity, 0),
        delivery_fee: 8.00, // taxa base
        platform_fee: 1.60, // 20% da taxa
        motoboy_fee: 6.40, // 80% da taxa
        total_amount: items.reduce((sum, item) => sum + (item.price * item.quantity), 0) + 8.00,
        customer_notes
      };

      const order = await DeliveryOrder.create(orderData);

      res.status(201).json({
        success: true,
        data: order,
        message: 'Pedido criado com sucesso'
      });

    } catch (error) {
      console.error('Erro ao criar pedido:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Listar pedidos do cliente
  static async findByCustomer(req, res) {
    try {
      const customer_id = req.user.id;
      const { status } = req.query;

      const orders = await DeliveryOrder.findByCustomer(customer_id, status);

      res.json({
        success: true,
        data: orders
      });

    } catch (error) {
      console.error('Erro ao listar pedidos do cliente:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Aceitar pedido (motoboy)
  static async accept(req, res) {
    try {
      const { id } = req.params;
      const motoboy_id = req.user.partner_id;

      const acceptedOrder = await DeliveryOrder.accept(id, motoboy_id);

      res.json({
        success: true,
        data: acceptedOrder,
        message: 'Pedido aceito com sucesso'
      });

    } catch (error) {
      console.error('Erro ao aceitar pedido:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Completar delivery
  static async complete(req, res) {
    try {
      const { id } = req.params;
      const { actual_time_minutes } = req.body;

      const completedOrder = await DeliveryOrder.complete(id, actual_time_minutes);

      res.json({
        success: true,
        data: completedOrder,
        message: 'Pedido entregue com sucesso'
      });

    } catch (error) {
      console.error('Erro ao completar delivery:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Obter estatísticas
  static async getStats(req, res) {
    try {
      const stats = await DeliveryOrder.getStats();

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Erro ao obter estatísticas:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }
}

module.exports = DeliveryOrderController;
