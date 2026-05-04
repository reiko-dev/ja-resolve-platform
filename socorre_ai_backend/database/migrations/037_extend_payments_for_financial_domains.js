exports.up = async function(knex) {
  const hasPaymentType = await knex.schema.hasColumn('payments', 'payment_type');

  if (!hasPaymentType) {
    await knex.schema.alterTable('payments', function(table) {
      table.text('payment_type').defaultTo('emergency_service');
      table.integer('subscription_id').unsigned().nullable().references('id').inTable('subscriptions').onDelete('SET NULL');
      table.integer('tow_proposal_id').unsigned().nullable().references('id').inTable('tow_proposals').onDelete('SET NULL');
      table.index(['payment_type']);
      table.index(['subscription_id']);
      table.index(['tow_proposal_id']);
    });

    await knex('payments')
      .whereNull('payment_type')
      .update({ payment_type: 'emergency_service' });
  }
};

exports.down = async function(knex) {
  const hasPaymentType = await knex.schema.hasColumn('payments', 'payment_type');
  if (!hasPaymentType) {
    return;
  }

  await knex.schema.alterTable('payments', function(table) {
    table.dropIndex(['tow_proposal_id']);
    table.dropIndex(['subscription_id']);
    table.dropIndex(['payment_type']);
    table.dropColumn('tow_proposal_id');
    table.dropColumn('subscription_id');
    table.dropColumn('payment_type');
  });
};
