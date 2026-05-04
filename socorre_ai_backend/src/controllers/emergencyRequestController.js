const EmergencyRequest = require('../models/EmergencyRequest');
const Subscription = require('../models/Subscription');
const Partner = require('../models/Partner');
const knex = require('../config/database');
const paymentService = require('../services/paymentService');

const REQUEST_TYPE_ALIASES = {
  mechanic: 'mechanic',
  mecanico: 'mechanic',
  tow: 'tow',
  guincho: 'tow',
};

const PARTNER_TYPE_ALIASES = {
  mechanic: 'mechanic',
  mecanico: 'mechanic',
  tow: 'tow',
  guincho: 'tow',
};

function normalizeRequestType(requestType) {
  return REQUEST_TYPE_ALIASES[requestType] || requestType || 'mechanic';
}

function normalizePartnerType(partnerType) {
  return PARTNER_TYPE_ALIASES[partnerType] || partnerType;
}

function resolveRequestType(type, requestType) {
  const normalizedRequestType = normalizeRequestType(requestType);
  if (normalizedRequestType === 'tow') {
    return 'tow';
  }

  return 'mechanic';
}

class EmergencyRequestController {
  static canAccessRequest(req, request) {
    const isOwner = request.user_id === req.user.id;
    const isAssignedPartner = request.partner_id && request.partner_id === req.user.partner_id;
    const isAdmin = req.user.role === 'admin';

    return isOwner || isAssignedPartner || isAdmin;
  }

