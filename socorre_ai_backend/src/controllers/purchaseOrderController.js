const PurchaseOrder = require('../models/PurchaseOrder');
const { validate } = require('../middleware/validation');

class PurchaseOrderController {
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
        data: result.orders,
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
        data: order
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
      const order = await PurchaseOrder.create(orderData);
      
      res.status(201).json({
        success: true,
        message: 'Pedido de compra criado com sucesso',
        data: order
      });
    } catch (error) {
      console.error('Erro ao criar pedido de compra:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
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
        data: order
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
      
      const result = await PurchaseOrder.findByUser(
        parseInt(userId),
        parseInt(page),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result.orders,
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
      
      const result = await PurchaseOrder.findByStore(
        parseInt(storeId),
        parseInt(page),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result.orders,
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
      
      const order = await PurchaseOrder.updateStatus(id, status, notes);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Pedido de compra não encontrado'
        });
      }

      res.json({
        success: true,
        message: 'Status atualizado com sucesso',
        data: order
      });
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Avaliar compra
  static async rate(req, res) {
    try {
      const { id } = req.params;
      const { rating, review_comment } = req.body;
      
      const order = await PurchaseOrder.rate(id, rating, review_comment);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Pedido de compra não encontrado'
        });
      }

      res.json({
        success: true,
        message: 'Avaliação registrada com sucesso',
        data: order
      });
    } catch (error) {
      console.error('Erro ao avaliar compra:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
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
