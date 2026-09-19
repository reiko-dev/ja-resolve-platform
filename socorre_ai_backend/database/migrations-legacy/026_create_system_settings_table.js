exports.up = function(knex) {
  return knex.schema.createTable('system_settings', function(table) {
    table.increments('id').primary();
    
    // Configuração
    table.string('setting_key', 100).notNullable().unique();
    table.text('setting_value');
    table.string('data_type').defaultTo('string'); // 'string', 'number', 'boolean', 'json'
    table.text('description');
    
    // Categoria para organização admin
    table.enum('category', [
      'general', 
      'guincho', 
      'assinatura', 
      'delivery', 
      'pagamentos', 
      'notificacoes',
      'mapa'
    ]).defaultTo('general');
    
    // Controle de acesso
    table.boolean('is_public').defaultTo(false); // Se apps podem ver
    table.boolean('is_editable').defaultTo(true); // Se pode ser editado no admin
    table.string('validation_rules'); // JSON com regras de validação
    
    // Valores padrão e limites
    table.text('default_value');
    table.text('min_value');
    table.text('max_value');
    
    // Auditoria
    table.integer('updated_by').unsigned().references('id').inTable('users').onDelete('SET NULL');
    table.string('updated_by_role'); // 'admin', 'system'
    
    table.timestamps(true, true);
    
    // Índices
    table.index(['setting_key']);
    table.index(['category']);
    table.index(['is_public']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('system_settings');
};
