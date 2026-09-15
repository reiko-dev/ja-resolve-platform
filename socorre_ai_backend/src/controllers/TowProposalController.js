const TowProposal = require('../models/TowProposal');
const EmergencyRequest = require('../models/EmergencyRequest');
const Partner = require('../models/Partner');
const NotificationService = require('../services/NotificationServiceNew');
const TowProposalService = require('../services/TowProposalService');
const { sendServiceError } = require('../services/ServiceError');

class TowProposalController {
  // Criar nova proposta — regras no TowProposalService.
  static async create(req, res) {
    try {
      const { emergency_request_id, proposed_price, estimated_time_minutes, message } = req.body;
      const partner_id = req.user.partner_id; // vínculo vem do token JWT, nunca do body

      const proposal = await TowProposalService.createProposal(emergency_request_id, partner_id, {
        proposed_price,
        estimated_time_minutes,
        message,
      });

      res.status(201).json({
        success: true,
        data: proposal,
        message: 'Proposta enviada com sucesso',
      });
    } catch (error) {
      return sendServiceError(res, error, 'Erro interno do servidor');
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

  // Retirar proposta (parceiro) — regras no TowProposalService.
  static async withdraw(req, res) {
    try {
      const { id } = req.params;

      const withdrawnProposal = await TowProposalService.withdrawProposal(id, req.user.partner_id);

      res.json({
        success: true,
        data: withdrawnProposal,
        message: 'Proposta retirada'
      });
    } catch (error) {
      return sendServiceError(res, error, 'Erro interno do servidor');
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
