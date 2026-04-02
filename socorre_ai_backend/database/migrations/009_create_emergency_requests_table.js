exports.up = function(knex) {
  return knex.schema.createTable('emergency_requests', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    
    // Tipo de emergência: 'mechanical', 'fuel', 'tire', 'battery', 'other'
    table.enum('type', ['mechanical', 'fuel', 'tire', 'battery', 'other']).notNullable();
    
    // Descrição do problema
    table.text('description').notNullable();
    table.text('photos'); // JSON array de URLs das fotos
    
    // Informações do veículo
    table.text('vehicle_info'); // JSON com informações do veículo
    table.string('vehicle_plate');
    table.string('vehicle_model');
    table.string('vehicle_year');
    table.string('vehicle_color');
    
    // Localização
    table.enum('location_type', ['roadside', 'parking', 'home', 'other']).notNullable();
    table.decimal('latitude', 10, 8).notNullable();
    table.decimal('longitude', 11, 8).notNullable();
    table.text('address').notNullable();
    table.text('landmarks'); // Pontos de referência
    
    // Status da solicitação
    table.enum('status', ['pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'expired']).defaultTo('pending');
    
    // Parceiro que aceitou (pode ser mecânico ou motoboy)
    table.integer('partner_id').unsigned().references('id').inTable('partners').onDelete('SET NULL');
    table.integer('accepted_by').unsigned().references('id').inTable('users').onDelete('SET NULL');
    
    // Preços
    table.decimal('estimated_price', 10, 2);
    table.decimal('final_price', 10, 2);
    table.text('price_breakdown'); // JSON com detalhamento dos preços
    
    // Tempos
    table.datetime('accepted_at');
    table.datetime('started_at');
    table.datetime('completed_at');
    table.integer('estimated_duration_minutes');
    table.integer('actual_duration_minutes');
    
    // Informações adicionais
    table.text('notes');
    table.text('solution_description'); // Descrição da solução aplicada
    table.text('parts_used'); // JSON com peças utilizadas
    table.text('warranty_info'); // Informações de garantia
    
    // Urgência
    table.enum('urgency', ['low', 'medium', 'high', 'critical']).defaultTo('medium');
    table.boolean('is_urgent').defaultTo(false);
    
    // Avaliação
    table.integer('rating');
    table.text('review_comment');
    table.datetime('reviewed_at');
    
    // Estatísticas
    table.integer('view_count').defaultTo(0); // Quantas vezes foi visualizada
    table.integer('response_count').defaultTo(0); // Quantos parceiros responderam
    
    table.timestamps(true, true);
    
    // Índices
    table.index(['user_id']);
    table.index(['partner_id']);
    table.index(['type', 'status']);
    table.index(['latitude', 'longitude']);
    table.index(['status', 'created_at']);
    table.index(['urgency', 'is_urgent']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('emergency_requests');
};
