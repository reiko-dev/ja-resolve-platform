const knex = require('../config/database');

class Review {
  static tableName = 'reviews';
  static operationalEntityTypes = ['appointment', 'purchase_order', 'delivery_order', 'emergency_request'];

  static baseSelect() {
    return [
      'reviews.*',
      'users.name as user_name',
      'mechanics.business_name as mechanic_name',
      'partners.business_name as partner_name',
      'partners.type as partner_type'
    ];
  }

  static async resolveTargets({ mechanic_id, partner_id }, { allowAnyPartnerType = false } = {}) {
    let normalizedMechanicId = mechanic_id || null;
    let normalizedPartnerId = partner_id || null;

    if (normalizedMechanicId) {
      const mechanic = await knex('mechanics')
        .select('mechanics.id', 'mechanics.user_id')
        .where('mechanics.id', normalizedMechanicId)
        .first();

      if (!mechanic) {
        throw new Error('Mecânico não encontrado');
      }

      const partner = await knex('partners')
        .select('id')
        .where('user_id', mechanic.user_id)
        .first();

      normalizedPartnerId = normalizedPartnerId || partner?.id || null;
    }

    if (normalizedPartnerId && !normalizedMechanicId) {
      const partner = await knex('partners')
        .select('id', 'user_id', 'type')
        .where('id', normalizedPartnerId)
        .first();

      if (!partner) {
        throw new Error('Parceiro não encontrado');
      }

      if (!allowAnyPartnerType && partner.type !== 'mechanic') {
        throw new Error('A trilha explícita de reviews ainda está limitada ao parceiro mechanic');
      }

      const mechanic = await knex('mechanics')
        .select('id')
        .where('user_id', partner.user_id)
        .first();

      normalizedMechanicId = mechanic?.id || null;
    }

    return {
      mechanic_id: normalizedMechanicId,
      partner_id: normalizedPartnerId
    };
  }

  static normalizeEntity(reviewData) {
    const entity_type = reviewData.entity_type || null;
    const entity_id = reviewData.entity_id ? parseInt(reviewData.entity_id, 10) : null;

    if (!entity_type && !entity_id) {
      return { entity_type: null, entity_id: null };
    }

    if (!entity_type || !entity_id) {
      throw new Error('entity_type e entity_id são obrigatórios para reviews operacionais');
    }

    if (!this.operationalEntityTypes.includes(entity_type)) {
      throw new Error('entity_type inválido para review operacional');
    }

    return { entity_type, entity_id };
  }

