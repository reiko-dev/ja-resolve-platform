const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { validate, userSchemas } = require('../middleware/validation');
const { auth, requireRole } = require('../middleware/auth');

// Rotas protegidas - usuário logado
router.get('/profile', auth, userController.getProfile);
router.put('/profile', auth, validate(userSchemas.updateProfile), userController.updateProfile);

// Rotas protegidas - apenas admin
router.get('/', auth, requireRole(['admin']), userController.getUsers);
router.get('/:id', auth, requireRole(['admin']), userController.getUserById);
router.post('/', auth, requireRole(['admin']), validate(userSchemas.createUser), userController.createUser);
router.put('/:id', auth, requireRole(['admin']), validate(userSchemas.updateUser), userController.updateUser);
router.delete('/:id', auth, requireRole(['admin']), userController.deleteUser);

module.exports = router;
