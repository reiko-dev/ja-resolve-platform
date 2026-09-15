const knex = require('../config/database');
const Review = require('./Review');

const REQUEST_TYPE_ALIASES = {
  mechanic: 'mechanic',
  mecanico: 'mechanic',
  tow: 'tow',
  guincho: 'tow',
};

function normalizeRequestType(requestType) {
  return REQUEST_TYPE_ALIASES[requestType] || requestType || 'mechanic';
}

// G2 — contrato de fotos privadas de guincho (uma pickup + uma delivery).
const PHOTO_COLUMNS = Object.freeze({
  pickup: Object.freeze({ url: 'pickup_photo_url', metadata: 'pickup_photo_metadata' }),
  delivery: Object.freeze({ url: 'delivery_photo_url', metadata: 'delivery_photo_metadata' }),
});

function isPostgresClient(instance) {
  const client = instance?.client?.config?.client;
  return client === 'pg' || client === 'postgresql';
}

class EmergencyRequest {
  static parseJsonField(value, fallback = null) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;

    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  // G2 — colunas contratuais de foto por tipo (null quando o tipo é inválido).
  static photoColumns(photoType) {
    const columns = PHOTO_COLUMNS[photoType];
    return columns ? { url: columns.url, metadata: columns.metadata } : null;
  }

  // G2 — metadata persistida da foto (objeto) ou null quando ausente/ilegível.
  static parsePhotoMetadata(row, photoType) {
    const columns = this.photoColumns(photoType);
    if (!columns) return null;

    const parsed = this.parseJsonField(row?.[columns.metadata], null);
    return parsed && typeof parsed === 'object' ? parsed : null;
  }

  /**
   * G2 — anexa a foto ao pedido de forma atômica e idempotente.
   *
   * Uma única transação:
   *   1. lê o pedido (com FOR UPDATE quando o banco é PostgreSQL);
   *   2. se a coluna do tipo já tem valor, devolve `existing` sem escrever nada;
   *   3. delega a escrita física ao callback `store()` (temp + rename);
   *   4. atualiza com CAS (`WHERE <coluna> IS NULL`) e faz commit.
   *
   * Qualquer falha faz rollback da transação e do arquivo recém-escrito, de
   * modo que nunca sobra órfão no filesystem nem URL sem arquivo no banco.
   */
  static async attachServicePhoto(emergencyRequestId, photoType, { url, store } = {}) {
    const columns = this.photoColumns(photoType);
    if (!columns) {
      throw new Error(`photo_type inválido: ${photoType}`);
    }
    if (typeof url !== 'string' || !url.trim()) {
      throw new Error('url da foto é obrigatória');
    }
    if (typeof store !== 'function') {
      throw new Error('callback de armazenamento da foto é obrigatório');
    }

    const trx = await knex.transaction();
    let stored = null;
    let committed = false;

    try {
      let lockQuery = trx('emergency_requests').where('id', emergencyRequestId);
      if (isPostgresClient(knex)) {
        lockQuery = lockQuery.forUpdate();
      }

      const current = await lockQuery.first();

      if (!current) {
        await trx.rollback();
        return { status: 'missing', request: null };
      }

      if (current[columns.url]) {
        await trx.rollback();
        return { status: 'existing', request: current };
      }

      stored = await store();

      const [updated] = await trx('emergency_requests')
        .where('id', emergencyRequestId)
        .whereNull(columns.url)
        .update({
          [columns.url]: url,
          [columns.metadata]: JSON.stringify(stored.metadata),
          updated_at: knex.fn.now()
        })
        .returning('*');

      if (!updated) {
        throw new Error('anexo de foto conflitou com atualização concorrente');
      }

      await trx.commit();
      committed = true;

      return { status: 'created', request: updated };
    } catch (error) {
      await trx.rollback().catch(() => {});

      if (!committed && stored && typeof stored.rollback === 'function') {
        await stored.rollback().catch(() => {});
      }

      throw error;
    }
  }

  static calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const numeric = [lat1, lon1, lat2, lon2].map(value => parseFloat(value));
    if (numeric.some(value => Number.isNaN(value))) {
      return null;
    }

    const [originLat, originLon, destLat, destLon] = numeric;
    const toRadians = degrees => (degrees * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const deltaLat = toRadians(destLat - originLat);
    const deltaLon = toRadians(destLon - originLon);
    const originLatRad = toRadians(originLat);
    const destLatRad = toRadians(destLat);

    const haversine =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(originLatRad) *
        Math.cos(destLatRad) *
        Math.sin(deltaLon / 2) *
        Math.sin(deltaLon / 2);

    const distance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    return earthRadiusKm * distance;
  }

