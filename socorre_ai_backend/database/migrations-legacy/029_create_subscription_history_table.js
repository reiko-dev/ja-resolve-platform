exports.up = function(knex) {
  return knex.schema.createTable('subscription_history', function(table) {
    table.increments('id').primary();
    table.integer('subscription_id').unsigned().references('id').inTable('subscriptions').onDelete('CASCADE');
    table.integer('partner_id').unsigned().references('id').inTable('partners').onDelete('CASCADE');
    
    // Ação realizada
    table.enum('action', [
      'created', 'paid', 'expired', 'cancelled', 'renewed', 
      'suspended', 'reactivated', 'payment_failed', 'method_changed'
    ]).notNullable();
    
    // Valores
    table.decimal('amount', 10, 2);
    table.decimal('previous_amount', 10, 2); // Valor anterior (para mudanças)
    table.string('currency', 3).defaultTo('BRL');
    
    // Pagamento relacionado
    table.integer('payment_id').unsigned().references('id').inTable('payments').onDelete('SET NULL');
    table.string('gateway_transaction_id');
    table.string('payment_method');
    
    // Datas importantes
    table.date('billing_period_start');
    table.date('billing_period_end');
    table.date('next_billing_date');
    
    // Motivo e observações
    table.text('reason'); // Motivo da ação
    table.text('admin_notes'); // Notas do administrador
    table.text('system_notes'); // Notas automáticas do sistema
    
    // Status antes e depois
    table.string('previous_status');
    table.string('new_status');
    
    // Auditoria
    table.integer('performed_by').unsigned().references('id').inTable('users').onDelete('SET NULL');
    table.string('performed_by_role'); // 'admin', 'partner', 'system'
    table.string('ip_address');
    table.string('user_agent');
    
    // Metadata
    table.json('metadata'); // Dados adicionais em JSON
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Índices
    table.index(['subscription_id']);
    table.index(['partner_id']);
    table.index(['action']);
    table.index(['payment_id']);
    table.index(['created_at']);
    table.index(['performed_by']);
    
    // Índice composto para histórico de um parceiro
    table.index(['partner_id', 'created_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('subscription_history');
};
