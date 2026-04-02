const Subscription = require('../models/Subscription');
const SubscriptionHistory = require('../models/SubscriptionHistory');
const Payment = require('../models/Payment');
const Partner = require('../models/Partner');
const SystemSettings = require('../models/SystemSettings');

class SubscriptionController {
  // Criar nova assinatura
  static async create(req, res) {
    try {
      const { partner_id, type, payment_method, auto_renew = true } = req.body;

      // Validar dados
      if (!partner_id || !type) {
        return res.status(400).json({ 
          error: 'Dados obrigatórios: partner_id, type' 
        });
      }

      // Validar tipo
      const validTypes = ['mecanico', 'posto_combustivel', 'auto_pecas'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ 
          error: 'Tipo de assinatura inválido' 
        });
      }

      // Verificar se parceiro existe e é do tipo correto
      const partner = await Partner.findById(partner_id);
      if (!partner) {
        return res.status(404).json({ error: 'Parceiro não encontrado' });
      }

      // Verificar se já tem assinatura ativa
      const existingSubscription = await Subscription.findByPartner(partner_id);
      if (existingSubscription && existingSubscription.status === 'active') {
        return res.status(400).json({ 
          error: 'Parceiro já possui assinatura ativa' 
        });
      }

      // Obter valor da mensalidade
      const monthlyFeeKey = `${type}_monthly_fee`;
      const monthlyFeeSetting = await SystemSettings.findByKey(monthlyFeeKey);
      const monthlyFee = parseFloat(monthlyFeeSetting?.setting_value || '99.00');

      // Criar assinatura
      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

      const subscriptionData = {
        partner_id,
        type,
        monthly_fee: monthlyFee,
        due_date: nextBillingDate,
        next_billing_date: nextBillingDate,
        payment_method,
        auto_renew,
        status: 'pending_payment'
      };

      const subscription = await Subscription.create(subscriptionData);

      // Registrar no histórico
      await SubscriptionHistory.recordCreation(
        subscription.id, 
        partner_id, 
        monthlyFee, 
        req.user?.id
      );

