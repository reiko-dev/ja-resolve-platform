const knex = require('../config/database');

class Mechanic {
  static buildEligiblePartnerQuery() {
    return knex('partners')
      .select(
        'partners.id',
        'partners.id as partner_id',
        'mechanics.id as legacy_mechanic_id',
        'partners.user_id',
        'partners.business_name',
        'partners.description',
        'partners.specialties',
        'partners.address',
        'partners.latitude',
        'partners.longitude',
        'partners.phone',
        'partners.whatsapp',
        'partners.website',
        'partners.instagram',
        'partners.facebook',
        'partners.hourly_rate',
        'partners.service_fee',
        'partners.is_verified',
        'partners.is_available',
        'partners.working_hours',
        'partners.payment_methods',
        'partners.service_areas',
        'partners.experience_years',
        'partners.certifications',
        'partners.insurance_info',
        'partners.warranty_info',
        'partners.emergency_service',
        'partners.home_service',
        'partners.workshop_service',
        'partners.rating',
        'partners.total_reviews',
        'partners.created_at',
        'partners.updated_at',
        'subscriptions.status as subscription_status',
        'subscriptions.next_billing_date',
        knex.raw(`'partners' as source`)
      )
      .join('subscriptions', 'subscriptions.partner_id', 'partners.id')
      .leftJoin('mechanics', 'mechanics.user_id', 'partners.user_id')
      .where('partners.type', 'mechanic')
      .where('partners.approval_status', 'approved')
      .where('partners.is_verified', true)
      .where('partners.is_available', true)
      .where('subscriptions.status', 'active')
      .where('subscriptions.next_billing_date', '>=', new Date());
  }

  static async findEligibleByProximity(lat, lng, radius = 10, limit = 20) {
    try {
      return await this.buildEligiblePartnerQuery()
        .select(
          knex.raw(`
            6371 * acos(
              cos(radians(?)) * cos(radians(partners.latitude)) *
              cos(radians(partners.longitude) - radians(?)) +
              sin(radians(?)) * sin(radians(partners.latitude))
            ) AS distance
          `, [lat, lng, lat])
        )
        .whereNotNull('partners.latitude')
        .whereNotNull('partners.longitude')
        .whereRaw(`
          6371 * acos(
            cos(radians(?)) * cos(radians(partners.latitude)) *
            cos(radians(partners.longitude) - radians(?)) +
            sin(radians(?)) * sin(radians(partners.latitude))
          ) <= ?
        `, [lat, lng, lat, radius])
        .orderBy('distance', 'asc')
        .limit(limit);
    } catch (error) {
      console.error('Erro ao buscar mecânicos elegíveis por proximidade:', error);
      throw error;
    }
  }

  static async findEligibleBySpecialty(specialty, limit = 20) {
    try {
      return await this.buildEligiblePartnerQuery()
        .whereRaw("COALESCE(partners.specialties::text, '') ILIKE ?", [`%${specialty}%`])
        .orderBy('partners.rating', 'desc')
        .limit(limit);
    } catch (error) {
      console.error('Erro ao buscar mecânicos elegíveis por especialidade:', error);
      throw error;
    }
  }

  static async findEligibleByFilters(filters = {}, limit = 20) {
    try {
      let query = this.buildEligiblePartnerQuery();

      if (filters.specialty) {
        query = query.whereRaw("COALESCE(partners.specialties::text, '') ILIKE ?", [`%${filters.specialty}%`]);
      }

      if (filters.minRating) {
        query = query.where('partners.rating', '>=', filters.minRating);
      }

      if (filters.maxPrice) {
        query = query.where('partners.hourly_rate', '<=', filters.maxPrice);
      }

      if (filters.emergencyService) {
        query = query.where('partners.emergency_service', true);
      }

      if (filters.homeService) {
        query = query.where('partners.home_service', true);
      }

      if (filters.workshopService) {
        query = query.where('partners.workshop_service', true);
      }

      if (filters.lat && filters.lng) {
        const radius = filters.radius || 10;
        query = query
          .select(
            knex.raw(`
              6371 * acos(
                cos(radians(?)) * cos(radians(partners.latitude)) *
                cos(radians(partners.longitude) - radians(?)) +
                sin(radians(?)) * sin(radians(partners.latitude))
              ) AS distance
            `, [filters.lat, filters.lng, filters.lat])
          )
          .whereNotNull('partners.latitude')
          .whereNotNull('partners.longitude')
          .whereRaw(`
            6371 * acos(
              cos(radians(?)) * cos(radians(partners.latitude)) *
              cos(radians(partners.longitude) - radians(?)) +
              sin(radians(?)) * sin(radians(partners.latitude))
            ) <= ?
          `, [filters.lat, filters.lng, filters.lat, radius])
          .orderBy('distance', 'asc');
      } else {
        query = query.orderBy('partners.rating', 'desc');
      }

      return await query.limit(limit);
    } catch (error) {
      console.error('Erro ao buscar mecânicos elegíveis com filtros:', error);
      throw error;
    }
  }

