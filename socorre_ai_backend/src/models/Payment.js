const knex = require('../config/database');

class Payment {
  // Criar novo pagamento
  static async create(paymentData) {
    try {
      const [payment] = await knex('payments').insert({
        ...paymentData,
        created_at: new Date()
      }).returning('*');
      
      return payment;
    } catch (error) {
      console.error('Erro ao criar pagamento:', error);
      throw error;
    }
  }

  // Buscar pagamento por ID
  static async findById(id) {
    try {
      const payment = await knex('payments')
        .where('id', id)
        .first();
      
      return payment;
    } catch (error) {
      console.error('Erro ao buscar pagamento:', error);
      throw error;
    }
  }

  // Buscar pagamentos do usuário
  static async findByUser(userId, page = 1, limit = 20, status = null) {
    try {
      const offset = (page - 1) * limit;
      
      let query = knex('payments')
        .where('user_id', userId);

      if (status) {
        query = query.where('status', status);
      }

      const [payments, total] = await Promise.all([
        query
          .orderBy('created_at', 'desc')
          .limit(limit)
          .offset(offset),
        knex('payments')
          .where('user_id', userId)
          .count('* as count')
          .first()
      ]);

      return {
        payments,
        total: total.count,
        page,
        limit,
        totalPages: Math.ceil(total.count / limit)
      };
    } catch (error) {
      console.error('Erro ao buscar pagamentos do usuário:', error);
      throw error;
    }
  }

  // Buscar pagamentos do parceiro
  static async findByPartner(partnerId, page = 1, limit = 20, status = null) {
    try {
      const offset = (page - 1) * limit;
      
      let query = knex('payments')
        .where('partner_id', partnerId);

      if (status) {
        query = query.where('status', status);
      }

      const [payments, total] = await Promise.all([
        query
          .orderBy('created_at', 'desc')
          .limit(limit)
          .offset(offset),
        knex('payments')
          .where('partner_id', partnerId)
          .count('* as count')
          .first()
      ]);

      return {
        payments,
        total: total.count,
        page,
        limit,
        totalPages: Math.ceil(total.count / limit)
      };
    } catch (error) {
      console.error('Erro ao buscar pagamentos do parceiro:', error);
      throw error;
    }
  }

  // Atualizar status do pagamento
  static async updateStatus(id, status, metadata = {}) {
    try {
      const [payment] = await knex('payments')
        .where('id', id)
        .update({
          status,
          ...metadata,
          updated_at: new Date()
        })
        .returning('*');
      
      return payment;
    } catch (error) {
      console.error('Erro ao atualizar status do pagamento:', error);
      throw error;
    }
  }

