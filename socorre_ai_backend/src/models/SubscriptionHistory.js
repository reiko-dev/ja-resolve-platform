const knex = require('../config/database');

class SubscriptionHistory {
  // Criar registro no histórico
  static async create(historyData) {
    const [history] = await knex('subscription_history').insert(historyData).returning('*');
    return history;
  }

  // Buscar histórico por assinatura
  static async findBySubscription(subscriptionId, limit = 50) {
    return await knex('subscription_history')
      .select(
        'subscription_history.*',
        'users.name as performed_by_name'
      )
      .leftJoin('users', 'subscription_history.performed_by', 'users.id')
      .where('subscription_id', subscriptionId)
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  // Buscar histórico por parceiro
  static async findByPartner(partnerId, limit = 100) {
    return await knex('subscription_history')
      .select(
        'subscription_history.*',
        'users.name as performed_by_name'
      )
      .leftJoin('users', 'subscription_history.performed_by', 'users.id')
      .where('partner_id', partnerId)
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  // Buscar por ação
  static async findByAction(action, limit = 100) {
    return await knex('subscription_history')
      .select(
        'subscription_history.*',
        'partners.business_name',
        'users.name as performed_by_name'
      )
      .leftJoin('partners', 'subscription_history.partner_id', 'partners.id')
      .leftJoin('users', 'subscription_history.performed_by', 'users.id')
      .where('subscription_history.action', action)
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  // Buscar por período
  static async findByPeriod(startDate, endDate, partnerId = null) {
    let query = knex('subscription_history')
      .select(
        'subscription_history.*',
        'partners.business_name',
        'users.name as performed_by_name'
      )
      .leftJoin('partners', 'subscription_history.partner_id', 'partners.id')
      .leftJoin('users', 'subscription_history.performed_by', 'users.id')
      .where('subscription_history.created_at', '>=', startDate)
      .where('subscription_history.created_at', '<=', endDate);

    if (partnerId) {
      query = query.where('subscription_history.partner_id', partnerId);
    }

    return await query.order('created_at', 'desc');
  }

  // Registrar pagamento
  static async recordPayment(subscriptionId, partnerId, amount, paymentId, performedBy = null) {
    const subscription = await knex('subscriptions').where('id', subscriptionId).first();
    
    return await this.create({
      subscription_id: subscriptionId,
      partner_id: partnerId,
      action: 'paid',
      amount: amount,
      payment_id: paymentId,
      payment_method: subscription?.payment_method,
      billing_period_start: subscription?.next_billing_date,
      billing_period_end: subscription?.next_billing_date, // Será atualizado após o pagamento
      next_billing_date: subscription?.next_billing_date,
      performed_by: performedBy,
      performed_by_role: performedBy ? 'admin' : 'system',
      system_notes: 'Pagamento processado automaticamente'
    });
  }

  // Registrar falha de pagamento
  static async recordPaymentFailure(subscriptionId, partnerId, amount, reason = null) {
    return await this.create({
      subscription_id: subscriptionId,
      partner_id: partnerId,
      action: 'payment_failed',
      amount: amount,
      reason: reason || 'Falha no processamento do pagamento',
      performed_by_role: 'system',
      system_notes: 'Tentativa de pagamento falhou'
    });
  }

  // Registrar expiração
  static async recordExpiration(subscriptionId, partnerId) {
    return await this.create({
      subscription_id: subscriptionId,
      partner_id: partnerId,
      action: 'expired',
      performed_by_role: 'system',
      system_notes: 'Assinatura expirou por falta de pagamento'
    });
  }

  // Registrar cancelamento
  static async recordCancellation(subscriptionId, partnerId, reason = null, performedBy = null) {
    return await this.create({
      subscription_id: subscriptionId,
      partner_id: partnerId,
      action: 'cancelled',
      reason: reason,
      performed_by: performedBy,
      performed_by_role: performedBy ? 'partner' : 'admin',
      admin_notes: performedBy ? null : 'Cancelamento administrativo'
    });
  }

  // Registrar renovação
  static async recordRenewal(subscriptionId, partnerId, amount, paymentId = null) {
    return await this.create({
      subscription_id: subscriptionId,
      partner_id: partnerId,
      action: 'renewed',
      amount: amount,
      payment_id: paymentId,
      performed_by_role: 'system',
      system_notes: 'Assinatura renovada automaticamente'
    });
  }

  // Registrar criação
  static async recordCreation(subscriptionId, partnerId, amount, performedBy = null) {
    return await this.create({
      subscription_id: subscriptionId,
      partner_id: partnerId,
      action: 'created',
      amount: amount,
      performed_by: performedBy,
      performed_by_role: performedBy ? 'admin' : 'partner',
      system_notes: 'Nova assinatura criada'
    });
  }

  // Registrar suspensão
  static async recordSuspension(subscriptionId, partnerId, reason = null) {
    return await this.create({
      subscription_id: subscriptionId,
      partner_id: partnerId,
      action: 'suspended',
      reason: reason || 'Suspensão por múltiplas falhas de pagamento',
      performed_by_role: 'system',
      system_notes: 'Assinatura suspensa temporariamente'
    });
  }

  // Registrar reativação
  static async recordReactivation(subscriptionId, partnerId, performedBy = null) {
    return await this.create({
      subscription_id: subscriptionId,
      partner_id: partnerId,
      action: 'reactivated',
      performed_by: performedBy,
      performed_by_role: performedBy ? 'admin' : 'system',
      system_notes: 'Assinatura reativada'
    });
  }

  // Registrar mudança de método de pagamento
  static async recordMethodChange(subscriptionId, partnerId, oldMethod, newMethod, performedBy = null) {
    return await this.create({
      subscription_id: subscriptionId,
      partner_id: partnerId,
      action: 'method_changed',
      payment_method: newMethod,
      reason: `Método alterado de ${oldMethod} para ${newMethod}`,
      performed_by: performedBy,
      performed_by_role: performedBy ? 'partner' : 'admin',
      metadata: JSON.stringify({ old_method: oldMethod, new_method: newMethod })
    });
  }

  // Listar com paginação e filtros
  static async findAll(page = 1, limit = 50, filters = {}) {
    const offset = (page - 1) * limit;
    
    let query = knex('subscription_history')
      .select(
        'subscription_history.*',
        'partners.business_name',
        'partners.type as partner_type',
        'users.name as performed_by_name'
      )
      .leftJoin('partners', 'subscription_history.partner_id', 'partners.id')
      .leftJoin('users', 'subscription_history.performed_by', 'users.id');

    // Aplicar filtros
    if (filters.action) {
      query = query.where('subscription_history.action', filters.action);
    }
    if (filters.partner_id) {
      query = query.where('subscription_history.partner_id', filters.partner_id);
    }
    if (filters.subscription_id) {
      query = query.where('subscription_history.subscription_id', filters.subscription_id);
    }
    if (filters.performed_by_role) {
      query = query.where('subscription_history.performed_by_role', filters.performed_by_role);
    }
    if (filters.payment_id) {
      query = query.where('subscription_history.payment_id', filters.payment_id);
    }
    if (filters.amount_min) {
      query = query.where('subscription_history.amount', '>=', filters.amount_min);
    }
    if (filters.amount_max) {
      query = query.where('subscription_history.amount', '<=', filters.amount_max);
    }
    if (filters.created_from) {
      query = query.where('subscription_history.created_at', '>=', filters.created_from);
    }
    if (filters.created_to) {
      query = query.where('subscription_history.created_at', '<=', filters.created_to);
    }
    if (filters.search) {
      query = query.where(function() {
        this.where('partners.business_name', 'like', `%${filters.search}%`)
            .orWhere('users.name', 'like', `%${filters.search}%`)
            .orWhere('subscription_history.reason', 'like', `%${filters.search}%`);
      });
    }

    // Query para contar total
    const countQuery = knex('subscription_history')
      .leftJoin('partners', 'subscription_history.partner_id', 'partners.id')
      .leftJoin('users', 'subscription_history.performed_by', 'users.id');
    
    // Aplicar filtros na query de contagem
    if (filters.action) {
      countQuery.where('subscription_history.action', filters.action);
    }
    if (filters.partner_id) {
      countQuery.where('subscription_history.partner_id', filters.partner_id);
    }
    if (filters.subscription_id) {
      countQuery.where('subscription_history.subscription_id', filters.subscription_id);
    }
    if (filters.performed_by_role) {
      countQuery.where('subscription_history.performed_by_role', filters.performed_by_role);
    }
    if (filters.payment_id) {
      countQuery.where('subscription_history.payment_id', filters.payment_id);
    }
    if (filters.amount_min) {
      countQuery.where('subscription_history.amount', '>=', filters.amount_min);
    }
    if (filters.amount_max) {
      countQuery.where('subscription_history.amount', '<=', filters.amount_max);
    }
    if (filters.created_from) {
      countQuery.where('subscription_history.created_at', '>=', filters.created_from);
    }
    if (filters.created_to) {
      countQuery.where('subscription_history.created_at', '<=', filters.created_to);
    }
    if (filters.search) {
      countQuery.where(function() {
        this.where('partners.business_name', 'like', `%${filters.search}%`)
            .orWhere('users.name', 'like', `%${filters.search}%`)
            .orWhere('subscription_history.reason', 'like', `%${filters.search}%`);
      });
    }

    const [history, total] = await Promise.all([
      query.limit(limit).offset(offset).orderBy('subscription_history.created_at', 'desc'),
      countQuery.count('* as count').first()
    ]);

    return {
      history,
      total: total.count,
      page,
      limit,
      totalPages: Math.ceil(total.count / limit)
    };
  }

  // Estatísticas
  static async getStats(period = 'month') {
    let dateFormat;
    switch (period) {
      case 'day':
        dateFormat = '%Y-%m-%d';
        break;
      case 'week':
        dateFormat = '%Y-%u';
        break;
      case 'month':
        dateFormat = '%Y-%m';
        break;
      case 'year':
        dateFormat = '%Y';
        break;
      default:
        dateFormat = '%Y-%m';
    }

    const stats = await knex('subscription_history')
      .select(
        knex.raw(`DATE_FORMAT(created_at, '${dateFormat}') as period`),
        knex.raw('COUNT(*) as total'),
        knex.raw('COUNT(CASE WHEN action = "created" THEN 1 END) as created'),
        knex.raw('COUNT(CASE WHEN action = "paid" THEN 1 END) as paid'),
        knex.raw('COUNT(CASE WHEN action = "cancelled" THEN 1 END) as cancelled'),
        knex.raw('COUNT(CASE WHEN action = "expired" THEN 1 END) as expired'),
        knex.raw('SUM(amount) as total_amount'),
        knex.raw('AVG(amount) as avg_amount')
      )
      .groupByRaw(`DATE_FORMAT(created_at, '${dateFormat}')`)
      .orderByRaw(`DATE_FORMAT(created_at, '${dateFormat}')`)
      .limit(12);

    return stats;
  }

  // Relatório de ações por período
  static async getActionReport(startDate, endDate) {
    return await knex('subscription_history')
      .select(
        'action',
        knex.raw('COUNT(*) as count'),
        knex.raw('SUM(amount) as total_amount'),
        knex.raw('AVG(amount) as avg_amount'),
        knex.raw('MIN(created_at) as first_occurrence'),
        knex.raw('MAX(created_at) as last_occurrence')
      )
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate)
      .groupBy('action')
      .orderBy('count', 'desc');
  }

  // Deletar registros antigos (para limpeza)
  static async deleteOldRecords(daysToKeep = 365) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    return await knex('subscription_history')
      .where('created_at', '<', cutoffDate)
      .del();
  }

  // Deletar histórico de uma assinatura
  static async deleteBySubscription(subscriptionId) {
    return await knex('subscription_history')
      .where('subscription_id', subscriptionId)
      .del();
  }
}

module.exports = SubscriptionHistory;
