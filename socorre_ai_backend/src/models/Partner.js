const knex = require('../config/database');
const {
  normalizePartnerType,
  getRequiredDocuments,
  requiresDocuments,
} = require('../config/partnerDocumentRules');

class Partner {
  static calculateDistance(lat1, lon1, lat2, lon2) {
    if ([lat1, lon1, lat2, lon2].some((value) => value === null || value === undefined)) {
      return null;
    }

    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const deltaLat = toRadians(lat2 - lat1);
    const deltaLon = toRadians(lon2 - lon1);
    const originLat = toRadians(lat1);
    const destinationLat = toRadians(lat2);

    const haversine =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(originLat) *
        Math.cos(destinationLat) *
        Math.sin(deltaLon / 2) *
        Math.sin(deltaLon / 2);

    const distance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    return earthRadiusKm * distance;
  }

  // ===== MÉTODOS PARA SISTEMA DE APROVAÇÃO =====

  // Verificar se parceiro precisa de documentos
  static requiresDocuments(partnerType) {
    return requiresDocuments(partnerType);
  }

  // Obter documentos obrigatórios por tipo
  static getRequiredDocuments(partnerType) {
    return getRequiredDocuments(partnerType);
  }

  // Verificar se parceiro pode acessar dashboard
  static canAccessDashboard(partner) {
    const normalizedType = normalizePartnerType(partner.type);
    if (['mechanic', 'gas_station', 'auto_parts'].includes(normalizedType)) {
      return partner.approval_status === 'approved';
    }
    return partner.approval_status === 'approved';
  }

  // Criar ou atualizar parceiro com dados de aprovação.
  // Aceita uma transação opcional para que o onboarding grave parceiro e
  // usuário no mesmo commit (sem cadastro parcial).
  static async createOrUpdate(partnerData, { trx } = {}) {
    const db = trx || knex;
    const existingPartner = await db('partners')
      .where('user_id', partnerData.user_id)
      .first();

    if (existingPartner) {
      // Atualizar
      const [partner] = await db('partners')
        .where('id', existingPartner.id)
        .update({ 
          ...partnerData, 
          updated_at: knex.fn.now() 
        })
        .returning('*');
      return partner;
    } else {
      // Criar novo
      const [partner] = await db('partners')
        .insert({
          ...partnerData,
          type: normalizePartnerType(partnerData.type),
          approval_status: this.requiresDocuments(partnerData.type) ? 'documents_required' : 'pending',
          is_verified: false,
          created_at: knex.fn.now(),
          updated_at: knex.fn.now()
        })
        .returning('*');
      return partner;
    }
  }

  // Atualizar status de aprovação
  static async updateApprovalStatus(partnerId, status, reviewedBy = null, rejectionReason = null) {
    const updateData = {
      approval_status: status,
      is_verified: status === 'approved',
      updated_at: knex.fn.now()
    };

    if (status === 'approved') {
      updateData.approved_at = knex.fn.now();
      updateData.approved_by = reviewedBy;
      updateData.rejection_reason = null;
    } else if (status === 'rejected') {
      updateData.rejection_reason = rejectionReason;
    } else {
      // Reenvio/análise/documents_required: motivo antigo não pode continuar
      // aparecendo para o app depois que o documento foi substituído.
      updateData.rejection_reason = null;
    }

    const [partner] = await knex('partners')
      .where('id', partnerId)
      .update(updateData)
      .returning('*');
    
    return partner;
  }

  // Buscar parceiro com documentos
  static async findByIdWithDocuments(id) {
    const partner = await knex('partners')
      .where('partners.id', id)
      .first();

    if (partner) {
      const documents = await knex('partner_documents')
        .where('partner_id', id)
        .orderBy('created_at', 'desc');
      
      partner.documents = documents;
    }

    return partner;
  }

  // Verificar se todos os documentos obrigatórios foram enviados
  static async hasAllRequiredDocuments(partnerId) {
    const partner = await knex('partners').where('id', partnerId).first();
    if (!partner) return false;

    const requiredDocs = this.getRequiredDocuments(partner.type);
    if (requiredDocs.length === 0) return true;

    const uploadedDocs = await knex('partner_documents')
      .where('partner_id', partnerId)
      .whereIn('document_type', requiredDocs)
      .where('status', 'approved')
      .pluck('document_type');

    return requiredDocs.every(doc => uploadedDocs.includes(doc));
  }

  // Buscar parceiros pendentes de aprovação
  static async findPendingApproval() {
    return await knex('partners')
      .select(
        'partners.*',
        'users.name as user_name',
        'users.email as user_email',
        'users.phone as user_phone'
      )
      .join('users', 'partners.user_id', 'users.id')
      .where('partners.approval_status', 'pending')
      .orWhere('partners.approval_status', 'documents_required')
      .orderBy('partners.created_at', 'desc');
  }

