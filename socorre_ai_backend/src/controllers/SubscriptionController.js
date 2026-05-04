const Subscription = require('../models/Subscription');
const SubscriptionHistory = require('../models/SubscriptionHistory');
const Payment = require('../models/Payment');
const Partner = require('../models/Partner');
const SystemSettings = require('../models/SystemSettings');

const SUBSCRIPTION_TYPE_TO_CANONICAL = {
  mecanico: 'mechanic',
  posto_combustivel: 'gas_station',
  auto_pecas: 'auto_parts',
  mechanic: 'mechanic',
  gas_station: 'gas_station',
  auto_parts: 'auto_parts'
};

const CANONICAL_SUBSCRIPTION_TYPE_TO_LEGACY = {
  mechanic: 'mecanico',
  gas_station: 'posto_combustivel',
  auto_parts: 'auto_pecas'
};

function toCanonicalSubscriptionType(type) {
  return SUBSCRIPTION_TYPE_TO_CANONICAL[type] || null;
}

function toLegacySubscriptionType(type) {
  const canonicalType = toCanonicalSubscriptionType(type);
  return canonicalType ? CANONICAL_SUBSCRIPTION_TYPE_TO_LEGACY[canonicalType] : null;
}

function serializeSubscription(subscription) {
  if (!subscription) return subscription;

  const canonicalType = toCanonicalSubscriptionType(subscription.type) || subscription.type;
  const startDate = subscription.start_date || subscription.created_at || null;
  const endDate =
    subscription.end_date ||
    subscription.next_billing_date ||
    subscription.due_date ||
    null;
  const monthlyFee = subscription.monthly_fee !== undefined && subscription.monthly_fee !== null
    ? parseFloat(subscription.monthly_fee)
    : subscription.monthly_fee;
  const lastPaymentAmount = subscription.last_payment_amount !== undefined && subscription.last_payment_amount !== null
    ? parseFloat(subscription.last_payment_amount)
    : subscription.last_payment_amount;

  return {
    ...subscription,
    type: canonicalType,
    legacy_type: subscription.type,
    partner_name: subscription.partner_name || subscription.business_name || subscription.user_name || '',
    monthly_fee: monthlyFee,
    start_date: startDate,
    end_date: endDate,
    cancelled_at: subscription.cancelled_at || null,
    cancellation_reason: subscription.cancellation_reason || null,
    failed_payment_attempts: subscription.failed_payment_attempts ?? subscription.failed_attempts ?? 0,
    last_payment_at: subscription.last_payment_at || subscription.last_successful_payment || null,
    last_payment_amount: lastPaymentAmount
  };
}

function serializeSubscriptionCollection(subscriptions) {
  return subscriptions.map(serializeSubscription);
}

class SubscriptionController {
  static async _getCurrentPartner(req) {
    if (req.user?.partner_id) {
      return Partner.findById(req.user.partner_id);
    }

    if (req.user?.id) {
      return Partner.findByUserId(req.user.id);
    }

    return null;
  }

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
      const canonicalType = toCanonicalSubscriptionType(type);
      const legacyType = toLegacySubscriptionType(type);

      if (!canonicalType || !legacyType) {
        return res.status(400).json({ 
          error: 'Tipo de assinatura inválido' 
        });
      }

      // Verificar se parceiro existe e é do tipo correto
      const partner = await Partner.findById(partner_id);
      if (!partner) {
        return res.status(404).json({ error: 'Parceiro não encontrado' });
      }

      if (partner.type !== canonicalType) {
        return res.status(400).json({
          error: 'Tipo de assinatura incompatível com o tipo do parceiro'
        });
      }

      // Verificar se já tem assinatura ativa
      const existingSubscription = await Subscription.findByPartner(partner_id);
      if (existingSubscription && existingSubscription.status === 'active') {
        return res.status(400).json({ 
          error: 'Parceiro já possui assinatura ativa' 
        });
      }

      // Obter valor da mensalidade
      const monthlyFeeKey = `${legacyType}_monthly_fee`;
      const monthlyFeeSetting = await SystemSettings.findByKey(monthlyFeeKey);
      const monthlyFee = typeof monthlyFeeSetting === 'number'
        ? monthlyFeeSetting
        : parseFloat(monthlyFeeSetting || '99.00');

      // Criar assinatura
      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

      const subscriptionData = {
        partner_id,
        type: legacyType,
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
        data: serializeSubscription(subscription),
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
      if (type) {
        const normalizedType = toLegacySubscriptionType(type);
        if (!normalizedType) {
          return res.status(400).json({
            error: 'Tipo de assinatura inválido'
          });
        }
        filters.type = normalizedType;
      }
      if (status) filters.status = status;
      if (search) filters.search = search;

      const result = await Subscription.findAll(
        parseInt(page), 
        parseInt(limit), 
        filters
      );

      res.json({
        success: true,
        data: {
          ...result,
          subscriptions: serializeSubscriptionCollection(result.subscriptions)
        }
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
        data: serializeSubscription(subscription)
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
        data: serializeSubscription(updatedSubscription),
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
        data: serializeSubscription(cancelledSubscription),
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
        data: serializeSubscription(updatedSubscription),
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
        data: serializeSubscription(updatedSubscription),
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
        data: serializeSubscriptionCollection(subscriptions)
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
        data: serializeSubscriptionCollection(subscriptions)
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
        data: serializeSubscriptionCollection(subscriptions)
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
        data: serializeSubscriptionCollection(subscriptions)
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
          subscription: serializeSubscription(subscription),
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
        data: {
          ...stats,
          mechanic: stats.mecanico,
          gas_station: stats.posto_combustivel,
          auto_parts: stats.auto_pecas
        }
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
        data: serializeSubscription(updatedSubscription),
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
