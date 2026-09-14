const TowProposal = require('../models/TowProposal');
const EmergencyRequest = require('../models/EmergencyRequest');
const Partner = require('../models/Partner');
const NotificationService = require('../services/NotificationServiceNew');

function normalizePartnerType(partnerType) {
  if (partnerType === 'guincho') {
    return 'tow';
  }
  return partnerType;
}

class TowProposalController {
  // Criar nova proposta
  static async create(req, res) {
    try {
      const { emergency_request_id, proposed_price, estimated_time_minutes, message } = req.body;
      const partner_id = req.user.partner_id; // Assumindo que vem do token JWT

      // Validar dados
      if (!emergency_request_id || !proposed_price || !estimated_time_minutes) {
        return res.status(400).json({ 
          error: 'Dados obrigatórios: emergency_request_id, proposed_price, estimated_time_minutes' 
        });
      }

      // Verificar se emergência existe e pode receber propostas
      const canReceive = await EmergencyRequest.canReceiveProposals(emergency_request_id);
      if (!canReceive) {
        return res.status(400).json({ 
          error: 'Esta emergência não está mais aceitando propostas' 
        });
      }

      // Verificar se parceiro já enviou proposta
      const alreadyProposed = await TowProposal.hasPartnerProposed(emergency_request_id, partner_id);
      if (alreadyProposed) {
        return res.status(409).json({
          error: 'Você já enviou uma proposta para esta emergência' 
        });
      }

      // Buscar dados do parceiro
      const partner = await Partner.findById(partner_id);
      if (!partner || normalizePartnerType(partner.type) !== 'tow') {
        return res.status(403).json({ 
          error: 'Apenas guinchos podem enviar propostas' 
        });
      }

      const priceValidation = await EmergencyRequest.validateTowProposalPrice(
        emergency_request_id,
        proposed_price
      );

      if (!priceValidation.valid) {
        return res.status(400).json({
          error: `Proposta abaixo do mínimo permitido pelo backend. Valor mínimo atual: R$ ${priceValidation.minimumAcceptedPrice}`
        });
      }

      // Calcular tempo de expiração
      const proposalExpiryMinutes = await EmergencyRequest.getProposalExpiryMinutes();
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + proposalExpiryMinutes);

      // Criar proposta
      const proposalData = {
        emergency_request_id,
        partner_id,
        proposed_price: parseFloat(proposed_price),
        estimated_time_minutes: parseInt(estimated_time_minutes),
        message,
        tow_truck_type: partner.tow_truck_type,
        tow_capacity_kg: partner.tow_capacity_kg,
        has_winch: partner.has_winch,
        expires_at: expiresAt,
        partner_distance_km: await TowProposalController.calculatePartnerDistance(partner_id, emergency_request_id)
      };

      const proposal = await TowProposal.create(proposalData);

      // Incrementar contador de propostas da emergência
      await EmergencyRequest.incrementProposalCount(emergency_request_id);

      // Notificar cliente sobre nova proposta
      const emergency = await EmergencyRequest.findById(emergency_request_id);
      await NotificationService.sendNotification(
        emergency.user_id,
        'Nova proposta de guincho',
        `Você recebeu uma proposta de R$ ${proposed_price} de ${partner.business_name}`,
        {
          type: 'tow_proposal',
          emergency_request_id,
          proposal_id: proposal.id
        }
      );

      res.status(201).json({
        success: true,
        data: proposal,
        pricing_validation: {
          minimum_accepted_price: priceValidation.minimumAcceptedPrice
        },
        message: 'Proposta enviada com sucesso'
      });

    } catch (error) {
      console.error('Erro ao criar proposta:', error);
      if (
        error?.code === '23505' ||
        error?.code === 'SQLITE_CONSTRAINT' ||
        error?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        /UNIQUE constraint failed/i.test(error?.message || '')
      ) {
        return res.status(409).json({ error: 'Você já possui uma proposta pendente para esta emergência' });
      }
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Listar propostas de uma emergência (para cliente)
  static async findByEmergency(req, res) {
    try {
      const { emergency_request_id } = req.params;

      // Verificar se usuário é o dono da emergência
      const emergency = await EmergencyRequest.findById(emergency_request_id);
      if (!emergency) {
        return res.status(404).json({ error: 'Emergência não encontrada' });
      }

      if (emergency.user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const proposals = await TowProposal.findByEmergency(emergency_request_id, 'pending');

      res.json({
        success: true,
        data: proposals
      });

    } catch (error) {
      console.error('Erro ao listar propostas:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Listar propostas do parceiro
  static async findByPartner(req, res) {
    try {
      const partner_id = req.user.partner_id;
      const { status } = req.query;

      const proposals = await TowProposal.findByPartner(partner_id, status);

      res.json({
        success: true,
        data: proposals
      });

    } catch (error) {
      console.error('Erro ao listar propostas do parceiro:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar proposta por ID
  static async findById(req, res) {
    try {
      const { id } = req.params;

      const proposal = await TowProposal.findById(id);
      if (!proposal) {
        return res.status(404).json({ error: 'Proposta não encontrada' });
      }

      // Verificar permissões
      const isOwner = proposal.partner_id === req.user.partner_id;
      const isEmergencyOwner = proposal.emergency_user_id === req.user.id;
      
      if (!isOwner && !isEmergencyOwner && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      res.json({
        success: true,
        data: proposal
      });

    } catch (error) {
      console.error('Erro ao buscar proposta:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Aceitar proposta (cliente)
  static async accept(req, res) {
    try {
      const { id } = req.params;

      const proposal = await TowProposal.findById(id);
      if (!proposal) {
        return res.status(404).json({ error: 'Proposta não encontrada' });
      }

      // Verificar se usuário é o dono da emergência
      const emergency = await EmergencyRequest.findById(proposal.emergency_request_id);
      if (!emergency || (emergency.user_id !== req.user.id && req.user.role !== 'admin')) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      // Aceitar proposta
      const result = await EmergencyRequest.acceptProposal(
        proposal.emergency_request_id, 
        id
      );

      if (!result) {
        return res.status(400).json({ 
          error: 'Não foi possível aceitar a proposta' 
        });
      }

      // Notificar parceiro
      await NotificationService.sendPartnerNotification(
        proposal.partner_id,
        'Proposta Aceita!',
        `Sua proposta de R$ ${proposal.proposed_price} foi aceita!`,
        {
          type: 'proposal_accepted',
          emergency_request_id: proposal.emergency_request_id,
          proposal_id: id
        }
      );

      res.json({
        success: true,
        data: result,
        message: 'Proposta aceita com sucesso'
      });

    } catch (error) {
      console.error('Erro ao aceitar proposta:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Rejeitar proposta (cliente)
  static async reject(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const proposal = await TowProposal.findById(id);
      if (!proposal) {
        return res.status(404).json({ error: 'Proposta não encontrada' });
      }

      // Verificar se usuário é o dono da emergência
      const emergency = await EmergencyRequest.findById(proposal.emergency_request_id);
      if (!emergency || (emergency.user_id !== req.user.id && req.user.role !== 'admin')) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const rejectedProposal = await TowProposal.reject(id);

      // Notificar parceiro
      await NotificationService.sendPartnerNotification(
        proposal.partner_id,
        'Proposta Rejeitada',
        `Sua proposta foi rejeitada pelo cliente`,
        {
          type: 'proposal_rejected',
          emergency_request_id: proposal.emergency_request_id,
          proposal_id: id
        }
      );

      res.json({
        success: true,
        data: rejectedProposal,
        message: 'Proposta rejeitada'
      });

    } catch (error) {
      console.error('Erro ao rejeitar proposta:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Retirar proposta (parceiro)
  static async withdraw(req, res) {
    try {
      const { id } = req.params;

      const proposal = await TowProposal.findById(id);
      if (!proposal) {
        return res.status(404).json({ error: 'Proposta não encontrada' });
      }

      // Verificar se parceiro é o dono
      if (proposal.partner_id !== req.user.partner_id) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const withdrawnProposal = await TowProposal.withdraw(id);

      res.json({
        success: true,
        data: withdrawnProposal,
        message: 'Proposta retirada'
      });

    } catch (error) {
      console.error('Erro ao retirar proposta:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Incrementar visualizações
  static async incrementViews(req, res) {
    try {
      const { id } = req.params;

      await TowProposal.incrementViews(id);

      res.json({
        success: true,
        message: 'Visualização registrada'
      });

    } catch (error) {
      console.error('Erro ao registrar visualização:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Listar propostas (admin)
  static async findAll(req, res) {
    try {
      const { page = 1, limit = 10, status, partner_type, price_min, price_max } = req.query;

      const filters = {};
      if (status) filters.status = status;
      if (partner_type) filters.partner_type = partner_type;
      if (price_min) filters.price_min = parseFloat(price_min);
      if (price_max) filters.price_max = parseFloat(price_max);

      const result = await TowProposal.findAll(
        parseInt(page), 
        parseInt(limit), 
        filters
      );

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('Erro ao listar propostas:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar propostas expirando em breve
  static async findExpiringSoon(req, res) {
    try {
      const { minutes = 5 } = req.query;

      const proposals = await TowProposal.findExpiringSoon(parseInt(minutes));

      res.json({
        success: true,
        data: proposals
      });

    } catch (error) {
      console.error('Erro ao buscar propostas expirando:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Expirar propostas (job/scheduler)
  static async expireProposals(req, res) {
    try {
      const { emergency_request_id } = req.params;

      const result = await EmergencyRequest.expireProposals(emergency_request_id);

      res.json({
        success: true,
        data: { expired_count: result },
        message: 'Propostas expiradas'
      });

    } catch (error) {
      console.error('Erro ao expirar propostas:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Obter estatísticas
  static async getStats(req, res) {
    try {
      const stats = await TowProposal.getStats();

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
}

module.exports = TowProposalController;
