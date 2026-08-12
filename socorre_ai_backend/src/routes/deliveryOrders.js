const express = require('express');
const router = express.Router();
const DeliveryOrderController = require('../controllers/DeliveryOrderControllerNew');
const { auth } = require('../middleware/auth');

// Middleware de autenticação para todas as rotas
router.use(auth);

// Criar novo pedido de delivery
router.post('/', DeliveryOrderController.create);

// Listar todos os pedidos (com filtros)
router.get('/', DeliveryOrderController.getAll);

// Listar pedidos do cliente
router.get('/customer', DeliveryOrderController.findByCustomer);

// Listar pedidos da loja atual
router.get('/store', DeliveryOrderController.findByStore);

// Listar pedidos do motoboy atual
router.get('/motoboy', DeliveryOrderController.findByMotoboy);

// Estatísticas e histórico do motoboy atual
router.get('/motoboy/stats', DeliveryOrderController.getMotoboyStats);
router.get('/motoboy/history', DeliveryOrderController.getMotoboyHistory);

// Pedidos disponíveis para motoboys próximos
router.get('/available', DeliveryOrderController.findAvailable);

// Aceitar pedido (motoboy)
router.post('/:id/accept', DeliveryOrderController.accept);

// Iniciar coleta
router.post('/:id/start', DeliveryOrderController.start);
router.post('/:id/pickup', DeliveryOrderController.start);

// Marcar como em trânsito
router.post('/:id/in-transit', DeliveryOrderController.inTransit);

// Completar delivery
router.post('/:id/complete', DeliveryOrderController.complete);

// Cancelar delivery
router.post('/:id/cancel', DeliveryOrderController.cancel);

// Atualizar localização
router.post('/:id/location', DeliveryOrderController.updateLocation);
router.patch('/:id/location', DeliveryOrderController.updateLocation);

// Avaliar pedido entregue
router.post('/:id/rate', DeliveryOrderController.rate);

// Obter estatísticas
router.get('/stats', DeliveryOrderController.getStats);

// Obter pedido por id
router.get('/:id', DeliveryOrderController.getById);

module.exports = router;
