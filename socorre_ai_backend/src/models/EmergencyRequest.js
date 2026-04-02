const knex = require('../config/database');

class EmergencyRequest {
  // Criar nova solicitação de emergência
  static async create(requestData) {
    const [request] = await knex('emergency_requests').insert(requestData).returning('*');
    return request;
  }

  // Buscar por ID
  static async findById(id) {
    return await knex('emergency_requests')
      .select(
        'emergency_requests.*',
        'users.name as user_name',
        'users.phone as user_phone',
        'partners.business_name as partner_name',
        'partners.phone as partner_phone'
      )
      .join('users', 'emergency_requests.user_id', 'users.id')
      .leftJoin('partners', 'emergency_requests.partner_id', 'partners.id')
      .where('emergency_requests.id', id)
      .first();
  }

  // Buscar solicitações por usuário
  static async findByUser(userId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const [requests, total] = await Promise.all([
      knex('emergency_requests')
        .select(
          'emergency_requests.*',
          'partners.business_name as partner_name',
          'partners.phone as partner_phone'
        )
        .leftJoin('partners', 'emergency_requests.partner_id', 'partners.id')
        .where('emergency_requests.user_id', userId)
        .limit(limit)
        .offset(offset)
        .orderBy('emergency_requests.created_at', 'desc'),
      
      knex('emergency_requests')
        .where('user_id', userId)
        .count('* as count')
        .first()
    ]);

    return {
      requests,
      total: total.count,
      page,
      limit,
      totalPages: Math.ceil(total.count / limit)
    };
  }

  // Buscar solicitações por parceiro
  static async findByPartner(partnerId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const [requests, total] = await Promise.all([
      knex('emergency_requests')
        .select(
          'emergency_requests.*',
          'users.name as user_name',
          'users.phone as user_phone'
        )
        .join('users', 'emergency_requests.user_id', 'users.id')
        .where('emergency_requests.partner_id', partnerId)
        .limit(limit)
        .offset(offset)
        .orderBy('emergency_requests.created_at', 'desc'),
      
      knex('emergency_requests')
        .where('partner_id', partnerId)
        .count('* as count')
        .first()
    ]);

    return {
      requests,
      total: total.count,
      page,
      limit,
      totalPages: Math.ceil(total.count / limit)
    };
  }

  // Buscar solicitações próximas (para parceiros)
  static async findNearby(latitude, longitude, radius = 15, type = null) {
    let query = knex('emergency_requests')
      .select(
        'emergency_requests.*',
        'users.name as user_name',
        'users.phone as user_phone',
        knex.raw(`
          6371 * acos(
            cos(radians(?)) * cos(radians(latitude)) * 
            cos(radians(longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(latitude))
          ) AS distance
        `, [latitude, longitude, latitude])
      )
      .join('users', 'emergency_requests.user_id', 'users.id')
      .where('emergency_requests.status', 'pending')
      .having('distance', '<=', radius)
      .orderBy('distance');

    if (type) {
      query = query.where('emergency_requests.type', type);
    }

    return await query;
  }

