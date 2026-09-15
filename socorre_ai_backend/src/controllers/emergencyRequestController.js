const EmergencyRequest = require('../models/EmergencyRequest');
const Subscription = require('../models/Subscription');
const knex = require('../config/database');
const paymentService = require('../services/paymentService');
const NotificationService = require('../services/NotificationServiceNew');
const EmergencyRequestService = require('../services/EmergencyRequestService');
const { emergencyRequestSchemas } = require('../middleware/validation');
const { sendServiceError } = require('../services/ServiceError');

function invalidPayload(res, error) {
  return res.status(400).json({
    success: false,
    message: 'Dados inválidos',
    errors: error.details.map(detail => detail.message),
  });
}

function normalizePartnerType(partnerType) {
  return EmergencyRequestService.normalizePartnerType(partnerType);
}

class EmergencyRequestController {
  static canAccessRequest(req, request) {
    const isOwner = request.user_id === req.user.id;
    const isAssignedPartner = request.partner_id && request.partner_id === req.user.partner_id;
    const isAdmin = req.user.role === 'admin';

    return isOwner || isAssignedPartner || isAdmin;
  }

  /**
   * Matriz oficial de start/complete (docs/MOBILE-AUTH-TOW-CONTRACT-V1.md §4.4/§6):
   * apenas o parceiro atribuído ao pedido ou um administrador operam as transições.
   * Cliente (mesmo proprietário) e qualquer outro parceiro recebem 403 na rota.
   */
  static canOperateLifecycle(req, request) {
    if (req.user?.role === 'admin') {
      return true;
    }

    return Boolean(request.partner_id) && request.partner_id === req.user?.partner_id;
  }

  /**
   * Notificação de ciclo de vida é efeito colateral da transição: só é emitida
   * pelo request que efetivamente gravou o novo estado (nunca por repetições
   * sequenciais ou concorrentes). Falha de notificação não reverte a transição.
   */
  static async notifyLifecycle(userId, emergencyRequestId, type, title, message) {
    try {
      await NotificationService.sendNotification(userId, title, message, {
        type,
        emergency_request_id: emergencyRequestId,
      });
    } catch (notificationError) {
      console.error(`Falha ao notificar ${type}:`, notificationError);
    }
  }

