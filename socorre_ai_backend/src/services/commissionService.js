const db = require('../config/database');
const walletService = require('./walletService');
const notificationService = require('./notificationService');

class CommissionService {
  /**
   * Calcular comissão do serviço
   */
  calculateCommission(totalAmount, commissionRate = 25.00) {
    const commission = totalAmount * (commissionRate / 100);
    const partnerEarnings = totalAmount - commission;
    return {
      totalAmount,
      commission,
      partnerEarnings,
      commissionRate
    };
  }

  /**
   * Processar comissão de um pagamento
   */
  async processCommission(paymentId) {
    const trx = await db.transaction();

    try {
      // Buscar pagamento com todas as informações
      const payment = await trx('payments')
        .where('id', paymentId)
        .first();

      if (!payment || payment.status !== 'completed') {
        throw new Error('Pagamento inválido ou não concluído');
      }

      // Buscar parceiro e sua carteira
      const partner = await trx('partners')
        .where('id', payment.partner_id)
        .first();

      if (!partner) {
        throw new Error('Parceiro não encontrado');
      }

      let wallet = await walletService.getWalletByPartnerId(partner.id);
      if (!wallet) {
        wallet = await walletService.createWallet(partner.user_id, partner.id);
      }

      // Calcular comissão
      const commissionRate = partner.commission_rate || wallet.platform_commission_rate || 25.00;
      const { totalAmount, commission, partnerEarnings, commissionRate: calcRate } = 
        this.calculateCommission(parseFloat(payment.amount), commissionRate);

      // Identificar tipo de serviço
      let serviceType, serviceId;
      if (payment.emergency_request_id) {
        serviceType = 'emergency';
        serviceId = payment.emergency_request_id;
      } else if (payment.delivery_order_id) {
        serviceType = 'delivery';
        serviceId = payment.delivery_order_id;
      } else if (payment.purchase_order_id) {
        serviceType = 'purchase';
        serviceId = payment.purchase_order_id;
      }

      // Criar registro de comissão
      const [commissionId] = await trx('commissions').insert({
        payment_id: paymentId,
        partner_id: partner.id,
        emergency_request_id: serviceType === 'emergency' ? serviceId : null,
        delivery_order_id: serviceType === 'delivery' ? serviceId : null,
        purchase_order_id: serviceType === 'purchase' ? serviceId : null,
        total_amount: totalAmount,
        platform_commission: commission,
        partner_earnings: partnerEarnings,
        commission_rate: calcRate,
        gateway_fee: payment.fee_amount || 0,
        processing_fee: 0,
        status: 'processed',
        created_at: new Date(),
        updated_at: new Date()
      });

      await trx.commit();

      // Creditar valor na carteira do parceiro
      await walletService.addBalance(
        wallet.id,
        partnerEarnings,
        'deposit',
        commissionId,
        `Recebimento por serviço ${serviceType || 'realizado'}`
      );

      // Atualizar comissão com ID da transação de saque
      const updatedCommission = await this.getCommission(commissionId);
      
      // Notificar parceiro
      await this.sendNotification(partner.user_id, {
        title: '💰 Pagamento Recebido',
        body: `R$ ${partnerEarnings.toFixed(2)} creditados na sua carteira (comissão: ${calcRate.toFixed(0)}%)`,
        type: 'commission',
        data: { commissionId, amount: partnerEarnings, commission: commission }
      });

      return updatedCommission;

    } catch (error) {
      await trx.rollback();
      console.error('Erro ao processar comissão:', error);
      throw error;
    }
  }

  /**
   * Obter comissão por ID
   */
  async getCommission(commissionId) {
    try {
      return await db('commissions').where('id', commissionId).first();
    } catch (error) {
      console.error('Erro ao buscar comissão:', error);
      throw error;
    }
  }

  /**
   * Obter comissões por parceiro
   */
  async getPartnerCommissions(partnerId, filters = {}) {
    try {
      const {
        status,
        page = 1,
        limit = 20,
        startDate,
        endDate
      } = filters;

      const offset = (page - 1) * limit;

      let query = db('commissions')
        .where('partner_id', partnerId)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      if (status) query = query.where('status', status);
      if (startDate) query = query.where('created_at', '>=', startDate);
      if (endDate) query = query.where('created_at', '<=', endDate);

      const commissions = await query;

      const [{ count }] = await db('commissions')
        .where('partner_id', partnerId)
        .count('* as count');

      return {
        commissions,
        pagination: {
          page,
          limit,
          total: parseInt(count),
          pages: Math.ceil(count / limit)
        }
      };

    } catch (error) {
      console.error('Erro ao buscar comissões:', error);
      throw error;
    }
  }

  /**
   * Obter estatísticas de comissões
   */
  async getCommissionStats(partnerId = null) {
    try {
      let query = db('commissions');

      if (partnerId) {
        query = query.where('partner_id', partnerId);
      }

      const stats = await query
        .select(
          db.raw('COUNT(*) as total_commissions'),
          db.raw('SUM(total_amount) as total_revenue'),
          db.raw('SUM(platform_commission) as total_platform_commission'),
          db.raw('SUM(partner_earnings) as total_partner_earnings'),
          db.raw('AVG(commission_rate) as avg_commission_rate'),
          db.raw('COUNT(CASE WHEN status = "processed" THEN 1 END) as processed_commissions'),
          db.raw('COUNT(CASE WHEN status = "paid" THEN 1 END) as paid_commissions')
        )
        .first();

      return stats;

    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      throw error;
    }
  }

  /**
   * Cancelar comissão (reembolso)
   */
  async cancelCommission(commissionId, reason = '') {
    const trx = await db.transaction();

    try {
      const commission = await trx('commissions')
        .where('id', commissionId)
        .first();

      if (!commission) {
        throw new Error('Comissão não encontrada');
      }

      // Se já foi paga, debitar da carteira
      if (commission.status === 'paid' && commission.withdrawal_transaction_id) {
        const wallet = await walletService.getWalletByPartnerId(commission.partner_id);
        if (wallet) {
          await walletService.deductBalance(
            wallet.id,
            commission.partner_earnings,
            'refund',
            commissionId,
            `Reembolso: ${reason || 'Serviço cancelado'}`
          );
        }
      }

      // Atualizar status
      await trx('commissions')
        .where('id', commissionId)
        .update({
          status: 'cancelled',
          updated_at: new Date()
        });

      await trx.commit();

      return await this.getCommission(commissionId);

    } catch (error) {
      await trx.rollback();
      console.error('Erro ao cancelar comissão:', error);
      throw error;
    }
  }

  /**
   * Enviar notificação
   */
  async sendNotification(userId, notification) {
    try {
      await notificationService.sendNotificationToUser(userId, notification);
    } catch (error) {
      console.error('Erro ao enviar notificação:', error);
    }
  }
}

module.exports = new CommissionService();

