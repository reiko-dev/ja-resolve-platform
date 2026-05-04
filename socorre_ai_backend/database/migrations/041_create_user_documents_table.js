exports.up = function(knex) {
  return knex.schema.createTable('user_documents', function(table) {
    table.increments('id').primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('document_type').notNullable();
    table.string('filename').notNullable();
    table.string('original_name').notNullable();
    table.string('file_path').notNullable();
    table.string('mime_type').notNullable();
    table.integer('file_size').notNullable();
    table.enum('status', ['pending', 'approved', 'rejected']).notNullable().defaultTo('pending');
    table.text('rejection_reason').nullable();
    table.integer('verified_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('uploaded_at').defaultTo(knex.fn.now());
    table.timestamp('verified_at').nullable();
    table.timestamps(true, true);

    table.index(['user_id', 'document_type']);
    table.unique(['user_id', 'document_type']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('user_documents');
};
