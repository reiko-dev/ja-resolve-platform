const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validate, authSchemas } = require('../middleware/validation');
const { auth } = require('../middleware/auth');

// Rotas públicas
router.post('/register', validate(authSchemas.register), authController.register);
router.post('/login', validate(authSchemas.login), authController.login);

// Rotas protegidas
router.get('/verify', auth, authController.verifyToken);
router.post('/logout', auth, authController.logout);

module.exports = router;
