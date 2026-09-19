exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'onboarding_partner_type');

  if (!hasColumn) {
    await knex.schema.alterTable('users', function(table) {
      table.string('onboarding_partner_type', 50).nullable();
    });
  }
};

exports.down = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'onboarding_partner_type');

  if (hasColumn) {
    await knex.schema.alterTable('users', function(table) {
      table.dropColumn('onboarding_partner_type');
    });
  }
};
