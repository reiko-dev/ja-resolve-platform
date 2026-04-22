const Subscription = require('../models/Subscription');
const SubscriptionHistory = require('../models/SubscriptionHistory');
const Payment = require('../models/Payment');
const NotificationService = require('./NotificationServiceNew');
const SystemSettings = require('./SystemSettings');

class SubscriptionService {
  // Criar nova assinatura
  static async createSubscription(partnerId, type, paymentMethod, autoRenew = true) {
    try {
      // Verificar se parceiro existe
      const Partner = require('../models/Partner');
      const partner = await Partner.findById(partnerId);
      if (!partner) {
        throw new Error('Parceiro não encontrado');
      }

      // Verificar se já tem assinatura ativa
      const existingSubscription = await Subscription.findByPartner(partnerId);
      if (existingSubscription && existingSubscription.status === 'active') {
        throw new Error('Parceiro já possui assinatura ativa');
      }

      // Obter valor da mensalidade
      const monthlyFeeKey = `${type}_monthly_fee`;
      const monthlyFeeSetting = await SystemSettings.findByKey(monthlyFeeKey);
      const monthlyFee = parseFloat(monthlySetting?.setting_value || '99.00');

      // Calcular próxima data de cobrança
      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

      // Criar assinatura
      const subscriptionData = {
        partner_id: partnerId,
        type,
        monthly_fee: monthlyFee,
        due_date: nextBillingDate,
        next_billing_date: nextBillingDate,
        payment_method,
        auto_renew: autoRenew,
        status: 'pending_payment'
      };

      const subscription = await Subscription.create(subscriptionData);

      // Registrar no histórico
      await SubscriptionHistory.recordCreation(
        subscription.id, 
        partnerId, 
        monthlyFee, 
        null
      );

      return subscription;
    } catch (error) {
      console.error('Erro ao criar assinatura:', error);
      throw error;
    }
  }

  // Processar pagamento de assinatura
  static async processPayment(subscriptionId, paymentId = null) {
    try {
      const subscription = await Subscription.findById(subscriptionId);
      if (!subscription) {
        throw new Error('Assinatura não encontrada');
      }

      // Calcular próxima data de cobrança
      const nextBillingDate = new Date(subscription.next_billing_date);
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

      // Atualizar assinatura
      const updatedSubscription = await Subscription.processPayment(subscriptionId, nextBillingDate);

      // Registrar no histórico
      await SubscriptionHistory.recordPayment(
        subscriptionId, 
        subscription.partner_id, 
        subscription.monthly_fee, 
        paymentId
      );

      // Notificar parceiro
      await NotificationService.sendNotification(
        subscription.partner_id,
        'Pagamento Processado',
        `Seu pagamento de R$ ${subscription.monthly_fee} foi processado com sucesso!`,
        {
          type: 'subscription_payment_processed',
          subscription_id: subscriptionId
        }
      );

      return updatedSubscription;
    } catch (error) {
      console.error('Erro ao processar pagamento de assinatura:', error);
      throw error;
    }
  }

  // Registrar falha de pagamento
  static async recordPaymentFailure(subscriptionId, reason = 'Falha no processamento') {
    try {
      const subscription = await Subscription.findById(subscriptionId);
      if (!subscription) {
        throw new Error('Assinatura não encontrada');
      }

      const updatedSubscription = await Subscription.recordPaymentFailure(subscriptionId);

      // Registrar no histórico
      await SubscriptionHistory.recordPaymentFailure(
        subscriptionId, 
        subscription.partner_id, 
        subscription.monthly_fee, 
        reason
      );

      // Verificar se precisa suspender
      if (updatedSubscription.failed_attempts >= 3) {
        await this.suspendSubscription(subscriptionId, 'Múltiplas falhas de pagamento');
      }

      return updatedSubscription;
    } catch (error) {
      console.error('Erro ao registrar falha de pagamento:', error);
      throw error;
    }
  }

  // Suspender assinatura
  static async suspendSubscription(subscriptionId, reason = 'Suspensão automática') {
    try {
      const subscription = await Subscription.findById(subscriptionId);
      if (!subscription) {
        throw new Error('Assinatura não encontrada');
      }

      const updatedSubscription = await Subscription.updateStatus(subscriptionId, 'suspended', reason);

      // Registrar no histórico
      await SubscriptionHistory.recordSuspension(subscriptionId, subscription.partner_id, reason);

      return updatedSubscription;
    } catch (error) {
      console.error('Erro ao suspender assinatura:', error);
      throw error;
    }
  }

