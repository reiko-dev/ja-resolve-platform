exports.up = async function(knex) {
  const hasApprovalStatus = await knex.schema.hasColumn('partners', 'approval_status');
  const hasApprovedAt = await knex.schema.hasColumn('partners', 'approved_at');
  const hasApprovedBy = await knex.schema.hasColumn('partners', 'approved_by');
  const hasRejectionReason = await knex.schema.hasColumn('partners', 'rejection_reason');

  await knex.schema.alterTable('partners', (table) => {
    if (!hasApprovalStatus) {
      table.string('approval_status').defaultTo('pending');
    }

    if (!hasApprovedAt) {
      table.timestamp('approved_at').nullable();
    }

    if (!hasApprovedBy) {
      table.integer('approved_by').unsigned().references('id').inTable('users').onDelete('SET NULL');
    }

    if (!hasRejectionReason) {
      table.text('rejection_reason').nullable();
    }
  });
};

exports.down = async function(knex) {
  const hasApprovalStatus = await knex.schema.hasColumn('partners', 'approval_status');
  const hasApprovedAt = await knex.schema.hasColumn('partners', 'approved_at');
  const hasApprovedBy = await knex.schema.hasColumn('partners', 'approved_by');
  const hasRejectionReason = await knex.schema.hasColumn('partners', 'rejection_reason');

  await knex.schema.alterTable('partners', (table) => {
    if (hasApprovalStatus) {
      table.dropColumn('approval_status');
    }

    if (hasApprovedAt) {
      table.dropColumn('approved_at');
    }

    if (hasApprovedBy) {
      table.dropColumn('approved_by');
    }

    if (hasRejectionReason) {
      table.dropColumn('rejection_reason');
    }
  });
};
