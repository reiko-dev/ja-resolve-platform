const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, requireRole } = require('../middleware/auth');
const disputeService = require('../services/disputeService');

// POST /disputes - Criar disputa
router.post('/', auth, [
  body('paymentId').isInt().withMessage('ID do pagamento é obrigatório'),
  body('type').isIn(['refund_request', 'quality_issue', 'service_not_delivered', 'fraud', 'other'])
    .withMessage('Tipo de disputa inválido'),
  body('reason').notEmpty().withMessage('Motivo é obrigatório'),
  body('description').optional().isString(),
  body('disputedAmount').optional().isFloat({ min: 0.01 }),
  body('evidence').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const dispute = await disputeService.createDispute({
      ...req.body,
      userId: req.user.id
    });

    res.status(201).json({
      success: true,
      data: dispute,
      message: 'Disputa criada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao criar disputa:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Erro ao criar disputa'
    });
  }
});

// GET /disputes - Listar disputas
router.get('/', auth, async (req, res) => {
  try {
    const filters = {
      userId: req.user.role === 'user' ? req.user.id : null,
      partnerId: req.user.role === 'partner' ? req.user.id : null,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20
    };

    const result = await disputeService.getDisputes(filters);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Erro ao buscar disputas:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// PUT /disputes/:id/respond - Responder disputa (parceiro)
router.put('/:id/respond', auth, [
  body('response').notEmpty().withMessage('Resposta é obrigatória')
], async (req, res) => {
  try {
    const result = await disputeService.respondToDispute(
      req.params.id,
      req.user.id,
      req.body.response
    );

    res.json({
      success: true,
      data: result,
      message: 'Resposta enviada com sucesso'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// PUT /disputes/:id/resolve - Resolver disputa (admin)
router.put('/:id/resolve', auth, requireRole(['admin']), [
  body('resolution').isIn(['refund_full', 'refund_partial', 'no_action', 'service_redelivery']),
  body('refundAmount').optional().isFloat({ min: 0 }),
  body('resolutionNotes').optional().isString()
], async (req, res) => {
  try {
    const result = await disputeService.resolveDispute(req.params.id, {
      ...req.body,
      resolvedBy: req.user.id
    });

    res.json({
      success: true,
      data: result,
      message: 'Disputa resolvida com sucesso'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;

