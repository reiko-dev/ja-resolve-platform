const express = require('express');
const router = express.Router();
const DeliveryOrderController = require('../controllers/deliveryOrderController');
const { auth, requireRole } = require('../middleware/auth');

// Rotas públicas (para busca de ordens próximas, etc.)
// router.get('/nearby', DeliveryOrderController.getNearby);

// Rotas protegidas (usuários)
router.get('/user/:userId', 
  auth, 
  requireRole(['user', 'admin']), 
  DeliveryOrderController.getByUser
);

router.post('/', 
  auth, 
  requireRole(['user', 'admin']), 
  DeliveryOrderController.create
);

router.put('/:id/status', 
  auth, 
  requireRole(['user', 'admin']), 
  DeliveryOrderController.updateStatus
);

router.post('/:id/rate', 
  auth, 
  requireRole(['user', 'admin']), 
  DeliveryOrderController.rate
);

// Rotas protegidas (motoboys)
router.get('/motoboy/:motoboyId', 
  auth, 
  requireRole(['partner', 'admin']), 
  DeliveryOrderController.getByMotoboy
);

// router.put('/:id/accept', 
//   auth, 
//   requireRole(['partner', 'admin']), 
//   DeliveryOrderController.accept
// );

// router.put('/:id/update-location', 
//   auth, 
//   requireRole(['partner', 'admin']), 
//   DeliveryOrderController.updateLocation
// );

// Rotas administrativas
router.get('/', 
  auth, 
  requireRole(['admin']), 
  DeliveryOrderController.getAll
);

router.get('/stats', 
  auth, 
  requireRole(['admin']), 
  DeliveryOrderController.getStats
);

router.get('/:id', 
  auth, 
  requireRole(['admin']), 
  DeliveryOrderController.getById
);

router.put('/:id', 
  auth, 
  requireRole(['admin']), 
  DeliveryOrderController.update
);

router.delete('/:id', 
  auth, 
  requireRole(['admin']), 
  DeliveryOrderController.delete
);

module.exports = router;
