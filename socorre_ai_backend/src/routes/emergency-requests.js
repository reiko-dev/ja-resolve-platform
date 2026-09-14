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

// Buscar solicitações do usuário
router.get('/user',
  auth,
  requireRole(['user']),
  EmergencyRequestController.getByUser
);

// Buscar solicitações do parceiro
router.get('/partner',
  auth,
  requireRole(['partner']),
  EmergencyRequestController.getByPartner
);

// Buscar solicitações próximas
router.get('/nearby',
  auth,
  requireRole(['partner', 'admin']),
  EmergencyRequestController.getNearby
);

// Obter estatísticas
router.get('/stats',
  auth,
  requireRole(['admin']),
  EmergencyRequestController.getStats
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
  requireRole(['user', 'admin']),
  EmergencyRequestController.getProposals
);

// Aceitar proposta (cliente)
router.post('/:id/accept-proposal', 
  auth, 
  requireRole(['user', 'admin']),
  EmergencyRequestController.acceptProposal
);

router.post('/:id/cancel',
  auth,
  requireRole(['user', 'admin']),
  EmergencyRequestController.cancel
);

router.post('/:id/start',
  auth,
  requireRole(['partner', 'admin']),
  EmergencyRequestController.start
);

router.post('/:id/complete',
  auth,
  requireRole(['partner', 'admin']),
  EmergencyRequestController.complete
);

router.get('/:id/payment-summary',
  auth,
  requireRole(['user', 'partner', 'admin']),
  EmergencyRequestController.getPaymentSummary
);

router.post('/:id/payment',
  auth,
  requireRole(['user', 'admin']),
  EmergencyRequestController.createPayment
);

router.post('/:id/rate',
  auth,
  requireRole(['user', 'admin']),
  EmergencyRequestController.rate
);

// Buscar solicitação por ID
router.get('/:id',
  auth,
  requireRole(['user', 'partner', 'admin']),
  EmergencyRequestController.getById
);

module.exports = router;
