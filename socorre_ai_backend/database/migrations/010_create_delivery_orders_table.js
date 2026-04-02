exports.up = function(knex) {
  return knex.schema.createTable('delivery_orders', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.integer('motoboy_id').unsigned().references('id').inTable('partners').onDelete('SET NULL');
    
    // Tipo de entrega: 'fuel', 'parts', 'food', 'other'
    table.enum('type', ['fuel', 'parts', 'food', 'other']).notNullable();
    
    // Itens da entrega
    table.text('items'); // JSON array com itens
    table.text('items_description'); // Descrição detalhada dos itens
    
    // Localizações
    table.text('pickup_location'); // JSON com endereço de coleta
    table.decimal('pickup_latitude', 10, 8);
    table.decimal('pickup_longitude', 11, 8);
    table.text('pickup_address');
    table.text('pickup_instructions');
    
    table.text('delivery_location'); // JSON com endereço de entrega
    table.decimal('delivery_latitude', 10, 8);
    table.decimal('delivery_longitude', 11, 8);
    table.text('delivery_address');
    table.text('delivery_instructions');
    
    // Status da entrega
    table.enum('status', ['pending', 'accepted', 'picked_up', 'in_transit', 'delivered', 'cancelled']).defaultTo('pending');
    
    // Preços
    table.decimal('delivery_fee', 10, 2);
    table.decimal('items_price', 10, 2);
    table.decimal('total_price', 10, 2);
    table.text('price_breakdown'); // JSON com detalhamento
    
    // Tempos
    table.datetime('accepted_at');
    table.datetime('picked_up_at');
    table.datetime('delivered_at');
    table.integer('estimated_delivery_minutes');
    table.integer('actual_delivery_minutes');
    
    // Informações específicas por tipo
    table.text('fuel_info'); // JSON com tipo, quantidade, etc.
    table.text('parts_info'); // JSON com peças, loja, etc.
    table.text('store_info'); // JSON com informações da loja
    
    // Urgência
    table.enum('urgency', ['low', 'medium', 'high', 'urgent']).defaultTo('medium');
    table.boolean('is_urgent').defaultTo(false);
    
    // Pagamento
    table.enum('payment_method', ['cash', 'card', 'pix', 'app']).defaultTo('cash');
    table.enum('payment_status', ['pending', 'paid', 'refunded']).defaultTo('pending');
    table.datetime('paid_at');
    
    // Avaliação
    table.integer('rating');
    table.text('review_comment');
    table.datetime('reviewed_at');
    
    // Informações adicionais
    table.text('notes');
    table.text('delivery_proof'); // JSON com comprovantes de entrega
    table.text('tracking_info'); // JSON com informações de rastreamento
    
    // Estatísticas
    table.decimal('distance_km', 8, 2);
    table.integer('view_count').defaultTo(0);
    table.integer('response_count').defaultTo(0);
    
    table.timestamps(true, true);
    
    // Índices
    table.index(['user_id']);
    table.index(['motoboy_id']);
    table.index(['type', 'status']);
    table.index(['delivery_latitude', 'delivery_longitude']);
    table.index(['status', 'created_at']);
    table.index(['urgency', 'is_urgent']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('delivery_orders');
};
