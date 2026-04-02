exports.up = function(knex) {
  return knex.schema.createTable('products', function(table) {
    table.increments('id').primary();
    table.integer('store_id').unsigned().references('id').inTable('partners').onDelete('CASCADE');
    
    // Informações básicas
    table.string('name', 255).notNullable();
    table.text('description');
    table.string('sku', 100).unique(); // Código do produto
    table.string('barcode', 100); // Código de barras
    
    // Categoria e tipo
    table.string('category', 100);
    table.string('subcategory', 100);
    table.enum('product_type', ['simple', 'variable', 'bundle']).defaultTo('simple');
    
    // Preços
    table.decimal('price', 10, 2).notNullable();
    table.decimal('cost_price', 10, 2); // Preço de custo
    table.decimal('sale_price', 10, 2); // Preço promocional
    table.decimal('wholesale_price', 10, 2); // Preço atacado
    
    // Estoque
    table.integer('stock').defaultTo(0);
    table.integer('min_stock').defaultTo(0);
    table.integer('max_stock');
    table.boolean('track_stock').defaultTo(true);
    table.boolean('allow_backorder').defaultTo(false);
    
    // Dimensões e peso
    table.decimal('weight', 8, 3); // kg
    table.decimal('length', 8, 2); // cm
    table.decimal('width', 8, 2); // cm
    table.decimal('height', 8, 2); // cm
    
    // Imagens
    table.json('images'); // Array de URLs
    table.string('featured_image', 500);
    
    // Atributos
    table.json('attributes'); // JSON com atributos variáveis
    table.json('specifications'); // Especificações técnicas
    table.json('compatibility'); // Veículos compatíveis (para auto peças)
    
    // SEO e marketing
    table.string('slug', 255); // URL amigável
    table.text('meta_title');
    table.text('meta_description');
    table.json('tags'); // Array de tags
    
    // Status
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_featured').defaultTo(false);
    table.boolean('is_digital').defaultTo(false);
    
    // Controles
    table.integer('view_count').defaultTo(0);
    table.integer('sales_count').defaultTo(0);
    table.decimal('rating_average', 3, 2).defaultTo(0);
    table.integer('rating_count').defaultTo(0);
    
    // Combustíveis específicos (para postos)
    table.string('fuel_type'); // 'gasolina', 'etanol', 'diesel', 'gnv'
    table.decimal('fuel_liters', 8, 3); // Litros (se aplicável)
    
    table.timestamps(true, true);
    
    // Índices
    table.index(['store_id']);
    table.index(['category']);
    table.index(['is_active']);
    table.index(['is_featured']);
    table.index(['price']);
    table.index(['stock']);
    table.index(['sku']);
    table.index(['barcode']);
    table.index(['slug']);
    
    // Índices de busca
    table.index(['name']);
    table.index(['description']);
    
    // Full text search
    table.index(['name', 'description'], 'products_search_index');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('products');
};
