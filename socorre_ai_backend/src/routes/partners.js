const express = require('express');
const router = express.Router();
const PartnerController = require('../controllers/partnerController');
const { auth, requireRole } = require('../middleware/auth');
const { partnerSchemas, validate } = require('../middleware/validation');
const { validateMechanic, validateStore, validateMotoboy, handleValidationErrors } = require('../middleware/partnerValidation');

// Rotas públicas
router.get('/nearby', PartnerController.getNearby);
router.get('/specialty', PartnerController.getBySpecialty);
router.get('/emergency', PartnerController.getAvailableForEmergency);
router.get('/motoboys', PartnerController.getAvailableMotoboys);
router.get('/stores', PartnerController.getStoresByCategory);
router.get('/:id', PartnerController.getById);

// Rotas protegidas (parceiros)
router.post('/', 
  auth, 
  requireRole(['partner']), 
  validate(partnerSchemas.create),
  PartnerController.create
);

// Rotas específicas por tipo de parceiro
router.post('/mechanic', 
  auth, 
  validateMechanic,
  handleValidationErrors,
  PartnerController.createMechanic
);

router.post('/store', 
  auth, 
  validateStore,
  handleValidationErrors,
  PartnerController.createStore
);

router.post('/motoboy', 
  auth, 
  validateMotoboy,
  handleValidationErrors,
  PartnerController.createMotoboy
);

router.put('/:id', 
  auth, 
  requireRole(['partner']), 
  validate(partnerSchemas.update),
  PartnerController.update
);

router.put('/:id/online-status', 
  auth, 
  requireRole(['partner']), 
  PartnerController.updateOnlineStatus
);

router.put('/:id/location', 
  auth, 
  requireRole(['partner']), 
  PartnerController.updateLocation
);

// Rotas administrativas
router.get('/', 
  auth, 
  requireRole(['admin']), 
  PartnerController.getAll
);

router.delete('/:id', 
  auth, 
  requireRole(['admin']), 
  PartnerController.delete
);

// Rota para aprovar/rejeitar parceiros (admin)
router.put('/:id/approve', 
  auth, 
  requireRole(['admin']), 
  PartnerController.approvePartner
);

module.exports = router;
