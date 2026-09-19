exports.up = function(knex) {
  return knex.schema.createTable('revoked_tokens', function(table) {
    table.string('token_hash', 64).primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.timestamp('expires_at').notNullable();
    table.timestamps(true, true);
    table.index('expires_at');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('revoked_tokens');
};
