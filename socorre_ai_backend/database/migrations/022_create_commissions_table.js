exports.up = function(knex) {
  return knex.schema.createTable('commissions', function(table) {
    table.increments('id').primary();
    
    // Relacionamentos
    table.integer('payment_id').unsigned().notNullable();
    table.integer('partner_id').unsigned().notNullable();
    table.integer('emergency_request_id').unsigned().nullable();
    table.integer('delivery_order_id').unsigned().nullable();
    table.integer('purchase_order_id').unsigned().nullable();
    
    // Valores
    table.decimal('total_amount', 10, 2).notNullable(); // Valor total do serviço
    table.decimal('platform_commission', 10, 2).notNullable(); // Comissão da plataforma
    table.decimal('partner_earnings', 10, 2).notNullable(); // Valor para o parceiro
    table.decimal('commission_rate', 5, 2).notNullable(); // Percentual da comissão
    
    // Taxas adicionais
    table.decimal('gateway_fee', 10, 2).defaultTo(0); // Taxa do gateway
    table.decimal('processing_fee', 10, 2).defaultTo(0); // Taxa de processamento
    
    // Status
    table.enum('status', ['pending', 'processed', 'paid', 'cancelled']).defaultTo('pending');
    
    // Informações de pagamento ao parceiro
    table.timestamp('paid_at').nullable();
    table.integer('withdrawal_transaction_id').unsigned().nullable(); // Transação de saque correspondente
    
    // Timestamps
    table.timestamps(true, true);
    
    // Índices
    table.index(['payment_id']);
    table.index(['partner_id']);
    table.index(['status']);
    table.index(['created_at']);
    
    // Foreign keys
    table.foreign('payment_id').references('id').inTable('payments').onDelete('CASCADE');
    table.foreign('partner_id').references('id').inTable('partners').onDelete('CASCADE');
    table.foreign('emergency_request_id').references('id').inTable('emergency_requests').onDelete('SET NULL');
    table.foreign('delivery_order_id').references('id').inTable('delivery_orders').onDelete('SET NULL');
    table.foreign('purchase_order_id').references('id').inTable('purchase_orders').onDelete('SET NULL');
    table.foreign('withdrawal_transaction_id').references('id').inTable('wallet_transactions').onDelete('SET NULL');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('commissions');
};

