exports.up = function(knex) {
  return knex.schema.createTable('appointments', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.integer('mechanic_id').unsigned().references('id').inTable('mechanics').onDelete('CASCADE');
    table.integer('service_id').unsigned().references('id').inTable('services').onDelete('SET NULL');
    table.datetime('scheduled_date').notNullable();
    table.string('status').notNullable().defaultTo('pending'); // 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'
    table.text('description');
    table.text('vehicle_info'); // JSON com informações do veículo
    table.string('location_type').notNullable(); // 'workshop', 'home', 'roadside'
    table.decimal('latitude', 10, 8);
    table.decimal('longitude', 11, 8);
    table.text('address');
    table.decimal('estimated_price', 10, 2);
    table.decimal('final_price', 10, 2);
    table.text('notes');
    table.datetime('completed_at');
    table.timestamps(true, true);
    
    // Índices
    table.index(['user_id']);
    table.index(['mechanic_id']);
    table.index(['scheduled_date']);
    table.index(['status']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('appointments');
};
