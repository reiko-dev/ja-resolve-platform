const express = require('express');
const router = express.Router();
const DeliveryOrderController = require('../controllers/DeliveryOrderControllerNew');
const { auth, requireRole } = require('../middleware/auth');

// Middleware de autenticação para todas as rotas
router.use(auth);

// Criar novo pedido de delivery
router.post('/', DeliveryOrderController.create);

// Listar pedidos do cliente
router.get('/customer', DeliveryOrderController.findByCustomer);

// Aceitar pedido (motoboy)
router.post('/:id/accept', DeliveryOrderController.accept);

// Completar delivery
router.post('/:id/complete', DeliveryOrderController.complete);

// Obter estatísticas
router.get('/stats', DeliveryOrderController.getStats);

module.exports = router;
