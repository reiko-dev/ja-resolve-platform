const knex = require('../config/database');

class Subscription {
  // Criar nova assinatura
  static async create(subscriptionData) {
    const [subscription] = await knex('subscriptions').insert(subscriptionData).returning('*');
    return subscription;
  }

  // Buscar por ID
  static async findById(id) {
    return await knex('subscriptions')
      .select(
        'subscriptions.*',
        'partners.business_name',
        'partners.type as partner_type',
        'users.name as user_name',
        'users.email as user_email'
      )
      .join('partners', 'subscriptions.partner_id', 'partners.id')
      .join('users', 'partners.user_id', 'users.id')
      .where('subscriptions.id', id)
      .first();
  }

  // Buscar por parceiro
  static async findByPartner(partnerId) {
    return await knex('subscriptions')
      .select('subscriptions.*')
      .where('partner_id', partnerId)
      .orderBy('created_at', 'desc')
      .first();
  }

  // Buscar assinaturas ativas
  static async findActive() {
    return await knex('subscriptions')
      .select(
        'subscriptions.*',
        'partners.business_name',
        'partners.type as partner_type',
        'users.name as user_name',
        'users.email as user_email'
      )
      .join('partners', 'subscriptions.partner_id', 'partners.id')
      .join('users', 'partners.user_id', 'users.id')
      .where('subscriptions.status', 'active')
      .orderBy('subscriptions.next_billing_date');
  }

