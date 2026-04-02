const express = require('express');
const router = express.Router();
const EmergencyRequestController = require('../controllers/emergencyRequestControllerNew');
const authMiddleware = require('../middleware/authMiddleware');

// Middleware de autenticação para todas as rotas
router.use(authMiddleware);

// Criar nova solicitação de emergência
router.post('/', EmergencyRequestController.create);

// Buscar solicitação por ID
router.get('/:id', EmergencyRequestController.getById);

// Buscar solicitações do usuário
router.get('/user', EmergencyRequestController.getByUser);

// Buscar solicitações do parceiro
router.get('/partner', EmergencyRequestController.getByPartner);

// Buscar solicitações próximas (para parceiros)
router.get('/nearby', EmergencyRequestController.getNearby);

// Aceitar solicitação (apenas para mecânicos)
router.post('/:id/accept', EmergencyRequestController.accept);

// Buscar propostas de uma emergência (para cliente)
router.get('/:id/proposals', EmergencyRequestController.getProposals);

// Aceitar proposta (cliente)
router.post('/:id/accept-proposal', EmergencyRequestController.acceptProposal);

// Listar todas as solicitações (admin)
router.get('/', EmergencyRequestController.findAll);

// Obter estatísticas
router.get('/stats', EmergencyRequestController.getStats);

module.exports = router;