  static async getTowPricingSettings() {
    const settings = await knex('system_settings')
      .whereIn('setting_key', [
        'tow_price_per_km',
        'tow_platform_fixed_fee',
        'tow_minimum_charge',
        'tow_cancellation_fee'
      ]);

    const asMap = Object.fromEntries(settings.map(setting => [setting.setting_key, parseFloat(setting.setting_value)]));

    return {
      tow_price_per_km: asMap.tow_price_per_km ?? 6,
      tow_platform_fixed_fee: asMap.tow_platform_fixed_fee ?? 25,
      tow_minimum_charge: asMap.tow_minimum_charge ?? 90,
      tow_cancellation_fee: asMap.tow_cancellation_fee ?? 40,
    };
  }

  static async calculateTowEstimate(requestData) {
    const pricing = await this.getTowPricingSettings();

    const originLatitude = requestData.vehicle_origin_latitude ?? requestData.latitude;
    const originLongitude = requestData.vehicle_origin_longitude ?? requestData.longitude;
    const destinationLatitude = requestData.vehicle_destination_latitude ?? originLatitude;
    const destinationLongitude = requestData.vehicle_destination_longitude ?? originLongitude;

    const operationalDistanceKm = this.calculateDistanceKm(
      originLatitude,
      originLongitude,
      destinationLatitude,
      destinationLongitude
    );

    const normalizedDistance = operationalDistanceKm ? Number(operationalDistanceKm.toFixed(2)) : 0;
    const distanceCharge = Number((normalizedDistance * pricing.tow_price_per_km).toFixed(2));
    const subtotal = Number((distanceCharge + pricing.tow_platform_fixed_fee).toFixed(2));
    const total = Math.max(subtotal, pricing.tow_minimum_charge);

    return {
      operational_distance_km: normalizedDistance,
      tow_price_per_km: pricing.tow_price_per_km,
      platform_fixed_fee: pricing.tow_platform_fixed_fee,
      minimum_charge: pricing.tow_minimum_charge,
      cancellation_fee: pricing.tow_cancellation_fee,
      distance_charge: distanceCharge,
      subtotal,
      total_estimated_price: Number(total.toFixed(2)),
      minimum_applied: total > subtotal,
      pricing_source: 'system_settings'
    };
  }

  /**
   * Piso de preço do guincho. Preferência pelo snapshot gravado em
   * price_breakdown no momento da criação; quando o pedido não tem snapshot
   * (linhas legadas), usa exclusivamente o valor vigente em system_settings —
   * nunca um teto ou piso inventado.
   */
  static async resolveTowMinimumPrice(emergencyRequestId) {
    const request = await knex('emergency_requests')
      .select('price_breakdown')
      .where('id', emergencyRequestId)
      .first();

    const breakdown = this.parseJsonField(request?.price_breakdown, null);
    const snapshot = parseFloat(breakdown?.total_estimated_price ?? breakdown?.minimum_charge);

    if (Number.isFinite(snapshot) && snapshot > 0) {
      return snapshot;
    }

    const pricing = await this.getTowPricingSettings();
    const minimum = parseFloat(pricing?.tow_minimum_charge);

    return Number.isFinite(minimum) && minimum > 0 ? minimum : null;
  }

  static async validateTowProposalPrice(emergencyRequestId, proposedPrice) {
    const numericPrice = typeof proposedPrice === 'number' ? proposedPrice : parseFloat(proposedPrice);
    const minimumAcceptedPrice = await this.resolveTowMinimumPrice(emergencyRequestId);

    if (!Number.isFinite(numericPrice)) {
      return { valid: false, minimumAcceptedPrice };
    }

    if (minimumAcceptedPrice === null) {
      // Sem regra de preço configurada: não há piso a aplicar.
      return { valid: true, minimumAcceptedPrice: null };
    }

    return {
      valid: numericPrice >= minimumAcceptedPrice,
      minimumAcceptedPrice
    };
  }

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
    const distanceExpression = `
      6371 * acos(
        cos(radians(?)) * cos(radians(latitude)) * 
        cos(radians(longitude) - radians(?)) + 
        sin(radians(?)) * sin(radians(latitude))
      )
    `;

