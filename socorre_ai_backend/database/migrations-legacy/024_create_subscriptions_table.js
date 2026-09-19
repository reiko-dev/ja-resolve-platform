exports.up = function(knex) {
  return knex.schema.createTable('subscriptions', function(table) {
    table.increments('id').primary();
    table.integer('partner_id').unsigned().references('id').inTable('partners').onDelete('CASCADE');
    
    // Tipo de assinatura
    table.enum('type', ['mecanico', 'posto_combustivel', 'auto_pecas']).notNullable();
    
    // Valores e datas
    table.decimal('monthly_fee', 10, 2).notNullable();
    table.date('due_date').notNullable();
    table.date('next_billing_date').notNullable();
    
    // Status da assinatura
    table.enum('status', ['active', 'expired', 'cancelled', 'pending_payment', 'suspended'])
      .defaultTo('pending_payment');
    
    // Método de pagamento
    table.string('payment_method'); // 'credit_card', 'pix', 'bank_slip'
    table.string('payment_gateway'); // 'stripe', 'mercadopago', 'pagseguro'
    table.string('gateway_subscription_id'); // ID da assinatura no gateway
    
    // Configurações
    table.boolean('auto_renew').defaultTo(true);
    table.json('billing_address'); // Endereço de cobrança
    table.text('notes'); // Observações
    
    // Controle de tentativas
    table.integer('failed_attempts').defaultTo(0);
    table.timestamp('last_payment_attempt').nullable();
    table.timestamp('last_successful_payment').nullable();
    
    table.timestamps(true, true);
    
    // Índices
    table.index(['partner_id']);
    table.index(['type']);
    table.index(['status']);
    table.index(['due_date']);
    table.index(['next_billing_date']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('subscriptions');
};