  // Buscar por tipo de pagamento
  static async findByType(paymentType, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;
      
      const [payments, total] = await Promise.all([
        knex('payments')
          .where('payment_type', paymentType)
          .orderBy('created_at', 'desc')
          .limit(limit)
          .offset(offset),
        knex('payments')
          .where('payment_type', paymentType)
          .count('* as count')
          .first()
      ]);

      return {
        payments,
        total: total.count,
        page,
        limit,
        totalPages: Math.ceil(total.count / limit)
      };
    } catch (error) {
      console.error('Erro ao buscar pagamentos por tipo:', error);
      throw error;
    }
  }

  // Buscar pagamentos com filtros
  static async findAll(page = 1, limit = 20, filters = {}) {
    try {
      const offset = (page - 1) * limit;
      
      let query = knex('payments');

      // Aplicar filtros
      if (filters.status) {
        query = query.where('status', filters.status);
      }
      
      if (filters.payment_type) {
        query = query.where('payment_type', filters.payment_type);
      }
      
      if (filters.user_id) {
        query = query.where('user_id', filters.user_id);
      }
      
      if (filters.partner_id) {
        query = query.where('partner_id', filters.partner_id);
      }
      
      if (filters.gateway) {
        query = query.where('gateway', filters.gateway);
      }
      
      if (filters.method) {
        query = query.where('method', filters.method);
      }

      if (filters.date_from) {
        query = query.where('created_at', '>=', filters.date_from);
      }
      
      if (filters.date_to) {
        query = query.where('created_at', '<=', filters.date_to);
      }

      const [payments, total] = await Promise.all([
        query
          .orderBy('created_at', 'desc')
          .limit(limit)
          .offset(offset),
        knex('payments')
          .count('* as count')
          .first()
      ]);

      return {
        payments,
        total: total.count,
        page,
        limit,
        totalPages: Math.ceil(total.count / limit)
      };
    } catch (error) {
      console.error('Erro ao buscar pagamentos:', error);
      throw error;
    }
  }

  // Obter estatísticas
  static async getStats(filters = {}) {
    try {
      let query = knex('payments');
      
      // Aplicar filtros
      if (filters.date_from) {
        query = query.where('created_at', '>=', filters.date_from);
      }
      
      if (filters.date_to) {
        query = query.where('created_at', '<=', filters.date_to);
      }

      const stats = await query
        .select(
          knex.raw('COUNT(*) as total'),
          knex.raw('COUNT(CASE WHEN status = \'completed\' THEN 1 END) as completed'),
          knex.raw('COUNT(CASE WHEN status = \'pending\' THEN 1 END) as pending'),
          knex.raw('COUNT(CASE WHEN status = \'failed\' THEN 1 END) as failed'),
          knex.raw('SUM(CASE WHEN status = \'completed\' THEN amount ELSE 0 END) as total_amount'),
          knex.raw('SUM(CASE WHEN status = \'completed\' THEN net_amount ELSE 0 END) as total_net_amount'),
          knex.raw('AVG(CASE WHEN status = \'completed\' THEN amount END) as avg_amount')
        )
        .first();

      // Estatísticas por tipo
      const typeStats = await knex('payments')
        .select('payment_type')
        .count('* as count')
        .sum('amount as total')
        .where('status', 'completed')
        .groupBy('payment_type');

      return {
        ...stats,
        by_type: typeStats
      };
    } catch (error) {
      console.error('Erro ao obter estatísticas de pagamentos:', error);
      throw error;
    }
  }

  // Buscar pagamentos pendentes
  static async findPending() {
    try {
      return await knex('payments')
        .where('status', 'pending')
        .orderBy('created_at', 'asc');
    } catch (error) {
      console.error('Erro ao buscar pagamentos pendentes:', error);
      throw error;
    }
  }

  // Buscar pagamentos por referência externa
  static async findByReference(referenceId, gateway) {
    try {
      const payment = await knex('payments')
        .where('reference_id', referenceId)
        .where('gateway', gateway)
        .first();
      
      return payment;
    } catch (error) {
      console.error('Erro ao buscar pagamento por referência:', error);
      throw error;
    }
  }

  // Verificar se pagamento existe
  static async exists(id) {
    try {
      const payment = await knex('payments')
        .where('id', id)
        .first();
      
      return !!payment;
    } catch (error) {
      console.error('Erro ao verificar existência do pagamento:', error);
      throw error;
    }
  }

  // Deletar pagamento (soft delete - apenas muda status)
  static async softDelete(id, reason = '') {
    try {
      const [payment] = await knex('payments')
        .where('id', id)
        .update({
          status: 'cancelled',
          cancellation_reason: reason,
          updated_at: new Date()
        })
        .returning('*');
      
      return payment;
    } catch (error) {
      console.error('Erro ao cancelar pagamento:', error);
      throw error;
    }
  }

  // Processar reembolso
  static async processRefund(id, refundAmount, reason = '') {
    try {
      const [payment] = await knex('payments')
        .where('id', id)
        .update({
          status: 'refunded',
          refund_amount: refundAmount,
          refund_reason: reason,
          refunded_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');
      
      return payment;
    } catch (error) {
      console.error('Erro ao processar reembolso:', error);
      throw error;
    }
  }

  // Buscar pagamentos para conciliação
  static async findForReconciliation(dateFrom, dateTo) {
    try {
      return await knex('payments')
        .where('created_at', '>=', dateFrom)
        .where('created_at', '<=', dateTo)
        .where('status', 'completed')
        .where('is_conciliated', false)
        .orderBy('created_at', 'asc');
    } catch (error) {
      console.error('Erro ao buscar pagamentos para conciliação:', error);
      throw error;
    }
  }

  // Marcar como conciliado
  static async markAsConciliated(id, conciliationId) {
    try {
      const [payment] = await knex('payments')
        .where('id', id)
        .update({
          is_conciliated: true,
          conciliation_id: conciliationId,
          conciliation_date: new Date(),
          updated_at: new Date()
        })
        .returning('*');
      
      return payment;
    } catch (error) {
      console.error('Erro ao marcar pagamento como conciliado:', error);
      throw error;
    }
  }
}

module.exports = Payment;
