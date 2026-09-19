exports.up = function(knex) {
  return knex.schema.createTable('partner_services', function(table) {
    table.increments('id').primary();
    table.integer('partner_id').unsigned().references('id').inTable('partners').onDelete('CASCADE');
    
    // Informações do serviço
    table.string('name').notNullable();
    table.text('description');
    table.text('detailed_description'); // Descrição mais detalhada
    
    // Preços
    table.decimal('price', 10, 2);
    table.enum('price_type', ['fixed', 'hourly', 'per_item', 'negotiable']).defaultTo('fixed');
    table.decimal('min_price', 10, 2);
    table.decimal('max_price', 10, 2);
    
    // Duração e disponibilidade
    table.integer('estimated_duration_minutes');
    table.boolean('is_available').defaultTo(true);
    table.boolean('emergency_service').defaultTo(false);
    table.boolean('home_service').defaultTo(false);
    table.boolean('workshop_service').defaultTo(true);
    
    // Categorias
    table.string('category').notNullable(); // 'mechanical', 'fuel', 'parts', 'delivery'
    table.string('subcategory');
    table.text('tags'); // JSON array de tags
    
    // Especialidades específicas
    table.text('specialties'); // JSON array de especialidades específicas
    table.text('required_tools'); // JSON array de ferramentas necessárias
    table.text('required_parts'); // JSON array de peças necessárias
    
    // Informações técnicas
    table.text('technical_requirements'); // Requisitos técnicos
    table.text('warranty_info'); // Informações de garantia
    table.integer('warranty_days');
    
    // Estatísticas
    table.integer('total_orders').defaultTo(0);
    table.integer('completed_orders').defaultTo(0);
    table.integer('cancelled_orders').defaultTo(0);
    table.decimal('average_rating', 3, 2).defaultTo(0);
    table.integer('total_reviews').defaultTo(0);
    
    // Configurações
    table.boolean('requires_approval').defaultTo(false);
    table.boolean('is_featured').defaultTo(false);
    table.integer('sort_order').defaultTo(0);
    
    // Horários específicos do serviço
    table.text('service_hours'); // JSON com horários específicos
    table.text('unavailable_dates'); // JSON com datas indisponíveis
    
    // Imagens
    table.text('images'); // JSON array de URLs das imagens
    table.text('before_after_images'); // JSON com imagens antes/depois
    
    table.timestamps(true, true);
    
    // Índices
    table.index(['partner_id']);
    table.index(['category', 'subcategory']);
    table.index(['is_available', 'emergency_service']);
    table.index(['price_type', 'price']);
    table.index(['average_rating']);
    table.index(['is_featured', 'sort_order']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('partner_services');
};