  // Buscar estatísticas de aprovação
  static async getApprovalStats() {
    const stats = await knex('partners')
      .select(
        knex.raw('COUNT(*) as total'),
        knex.raw('COUNT(CASE WHEN approval_status = \'approved\' THEN 1 END) as approved'),
        knex.raw('COUNT(CASE WHEN approval_status = \'pending\' THEN 1 END) as pending'),
        knex.raw('COUNT(CASE WHEN approval_status = \'rejected\' THEN 1 END) as rejected'),
        knex.raw('COUNT(CASE WHEN approval_status = \'documents_required\' THEN 1 END) as documents_required')
      )
      .first();

    return stats;
  }

  // ===== MÉTODOS ORIGINAIS =====

  // Inserção direta em partners (sem upsert por user_id).
  // Usado pela rota admin; user_id pode ser null.
  static _serializeJsonField(value) {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (Array.isArray(value) || typeof value === 'object') {
      return JSON.stringify(value);
    }
    return value;
  }

  static _serializePartnerPayload(data) {
    const serialized = { ...data };
    const jsonFields = [
      'specialties',
      'working_hours',
      'payment_methods',
      'service_areas',
      'certifications',
      'store_categories',
    ];
    for (const field of jsonFields) {
      if (field in serialized) {
        const next = this._serializeJsonField(serialized[field]);
        if (next === undefined) {
          delete serialized[field];
        } else {
          serialized[field] = next;
        }
      }
    }
    return serialized;
  }

  static async createRaw(partnerData) {
    const payload = this._serializePartnerPayload({
      ...partnerData,
      created_at: partnerData.created_at || knex.fn.now(),
      updated_at: partnerData.updated_at || knex.fn.now(),
    });
    const [partner] = await knex('partners').insert(payload).returning('*');
    if (partner && typeof partner === 'object' && 'id' in partner) {
      return partner;
    }
    // Fallback para drivers sem RETURNING completo (ex.: sqlite antigo)
    const id = typeof partner === 'object' ? partner?.id : partner;
    if (id != null) {
      return await knex('partners').where('id', id).first();
    }
    return partner;
  }

  static async create(partnerData) {
    return await this.createRaw(partnerData);
  }

  static async delete(id) {
    const count = await knex('partners').where('id', id).del();
    return count > 0;
  }

  // Buscar parceiro por ID
  static async findById(id) {
    const partner = await knex('partners').where('id', id).first();
    return partner;
  }

  // Buscar parceiro por user_id
  static async findByUserId(userId) {
    const partner = await knex('partners').where('user_id', userId).first();
    return partner;
  }

  // Atualizar parceiro
  static async update(id, data) {
    const [partner] = await knex('partners')
      .where('id', id)
      .update({
        ...this._serializePartnerPayload(data),
        updated_at: knex.fn.now()
      })
      .returning('*');
    return partner;
  }

  // Buscar parceiros por proximidade
  static async findByProximity(latitude, longitude, radius = 10, type = null, checkSubscription = false) {
    const query = knex('partners')
      .select(
        'partners.*',
        'users.name as user_name',
        'users.email as user_email',
        'users.phone as user_phone'
      )
      .join('users', 'partners.user_id', 'users.id')
      .where('partners.is_available', true)
      .where('partners.is_verified', true)
      .whereRaw(`
        6371 * acos(
          cos(radians(?)) * cos(radians(latitude)) * 
          cos(radians(longitude) - radians(?)) + 
          sin(radians(?)) * sin(radians(latitude))
        ) <= ?
      `, [latitude, longitude, latitude, radius])
      .orderByRaw(`
        6371 * acos(
          cos(radians(?)) * cos(radians(latitude)) * 
          cos(radians(longitude) - radians(?)) + 
          sin(radians(?)) * sin(radians(latitude))
        ) ASC
      `, [latitude, longitude, latitude]);

    if (type) {
      query.where('partners.type', type);
    }

    // Verificar assinatura ativa se necessário
    if (checkSubscription && ['mechanic', 'gas_station', 'auto_parts'].includes(normalizePartnerType(type))) {
      query.whereExists(
        knex('subscriptions')
          .select(1)
          .where('subscriptions.partner_id', knex.raw('partners.id'))
          .where('subscriptions.status', 'active')
          .where('subscriptions.next_billing_date', '>=', new Date())
      );
    }

    return await query;
  }

