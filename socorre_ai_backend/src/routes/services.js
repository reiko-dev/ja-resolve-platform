const express = require('express');
const router = express.Router();
const ServiceController = require('../controllers/serviceController');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const serviceSchemas = require('../middleware/validation').serviceSchemas;

// Rotas públicas
router.get('/', ServiceController.getAllServices);
router.get('/categories', ServiceController.getCategories);
router.get('/categories/:category/subcategories', ServiceController.getSubcategories);
router.get('/category/:category', ServiceController.getServicesByCategory);
router.get('/price-range', ServiceController.getServicesByPriceRange);
router.get('/:id', ServiceController.getServiceById);

// Rotas protegidas - apenas mecânicos autenticados
router.post('/', auth, requireRole(['mechanic', 'admin']), validate(serviceSchemas.createService), ServiceController.createService);
router.put('/:id', auth, requireRole(['mechanic', 'admin']), validate(serviceSchemas.updateService), ServiceController.updateService);
router.delete('/:id', auth, requireRole(['mechanic', 'admin']), ServiceController.deleteService);

module.exports = router;
