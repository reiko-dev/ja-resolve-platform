const express = require('express');
const router = express.Router();
const TowProposalController = require('../controllers/TowProposalController');
const { auth, requireRole } = require('../middleware/auth');

// Middleware de autenticação para todas as rotas
router.use(auth);

// Criar nova proposta
router.post('/', TowProposalController.create);

// Listar propostas de uma emergência (para cliente)
router.get('/emergency/:emergency_request_id', TowProposalController.findByEmergency);

// Listar propostas do parceiro
router.get('/partner', TowProposalController.findByPartner);

// Buscar proposta por ID
router.get('/:id', TowProposalController.findById);

// Aceitar proposta (cliente)
router.post('/:id/accept', TowProposalController.accept);

// Rejeitar proposta (cliente)
router.post('/:id/reject', TowProposalController.reject);

// Retirar proposta (parceiro)
router.post('/:id/withdraw', TowProposalController.withdraw);

// Incrementar visualizações
router.post('/:id/views', TowProposalController.incrementViews);

// Listar todas as propostas (admin)
router.get('/', TowProposalController.findAll);

// Buscar propostas expirando em breve
router.get('/expiring-soon', TowProposalController.findExpiringSoon);

// Expirar propostas de uma emergência
router.post('/emergency/:emergency_request_id/expire', TowProposalController.expireProposals);

// Obter estatísticas
router.get('/stats', TowProposalController.getStats);

module.exports = router;
