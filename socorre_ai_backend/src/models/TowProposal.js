  const knex = require('../config/database');

class TowProposal {
  // Criar nova proposta
  static async create(proposalData) {
    const [proposal] = await knex('tow_proposals').insert(proposalData).returning('*');
    return proposal;
  }

  // Buscar por ID
  static async findById(id) {
    return await knex('tow_proposals')
      .select(
        'tow_proposals.*',
        'partners.business_name',
        'partners.phone',
        'partners.rating',
        'tow_proposals.tow_truck_type',
        'tow_proposals.tow_capacity_kg',
        'emergency_requests.user_id as emergency_user_id',
        'users.name as user_name',
        'users.phone as user_phone'
      )
      .join('partners', 'tow_proposals.partner_id', 'partners.id')
      .join('emergency_requests', 'tow_proposals.emergency_request_id', 'emergency_requests.id')
      .join('users', 'partners.user_id', 'users.id')
      .where('tow_proposals.id', id)
      .first();
  }

  // Buscar propostas de uma emergência
  static async findByEmergency(emergencyRequestId, status = null) {
    let query = knex('tow_proposals')
      .select(
        'tow_proposals.*',
        'partners.business_name',
        'partners.phone',
        'partners.rating',
        'tow_proposals.tow_truck_type',
        'tow_proposals.tow_capacity_kg',
        'partners.latitude',
        'partners.longitude',
        'users.name as user_name',
        'users.phone as user_phone',
        knex.raw(`
          6371 * acos(
            cos(radians(partners.latitude)) * cos(radians((SELECT latitude FROM emergency_requests WHERE id = ?))) * 
            cos(radians(partners.longitude) - radians((SELECT longitude FROM emergency_requests WHERE id = ?))) + 
            sin(radians(partners.latitude)) * sin(radians((SELECT latitude FROM emergency_requests WHERE id = ?)))
          ) AS partner_distance_km
        `, [emergencyRequestId, emergencyRequestId, emergencyRequestId])
      )
      .join('partners', 'tow_proposals.partner_id', 'partners.id')
      .join('users', 'partners.user_id', 'users.id')
      .where('tow_proposals.emergency_request_id', emergencyRequestId);

    if (status) {
      query = query.where('tow_proposals.status', status);
    }

    return await query.orderBy('tow_proposals.created_at', 'asc');
  }

  // Buscar propostas de um parceiro
  static async findByPartner(partnerId, status = null) {
    let query = knex('tow_proposals')
      .select(
        'tow_proposals.*',
        'emergency_requests.type',
        'emergency_requests.description',
        'emergency_requests.latitude',
        'emergency_requests.longitude',
        'emergency_requests.address',
        'emergency_requests.urgency',
        'users.name as user_name',
        'users.phone as user_phone'
      )
      .join('emergency_requests', 'tow_proposals.emergency_request_id', 'emergency_requests.id')
      .join('users', 'emergency_requests.user_id', 'users.id')
      .where('tow_proposals.partner_id', partnerId);

    if (status) {
      query = query.where('tow_proposals.status', status);
    }

    return await query.orderBy('tow_proposals.created_at', 'desc');
  }

  // Aceitar proposta
  static async accept(id) {
    const [proposal] = await knex('tow_proposals')
      .where('id', id)
      .where('status', 'pending')
      .where('expires_at', '>', new Date())
      .update({
        status: 'accepted',
        accepted_at: knex.fn.now(),
        responded_at: knex.fn.now()
      })
      .returning('*');

    if (proposal) {
      // Rejeitar outras propostas da mesma emergência
      await knex('tow_proposals')
        .where('emergency_request_id', proposal.emergency_request_id)
        .where('id', '!=', id)
        .where('status', 'pending')
        .update({
          status: 'rejected',
          responded_at: knex.fn.now()
        });
    }

    return proposal;
  }

  // Rejeitar proposta
  static async reject(id) {
    const [proposal] = await knex('tow_proposals')
      .where('id', id)
      .where('status', 'pending')
      .update({
        status: 'rejected',
        responded_at: knex.fn.now()
      })
      .returning('*');
    return proposal;
  }

  // Retirar proposta (pelo parceiro)
  static async withdraw(id) {
    const [proposal] = await knex('tow_proposals')
      .where('id', id)
      .where('status', 'pending')
      .update({
        status: 'withdrawn',
        responded_at: knex.fn.now()
      })
      .returning('*');
    return proposal;
  }

  // Marcar proposta como expirada
  static async expire(id) {
    const [proposal] = await knex('tow_proposals')
      .where('id', id)
      .where('status', 'pending')
      .where('expires_at', '<=', new Date())
      .update({
        status: 'expired',
        responded_at: knex.fn.now()
      })
      .returning('*');
    return proposal;
  }

  // Expirar todas as propostas pendentes de uma emergência
  static async expireAllByEmergency(emergencyRequestId) {
    return await knex('tow_proposals')
      .where('emergency_request_id', emergencyRequestId)
      .where('status', 'pending')
      .where('expires_at', '<=', new Date())
      .update({
        status: 'expired',
        responded_at: knex.fn.now()
      });
  }

  // Incrementar contador de visualizações
  static async incrementViews(id) {
    return await knex('tow_proposals')
      .where('id', id)
      .update({
        view_count: knex.raw('view_count + 1'),
        last_viewed_at: knex.fn.now()
      });
  }

  // Atualizar proposta
  static async update(id, proposalData) {
    const [proposal] = await knex('tow_proposals')
      .where('id', id)
      .update({ ...proposalData, updated_at: knex.fn.now() })
      .returning('*');
    return proposal;
  }

