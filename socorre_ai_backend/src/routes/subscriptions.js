const express = require('express');
const router = express.Router();
const SubscriptionController = require('../controllers/SubscriptionController');
const { auth, requireRole } = require('../middleware/auth');

// Middleware de autenticação para todas as rotas
router.use(auth);

// Criar nova assinatura
router.post('/', SubscriptionController.create);

// Listar assinaturas
router.get('/', SubscriptionController.findAll);

// Buscar assinatura por ID
router.get('/:id', SubscriptionController.findById);

// Atualizar assinatura
router.put('/:id', SubscriptionController.update);

// Cancelar assinatura
router.delete('/:id', SubscriptionController.cancel);

// Processar pagamento de assinatura
router.post('/:id/payment', SubscriptionController.processPayment);

// Registrar falha de pagamento
router.post('/:id/payment-failure', SubscriptionController.recordPaymentFailure);

// Renovar assinatura manualmente
router.post('/:id/renew', SubscriptionController.renew);

// Buscar assinaturas vencendo em breve
router.get('/expiring-soon', SubscriptionController.findExpiringSoon);

// Buscar assinaturas vencidas
router.get('/expired', SubscriptionController.findExpired);

// Buscar assinaturas ativas
router.get('/active', SubscriptionController.findActive);

// Buscar assinaturas para cobrança automática
router.get('/auto-billing', SubscriptionController.findForAutoBilling);

// Verificar status de assinatura do parceiro
router.get('/partner/:partner_id/status', SubscriptionController.checkPartnerStatus);

// Obter estatísticas
router.get('/stats', SubscriptionController.getStats);

// Buscar histórico de assinatura
router.get('/:id/history', SubscriptionController.getHistory);

module.exports = router;
