exports.up = function(knex) {
  return knex.schema.createTable('reviews', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.integer('mechanic_id').unsigned().references('id').inTable('mechanics').onDelete('CASCADE');
    table.integer('appointment_id').unsigned().references('id').inTable('appointments').onDelete('SET NULL');
    table.integer('rating').notNullable().unsigned(); // 1-5 estrelas
    table.text('comment');
    table.boolean('is_verified').defaultTo(false);
    table.boolean('is_public').defaultTo(true);
    table.timestamps(true, true);
    
    // Índices
    table.index(['mechanic_id']);
    table.index(['rating']);
    table.index(['created_at']);
    
    // Uma avaliação por usuário por mecânico
    table.unique(['user_id', 'mechanic_id']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('reviews');
};
