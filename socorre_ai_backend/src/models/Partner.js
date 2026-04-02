const knex = require('../config/database');

class Partner {
  // ===== MÉTODOS PARA SISTEMA DE APROVAÇÃO =====

  // Verificar se parceiro precisa de documentos
  static requiresDocuments(partnerType) {
    return ['towtruck', 'delivery'].includes(partnerType);
  }

  // Obter documentos obrigatórios por tipo
  static getRequiredDocuments(partnerType) {
    const documents = {
      mechanic: [],
      gasstation: ['cnpj', 'address_proof', 'business_license'],
      autoparts: ['cnpj', 'address_proof', 'business_license'],
      towtruck: ['cpf', 'cnh', 'vehicle_document', 'address_proof'],
      delivery: ['cpf', 'cnh', 'vehicle_document', 'address_proof'],
      motoboy: ['cpf', 'cnh', 'vehicle_document', 'address_proof'],
    };
    return documents[partnerType] || [];
  }

  // Verificar se parceiro pode acessar dashboard
  static canAccessDashboard(partner) {
    // Mecânicos, postos e auto peças podem acessar após aprovação básica
    if (['mechanic', 'gasstation', 'autoparts'].includes(partner.type)) {
      return partner.approval_status === 'approved';
    }
    // Guincho e motoboy precisam de documentos aprovados
    return partner.approval_status === 'approved';
  }

  // Criar ou atualizar parceiro com dados de aprovação
  static async createOrUpdate(partnerData) {
    const existingPartner = await knex('partners')
      .where('user_id', partnerData.user_id)
      .first();

    if (existingPartner) {
      // Atualizar
      const [partner] = await knex('partners')
        .where('id', existingPartner.id)
        .update({ 
          ...partnerData, 
          updated_at: knex.fn.now() 
        })
        .returning('*');
      return partner;
    } else {
      // Criar novo
      const [partner] = await knex('partners')
        .insert({
          ...partnerData,
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
    } else if (status === 'rejected') {
      updateData.rejection_reason = rejectionReason;
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
      .where('status', 'verified')
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
        ...data,
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
    if (checkSubscription && ['mechanic', 'gasstation', 'autoparts'].includes(type)) {
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
  static async updateOnlineStatus(id, isOnline) {
    await knex('partners')
      .where('id', id)
      .update({
        is_online: isOnline,
        last_seen: knex.fn.now()
      });
  }

  // Atualizar localização
  static async updateLocation(id, latitude, longitude) {
    await knex('partners')
      .where('id', id)
      .update({
        latitude,
        longitude,
        updated_at: knex.fn.now()
      });
  }

  // Buscar todos os parceiros
  static async findAll() {
    return await knex('partners')
      .select(
        'partners.*',
        'users.name as user_name',
        'users.email as user_email',
        'users.phone as user_phone'
      )
      .join('users', 'partners.user_id', 'users.id')
      .orderBy('partners.created_at', 'desc');
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
      .orderBy('partners.last_seen', 'desc');
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
