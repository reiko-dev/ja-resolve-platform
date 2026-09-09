const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const paymentService = require('../services/paymentService');
const { body, validationResult } = require('express-validator');

// Middleware para validar erros
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Dados inválidos',
      errors: errors.array()
    });
  }
  next();
};

const hasPartnerAccess = (req, partnerId) => {
  if (req.user.role === 'admin') {
    return true;
  }

  return req.user.partner_id === Number(partnerId);
};

const canAccessPayment = (req, payment) => {
  const ownsUserPayment = payment.user_id === req.user.id;
  const ownsPartnerPayment = payment.partner_id && req.user.partner_id === payment.partner_id;
  return ownsUserPayment || ownsPartnerPayment || req.user.role === 'admin';
};

// Criar pagamento
router.post('/', auth, [
  body('amount').isFloat({ min: 0.01 }).withMessage('Valor deve ser maior que zero'),
  body('method').isIn(['credit_card', 'debit_card', 'pix', 'bank_slip', 'cash', 'bank_transfer']).withMessage('Método de pagamento inválido'),
  body('gateway').isIn(['stripe', 'mercadopago', 'pagseguro']).withMessage('Gateway inválido'),
  body('description').optional().isString().withMessage('Descrição deve ser uma string'),
  body('referenceId').optional().isString().withMessage('ID de referência deve ser uma string'),
  body('partnerId').optional().isInt().withMessage('ID do parceiro deve ser um número'),
  body('emergencyRequestId').optional().isInt().withMessage('ID da emergência deve ser um número'),
  body('deliveryOrderId').optional().isInt().withMessage('ID da entrega deve ser um número'),
  body('purchaseOrderId').optional().isInt().withMessage('ID da compra deve ser um número'),
  handleValidationErrors
], async (req, res) => {
  try {
    const paymentData = {
      ...req.body,
      userId: req.user.id
    };

    const result = await paymentService.createPayment(paymentData);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Pagamento criado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao criar pagamento:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erro interno do servidor'
    });
  }
});

// Buscar pagamentos do usuário
router.get('/', auth, async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      method: req.query.method,
      gateway: req.query.gateway,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20
    };

    const result = await paymentService.getUserPayments(req.user.id, filters);

    res.json({
      success: true,
      data: result.payments,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Erro ao buscar pagamentos:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erro interno do servidor'
    });
  }
});

// Buscar pagamentos do parceiro
router.get('/partner/:partnerId', auth, async (req, res) => {
  try {
    const { partnerId } = req.params;
    
    // Verificar se o usuário tem acesso aos pagamentos do parceiro
    if (!hasPartnerAccess(req, partnerId)) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }

    const filters = {
      status: req.query.status,
      method: req.query.method,
      gateway: req.query.gateway,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20
    };

    const result = await paymentService.getPartnerPayments(partnerId, filters);

    res.json({
      success: true,
      data: result.payments,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Erro ao buscar pagamentos do parceiro:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erro interno do servidor'
    });
  }
});

// Estatísticas de pagamento
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const { partnerId } = req.query;
    
    let stats = null;
    if (partnerId) {
      if (!hasPartnerAccess(req, partnerId)) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }

      stats = await paymentService.getPaymentStats(null, Number(partnerId));
    } else if (req.user.role === 'partner' && req.user.partner_id) {
      stats = await paymentService.getPaymentStats(null, req.user.partner_id);
    } else {
      stats = await paymentService.getPaymentStats(req.user.id, null);
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erro interno do servidor'
    });
  }
});

// Buscar pagamento por ID
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await paymentService.getPayment(id);

    if (!canAccessPayment(req, payment)) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }

    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Erro ao buscar pagamento:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erro interno do servidor'
    });
  }
});

// Confirmar pagamento
router.post('/:id/confirm', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await paymentService.getPayment(id);

    if (!canAccessPayment(req, payment)) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }

    const result = await paymentService.confirmPayment(id);

    res.json({
      success: true,
      data: result,
      message: 'Pagamento confirmado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao confirmar pagamento:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erro interno do servidor'
    });
  }
});

// Cancelar pagamento
router.post('/:id/cancel', auth, [
  body('reason').optional().isString().withMessage('Motivo deve ser uma string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const payment = await paymentService.getPayment(id);

    if (!canAccessPayment(req, payment)) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }
    
    const result = await paymentService.cancelPayment(id, reason);

    res.json({
      success: true,
      data: result,
      message: 'Pagamento cancelado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao cancelar pagamento:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erro interno do servidor'
    });
  }
});

// Reembolsar pagamento
router.post('/:id/refund', auth, [
  body('amount').optional().isFloat({ min: 0.01 }).withMessage('Valor deve ser maior que zero'),
  body('reason').optional().isString().withMessage('Motivo deve ser uma string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;
    const payment = await paymentService.getPayment(id);

    if (!canAccessPayment(req, payment)) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }
    
    const result = await paymentService.refundPayment(id, amount, reason);

    res.json({
      success: true,
      data: result,
      message: 'Reembolso processado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao reembolsar pagamento:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erro interno do servidor'
    });
  }
});

// Webhook para confirmação de pagamento.
// Gateways ainda são MOCKADOS (services/gateways/*) e não há validação
// criptográfica de assinatura. Comportamento por ambiente:
// - production: 410 Gone — nunca aceitar webhooks como válidos.
// - demais: mantém a simulação para desenvolvimento/testes.
router.post('/webhook/:gateway', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(410).json({
        success: false,
        message: 'Payment webhooks desabilitados em produção: gateway real com verificação de assinatura ainda não implementado.'
      });
    }

    const { gateway } = req.params;
    const { transactionId, status } = req.body;

    console.log(`Webhook recebido do ${gateway}:`, { transactionId, status });

    // Simular processamento do webhook
    // Em produção, aqui você validaria a assinatura do webhook
    // e processaria a confirmação do pagamento

    res.json({
      success: true,
      message: 'Webhook processado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao processar webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao processar webhook'
    });
  }
});

module.exports = router;
