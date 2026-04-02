const knex = require('../config/database');

class Mechanic {
  // Buscar mecânicos por proximidade (raio em km)
  static async findByProximity(lat, lng, radius) {
    try {
      const mechanics = await knex('mechanics')
        .select('*')
        .select(knex.raw(`
          (6371 * acos(cos(radians(?)) * cos(radians(latitude)) * 
           cos(radians(longitude) - radians(?)) + 
           sin(radians(?)) * sin(radians(latitude)))) AS distance
        `, [lat, lng, lat]))
        .whereRaw(`
          (6371 * acos(cos(radians(?)) * cos(radians(latitude)) * 
           cos(radians(longitude) - radians(?)) + 
           sin(radians(?)) * sin(radians(latitude)))) <= ?
        `, [lat, lng, lat, radius])
        .where('is_available', true)
        .where('is_verified', true)
        .orderBy('distance', 'asc');
      
      return mechanics;
    } catch (error) {
      console.error('Erro ao buscar mecânicos por proximidade:', error);
      throw error;
    }
  }

  // Buscar mecânicos por especialidade
  static async findBySpecialty(specialty) {
    try {
      const mechanics = await knex('mechanics')
        .whereRaw("specialties::text ILIKE ?", [`%${specialty}%`])
        .where('is_available', true)
        .where('is_verified', true)
        .orderBy('rating', 'desc');
      
      return mechanics;
    } catch (error) {
      console.error('Erro ao buscar mecânicos por especialidade:', error);
      throw error;
    }
  }

  // Buscar mecânicos com filtros avançados
  static async findByFilters(filters) {
    try {
      let query = knex('mechanics')
        .where('is_available', true)
        .where('is_verified', true);

      if (filters.specialty) {
        query = query.whereRaw("specialties::text ILIKE ?", [`%${filters.specialty}%`]);
      }

      if (filters.minRating) {
        query = query.where('rating', '>=', filters.minRating);
      }

      if (filters.maxPrice) {
        query = query.where('hourly_rate', '<=', filters.maxPrice);
      }

      if (filters.emergencyService) {
        query = query.where('emergency_service', true);
      }

      if (filters.homeService) {
        query = query.where('home_service', true);
      }

      if (filters.workshopService) {
        query = query.where('workshop_service', true);
      }

      return await query.orderBy('rating', 'desc');
    } catch (error) {
      console.error('Erro ao buscar mecânicos com filtros:', error);
      throw error;
    }
  }

  // Buscar mecânico por ID com detalhes completos
  static async findByIdWithDetails(id) {
    try {
      const mechanic = await knex('mechanics')
        .where('id', id)
        .first();

      if (!mechanic) return null;

      // Buscar serviços do mecânico
      const services = await knex('services')
        .where('mechanic_id', id)
        .where('is_available', true);

      // Buscar avaliações do mecânico
      const reviews = await knex('reviews')
        .where('mechanic_id', id)
        .where('is_verified', true)
        .orderBy('created_at', 'desc')
        .limit(5);

      return {
        ...mechanic,
        services,
        reviews
      };
    } catch (error) {
      console.error('Erro ao buscar mecânico com detalhes:', error);
      throw error;
    }
  }

  // Criar novo mecânico
  static async create(mechanicData) {
    try {
      const [id] = await knex('mechanics').insert(mechanicData).returning('id');
      return await this.findById(id);
    } catch (error) {
      console.error('Erro ao criar mecânico:', error);
      throw error;
    }
  }

  // Atualizar mecânico
  static async update(id, updateData) {
    try {
      await knex('mechanics')
        .where('id', id)
        .update(updateData);
      
      return await this.findById(id);
    } catch (error) {
      console.error('Erro ao atualizar mecânico:', error);
      throw error;
    }
  }

  // Deletar mecânico
  static async delete(id) {
    try {
      await knex('mechanics').where('id', id).del();
      return true;
    } catch (error) {
      console.error('Erro ao deletar mecânico:', error);
      throw error;
    }
  }

  // Buscar mecânico por ID
  static async findById(id) {
    try {
      return await knex('mechanics').where('id', id).first();
    } catch (error) {
      console.error('Erro ao buscar mecânico por ID:', error);
      throw error;
    }
  }

  // Buscar mecânico por user_id
  static async findByUserId(userId) {
    try {
      return await knex('mechanics').where('user_id', userId).first();
    } catch (error) {
      console.error('Erro ao buscar mecânico por user_id:', error);
      throw error;
    }
  }

  // Listar todos os mecânicos
  static async findAll(page = 1, limit = 20, filters = {}) {
    try {
      let query = knex('mechanics');

      // Aplicar filtros
      if (filters.is_verified !== undefined) {
        query = query.where('is_verified', filters.is_verified);
      }

      if (filters.is_available !== undefined) {
        query = query.where('is_available', filters.is_available);
      }

      if (filters.specialty) {
        query = query.whereRaw("specialties::text ILIKE ?", [`%${filters.specialty}%`]);
      }

      // Contar total
      const [{ count }] = await query.clone().count('* as count');

      // Aplicar paginação
      const offset = (page - 1) * limit;
      const mechanics = await query
        .orderBy('created_at', 'desc')
        .offset(offset)
        .limit(limit);

      return {
        mechanics,
        pagination: {
          page,
          limit,
          total: parseInt(count),
          pages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      console.error('Erro ao listar mecânicos:', error);
      throw error;
    }
  }
}

module.exports = Mechanic;
