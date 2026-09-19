exports.up = function(knex) {
  return knex.schema.createTable('payments', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.integer('partner_id').unsigned().nullable();
    table.integer('emergency_request_id').unsigned().nullable();
    table.integer('delivery_order_id').unsigned().nullable();
    table.integer('purchase_order_id').unsigned().nullable();
    
    // Informações do pagamento
    table.decimal('amount', 10, 2).notNullable();
    table.string('currency', 3).defaultTo('BRL');
    table.enum('status', ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded']).defaultTo('pending');
    table.enum('method', ['credit_card', 'debit_card', 'pix', 'bank_slip', 'cash', 'bank_transfer']).notNullable();
    
    // Informações do gateway
    table.string('gateway').notNullable(); // 'stripe', 'mercadopago', 'pagseguro', etc.
    table.string('gateway_transaction_id').nullable();
    table.string('gateway_payment_id').nullable();
    table.json('gateway_response').nullable();
    
    // Informações adicionais
    table.text('description').nullable();
    table.string('reference_id').nullable(); // ID de referência externa
    table.decimal('fee_amount', 10, 2).defaultTo(0); // Taxa do gateway
    table.decimal('net_amount', 10, 2).nullable(); // Valor líquido após taxas
    
    // Dados do cartão (criptografados)
    table.string('card_last_four').nullable();
    table.string('card_brand').nullable();
    table.string('card_exp_month').nullable();
    table.string('card_exp_year').nullable();
    
    // Dados do PIX
    table.string('pix_code').nullable();
    table.string('pix_qr_code').nullable();
    table.timestamp('pix_expires_at').nullable();
    
    // Dados do boleto
    table.string('bank_slip_code').nullable();
    table.string('bank_slip_url').nullable();
    table.timestamp('bank_slip_expires_at').nullable();
    
    // Timestamps
    table.timestamp('processed_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('cancelled_at').nullable();
    table.timestamp('refunded_at').nullable();
    table.timestamps(true, true);
    
    // Índices para performance
    table.index(['user_id']);
    table.index(['partner_id']);
    table.index(['status']);
    table.index(['method']);
    table.index(['gateway_transaction_id']);
    table.index(['created_at']);
    
    // Foreign keys
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('partner_id').references('id').inTable('partners').onDelete('SET NULL');
    table.foreign('emergency_request_id').references('id').inTable('emergency_requests').onDelete('SET NULL');
    table.foreign('delivery_order_id').references('id').inTable('delivery_orders').onDelete('SET NULL');
    table.foreign('purchase_order_id').references('id').inTable('purchase_orders').onDelete('SET NULL');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('payments');
};
