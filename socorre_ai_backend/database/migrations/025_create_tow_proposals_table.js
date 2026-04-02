exports.up = function(knex) {
  return knex.schema.createTable('tow_proposals', function(table) {
    table.increments('id').primary();
    table.integer('emergency_request_id').unsigned().references('id').inTable('emergency_requests').onDelete('CASCADE');
    table.integer('partner_id').unsigned().references('id').inTable('partners').onDelete('CASCADE');
    
    // Proposta
    table.decimal('proposed_price', 10, 2).notNullable();
    table.integer('estimated_time_minutes').notNullable();
    table.text('message'); // Mensagem para o cliente
    
    // Informações do guincho
    table.string('tow_truck_type'); // 'leve', 'pesado', 'plataforma'
    table.integer('tow_capacity_kg'); // Capacidade em kg
    table.boolean('has_winch').defaultTo(false);
    table.string('equipment_details'); // JSON com detalhes dos equipamentos
    
    // Status e validade
    table.enum('status', ['pending', 'accepted', 'rejected', 'expired', 'withdrawn'])
      .defaultTo('pending');
    table.timestamp('expires_at').notNullable(); // Proposta expira em X minutos
    table.timestamp('accepted_at').nullable();
    table.timestamp('responded_at').nullable();
    
    // Contador de visualizações
    table.integer('view_count').defaultTo(0);
    table.timestamp('last_viewed_at').nullable();
    
    // Rastreamento
    table.decimal('partner_distance_km', 5, 2); // Distância do parceiro ao local
    table.integer('partner_eta_minutes'); // Tempo estimado de chegada
    
    table.timestamps(true, true);
    
    // Índices
    table.index(['emergency_request_id']);
    table.index(['partner_id']);
    table.index(['status']);
    table.index(['expires_at']);
    table.index(['created_at']);
    
    // Índice composto para buscar propostas de uma emergência
    table.index(['emergency_request_id', 'status']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('tow_proposals');
};