  // Buscar assinaturas vencendo em X dias
  static async findExpiringSoon(days = 7) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return await knex('subscriptions')
      .select(
        'subscriptions.*',
        'partners.business_name',
        'partners.type as partner_type',
        'users.name as user_name',
        'users.email as user_email'
      )
      .join('partners', 'subscriptions.partner_id', 'partners.id')
      .join('users', 'partners.user_id', 'users.id')
      .where('subscriptions.status', 'active')
      .where('subscriptions.next_billing_date', '<=', futureDate)
      .where('subscriptions.next_billing_date', '>=', new Date())
      .orderBy('subscriptions.next_billing_date');
  }

  // Buscar assinaturas vencidas
  static async findExpired() {
    return await knex('subscriptions')
      .select(
        'subscriptions.*',
        'partners.business_name',
        'partners.type as partner_type',
        'users.name as user_name',
        'users.email as user_email'
      )
      .join('partners', 'subscriptions.partner_id', 'partners.id')
      .join('users', 'partners.user_id', 'users.id')
      .where('subscriptions.status', 'active')
      .where('subscriptions.next_billing_date', '<', new Date())
      .orderBy('subscriptions.next_billing_date');
  }

  // Atualizar assinatura
  static async update(id, subscriptionData) {
    const [subscription] = await knex('subscriptions')
      .where('id', id)
      .update({ ...subscriptionData, updated_at: knex.fn.now() })
      .returning('*');
    return subscription;
  }

  // Atualizar status
  static async updateStatus(id, status, notes = null) {
    const [subscription] = await knex('subscriptions')
      .where('id', id)
      .update({ 
        status, 
        notes,
        updated_at: knex.fn.now() 
      })
      .returning('*');
    return subscription;
  }

  // Processar pagamento - atualizar próxima data de cobrança
  static async processPayment(id, nextBillingDate) {
    const [subscription] = await knex('subscriptions')
      .where('id', id)
      .update({
        status: 'active',
        next_billing_date: nextBillingDate,
        last_successful_payment: knex.fn.now(),
        failed_attempts: 0,
        updated_at: knex.fn.now()
      })
      .returning('*');
    return subscription;
  }

  // Registrar falha de pagamento
  static async recordPaymentFailure(id) {
    const [subscription] = await knex('subscriptions')
      .where('id', id)
      .increment('failed_attempts', 1)
      .update({
        last_payment_attempt: knex.fn.now(),
        updated_at: knex.fn.now()
      })
      .returning('*');
    
    // Se falhas >= 3, suspender assinatura
    if (subscription && subscription.failed_attempts >= 3) {
      await this.updateStatus(id, 'suspended', 'Suspensa por múltiplas falhas de pagamento');
    }
    
    return subscription;
  }

  // Cancelar assinatura
  static async cancel(id, reason = null) {
    const [subscription] = await knex('subscriptions')
      .where('id', id)
      .update({
        status: 'cancelled',
        auto_renew: false,
        notes: reason,
        updated_at: knex.fn.now()
      })
      .returning('*');
    return subscription;
  }

  // Listar com paginação e filtros
  static async findAll(page = 1, limit = 10, filters = {}) {
    const offset = (page - 1) * limit;
    
    let query = knex('subscriptions')
      .select(
        'subscriptions.*',
        'partners.business_name',
        'partners.type as partner_type',
        'users.name as user_name',
        'users.email as user_email'
      )
      .join('partners', 'subscriptions.partner_id', 'partners.id')
      .join('users', 'partners.user_id', 'users.id');

    // Aplicar filtros
    if (filters.type) {
      query = query.where('subscriptions.type', filters.type);
    }
    if (filters.status) {
      query = query.where('subscriptions.status', filters.status);
    }
    if (filters.search) {
      query = query.where(function() {
        this.where('partners.business_name', 'like', `%${filters.search}%`)
            .orWhere('users.name', 'like', `%${filters.search}%`)
            .orWhere('users.email', 'like', `%${filters.search}%`);
      });
    }
    if (filters.due_from) {
      query = query.where('subscriptions.due_date', '>=', filters.due_from);
    }
    if (filters.due_to) {
      query = query.where('subscriptions.due_date', '<=', filters.due_to);
    }

    // Query para contar total
    const countQuery = knex('subscriptions')
      .join('partners', 'subscriptions.partner_id', 'partners.id')
      .join('users', 'partners.user_id', 'users.id');
    
    // Aplicar filtros na query de contagem
    if (filters.type) {
      countQuery.where('subscriptions.type', filters.type);
    }
    if (filters.status) {
      countQuery.where('subscriptions.status', filters.status);
    }
    if (filters.search) {
      countQuery.where(function() {
        this.where('partners.business_name', 'like', `%${filters.search}%`)
            .orWhere('users.name', 'like', `%${filters.search}%`)
            .orWhere('users.email', 'like', `%${filters.search}%`);
      });
    }
    if (filters.due_from) {
      countQuery.where('subscriptions.due_date', '>=', filters.due_from);
    }
    if (filters.due_to) {
      countQuery.where('subscriptions.due_date', '<=', filters.due_to);
    }

    const [subscriptions, total] = await Promise.all([
      query.limit(limit).offset(offset).orderBy('subscriptions.created_at', 'desc'),
      countQuery.count('* as count').first()
    ]);

    return {
      subscriptions,
      total: total.count,
      page,
      limit,
      totalPages: Math.ceil(total.count / limit)
    };
  }

  // Estatísticas
  static async getStats() {
    const stats = await knex('subscriptions')
      .select(
        knex.raw('COUNT(*) as total'),
        knex.raw('COUNT(CASE WHEN status = "active" THEN 1 END) as active'),
        knex.raw('COUNT(CASE WHEN status = "expired" THEN 1 END) as expired'),
        knex.raw('COUNT(CASE WHEN status = "cancelled" THEN 1 END) as cancelled'),
        knex.raw('COUNT(CASE WHEN status = "suspended" THEN 1 END) as suspended'),
        knex.raw('COUNT(CASE WHEN status = "pending_payment" THEN 1 END) as pending_payment'),
        knex.raw('SUM(monthly_fee) as total_monthly_revenue'),
        knex.raw('AVG(monthly_fee) as avg_monthly_fee'),
        knex.raw('COUNT(CASE WHEN type = "mecanico" THEN 1 END) as mecanico'),
        knex.raw('COUNT(CASE WHEN type = "posto_combustivel" THEN 1 END) as posto_combustivel'),
        knex.raw('COUNT(CASE WHEN type = "auto_pecas" THEN 1 END) as auto_pecas')
      )
      .first();

    return stats;
  }

  // Verificar se parceiro tem assinatura ativa
  static async isPartnerActive(partnerId) {
    const subscription = await knex('subscriptions')
      .where('partner_id', partnerId)
      .where('status', 'active')
      .where('next_billing_date', '>=', new Date())
      .first();

    return !!subscription;
  }

  // Buscar assinaturas para cobrança automática
  static async findForAutoBilling() {
    return await knex('subscriptions')
      .select('subscriptions.*', 'users.email as user_email')
      .join('partners', 'subscriptions.partner_id', 'partners.id')
      .join('users', 'partners.user_id', 'users.id')
      .where('subscriptions.status', 'active')
      .where('subscriptions.auto_renew', true)
      .where('subscriptions.next_billing_date', '<=', new Date())
      .where('subscriptions.failed_attempts', '<', 3);
  }
}

module.exports = Subscription;