  static async create(req, res) {
    try {
      // G3: coordenadas inválidas/(0,0) são rejeitadas antes de qualquer INSERT.
      const { request, nearbyPartners } = await EmergencyRequestService.createRequest(req.user, req.body);

      res.status(201).json({
        success: true,
        data: request,
        message: 'Solicitação de emergência criada com sucesso',
        partnersNotified: nearbyPartners.length,
        request_type: request.request_type,
      });
    } catch (error) {
      // G2 — ausência de pricing em system_settings vira resposta controlada
      // (nunca preço default silencioso nem 500 genérico).
      if (error?.code === 'tow_pricing_not_configured') {
        return res.status(error.status || 503).json({
          success: false,
          code: error.code,
          message: 'Preço de guincho não configurado. Contate o administrador.',
          missing_settings: error.missingKeys || [],
        });
      }

      return sendServiceError(res, error, 'Erro interno do servidor');
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
      const result = await EmergencyRequestService.findNearby(req.user, req.query);

      res.json({
        success: true,
        data: result.requests,
        count: result.count,
        search: {
          latitude: result.latitude,
          longitude: result.longitude,
          radius: result.radius,
          coordinate_source: result.coordinate_source,
        },
      });
    } catch (error) {
      return sendServiceError(res, error, 'Erro interno do servidor');
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
      if (!emergency || (emergency.user_id !== req.user.id && req.user.role !== 'admin')) {
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

  static async start(req, res) {
    try {
      const { id } = req.params;

      const emergency = await EmergencyRequest.findById(id);
      if (!emergency) {
        return res.status(404).json({
          success: false,
          message: 'Solicitação não encontrada',
        });
      }

      if (!EmergencyRequestController.canOperateLifecycle(req, emergency)) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado',
        });
      }

      // Repetição sequencial: o recurso já está no estado de destino.
      // Resposta idempotente sem nova mutação, notificação ou cobrança.
      if (emergency.status === 'in_progress') {
        return res.json({ success: true, data: emergency, message: 'Solicitação já foi iniciada' });
      }
      if (emergency.status !== 'accepted') {
        return res.status(400).json({
          success: false,
          message: 'Transição inválida: apenas solicitações aceitas podem ser iniciadas',
          current_status: emergency.status,
        });
      }

      const request = await EmergencyRequest.start(
        id,
        req.user.role === 'admin' ? null : req.user.partner_id
      );

      if (!request) {
        // A atualização condicional do model (WHERE status = 'accepted') perdeu
        // a corrida para outra requisição. Reler o recurso separa a repetição
        // concorrente idempotente (destino já aplicado, sem novos efeitos) de
        // uma transição incompatível (ex.: cancelamento venceu a corrida).
        const current = await EmergencyRequest.findById(id);
        if (current && current.status === 'in_progress') {
          return res.json({ success: true, data: current, message: 'Solicitação já foi iniciada' });
        }

        return res.status(400).json({
          success: false,
          message: 'Não foi possível iniciar a solicitação: o status mudou durante a operação',
          current_status: current ? current.status : null,
        });
      }

      await EmergencyRequestController.notifyLifecycle(
        emergency.user_id,
        id,
        'tow_started',
        'Guincho a caminho',
        'O parceiro iniciou o atendimento da sua solicitação.'
      );

      res.json({
        success: true,
        data: request,
        message: 'Solicitação iniciada com sucesso',
      });
    } catch (error) {
      console.error('Erro ao iniciar solicitação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  }

  static async complete(req, res) {
    try {
      const { id } = req.params;
      const payload = req.body || {};
      const { final_price, solution_description, parts_used } = payload;

      // Schema do contrato mechanic/legado (G2): preserva o comportamento
      // vigente desde G1 (final_price opcional), mas rejeita null/NaN/Infinity/
      // negativo/string não numérica ANTES de qualquer leitura ou UPDATE.
      // Tow usa `completeTow` (final_price obrigatório) após conhecido o tipo.
      const payloadValidation = emergencyRequestSchemas.completeMechanic.validate(payload);
      if (payloadValidation.error) {
        return invalidPayload(res, payloadValidation.error);
      }

      if (final_price !== undefined && (!Number.isFinite(Number(final_price)) || Number(final_price) < 0)) {
        return res.status(400).json({ success: false, message: 'final_price deve ser um valor não negativo' });
      }

      const emergency = await EmergencyRequest.findById(id);
      if (!emergency) {
        return res.status(404).json({
          success: false,
          message: 'Solicitação não encontrada',
        });
      }

      if (!EmergencyRequestController.canOperateLifecycle(req, emergency)) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado',
        });
      }

      // Repetição sequencial: conclusão já aplicada. Nenhum efeito novo
      // (mutação, cobrança, evento, notificação ou registro).
      if (emergency.status === 'completed') {
        return res.json({ success: true, data: emergency, message: 'Solicitação já foi concluída' });
      }
      if (emergency.status !== 'in_progress') {
        return res.status(400).json({
          success: false,
          message: 'Transição inválida: apenas solicitações em andamento podem ser concluídas',
          current_status: emergency.status,
        });
      }

      let request;
      if (emergency.request_type === 'tow') {
        if (final_price === undefined || final_price === null) {
          return res.status(400).json({ success: false, message: 'final_price é obrigatório para concluir um guincho' });
        }

        const towValidation = emergencyRequestSchemas.completeTow.validate({ final_price });
        if (towValidation.error) {
          return invalidPayload(res, towValidation.error);
        }

        const priceValidation = await EmergencyRequest.validateTowProposalPrice(id, final_price);
        if (!priceValidation.valid) {
          return res.status(400).json({
            success: false,
            message: `final_price abaixo do mínimo permitido: R$ ${priceValidation.minimumAcceptedPrice}`,
          });
        }
        request = await EmergencyRequest.completeWithProposal(
          id,
          final_price,
          solution_description,
          parts_used,
          req.user.role === 'admin' ? null : req.user.partner_id
        );
      } else {
        request = await EmergencyRequest.complete(
          id,
          final_price,
          solution_description,
          parts_used,
          req.user.role === 'admin' ? null : req.user.partner_id
        );
      }

      if (!request) {
        // Mesma separação do start: repetição concorrente idempotente versus
        // transição incompatível vencida por outra requisição.
        const current = await EmergencyRequest.findById(id);
        if (current && current.status === 'completed') {
          return res.json({ success: true, data: current, message: 'Solicitação já foi concluída' });
        }

        return res.status(400).json({
          success: false,
          message: 'Não foi possível concluir a solicitação: o status mudou durante a operação',
          current_status: current ? current.status : null,
        });
      }

      await EmergencyRequestController.notifyLifecycle(
        emergency.user_id,
        id,
        'tow_completed',
        'Guincho concluído',
        'O parceiro concluiu o atendimento da sua solicitação.'
      );

      res.json({
        success: true,
        data: request,
        message: 'Solicitação concluída com sucesso',
      });
    } catch (error) {
      console.error('Erro ao concluir solicitação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
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
