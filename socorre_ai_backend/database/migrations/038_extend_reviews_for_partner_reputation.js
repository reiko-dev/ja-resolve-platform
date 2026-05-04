exports.up = async function(knex) {
  await knex.schema.alterTable('reviews', function(table) {
    table.integer('partner_id').unsigned().nullable();
    table.index(['partner_id']);
    table.foreign('partner_id').references('id').inTable('partners').onDelete('SET NULL');
  });

  await knex.raw(`
    UPDATE reviews
    SET partner_id = partners.id
    FROM mechanics
    JOIN partners ON partners.user_id = mechanics.user_id
    WHERE reviews.mechanic_id = mechanics.id
      AND reviews.partner_id IS NULL
  `);
};

exports.down = async function(knex) {
  await knex.schema.alterTable('reviews', function(table) {
    table.dropForeign(['partner_id']);
    table.dropIndex(['partner_id']);
    table.dropColumn('partner_id');
  });
};
