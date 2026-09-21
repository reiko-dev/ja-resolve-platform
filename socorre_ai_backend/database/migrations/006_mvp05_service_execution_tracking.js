/**
 * MVP-05 — service execution, live tracking and basic cancellation (Issue #17).
 *
 * Adds the two persisted authorities this delivery needs and nothing else:
 *
 *   1. five milestone instants plus the cancellation attribution on
 *      `tow_requests` — the SAME aggregate that already owns `state`, so a
 *      transition and the instant it happened can never disagree or live in two
 *      places;
 *   2. `tow_request_tracking` — exactly ONE current position per request.
 *
 * Why milestones live on `tow_requests` and not in a transitions table: the
 * contract exposes no milestone field and no tracking history, so a second table
 * would create a second source of truth for "when did this request arrive" with
 * no consumer. `state` + the milestone columns are written in the same guarded
 * UPDATE, which is what makes the pair atomic.
 *
 * Why `tow_request_tracking` is not the legacy `real_time_tracking` table: that
 * legacy table hangs off `emergency_requests`, keeps a `location_history` trail
 * and carries `estimated_arrival_minutes`, `estimated_distance_km`, `route_info`
 * and `update_interval_seconds`. MVP-05 owns none of that — no trail, no ETA, no
 * routing, no geofencing, no push. It stores the latest point only, which is why
 * `tow_request_id` is UNIQUE: the schema itself makes a second current position
 * impossible.
 *
 * Invariants enforced at the database level (PostgreSQL, the production
 * dialect):
 *
 *   - milestone ordering — `arrived_at` cannot exist without `en_route_at`, and
 *     each instant cannot precede the one before it. A row cannot claim to have
 *     arrived before it departed;
 *   - terminal coherence — `completed_at` exists if and only if the state is
 *     `COMPLETED`, and `cancelled_at` if and only if the state is `CANCELLED`.
 *     A terminal state without its instant (or an instant without its state) is
 *     rejected by the database, not only by the service;
 *   - cancellation attribution — `cancelled_by_actor_type` is `customer` or
 *     `partner`, and type/id are present together or absent together. A cancelled
 *     request that cannot name who cancelled it is not accepted;
 *   - `cancellation_reason` is bounded to the contract maximum (2000).
 *
 * `cancelled_by_actor_id` deliberately carries NO foreign key: it is a
 * polymorphic reference (a `users.id` for a customer, a `partners.id` for a
 * partner) and the actor type column is what disambiguates it. A foreign key to
 * either table would be a lie.
 *
 * SQLite cannot add CHECK constraints to an existing table, so the milestone and
 * terminal coherence checks are added on PostgreSQL only; the offline harness
 * mirrors every one of them inside its `CREATE TABLE` DDL
 * (`tests/helpers/testDb.js`), so the same invariants are exercised offline.
 *
 * Deterministic: no environment value, no clock, no data migration, no seed, no
 * backfill. Existing rows keep NULL milestones, which is truthful — nothing is
 * invented for work that happened before this delivery.
 */
'use strict';

const CANCELLATION_ACTOR_TYPES = ['customer', 'partner'];

function isPostgres(knex) {
  const dialect = knex.client && knex.client.dialect;
  const client = knex.client && knex.client.config && knex.client.config.client;
  return dialect === 'postgresql' || dialect === 'pg' || client === 'pg' || client === 'postgresql';
}

function quoteList(values) {
  return values.map((value) => `'${value}'`).join(', ');
}

/**
 * The named CHECK constraints this migration installs on `tow_requests`, in
 * creation order. `up()` and `down()` read the SAME list so the rollback can
 * never drift from what was created.
 *
 * They must be dropped BY NAME in `down()`: dropping a column removes the
 * constraints that reference it, but
 * `tow_requests_terminal_reason_state_check` only references `state` and
 * `terminal_reason`, which outlive this migration. Leaving it behind made
 * re-applying 006 collide with a leftover constraint — caught by the PostgreSQL
 * gate (E5), not by review.
 */
