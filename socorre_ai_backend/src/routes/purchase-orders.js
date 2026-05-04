const express = require('express');
const router = express.Router();
const PurchaseOrderController = require('../controllers/purchaseOrderController');
const { auth, requireRole } = require('../middleware/auth');

// Rotas públicas (para busca de lojas, etc.)
// router.get('/stores', PurchaseOrderController.getStores);

// Rotas protegidas (usuários)
router.get('/user/:userId', 
  auth, 
  requireRole(['user', 'admin']), 
  PurchaseOrderController.getByUser
);

router.post('/', 
  auth, 
  requireRole(['user', 'admin']), 
  PurchaseOrderController.create
);

router.put('/:id/status', 
  auth, 
  requireRole(['user', 'partner', 'admin']), 
  PurchaseOrderController.updateStatus
);

router.post('/:id/rate', 
  auth, 
  requireRole(['user', 'admin']), 
  PurchaseOrderController.rate
);

// Rotas protegidas (lojas)
router.get('/store/:storeId', 
  auth, 
  requireRole(['partner', 'admin']), 
  PurchaseOrderController.getByStore
);

router.put('/:id/confirm', 
  auth, 
  requireRole(['partner', 'admin']), 
  PurchaseOrderController.confirm
);

router.put('/:id/prepare', 
  auth, 
  requireRole(['partner', 'admin']), 
  PurchaseOrderController.prepare
);

router.put('/:id/ready', 
  auth, 
  requireRole(['partner', 'admin']), 
  PurchaseOrderController.ready
);

router.put('/:id/cancel', 
  auth, 
  requireRole(['user', 'partner', 'admin']), 
  PurchaseOrderController.cancel
);

// Rotas administrativas
router.get('/', 
  auth, 
  requireRole(['admin']), 
  PurchaseOrderController.getAll
);

router.get('/stats', 
  auth, 
  requireRole(['admin']), 
  PurchaseOrderController.getStats
);

router.get('/:id', 
  auth, 
  requireRole(['admin']), 
  PurchaseOrderController.getById
);

router.put('/:id', 
  auth, 
  requireRole(['admin']), 
  PurchaseOrderController.update
);

router.delete('/:id', 
  auth, 
  requireRole(['admin']), 
  PurchaseOrderController.delete
);

module.exports = router;