  // Buscar avaliações por mecânico
  static async findByMechanicId(mechanicId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const [reviews, total] = await Promise.all([
      knex(this.tableName)
        .select(this.baseSelect())
        .join('users', 'reviews.user_id', 'users.id')
        .leftJoin('mechanics', 'reviews.mechanic_id', 'mechanics.id')
        .leftJoin('partners', 'reviews.partner_id', 'partners.id')
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

  static async findByPartnerId(partnerId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      knex(this.tableName)
        .select(this.baseSelect())
        .join('users', 'reviews.user_id', 'users.id')
        .leftJoin('mechanics', 'reviews.mechanic_id', 'mechanics.id')
        .leftJoin('partners', 'reviews.partner_id', 'partners.id')
        .where('reviews.partner_id', partnerId)
        .where('reviews.is_public', true)
        .orderBy('reviews.created_at', 'desc')
        .limit(limit)
        .offset(offset),
      knex(this.tableName)
        .where('partner_id', partnerId)
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
        .select(this.baseSelect())
        .leftJoin('mechanics', 'reviews.mechanic_id', 'mechanics.id')
        .leftJoin('partners', 'reviews.partner_id', 'partners.id')
        .join('users', 'reviews.user_id', 'users.id')
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
    const normalizedEntity = this.normalizeEntity(reviewData);
    if (normalizedEntity.entity_type && normalizedEntity.entity_id) {
      return this.upsertOperationalReview(reviewData);
    }

    const resolvedTargets = await this.resolveTargets(reviewData);

    // Verificar se o usuário já avaliou este mecânico
    let existingReview = null;
    if (resolvedTargets.partner_id) {
      existingReview = await knex(this.tableName)
        .where('user_id', reviewData.user_id)
        .where('partner_id', resolvedTargets.partner_id)
        .first();
    } else if (resolvedTargets.mechanic_id) {
      existingReview = await knex(this.tableName)
        .where('user_id', reviewData.user_id)
        .where('mechanic_id', resolvedTargets.mechanic_id)
        .first();
    }

    if (existingReview) {
      throw new Error('Usuário já avaliou este parceiro');
    }

    const [inserted] = await knex(this.tableName).insert({
      ...reviewData,
      ...resolvedTargets
    }).returning('id');

    const id = typeof inserted === 'object' ? inserted.id : inserted;
    
    if (resolvedTargets.mechanic_id) {
      await this.updateMechanicRating(resolvedTargets.mechanic_id);
    }
    if (resolvedTargets.partner_id) {
      await this.updatePartnerRating(resolvedTargets.partner_id);
    }
    
    return this.findById(id);
  }

  static async upsertOperationalReview(reviewData) {
    const normalizedEntity = this.normalizeEntity(reviewData);
    const resolvedTargets = await this.resolveTargets(reviewData, { allowAnyPartnerType: true });

    const payload = {
      user_id: reviewData.user_id,
      mechanic_id: resolvedTargets.mechanic_id,
      partner_id: resolvedTargets.partner_id,
      appointment_id: normalizedEntity.entity_type === 'appointment'
        ? normalizedEntity.entity_id
        : (reviewData.appointment_id || null),
      entity_type: normalizedEntity.entity_type,
      entity_id: normalizedEntity.entity_id,
      rating: reviewData.rating,
      comment: reviewData.comment || null,
      is_public: reviewData.is_public !== undefined ? reviewData.is_public : true,
      is_verified: reviewData.is_verified !== undefined ? reviewData.is_verified : false,
    };

    const existingReview = await knex(this.tableName)
      .where('user_id', reviewData.user_id)
      .where('entity_type', normalizedEntity.entity_type)
      .where('entity_id', normalizedEntity.entity_id)
      .first();

    let reviewId;
    if (existingReview) {
      await knex(this.tableName)
        .where('id', existingReview.id)
        .update({
          ...payload,
          updated_at: knex.fn.now()
        });
      reviewId = existingReview.id;
    } else {
      const [inserted] = await knex(this.tableName)
        .insert(payload)
        .returning('id');

      reviewId = typeof inserted === 'object' ? inserted.id : inserted;
    }

    if (resolvedTargets.mechanic_id) {
      await this.updateMechanicRating(resolvedTargets.mechanic_id);
    }
    if (resolvedTargets.partner_id) {
      await this.updatePartnerRating(resolvedTargets.partner_id);
    }

    return this.findById(reviewId);
  }

  // Atualizar avaliação
  static async update(id, reviewData) {
    await knex(this.tableName).where('id', id).update(reviewData);
    
    const review = await this.findById(id);
    if (review.mechanic_id) {
      await this.updateMechanicRating(review.mechanic_id);
    }
    if (review.partner_id) {
      await this.updatePartnerRating(review.partner_id);
    }
    
    return this.findById(id);
  }

  // Deletar avaliação
  static async delete(id) {
    const review = await this.findById(id);
    const result = await knex(this.tableName).where('id', id).del();
    
    if (result > 0) {
      if (review.mechanic_id) {
        await this.updateMechanicRating(review.mechanic_id);
      }
      if (review.partner_id) {
        await this.updatePartnerRating(review.partner_id);
      }
    }
    
    return result > 0;
  }

  // Buscar por ID
  static async findById(id) {
    return knex(this.tableName)
      .select(this.baseSelect())
      .join('users', 'reviews.user_id', 'users.id')
      .leftJoin('mechanics', 'reviews.mechanic_id', 'mechanics.id')
      .leftJoin('partners', 'reviews.partner_id', 'partners.id')
      .where('reviews.id', id)
      .first();
  }

  // Verificar avaliação (admin)
  static async setVerified(id, isVerified) {
    await knex(this.tableName).where('id', parseInt(id)).update({ is_verified: isVerified });

    const review = await this.findById(parseInt(id));
    if (review?.mechanic_id) {
      await this.updateMechanicRating(review.mechanic_id);
    }
    if (review?.partner_id) {
      await this.updatePartnerRating(review.partner_id);
    }

    return review;
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

  static async updatePartnerRating(partnerId) {
    const result = await knex(this.tableName)
      .where('partner_id', partnerId)
      .where('is_public', true)
      .avg('rating as avg_rating')
      .count('* as total_reviews')
      .first();

    const avgRating = parseFloat(result.avg_rating || 0);
    const totalReviews = parseInt(result.total_reviews || 0);

    await knex('partners')
      .where('id', partnerId)
      .update({
        rating: avgRating,
        total_reviews: totalReviews,
        updated_at: knex.fn.now()
      });
  }

  // Listar todas com paginação
  static async findAll(page = 1, limit = 20, filters = {}) {
    const offset = (page - 1) * limit;
    
    let query = knex(this.tableName)
      .select(this.baseSelect())
      .join('users', 'reviews.user_id', 'users.id')
      .leftJoin('mechanics', 'reviews.mechanic_id', 'mechanics.id')
      .leftJoin('partners', 'reviews.partner_id', 'partners.id');

    // Aplicar filtros
    if (filters.mechanicId) {
      query = query.where('reviews.mechanic_id', filters.mechanicId);
    }

    if (filters.partnerId) {
      query = query.where('reviews.partner_id', filters.partnerId);
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
