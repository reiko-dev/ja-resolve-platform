const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { auth, requireRole } = require('../middleware/auth');

// Rotas públicas
router.get('/', categoryController.getCategories);
router.get('/:id', categoryController.getCategoryById);

// Rotas protegidas (apenas admin)
router.post('/', auth, requireRole('admin'), categoryController.createCategory);
router.put('/:id', auth, requireRole('admin'), categoryController.updateCategory);
router.delete('/:id', auth, requireRole('admin'), categoryController.deleteCategory);

module.exports = router;
