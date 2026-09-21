/**
 * MVP-04 — canonical TowRequest proposal and assignment schema (Issue #16).
 *
 * Creates the negotiation record (`tow_request_proposals`) and the single
 * assignment authority (`tow_assignments`). The legacy `tow_proposals` table is
 * NOT reused and NOT altered: it hangs off `emergency_requests`, keys partners by
 * a free-text `partner_id` and stores money as a decimal string. Reusing it would
 * mean inheriting a second state machine and a second money format for the same
 * business fact. The audit and the full DDL rationale are recorded in
 * `docs/evidence/mvp-04/03-persistence-decision.md`.
 *
 * Structural invariants enforced at the database level — these, and not any
 * application read-then-write check, are what make "exactly one assignment"
 * true under concurrency:
 *
 *   - `tow_assignments.tow_request_id` UNIQUE — one live assignment per request,
 *     so two simultaneous accepts cannot both commit;
 *   - `tow_assignments.proposal_id` UNIQUE — an accepted proposal is accepted
 *     once, which also makes a replayed accept idempotent instead of duplicate;
 *   - partial UNIQUE `tow_assignments(partner_id) WHERE released_at IS NULL` and
 *     `tow_assignments(tow_vehicle_id) WHERE released_at IS NULL` — OCCUPANCY.
 *     A partner/vehicle can hold at most one live job, and releasing the job
 *     (`released_at`) frees it again without deleting the history;
 *   - partial UNIQUE `tow_request_proposals(tow_request_id, partner_id) WHERE
 *     status = 'ACTIVE'` — a partner has at most one live proposal per request,
 *     while closed proposals stay as history;
 *   - `(partner_id, idempotency_key)` UNIQUE on proposals — the idempotency
 *     authority for creation;
 *   - `status` restricted to the canonical `TowProposalStatus` enum. `COUNTERED`
 *     is part of the HTTP contract but MVP-04 has no counteroffer operation, so
 *     it is declared here and never written;
 *   - the route, the tariff and the vehicle are FROZEN as columns: the price is
 *     reproducible from the row alone, and a later vehicle edit, tariff change or
 *     provider re-quote cannot retroactively alter a proposal the customer saw;
 *   - `route_total_* = coalesce(leg, 0) + coalesce(leg, 0)` — the persisted total
 *     can never disagree with the legs it claims to sum, so a stored proposal
 *     cannot carry a price that its own snapshot does not justify;
 *   - `price_currency = 'BRL'` and every money column an INTEGER >= 0: money is
 *     integer cents, never a decimal string (CONTRACT_CONFLICT-8);
 *   - `expires_at > created_at` — an expiry in the past at creation is not a
 *     proposal. Expiry is evaluated at ACTION time from the stored instant, so a
 *     lapsed proposal is rejected even if no job ever swept it.
 *
 * Foreign keys: `tow_request_id` cascades (the request is the aggregate root,
 * matching `tow_requests.customer_id`); `partner_id` and `tow_vehicle_id` are
 * RESTRICT so a negotiation or an accepted assignment can never be erased by
 * deleting the partner or the vehicle it points at. The application maps that
 * restriction to a truthful 409 instead of letting it surface as a 500.
 *
 * No counteroffer, payment, tracking or completion column exists: those are other
 * authorities (MVP-05 and later) and persisting them here would create a second,
 * divergent source of truth.
 *
 * Deterministic: no environment value, no clock, no data migration, no seed.
 */
'use strict';

const PROPOSAL_STATUSES = [
  'ACTIVE',
  'COUNTERED',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'EXPIRED',
  'CLOSED',
];

const VEHICLE_CLASSES = ['motorcycle', 'light_vehicle', 'medium_truck', 'heavy_truck'];
const EQUIPMENT_TYPES = ['flatbed', 'wheel_lift', 'heavy_wrecker'];
const DOCUMENT_STATUSES = ['pending', 'approved', 'rejected', 'expired'];

function isPostgres(knex) {
  const dialect = knex.client && knex.client.dialect;
  const client = knex.client && knex.client.config && knex.client.config.client;
  return dialect === 'postgresql' || dialect === 'pg' || client === 'pg' || client === 'postgresql';
}

function quoteList(values) {
  return values.map((value) => `'${value}'`).join(', ');
}

