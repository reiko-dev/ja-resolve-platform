const knex = require('../config/database');

class Review {
  static tableName = 'reviews';

  // Buscar avaliações por mecânico
  static async findByMechanicId(mechanicId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const [reviews, total] = await Promise.all([
      knex(this.tableName)
        .select('reviews.*', 'users.name as user_name')
        .join('users', 'reviews.user_id', 'users.id')
        .where('reviews.mechanic_id', mechanicId)
        .where('reviews.is_public', true)
        .orderBy('reviews.created_at', 'desc')
        .limit(limit)
        .offset(offset),
      knex(this.tableName)
        .where('mechanic_id', mechanicId)
        .where('is_public', true)
        .count('* as total')
        .first()
    ]);

    return {
      reviews,
      pagination: {
        page,
        limit,
        total: parseInt(total.total),
        pages: Math.ceil(total.total / limit)
      }
    };
  }

  // Buscar avaliações por usuário
  static async findByUserId(userId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const [reviews, total] = await Promise.all([
      knex(this.tableName)
        .select('reviews.*', 'mechanics.business_name')
        .join('mechanics', 'reviews.mechanic_id', 'mechanics.id')
        .where('reviews.user_id', userId)
        .orderBy('reviews.created_at', 'desc')
        .limit(limit)
        .offset(offset),
      knex(this.tableName)
        .where('user_id', userId)
        .count('* as total')
        .first()
    ]);

    return {
      reviews,
      pagination: {
        page,
        limit,
        total: parseInt(total.total),
        pages: Math.ceil(total.total / limit)
      }
    };
  }

  // Criar nova avaliação
  static async create(reviewData) {
    // Verificar se o usuário já avaliou este mecânico
    const existingReview = await knex(this.tableName)
      .where('user_id', reviewData.user_id)
      .where('mechanic_id', reviewData.mechanic_id)
      .first();

    if (existingReview) {
      throw new Error('Usuário já avaliou este mecânico');
    }

    const [id] = await knex(this.tableName).insert(reviewData);
    
    // Atualizar rating médio do mecânico
    await this.updateMechanicRating(reviewData.mechanic_id);
    
    return this.findById(id);
  }

  // Atualizar avaliação
  static async update(id, reviewData) {
    await knex(this.tableName).where('id', id).update(reviewData);
    
    // Atualizar rating médio do mecânico
    const review = await this.findById(id);
    await this.updateMechanicRating(review.mechanic_id);
    
    return this.findById(id);
  }

  // Deletar avaliação
  static async delete(id) {
    const review = await this.findById(id);
    const result = await knex(this.tableName).where('id', id).del();
    
    if (result > 0) {
      // Atualizar rating médio do mecânico
      await this.updateMechanicRating(review.mechanic_id);
    }
    
    return result > 0;
  }

  // Buscar por ID
  static async findById(id) {
    return knex(this.tableName).where('id', id).first();
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
      
      const review = await this.findById(parseInt(id));
      if (!review) {
        return res.status(404).json({
          success: false,
          message: 'Avaliação não encontrada'
        });
      }
      
      await knex(this.tableName).where('id', parseInt(id)).update({ is_verified });
      
      // Atualizar rating médio do mecânico
      await this.updateMechanicRating(review.mechanic_id);
      
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

  // Atualizar rating médio do mecânico
  static async updateMechanicRating(mechanicId) {
    const result = await knex(this.tableName)
      .where('mechanic_id', mechanicId)
      .where('is_public', true)
      .avg('rating as avg_rating')
      .count('* as total_reviews')
      .first();

    const avgRating = parseFloat(result.avg_rating || 0);
    const totalReviews = parseInt(result.total_reviews || 0);

    await knex('mechanics')
      .where('id', mechanicId)
      .update({
        rating: avgRating,
        total_reviews: totalReviews
      });
  }

  // Listar todas com paginação
  static async findAll(page = 1, limit = 20, filters = {}) {
    const offset = (page - 1) * limit;
    
    let query = knex(this.tableName)
      .select('reviews.*', 'users.name as user_name', 'mechanics.business_name')
      .join('users', 'reviews.user_id', 'users.id')
      .join('mechanics', 'reviews.mechanic_id', 'mechanics.id');

    // Aplicar filtros
    if (filters.mechanicId) {
      query = query.where('reviews.mechanic_id', filters.mechanicId);
    }

    if (filters.userId) {
      query = query.where('reviews.user_id', filters.userId);
    }

    if (filters.rating) {
      query = query.where('reviews.rating', filters.rating);
    }

    if (filters.isVerified !== undefined) {
      query = query.where('reviews.is_verified', filters.isVerified);
    }

    const [reviews, total] = await Promise.all([
      query.orderBy('reviews.created_at', 'desc')
        .limit(limit)
        .offset(offset),
      knex(this.tableName).count('* as total').first()
    ]);

    return {
      reviews,
      pagination: {
        page,
        limit,
        total: parseInt(total.total),
        pages: Math.ceil(total.total / limit)
      }
    };
  }
}

module.exports = Review;