    let query = knex('emergency_requests')
      .select(
        'emergency_requests.*',
        'users.name as user_name',
        'users.phone as user_phone',
        knex.raw(`${distanceExpression} AS distance`, [latitude, longitude, latitude])
      )
      .join('users', 'emergency_requests.user_id', 'users.id')
      .where('emergency_requests.status', 'pending')
      .whereRaw(`${distanceExpression} <= ?`, [latitude, longitude, latitude, radius])
      .orderBy('distance');

    const normalizedType = normalizeRequestType(type);
    if (type) {
      if (normalizedType === 'tow' || normalizedType === 'mechanic') {
        query = query.where('emergency_requests.request_type', normalizedType);
      } else {
        query = query.where('emergency_requests.type', type);
      }
    }

    return await query;
  }

  // Aceitar solicitação (apenas para mecânicos - sem propostas)
  static async accept(id, partnerId, estimatedPrice, estimatedDuration) {
    const [request] = await knex('emergency_requests')
      .where('id', id)
      .where('status', 'pending')
      .where('request_type', 'mechanic') // Apenas mecânicos podem aceitar direto
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
  static async start(id, partnerId = null) {
    const [request] = await knex('emergency_requests')
      .where('id', id)
      .where('status', 'accepted')
      .modify(builder => {
        if (partnerId !== null) builder.where('partner_id', partnerId);
      })
      .update({
        status: 'in_progress',
        started_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    return request;
  }

  // Completar serviço
  static async complete(id, finalPrice, solutionDescription, partsUsed, partnerId = null) {
    const [request] = await knex('emergency_requests')
      .where('id', id)
      .where('status', 'in_progress')
      .modify(builder => {
        if (partnerId !== null) builder.where('partner_id', partnerId);
      })
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
  static async rate(id, userId, rating, comment) {
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
    
    if (request && request.partner_id) {
      await Review.upsertOperationalReview({
        user_id: userId,
        partner_id: request.partner_id,
        rating,
        comment,
        entity_type: 'emergency_request',
        entity_id: request.id
      });
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
        knex.raw(`COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending`),
        knex.raw(`COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted`),
        knex.raw(`COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress`),
        knex.raw(`COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed`),
        knex.raw(`COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled`),
        knex.raw(`COUNT(CASE WHEN type = 'mechanical' THEN 1 END) as mechanical`),
        knex.raw(`COUNT(CASE WHEN type = 'fuel' THEN 1 END) as fuel`),
        knex.raw(`COUNT(CASE WHEN type = 'tire' THEN 1 END) as tire`),
        knex.raw(`COUNT(CASE WHEN type = 'battery' THEN 1 END) as battery`),
        knex.raw(`COUNT(CASE WHEN request_type = 'mechanic' THEN 1 END) as mechanic_requests`),
        knex.raw(`COUNT(CASE WHEN request_type = 'tow' THEN 1 END) as tow_requests`),
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
    const towEstimate = await this.calculateTowEstimate(requestData);
    
    const proposalDeadline = new Date();
    proposalDeadline.setMinutes(proposalDeadline.getMinutes() + proposalExpiryMinutes);

    const [request] = await knex('emergency_requests').insert({
      ...requestData,
      request_type: 'tow',
      proposal_status: 'awaiting_proposals',
      proposal_selection_deadline: proposalDeadline,
      max_proposals: maxProposals,
      proposals_received: 0,
      search_radius_km: searchRadius,
      estimated_price: towEstimate.total_estimated_price,
      price_breakdown: JSON.stringify(towEstimate)
    }).returning('*');

    return request;
  }

  static async syncPaymentState(emergencyRequestId, paymentData = {}, section = 'payment') {
    const request = await knex('emergency_requests')
      .select('id', 'price_breakdown')
      .where('id', emergencyRequestId)
      .first();

    if (!request) {
      return null;
    }

    const priceBreakdown = this.parseJsonField(request.price_breakdown, {}) || {};
    const mergedPriceBreakdown = {
      ...priceBreakdown,
      [section]: {
        ...(priceBreakdown[section] || {}),
        ...paymentData
      }
    };

    const [updated] = await knex('emergency_requests')
      .where('id', emergencyRequestId)
      .update({
        price_breakdown: JSON.stringify(mergedPriceBreakdown),
        updated_at: knex.fn.now()
      })
      .returning('*');

    return updated;
  }

  // Criar solicitação de mecânico (sem propostas, direto)
  static async createMechanicRequest(requestData) {
    const searchRadius = await this.getSearchRadius('mechanic');
    
    const [request] = await knex('emergency_requests').insert({
      ...requestData,
      request_type: 'mechanic',
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
        'tow_proposals.tow_truck_type',
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
      // Lock the request row so concurrent accepts serialize on PostgreSQL.
      const currentRequest = await trx('emergency_requests')
        .where('id', emergencyRequestId)
        .where('request_type', 'tow')
        .where('status', 'pending')
        .where('proposal_status', 'awaiting_proposals')
        .where('proposal_selection_deadline', '>', knex.fn.now())
        .forUpdate()
        .first();
      if (!currentRequest) {
        await trx.rollback();
        return null;
      }

      // Atualizar proposta para aceita
      const [proposal] = await trx('tow_proposals')
        .where('id', proposalId)
        .where('emergency_request_id', emergencyRequestId)
        .where('status', 'pending')
        .where('expires_at', '>', knex.fn.now())
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

      // Atualizar emergência.
      // Exigir status 'pending' na MESMA transação garante que duas
      // aceitações concorrentes não possam ambas vencer: a segunda
      // atualização não encontra a linha e a transação é revertida,
      // desfazendo também o aceite da proposta.
      const [request] = await trx('emergency_requests')
        .where('id', emergencyRequestId)
        .where('status', 'pending')
        .where('proposal_status', 'awaiting_proposals')
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

      if (!request) {
        await trx.rollback();
        return null;
      }

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
    if (normalizeRequestType(request.request_type) !== 'tow') return false;
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
    const searchRadius = radius || await this.getSearchRadius('tow');
    const distanceExpression = `
      6371 * acos(
        cos(radians(?)) * cos(radians(latitude)) * 
        cos(radians(longitude) - radians(?)) + 
        sin(radians(?)) * sin(radians(latitude))
      )
    `;
    
    return await knex('emergency_requests')
      .select(
        'emergency_requests.*',
        'users.name as user_name',
        'users.phone as user_phone',
        knex.raw(`${distanceExpression} AS distance`, [latitude, longitude, latitude])
      )
      .join('users', 'emergency_requests.user_id', 'users.id')
      .where('emergency_requests.request_type', 'tow')
      .where('emergency_requests.proposal_status', 'awaiting_proposals')
      .where('emergency_requests.status', 'pending')
      .whereRaw(`${distanceExpression} <= ?`, [latitude, longitude, latitude, searchRadius])
      .orderBy('distance');
  }

  // Buscar emergências para mecânicos (direto, sem propostas)
  static async findForMechanics(latitude, longitude, radius = null) {
    const searchRadius = radius || await this.getSearchRadius('mechanic');
    const distanceExpression = `
      6371 * acos(
        cos(radians(?)) * cos(radians(latitude)) * 
        cos(radians(longitude) - radians(?)) + 
        sin(radians(?)) * sin(radians(latitude))
      )
    `;
    
    return await knex('emergency_requests')
      .select(
        'emergency_requests.*',
        'users.name as user_name',
        'users.phone as user_phone',
        knex.raw(`${distanceExpression} AS distance`, [latitude, longitude, latitude])
      )
      .join('users', 'emergency_requests.user_id', 'users.id')
      .where('emergency_requests.request_type', 'mechanic')
      .where('emergency_requests.status', 'pending')
      .whereRaw(`${distanceExpression} <= ?`, [latitude, longitude, latitude, searchRadius])
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
    const normalizedType = normalizeRequestType(partnerType);
    const legacySettingKey = normalizedType === 'tow' ? 'guincho_search_radius_km' : `${normalizedType}_search_radius_km`;
    const canonicalSettingKey = normalizedType === 'tow' ? 'tow_search_radius_km' : legacySettingKey;
    const setting = await knex('system_settings')
      .whereIn('setting_key', [canonicalSettingKey, legacySettingKey])
      .orderByRaw(`CASE WHEN setting_key = ? THEN 0 ELSE 1 END`, [canonicalSettingKey])
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
  static async completeWithProposal(emergencyRequestId, finalPrice, solutionDescription, partsUsed = null, partnerId = null) {
    const [request] = await knex('emergency_requests')
      .where('id', emergencyRequestId)
      .where('status', 'in_progress')
      .modify(builder => {
        if (partnerId !== null) builder.where('partner_id', partnerId);
      })
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
