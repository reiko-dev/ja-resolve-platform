const express = require('express');
const router = express.Router();
const EmergencyRequestController = require('../controllers/emergencyRequestController');
const { auth, requireRole } = require('../middleware/auth');
const { emergencyRequestSchemas, validate } = require('../middleware/validation');

// Rotas protegidas (usuários)
router.post('/', 
  auth, 
  requireRole(['user']), 
  validate(emergencyRequestSchemas.create),
  EmergencyRequestController.create
);

router.get('/user', 
  auth, 
  requireRole(['user']), 
  EmergencyRequestController.getByUser
);

router.get('/user/:id', 
  auth, 
  requireRole(['user']), 
  EmergencyRequestController.getById
);

router.put('/:id/cancel', 
  auth, 
  requireRole(['user']), 
  EmergencyRequestController.cancel
);

router.put('/:id/rate', 
  auth, 
  requireRole(['user']), 
  validate(emergencyRequestSchemas.rate),
  EmergencyRequestController.rate
);

// Rotas protegidas (parceiros)
router.get('/partner', 
  auth, 
  requireRole(['partner']), 
  EmergencyRequestController.getByPartner
);

router.get('/pending', 
  auth, 
  requireRole(['partner']), 
  EmergencyRequestController.getPendingForPartners
);

router.post('/:id/response', 
  auth, 
  requireRole(['partner']), 
  EmergencyRequestController.partnerResponse
);

router.get('/:id/responses', 
  auth, 
  requireRole(['user']), 
  EmergencyRequestController.getPartnerResponses
);

router.put('/:id/accept', 
  auth, 
  requireRole(['partner']), 
  validate(emergencyRequestSchemas.accept),
  EmergencyRequestController.accept
);

router.put('/:id/start', 
  auth, 
  requireRole(['partner']), 
  EmergencyRequestController.start
);

router.put('/:id/complete', 
  auth, 
  requireRole(['partner']), 
  validate(emergencyRequestSchemas.complete),
  EmergencyRequestController.complete
);

// Rotas administrativas
router.get('/', 
  auth, 
  requireRole(['admin']), 
  EmergencyRequestController.getAll
);

router.get('/stats', 
  auth, 
  requireRole(['admin']), 
  EmergencyRequestController.getStats
);

router.get('/:id', 
  auth, 
  requireRole(['admin']), 
  EmergencyRequestController.getById
);

module.exports = router;
