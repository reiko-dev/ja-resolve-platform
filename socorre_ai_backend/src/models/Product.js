const knex = require('../config/database');

class Product {
  // Criar novo produto
  static async create(productData) {
    const [product] = await knex('products').insert(productData).returning('*');
    return product;
  }

  // Buscar por ID
  static async findById(id) {
    return await knex('products')
      .select(
        'products.*',
        'partners.business_name as store_name',
        'partners.type as store_type',
        'partners.address as store_address'
      )
      .leftJoin('partners', 'products.store_id', 'partners.id')
      .where('products.id', id)
      .first();
  }

  // Buscar por SKU
  static async findBySKU(sku) {
    return await knex('products')
      .select(
        'products.*',
        'partners.business_name as store_name',
        'partners.type as store_type'
      )
      .leftJoin('partners', 'products.store_id', 'partners.id')
      .where('products.sku', sku)
      .first();
  }

  // Buscar produtos da loja
  static async findByStore(storeId, filters = {}) {
    let query = knex('products')
      .select('products.*')
      .where('store_id', storeId)
      .where('is_active', true);

    // Aplicar filtros
    if (filters.category) {
      query = query.where('category', filters.category);
    }
    if (filters.subcategory) {
      query = query.where('subcategory', filters.subcategory);
    }
    if (filters.min_price) {
      query = query.where('price', '>=', filters.min_price);
    }
    if (filters.max_price) {
      query = query.where('price', '<=', filters.max_price);
    }
    if (filters.in_stock) {
      query = query.where('stock', '>', 0);
    }
    if (filters.fuel_type) {
      query = query.where('fuel_type', filters.fuel_type);
    }
    if (filters.search) {
      query = query.where(function() {
        this.where('name', 'like', `%${filters.search}%`)
            .orWhere('description', 'like', `%${filters.search}%`)
            .orWhere('sku', 'like', `%${filters.search}%`);
      });
    }

    return await query.order('is_featured', 'desc').order('name', 'asc');
  }

  // Buscar produtos por categoria
  static async findByCategory(category, latitude = null, longitude = null, radius = 25) {
    let query = knex('products')
      .select(
        'products.*',
        'partners.business_name as store_name',
        'partners.type as store_type',
        'partners.address as store_address',
        'partners.latitude',
        'partners.longitude'
      )
      .leftJoin('partners', 'products.store_id', 'partners.id')
      .where('products.category', category)
      .where('products.is_active', true)
      .where('products.stock', '>', 0);

    // Se coordenadas fornecidas, filtrar por proximidade
    if (latitude && longitude) {
      query = query.select(
        knex.raw(`
          6371 * acos(
            cos(radians(?)) * cos(radians(partners.latitude)) * 
            cos(radians(partners.longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(partners.latitude))
          ) AS distance_km
        `, [latitude, longitude, latitude])
      )
      .having('distance_km', '<=', radius)
      .orderBy('distance_km', 'asc');
    }

    return await query.order('products.is_featured', 'desc').order('products.name', 'asc');
  }

  // Buscar combustíveis (para postos)
  static async findFuels(storeId = null) {
    let query = knex('products')
      .select(
        'products.*',
        'partners.business_name as store_name',
        'partners.address as store_address',
        'partners.latitude',
        'partners.longitude'
      )
      .leftJoin('partners', 'products.store_id', 'partners.id')
      .where('products.category', 'combustivel')
      .where('products.is_active', true)
      .whereNotNull('products.fuel_type');

    if (storeId) {
      query = query.where('products.store_id', storeId);
    }

    return await query.order('products.fuel_type', 'asc');
  }

  // Buscar peças (para auto peças)
  static async findAutoParts(filters = {}) {
    let query = knex('products')
      .select(
        'products.*',
        'partners.business_name as store_name',
        'partners.address as store_address',
        'partners.latitude',
        'partners.longitude'
      )
      .leftJoin('partners', 'products.store_id', 'partners.id')
      .where('products.category', 'auto_pecas')
      .where('products.is_active', true)
      .where('products.stock', '>', 0);

    // Filtros específicos para auto peças
    if (filters.vehicle_brand) {
      query = query.whereRaw('JSON_CONTAINS(compatibility, ?)', [JSON.stringify(filters.vehicle_brand)]);
    }
    if (filters.part_category) {
      query = query.where('subcategory', filters.part_category);
    }

    return await query.order('products.is_featured', 'desc').order('products.name', 'asc');
  }