  // Listar com paginação e filtros
  static async findAll(page = 1, limit = 10, filters = {}) {
    const offset = (page - 1) * limit;
    
    let query = knex('tow_proposals')
      .select(
        'tow_proposals.*',
        'partners.business_name',
        'partners.type as partner_type',
        'users.name as user_name',
        'emergency_requests.type as emergency_type',
        'emergency_requests.urgency'
      )
      .join('partners', 'tow_proposals.partner_id', 'partners.id')
      .join('users', 'partners.user_id', 'users.id')
      .join('emergency_requests', 'tow_proposals.emergency_request_id', 'emergency_requests.id');

    // Aplicar filtros
    if (filters.status) {
      query = query.where('tow_proposals.status', filters.status);
    }
    if (filters.partner_type) {
      query = query.where('partners.type', filters.partner_type);
    }
    if (filters.emergency_type) {
      query = query.where('emergency_requests.type', filters.emergency_type);
    }
    if (filters.urgency) {
      query = query.where('emergency_requests.urgency', filters.urgency);
    }
    if (filters.price_min) {
      query = query.where('tow_proposals.proposed_price', '>=', filters.price_min);
    }
    if (filters.price_max) {
      query = query.where('tow_proposals.proposed_price', '<=', filters.price_max);
    }
    if (filters.created_from) {
      query = query.where('tow_proposals.created_at', '>=', filters.created_from);
    }
    if (filters.created_to) {
      query = query.where('tow_proposals.created_at', '<=', filters.created_to);
    }
    if (filters.search) {
      query = query.where(function() {
        this.where('partners.business_name', 'like', `%${filters.search}%`)
            .orWhere('users.name', 'like', `%${filters.search}%`)
            .orWhere('tow_proposals.message', 'like', `%${filters.search}%`);
      });
    }

    // Query para contar total
    const countQuery = knex('tow_proposals')
      .join('partners', 'tow_proposals.partner_id', 'partners.id')
      .join('users', 'partners.user_id', 'users.id')
      .join('emergency_requests', 'tow_proposals.emergency_request_id', 'emergency_requests.id');
    
    // Aplicar filtros na query de contagem
    if (filters.status) {
      countQuery.where('tow_proposals.status', filters.status);
    }
    if (filters.partner_type) {
      countQuery.where('partners.type', filters.partner_type);
    }
    if (filters.emergency_type) {
      countQuery.where('emergency_requests.type', filters.emergency_type);
    }
    if (filters.urgency) {
      countQuery.where('emergency_requests.urgency', filters.urgency);
    }
    if (filters.price_min) {
      countQuery.where('tow_proposals.proposed_price', '>=', filters.price_min);
    }
    if (filters.price_max) {
      countQuery.where('tow_proposals.proposed_price', '<=', filters.price_max);
    }
    if (filters.created_from) {
      countQuery.where('tow_proposals.created_at', '>=', filters.created_from);
    }
    if (filters.created_to) {
      countQuery.where('tow_proposals.created_at', '<=', filters.created_to);
    }
    if (filters.search) {
      countQuery.where(function() {
        this.where('partners.business_name', 'like', `%${filters.search}%`)
            .orWhere('users.name', 'like', `%${filters.search}%`)
            .orWhere('tow_proposals.message', 'like', `%${filters.search}%`);
      });
    }

    const [proposals, total] = await Promise.all([
      query.limit(limit).offset(offset).orderBy('tow_proposals.created_at', 'desc'),
      countQuery.count('* as count').first()
    ]);

    return {
      proposals,
      total: total.count,
      page,
      limit,
      totalPages: Math.ceil(total.count / limit)
    };
  }

  // Estatísticas
  static async getStats() {
    const stats = await knex('tow_proposals')
      .select(
        knex.raw('COUNT(*) as total'),
        knex.raw(`COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending`),
        knex.raw(`COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted`),
        knex.raw(`COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected`),
        knex.raw(`COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired`),
        knex.raw(`COUNT(CASE WHEN status = 'withdrawn' THEN 1 END) as withdrawn`),
        knex.raw('AVG(proposed_price) as avg_price'),
        knex.raw('AVG(estimated_time_minutes) as avg_time'),
        knex.raw('AVG(partner_distance_km) as avg_distance'),
        knex.raw('MAX(proposed_price) as max_price'),
        knex.raw('MIN(proposed_price) as min_price')
      )
      .first();

    return stats;
  }

  // Buscar propostas expirando em X minutos
  static async findExpiringSoon(minutes = 5) {
    const futureTime = new Date();
    futureTime.setMinutes(futureTime.getMinutes() + minutes);

    return await knex('tow_proposals')
      .select(
        'tow_proposals.*',
        'partners.business_name',
        'users.name as user_name',
        'users.phone as user_phone'
      )
      .join('partners', 'tow_proposals.partner_id', 'partners.id')
      .join('users', 'partners.user_id', 'users.id')
      .where('tow_proposals.status', 'pending')
      .where('tow_proposals.expires_at', '<=', futureTime)
      .where('tow_proposals.expires_at', '>', new Date())
      .orderBy('tow_proposals.expires_at');
  }

  // Verificar se parceiro já enviou proposta para uma emergência
  static async hasPartnerProposed(emergencyRequestId, partnerId) {
    const proposal = await knex('tow_proposals')
      .where('emergency_request_id', emergencyRequestId)
      .where('partner_id', partnerId)
      .where('status', 'pending')
      .first();

    return !!proposal;
  }

  // Deletar proposta
  static async delete(id) {
    return await knex('tow_proposals').where('id', id).del();
  }
}

module.exports = TowProposal;
