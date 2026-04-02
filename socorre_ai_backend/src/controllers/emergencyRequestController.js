const EmergencyRequest = require('../models/EmergencyRequest');
const knex = require('../config/database');

class EmergencyRequestController {
  // Criar nova solicitação de emergência
  static async create(req, res) {
    try {
      const { type, request_type } = req.body;
      const requestData = {
        ...req.body,
        user_id: req.user.id
      };

      let request;
      
      // Criar solicitação baseada no tipo
      if (request_type === 'guincho' || type === 'mechanical') {
        request = await EmergencyRequest.createTowRequest(requestData);
      } else {
        request = await EmergencyRequest.createMechanicRequest(requestData);
      }

      // Notificar parceiros apropriados
      let nearbyPartners = [];
      
      if (request.request_type === 'guincho') {
        // Notificar guinchos para enviar propostas
        nearbyPartners = await EmergencyRequest.findForGuinchos(
          request.latitude,
          request.longitude
        );
      } else if (request.request_type === 'mecanico') {
        // Notificar mecânicos diretamente
        nearbyPartners = await EmergencyRequest.findForMechanics(
          request.latitude,
          request.longitude
        );
      }

      // Notificar parceiros próximos
      if (nearbyPartners.length > 0) {
        await EmergencyRequest.notifyPartners(request.id, nearbyPartners);
      }

      res.status(201).json({
        success: true,
        data: request,
        message: 'Solicitação de emergência criada com sucesso',
        partnersNotified: nearbyPartners.length,
        request_type: request.request_type
      });
    } catch (error) {
      console.error('Erro ao criar solicitação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Aceitar solicitação (apenas para mecânicos)
  static async accept(req, res) {
    try {
      const { id } = req.params;
      const { estimated_price, estimated_duration } = req.body;
      
      // Buscar o partner_id do usuário logado
      const partner = await knex('partners')
        .where('user_id', req.user.id)
        .first();
      
      if (!partner) {
        return res.status(404).json({
          success: false,
          message: 'Parceiro não encontrado'
        });
      }

      // Verificar se é mecânico
      if (partner.type !== 'mecanico') {
        return res.status(403).json({
          success: false,
          message: 'Apenas mecânicos podem aceitar solicitações diretamente'
        });
      }

      // Verificar se tem assinatura ativa
      const Subscription = require('../models/Subscription');
      const hasActiveSubscription = await Subscription.isPartnerActive(partner.id);
      if (!hasActiveSubscription) {
        return res.status(403).json({
          success: false,
          message: 'Mecânico não possui assinatura ativa'
        });
      }

      // Verificar se emergência é para mecânico
      const emergency = await EmergencyRequest.findById(id);
      if (!emergency || emergency.request_type !== 'mecanico') {
        return res.status(400).json({
          success: false,
          message: 'Esta emergência não é para mecânicos'
        });
      }

      const request = await EmergencyRequest.accept(
        id,
        partner.id,
        estimated_price,
        estimated_duration
      );
      
      if (!request) {
        return res.status(404).json({
          success: false,
          message: 'Solicitação não encontrada ou já foi aceita'
        });
      }

      res.json({
        success: true,
        data: request,
        message: 'Solicitação aceita com sucesso'
      });
    } catch (error) {
      console.error('Erro ao aceitar solicitação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar propostas de uma emergência (para cliente)
  static async getProposals(req, res) {
    try {
      const { id } = req.params;

      // Verificar se usuário é o dono da emergência
      const emergency = await EmergencyRequest.findById(id);
      if (!emergency) {
        return res.status(404).json({ error: 'Emergência não encontrada' });
      }

      if (emergency.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const proposals = await EmergencyRequest.getProposals(id);

      res.json({
        success: true,
        data: proposals
      });

    } catch (error) {
      console.error('Erro ao buscar propostas:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Listar solicitações de emergência (para admin)
  static async getAll(req, res) {
    try {
      const { page = 1, limit = 10, sort = 'created_at', order = 'desc', status, type, urgency } = req.query;
      
      const filters = {};
      if (status) filters.status = status;
      if (type) filters.type = type;
      if (urgency) filters.urgency = urgency;
      
      const result = await EmergencyRequest.findAll(
        parseInt(page),
        parseInt(limit),
        filters,
        sort,
        order
      );

      res.json({
        success: true,
        data: {
          requests: result.data,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
          currentPage: page
        }
      });

    } catch (error) {
      console.error('Erro ao listar solicitações:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Aceitar proposta (cliente)
  static async acceptProposal(req, res) {
    try {
      const { id } = req.params;
      const { proposal_id } = req.body;

      // Verificar se usuário é o dono da emergência
      const emergency = await EmergencyRequest.findById(id);
      if (!emergency || emergency.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const result = await EmergencyRequest.acceptProposal(id, proposal_id);

      if (!result) {
        return res.status(400).json({ 
          error: 'Não foi possível aceitar a proposta' 
        });
      }

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
}

module.exports = EmergencyRequestController;
