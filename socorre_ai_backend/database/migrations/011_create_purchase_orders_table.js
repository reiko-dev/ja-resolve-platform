exports.up = function(knex) {
  return knex.schema.createTable('purchase_orders', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.integer('store_id').unsigned().references('id').inTable('partners').onDelete('SET NULL');
    
    // Tipo de pedido: 'emergency', 'regular', 'scheduled'
    table.enum('type', ['emergency', 'regular', 'scheduled']).notNullable();
    
    // Itens do pedido
    table.text('items'); // JSON array com itens
    table.text('items_description'); // Descrição detalhada dos itens
    table.integer('total_items_quantity');
    
    // Preços
    table.decimal('subtotal', 10, 2);
    table.decimal('delivery_fee', 10, 2);
    table.decimal('taxes', 10, 2);
    table.decimal('discount', 10, 2);
    table.decimal('total_price', 10, 2);
    table.text('price_breakdown'); // JSON com detalhamento
    
    // Status do pedido
    table.enum('status', ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'refunded']).defaultTo('pending');
    
    // Endereço de entrega
    table.text('delivery_address'); // JSON com endereço completo
    table.decimal('delivery_latitude', 10, 8);
    table.decimal('delivery_longitude', 11, 8);
    table.text('delivery_instructions');
    table.string('delivery_contact_name');
    table.string('delivery_contact_phone');
    
    // Entrega
    table.boolean('has_delivery').defaultTo(true);
    table.integer('estimated_delivery_minutes');
    table.datetime('scheduled_delivery_at');
    table.datetime('delivered_at');
    table.integer('actual_delivery_minutes');
    
    // Motoboy responsável pela entrega
    table.integer('delivery_motoboy_id').unsigned().references('id').inTable('partners').onDelete('SET NULL');
    
    // Pagamento
    table.enum('payment_method', ['cash', 'card', 'pix', 'app']).defaultTo('cash');
    table.enum('payment_status', ['pending', 'paid', 'refunded']).defaultTo('pending');
    table.datetime('paid_at');
    table.text('payment_info'); // JSON com informações do pagamento
    
    // Urgência
    table.enum('urgency', ['low', 'medium', 'high', 'urgent']).defaultTo('medium');
    table.boolean('is_urgent').defaultTo(false);
    
    // Avaliação
    table.integer('rating');
    table.text('review_comment');
    table.datetime('reviewed_at');
    
    // Informações adicionais
    table.text('notes');
    table.text('special_instructions');
    table.text('delivery_proof'); // JSON com comprovantes de entrega
    table.text('invoice_info'); // JSON com informações da nota fiscal
    
    // Estatísticas
    table.integer('view_count').defaultTo(0);
    table.integer('response_count').defaultTo(0);
    
    // Relacionamento com emergência (se aplicável)
    table.integer('emergency_request_id').unsigned().references('id').inTable('emergency_requests').onDelete('SET NULL');
    
    table.timestamps(true, true);
    
    // Índices
    table.index(['user_id']);
    table.index(['store_id']);
    table.index(['delivery_motoboy_id']);
    table.index(['type', 'status']);
    table.index(['delivery_latitude', 'delivery_longitude']);
    table.index(['status', 'created_at']);
    table.index(['urgency', 'is_urgent']);
    table.index(['emergency_request_id']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('purchase_orders');
};
