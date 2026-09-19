exports.up = function(knex) {
  return knex.schema.createTable('chat_messages', function(table) {
    table.increments('id').primary();
    table.integer('sender_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.integer('receiver_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.integer('appointment_id').unsigned().references('id').inTable('appointments').onDelete('SET NULL');
    table.text('message').notNullable();
    table.string('message_type').defaultTo('text'); // 'text', 'image', 'file', 'location'
    table.text('file_url');
    table.string('file_name');
    table.string('file_size');
    table.boolean('is_read').defaultTo(false);
    table.datetime('read_at');
    table.timestamps(true, true);
    
    // Índices
    table.index(['sender_id', 'receiver_id']);
    table.index(['appointment_id']);
    table.index(['created_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('chat_messages');
};