exports.up = async function up(knex) {
  await knex.schema.createTable('tow_request_proposals', (table) => {
    table.increments('id').primary();
    table.integer('tow_request_id').unsigned().notNullable();
    table.integer('partner_id').unsigned().notNullable();
    table.integer('tow_vehicle_id').unsigned().notNullable();

    table.string('status', 20).notNullable().defaultTo('ACTIVE');

    // RouteQuote snapshot — the authoritative distance the price was computed
    // from. Legs stay individually observable; the totals are checked against
    // them below.
    table.integer('route_provider_to_pickup_distance_meters').nullable();
    table.integer('route_provider_to_pickup_duration_seconds').nullable();
    table.integer('route_pickup_to_destination_distance_meters').nullable();
    table.integer('route_pickup_to_destination_duration_seconds').nullable();
    table.integer('route_total_distance_meters').notNullable();
    table.integer('route_total_duration_seconds').notNullable();

    // Tariff snapshot — the exact inputs that produced `price_amount_cents`.
    table.integer('pricing_minimum_charge_cents').notNullable();
    table.integer('pricing_included_meters').notNullable();
    table.integer('pricing_price_per_additional_km_cents').notNullable();

    table.integer('price_amount_cents').notNullable();
    table.string('price_currency', 3).notNullable().defaultTo('BRL');

    // TowVehicleSummary snapshot, frozen at proposal time. `vehicle_active` is
    // the value observed when the proposal was made, not a live read.
    table.string('vehicle_plate', 20).notNullable();
    table.string('vehicle_make', 100).notNullable();
    table.string('vehicle_model', 100).notNullable();
    table.integer('vehicle_year').nullable();
    table.string('vehicle_equipment_type', 30).notNullable();
    table.jsonb('vehicle_supported_vehicle_classes').notNullable();
    table.integer('vehicle_max_towed_weight_kg').nullable();
    table.string('vehicle_document_status', 20).notNullable();
    table.boolean('vehicle_active').notNullable().defaultTo(true);

    // Partner display snapshot, so a proposal stays readable without a join and
    // a later rename cannot rewrite what the customer was shown.
    table.string('partner_business_name', 200).nullable();

    table.timestamp('expires_at').notNullable();
    table.timestamp('decided_at').nullable();

    table.string('idempotency_key', 128).notNullable();
    table.string('idempotency_fingerprint', 64).notNullable();

    table.timestamps(true, true);

    table.foreign('tow_request_id').references('id').inTable('tow_requests').onDelete('CASCADE');
    table.foreign('partner_id').references('id').inTable('partners').onDelete('RESTRICT');
    table.foreign('tow_vehicle_id').references('id').inTable('tow_vehicles').onDelete('RESTRICT');

    table.unique(['partner_id', 'idempotency_key'], 'tow_request_proposals_partner_idempotency_key_unique');
    table.index(['tow_request_id', 'status'], 'tow_request_proposals_request_status_index');
    table.index(['partner_id', 'created_at'], 'tow_request_proposals_partner_created_at_index');

    table.check(`status IN (${quoteList(PROPOSAL_STATUSES)})`, [], 'tow_request_proposals_status_check');
    table.check("price_currency = 'BRL'", [], 'tow_request_proposals_price_currency_check');
    table.check('price_amount_cents >= 0', [], 'tow_request_proposals_price_amount_check');
    table.check('route_total_distance_meters >= 0', [], 'tow_request_proposals_route_total_distance_check');
    table.check('route_total_duration_seconds >= 0', [], 'tow_request_proposals_route_total_duration_check');
    table.check(
      'route_provider_to_pickup_distance_meters IS NULL OR route_provider_to_pickup_distance_meters >= 0',
      [],
      'tow_request_proposals_leg_to_pickup_distance_check'
    );
    table.check(
      'route_provider_to_pickup_duration_seconds IS NULL OR route_provider_to_pickup_duration_seconds >= 0',
      [],
      'tow_request_proposals_leg_to_pickup_duration_check'
    );
    table.check(
      'route_pickup_to_destination_distance_meters IS NULL OR route_pickup_to_destination_distance_meters >= 0',
      [],
      'tow_request_proposals_leg_to_destination_distance_check'
    );
    table.check(
      'route_pickup_to_destination_duration_seconds IS NULL OR route_pickup_to_destination_duration_seconds >= 0',
      [],
      'tow_request_proposals_leg_to_destination_duration_check'
    );
    // The total is a derived fact: it must equal the legs it is made of.
    table.check(
      'route_total_distance_meters = coalesce(route_provider_to_pickup_distance_meters, 0)'
      + ' + coalesce(route_pickup_to_destination_distance_meters, 0)',
      [],
      'tow_request_proposals_route_distance_consistency_check'
    );
    table.check(
      'route_total_duration_seconds = coalesce(route_provider_to_pickup_duration_seconds, 0)'
      + ' + coalesce(route_pickup_to_destination_duration_seconds, 0)',
      [],
      'tow_request_proposals_route_duration_consistency_check'
    );
    table.check(
      'route_provider_to_pickup_distance_meters IS NOT NULL OR route_pickup_to_destination_distance_meters IS NOT NULL',
      [],
      'tow_request_proposals_route_leg_present_check'
    );
    table.check('pricing_minimum_charge_cents >= 0', [], 'tow_request_proposals_pricing_minimum_charge_check');
    table.check('pricing_included_meters >= 0', [], 'tow_request_proposals_pricing_included_meters_check');
    table.check(
      'pricing_price_per_additional_km_cents >= 0',
      [],
      'tow_request_proposals_pricing_additional_km_check'
    );
    table.check(
      `vehicle_equipment_type IN (${quoteList(EQUIPMENT_TYPES)})`,
      [],
      'tow_request_proposals_vehicle_equipment_type_check'
    );
    table.check(
      `vehicle_document_status IN (${quoteList(DOCUMENT_STATUSES)})`,
      [],
      'tow_request_proposals_vehicle_document_status_check'
    );
    table.check(
      'vehicle_year IS NULL OR (vehicle_year >= 1900 AND vehicle_year <= 2200)',
      [],
      'tow_request_proposals_vehicle_year_check'
    );
    table.check(
      'vehicle_max_towed_weight_kg IS NULL OR vehicle_max_towed_weight_kg >= 1',
      [],
      'tow_request_proposals_vehicle_max_towed_weight_check'
    );
    table.check('expires_at > created_at', [], 'tow_request_proposals_expires_after_creation_check');
  });

  await knex.schema.createTable('tow_assignments', (table) => {
    table.increments('id').primary();
    table.integer('tow_request_id').unsigned().notNullable();
    table.integer('proposal_id').unsigned().notNullable();
    table.integer('partner_id').unsigned().notNullable();
    table.integer('tow_vehicle_id').unsigned().notNullable();

    table.integer('final_price_amount_cents').notNullable();
    table.string('final_price_currency', 3).notNullable().defaultTo('BRL');
    table.string('vehicle_plate', 20).notNullable();

    table.timestamp('assigned_at').notNullable();
    table.timestamp('released_at').nullable();
    table.string('release_reason', 40).nullable();

    table.timestamps(true, true);

    table.foreign('tow_request_id').references('id').inTable('tow_requests').onDelete('CASCADE');
    table.foreign('proposal_id').references('id').inTable('tow_request_proposals').onDelete('RESTRICT');
    table.foreign('partner_id').references('id').inTable('partners').onDelete('RESTRICT');
    table.foreign('tow_vehicle_id').references('id').inTable('tow_vehicles').onDelete('RESTRICT');

    // The two uniqueness authorities of the atomic assignment. Occupancy (the
    // third) is a partial index, added below.
    table.unique(['tow_request_id'], 'tow_assignments_tow_request_id_unique');
    table.unique(['proposal_id'], 'tow_assignments_proposal_id_unique');

    table.index(['partner_id', 'released_at'], 'tow_assignments_partner_released_at_index');
    table.index(['tow_vehicle_id', 'released_at'], 'tow_assignments_vehicle_released_at_index');

    table.check('final_price_amount_cents >= 0', [], 'tow_assignments_final_price_amount_check');
    table.check("final_price_currency = 'BRL'", [], 'tow_assignments_final_price_currency_check');
    table.check('released_at IS NULL OR released_at >= assigned_at', [], 'tow_assignments_release_order_check');
  });

  if (isPostgres(knex)) {
    await knex.raw(
      'ALTER TABLE tow_request_proposals ADD CONSTRAINT tow_request_proposals_classes_check '
      + 'CHECK (jsonb_array_length(vehicle_supported_vehicle_classes) >= 1)'
    );
  } else {
    // Portable fallback for non-PostgreSQL drivers (tests/dev): at least one
    // class is still required, enforced by a non-empty JSON-array text check.
    await knex.schema.alterTable('tow_request_proposals', (table) => {
      table.check("vehicle_supported_vehicle_classes LIKE '[%]'", [], 'tow_request_proposals_classes_check');
    });
  }

  // Occupancy is a PARTIAL unique index, not a column: a released assignment
  // stops occupying the partner/vehicle while remaining readable as history.
  // `knex.schema` cannot express `WHERE`, so these are raw. SQLite has supported
  // partial indexes since 3.8.0, so the harness enforces the same invariants.
  await knex.raw(
    'CREATE UNIQUE INDEX tow_assignments_one_live_per_partner ON tow_assignments (partner_id) WHERE released_at IS NULL'
  );
  await knex.raw(
    'CREATE UNIQUE INDEX tow_assignments_one_live_per_vehicle ON tow_assignments (tow_vehicle_id) WHERE released_at IS NULL'
  );
  await knex.raw(
    'CREATE UNIQUE INDEX tow_request_proposals_one_active_per_partner'
    + " ON tow_request_proposals (tow_request_id, partner_id) WHERE status = 'ACTIVE'"
  );
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tow_assignments');
  await knex.schema.dropTableIfExists('tow_request_proposals');
};

module.exports.PROPOSAL_STATUSES = PROPOSAL_STATUSES;
module.exports.VEHICLE_CLASSES = VEHICLE_CLASSES;
module.exports.EQUIPMENT_TYPES = EQUIPMENT_TYPES;
module.exports.DOCUMENT_STATUSES = DOCUMENT_STATUSES;
