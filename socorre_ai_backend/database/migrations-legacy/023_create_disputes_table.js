exports.up = function(knex) {
  return knex.schema.createTable('disputes', function(table) {
    table.increments('id').primary();
    
    // Relacionamentos
    table.integer('payment_id').unsigned().notNullable();
    table.integer('user_id').unsigned().notNullable();
    table.integer('partner_id').unsigned().notNullable();
    table.integer('emergency_request_id').unsigned().nullable();
    table.integer('delivery_order_id').unsigned().nullable();
    table.integer('purchase_order_id').unsigned().nullable();
    
    // Tipo e motivo
    table.enum('type', ['refund_request', 'quality_issue', 'service_not_delivered', 'fraud', 'other']).notNullable();
    table.enum('initiated_by', ['user', 'partner', 'platform']).notNullable();
    table.text('reason').notNullable();
    table.text('description').nullable();
    
    // Status
    table.enum('status', ['open', 'under_review', 'resolved', 'rejected', 'cancelled']).defaultTo('open');
    table.enum('resolution', ['refund_full', 'refund_partial', 'no_action', 'service_redelivery']).nullable();
    
    // Valores
    table.decimal('disputed_amount', 10, 2).notNullable();
    table.decimal('refund_amount', 10, 2).nullable();
    
    // Evidências
    table.text('evidence').nullable(); // JSON com fotos, documentos, etc.
    table.text('partner_response').nullable();
    table.text('platform_notes').nullable();
    
    // Resolução
    table.integer('resolved_by').unsigned().nullable(); // Admin que resolveu
    table.text('resolution_notes').nullable();
    table.timestamp('resolved_at').nullable();
    
    // Prioridade
    table.enum('priority', ['low', 'medium', 'high', 'urgent']).defaultTo('medium');
    
    // Timestamps
    table.timestamps(true, true);
    
    // Índices
    table.index(['payment_id']);
    table.index(['user_id']);
    table.index(['partner_id']);
    table.index(['status']);
    table.index(['priority']);
    table.index(['created_at']);
    
    // Foreign keys
    table.foreign('payment_id').references('id').inTable('payments').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('partner_id').references('id').inTable('partners').onDelete('CASCADE');
    table.foreign('resolved_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('emergency_request_id').references('id').inTable('emergency_requests').onDelete('SET NULL');
    table.foreign('delivery_order_id').references('id').inTable('delivery_orders').onDelete('SET NULL');
    table.foreign('purchase_order_id').references('id').inTable('purchase_orders').onDelete('SET NULL');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('disputes');
};

