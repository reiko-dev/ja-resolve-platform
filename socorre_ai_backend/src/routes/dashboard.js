const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/dashboardController');
const { auth, requireRole } = require('../middleware/auth');

// Rota para estatísticas do dashboard (apenas admin)
router.get('/stats', auth, requireRole(['admin']), getDashboardStats);

module.exports = router;