  // Buscar produtos em destaque
  static async findFeatured(latitude = null, longitude = null, radius = 25, limit = 20) {
    let query = knex('products')
      .select(
        'products.*',
        'partners.business_name as store_name',
        'partners.type as store_type',
        'partners.address as store_address'
      )
      .leftJoin('partners', 'products.store_id', 'partners.id')
      .where('products.is_featured', true)
      .where('products.is_active', true)
      .where('products.stock', '>', 0);

    // Se coordenadas fornecidas, filtrar por proximidade
    if (latitude && longitude) {
      query = query.select(
        knex.raw(`
          6371 * acos(
            cos(radians(?)) * cos(radians(partners.latitude)) * 
            cos(radians(partners.longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(partners.latitude))
          ) AS distance_km
        `, [latitude, longitude, latitude])
      )
      .having('distance_km', '<=', radius)
      .orderBy('distance_km', 'asc');
    }

    return await query.limit(limit).orderBy('products.view_count', 'desc');
  }

  // Buscar produtos similares
  static async findSimilar(productId, limit = 5) {
    const product = await knex('products').where('id', productId).first();
    if (!product) return [];

    return await knex('products')
      .select(
        'products.*',
        'partners.business_name as store_name'
      )
      .leftJoin('partners', 'products.store_id', 'partners.id')
      .where('products.id', '!=', productId)
      .where('products.category', product.category)
      .where('products.is_active', true)
      .where('products.stock', '>', 0)
      .limit(limit)
      .orderByRaw('ABS(price - ?)', [product.price]);
  }

  // Buscar com busca textual
  static async search(query, latitude = null, longitude = null, radius = 25, limit = 50) {
    let dbQuery = knex('products')
      .select(
        'products.*',
        'partners.business_name as store_name',
        'partners.type as store_type',
        knex.raw(`
          CASE 
            WHEN LOWER(products.name) LIKE LOWER(?) THEN 100
            WHEN LOWER(products.description) LIKE LOWER(?) THEN 80
            WHEN LOWER(products.sku) LIKE LOWER(?) THEN 90
            ELSE 50
          END as relevance_score
        `, [`%${query}%`, `%${query}%`, `%${query}%`])
      )
      .leftJoin('partners', 'products.store_id', 'partners.id')
      .where('products.is_active', true)
      .where(function() {
        this.where('products.name', 'like', `%${query}%`)
            .orWhere('products.description', 'like', `%${query}%`)
            .orWhere('products.sku', 'like', `%${query}%`)
            .orWhere('products.tags', 'like', `%${query}%`);
      });

    // Se coordenadas fornecidas, adicionar distância
    if (latitude && longitude) {
      dbQuery = dbQuery.select(
        knex.raw(`
          6371 * acos(
            cos(radians(?)) * cos(radians(partners.latitude)) * 
            cos(radians(partners.longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(partners.latitude))
          ) AS distance_km
        `, [latitude, longitude, latitude])
      )
      .having('distance_km', '<=', radius);
    }

    return await dbQuery
      .orderBy('relevance_score', 'desc')
      .orderBy('products.is_featured', 'desc')
      .limit(limit);
  }

  // Atualizar produto
  static async update(id, productData) {
    const [product] = await knex('products')
      .where('id', id)
      .update({ ...productData, updated_at: knex.fn.now() })
      .returning('*');
    return product;
  }

  // Atualizar estoque
  static async updateStock(id, quantity, operation = 'set') {
    let query;
    if (operation === 'add') {
      query = knex('products')
        .where('id', id)
        .increment('stock', quantity);
    } else if (operation === 'subtract') {
      query = knex('products')
        .where('id', id)
        .decrement('stock', quantity);
    } else {
      query = knex('products')
        .where('id', id)
        .update({ stock: quantity });
    }

    const [product] = await query
      .update({ updated_at: knex.fn.now() })
      .returning('*');

    return product;
  }

  // Incrementar contador de visualizações
  static async incrementViews(id) {
    return await knex('products')
      .where('id', id)
      .increment('view_count', 1)
      .update({ updated_at: knex.fn.now() });
  }

