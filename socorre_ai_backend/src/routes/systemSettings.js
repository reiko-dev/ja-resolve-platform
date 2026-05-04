const express = require('express');
const router = express.Router();
const SystemSettingsController = require('../controllers/SystemSettingsController');
const { auth, requireRole } = require('../middleware/auth');
const legacyRouteRegistry = require('../services/legacyRouteRegistry');
const { getLegacyRouteConfigSnapshot } = require('../bootstrap/legacyRoutes');

// Rotas públicas
router.get('/public', SystemSettingsController.findPublic);
router.get('/app-settings', SystemSettingsController.getAppSettings);

// Todas as demais rotas deste módulo são administrativas
router.use(auth);
router.use(requireRole(['admin']));

// Listar todas as configurações
router.get('/', SystemSettingsController.findAll);

// Buscar configuração por chave
router.get('/key/:key', SystemSettingsController.findByKey);

// Buscar múltiplas configurações
router.post('/keys', SystemSettingsController.findByKeys);

// Buscar configurações por categoria
router.get('/category/:category', SystemSettingsController.findByCategory);

// Criar ou atualizar configuração
router.post('/', SystemSettingsController.upsert);

// Atualizar configuração
router.put('/key/:key', SystemSettingsController.update);

// Deletar configuração
router.delete('/key/:key', SystemSettingsController.delete);

// Resetar configuração para valor padrão
router.post('/key/:key/reset', SystemSettingsController.resetToDefault);

// Resetar categoria para valores padrão
router.post('/category/:category/reset', SystemSettingsController.resetCategoryToDefault);

// Exportar configurações
router.get('/export', SystemSettingsController.export);

// Importar configurações
router.post('/import', SystemSettingsController.import);

// Buscar configurações organizadas por categoria (para admin)
router.get('/by-category', SystemSettingsController.getSettingsByCategory);

// Obter telemetria de uso das trilhas legadas
router.get('/legacy-route-usage', (req, res) => {
  res.json({
    success: true,
    data: legacyRouteRegistry.getSnapshot(),
  });
});

// Obter configuracao efetiva das trilhas legadas
router.get('/legacy-route-config', (req, res) => {
  res.json({
    success: true,
    data: getLegacyRouteConfigSnapshot(),
  });
});

// Resetar telemetria de uso das trilhas legadas
router.post('/legacy-route-usage/reset', (req, res) => {
  legacyRouteRegistry.reset();
  res.json({
    success: true,
    message: 'Telemetria de rotas legadas resetada com sucesso',
  });
});

// Validar valor de configuração
router.post('/validate', SystemSettingsController.validateValue);

// Configurações específicas para guinchos
router.get('/guincho', SystemSettingsController.getGuinchoSettings);

// Configurações específicas para assinaturas
router.get('/subscription', SystemSettingsController.getSubscriptionSettings);

// Configurações específicas para delivery
router.get('/delivery', SystemSettingsController.getDeliverySettings);

// Atualizar configurações em lote
router.patch('/batch', SystemSettingsController.updateBatch);

module.exports = router;
