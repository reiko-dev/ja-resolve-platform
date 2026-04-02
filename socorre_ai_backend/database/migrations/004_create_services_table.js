exports.up = function(knex) {
  return knex.schema.createTable('services', function(table) {
    table.increments('id').primary();
    table.integer('mechanic_id').unsigned().references('id').inTable('mechanics').onDelete('CASCADE');
    table.string('name').notNullable();
    table.text('description');
    table.decimal('price', 10, 2).notNullable();
    table.string('price_type').notNullable(); // 'fixed', 'hourly', 'variable'
    table.integer('estimated_duration'); // em minutos
    table.boolean('is_available').defaultTo(true);
    table.string('category').notNullable(); // 'engine', 'brakes', 'electrical', etc.
    table.string('subcategory');
    table.boolean('warranty_included').defaultTo(false);
    table.integer('warranty_days');
    table.timestamps(true, true);
    
    // Índices
    table.index(['mechanic_id']);
    table.index(['category']);
    table.index(['is_available']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('services');
};
