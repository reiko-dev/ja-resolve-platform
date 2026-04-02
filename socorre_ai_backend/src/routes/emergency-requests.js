const express = require('express');
const router = express.Router();
const EmergencyRequestController = require('../controllers/emergencyRequestController');
const { auth, requireRole } = require('../middleware/auth');
const { emergencyRequestSchemas, validate } = require('../middleware/validation');

// Listar solicitações de emergência
router.get('/', 
  auth, 
  requireRole(['admin']), 
  EmergencyRequestController.getAll
);

// Criar nova solicitação de emergência
router.post('/', 
  auth, 
  requireRole(['user']), 
  validate(emergencyRequestSchemas.create),
  EmergencyRequestController.create
);

// Aceitar solicitação (apenas para mecânicos)
router.post('/:id/accept', 
  auth, 
  requireRole(['partner']), 
  EmergencyRequestController.accept
);

// Buscar propostas de uma emergência (para cliente)
router.get('/:id/proposals', 
  auth, 
  requireRole(['user']), 
  EmergencyRequestController.getProposals
);

// Aceitar proposta (cliente)
router.post('/:id/accept-proposal', 
  auth, 
  requireRole(['user']), 
  EmergencyRequestController.acceptProposal
);

module.exports = router;
