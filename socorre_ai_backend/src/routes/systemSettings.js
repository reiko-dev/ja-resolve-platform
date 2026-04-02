const express = require('express');
const router = express.Router();
const SystemSettingsController = require('../controllers/SystemSettingsController');
const { auth, requireRole } = require('../middleware/auth');

// Middleware de autenticação para todas as rotas (exceto públicas)
router.use((req, res, next) => {
  // Rotas públicas não precisam de autenticação
  if (req.path.includes('/public') || req.path.includes('/app-settings')) {
    return next();
  }
  auth(req, res, next);
});

// Listar todas as configurações
router.get('/', SystemSettingsController.findAll);

// Buscar configuração por chave
router.get('/key/:key', SystemSettingsController.findByKey);

// Buscar múltiplas configurações
router.post('/keys', SystemSettingsController.findByKeys);

// Buscar configurações por categoria
router.get('/category/:category', SystemSettingsController.findByCategory);

// Buscar configurações públicas (para apps)
router.get('/public', SystemSettingsController.findPublic);

// Buscar configurações do app
router.get('/app-settings', SystemSettingsController.getAppSettings);

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
