exports.up = function(knex) {
  return knex.schema.createTable('wallets', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable().unique();
    table.integer('partner_id').unsigned().nullable().unique(); // Opcional, para parceiros
    
    // Saldo
    table.decimal('available_balance', 10, 2).defaultTo(0); // Saldo disponível para saque
    table.decimal('pending_balance', 10, 2).defaultTo(0); // Saldo pendente (aguardando confirmação)
    table.decimal('total_earned', 10, 2).defaultTo(0); // Total arrecadado historicamente
    table.decimal('total_withdrawn', 10, 2).defaultTo(0); // Total sacado
    
    // Configurações
    table.string('pix_key').nullable(); // Chave PIX para saque
    table.string('bank_name').nullable();
    table.string('bank_agency').nullable();
    table.string('bank_account').nullable();
    table.enum('account_type', ['checking', 'savings']).nullable();
    table.string('account_holder_name').nullable();
    table.string('account_holder_document').nullable();
    
    // Taxa de comissão personalizada (opcional)
    table.decimal('platform_commission_rate', 5, 2).defaultTo(25.00); // 25% padrão
    
    // Status
    table.boolean('is_active').defaultTo(true);
    table.boolean('withdrawal_enabled').defaultTo(false); // Habilitado após verificação
    
    // Timestamps
    table.timestamps(true, true);
    
    // Índices
    table.index(['user_id']);
    table.index(['partner_id']);
    table.index(['is_active']);
    
    // Foreign keys
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('partner_id').references('id').inTable('partners').onDelete('CASCADE');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('wallets');
};