  // Aceitar solicitação (apenas para mecânicos - sem propostas)
  static async accept(id, partnerId, estimatedPrice, estimatedDuration) {
    const [request] = await knex('emergency_requests')
      .where('id', id)
      .where('status', 'pending')
      .where('request_type', 'mecanico') // Apenas mecânicos podem aceitar direto
      .update({
        partner_id: partnerId,
        status: 'accepted',
        estimated_price: estimatedPrice,
        estimated_duration_minutes: estimatedDuration,
        accepted_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    return request;
  }

  // Iniciar serviço
  static async start(id) {
    const [request] = await knex('emergency_requests')
      .where('id', id)
      .where('status', 'accepted')
      .update({
        status: 'in_progress',
        started_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    return request;
  }

  // Completar serviço
  static async complete(id, finalPrice, solutionDescription, partsUsed) {
    const [request] = await knex('emergency_requests')
      .where('id', id)
      .where('status', 'in_progress')
      .update({
        status: 'completed',
        final_price: finalPrice,
        solution_description: solutionDescription,
        parts_used: partsUsed ? JSON.stringify(partsUsed) : null,
        completed_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    return request;
  }

  // Cancelar solicitação
  static async cancel(id, reason = null) {
    const [request] = await knex('emergency_requests')
      .where('id', id)
      .whereIn('status', ['pending', 'accepted'])
      .update({
        status: 'cancelled',
        notes: reason,
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    return request;
  }

  // Avaliar serviço
  static async rate(id, rating, comment) {
    const [request] = await knex('emergency_requests')
      .where('id', id)
      .where('status', 'completed')
      .update({
        rating,
        review_comment: comment,
        reviewed_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    // Atualizar rating do parceiro
    if (request && request.partner_id) {
      await this.updatePartnerRating(request.partner_id);
    }
    
    return request;
  }

  // Atualizar rating do parceiro
  static async updatePartnerRating(partnerId) {
    const stats = await knex('emergency_requests')
      .where('partner_id', partnerId)
      .where('rating', '>', 0)
      .select(
        knex.raw('AVG(rating) as avg_rating'),
        knex.raw('COUNT(*) as total_reviews')
      )
      .first();

    if (stats) {
      await knex('partners')
        .where('id', partnerId)
        .update({
          rating: parseFloat(stats.avg_rating) || 0,
          total_reviews: stats.total_reviews || 0,
          updated_at: knex.fn.now()
        });
    }
  }

  // Buscar todas com filtros (admin)
  static async findAll(page = 1, limit = 10, filters = {}) {
    const offset = (page - 1) * limit;
    
    let query = knex('emergency_requests')
      .select(
        'emergency_requests.*',
        'users.name as user_name',
        'partners.business_name as partner_name'
      )
      .join('users', 'emergency_requests.user_id', 'users.id')
      .leftJoin('partners', 'emergency_requests.partner_id', 'partners.id');

    // Aplicar filtros
    if (filters.type) {
      query = query.where('emergency_requests.type', filters.type);
    }
    if (filters.status) {
      query = query.where('emergency_requests.status', filters.status);
    }
    if (filters.urgency) {
      query = query.where('emergency_requests.urgency', filters.urgency);
    }
    if (filters.date_from) {
      query = query.where('emergency_requests.created_at', '>=', filters.date_from);
    }
    if (filters.date_to) {
      query = query.where('emergency_requests.created_at', '<=', filters.date_to);
    }

    // Query para contar total
    const countQuery = knex('emergency_requests')
      .join('users', 'emergency_requests.user_id', 'users.id')
      .leftJoin('partners', 'emergency_requests.partner_id', 'partners.id');
    
    // Aplicar filtros na query de contagem
    if (filters.type) {
      countQuery.where('emergency_requests.type', filters.type);
    }
    if (filters.status) {
      countQuery.where('emergency_requests.status', filters.status);
    }
    if (filters.urgency) {
      countQuery.where('emergency_requests.urgency', filters.urgency);
    }
    if (filters.date_from) {
      countQuery.where('emergency_requests.created_at', '>=', filters.date_from);
    }
    if (filters.date_to) {
      countQuery.where('emergency_requests.created_at', '<=', filters.date_to);
    }

    const [requests, total] = await Promise.all([
      query.limit(limit).offset(offset).orderBy('emergency_requests.created_at', 'desc'),
      countQuery.count('* as count').first()
    ]);

    return {
      requests,
      total: total.count,
      page,
      limit,
      totalPages: Math.ceil(total.count / limit)
    };
  }

  // Estatísticas para dashboard
  static async getStats() {
    const stats = await knex('emergency_requests')
      .select(
        knex.raw('COUNT(*) as total'),
        knex.raw('COUNT(CASE WHEN status = "pending" THEN 1 END) as pending'),
        knex.raw('COUNT(CASE WHEN status = "accepted" THEN 1 END) as accepted'),
        knex.raw('COUNT(CASE WHEN status = "in_progress" THEN 1 END) as in_progress'),
        knex.raw('COUNT(CASE WHEN status = "completed" THEN 1 END) as completed'),
        knex.raw('COUNT(CASE WHEN status = "cancelled" THEN 1 END) as cancelled'),
        knex.raw('COUNT(CASE WHEN type = "mechanical" THEN 1 END) as mechanical'),
        knex.raw('COUNT(CASE WHEN type = "fuel" THEN 1 END) as fuel'),
        knex.raw('COUNT(CASE WHEN type = "tire" THEN 1 END) as tire'),
        knex.raw('COUNT(CASE WHEN type = "battery" THEN 1 END) as battery'),
        knex.raw('AVG(CASE WHEN final_price IS NOT NULL THEN final_price END) as avg_price')
      )
      .first();

    return stats;
  }

  // ===== NOVOS MÉTODOS PARA SISTEMA DE PROPOSTAS =====

  // Criar solicitação de guincho (com sistema de propostas)
  static async createTowRequest(requestData) {
    // Definir configurações de propostas
    const proposalExpiryMinutes = await this.getProposalExpiryMinutes();
    const maxProposals = await this.getMaxProposals();
    const searchRadius = await this.getSearchRadius('guincho');
    
    const proposalDeadline = new Date();
    proposalDeadline.setMinutes(proposalDeadline.getMinutes() + proposalExpiryMinutes);

    const [request] = await knex('emergency_requests').insert({
      ...requestData,
      request_type: 'guincho',
      proposal_status: 'awaiting_proposals',
      proposal_selection_deadline: proposalDeadline,
      max_proposals: maxProposals,
      search_radius_km: searchRadius
    }).returning('*');

    return request;
  }

  // Criar solicitação de mecânico (sem propostas, direto)
  static async createMechanicRequest(requestData) {
    const searchRadius = await this.getSearchRadius('mecanico');
    
    const [request] = await knex('emergency_requests').insert({
      ...requestData,
      request_type: 'mecanico',
      proposal_status: null,
      search_radius_km: searchRadius
    }).returning('*');

    return request;
  }

  // Buscar propostas de uma emergência
  static async getProposals(emergencyRequestId) {
    return await knex('tow_proposals')
      .select(
        'tow_proposals.*',
        'partners.business_name',
        'partners.phone',
        'partners.rating',
        'partners.tow_truck_type',
        'users.name as user_name'
      )
      .join('partners', 'tow_proposals.partner_id', 'partners.id')
      .join('users', 'partners.user_id', 'users.id')
      .where('tow_proposals.emergency_request_id', emergencyRequestId)
      .where('tow_proposals.status', 'pending')
      .orderBy('tow_proposals.proposed_price', 'asc');
  }

  // Aceitar proposta de guincho
  static async acceptProposal(emergencyRequestId, proposalId) {
    // Iniciar transação
    const trx = await knex.transaction();
    
    try {
      // Atualizar proposta para aceita
      const [proposal] = await trx('tow_proposals')
        .where('id', proposalId)
        .where('emergency_request_id', emergencyRequestId)
        .where('status', 'pending')
        .update({
          status: 'accepted',
          accepted_at: knex.fn.now(),
          responded_at: knex.fn.now()
        })
        .returning('*');

      if (!proposal) {
        await trx.rollback();
        return null;
      }

      // Rejeitar outras propostas
      await trx('tow_proposals')
        .where('emergency_request_id', emergencyRequestId)
        .where('id', '!=', proposalId)
        .where('status', 'pending')
        .update({
          status: 'rejected',
          responded_at: knex.fn.now()
        });

      // Atualizar emergência
      const [request] = await trx('emergency_requests')
        .where('id', emergencyRequestId)
        .update({
          partner_id: proposal.partner_id,
          selected_proposal_id: proposalId,
          proposal_status: 'proposal_selected',
          status: 'accepted',
          estimated_price: proposal.proposed_price,
          estimated_duration_minutes: proposal.estimated_time_minutes,
          accepted_at: knex.fn.now(),
          first_proposal_at: knex.fn.now()
        })
        .returning('*');

      await trx.commit();
      return { request, proposal };
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  // Verificar se ainda pode receber propostas
  static async canReceiveProposals(emergencyRequestId) {
    const request = await knex('emergency_requests')
      .where('id', emergencyRequestId)
      .first();

    if (!request) return false;
    if (request.request_type !== 'guincho') return false;
    if (request.proposal_status !== 'awaiting_proposals') return false;
    if (request.proposals_received >= request.max_proposals) return false;
    if (new Date() > request.proposal_selection_deadline) return false;

    return true;
  }

  // Incrementar contador de propostas recebidas
  static async incrementProposalCount(emergencyRequestId) {
    return await knex('emergency_requests')
      .where('id', emergencyRequestId)
      .increment('proposals_received', 1)
      .update({
        last_proposal_at: knex.fn.now(),
        updated_at: knex.fn.now()
      });
  }

  // Expirar propostas pendentes
  static async expireProposals(emergencyRequestId) {
    const result = await knex('tow_proposals')
      .where('emergency_request_id', emergencyRequestId)
      .where('status', 'pending')
      .where('expires_at', '<=', new Date())
      .update({
        status: 'expired',
        responded_at: knex.fn.now()
      });

    // Se não houver propostas aceitas, marcar como sem propostas
    const hasAcceptedProposal = await knex('tow_proposals')
      .where('emergency_request_id', emergencyRequestId)
      .where('status', 'accepted')
      .first();

    if (!hasAcceptedProposal && result > 0) {
      await knex('emergency_requests')
        .where('id', emergencyRequestId)
        .update({
          proposal_status: 'no_proposals',
          updated_at: knex.fn.now()
        });
    }

    return result;
  }

  // Buscar emergências para guinchos (com sistema de propostas)
  static async findForGuinchos(latitude, longitude, radius = null) {
    const searchRadius = radius || await this.getSearchRadius('guincho');
    
    return await knex('emergency_requests')
      .select(
        'emergency_requests.*',
        'users.name as user_name',
        'users.phone as user_phone',
        knex.raw(`
          6371 * acos(
            cos(radians(?)) * cos(radians(latitude)) * 
            cos(radians(longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(latitude))
          ) AS distance
        `, [latitude, longitude, latitude])
      )
      .join('users', 'emergency_requests.user_id', 'users.id')
      .where('emergency_requests.request_type', 'guincho')
      .where('emergency_requests.proposal_status', 'awaiting_proposals')
      .where('emergency_requests.status', 'pending')
      .having('distance', '<=', searchRadius)
      .orderBy('distance');
  }

  // Buscar emergências para mecânicos (direto, sem propostas)
  static async findForMechanics(latitude, longitude, radius = null) {
    const searchRadius = radius || await this.getSearchRadius('mecanico');
    
    return await knex('emergency_requests')
      .select(
        'emergency_requests.*',
        'users.name as user_name',
        'users.phone as user_phone',
        knex.raw(`
          6371 * acos(
            cos(radians(?)) * cos(radians(latitude)) * 
            cos(radians(longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(latitude))
          ) AS distance
        `, [latitude, longitude, latitude])
      )
      .join('users', 'emergency_requests.user_id', 'users.id')
      .where('emergency_requests.request_type', 'mecanico')
      .where('emergency_requests.status', 'pending')
      .having('distance', '<=', searchRadius)
      .orderBy('distance');
  }

  // Obter configurações do sistema
  static async getProposalExpiryMinutes() {
    const setting = await knex('system_settings')
      .where('setting_key', 'guincho_proposal_expiry_minutes')
      .first();
    return parseInt(setting?.setting_value || '10');
  }

  static async getMaxProposals() {
    const setting = await knex('system_settings')
      .where('setting_key', 'guincho_max_proposals_per_request')
      .first();
    return parseInt(setting?.setting_value || '5');
  }

  static async getSearchRadius(partnerType) {
    const settingKey = `${partnerType}_search_radius_km`;
    const setting = await knex('system_settings')
      .where('setting_key', settingKey)
      .first();
    return parseFloat(setting?.setting_value || '15');
  }

  // Verificar se emergência tem propostas suficientes
  static async hasEnoughProposals(emergencyRequestId) {
    const request = await knex('emergency_requests')
      .where('id', emergencyRequestId)
      .first();

    return request && request.proposals_received >= request.max_proposals;
  }

  // Finalizar emergência com proposta aceita
  static async completeWithProposal(emergencyRequestId, finalPrice, solutionDescription, partsUsed = null) {
    const [request] = await knex('emergency_requests')
      .where('id', emergencyRequestId)
      .where('status', 'in_progress')
      .update({
        status: 'completed',
        final_price: finalPrice,
        solution_description: solutionDescription,
        parts_used: partsUsed ? JSON.stringify(partsUsed) : null,
        completed_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
      .returning('*');

    return request;
  }

  // Cancelar emergência (com tratamento de propostas)
  static async cancelWithProposals(emergencyRequestId, reason = null, cancelledBy = 'user') {
    const trx = await knex.transaction();
    
    try {
      // Cancelar propostas pendentes
      await trx('tow_proposals')
        .where('emergency_request_id', emergencyRequestId)
        .where('status', 'pending')
        .update({
          status: 'rejected',
          responded_at: knex.fn.now()
        });

      // Cancelar emergência
      const [request] = await trx('emergency_requests')
        .where('id', emergencyRequestId)
        .whereIn('status', ['pending', 'accepted'])
        .update({
          status: 'cancelled',
          notes: reason,
          cancellation_reason: reason,
          cancellation_by: cancelledBy,
          cancelled_at: knex.fn.now(),
          updated_at: knex.fn.now()
        })
        .returning('*');

      await trx.commit();
      return request;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }
}

module.exports = EmergencyRequest;
