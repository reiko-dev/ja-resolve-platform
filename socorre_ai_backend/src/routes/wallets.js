const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const { auth, requireRole } = require('../middleware/auth');
const walletService = require('../services/walletService');

// Middleware para tratamento de erros de validação
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

// GET /wallets - Obter carteira do usuário autenticado
router.get('/', auth, async (req, res) => {
  try {
    let wallet = req.user.partner_id
      ? await walletService.getOrCreatePartnerWallet(req.user.id, req.user.partner_id)
      : await walletService.getWalletByUserId(req.user.id);
    
    if (!wallet) {
      // Criar carteira se não existir
      wallet = await walletService.createWallet(req.user.id);
    }

    res.json({
      success: true,
      data: wallet
    });
  } catch (error) {
    console.error('Erro ao buscar carteira:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erro interno do servidor'
    });
  }
});

// GET /wallets/transactions - Obter transações da carteira
router.get('/transactions', auth, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('type').optional().isIn(['deposit', 'withdrawal', 'refund', 'commission', 'adjustment', 'fee']),
  query('direction').optional().isIn(['credit', 'debit']),
  query('status').optional().isIn(['pending', 'completed', 'failed', 'cancelled'])
], async (req, res) => {
  try {
    const wallet = req.user.partner_id
      ? await walletService.getOrCreatePartnerWallet(req.user.id, req.user.partner_id)
      : await walletService.getWalletByUserId(req.user.id);
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Carteira não encontrada'
      });
    }

    const filters = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      type: req.query.type,
      direction: req.query.direction,
      status: req.query.status
    };

    const result = await walletService.getTransactions(wallet.id, filters);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Erro ao buscar transações:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erro interno do servidor'
    });
  }
});

// POST /wallets/withdraw - Solicitar saque
router.post('/withdraw', auth, [
  body('amount').isFloat({ min: 20 }).withMessage('Valor mínimo é R$ 20,00'),
  body('notes').optional().isString()
], handleValidationErrors, async (req, res) => {
  try {
    const wallet = req.user.partner_id
      ? await walletService.getOrCreatePartnerWallet(req.user.id, req.user.partner_id)
      : await walletService.getWalletByUserId(req.user.id);
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Carteira não encontrada'
      });
    }

    const result = await walletService.requestWithdrawal(
      wallet.id,
      parseFloat(req.body.amount),
      req.body.notes
    );

    res.json({
      success: true,
      data: result,
      message: 'Saque solicitado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao solicitar saque:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Erro ao processar saque'
    });
  }
});

// PUT /wallets/bank-details - Atualizar dados bancários
router.put('/bank-details', auth, [
  body('pix_key').optional().isString(),
  body('bank_name').optional().isString(),
  body('bank_agency').optional().isString(),
  body('bank_account').optional().isString(),
  body('account_type').optional().isIn(['checking', 'savings']),
  body('account_holder_name').optional().isString(),
  body('account_holder_document').optional().isString()
], handleValidationErrors, async (req, res) => {
  try {
    const wallet = req.user.partner_id
      ? await walletService.getOrCreatePartnerWallet(req.user.id, req.user.partner_id)
      : await walletService.getWalletByUserId(req.user.id);
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Carteira não encontrada'
      });
    }

    const updated = await walletService.updateBankDetails(wallet.id, req.body);

    res.json({
      success: true,
      data: updated,
      message: 'Dados bancários atualizados com sucesso'
    });
  } catch (error) {
    console.error('Erro ao atualizar dados bancários:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erro interno do servidor'
    });
  }
});

// GET /wallets/:id - Obter carteira por ID (admin)
router.get('/:id', auth, requireRole(['admin']), async (req, res) => {
  try {
    const wallet = await walletService.getWallet(req.params.id);

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Carteira não encontrada'
      });
    }

    res.json({
      success: true,
      data: wallet
    });
  } catch (error) {
    console.error('Erro ao buscar carteira:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erro interno do servidor'
    });
  }
});

module.exports = router;
