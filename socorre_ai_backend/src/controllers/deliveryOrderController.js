const DeliveryOrder = require('../models/DeliveryOrder');
const { validate } = require('../middleware/validation');

class DeliveryOrderController {
  // Buscar todas as ordens de entrega
  static async getAll(req, res) {
    try {
      const { page = 1, limit = 10, type, status, urgency, search } = req.query;
      
      const filters = {
        type,
        status,
        urgency,
        search
      };

      const result = await DeliveryOrder.findAll(
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
      console.error('Erro ao buscar ordens de entrega:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar ordem por ID
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const order = await DeliveryOrder.findById(id);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Ordem de entrega não encontrada'
        });
      }

      res.json({
        success: true,
        data: order
      });
    } catch (error) {
      console.error('Erro ao buscar ordem de entrega:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Criar nova ordem de entrega
  static async create(req, res) {
    try {
      const orderData = req.body;
      const order = await DeliveryOrder.create(orderData);
      
      res.status(201).json({
        success: true,
        message: 'Ordem de entrega criada com sucesso',
        data: order
      });
    } catch (error) {
      console.error('Erro ao criar ordem de entrega:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Atualizar ordem de entrega
  static async update(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      const order = await DeliveryOrder.update(id, updateData);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Ordem de entrega não encontrada'
        });
      }

      res.json({
        success: true,
        message: 'Ordem de entrega atualizada com sucesso',
        data: order
      });
    } catch (error) {
      console.error('Erro ao atualizar ordem de entrega:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Deletar ordem de entrega
  static async delete(req, res) {
    try {
      const { id } = req.params;
      const deleted = await DeliveryOrder.delete(id);
      
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Ordem de entrega não encontrada'
        });
      }

      res.json({
        success: true,
        message: 'Ordem de entrega deletada com sucesso'
      });
    } catch (error) {
      console.error('Erro ao deletar ordem de entrega:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar ordens por usuário
  static async getByUser(req, res) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      
      const result = await DeliveryOrder.findByUser(
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
      console.error('Erro ao buscar ordens do usuário:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar ordens por motoboy
  static async getByMotoboy(req, res) {
    try {
      const { motoboyId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      
      const result = await DeliveryOrder.findByMotoboy(
        parseInt(motoboyId),
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
      console.error('Erro ao buscar ordens do motoboy:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Atualizar status da ordem
  static async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      
      const order = await DeliveryOrder.updateStatus(id, status, notes);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Ordem de entrega não encontrada'
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

  // Avaliar entrega
  static async rate(req, res) {
    try {
      const { id } = req.params;
      const { rating, review_comment } = req.body;
      
      const order = await DeliveryOrder.rate(id, req.user.id, rating, review_comment);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Ordem de entrega não encontrada'
        });
      }

      res.json({
        success: true,
        message: 'Avaliação registrada com sucesso',
        data: order
      });
    } catch (error) {
      console.error('Erro ao avaliar entrega:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Estatísticas de entregas
  static async getStats(req, res) {
    try {
      const stats = await DeliveryOrder.getStats();
      
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

module.exports = DeliveryOrderController;
