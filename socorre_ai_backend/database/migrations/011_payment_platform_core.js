'use strict';

/**
 * Payment Platform — Phase 1 canonical persistence.
 *
 * This migration is deliberately additive. The legacy `payments` table remains
 * temporarily because current legacy wallet/dispute/subscription code references
 * it, but NO canonical Payment Platform code may write to it.
 *
 * Canonical entities:
 *   - payment_obligations: the business obligation to collect money;
 *   - payment_attempts: one concrete execution attempt against a payment rail.
 *
 * Provider events, refunds and settlement are intentionally deferred to their
 * implementation phases instead of creating speculative persistence now.
 */

const PAYMENT_STATUSES = Object.freeze([
  'PENDING',
  'PROCESSING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
]);

const PAYMENT_ATTEMPT_STATUSES = Object.freeze([
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
]);

const COMMERCE_TYPES = Object.freeze([
  'DIGITAL_GOOD',
  'DIGITAL_SUBSCRIPTION',
  'PHYSICAL_GOOD',
  'REAL_WORLD_SERVICE',
]);

const SALES_CHANNELS = Object.freeze(['IOS_APP', 'ANDROID_APP', 'WEB']);
const PAYMENT_METHODS = Object.freeze(['CASH', 'CARD', 'PIX', 'STORE_BILLING']);
const PAYMENT_PROCESSORS = Object.freeze([
  'INTERNAL_CASH',
  'STRIPE',
  'APPLE_APP_STORE',
  'GOOGLE_PLAY',
]);

function quoteList(values) {
  return values.map((value) => "'" + value + "'").join(', ');
}

exports.up = async function up(knex) {
  await knex.schema.createTable('payment_obligations', (table) => {
    table.bigIncrements('id').primary();

    table.string('business_key', 255).notNullable();
    table.string('context_type', 64).notNullable();
    table.string('context_id', 128).notNullable();
    table.string('payer_id', 128).notNullable();

    table.string('commerce_type', 40).notNullable();
    table.string('sales_channel', 24).notNullable();

    table.bigInteger('amount_cents').notNullable();
    table.string('currency', 3).notNullable().defaultTo('BRL');

    table.string('method', 32).notNullable();
    table.string('processor', 40).notNullable();
    table.string('status', 24).notNullable().defaultTo('PENDING');

    table.string('idempotency_key', 128).notNullable();
    table.string('idempotency_fingerprint', 64).notNullable();

    table.timestamp('paid_at').nullable();
    table.timestamp('cancelled_at').nullable();
    table.timestamp('expires_at').nullable();

    table.timestamps(true, true);

    table.unique(['business_key'], {
      indexName: 'payment_obligations_business_key_unique',
    });
    table.unique(['payer_id', 'idempotency_key'], {
      indexName: 'payment_obligations_payer_idempotency_unique',
    });

    table.index(['context_type', 'context_id'], 'payment_obligations_context_idx');
    table.index(['payer_id', 'created_at'], 'payment_obligations_payer_created_idx');
    table.index(['status', 'created_at'], 'payment_obligations_status_created_idx');

    table.check('amount_cents > 0', [], 'payment_obligations_amount_check');
    table.check(
      "length(currency) = 3 AND currency = upper(currency)",
      [],
      'payment_obligations_currency_check'
    );
    table.check(
      `commerce_type IN (${quoteList(COMMERCE_TYPES)})`,
      [],
      'payment_obligations_commerce_type_check'
    );
    table.check(
      `sales_channel IN (${quoteList(SALES_CHANNELS)})`,
      [],
      'payment_obligations_sales_channel_check'
    );
    table.check(
      `method IN (${quoteList(PAYMENT_METHODS)})`,
      [],
      'payment_obligations_method_check'
    );
    table.check(
      `processor IN (${quoteList(PAYMENT_PROCESSORS)})`,
      [],
      'payment_obligations_processor_check'
    );
    table.check(
      `status IN (${quoteList(PAYMENT_STATUSES)})`,
      [],
      'payment_obligations_status_check'
    );
    table.check(
      "(status = 'PAID' AND paid_at IS NOT NULL) OR (status <> 'PAID' AND paid_at IS NULL)",
      [],
      'payment_obligations_paid_at_check'
    );
    table.check(
      "(status = 'CANCELLED' AND cancelled_at IS NOT NULL)"
        + " OR (status <> 'CANCELLED' AND cancelled_at IS NULL)",
      [],
      'payment_obligations_cancelled_at_check'
    );
  });

  await knex.schema.createTable('payment_attempts', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('payment_id').notNullable();
    table.integer('attempt_number').notNullable();

    table.string('processor', 40).notNullable();
    table.string('status', 24).notNullable().defaultTo('PENDING');
    table.string('provider_idempotency_key', 255).notNullable();
    table.string('external_transaction_id', 255).nullable();

    table.string('failure_code', 120).nullable();
    table.text('failure_message').nullable();

    table.timestamps(true, true);

    table.foreign('payment_id')
      .references('id')
      .inTable('payment_obligations')
      .onDelete('CASCADE');

    table.unique(['payment_id', 'attempt_number'], {
      indexName: 'payment_attempts_payment_number_unique',
    });
    table.unique(['processor', 'provider_idempotency_key'], {
      indexName: 'payment_attempts_processor_provider_key_unique',
    });

    table.index(['payment_id', 'created_at'], 'payment_attempts_payment_created_idx');
    table.index(['status', 'created_at'], 'payment_attempts_status_created_idx');

    table.check('attempt_number > 0', [], 'payment_attempts_number_check');
    table.check(
      `processor IN (${quoteList(PAYMENT_PROCESSORS)})`,
      [],
      'payment_attempts_processor_check'
    );
    table.check(
      `status IN (${quoteList(PAYMENT_ATTEMPT_STATUSES)})`,
      [],
      'payment_attempts_status_check'
    );
  });

  // NULL external ids are valid until a processor has accepted/identified the
  // attempt. Once present, a processor transaction may map to one local attempt.
  await knex.raw(
    'CREATE UNIQUE INDEX payment_attempts_processor_external_tx_unique '
      + 'ON payment_attempts (processor, external_transaction_id) '
      + 'WHERE external_transaction_id IS NOT NULL'
  );
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('payment_attempts');
  await knex.schema.dropTableIfExists('payment_obligations');
};

module.exports = {
  PAYMENT_STATUSES,
  PAYMENT_ATTEMPT_STATUSES,
  COMMERCE_TYPES,
  SALES_CHANNELS,
  PAYMENT_METHODS,
  PAYMENT_PROCESSORS,
};
