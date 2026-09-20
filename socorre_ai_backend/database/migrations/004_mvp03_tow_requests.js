/**
 * MVP-03 — canonical TowRequest schema (Issue #15).
 *
 * Creates the single tow request authority. The legacy `emergency_requests`
 * subsystem is NOT reused and NOT altered: it stores tow work as
 * `type: 'other'` + `request_type: 'tow'` with unconstrained text columns, so it
 * cannot enforce the canonical state machine, the frozen radius or the
 * idempotency contract. The decision and the full column audit are recorded in
 * `docs/evidence/mvp-03/03-persistence-decision.md`.
 *
 * Structural invariants enforced at the database level:
 *   - `(customer_id, idempotency_key)` UNIQUE — the atomicity authority of the
 *     idempotent creation. A read-then-write check would race; the constraint
 *     cannot;
 *   - `state` restricted to the canonical enum and defaulted to `SEARCHING`,
 *     which is the only state MVP-03 can produce;
 *   - `terminal_reason` restricted to the canonical enum (NULL while open);
 *   - coordinates `numeric(10,8)` / `numeric(11,8)` NOT NULL with range CHECKs —
 *     WGS84 precision without PostGIS and without a geometry extension;
 *   - `matching_radius_km > 0` NOT NULL — the radius is FROZEN per request, so a
 *     later settings change can never re-scope an existing search;
 *   - `vehicle_class` restricted to the canonical vocabulary; `vehicle_year` and
 *     `vehicle_weight_kg` bounded;
 *   - `customer_id` FK to `users` with CASCADE (a deleted customer leaves no
 *     orphan request).
 *
 * No pricing, route, assignment or payment column exists: those are other
 * authorities (MVP-02 RouteProvider quote, later MVP deliveries) and persisting
 * them here would create a second, divergent source of truth.
 *
 * Deterministic: no environment value, no clock, no data migration, no seed.
 */
'use strict';

const STATES = [
  'SEARCHING',
  'NEGOTIATING',
  'ASSIGNED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_TRANSIT',
  'COMPLETION_PENDING',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTED',
];

const TERMINAL_REASONS = [
  'NO_PROVIDER_AVAILABLE',
  'SERVICE_DISABLED',
  'CUSTOMER_CANCELLED',
  'PARTNER_CANCELLED',
  'CUSTOMER_NO_SHOW',
  'PARTNER_NO_SHOW',
  'ADMIN_OVERRIDE',
];

const VEHICLE_CLASSES = ['motorcycle', 'light_vehicle', 'medium_truck', 'heavy_truck'];

function quoteList(values) {
  return values.map((value) => `'${value}'`).join(', ');
}

exports.up = async function up(knex) {
  await knex.schema.createTable('tow_requests', (table) => {
    table.increments('id').primary();
    table.integer('customer_id').unsigned().notNullable();
    table.string('state', 30).notNullable().defaultTo('SEARCHING');
    table.string('terminal_reason', 40).nullable();

    table.decimal('pickup_latitude', 10, 8).notNullable();
    table.decimal('pickup_longitude', 11, 8).notNullable();
    table.string('pickup_formatted_address', 500).nullable();
    table.decimal('destination_latitude', 10, 8).notNullable();
    table.decimal('destination_longitude', 11, 8).notNullable();
    table.string('destination_formatted_address', 500).nullable();

    table.string('vehicle_class', 30).notNullable();
    table.string('vehicle_make', 100).notNullable();
    table.string('vehicle_model', 100).notNullable();
    table.integer('vehicle_year').nullable();
    table.integer('vehicle_weight_kg').nullable();
    table.string('vehicle_plate', 10).nullable();

    table.text('problem_description').notNullable();
    table.text('observations').nullable();

    table.decimal('matching_radius_km', 8, 2).notNullable();

    table.string('idempotency_key', 128).notNullable();
    table.string('idempotency_fingerprint', 64).notNullable();

    table.timestamps(true, true);

    table.foreign('customer_id').references('id').inTable('users').onDelete('CASCADE');
    table.unique(['customer_id', 'idempotency_key'], 'tow_requests_customer_idempotency_key_unique');
    table.index(['customer_id', 'created_at'], 'tow_requests_customer_created_at_index');
    table.index(['state', 'created_at'], 'tow_requests_state_created_at_index');

    table.check(`state IN (${quoteList(STATES)})`, [], 'tow_requests_state_check');
    table.check(
      `terminal_reason IS NULL OR terminal_reason IN (${quoteList(TERMINAL_REASONS)})`,
      [],
      'tow_requests_terminal_reason_check'
    );
    table.check(
      `vehicle_class IN (${quoteList(VEHICLE_CLASSES)})`,
      [],
      'tow_requests_vehicle_class_check'
    );
    table.check('pickup_latitude >= -90 AND pickup_latitude <= 90', [], 'tow_requests_pickup_latitude_check');
    table.check('pickup_longitude >= -180 AND pickup_longitude <= 180', [], 'tow_requests_pickup_longitude_check');
    table.check(
      'destination_latitude >= -90 AND destination_latitude <= 90',
      [],
      'tow_requests_destination_latitude_check'
    );
    table.check(
      'destination_longitude >= -180 AND destination_longitude <= 180',
      [],
      'tow_requests_destination_longitude_check'
    );
    table.check('vehicle_year IS NULL OR (vehicle_year >= 1900 AND vehicle_year <= 2200)', [], 'tow_requests_vehicle_year_check');
    table.check('vehicle_weight_kg IS NULL OR vehicle_weight_kg >= 1', [], 'tow_requests_vehicle_weight_check');
    table.check('matching_radius_km > 0', [], 'tow_requests_matching_radius_check');
    table.check('length(problem_description) >= 1', [], 'tow_requests_problem_description_check');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tow_requests');
};

module.exports.STATES = STATES;
module.exports.TERMINAL_REASONS = TERMINAL_REASONS;
module.exports.VEHICLE_CLASSES = VEHICLE_CLASSES;
