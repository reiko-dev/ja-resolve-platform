exports.up = async function(knex) {
  await knex.raw(`
    ALTER TABLE partners
    DROP CONSTRAINT IF EXISTS partners_type_check
  `);

  await knex.raw(`
    ALTER TABLE partners
    ADD CONSTRAINT partners_type_check
    CHECK (type IN ('mechanic', 'motoboy', 'store', 'gas_station', 'auto_parts', 'tow'))
  `);
};

exports.down = async function(knex) {
  await knex.raw(`
    ALTER TABLE partners
    DROP CONSTRAINT IF EXISTS partners_type_check
  `);

  await knex.raw(`
    ALTER TABLE partners
    ADD CONSTRAINT partners_type_check
    CHECK (type IN ('mechanic', 'motoboy', 'store'))
  `);
};
