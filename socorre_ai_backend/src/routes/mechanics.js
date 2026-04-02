const express = require('express');
const router = express.Router();
const MechanicController = require('../controllers/mechanicController');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const mechanicSchemas = require('../middleware/validation').mechanicSchemas;

// Rotas públicas - específicas primeiro
router.get('/proximity', MechanicController.getMechanicsByProximity);
router.get('/specialty/:specialty', MechanicController.getMechanicsBySpecialty);
router.get('/search', MechanicController.searchMechanics);
router.get('/:id/services', MechanicController.getMechanicServices);
router.get('/:id/reviews', MechanicController.getMechanicReviews);
router.get('/:id', MechanicController.getMechanicById);
router.get('/', MechanicController.getAllMechanics);

// Rotas protegidas - apenas usuários autenticados
router.post('/', auth, validate(mechanicSchemas.createMechanic), MechanicController.createMechanic);
router.put('/:id', auth, validate(mechanicSchemas.updateMechanic), MechanicController.updateMechanic);
router.delete('/:id', auth, MechanicController.deleteMechanic);

// Rotas protegidas - apenas admin
router.patch('/:id/verify', auth, requireRole(['admin']), MechanicController.verifyMechanic);

module.exports = router;
