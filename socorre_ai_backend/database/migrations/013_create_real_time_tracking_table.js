exports.up = function(knex) {
  return knex.schema.createTable('real_time_tracking', function(table) {
    table.increments('id').primary();
    
    // Relacionamento com solicitações/ordens
    table.integer('emergency_request_id').unsigned().references('id').inTable('emergency_requests').onDelete('CASCADE');
    table.integer('delivery_order_id').unsigned().references('id').inTable('delivery_orders').onDelete('CASCADE');
    table.integer('purchase_order_id').unsigned().references('id').inTable('purchase_orders').onDelete('CASCADE');
    
    // Usuário e parceiro
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.integer('partner_id').unsigned().references('id').inTable('partners').onDelete('CASCADE');
    
    // Localização atual
    table.decimal('latitude', 10, 8).notNullable();
    table.decimal('longitude', 11, 8).notNullable();
    table.text('address');
    table.decimal('accuracy', 8, 2); // Precisão do GPS em metros
    table.decimal('speed', 8, 2); // Velocidade em km/h
    table.decimal('heading', 5, 2); // Direção em graus
    
    // Status do rastreamento
    table.enum('status', ['waiting', 'en_route', 'arrived', 'working', 'completed']).defaultTo('waiting');
    table.text('status_message'); // Mensagem de status personalizada
    
    // Tempos
    table.datetime('last_updated').notNullable();
    table.integer('update_interval_seconds').defaultTo(30); // Intervalo de atualização
    
    // Estimativas
    table.integer('estimated_arrival_minutes');
    table.decimal('estimated_distance_km', 8, 2);
    table.text('route_info'); // JSON com informações da rota
    
    // Histórico de localizações
    table.text('location_history'); // JSON com histórico de localizações
    
    // Configurações
    table.boolean('is_active').defaultTo(true);
    table.boolean('user_notifications_enabled').defaultTo(true);
    table.boolean('partner_notifications_enabled').defaultTo(true);
    
    // Informações adicionais
    table.text('notes');
    table.text('metadata'); // JSON com metadados adicionais
    
    table.timestamps(true, true);
    
    // Índices
    table.index(['emergency_request_id']);
    table.index(['delivery_order_id']);
    table.index(['purchase_order_id']);
    table.index(['user_id', 'partner_id']);
    table.index(['status', 'is_active']);
    table.index(['last_updated']);
    table.index(['latitude', 'longitude']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('real_time_tracking');
};