  // Cancelar assinatura
  static async cancelSubscription(subscriptionId, reason = null, performedBy = null) {
    try {
      const subscription = await Subscription.findById(subscriptionId);
      if (!subscription) {
        throw new Error('Assinatura não encontrada');
      }

      if (subscription.status === 'cancelled') {
        throw new Error('Assinatura já está cancelada');
      }

      const cancelledSubscription = await Subscription.cancel(subscriptionId, reason);

      // Registrar no histórico
      await SubscriptionHistory.recordCancellation(
        subscriptionId, 
        subscription.partner_id, 
        reason, 
        performedBy
      );

      return cancelledSubscription;
    } catch (error) {
      console.error('Erro ao cancelar assinatura:', error);
      throw error;
    }
  }

  // Renovar assinatura manualmente
  static async renewSubscription(subscriptionId) {
    try {
      const subscription = await Subscription.findById(subscriptionId);
      if (!subscription) {
        throw new Error('Assinatura não encontrada');
      }

      // Calcular próxima data de cobrança
      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

      // Atualizar assinatura
      const updatedSubscription = await Subscription.update(subscriptionId, {
        status: 'active',
        next_billing_date: nextBillingDate,
        failed_attempts: 0
      });

      // Registrar no histórico
      await SubscriptionHistory.recordRenewal(
        subscriptionId, 
        subscription.partner_id, 
        subscription.monthly_fee
      );

      return updatedSubscription;
    } catch (error) {
      console.error('Erro ao renovar assinatura:', error);
      throw error;
    }
  }

  // Verificar assinaturas vencendo em breve
  static async findExpiringSoon(days = 7) {
    try {
      return await Subscription.findExpiringSoon(days);
    } catch (error) {
      console.error('Erro ao buscar assinaturas vencendo:', error);
      throw error;
    }
  }

  // Verificar assinaturas vencidas
  static async findExpired() {
    try {
      return await Subscription.findExpired();
    } catch (error) {
      console.error('Erro ao buscar assinaturas vencidas:', error);
      throw error;
    }
  }

  // Verificar assinaturas para cobrança automática
  static async findForAutoBilling() {
    try {
      return await Subscription.findForAutoBilling();
    } catch (error) {
      console.error('Erro ao buscar assinaturas para cobrança:', error);
      throw error;
    }
  }

  // Verificar se parceiro tem assinatura ativa
  static async hasActiveSubscription(partnerId) {
    try {
      return await Subscription.isPartnerActive(partnerId);
    } catch (error) {
      console.error('Erro ao verificar assinatura ativa:', error);
      return false;
    }
  }

  // Obter assinatura do parceiro
  static async getPartnerSubscription(partnerId) {
    try {
      return await Subscription.findByPartner(partnerId);
    } catch (error) {
      console.error('Erro ao obter assinatura do parceiro:', error);
      return null;
    }
  }

