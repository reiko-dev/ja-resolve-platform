exports.up = async function(knex) {
  await knex.schema.alterTable('reviews', function(table) {
    table.string('entity_type', 50).nullable();
    table.integer('entity_id').unsigned().nullable();
    table.index(['entity_type', 'entity_id']);
  });

  await knex.raw(`
    UPDATE reviews
    SET entity_type = 'appointment',
        entity_id = appointment_id
    WHERE appointment_id IS NOT NULL
      AND entity_type IS NULL
      AND entity_id IS NULL
  `);

  await knex.raw(`
    ALTER TABLE reviews
    DROP CONSTRAINT IF EXISTS reviews_user_id_mechanic_id_unique
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS reviews_user_entity_unique
    ON reviews (user_id, entity_type, entity_id)
    WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL
  `);
};

exports.down = async function(knex) {
  await knex.raw('DROP INDEX IF EXISTS reviews_user_entity_unique');

  await knex.schema.alterTable('reviews', function(table) {
    table.dropIndex(['entity_type', 'entity_id']);
    table.dropColumn('entity_id');
    table.dropColumn('entity_type');
  });

  await knex.raw(`
    ALTER TABLE reviews
    ADD CONSTRAINT reviews_user_id_mechanic_id_unique UNIQUE (user_id, mechanic_id)
  `);
};
