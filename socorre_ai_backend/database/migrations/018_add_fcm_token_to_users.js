exports.up = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.string('fcm_token').nullable();
    table.index(['fcm_token']);
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.dropIndex(['fcm_token']);
    table.dropColumn('fcm_token');
  });
};
