const Product = require('../models/Product');
const Partner = require('../models/Partner');
const SystemSettings = require('../models/SystemSettings');

class ProductController {
  // Criar novo produto
  static async create(req, res) {
    try {
      const { 
        store_id, 
        name, 
        description, 
        category, 
        subcategory,
        price, 
        stock, 
        sku,
        barcode,
        images,
        featured_image
      } = req.body;

      // Validar dados
      if (!store_id || !name || !price) {
        return res.status(400).json({ 
          error: 'Dados obrigatórios: store_id, name, price' 
        });
      }

      // Verificar se loja existe e tem assinatura ativa
      const store = await Partner.findById(store_id);
      if (!store) {
        return res.status(404).json({ error: 'Loja não encontrada' });
      }

      if (!['posto_combustivel', 'auto_pecas'].includes(store.type)) {
        return res.status(400).json({ 
          error: 'Apenas postos e auto peças podem cadastrar produtos' 
        });
      }

      const hasActiveSubscription = await Partner.hasActiveSubscription(store_id);
      if (!hasActiveSubscription) {
        return res.status(400).json({ 
          error: 'Loja não possui assinatura ativa' 
        });
      }

      // Verificar se SKU já existe
      if (sku) {
        const existingProduct = await Product.findBySKU(sku);
        if (existingProduct) {
          return res.status(400).json({ error: 'SKU já existe' });
        }
      }

      // Gerar slug
      const slug = name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const productData = {
        store_id,
        name,
        description,
        category,
        subcategory,
        price: parseFloat(price),
        stock: parseInt(stock) || 0,
        sku,
        barcode,
        images: images ? JSON.stringify(images) : null,
        featured_image,
        slug,
        is_active: true
      };

      const product = await Product.create(productData);

      res.status(201).json({
        success: true,
        data: product,
        message: 'Produto criado com sucesso'
      });

    } catch (error) {
      console.error('Erro ao criar produto:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Listar produtos
  static async findAll(req, res) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        store_id, 
        category, 
        min_price, 
        max_price, 
        search,
        in_stock 
      } = req.query;

      const filters = {};
      if (store_id) filters.store_id = parseInt(store_id);
      if (category) filters.category = category;
      if (min_price) filters.min_price = parseFloat(min_price);
      if (max_price) filters.max_price = parseFloat(max_price);
      if (search) filters.search = search;
      if (in_stock === 'true') filters.in_stock = true;

      const result = await Product.findAll(
        parseInt(page), 
        parseInt(limit), 
        filters
      );

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('Erro ao listar produtos:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar produto por ID
  static async findById(req, res) {
    try {
      const { id } = req.params;

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }

      // Incrementar visualizações
      await Product.incrementViews(id);

      res.json({
        success: true,
        data: product
      });

    } catch (error) {
      console.error('Erro ao buscar produto:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar produto por SKU
  static async findBySKU(req, res) {
    try {
      const { sku } = req.params;

      const product = await Product.findBySKU(sku);
      if (!product) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }

      res.json({
        success: true,
        data: product
      });

    } catch (error) {
      console.error('Erro ao buscar produto por SKU:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar produtos da loja
  static async findByStore(req, res) {
    try {
      const { store_id } = req.params;
      const { category, subcategory, min_price, max_price, search, in_stock } = req.query;

      // Verificar se loja existe
      const store = await Partner.findById(store_id);
      if (!store) {
        return res.status(404).json({ error: 'Loja não encontrada' });
      }

      const filters = {};
      if (category) filters.category = category;
      if (subcategory) filters.subcategory = subcategory;
      if (min_price) filters.min_price = parseFloat(min_price);
      if (max_price) filters.max_price = parseFloat(max_price);
      if (search) filters.search = search;
      if (in_stock === 'true') filters.in_stock = true;

      const products = await Product.findByStore(store_id, filters);

      res.json({
        success: true,
        data: products
      });

    } catch (error) {
      console.error('Erro ao listar produtos da loja:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar produtos por categoria
  static async findByCategory(req, res) {
    try {
      const { category } = req.params;
      const { latitude, longitude, radius } = req.query;

      let products;
      if (latitude && longitude) {
        products = await Product.findByCategory(
          category,
          parseFloat(latitude),
          parseFloat(longitude),
          parseFloat(radius) || 25
        );
      } else {
        products = await Product.findByCategory(category);
      }

      res.json({
        success: true,
        data: products
      });

    } catch (error) {
      console.error('Erro ao buscar produtos por categoria:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar combustíveis
  static async findFuels(req, res) {
    try {
      const { store_id } = req.query;

      const fuels = await Product.findFuels(store_id);

      res.json({
        success: true,
        data: fuels
      });

    } catch (error) {
      console.error('Erro ao buscar combustíveis:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar auto peças
  static async findAutoParts(req, res) {
    try {
      const { vehicle_brand, part_category, latitude, longitude, radius } = req.query;

      const filters = {};
      if (vehicle_brand) filters.vehicle_brand = vehicle_brand;
      if (part_category) filters.part_category = part_category;

      let parts;
      if (latitude && longitude) {
        parts = await Product.findAutoParts(filters)
          .then(parts => parts.filter(part => {
            // Filtrar por proximidade se necessário
            const distance = Product.calculateDistance(
              parseFloat(latitude),
              parseFloat(longitude),
              part.latitude,
              part.longitude
            );
            return distance <= (parseFloat(radius) || 25);
          }));
      } else {
        parts = await Product.findAutoParts(filters);
      }

      res.json({
        success: true,
        data: parts
      });

    } catch (error) {
      console.error('Erro ao buscar auto peças:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar produtos em destaque
  static async findFeatured(req, res) {
    try {
      const { latitude, longitude, radius, limit } = req.query;

      const products = await Product.findFeatured(
        latitude ? parseFloat(latitude) : null,
        longitude ? parseFloat(longitude) : null,
        radius ? parseFloat(radius) : null,
        limit ? parseInt(limit) : 20
      );

      res.json({
        success: true,
        data: products
      });

    } catch (error) {
      console.error('Erro ao buscar produtos em destaque:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar produtos similares
  static async findSimilar(req, res) {
    try {
      const { id } = req.params;
      const { limit = 5 } = req.query;

      const products = await Product.findSimilar(id, parseInt(limit));

      res.json({
        success: true,
        data: products
      });

    } catch (error) {
      console.error('Erro ao buscar produtos similares:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Busca textual
  static async search(req, res) {
    try {
      const { q: query, latitude, longitude, radius, limit = 50 } = req.query;

      if (!query) {
        return res.status(400).json({ error: 'Query de busca é obrigatória' });
      }

      const products = await Product.search(
        query,
        latitude ? parseFloat(latitude) : null,
        longitude ? parseFloat(longitude) : null,
        radius ? parseFloat(radius) : null,
        parseInt(limit)
      );

      res.json({
        success: true,
        data: products
      });

    } catch (error) {
      console.error('Erro ao buscar produtos:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Atualizar produto
  static async update(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }

      // Verificar permissões
      const isOwner = product.store_id === req.user.partner_id;
      const isAdmin = req.user.role === 'admin';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      // Atualizar slug se nome mudou
      if (updateData.name && updateData.name !== product.name) {
        updateData.slug = updateData.name.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
      }

      // Converter campos JSON
      if (updateData.images) {
        updateData.images = JSON.stringify(updateData.images);
      }

      const updatedProduct = await Product.update(id, updateData);

      res.json({
        success: true,
        data: updatedProduct,
        message: 'Produto atualizado com sucesso'
      });

    } catch (error) {
      console.error('Erro ao atualizar produto:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Atualizar estoque
  static async updateStock(req, res) {
    try {
      const { id } = req.params;
      const { quantity, operation = 'set' } = req.body;

      if (quantity === undefined || isNaN(quantity)) {
        return res.status(400).json({ error: 'Quantidade inválida' });
      }

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }

      // Verificar permissões
      const isOwner = product.store_id === req.user.partner_id;
      const isAdmin = req.user.role === 'admin';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const updatedProduct = await Product.updateStock(id, parseInt(quantity), operation);

      res.json({
        success: true,
        data: updatedProduct,
        message: 'Estoque atualizado com sucesso'
      });

    } catch (error) {
      console.error('Erro ao atualizar estoque:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Ativar/desativar produto
  static async toggleActive(req, res) {
    try {
      const { id } = req.params;

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }

      // Verificar permissões
      const isOwner = product.store_id === req.user.partner_id;
      const isAdmin = req.user.role === 'admin';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const updatedProduct = await Product.update(id, {
        is_active: !product.is_active
      });

      res.json({
        success: true,
        data: updatedProduct,
        message: `Produto ${updatedProduct.is_active ? 'ativado' : 'desativado'} com sucesso`
      });

    } catch (error) {
      console.error('Erro ao alterar status do produto:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Definir como destaque
  static async toggleFeatured(req, res) {
    try {
      const { id } = req.params;

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }

      // Verificar permissões (apenas admin)
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const updatedProduct = await Product.update(id, {
        is_featured: !product.is_featured
      });

      res.json({
        success: true,
        data: updatedProduct,
        message: `Produto ${updatedProduct.is_featured ? 'marcado' : 'desmarcado'} como destaque`
      });

    } catch (error) {
      console.error('Erro ao alterar destaque do produto:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Deletar produto
  static async delete(req, res) {
    try {
      const { id } = req.params;

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }

      // Verificar permissões
      const isOwner = product.store_id === req.user.partner_id;
      const isAdmin = req.user.role === 'admin';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      await Product.delete(id);

      res.json({
        success: true,
        message: 'Produto deletado com sucesso'
      });

    } catch (error) {
      console.error('Erro ao deletar produto:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Verificar disponibilidade
  static async checkAvailability(req, res) {
    try {
      const { id } = req.params;
      const { quantity = 1 } = req.query;

      const availability = await Product.checkAvailability(id, parseInt(quantity));

      res.json({
        success: true,
        data: availability
      });

    } catch (error) {
      console.error('Erro ao verificar disponibilidade:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Obter estatísticas
  static async getStats(req, res) {
    try {
      const { store_id } = req.query;

      const stats = await Product.getStats(store_id ? parseInt(store_id) : null);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Erro ao obter estatísticas:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }
}

module.exports = ProductController;
