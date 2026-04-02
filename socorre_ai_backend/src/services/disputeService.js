const db = require('../config/database');
const paymentService = require('./paymentService');
const walletService = require('./walletService');
const commissionService = require('./commissionService');
const notificationService = require('./notificationService');
const fraudDetectionService = require('./fraudDetectionService');

class DisputeService {
  /**
   * Criar disputa
   */
  async createDispute(disputeData) {
    try {
      const {
        paymentId,
        userId,
        partnerId,
        type,
        reason,
        description,
        disputedAmount,
        emergencyRequestId,
        deliveryOrderId,
        purchaseOrderId,
        evidence
      } = disputeData;

      // Validar pagamento
      const payment = await paymentService.getPayment(paymentId);
      if (!payment) {
        throw new Error('Pagamento não encontrado');
      }

      // Validar disputa não existe
      const existingDispute = await db('disputes')
        .where('payment_id', paymentId)
        .where('status', 'open')
        .first();

      if (existingDispute) {
        throw new Error('Já existe uma disputa aberta para este pagamento');
      }

      // Análise de fraude
      const fraudCheck = await fraudDetectionService.analyzeDispute({
        payment,
        disputeData
      });

      if (fraudCheck.isFraud) {
        throw new Error(`Disputa rejeitada: ${fraudCheck.reason}`);
      }

      // Criar disputa
      const [disputeId] = await db('disputes').insert({
        payment_id: paymentId,
        user_id: userId,
        partner_id: partnerId,
        type,
        initiated_by: 'user',
        reason,
        description,
        disputed_amount: disputedAmount || payment.amount,
        emergency_request_id: emergencyRequestId,
        delivery_order_id: deliveryOrderId,
        purchase_order_id: purchaseOrderId,
        evidence: JSON.stringify(evidence || {}),
        status: 'open',
        priority: this.calculatePriority(type, disputedAmount),
        created_at: new Date(),
        updated_at: new Date()
      });

      const dispute = await this.getDispute(disputeId);

      // Notificar parceiro
      await this.sendNotification(partnerId, {
        to: 'partner',
        userId: partnerId,
        title: '⚠️ Disputa Aberta',
        body: `Uma disputa foi aberta por ${reason}`,
        type: 'dispute',
        data: { disputeId, type, reason }
      });

      // Notificar plataforma (admin)
      await this.sendNotification(null, {
        to: 'admin',
        title: '🚨 Nova Disputa',
        body: `Disputa #${disputeId} - ${type}`,
        type: 'dispute',
        data: { disputeId, priority: dispute.priority }
      });

      return dispute;

    } catch (error) {
      console.error('Erro ao criar disputa:', error);
      throw error;
    }
  }

  /**
   * Responder disputa (parceiro)
   */
  async respondToDispute(disputeId, partnerId, response) {
    try {
      const dispute = await db('disputes')
        .where('id', disputeId)
        .where('partner_id', partnerId)
        .first();

      if (!dispute) {
        throw new Error('Disputa não encontrada');
      }

      if (dispute.status !== 'open') {
        throw new Error('Disputa não está aberta para resposta');
      }

      await db('disputes')
        .where('id', disputeId)
        .update({
          partner_response: response,
          status: 'under_review',
          updated_at: new Date()
        });

      const updatedDispute = await this.getDispute(disputeId);

      // Notificar usuário
      await this.sendNotification(dispute.user_id, {
        to: 'user',
        userId: dispute.user_id,
        title: '📝 Resposta à Disputa',
        body: 'O parceiro respondeu à sua disputa',
        type: 'dispute',
        data: { disputeId }
      });

      return updatedDispute;

    } catch (error) {
      console.error('Erro ao responder disputa:', error);
      throw error;
    }
  }

  /**
   * Resolver disputa (admin)
   */
  async resolveDispute(disputeId, resolutionData) {
    const trx = await db.transaction();

    try {
      const {
        resolution,
        refundAmount,
        resolutionNotes,
        resolvedBy
      } = resolutionData;

      const dispute = await trx('disputes')
        .where('id', disputeId)
        .first();

      if (!dispute) {
        throw new Error('Disputa não encontrada');
      }

      const payment = await paymentService.getPayment(dispute.payment_id);

      // Processar reembolso se necessário
      if (refundAmount && refundAmount > 0) {
        // Reembolsar cliente
        await this.processRefund({
          payment,
          dispute,
          refundAmount
        });

        // Debitar parceiro se necessário
        if (resolution === 'refund_full' || resolution === 'refund_partial') {
          await this.debitPartner(dispute, refundAmount);
        }
      }

      // Atualizar disputa
      await trx('disputes')
        .where('id', disputeId)
        .update({
          status: 'resolved',
          resolution,
          refund_amount: refundAmount || 0,
          resolution_notes: resolutionNotes,
          resolved_by: resolvedBy,
          resolved_at: new Date(),
          updated_at: new Date()
        });

      // Atualizar pagamento
      await trx('payments')
        .where('id', dispute.payment_id)
        .update({
          status: dispute.status === 'resolved' && refundAmount > 0 ? 'refunded' : payment.status,
          updated_at: new Date()
        });

      await trx.commit();

      const resolvedDispute = await this.getDispute(disputeId);

      // Notificar partes
      await this.sendNotification(dispute.user_id, {
        to: 'user',
        userId: dispute.user_id,
        title: '✅ Disputa Resolvida',
        body: `Disputa resolvida: ${this.getResolutionMessage(resolution)}`,
        type: 'dispute',
        data: { disputeId, resolution, refundAmount }
      });

      await this.sendNotification(dispute.partner_id, {
        to: 'partner',
        userId: dispute.partner_id,
        title: '📋 Disputa Resolvida',
        body: `Disputa #${disputeId} foi resolvida`,
        type: 'dispute',
        data: { disputeId, resolution }
      });

      return resolvedDispute;

    } catch (error) {
      await trx.rollback();
      console.error('Erro ao resolver disputa:', error);
      throw error;
    }
  }

