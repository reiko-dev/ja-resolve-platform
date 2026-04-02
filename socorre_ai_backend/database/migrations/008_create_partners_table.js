exports.up = function(knex) {
  return knex.schema.createTable('partners', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    
    // Tipo de parceiro: 'mechanic', 'motoboy', 'store'
    table.enum('type', ['mechanic', 'motoboy', 'store']).notNullable();
    
    // Informações básicas
    table.string('business_name').notNullable();
    table.text('description');
    table.text('specialties'); // JSON array de especialidades
    table.text('address').notNullable();
    table.decimal('latitude', 10, 8);
    table.decimal('longitude', 11, 8);
    
    // Contato
    table.string('phone').notNullable();
    table.string('whatsapp');
    table.string('website');
    table.string('instagram');
    table.string('facebook');
    
    // Preços e taxas
    table.decimal('hourly_rate', 10, 2);
    table.decimal('service_fee', 10, 2);
    table.decimal('delivery_fee', 10, 2); // Para motoboys
    
    // Status e verificação
    table.boolean('is_verified').defaultTo(false);
    table.boolean('is_available').defaultTo(true);
    table.boolean('is_online').defaultTo(false);
    
    // Horários e métodos
    table.text('working_hours'); // JSON com horários
    table.text('payment_methods'); // JSON array de métodos
    table.text('service_areas'); // JSON array de áreas atendidas
    
    // Experiência e certificações
    table.integer('experience_years');
    table.text('certifications'); // JSON array de certificações
    table.text('insurance_info');
    table.text('warranty_info');
    
    // Tipos de serviço
    table.boolean('emergency_service').defaultTo(false);
    table.boolean('home_service').defaultTo(false);
    table.boolean('workshop_service').defaultTo(true);
    table.boolean('delivery_service').defaultTo(false); // Para motoboys
    
    // Raio de atendimento (em km)
    table.decimal('service_radius', 5, 2).defaultTo(10.00);
    table.decimal('delivery_radius', 5, 2).defaultTo(15.00); // Para motoboys
    
    // Informações específicas para motoboys
    table.string('vehicle_type'); // 'moto', 'carro', 'van'
    table.string('license_plate');
    table.string('cnh_number');
    table.string('cnh_category'); // 'A', 'B', 'AB'
    
    // Informações específicas para lojas
    table.text('store_categories'); // JSON array de categorias de produtos
    table.boolean('has_delivery').defaultTo(false);
    table.decimal('min_order_value', 10, 2);
    table.integer('delivery_time_minutes');
    
    // Avaliações
    table.decimal('rating', 3, 2).defaultTo(0);
    table.integer('total_reviews').defaultTo(0);
    
    // Estatísticas
    table.integer('total_services').defaultTo(0);
    table.integer('total_emergencies').defaultTo(0);
    table.integer('total_deliveries').defaultTo(0);
    table.integer('total_sales').defaultTo(0); // Para lojas
    
    table.timestamps(true, true);
    
    // Índices para performance
    table.index(['type', 'is_available', 'is_verified']);
    table.index(['latitude', 'longitude']);
    table.index(['type', 'specialties']);
    table.index(['rating']);
    table.index(['is_online']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('partners');
};
