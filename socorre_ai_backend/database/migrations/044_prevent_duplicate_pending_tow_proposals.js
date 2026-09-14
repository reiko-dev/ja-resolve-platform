exports.up = async function up(knex) {
  const duplicates = await knex('tow_proposals')
    .select('emergency_request_id', 'partner_id')
    .where('status', 'pending')
    .groupBy('emergency_request_id', 'partner_id')
    .havingRaw('COUNT(*) > 1');
  if (duplicates.length) {
    throw new Error(
      `Cannot create pending tow proposal uniqueness index: ${duplicates.length} duplicate group(s) require reconciliation`
    );
  }
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS tow_proposals_one_pending_per_partner
    ON tow_proposals (emergency_request_id, partner_id)
    WHERE status = 'pending'
  `);
};

exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS tow_proposals_one_pending_per_partner');
};
