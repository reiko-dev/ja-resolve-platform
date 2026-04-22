const db = require('../config/database');
const notificationService = require('./notificationService');

class PaymentService {
  constructor() {
    this.gateways = {
      stripe: require('./gateways/stripeGateway'),
      mercadopago: require('./gateways/mercadopagoGateway'),
      pagseguro: require('./gateways/pagseguroGateway'),
    };
  }

  async createPayment(paymentData) {
    try {
      const {
        userId,
        partnerId,
        emergencyRequestId,
        deliveryOrderId,
        purchaseOrderId,
        subscriptionId,
        towProposalId,
        amount,
        currency = 'BRL',
        method,
        gateway = 'stripe',
        description,
        referenceId,
        cardData,
        pixData,
        bankSlipData,
        paymentType = 'emergency_service'
      } = paymentData;

      // Validar dados obrigatórios
      if (!userId || !amount || !method || !gateway) {
        throw new Error('Dados obrigatórios não fornecidos');
      }

      // Validar tipo de pagamento
      const validPaymentTypes = ['emergency_service', 'subscription', 'delivery', 'product_purchase', 'tip', 'fee', 'penalty'];
      if (!validPaymentTypes.includes(paymentType)) {
        throw new Error('Tipo de pagamento inválido');
      }

      // Calcular taxa do gateway
      const feeAmount = this.calculateGatewayFee(amount, method, gateway, paymentType);
      const netAmount = amount - feeAmount;

      // Preparar dados do pagamento
      const paymentRecord = {
        user_id: userId,
        partner_id: partnerId,
        emergency_request_id: emergencyRequestId,
        delivery_order_id: deliveryOrderId,
        purchase_order_id: purchaseOrderId,
        subscription_id: subscriptionId,
        tow_proposal_id: towProposalId,
        payment_type: paymentType,
        amount: amount,
        currency: currency,
        method: method,
        gateway: gateway,
        description: description,
        reference_id: referenceId,
        fee_amount: feeAmount,
        net_amount: netAmount,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date()
      };

      // Adicionar dados específicos do método
      if (method === 'credit_card' && cardData) {
        paymentRecord.card_last_four = cardData.lastFour;
        paymentRecord.card_brand = cardData.brand;
        paymentRecord.card_exp_month = cardData.expMonth;
        paymentRecord.card_exp_year = cardData.expYear;
      }

      if (method === 'pix' && pixData) {
        paymentRecord.pix_code = pixData.code;
        paymentRecord.pix_qr_code = pixData.qrCode;
        paymentRecord.pix_expires_at = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos
      }

      if (method === 'bank_slip' && bankSlipData) {
        paymentRecord.bank_slip_code = bankSlipData.code;
        paymentRecord.bank_slip_url = bankSlipData.url;
        paymentRecord.bank_slip_expires_at = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 dias
      }

      // Salvar no banco
      const [paymentId] = await db('payments').insert(paymentRecord);

      // Processar pagamento no gateway
      const gatewayResponse = await this.processPayment(paymentId, paymentData);

      // Atualizar com resposta do gateway
      await db('payments')
        .where('id', paymentId)
        .update({
          gateway_transaction_id: gatewayResponse.transactionId,
          gateway_payment_id: gatewayResponse.paymentId,
          gateway_response: JSON.stringify(gatewayResponse),
          status: gatewayResponse.status,
          processed_at: new Date(),
          updated_at: new Date()
        });

      // Enviar notificação
      await this.sendPaymentNotification(userId, paymentId, gatewayResponse.status);

      return {
        id: paymentId,
        status: gatewayResponse.status,
        gatewayResponse: gatewayResponse
      };

    } catch (error) {
      console.error('Erro ao criar pagamento:', error);
      throw error;
    }
  }

  async processPayment(paymentId, paymentData) {
    try {
      const gateway = this.gateways[paymentData.gateway];
      if (!gateway) {
        throw new Error(`Gateway ${paymentData.gateway} não suportado`);
      }

      const paymentRecord = await db('payments').where('id', paymentId).first();
      if (!paymentRecord) {
        throw new Error('Pagamento não encontrado');
      }

      // Processar no gateway específico
      const response = await gateway.processPayment({
        amount: paymentRecord.amount,
        currency: paymentRecord.currency,
        method: paymentRecord.method,
        description: paymentRecord.description,
        referenceId: paymentRecord.reference_id,
        cardData: paymentData.cardData,
        pixData: paymentData.pixData,
        bankSlipData: paymentData.bankSlipData
      });

      return response;

    } catch (error) {
      console.error('Erro ao processar pagamento:', error);
      throw error;
    }
  }