  static async create(req, res) {
    try {
      const resolvedRequestType = resolveRequestType(req.body.type, req.body.request_type);
      const requestData = {
        ...req.body,
        user_id: req.user.id,
        vehicle_info: req.body.vehicle_info ? JSON.stringify(req.body.vehicle_info) : null,
        photos: Array.isArray(req.body.photos) ? JSON.stringify(req.body.photos) : null,
      };

      let request;
      if (resolvedRequestType === 'tow') {
        request = await EmergencyRequest.createTowRequest(requestData);
      } else {
        request = await EmergencyRequest.createMechanicRequest(requestData);
      }

      let nearbyPartners = [];
      if (request.request_type === 'tow') {
        nearbyPartners = await EmergencyRequest.findForGuinchos(request.latitude, request.longitude);
      } else if (request.request_type === 'mechanic') {
        nearbyPartners = await EmergencyRequest.findForMechanics(request.latitude, request.longitude);
      }

      res.status(201).json({
        success: true,
        data: request,
        message: 'Solicitação de emergência criada com sucesso',
        partnersNotified: nearbyPartners.length,
        request_type: request.request_type,
      });
    } catch (error) {
      console.error('Erro ao criar solicitação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  }

  static async getById(req, res) {
    try {
      const { id } = req.params;

      const request = await EmergencyRequest.findById(id);
      if (!request) {
        return res.status(404).json({
          success: false,
          message: 'Solicitação não encontrada',
        });
      }

      if (!EmergencyRequestController.canAccessRequest(req, request)) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado',
        });
      }

      res.json({
        success: true,
        data: request,
      });
    } catch (error) {
      console.error('Erro ao buscar solicitação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  }

  static async getByUser(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const result = await EmergencyRequest.findByUser(
        req.user.id,
        parseInt(page, 10),
        parseInt(limit, 10)
      );

      res.json({
        success: true,
        data: result.requests,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      console.error('Erro ao buscar solicitações do usuário:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  }

  static async getByPartner(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      if (!req.user.partner_id) {
        return res.status(404).json({
          success: false,
          message: 'Parceiro não encontrado',
        });
      }

      const result = await EmergencyRequest.findByPartner(
        req.user.partner_id,
        parseInt(page, 10),
        parseInt(limit, 10)
      );

      res.json({
        success: true,
        data: result.requests,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      console.error('Erro ao buscar solicitações do parceiro:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  }

  static async getNearby(req, res) {
    try {
      let latitude = req.query.latitude ? parseFloat(req.query.latitude) : null;
      let longitude = req.query.longitude ? parseFloat(req.query.longitude) : null;
      const radius = req.query.radius ? parseFloat(req.query.radius) : 15;
      const type = req.query.type;

      if ((latitude === null || longitude === null) && req.user.partner_id) {
        const partner = await Partner.findById(req.user.partner_id);
        if (partner) {
          latitude = latitude ?? parseFloat(partner.latitude);
          longitude = longitude ?? parseFloat(partner.longitude);
        }
      }

      if (latitude === null || longitude === null || Number.isNaN(latitude) || Number.isNaN(longitude)) {
        return res.status(400).json({
          success: false,
          message: 'Latitude e longitude são obrigatórios',
        });
      }

      const requests = await EmergencyRequest.findNearby(latitude, longitude, radius, type);

      res.json({
        success: true,
        data: requests,
        count: requests.length,
      });
    } catch (error) {
      console.error('Erro ao buscar solicitações próximas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  }

  static async accept(req, res) {
    try {
      const { id } = req.params;
      const { estimated_price, estimated_duration } = req.body;

      const partner = await knex('partners').where('user_id', req.user.id).first();
      if (!partner) {
        return res.status(404).json({
          success: false,
          message: 'Parceiro não encontrado',
        });
      }

      const normalizedPartnerType = normalizePartnerType(partner.type);
      if (normalizedPartnerType !== 'mechanic') {
        return res.status(403).json({
          success: false,
          message: 'Apenas mecânicos podem aceitar solicitações diretamente',
        });
      }

      const hasActiveSubscription = await Subscription.isPartnerActive(partner.id);
      if (!hasActiveSubscription) {
        return res.status(403).json({
          success: false,
          message: 'Mecânico não possui assinatura ativa',
        });
      }

      const emergency = await EmergencyRequest.findById(id);
      if (!emergency || emergency.request_type !== 'mechanic') {
        return res.status(400).json({
          success: false,
          message: 'Esta emergência não é para mecânicos',
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
          message: 'Solicitação não encontrada ou já foi aceita',
        });
      }

      res.json({
        success: true,
        data: request,
        message: 'Solicitação aceita com sucesso',
      });
    } catch (error) {
      console.error('Erro ao aceitar solicitação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  }

  static async getProposals(req, res) {
    try {
      const { id } = req.params;
      const emergency = await EmergencyRequest.findById(id);

      if (!emergency) {
        return res.status(404).json({ error: 'Emergência não encontrada' });
      }

      if (emergency.user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const proposals = await EmergencyRequest.getProposals(id);
      res.json({
        success: true,
        data: proposals,
      });
    } catch (error) {
      console.error('Erro ao buscar propostas:', error);
      res.status(500).json({
        error: 'Erro interno do servidor',
      });
    }
  }

  static async acceptProposal(req, res) {
    try {
      const { id } = req.params;
      const { proposal_id } = req.body;

      const emergency = await EmergencyRequest.findById(id);
      if (!emergency || emergency.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const result = await EmergencyRequest.acceptProposal(id, proposal_id);
      if (!result) {
        return res.status(400).json({
          error: 'Não foi possível aceitar a proposta',
        });
      }

      res.json({
        success: true,
        data: result,
        message: 'Proposta aceita com sucesso',
      });
    } catch (error) {
      console.error('Erro ao aceitar proposta:', error);
      res.status(500).json({
        error: 'Erro interno do servidor',
      });
    }
  }

  static async rate(req, res) {
    try {
      const { id } = req.params;
      const { rating, comment, review_comment } = req.body;

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating deve ser entre 1 e 5',
        });
      }

      const existingRequest = await EmergencyRequest.findById(id);
      if (!existingRequest) {
        return res.status(404).json({
          success: false,
          message: 'Solicitação não encontrada',
        });
      }

      const isOwner = existingRequest.user_id === req.user.id;
      const isAdmin = req.user.role === 'admin';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado',
        });
      }

      const request = await EmergencyRequest.rate(
        id,
        req.user.id,
        parseInt(rating, 10),
        comment || review_comment || null
      );

      if (!request) {
        return res.status(404).json({
          success: false,
          message: 'Solicitação não encontrada ou não pode ser avaliada',
        });
      }

      res.json({
        success: true,
        data: request,
        message: 'Avaliação enviada com sucesso',
      });
    } catch (error) {
      console.error('Erro ao avaliar solicitação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  }

  static async cancel(req, res) {
    try {
      const { id } = req.params;
      const { reason, method, gateway, currency, referenceId, cardData, pixData, bankSlipData } = req.body;

      const emergencyRequest = await EmergencyRequest.findById(id);
      if (!emergencyRequest) {
        return res.status(404).json({
          success: false,
          message: 'Solicitação não encontrada',
        });
      }

      const isOwner = emergencyRequest.user_id === req.user.id;
      const isAdmin = req.user.role === 'admin';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado',
        });
      }

      const shouldChargeCancellationFee =
        emergencyRequest.request_type === 'tow' &&
        emergencyRequest.status === 'accepted' &&
        !!emergencyRequest.selected_proposal_id;

      const activeServicePayment = shouldChargeCancellationFee
        ? await paymentService.getEmergencyActiveServicePayment(id)
        : null;

      if (activeServicePayment?.status === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Esta emergência já possui pagamento concluído e não pode ser cancelada automaticamente',
        });
      }

      if (activeServicePayment?.status && ['pending', 'processing'].includes(activeServicePayment.status)) {
        await paymentService.cancelPayment(activeServicePayment.id, reason || 'Cobrança principal cancelada por cancelamento da emergência');
      }

      const cancelledRequest = emergencyRequest.request_type === 'tow'
        ? await EmergencyRequest.cancelWithProposals(id, reason || null, isAdmin ? 'admin' : 'user')
        : await EmergencyRequest.cancel(id, reason || null);

      if (!cancelledRequest) {
        return res.status(404).json({
          success: false,
          message: 'Solicitação não encontrada ou não pode ser cancelada',
        });
      }

      let cancellationFeePayment = null;
      let cancellationFeeError = null;
      if (shouldChargeCancellationFee) {
        try {
          cancellationFeePayment = await paymentService.createTowCancellationFeePayment(
            {
              ...emergencyRequest,
              status: 'cancelled'
            },
            {
              method,
              gateway,
              currency,
              referenceId,
              cardData,
              pixData,
              bankSlipData
            }
          );
        } catch (error) {
          cancellationFeeError = error.message;
        }
      }

      res.json({
        success: true,
        data: {
          request: cancelledRequest,
          cancellation_fee_payment: cancellationFeePayment,
          cancellation_fee_error: cancellationFeeError,
        },
        message: cancellationFeeError
          ? 'Solicitação cancelada com cobrança pendente de validação'
          : 'Solicitação cancelada com sucesso',
      });
    } catch (error) {
      console.error('Erro ao cancelar solicitação:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erro interno do servidor',
      });
    }
  }

  static async createPayment(req, res) {
    try {
      const { id } = req.params;
      const emergencyRequest = await EmergencyRequest.findById(id);

      if (!emergencyRequest) {
        return res.status(404).json({
          success: false,
          message: 'Solicitação não encontrada',
        });
      }

      const isOwner = emergencyRequest.user_id === req.user.id;
      const isAdmin = req.user.role === 'admin';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado',
        });
      }

      const payment = await paymentService.createTowEmergencyPayment(emergencyRequest, {
        method: req.body.method,
        gateway: req.body.gateway,
        currency: req.body.currency || 'BRL',
        description: req.body.description,
        referenceId: req.body.referenceId,
        cardData: req.body.cardData,
        pixData: req.body.pixData,
        bankSlipData: req.body.bankSlipData
      });

      res.status(payment.existing ? 200 : 201).json({
        success: true,
        data: payment,
        message: payment.existing
          ? 'Pagamento oficial da emergência já existente retornado com sucesso'
          : 'Pagamento oficial da emergência criado com sucesso',
      });
    } catch (error) {
      console.error('Erro ao criar pagamento da emergência:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erro interno do servidor',
      });
    }
  }

  static async getPaymentSummary(req, res) {
    try {
      const { id } = req.params;
      const emergencyRequest = await EmergencyRequest.findById(id);

      if (!emergencyRequest) {
        return res.status(404).json({
          success: false,
          message: 'Solicitação não encontrada',
        });
      }

      if (!EmergencyRequestController.canAccessRequest(req, emergencyRequest)) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado',
        });
      }

      const paymentSummary = await paymentService.getEmergencyPaymentSummary(id);

      res.json({
        success: true,
        data: paymentSummary,
      });
    } catch (error) {
      console.error('Erro ao buscar resumo de pagamento da emergência:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  }

  static async getAll(req, res) {
    try {
      const { page = 1, limit = 10, status, type, urgency } = req.query;
      const filters = {};
      if (status) filters.status = status;
      if (type) filters.type = type;
      if (urgency) filters.urgency = urgency;

      const result = await EmergencyRequest.findAll(
        parseInt(page, 10),
        parseInt(limit, 10),
        filters
      );

      res.json({
        success: true,
        data: {
          requests: result.requests,
          total: result.total,
          totalPages: result.totalPages,
          currentPage: parseInt(page, 10),
        },
      });
    } catch (error) {
      console.error('Erro ao listar solicitações:', error);
      res.status(500).json({
        error: 'Erro interno do servidor',
      });
    }
  }

  static async getStats(req, res) {
    try {
      const stats = await EmergencyRequest.getStats();
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  }
}

module.exports = EmergencyRequestController;
