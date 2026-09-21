/**
 * MVP-06 — canonical CASH payment for Tow (Issue #18).
 *
 * Adds exactly ONE table, `tow_payments`, and nothing else. It is the single
 * authority of "was the cash for this Tow received, by whom and when".
 *
 * Why a new table instead of the legacy `payments` table: the legacy table is
 * shared with four non-Tow domains, stores `decimal(10,2)` BRL floats, uses a
 * PSP status vocabulary (`pending/processing/completed/failed/...`) and has NO
 * foreign key to `tow_requests` or `tow_assignments`. Reusing it would make the
 * CASH flow inherit a gateway-shaped status model, a different money type and a
 * coupling the module does not want. (See `docs/evidence/mvp-06/01-current-state-delta.md`.)
 *
 * Why the amount is copied and not referenced: `tow_assignments` is the price
 * authority and the assignment row is NEVER deleted (it is released, not
 * removed), so the amount could be read through the FK. It is stored anyway
 * because a payment is an immutable historical receipt: re-reading a price
 * through a join would allow a future price edit on the assignment to silently
 * rewrite history. The amount is therefore frozen at the moment the payment row
 * is created, and it is always the value of
 * `tow_assignments.final_price_amount_cents` at that instant.
 *
 * Invariants enforced at the database level (PostgreSQL, the production dialect):
 *
 *   - ONE payment per request and ONE per assignment — `UNIQUE(tow_request_id)`
 *     and `UNIQUE(assignment_id)`. These are the real idempotency authority of
 *     the delivery: a concurrent double confirmation cannot insert a second row
 *     even if every application-level check were removed;
 *   - the method is pinned to `CASH`. MVP-06 implements no other method, so the
 *     column has a single legal value; CARD/PIX belong to Phase 2 (#33);
 *   - the currency is pinned to `BRL`;
 *   - the amount is a non-negative INTEGER (cents). No decimal money exists in
 *     the Tow module;
 *   - status/instant coherence — a `PENDING` row has neither `received_at` nor
 *     `received_by_partner_id`, and a `RECEIVED` row has BOTH. A payment that
 *     claims to be received without saying when, or by whom, is rejected by the
 *     database, not only by the service.
 *
 * `down()` drops the table. There is no data migration, no seed, no backfill
 * and no clock: a database created before this delivery has no payments, which
 * is truthful — nothing is invented for work that predates the feature.
 */
'use strict';

const PAYMENT_STATUSES = ['PENDING', 'RECEIVED'];

function quoteList(values) {
  return values.map((value) => `'${value}'`).join(', ');
}

exports.up = async function up(knex) {
  await knex.schema.createTable('tow_payments', (table) => {
    table.increments('id').primary();
    table.integer('tow_request_id').unsigned().notNullable();
    table.integer('assignment_id').unsigned().notNullable();
    table.string('method', 10).notNullable();
    table.integer('amount_cents').notNullable();
    table.string('currency', 3).notNullable().defaultTo('BRL');
    table.string('status', 20).notNullable().defaultTo('PENDING');
    table.timestamp('received_at').nullable();
    table.integer('received_by_partner_id').unsigned().nullable();
    table.timestamps(true, true);

    // A request owns one payment; an assignment owns one payment. Both
    // relationships are one-to-one in MVP-06, so both are UNIQUE. The
    // assignment FK cascades with the request cascade of `tow_assignments`
    // itself: deleting a request must never strand a payment row.
    table.unique('tow_request_id', 'tow_payments_tow_request_id_unique');
    table.unique('assignment_id', 'tow_payments_assignment_id_unique');
    table.foreign('tow_request_id').references('id').inTable('tow_requests').onDelete('CASCADE');
    table.foreign('assignment_id').references('id').inTable('tow_assignments').onDelete('CASCADE');
    table.foreign('received_by_partner_id').references('id').inTable('partners').onDelete('RESTRICT');

    table.check("method = 'CASH'", [], 'tow_payments_method_check');
    table.check('amount_cents >= 0', [], 'tow_payments_amount_check');
    table.check("currency = 'BRL'", [], 'tow_payments_currency_check');
    table.check(
      `status IN (${quoteList(PAYMENT_STATUSES)})`,
      [],
      'tow_payments_status_check'
    );
    table.check(
      "(status = 'PENDING' AND received_at IS NULL AND received_by_partner_id IS NULL)"
      + " OR (status = 'RECEIVED' AND received_at IS NOT NULL AND received_by_partner_id IS NOT NULL)",
      [],
      'tow_payments_receipt_coherence_check'
    );
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tow_payments');
};

module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
