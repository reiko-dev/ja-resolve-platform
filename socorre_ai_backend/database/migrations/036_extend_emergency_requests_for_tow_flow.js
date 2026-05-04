exports.up = async function(knex) {
  const hasRequestType = await knex.schema.hasColumn('emergency_requests', 'request_type');
  if (!hasRequestType) {
    await knex.schema.alterTable('emergency_requests', function(table) {
      table.text('request_type');
      table.text('proposal_status');
      table.timestamp('proposal_selection_deadline');
      table.integer('max_proposals').defaultTo(0);
      table.integer('proposals_received').defaultTo(0);
      table.timestamp('first_proposal_at');
      table.timestamp('last_proposal_at');
      table.decimal('search_radius_km', 8, 2);
      table.integer('selected_proposal_id').unsigned().references('id').inTable('tow_proposals').onDelete('SET NULL');
      table.text('cancellation_reason');
      table.text('cancellation_by');
      table.timestamp('cancelled_at');
      table.text('vehicle_origin_address');
      table.decimal('vehicle_origin_latitude', 10, 8);
      table.decimal('vehicle_origin_longitude', 11, 8);
      table.text('vehicle_destination_address');
      table.decimal('vehicle_destination_latitude', 10, 8);
      table.decimal('vehicle_destination_longitude', 11, 8);
      table.string('vehicle_type');
      table.text('vehicle_notes');
    });

    await knex('emergency_requests')
      .whereNull('request_type')
      .update({
        request_type: 'mechanic',
        proposals_received: 0,
      });
  }
};

exports.down = async function(knex) {
  const hasRequestType = await knex.schema.hasColumn('emergency_requests', 'request_type');
  if (!hasRequestType) {
    return;
  }

  await knex.schema.alterTable('emergency_requests', function(table) {
    table.dropColumn('vehicle_notes');
    table.dropColumn('vehicle_type');
    table.dropColumn('vehicle_destination_longitude');
    table.dropColumn('vehicle_destination_latitude');
    table.dropColumn('vehicle_destination_address');
    table.dropColumn('vehicle_origin_longitude');
    table.dropColumn('vehicle_origin_latitude');
    table.dropColumn('vehicle_origin_address');
    table.dropColumn('cancelled_at');
    table.dropColumn('cancellation_by');
    table.dropColumn('cancellation_reason');
    table.dropColumn('selected_proposal_id');
    table.dropColumn('search_radius_km');
    table.dropColumn('last_proposal_at');
    table.dropColumn('first_proposal_at');
    table.dropColumn('proposals_received');
    table.dropColumn('max_proposals');
    table.dropColumn('proposal_selection_deadline');
    table.dropColumn('proposal_status');
    table.dropColumn('request_type');
  });
};