  async confirmPayment(paymentId) {
    try {
      const payment = await db('payments').where('id', paymentId).first();
      if (!payment) {
        throw new Error('Pagamento não encontrado');
      }

      // Verificar status no gateway
      const gateway = this.gateways[payment.gateway];
      const status = await gateway.getPaymentStatus(payment.gateway_transaction_id);

      // Atualizar status
      await db('payments')
        .where('id', paymentId)
        .update({
          status: status,
          completed_at: status === 'completed' ? new Date() : null,
          updated_at: new Date()
        });

      // Enviar notificação
      await this.sendPaymentNotification(payment.user_id, paymentId, status);

      return { status };

    } catch (error) {
      console.error('Erro ao confirmar pagamento:', error);
      throw error;
    }
  }

  async cancelPayment(paymentId, reason = '') {
    try {
      const payment = await db('payments').where('id', paymentId).first();
      if (!payment) {
        throw new Error('Pagamento não encontrado');
      }

      if (payment.status === 'completed') {
        throw new Error('Pagamento já foi concluído');
      }

      // Cancelar no gateway se necessário
      if (payment.gateway_transaction_id) {
        const gateway = this.gateways[payment.gateway];
        await gateway.cancelPayment(payment.gateway_transaction_id);
      }

      // Atualizar status
      await db('payments')
        .where('id', paymentId)
        .update({
          status: 'cancelled',
          cancelled_at: new Date(),
          updated_at: new Date()
        });

      // Enviar notificação
      await this.sendPaymentNotification(payment.user_id, paymentId, 'cancelled');

      return { status: 'cancelled' };

    } catch (error) {
      console.error('Erro ao cancelar pagamento:', error);
      throw error;
    }
  }

  async refundPayment(paymentId, amount = null, reason = '') {
    try {
      const payment = await db('payments').where('id', paymentId).first();
      if (!payment) {
        throw new Error('Pagamento não encontrado');
      }

      if (payment.status !== 'completed') {
        throw new Error('Apenas pagamentos concluídos podem ser reembolsados');
      }

      const refundAmount = amount || payment.amount;

      // Processar reembolso no gateway
      const gateway = this.gateways[payment.gateway];
      const refundResponse = await gateway.refundPayment(
        payment.gateway_transaction_id,
        refundAmount,
        reason
      );

      // Atualizar status
      await db('payments')
        .where('id', paymentId)
        .update({
          status: 'refunded',
          refunded_at: new Date(),
          updated_at: new Date()
        });

      // Enviar notificação
      await this.sendPaymentNotification(payment.user_id, paymentId, 'refunded');

      return { status: 'refunded', refundResponse };

    } catch (error) {
      console.error('Erro ao reembolsar pagamento:', error);
      throw error;
    }
  }

  async getPayment(paymentId) {
    try {
      const payment = await db('payments')
        .select('*')
        .where('id', paymentId)
        .first();

      if (!payment) {
        throw new Error('Pagamento não encontrado');
      }

      return payment;

    } catch (error) {
      console.error('Erro ao buscar pagamento:', error);
      throw error;
    }
  }

  async getUserPayments(userId, filters = {}) {
    try {
      const {
        status,
        method,
        gateway,
        startDate,
        endDate,
        page = 1,
        limit = 20
      } = filters;

      const offset = (page - 1) * limit;

      let query = db('payments')
        .select('*')
        .where('user_id', userId)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      if (status) {
        query = query.where('status', status);
      }

      if (method) {
        query = query.where('method', method);
      }

      if (gateway) {
        query = query.where('gateway', gateway);
      }

      if (startDate) {
        query = query.where('created_at', '>=', startDate);
      }

      if (endDate) {
        query = query.where('created_at', '<=', endDate);
      }

      const payments = await query;

      // Contar total
      const [{ count }] = await db('payments')
        .where('user_id', userId)
        .count('* as count');

      return {
        payments,
        pagination: {
          page,
          limit,
          total: parseInt(count),
          pages: Math.ceil(count / limit)
        }
      };

    } catch (error) {
      console.error('Erro ao buscar pagamentos do usuário:', error);
      throw error;
    }
  }

