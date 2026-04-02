exports.up = function(knex) {
  return knex.schema.createTable('wallet_transactions', function(table) {
    table.increments('id').primary();
    table.integer('wallet_id').unsigned().notNullable();
    
    // Tipo de transação
    table.enum('type', [
      'deposit',           // Depósito (recebimento de serviço)
      'withdrawal',        // Saque
      'refund',            // Estorno
      'commission',        // Comissão da plataforma
      'adjustment',        // Ajuste manual
      'fee'                // Taxa
    ]).notNullable();
    
    // Direção do movimento
    table.enum('direction', ['credit', 'debit']).notNullable();
    
    // Valor
    table.decimal('amount', 10, 2).notNullable();
    table.decimal('balance_before', 10, 2).notNullable();
    table.decimal('balance_after', 10, 2).notNullable();
    
    // Referências
    table.integer('payment_id').unsigned().nullable();
    table.integer('emergency_request_id').unsigned().nullable();
    table.integer('delivery_order_id').unsigned().nullable();
    table.integer('purchase_order_id').unsigned().nullable();
    table.integer('dispute_id').unsigned().nullable();
    
    // Descrição
    table.text('description').nullable();
    table.text('metadata').nullable(); // JSON adicional
    
    // Status
    table.enum('status', ['pending', 'completed', 'failed', 'cancelled']).defaultTo('pending');
    
    // Timestamps
    table.timestamp('processed_at').nullable();
    table.timestamps(true, true);
    
    // Índices
    table.index(['wallet_id']);
    table.index(['type']);
    table.index(['status']);
    table.index(['created_at']);
    table.index(['payment_id']);
    
    // Foreign keys
    table.foreign('wallet_id').references('id').inTable('wallets').onDelete('CASCADE');
    table.foreign('payment_id').references('id').inTable('payments').onDelete('SET NULL');
    table.foreign('emergency_request_id').references('id').inTable('emergency_requests').onDelete('SET NULL');
    table.foreign('delivery_order_id').references('id').inTable('delivery_orders').onDelete('SET NULL');
    table.foreign('purchase_order_id').references('id').inTable('purchase_orders').onDelete('SET NULL');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('wallet_transactions');
};