      res.status(201).json({
        success: true,
        data: subscription,
        message: 'Assinatura criada com sucesso'
      });

    } catch (error) {
      console.error('Erro ao criar assinatura:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Listar assinaturas
  static async findAll(req, res) {
    try {
      const { page = 1, limit = 10, type, status, search } = req.query;

      const filters = {};
      if (type) filters.type = type;
      if (status) filters.status = status;
      if (search) filters.search = search;

      const result = await Subscription.findAll(
        parseInt(page), 
        parseInt(limit), 
        filters
      );

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('Erro ao listar assinaturas:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar assinatura por ID
  static async findById(req, res) {
    try {
      const { id } = req.params;

      const subscription = await Subscription.findById(id);
      if (!subscription) {
        return res.status(404).json({ error: 'Assinatura não encontrada' });
      }

      res.json({
        success: true,
        data: subscription
      });

    } catch (error) {
      console.error('Erro ao buscar assinatura:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Atualizar assinatura
  static async update(req, res) {
    try {
      const { id } = req.params;
      const { payment_method, auto_renew, notes } = req.body;

      const subscription = await Subscription.findById(id);
      if (!subscription) {
        return res.status(404).json({ error: 'Assinatura não encontrada' });
      }

      const updateData = {};
      if (payment_method !== undefined) updateData.payment_method = payment_method;
      if (auto_renew !== undefined) updateData.auto_renew = auto_renew;
      if (notes !== undefined) updateData.notes = notes;

      const updatedSubscription = await Subscription.update(id, updateData);

      res.json({
        success: true,
        data: updatedSubscription,
        message: 'Assinatura atualizada com sucesso'
      });

    } catch (error) {
      console.error('Erro ao atualizar assinatura:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Cancelar assinatura
  static async cancel(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const subscription = await Subscription.findById(id);
      if (!subscription) {
        return res.status(404).json({ error: 'Assinatura não encontrada' });
      }

      if (subscription.status === 'cancelled') {
        return res.status(400).json({ error: 'Assinatura já está cancelada' });
      }

      const cancelledSubscription = await Subscription.cancel(id, reason);

      // Registrar no histórico
      await SubscriptionHistory.recordCancellation(
        id, 
        subscription.partner_id, 
        reason, 
        req.user?.id
      );

      res.json({
        success: true,
        data: cancelledSubscription,
        message: 'Assinatura cancelada com sucesso'
      });

    } catch (error) {
      console.error('Erro ao cancelar assinatura:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Processar pagamento de assinatura
  static async processPayment(req, res) {
    try {
      const { id } = req.params;
      const { payment_method, gateway_transaction_id } = req.body;

      const subscription = await Subscription.findById(id);
      if (!subscription) {
        return res.status(404).json({ error: 'Assinatura não encontrada' });
      }

      // Calcular próxima data de cobrança
      const nextBillingDate = new Date(subscription.next_billing_date);
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

      // Processar pagamento
      const updatedSubscription = await Subscription.processPayment(id, nextBillingDate);

      // Registrar no histórico
      await SubscriptionHistory.recordPayment(
        id, 
        subscription.partner_id, 
        subscription.monthly_fee, 
        null, // payment_id será gerado depois
        req.user?.id
      );

      res.json({
        success: true,
        data: updatedSubscription,
        message: 'Pagamento processado com sucesso'
      });

    } catch (error) {
      console.error('Erro ao processar pagamento:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Registrar falha de pagamento
  static async recordPaymentFailure(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const subscription = await Subscription.findById(id);
      if (!subscription) {
        return res.status(404).json({ error: 'Assinatura não encontrada' });
      }

      const updatedSubscription = await Subscription.recordPaymentFailure(id);

      // Registrar no histórico
      await SubscriptionHistory.recordPaymentFailure(
        id, 
        subscription.partner_id, 
        subscription.monthly_fee, 
        reason
      );

      res.json({
        success: true,
        data: updatedSubscription,
        message: 'Falha de pagamento registrada'
      });

    } catch (error) {
      console.error('Erro ao registrar falha de pagamento:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar assinaturas vencendo em breve
  static async findExpiringSoon(req, res) {
    try {
      const { days = 7 } = req.query;

      const subscriptions = await Subscription.findExpiringSoon(parseInt(days));

      res.json({
        success: true,
        data: subscriptions
      });

    } catch (error) {
      console.error('Erro ao buscar assinaturas vencendo:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar assinaturas vencidas
  static async findExpired(req, res) {
    try {
      const subscriptions = await Subscription.findExpired();

      res.json({
        success: true,
        data: subscriptions
      });

    } catch (error) {
      console.error('Erro ao buscar assinaturas vencidas:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar assinaturas ativas
  static async findActive(req, res) {
    try {
      const subscriptions = await Subscription.findActive();

      res.json({
        success: true,
        data: subscriptions
      });

    } catch (error) {
      console.error('Erro ao buscar assinaturas ativas:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar assinaturas para cobrança automática
  static async findForAutoBilling(req, res) {
    try {
      const subscriptions = await Subscription.findForAutoBilling();

      res.json({
        success: true,
        data: subscriptions
      });

    } catch (error) {
      console.error('Erro ao buscar assinaturas para cobrança:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Verificar status de assinatura do parceiro
  static async checkPartnerStatus(req, res) {
    try {
      const { partner_id } = req.params;

      const partner = await Partner.findById(partner_id);
      if (!partner) {
        return res.status(404).json({ error: 'Parceiro não encontrado' });
      }

      const hasActiveSubscription = await Subscription.isPartnerActive(partner_id);
      const subscription = await Subscription.findByPartner(partner_id);

      res.json({
        success: true,
        data: {
          partner_id,
          has_active_subscription: hasActiveSubscription,
          subscription: subscription,
          partner_type: partner.type
        }
      });

    } catch (error) {
      console.error('Erro ao verificar status do parceiro:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Obter estatísticas
  static async getStats(req, res) {
    try {
      const stats = await Subscription.getStats();

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Erro ao obter estatísticas:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar histórico de assinatura
  static async getHistory(req, res) {
    try {
      const { id } = req.params;
      const { limit = 50 } = req.query;

      const history = await SubscriptionHistory.findBySubscription(id, parseInt(limit));

      res.json({
        success: true,
        data: history
      });

    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Renovar assinatura manualmente
  static async renew(req, res) {
    try {
      const { id } = req.params;

      const subscription = await Subscription.findById(id);
      if (!subscription) {
        return res.status(404).json({ error: 'Assinatura não encontrada' });
      }

      // Calcular próxima data de cobrança
      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

      // Atualizar assinatura
      const updatedSubscription = await Subscription.update(id, {
        status: 'active',
        next_billing_date: nextBillingDate,
        failed_attempts: 0
      });

      // Registrar no histórico
      await SubscriptionHistory.recordRenewal(
        id, 
        subscription.partner_id, 
        subscription.monthly_fee
      );

      res.json({
        success: true,
        data: updatedSubscription,
        message: 'Assinatura renovada com sucesso'
      });

    } catch (error) {
      console.error('Erro ao renovar assinatura:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }
}

module.exports = SubscriptionController;