  // Buscar parceiros por especialidade
  static async findBySpecialty(specialty) {
    return await knex('partners')
      .select(
        'partners.*',
        'users.name as user_name',
        'users.email as user_email',
        'users.phone as user_phone'
      )
      .join('users', 'partners.user_id', 'users.id')
      .where('partners.specialty', specialty)
      .where('partners.is_available', true)
      .where('partners.is_verified', true);
  }

  // Buscar parceiros por tipo
  static async findByType(type) {
    return await knex('partners')
      .select(
        'partners.*',
        'users.name as user_name',
        'users.email as user_email',
        'users.phone as user_phone'
      )
      .join('users', 'partners.user_id', 'users.id')
      .where('partners.type', type)
      .where('partners.is_available', true)
      .where('partners.is_verified', true);
  }

  // Atualizar status online
  // Presence is persisted on `is_online` (the column Tow matching reads) plus
  // the baseline `updated_at`; there is no `last_seen` column in the schema.
  // Returns the affected-row count so the controller can keep answering 404
  // for an unknown partner id (0 rows) and 200 for a real update.
  static async updateOnlineStatus(id, isOnline) {
    return await knex('partners')
      .where('id', id)
      .update({
        is_online: isOnline,
        updated_at: knex.fn.now()
      });
  }

  // Atualizar localização
  static async updateLocation(id, latitude, longitude, address = undefined) {
    const patch = {
      latitude,
      longitude,
      updated_at: knex.fn.now()
    };
    if (address !== undefined) patch.address = address;
    const [partner] = await knex('partners')
      .where('id', id)
      .update(patch)
      .returning('*');
    return partner;
  }

  // Buscar todos os parceiros (paginado; inclui user_id null via leftJoin)
  static async findAll(page = 1, limit = 10, filters = {}) {
    const safePage = Number.isFinite(Number(page)) && Number(page) > 0 ? parseInt(page, 10) : 1;
    const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? parseInt(limit, 10) : 10;
    const offset = (safePage - 1) * safeLimit;

    const applyFilters = (query) => {
      if (filters.type) {
        query.where('partners.type', filters.type);
      }
      if (filters.is_verified !== undefined) {
        query.where('partners.is_verified', filters.is_verified);
      }
      if (filters.is_available !== undefined) {
        query.where('partners.is_available', filters.is_available);
      }
      if (filters.search) {
        query.where(function () {
          this.where('partners.business_name', 'like', `%${filters.search}%`)
            .orWhere('partners.description', 'like', `%${filters.search}%`);
        });
      }
    };

    const dataQuery = knex('partners')
      .select(
        'partners.*',
        'users.name as user_name',
        'users.email as user_email',
        'users.phone as user_phone'
      )
      .leftJoin('users', 'partners.user_id', 'users.id');
    applyFilters(dataQuery);

    const countQuery = knex('partners').leftJoin('users', 'partners.user_id', 'users.id');
    applyFilters(countQuery);

    const [partners, totalRow] = await Promise.all([
      dataQuery.limit(safeLimit).offset(offset).orderBy('partners.created_at', 'desc'),
      countQuery.count('partners.id as count').first(),
    ]);

    const total = Number(totalRow?.count ?? 0);

    return {
      partners,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: total === 0 ? 0 : Math.ceil(total / safeLimit),
    };
  }

  // Buscar parceiros disponíveis
  static async findAvailable() {
    return await knex('partners')
      .select(
        'partners.*',
        'users.name as user_name',
        'users.email as user_email',
        'users.phone as user_phone'
      )
      .join('users', 'partners.user_id', 'users.id')
      .where('partners.is_available', true)
      .where('partners.is_verified', true)
      .where('partners.is_online', true)
      // `last_seen` does not exist in the baseline schema; `updated_at` is the
      // closest existing signal of recent activity.
      .orderBy('partners.updated_at', 'desc');
  }

  // Obter raio de busca por tipo
  static getSearchRadius(partnerType) {
    const radii = {
      mechanic: 15,      // 15km
      gasstation: 10,    // 10km
      autoparts: 20,     // 20km
      towtruck: 25,      // 25km
      delivery: 15,      // 15km
      motoboy: 15,       // 15km
    };
    return radii[partnerType] || 10;
  }

  // Verificar assinatura ativa
  static async hasActiveSubscription(partnerId) {
    const subscription = await knex('subscriptions')
      .where('partner_id', partnerId)
      .where('status', 'active')
      .where('next_billing_date', '>=', new Date())
      .first();
    
    return !!subscription;
  }

  // Obter informações de assinatura
  static async getSubscriptionInfo(partnerId) {
    return await knex('subscriptions')
      .where('partner_id', partnerId)
      .orderBy('created_at', 'desc')
      .first();
  }
}

module.exports = Partner;