  // Processar cobrança automática (job/scheduler)
  static async processAutoBilling() {
    try {
      const subscriptions = await this.findForAutoBilling();
      const results = {
        processed: 0,
        failed: 0,
        errors: []
      };

      for (const subscription of subscriptions) {
        try {
          await this.processPayment(subscription.id);
          results.processed++;
        } catch (error) {
          await this.recordPaymentFailure(subscription.id, error.message);
          results.failed++;
          results.errors.push({
            subscription_id: subscription.id,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Erro ao processar cobrança automática:', error);
      throw error;
    }
  }

  // Verificar e expirar propostas pendentes (job/scheduler)
  static async expirePendingProposals() {
    try {
      const TowProposal = require('../models/TowProposal');
      const proposals = await TowProposal.findExpiringSoon(5);

      const results = [];
      for (const proposal of proposals) {
        try {
          await TowProposal.expire(proposal.id);
          results.push(proposal.id);
        } catch (error) {
          console.error(`Erro ao expirar proposta ${proposal.id}:`, error);
        }
      }

      return results;
    } catch (error) {
      console.error('Erro ao expirar propostas pendentes:', error);
      throw error;
    }
  }

  // Enviar notificações sobre assinaturas
  static async sendSubscriptionNotifications() {
    try {
      // Notificar assinaturas vencendo
      const expiringSoon = await this.findExpiringSoon();
      for (const subscription of expiringSoon) {
        await NotificationService.sendNotification(
          subscription.partner_id,
          'Assinatura vencendo em breve!',
          `Sua assinatura vence em ${subscription.next_billing_date}`,
          {
            type: 'subscription_expiring',
            subscription_id: subscription.id
          }
        );
      }

      // Notificar assinaturas vencidas
      const expired = await this.findExpired();
      for (const subscription of expired) {
        await NotificationService.sendNotification(
          subscription.partner_id,
          'Assinatura vencida',
          'Sua assinatura venceu. Renove agora!',
          {
            type: 'subscription_expired',
            subscription_id: subscription.id
          }
        );
      }

      return {
        expiringSoon: expiringSoon.length,
        expired: expired.length
      };
    } catch (error) {
      console.error('Erro ao enviar notificações de assinatura:', error);
      throw error;
    }
  }

  // Calcular receita mensal da plataforma
  static async calculateMonthlyRevenue() {
    try {
      const stats = await Subscription.getStats();
      return stats.total_monthly_revenue || 0;
    } catch (error) {
      console.error('Erro ao calcular receita mensal:', error);
      return 0;
    }
  }

  // Obter estatísticas detalhadas
  static async getDetailedStats() {
    try {
      const stats = await Subscription.getStats();
      
      // Adicionar estatísticas por tipo
      const typeStats = {};
      const validTypes = ['mecanico', 'posto_combustivel', 'auto_pecas'];
      
      for (const type of validTypes) {
        const typeStats = await Subscription.getStatsByType(type);
        typeStats[type] = typeStats;
      }

      return {
        ...stats,
        by_type: typeStats,
        monthly_revenue: stats.total_monthly_revenue || 0
      };
    } catch (error) {
      console.error('Erro ao obter estatísticas detalhadas:', error);
      throw error;
    }
  }

  // Obter estatísticas por tipo
  static async getStatsByType(type) {
    try {
      const Partner = require('../models/Partner');
      return await Partner.getStatsByType(type);
    } catch (error) {
      console.error('Erro ao obter estatísticas por tipo:', error);
      return null;
    }
  }

  // Validar dados de assinatura
  static validateSubscriptionData(data) {
    const errors = [];

    // Validar tipo
    const validTypes = ['mecanico', 'posto_combustivel', 'auto_pecas'];
    if (!data.type || !validTypes.includes(data.type)) {
      errors.push('Tipo de assinatura inválido. Tipos válidos: ' + validTypes.join(', '));
    }

    // Validar método de pagamento
    const validPaymentMethods = ['credit_card', 'pix', 'bank_slip'];
    if (data.payment_method && !validPaymentMethods.includes(data.payment_method)) {
      errors.push('Método de pagamento inválido. Métodos válidos: ' + validPaymentMethods.join(', '));
    }

    // Validar auto_renew
    if (data.auto_renew !== undefined && typeof data.auto_renew !== 'boolean') {
      errors.push('auto_renew deve ser true ou false');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Verificar se parceiro pode criar assinatura
  static async canPartnerSubscribe(partnerId, type) {
    try {
      const Partner = require('../models/Partner');
      const partner = await Partner.findById(partnerId);
      
      if (!partner) {
        return { canSubscribe: false, reason: 'Parceiro não encontrado' };
      }

      // Verificar se tipo do parceiro é compatível
      const compatibleTypes = {
        'mecanico': 'mecanico',
        'posto_combustivel': 'posto_combustivel',
        'auto_pecas': 'auto_pecas'
      };

      if (partner.type !== compatibleTypes[type]) {
        return { 
          canSubscribe: false, 
          reason: `Parceiro do tipo ${partner.type} não pode criar assinatura do tipo ${type}` 
        };
      }

      // Verificar se já tem assinatura ativa
      const hasActive = await this.hasActiveSubscription(partnerId);
      if (hasActive) {
        return { 
          canSubscribe: false, 
          reason: 'Parceiro já possui assinatura ativa' 
        };
      }

      return { canSubscribe: true };
    } catch (error) {
      console.error('Erro ao verificar se parceiro pode assinar:', error);
      return { canSubscribe: false, reason: 'Erro ao verificar dados do parceiro' };
    }
  }

  // Obter resumo da assinatura para dashboard
  static async getSubscriptionSummary(partnerId) {
    try {
      const subscription = await this.getPartnerSubscription(partnerId);
      if (!subscription) {
        return null;
      }

      const Partner = require('../models/Partner');
      const partner = await Partner.findById(partnerId);

      return {
        subscription,
        partner,
        is_active: subscription.status === 'active',
        days_until_expiry: Math.ceil((new Date(subscription.next_billing_date) - new Date()) / (1000 * 60 * 60 * 24)),
        monthly_fee: subscription.monthly_fee,
        auto_renew: subscription.auto_renew,
        payment_method: subscription.payment_method
      };
    } catch (error) {
      console.error('Erro ao obter resumo da assinatura:', error);
      return null;
    }
  }
}

module.exports = SubscriptionService;
