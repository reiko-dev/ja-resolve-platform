const Review = require('../models/Review');

class ReviewController {
  // Listar todas as avaliações (admin)
  static async getAllReviews(req, res) {
    try {
      const { page = 1, limit = 20, ...filters } = req.query;
      const result = await Review.findAll(parseInt(page), parseInt(limit), filters);
      
      res.json({
        success: true,
        data: result.reviews,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Erro ao buscar avaliações:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar avaliações por mecânico
  static async getReviewsByMechanic(req, res) {
    try {
      const { mechanicId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      
      const result = await Review.findByMechanicId(parseInt(mechanicId), parseInt(page), parseInt(limit));
      
      res.json({
        success: true,
        data: result.reviews,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Erro ao buscar avaliações do mecânico:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar avaliações por parceiro
  static async getReviewsByPartner(req, res) {
    try {
      const { partnerId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const result = await Review.findByPartnerId(parseInt(partnerId), parseInt(page), parseInt(limit));

      res.json({
        success: true,
        data: result.reviews,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Erro ao buscar avaliações do parceiro:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar avaliações do usuário logado
  static async getMyReviews(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const result = await Review.findByUserId(req.user.id, parseInt(page), parseInt(limit));
      
      res.json({
        success: true,
        data: result.reviews,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Erro ao buscar avaliações do usuário:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar avaliação por ID
  static async getReviewById(req, res) {
    try {
      const { id } = req.params;
      const review = await Review.findById(parseInt(id));
      
      if (!review) {
        return res.status(404).json({
          success: false,
          message: 'Avaliação não encontrada'
        });
      }
      
      res.json({
        success: true,
        data: review
      });
    } catch (error) {
      console.error('Erro ao buscar avaliação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Criar nova avaliação
  static async createReview(req, res) {
    try {
      const reviewData = {
        ...req.body,
        user_id: req.user.id // ID do usuário logado
      };
      
      const review = await Review.create(reviewData);
      
      res.status(201).json({
        success: true,
        message: 'Avaliação criada com sucesso',
        data: review
      });
    } catch (error) {
      console.error('Erro ao criar avaliação:', error);
      
      if (error.message === 'Usuário já avaliou este parceiro' || error.message === 'Mecânico não encontrado' || error.message === 'Parceiro não encontrado' || error.message === 'A trilha explícita de reviews ainda está limitada ao parceiro mechanic') {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Atualizar avaliação
  static async updateReview(req, res) {
    try {
      const { id } = req.params;
      const review = await Review.findById(parseInt(id));
      
      if (!review) {
        return res.status(404).json({
          success: false,
          message: 'Avaliação não encontrada'
        });
      }
      
      // Verificar se o usuário é o dono da avaliação ou admin
      if (review.user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
      
      const updatedReview = await Review.update(parseInt(id), req.body);
      
      res.json({
        success: true,
        message: 'Avaliação atualizada com sucesso',
        data: updatedReview
      });
    } catch (error) {
      console.error('Erro ao atualizar avaliação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Deletar avaliação
  static async deleteReview(req, res) {
    try {
      const { id } = req.params;
      const review = await Review.findById(parseInt(id));
      
      if (!review) {
        return res.status(404).json({
          success: false,
          message: 'Avaliação não encontrada'
        });
      }
      
      // Verificar se o usuário é o dono da avaliação ou admin
      if (review.user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
      
      await Review.delete(parseInt(id));
      
      res.json({
        success: true,
        message: 'Avaliação deletada com sucesso'
      });
    } catch (error) {
      console.error('Erro ao deletar avaliação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Verificar avaliação (admin)
  static async verifyReview(req, res) {
    try {
      const { id } = req.params;
      const { is_verified } = req.body;
      
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
      
      const review = await Review.findById(parseInt(id));
      if (!review) {
        return res.status(404).json({
          success: false,
          message: 'Avaliação não encontrada'
        });
      }
      
      await Review.setVerified(parseInt(id), is_verified);
      
      res.json({
        success: true,
        message: `Avaliação ${is_verified ? 'verificada' : 'desverificada'} com sucesso`
      });
    } catch (error) {
      console.error('Erro ao verificar avaliação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }
}

module.exports = ReviewController;