  /**
   * Processar reembolso
   */
  async processRefund({ payment, dispute, refundAmount }) {
    try {
      // Processar reembolso no gateway (quando implementado)
      // Por enquanto, apenas atualizar status

      // Se cliente tem carteira, creditar
      let wallet = await walletService.getWalletByUserId(dispute.user_id);
      if (wallet) {
        await walletService.addBalance(
          wallet.id,
          refundAmount,
          'refund',
          dispute.id,
          `Reembolso da disputa #${dispute.id}`
        );
      }

      // Criar registro de reembolso
      await paymentService.refundPayment(payment.id, refundAmount, dispute.reason);

    } catch (error) {
      console.error('Erro ao processar reembolso:', error);
      throw error;
    }
  }

  /**
   * Debitar parceiro
   */
  async debitPartner(dispute, refundAmount) {
    try {
      const wallet = await walletService.getWalletByPartnerId(dispute.partner_id);
      if (!wallet) return;

      await walletService.deductBalance(
        wallet.id,
        refundAmount,
        'refund',
        dispute.id,
        `Reembolso da disputa #${dispute.id}`
      );

      // Cancelar comissão correspondente
      const commission = await db('commissions')
        .where('payment_id', dispute.payment_id)
        .first();

      if (commission) {
        await commissionService.cancelCommission(commission.id, dispute.reason);
      }

    } catch (error) {
      console.error('Erro ao debitar parceiro:', error);
      // Não falha a disputa se não conseguir debitar
    }
  }

  /**
   * Obter disputa por ID
   */
  async getDispute(disputeId) {
    try {
      return await db('disputes').where('id', disputeId).first();
    } catch (error) {
      console.error('Erro ao buscar disputa:', error);
      throw error;
    }
  }

  /**
   * Listar disputas
   */
  async getDisputes(filters = {}) {
    try {
      const {
        userId,
        partnerId,
        status,
        type,
        priority,
        page = 1,
        limit = 20,
        startDate,
        endDate
      } = filters;

      const offset = (page - 1) * limit;

      let query = db('disputes')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      if (userId) query = query.where('user_id', userId);
      if (partnerId) query = query.where('partner_id', partnerId);
      if (status) query = query.where('status', status);
      if (type) query = query.where('type', type);
      if (priority) query = query.where('priority', priority);
      if (startDate) query = query.where('created_at', '>=', startDate);
      if (endDate) query = query.where('created_at', '<=', endDate);

      const disputes = await query;

      const [{ count }] = await db('disputes').count('* as count');

      return {
        disputes,
        pagination: {
          page,
          limit,
          total: parseInt(count),
          pages: Math.ceil(count / limit)
        }
      };

    } catch (error) {
      console.error('Erro ao buscar disputas:', error);
      throw error;
    }
  }

  /**
   * Calcular prioridade
   */
  calculatePriority(type, amount) {
    const priorityMap = {
      'fraud': 'urgent',
      'service_not_delivered': 'high',
      'quality_issue': 'medium',
      'refund_request': 'medium',
      'other': 'low'
    };

    if (amount > 500) return 'high';
    if (amount > 200) return 'medium';
    
    return priorityMap[type] || 'medium';
  }

  /**
   * Obter mensagem de resolução
   */
  getResolutionMessage(resolution) {
    const messages = {
      'refund_full': 'Reembolso total aprovado',
      'refund_partial': 'Reembolso parcial aprovado',
      'no_action': 'Disputa rejeitada',
      'service_redelivery': 'Reentrega do serviço aprovada'
    };
    return messages[resolution] || 'Disputa resolvida';
  }

  /**
   * Enviar notificação
   */
  async sendNotification(userIdOrPartnerId, notification) {
    try {
      if (notification.to === 'user') {
        await notificationService.sendNotificationToUser(userIdOrPartnerId, notification);
      } else if (notification.to === 'partner') {
        await notificationService.sendNotificationToUser(userIdOrPartnerId, notification);
      } else if (notification.to === 'admin') {
        // Notificar admins (implementar notificação específica para admin)
        console.log('Notificação admin:', notification);
      }
    } catch (error) {
      console.error('Erro ao enviar notificação:', error);
    }
  }
}

module.exports = new DisputeService();