  // Atualizar rating
  static async updateRating(id, rating) {
    const product = await knex('products').where('id', id).first();
    if (!product) return null;

    const newRatingCount = product.rating_count + 1;
    const newRatingAvg = ((product.rating_average * product.rating_count) + rating) / newRatingCount;

    const [updatedProduct] = await knex('products')
      .where('id', id)
      .update({
        rating_average: parseFloat(newRatingAvg.toFixed(2)),
        rating_count: newRatingCount,
        updated_at: knex.fn.now()
      })
      .returning('*');

    return updatedProduct;
  }

  // Listar com paginação
  static async findAll(page = 1, limit = 20, filters = {}) {
    const offset = (page - 1) * limit;
    
    let query = knex('products')
      .select(
        'products.*',
        'partners.business_name as store_name',
        'partners.type as store_type'
      )
      .leftJoin('partners', 'products.store_id', 'partners.id');

    // Aplicar filtros
    if (filters.store_id) {
      query = query.where('products.store_id', filters.store_id);
    }
    if (filters.category) {
      query = query.where('products.category', filters.category);
    }
    if (filters.is_active !== undefined) {
      query = query.where('products.is_active', filters.is_active);
    }
    if (filters.is_featured !== undefined) {
      query = query.where('products.is_featured', filters.is_featured);
    }
    if (filters.min_price) {
      query = query.where('products.price', '>=', filters.min_price);
    }
    if (filters.max_price) {
      query = query.where('products.price', '<=', filters.max_price);
    }
    if (filters.search) {
      query = query.where(function() {
        this.where('products.name', 'like', `%${filters.search}%`)
            .orWhere('products.description', 'like', `%${filters.search}%`)
            .orWhere('products.sku', 'like', `%${filters.search}%`);
      });
    }

    // Query para contar total
    const countQuery = knex('products')
      .leftJoin('partners', 'products.store_id', 'partners.id');
    
    // Aplicar filtros na query de contagem
    if (filters.store_id) {
      countQuery.where('products.store_id', filters.store_id);
    }
    if (filters.category) {
      countQuery.where('products.category', filters.category);
    }
    if (filters.is_active !== undefined) {
      countQuery.where('products.is_active', filters.is_active);
    }
    if (filters.is_featured !== undefined) {
      countQuery.where('products.is_featured', filters.is_featured);
    }
    if (filters.min_price) {
      countQuery.where('products.price', '>=', filters.min_price);
    }
    if (filters.max_price) {
      countQuery.where('products.price', '<=', filters.max_price);
    }
    if (filters.search) {
      countQuery.where(function() {
        this.where('products.name', 'like', `%${filters.search}%`)
            .orWhere('products.description', 'like', `%${filters.search}%`)
            .orWhere('products.sku', 'like', `%${filters.search}%`);
      });
    }

    const [products, total] = await Promise.all([
      query.limit(limit).offset(offset).orderBy('products.created_at', 'desc'),
      countQuery.count('* as count').first()
    ]);

    return {
      products,
      total: total.count,
      page,
      limit,
      totalPages: Math.ceil(total.count / limit)
    };
  }

  // Estatísticas
  static async getStats(storeId = null) {
    let query = knex('products');
    
    if (storeId) {
      query = query.where('store_id', storeId);
    }

    const stats = await query
      .select(
        knex.raw('COUNT(*) as total'),
        knex.raw('COUNT(CASE WHEN is_active = true THEN 1 END) as active'),
        knex.raw('COUNT(CASE WHEN is_featured = true THEN 1 END) as featured'),
        knex.raw('COUNT(CASE WHEN stock > 0 THEN 1 END) as in_stock'),
        knex.raw('COUNT(CASE WHEN stock <= min_stock THEN 1 END) as low_stock'),
        knex.raw('SUM(stock) as total_stock'),
        knex.raw('SUM(price) as total_value'),
        knex.raw('AVG(price) as avg_price'),
        knex.raw('AVG(rating_average) as avg_rating'),
        knex.raw('SUM(view_count) as total_views'),
        knex.raw('SUM(sales_count) as total_sales')
      )
      .first();

    return stats;
  }

  // Deletar produto
  static async delete(id) {
    return await knex('products').where('id', id).del();
  }

  // Verificar disponibilidade
  static async checkAvailability(productId, quantity = 1) {
    const product = await knex('products')
      .where('id', productId)
      .where('is_active', true)
      .first();

    if (!product) return { available: false, reason: 'Produto não encontrado' };
    if (product.stock < quantity) return { available: false, reason: 'Estoque insuficiente' };
    
    return { available: true, product };
  }
}

module.exports = Product;
