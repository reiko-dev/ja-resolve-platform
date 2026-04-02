const TowProposal = require('../models/TowProposal');
const EmergencyRequest = require('../models/EmergencyRequest');
const Partner = require('../models/Partner');
const NotificationService = require('./NotificationService');

class TowProposalService {
  // Criar nova proposta
  static async createProposal(emergencyRequestId, partnerId, proposalData) {
    try {
      // Verificar se emergência existe e pode receber propostas
      const canReceive = await EmergencyRequest.canReceiveProposals(emergencyRequestId);
      if (!canReceive) {
        throw new Error('Esta emergência não está mais aceitando propostas');
      }

      // Verificar se parceiro já enviou proposta
      const alreadyProposed = await TowProposal.hasPartnerProposed(emergencyRequestId, partnerId);
      if (alreadyProposed) {
        throw new Error('Você já enviou uma proposta para esta emergência');
      }

      // Buscar dados do parceiro
      const partner = await Partner.findById(partnerId);
      if (!partner || partner.type !== 'guincho') {
        throw new Error('Apenas guinchos podem enviar propostas');
      }

      // Calcular tempo de expiração
      const proposalExpiryMinutes = await EmergencyRequest.getProposalExpiryMinutes();
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + proposalExpiryMinutes);

      // Calcular distância
      const partnerDistance = await this.calculatePartnerDistance(partnerId, emergencyRequestId);

      // Criar proposta
      const proposalDataComplete = {
        emergency_request_id: emergencyRequestId,
        partner_id: partnerId,
        proposed_price: parseFloat(proposalData.proposed_price),
        estimated_time_minutes: parseInt(proposalData.estimated_time_minutes),
        message: proposalData.message,
        tow_truck_type: partner.tow_truck_type,
        tow_capacity_kg: partner.tow_capacity_kg,
        has_winch: partner.has_winch,
        expires_at: expiresAt,
        partner_distance_km: partnerDistance
      };

      const proposal = await TowProposal.create(proposalDataComplete);

      // Incrementar contador de propostas da emergência
      await EmergencyRequest.incrementProposalCount(emergencyRequestId);

      // Notificar cliente sobre nova proposta
      const emergency = await EmergencyRequest.findById(emergencyRequestId);
      await NotificationService.sendNotification(
        emergency.user_id,
        'Nova proposta de guincho',
        `Você recebeu uma proposta de R$ ${proposalData.proposed_price} de ${partner.business_name}`,
        {
          type: 'tow_proposal',
          emergency_request_id: emergencyRequestId,
          proposal_id: proposal.id
        }
      );

      return proposal;
    } catch (error) {
      console.error('Erro ao criar proposta:', error);
      throw error;
    }
  }

  // Aceitar proposta
  static async acceptProposal(emergencyRequestId, proposalId) {
    try {
      const result = await EmergencyRequest.acceptProposal(emergencyRequestId, proposalId);
      
      if (!result) {
        throw new Error('Não foi possível aceitar a proposta');
      }

      // Notificar parceiro
      const proposal = await TowProposal.findById(proposalId);
      await NotificationService.sendNotification(
        proposal.partner_id,
        'Proposta Aceita!',
        `Sua proposta de R$ ${proposal.proposed_price} foi aceita!`,
        {
          type: 'proposal_accepted',
          emergency_request_id: emergencyRequestId,
          proposal_id: proposalId
        }
      );

      return result;
    } catch (error) {
      console.error('Erro ao aceitar proposta:', error);
      throw error;
    }
  }

  // Rejeitar proposta
  static async rejectProposal(proposalId, reason = null) {
    try {
      const proposal = await TowProposal.findById(proposalId);
      if (!proposal) {
        throw new Error('Proposta não encontrada');
      }

      const rejectedProposal = await TowProposal.reject(proposalId);

      // Notificar parceiro
      await NotificationService.sendNotification(
        proposal.partner_id,
        'Proposta Rejeitada',
        reason || 'Sua proposta foi rejeitada pelo cliente',
        {
          type: 'proposal_rejected',
          emergency_request_id: proposal.emergency_request_id,
          proposal_id: proposalId
        }
      );

      return rejectedProposal;
    } catch (error) {
      console.error('Erro ao rejeitar proposta:', error);
      throw error;
    }
  }

  // Retirar proposta
  static async withdrawProposal(proposalId) {
    try {
      const proposal = await TowProposal.findById(proposalId);
      if (!proposal) {
        throw new Error('Proposta não encontrada');
      }

      return await TowProposal.withdraw(proposalId);
    } catch (error) {
      console.error('Erro ao retirar proposta:', error);
      throw error;
    }
  }

  // Expirar proposta
  static async expireProposal(proposalId) {
    try {
      return await TowProposal.expire(proposalId);
    } catch (error) {
      console.error('Erro ao expirar proposta:', error);
      throw error;
    }
  }

  // Expirar propostas pendentes de uma emergência
  static async expirePendingProposals(emergencyRequestId) {
    try {
      const result = await EmergencyRequest.expireProposals(emergencyRequestId);
      return result;
    } catch (error) {
      console.error('Erro ao expirar propostas pendentes:', error);
      throw error;
    }
  }

  // Incrementar visualizações
  static async incrementViews(proposalId) {
    try {
      await TowProposal.incrementViews(proposalId);
    } catch (error) {
      console.error('Erro ao incrementar visualizações:', error);
      throw error;
    }
  }

  // Buscar propostas de uma emergência
  static async getEmergencyProposals(emergencyRequestId, userId = null) {
    try {
      // Verificar permissões se userId fornecido
      if (userId) {
        const emergency = await EmergencyRequest.findById(emergencyRequestId);
        if (!emergency || emergency.user_id !== userId) {
          throw new Error('Acesso negado');
        }
      }

      return await TowProposal.findByEmergency(emergencyRequestId, 'pending');
    } catch (error) {
      console.error('Erro ao buscar propostas da emergência:', error);
      throw error;
    }
  }

  // Buscar propostas do parceiro
  static async getPartnerProposals(partnerId, status = null) {
    try {
      return await TowProposal.findByPartner(partnerId, status);
    } catch (error) {
      console.error('Erro ao buscar propostas do parceiro:', error);
      throw error;
    }
  }

  // Buscar propostas expirando em breve
  static async getExpiringSoon(minutes = 5) {
    try {
      return await TowProposal.findExpiringSoon(minutes);
    } catch (error) {
      console.error('Erro ao buscar propostas expirando:', error);
      throw error;
    }
  }

  // Calcular distância do parceiro à emergência
  static async calculatePartnerDistance(partnerId, emergencyRequestId) {
    try {
      const partner = await Partner.findById(partnerId);
      const emergency = await EmergencyRequest.findById(emergencyRequestId);

      if (!partner || !emergency) {
        return null;
      }

      const distance = Partner.calculateDistance(
        partner.latitude, 
        partner.longitude,
        emergency.latitude, 
        emergency.longitude
      );

      return distance;
    } catch (error) {
      console.error('Erro ao calcular distância:', error);
      return null;
    }
  }

  // Validar dados da proposta
  static validateProposalData(data) {
    const errors = [];

    // Validar preço
    if (!data.proposed_price || parseFloat(data.proposed_price) <= 0) {
      errors.push('Preço proposto deve ser maior que zero');
    }

    // Validar tempo estimado
    if (!data.estimated_time_minutes || parseInt(data.estimated_time_minutes) <= 0) {
      errors.push('Tempo estimado deve ser maior que zero');
    }

    // Validar tempo máximo (ex: 120 minutos)
    if (data.estimated_time_minutes && parseInt(data.estimated_time_minutes) > 120) {
      errors.push('Tempo estimado não pode exceder 120 minutos');
    }

    // Validar preço mínimo
    if (data.proposed_price && parseFloat(data.proposed_price) < 20) {
      errors.push('Preço mínimo é R$ 20,00');
    }

    // Validar preço máximo
    if (data.proposed_price && parseFloat(data.proposed_price) > 1000) {
      errors.push('Preço máximo é R$ 1.000,00');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Verificar se parceiro pode enviar proposta
  static async canPartnerPropose(partnerId, emergencyRequestId) {
    try {
      // Verificar se emergência existe e pode receber propostas
      const canReceive = await EmergencyRequest.canReceiveProposals(emergencyRequestId);
      if (!canReceive) {
        return { canPropose: false, reason: 'Emergência não está aceitando propostas' };
      }

      // Verificar se parceiro já enviou proposta
      const alreadyProposed = await TowProposal.hasPartnerProposed(emergencyRequestId, partnerId);
      if (alreadyProposed) {
        return { canPropose: false, reason: 'Parceiro já enviou proposta para esta emergência' };
      }

      // Verificar se é guincho
      const partner = await Partner.findById(partnerId);
      if (!partner || partner.type !== 'guincho') {
        return { canPropose: false, reason: 'Apenas guinchos podem enviar propostas' };
      }

      // Verificar se está disponível
      if (!partner.is_available) {
        return { canPropose: false, reason: 'Parceiro não está disponível' };
      }

      // Verificar se está verificado
      if (!partner.is_verified) {
        return { canPropose: false, reason: 'Parceiro não está verificado' };
      }

      // Verificar se aceita chamadas de emergência
      if (!partner.accepts_emergency_calls) {
        return { canPropose: false, reason: 'Parceiro não aceita chamadas de emergência' };
      }

      return { canPropose: true };
    } catch (error) {
      console.error('Erro ao verificar se parceiro pode propor:', error);
      return { canPropose: false, reason: 'Erro ao verificar dados do parceiro' };
    }
  }

  // Obter resumo das propostas para dashboard
  static async getProposalSummary(emergencyRequestId) {
    try {
      const proposals = await TowProposal.findByEmergency(emergencyRequestId);
      const emergency = await EmergencyRequest.findById(emergencyRequestId);

      return {
        emergency,
        proposals,
        total_proposals: proposals.length,
        lowest_price: proposals.length > 0 ? Math.min(...proposals.map(p => p.proposed_price)) : null,
        highest_price: proposals.length > 0 ? Math.max(...proposals.map(p => p.proposed_price)) : null,
        avg_price: proposals.length > 0 ? proposals.reduce((sum, p) => sum + p.proposed_price, 0) / proposals.length : null,
        avg_time: proposals.length > 0 ? proposals.reduce((sum, p) => sum + p.estimated_time_minutes, 0) / proposals.length : null,
        can_receive_proposals: await EmergencyRequest.canReceiveProposals(emergencyRequestId),
        max_proposals: emergency?.max_proposals || 5,
        proposals_received: emergency?.proposals_received || 0
      };
    } catch (error) {
      console.error('Erro ao obter resumo das propostas:', error);
      throw error;
    }
  }

  // Enviar notificações sobre propostas expirando
  static async sendExpiringNotifications() {
    try {
      const expiringSoon = await this.getExpiringSoon(5);
      
      for (const proposal of expiringSoon) {
        await NotificationService.sendNotification(
          proposal.partner_id,
          'Proposta expirando em breve!',
          `Sua proposta para a emergência #${proposal.emergency_request_id} expira em 5 minutos`,
          {
            type: 'proposal_expiring',
            proposal_id: proposal.id,
            emergency_request_id: proposal.emergency_request_id
          }
        );
      }

      return expiringSoon.length;
    } catch (error) {
      console.error('Erro ao enviar notificações de propostas expirando:', error);
      throw error;
    }
  }

  // Processar expiração automática de propostas
  static async processProposalExpirations() {
    try {
      const expiringSoon = await this.getExpiringSoon(1);
      const results = [];

      for (const proposal of expiringSoon) {
        try {
          await this.expireProposal(proposal.id);
          results.push(proposal.id);

          // Notificar parceiro sobre expiração
          await NotificationService.sendNotification(
            proposal.partner_id,
            'Proposta expirada',
            'Sua proposta expirou pelo tempo limite',
            {
              type: 'proposal_expired',
              proposal_id: proposal.id,
              emergency_request_id: proposal.emergency_request_id
            }
          );
        } catch (error) {
          console.error(`Erro ao expirar proposta ${proposal.id}:`, error);
        }
      }

      return results;
    } catch (error) {
      console.error('Erro ao processar expiração de propostas:', error);
      throw error;
    }
  }

  // Obter estatísticas das propostas
  static async getProposalStats(partnerId = null) {
    try {
      let stats;
      
      if (partnerId) {
        // Estatísticas do parceiro específico
        const proposals = await this.getPartnerProposals(partnerId);
        stats = this.calculateStats(proposals);
      } else {
        // Estatísticas gerais
        stats = await TowProposal.getStats();
      }

      return stats;
    } catch (error) {
      console.error('Erro ao obter estatísticas das propostas:', error);
      throw error;
    }
  }

  // Calcular estatísticas a partir de lista de propostas
  static calculateStats(proposals) {
    if (!proposals || proposals.length === 0) {
      return {
        total: 0,
        pending: 0,
        accepted: 0,
        rejected: 0,
        expired: 0,
        success_rate: 0,
        avg_price: 0,
        avg_time: 0
      };
    }

    const total = proposals.length;
    const pending = proposals.filter(p => p.status === 'pending').length;
    const accepted = proposals.filter(p => p.status === 'accepted').length;
    const rejected = proposals.filter(p => p.status === 'rejected').length;
    const expired = proposals.filter(p => p.status === 'expired').length;

    const successRate = total > 0 ? (accepted / total) * 100 : 0;
    const avgPrice = proposals.length > 0 ? proposals.reduce((sum, p) => sum + p.proposed_price, 0) / proposals.length : 0;
    const avgTime = proposals.length > 0 ? proposals.reduce((sum, p) => sum + p.estimated_time_minutes, 0) / proposals.length : 0;

    return {
      total,
      pending,
      accepted,
      rejected,
      expired,
      success_rate: successRate,
      avg_price: avgPrice,
      avg_time: avgTime
    };
  }

  // Buscar propostas com filtros avançados
  static async getProposalsWithFilters(filters = {}) {
    try {
      const { page = 1, limit = 10, status, partner_type, price_min, price_max, created_from, created_to } = filters;

      const filterData = {};
      if (status) filterData.status = status;
      if (partner_type) filterData.partner_type = partner_type;
      if (price_min) filterData.price_min = parseFloat(price_min);
      if (price_max) filterData.price_max = parseFloat(price_max);
      if (created_from) filterData.created_from = created_from;
      if (created_to) filterData.created_to = created_to;

      return await TowProposal.findAll(parseInt(page), parseInt(limit), filterData);
    } catch (error) {
      console.error('Erro ao buscar propostas com filtros:', error);
      throw error;
    }
  }
}

module.exports = TowProposalService;