  async getPartnerPayments(partnerId, filters = {}) {
    try {
      const {
        status,
        method,
        gateway,
        startDate,
        endDate,
        page = 1,
        limit = 20
      } = filters;

      const offset = (page - 1) * limit;

      let query = db('payments')
        .select('*')
        .where('partner_id', partnerId)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      if (status) {
        query = query.where('status', status);
      }

      if (method) {
        query = query.where('method', method);
      }

      if (gateway) {
        query = query.where('gateway', gateway);
      }

      if (startDate) {
        query = query.where('created_at', '>=', startDate);
      }

      if (endDate) {
        query = query.where('created_at', '<=', endDate);
      }

      const payments = await query;

      // Contar total
      const [{ count }] = await db('payments')
        .where('partner_id', partnerId)
        .count('* as count');

      return {
        payments,
        pagination: {
          page,
          limit,
          total: parseInt(count),
          pages: Math.ceil(count / limit)
        }
      };

    } catch (error) {
      console.error('Erro ao buscar pagamentos do parceiro:', error);
      throw error;
    }
  }

  async getPaymentStats(userId = null, partnerId = null) {
    try {
      let query = db('payments');

      if (userId) {
        query = query.where('user_id', userId);
      }

      if (partnerId) {
        query = query.where('partner_id', partnerId);
      }

      const stats = await query
        .select(
          db.raw('COUNT(*) as total_payments'),
          db.raw('SUM(CASE WHEN status = "completed" THEN amount ELSE 0 END) as total_revenue'),
          db.raw('SUM(CASE WHEN status = "completed" THEN net_amount ELSE 0 END) as net_revenue'),
          db.raw('SUM(CASE WHEN status = "completed" THEN fee_amount ELSE 0 END) as total_fees'),
          db.raw('COUNT(CASE WHEN status = "completed" THEN 1 END) as completed_payments'),
          db.raw('COUNT(CASE WHEN status = "pending" THEN 1 END) as pending_payments'),
          db.raw('COUNT(CASE WHEN status = "failed" THEN 1 END) as failed_payments'),
          db.raw('COUNT(CASE WHEN status = "cancelled" THEN 1 END) as cancelled_payments'),
          db.raw('COUNT(CASE WHEN status = "refunded" THEN 1 END) as refunded_payments')
        )
        .first();

      return stats;

    } catch (error) {
      console.error('Erro ao buscar estatísticas de pagamento:', error);
      throw error;
    }
  }

  calculateGatewayFee(amount, method, gateway, paymentType = 'emergency_service') {
    // Taxas por gateway e método
    const fees = {
      stripe: {
        credit_card: 0.039, // 3.9%
        debit_card: 0.039,
        pix: 0.01, // 1%
        bank_slip: 0.02 // 2%
      },
      mercadopago: {
        credit_card: 0.0499, // 4.99%
        debit_card: 0.0499,
        pix: 0.01,
        bank_slip: 0.02
      },
      pagseguro: {
        credit_card: 0.0399, // 3.99%
        debit_card: 0.0399,
        pix: 0.01,
        bank_slip: 0.02
      }
    };

    // Taxas diferentes por tipo de pagamento
    const typeMultipliers = {
      'emergency_service': 1.0, // Taxa normal
      'subscription': 0.5, // 50% de desconto para assinaturas
      'delivery': 1.2, // 20% a mais para delivery
      'product_purchase': 1.0,
      'tip': 0.3, // 70% de desconto para gorjetas
      'fee': 0.8, // 20% de desconto para taxas
      'penalty': 1.0
    };

    const feeRate = fees[gateway]?.[method] || 0.05; // 5% padrão
    const multiplier = typeMultipliers[paymentType] || 1.0;
    
    return amount * feeRate * multiplier;
  }

  async sendPaymentNotification(userId, paymentId, status) {
    try {
      const statusMessages = {
        pending: 'Pagamento pendente',
        processing: 'Processando pagamento',
        completed: 'Pagamento confirmado',
        failed: 'Pagamento falhou',
        cancelled: 'Pagamento cancelado',
        refunded: 'Pagamento reembolsado'
      };

      const statusColors = {
        pending: '#D69E2E',
        processing: '#2B6CB0',
        completed: '#48BB78',
        failed: '#E53E3E',
        cancelled: '#718096',
        refunded: '#805AD5'
      };

      await notificationService.sendNotificationToUser(userId, {
        title: '💳 Atualização de Pagamento',
        body: statusMessages[status] || 'Status do pagamento atualizado',
        type: 'payment',
        data: {
          paymentId: paymentId,
          status: status,
          color: statusColors[status]
        }
      });

    } catch (error) {
      console.error('Erro ao enviar notificação de pagamento:', error);
    }
  }
}

module.exports = new PaymentService();
