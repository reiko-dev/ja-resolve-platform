exports.up = function(knex) {
  return knex.schema.createTable('partner_documents', function(table) {
    table.increments('id').primary();
    table.integer('partner_id').unsigned().notNullable();
    table.string('document_type').notNullable(); // 'rg_cpf', 'cnh', 'crlv', 'residence_proof', 'certification'
    table.string('filename').notNullable();
    table.string('original_name').notNullable();
    table.string('file_path').notNullable();
    table.string('mime_type').notNullable();
    table.integer('file_size').notNullable();
    table.string('status').defaultTo('pending'); // 'pending', 'approved', 'rejected'
    table.text('rejection_reason').nullable();
    table.json('verification_metadata').nullable(); // Metadados da verificação
    table.timestamp('uploaded_at').defaultTo(knex.fn.now());
    table.timestamp('verified_at').nullable();
    table.integer('verified_by').unsigned().nullable(); // ID do admin que verificou
    table.timestamps(true, true);

    table.foreign('partner_id').references('id').inTable('partners').onDelete('CASCADE');
    table.foreign('verified_by').references('id').inTable('users').onDelete('SET NULL');

    table.index(['partner_id', 'document_type']);
    table.index(['status']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('partner_documents');
};