  static async findEligibleById(id) {
    try {
      return await this.buildEligiblePartnerQuery()
        .where('partners.id', id)
        .first();
    } catch (error) {
      console.error('Erro ao buscar mecânico elegível por ID:', error);
      throw error;
    }
  }

  static async findEligibleWithDetails(id) {
    try {
      const mechanic = await this.findEligibleById(id);
      if (!mechanic) return null;

      const legacyMechanicId = await this.resolveLegacyMechanicId(id);
      const services = legacyMechanicId
        ? await knex('services').where('mechanic_id', legacyMechanicId).where('is_available', true)
        : [];
      const reviewsQuery = knex('reviews')
        .where('is_verified', true)
        .orderBy('created_at', 'desc')
        .limit(5);

      if (legacyMechanicId) {
        reviewsQuery.where(function () {
          this.where('mechanic_id', legacyMechanicId).orWhere('partner_id', id);
        });
      } else {
        reviewsQuery.where('partner_id', id);
      }

      const reviews = await reviewsQuery;

      return {
        ...mechanic,
        services,
        reviews,
      };
    } catch (error) {
      console.error('Erro ao buscar mecânico elegível com detalhes:', error);
      throw error;
    }
  }

  static async findEligibleAll(page = 1, limit = 20, filters = {}) {
    try {
      let query = this.buildEligiblePartnerQuery();

      if (filters.specialty) {
        query = query.whereRaw("COALESCE(partners.specialties::text, '') ILIKE ?", [`%${filters.specialty}%`]);
      }

      const countQuery = query.clone().clearSelect().countDistinct('partners.id as count').first();
      const offset = (page - 1) * limit;
      const mechanicsQuery = query
        .orderBy('partners.created_at', 'desc')
        .offset(offset)
        .limit(limit);

      const [mechanics, total] = await Promise.all([mechanicsQuery, countQuery]);

      return {
        mechanics,
        pagination: {
          page,
          limit,
          total: parseInt(total.count, 10),
          pages: Math.ceil(parseInt(total.count, 10) / limit),
        },
      };
    } catch (error) {
      console.error('Erro ao listar mecânicos elegíveis:', error);
      throw error;
    }
  }

  static async resolveLegacyMechanicId(publicMechanicId) {
    const directMechanic = await knex('mechanics').where('id', publicMechanicId).first();
    if (directMechanic) {
      return directMechanic.id;
    }

    const partner = await knex('partners').where('id', publicMechanicId).first();
    if (!partner) {
      return null;
    }

    const linkedMechanic = await knex('mechanics').where('user_id', partner.user_id).first();
    return linkedMechanic?.id || null;
  }

  static async create(mechanicData) {
    try {
      const [id] = await knex('mechanics').insert(mechanicData).returning('id');
      return await this.findById(id);
    } catch (error) {
      console.error('Erro ao criar mecânico:', error);
      throw error;
    }
  }

  static async update(id, updateData) {
    try {
      await knex('mechanics').where('id', id).update(updateData);
      return await this.findById(id);
    } catch (error) {
      console.error('Erro ao atualizar mecânico:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      await knex('mechanics').where('id', id).del();
      return true;
    } catch (error) {
      console.error('Erro ao deletar mecânico:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      return await knex('mechanics').where('id', id).first();
    } catch (error) {
      console.error('Erro ao buscar mecânico legado por ID:', error);
      throw error;
    }
  }

  static async findByUserId(userId) {
    try {
      return await knex('mechanics').where('user_id', userId).first();
    } catch (error) {
      console.error('Erro ao buscar mecânico legado por user_id:', error);
      throw error;
    }
  }
}

module.exports = Mechanic;
