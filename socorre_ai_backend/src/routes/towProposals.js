const express = require('express');
const router = express.Router();
const TowProposalController = require('../controllers/TowProposalController');
const { auth, requireRole } = require('../middleware/auth');

// Middleware de autenticação para todas as rotas
router.use(auth);

// Criar nova proposta
router.post('/', requireRole(['partner']), TowProposalController.create);

// Buscar propostas expirando em breve
router.get('/expiring-soon', requireRole(['admin']), TowProposalController.findExpiringSoon);

// Obter estatísticas
router.get('/stats', requireRole(['admin']), TowProposalController.getStats);

// Listar propostas de uma emergência (para cliente)
router.get('/emergency/:emergency_request_id', requireRole(['user', 'admin']), TowProposalController.findByEmergency);

// Listar propostas do parceiro
router.get('/partner', requireRole(['partner']), TowProposalController.findByPartner);

// Buscar proposta por ID
router.get('/:id', requireRole(['user', 'partner', 'admin']), TowProposalController.findById);

// Aceitar proposta (cliente)
router.post('/:id/accept', requireRole(['user', 'admin']), TowProposalController.accept);

// Rejeitar proposta (cliente)
router.post('/:id/reject', requireRole(['user', 'admin']), TowProposalController.reject);

// Retirar proposta (parceiro)
router.post('/:id/withdraw', requireRole(['partner']), TowProposalController.withdraw);

// Incrementar visualizações
router.post('/:id/views', requireRole(['user', 'partner', 'admin']), TowProposalController.incrementViews);

// Listar todas as propostas (admin)
router.get('/', requireRole(['admin']), TowProposalController.findAll);

// Expirar propostas de uma emergência
router.post('/emergency/:emergency_request_id/expire', requireRole(['admin']), TowProposalController.expireProposals);

module.exports = router;
