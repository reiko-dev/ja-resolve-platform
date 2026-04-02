const express = require('express');
const router = express.Router();
const ProductController = require('../controllers/ProductController');
const { auth, requireRole } = require('../middleware/auth');

// Middleware de autenticação para todas as rotas
router.use(auth);

// Criar novo produto
router.post('/', ProductController.create);

// Listar produtos
router.get('/', ProductController.findAll);

// Buscar produto por ID
router.get('/:id', ProductController.findById);

// Buscar produto por SKU
router.get('/sku/:sku', ProductController.findBySKU);

// Buscar produtos da loja
router.get('/store/:store_id', ProductController.findByStore);

// Buscar produtos por categoria
router.get('/category/:category', ProductController.findByCategory);

// Buscar combustíveis
router.get('/fuels', ProductController.findFuels);

// Buscar auto peças
router.get('/auto-parts', ProductController.findAutoParts);

// Buscar produtos em destaque
router.get('/featured', ProductController.findFeatured);

// Buscar produtos similares
router.get('/:id/similar', ProductController.findSimilar);

// Busca textual
router.get('/search', ProductController.search);

// Atualizar produto
router.put('/:id', ProductController.update);

// Atualizar estoque
router.patch('/:id/stock', ProductController.updateStock);

// Ativar/desativar produto
router.patch('/:id/active', ProductController.toggleActive);

// Definir como destaque (admin)
router.patch('/:id/featured', ProductController.toggleFeatured);

// Deletar produto
router.delete('/:id', ProductController.delete);

// Verificar disponibilidade
router.get('/:id/availability', ProductController.checkAvailability);

// Obter estatísticas
router.get('/stats', ProductController.getStats);

module.exports = router;