const REQUEST_CHECK_CONSTRAINTS = [
  ['tow_requests_arrived_after_en_route_check',
    'arrived_at IS NULL OR (en_route_at IS NOT NULL AND arrived_at >= en_route_at)'],
  ['tow_requests_in_transit_after_arrived_check',
    'in_transit_at IS NULL OR (arrived_at IS NOT NULL AND in_transit_at >= arrived_at)'],
  ['tow_requests_completed_after_in_transit_check',
    'completed_at IS NULL OR (in_transit_at IS NOT NULL AND completed_at >= in_transit_at)'],
  ['tow_requests_cancelled_after_en_route_check',
    'cancelled_at IS NULL OR en_route_at IS NULL OR cancelled_at >= en_route_at'],
  ['tow_requests_completed_state_check',
    "(state = 'COMPLETED') = (completed_at IS NOT NULL)"],
  ['tow_requests_cancelled_state_check',
    "(state = 'CANCELLED') = (cancelled_at IS NOT NULL)"],
  ['tow_requests_cancellation_actor_type_check',
    `cancelled_by_actor_type IS NULL OR cancelled_by_actor_type IN (${quoteList(CANCELLATION_ACTOR_TYPES)})`],
  ['tow_requests_cancellation_actor_pair_check',
    '(cancelled_by_actor_type IS NULL) = (cancelled_by_actor_id IS NULL)'],
  ['tow_requests_cancellation_attribution_check',
    'cancelled_at IS NOT NULL OR (cancelled_by_actor_type IS NULL AND cancelled_by_actor_id IS NULL)'],
  ['tow_requests_cancellation_reason_length_check',
    'cancellation_reason IS NULL OR length(cancellation_reason) <= 2000'],
  ['tow_requests_terminal_reason_state_check',
    "terminal_reason IS NULL OR state IN ('CANCELLED', 'COMPLETED')"],
];

exports.up = async function up(knex) {
  await knex.schema.alterTable('tow_requests', (table) => {
    table.timestamp('en_route_at').nullable();
    table.timestamp('arrived_at').nullable();
    table.timestamp('in_transit_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('cancelled_at').nullable();
    table.string('cancelled_by_actor_type', 20).nullable();
    table.integer('cancelled_by_actor_id').unsigned().nullable();
    table.text('cancellation_reason').nullable();
  });

  if (isPostgres(knex)) {
    for (const [name, condition] of REQUEST_CHECK_CONSTRAINTS) {
      // eslint-disable-next-line no-await-in-loop
      await knex.raw(`ALTER TABLE tow_requests ADD CONSTRAINT ${name} CHECK (${condition})`);
    }
  }

  await knex.schema.createTable('tow_request_tracking', (table) => {
    table.increments('id').primary();
    table.integer('tow_request_id').unsigned().notNullable();
    table.integer('partner_id').unsigned().notNullable();

    // `observed_at` is the CLIENT instant (`recorded_at` in the contract);
    // `received_at` is the BACKEND instant the point was accepted. Keeping both
    // is what makes the stale-point rule decidable without trusting the server
    // clock for the client's own observation.
    table.decimal('latitude', 10, 8).notNullable();
    table.decimal('longitude', 11, 8).notNullable();
    table.timestamp('observed_at').notNullable();
    table.timestamp('received_at').notNullable();

    table.timestamps(true, true);

    table.foreign('tow_request_id').references('id').inTable('tow_requests').onDelete('CASCADE');
    table.foreign('partner_id').references('id').inTable('partners').onDelete('RESTRICT');

    // ONE current position per request: no history, no trail.
    table.unique(['tow_request_id'], 'tow_request_tracking_tow_request_id_unique');

    table.check('latitude >= -90 AND latitude <= 90', [], 'tow_request_tracking_latitude_check');
    table.check('longitude >= -180 AND longitude <= 180', [], 'tow_request_tracking_longitude_check');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tow_request_tracking');

  if (isPostgres(knex)) {
    // Reverse order, and only the constraints this migration created.
    for (const [name] of [...REQUEST_CHECK_CONSTRAINTS].reverse()) {
      // eslint-disable-next-line no-await-in-loop
      await knex.raw(`ALTER TABLE tow_requests DROP CONSTRAINT IF EXISTS ${name}`);
    }
  }

  await knex.schema.alterTable('tow_requests', (table) => {
    table.dropColumn('en_route_at');
    table.dropColumn('arrived_at');
    table.dropColumn('in_transit_at');
    table.dropColumn('completed_at');
    table.dropColumn('cancelled_at');
    table.dropColumn('cancelled_by_actor_type');
    table.dropColumn('cancelled_by_actor_id');
    table.dropColumn('cancellation_reason');
  });
};

module.exports.CANCELLATION_ACTOR_TYPES = CANCELLATION_ACTOR_TYPES;
module.exports.REQUEST_CHECK_CONSTRAINTS = REQUEST_CHECK_CONSTRAINTS;
