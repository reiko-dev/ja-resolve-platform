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

  // Buscar solicitação por ID
  static async getById(req, res) {
    try {
      const { id } = req.params;
      
      const request = await EmergencyRequest.findById(id);
      
      if (!request) {
        return res.status(404).json({
          success: false,
          message: 'Solicitação não encontrada'
        });
      }

      res.json({
        success: true,
        data: request
      });
    } catch (error) {
      console.error('Erro ao buscar solicitação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar solicitações do usuário
  static async getByUser(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      
      const result = await EmergencyRequest.findByUser(
        req.user.id,
        parseInt(page),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result.requests,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });
    } catch (error) {
      console.error('Erro ao buscar solicitações do usuário:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar solicitações do parceiro
  static async getByPartner(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      
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

      const result = await EmergencyRequest.findByPartner(
        partner.id,
        parseInt(page),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result.requests,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });
    } catch (error) {
      console.error('Erro ao buscar solicitações do parceiro:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar solicitações próximas (para parceiros)
  static async getNearby(req, res) {
    try {
      const { latitude, longitude, radius = 15, type } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: 'Latitude e longitude são obrigatórios'
        });
      }

      const requests = await EmergencyRequest.findNearby(
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(radius),
        type
      );

      res.json({
        success: true,
        data: requests,
        count: requests.length
      });
    } catch (error) {
      console.error('Erro ao buscar solicitações próximas:', error);
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
      const hasActiveSubscription = await require('../models/Subscription').isPartnerActive(partner.id);
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

  // Iniciar serviço
  static async start(req, res) {
    try {
      const { id } = req.params;
      
      const request = await EmergencyRequest.start(id);
      
      if (!request) {
        return res.status(404).json({
          success: false,
          message: 'Solicitação não encontrada ou não pode ser iniciada'
        });
      }

      res.json({
        success: true,
        data: request,
        message: 'Serviço iniciado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao iniciar serviço:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Completar serviço
  static async complete(req, res) {
    try {
      const { id } = req.params;
      const { final_price, solution_description, parts_used } = req.body;
      
      const request = await EmergencyRequest.complete(
        id,
        final_price,
        solution_description,
        parts_used
      );
      
      if (!request) {
        return res.status(404).json({
          success: false,
          message: 'Solicitação não encontrada ou não pode ser completada'
        });
      }

      res.json({
        success: true,
        data: request,
        message: 'Serviço completado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao completar serviço:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Cancelar solicitação
  static async cancel(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      
      const request = await EmergencyRequest.cancel(id, reason);
      
      if (!request) {
        return res.status(404).json({
          success: false,
          message: 'Solicitação não encontrada ou não pode ser cancelada'
        });
      }

      res.json({
        success: true,
        data: request,
        message: 'Solicitação cancelada com sucesso'
      });
    } catch (error) {
      console.error('Erro ao cancelar solicitação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Avaliar serviço
  static async rate(req, res) {
    try {
      const { id } = req.params;
      const { rating, comment } = req.body;
      
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating deve ser entre 1 e 5'
        });
      }

      const request = await EmergencyRequest.rate(id, rating, comment);
      
      if (!request) {
        return res.status(404).json({
          success: false,
          message: 'Solicitação não encontrada ou não pode ser avaliada'
        });
      }

      res.json({
        success: true,
        data: request,
        message: 'Avaliação enviada com sucesso'
      });
    } catch (error) {
      console.error('Erro ao avaliar serviço:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar todas as solicitações (admin)
  static async getAll(req, res) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        type, 
        status, 
        urgency, 
        date_from, 
        date_to 
      } = req.query;
      
      const filters = {
        type,
        status,
        urgency,
        date_from,
        date_to
      };

      const result = await EmergencyRequest.findAll(
        parseInt(page),
        parseInt(limit),
        filters
      );

      res.json({
        success: true,
        data: result.requests,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });
    } catch (error) {
      console.error('Erro ao buscar solicitações:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Estatísticas (admin)
  static async getStats(req, res) {
    try {
      const stats = await EmergencyRequest.getStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar solicitações pendentes para parceiros
  static async getPendingForPartners(req, res) {
    try {
      const { latitude, longitude, radius = 15, type } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: 'Latitude e longitude são obrigatórios'
        });
      }

      const requests = await EmergencyRequest.findPendingNearby(
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(radius),
        type
      );

      res.json({
        success: true,
        data: requests,
        count: requests.length
      });
    } catch (error) {
      console.error('Erro ao buscar solicitações pendentes:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Parceiro responde à solicitação (aceita ou rejeita)
  static async partnerResponse(req, res) {
    try {
      const { id } = req.params;
      const { action, estimated_price, estimated_duration, reason } = req.body;
      
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

      let result;
      if (action === 'accept') {
        result = await EmergencyRequest.accept(
          id,
          partner.id,
          estimated_price,
          estimated_duration
        );
      } else if (action === 'reject') {
        result = await EmergencyRequest.reject(id, partner.id, reason);
      } else {
        return res.status(400).json({
          success: false,
          message: 'Ação inválida. Use "accept" ou "reject"'
        });
      }
      
      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Solicitação não encontrada ou já foi respondida'
        });
      }

      res.json({
        success: true,
        data: result,
        message: `Solicitação ${action === 'accept' ? 'aceita' : 'rejeitada'} com sucesso`
      });
    } catch (error) {
      console.error('Erro ao responder solicitação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar respostas de parceiros para uma solicitação
  static async getPartnerResponses(req, res) {
    try {
      const { id } = req.params;
      
      const responses = await EmergencyRequest.getPartnerResponses(id);
      
      res.json({
        success: true,
        data: responses
      });
    } catch (error) {
      console.error('Erro ao buscar respostas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }
}

module.exports = EmergencyRequestController;
