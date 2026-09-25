'use strict';

function createPaymentAttemptRepository(db) {
  if (!db) {
    throw new TypeError('createPaymentAttemptRepository requires a database connection');
  }

  const COLUMNS = Object.freeze([
    'id',
    'payment_id',
    'attempt_number',
    'processor',
    'status',
    'provider_idempotency_key',
    'external_transaction_id',
    'failure_code',
    'failure_message',
    'created_at',
    'updated_at',
  ]);

  function toSafeNumber(value, field) {
    if (value === null || value === undefined) return value;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new RangeError(field + ' exceeded JavaScript safe integer range');
    }
    return parsed;
  }

  function toIso(value) {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
  }

  function mapRow(row) {
    if (!row) return null;
    return {
      id: toSafeNumber(row.id, 'payment_attempt.id'),
      payment_id: toSafeNumber(row.payment_id, 'payment_attempt.payment_id'),
      attempt_number: toSafeNumber(row.attempt_number, 'payment_attempt.attempt_number'),
      processor: row.processor,
      status: row.status,
      provider_idempotency_key: row.provider_idempotency_key,
      external_transaction_id: row.external_transaction_id,
      failure_code: row.failure_code,
      failure_message: row.failure_message,
      created_at: toIso(row.created_at),
      updated_at: toIso(row.updated_at),
    };
  }

  function isUniqueViolation(error) {
    return Boolean(error)
      && (error.code === '23505'
        || /unique constraint|duplicate key|SQLITE_CONSTRAINT/i.test(String(error.message || '')));
  }

  function build(connection) {
    async function findById(id) {
      return mapRow(await connection('payment_attempts').where({ id }).first(COLUMNS));
    }

    async function findByProviderIdempotencyKey(processor, providerIdempotencyKey) {
      return mapRow(
        await connection('payment_attempts')
          .where({
            processor,
            provider_idempotency_key: providerIdempotencyKey,
          })
          .first(COLUMNS)
      );
    }

    async function createNext(record) {
      // Lock the parent Payment so concurrent "next attempt" calls serialize on
      // PostgreSQL. SQLite test harness ignores FOR UPDATE but still exercises
      // the unique constraints.
      await connection('payment_obligations')
        .where({ id: record.payment_id })
        .forUpdate()
        .first('id');

      const replay = await findByProviderIdempotencyKey(
        record.processor,
        record.provider_idempotency_key
      );
      if (replay) {
        return {
          row: replay,
          replay: true,
          conflict: replay.payment_id === record.payment_id ? null : 'provider_idempotency_key',
        };
      }

      const latest = await connection('payment_attempts')
        .where({ payment_id: record.payment_id })
        .max({ max_attempt: 'attempt_number' })
        .first();
      const attemptNumber = Number(latest && latest.max_attempt ? latest.max_attempt : 0) + 1;

      const payload = {
        payment_id: record.payment_id,
        attempt_number: attemptNumber,
        processor: record.processor,
        status: record.status,
        provider_idempotency_key: record.provider_idempotency_key,
        external_transaction_id: null,
        failure_code: null,
        failure_message: null,
        created_at: record.created_at,
        updated_at: record.updated_at,
      };

      try {
        const [inserted] = await connection('payment_attempts')
          .insert(payload)
          .returning(COLUMNS);
        return { row: mapRow(inserted), replay: false, conflict: null };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;

        const existing = await findByProviderIdempotencyKey(
          record.processor,
          record.provider_idempotency_key
        );
        if (existing) {
          return {
            row: existing,
            replay: true,
            conflict: existing.payment_id === record.payment_id
              ? null
              : 'provider_idempotency_key',
          };
        }
        throw error;
      }
    }

    async function transitionStatus(id, {
      fromStatus,
      toStatus,
      failureCode = null,
      failureMessage = null,
      updatedAt,
    }) {
      const [updated] = await connection('payment_attempts')
        .where({ id, status: fromStatus })
        .update({
          status: toStatus,
          failure_code: failureCode,
          failure_message: failureMessage,
          updated_at: updatedAt,
        })
        .returning(COLUMNS);

      const row = mapRow(updated);
      if (row) return { row, transitioned: true };
      return { row: await findById(id), transitioned: false };
    }

    async function attachExternalTransactionId(id, {
      externalTransactionId,
      updatedAt,
    }) {
      const current = await findById(id);
      if (!current) return { row: null, attached: false };

      if (current.external_transaction_id) {
        return {
          row: current,
          attached: current.external_transaction_id === externalTransactionId,
        };
      }

      const [updated] = await connection('payment_attempts')
        .where({ id })
        .whereNull('external_transaction_id')
        .update({
          external_transaction_id: externalTransactionId,
          updated_at: updatedAt,
        })
        .returning(COLUMNS);

      const row = mapRow(updated);
      if (row) return { row, attached: true };
      return { row: await findById(id), attached: false };
    }

    function withTransaction(trx) {
      if (typeof trx !== 'function') {
        throw new TypeError(
          'payment-attempt-repository.withTransaction requires a knex transaction'
        );
      }
      return build(trx);
    }

    return {
      createNext,
      findById,
      findByProviderIdempotencyKey,
      transitionStatus,
      attachExternalTransactionId,
      withTransaction,
    };
  }

  return build(db);
}

module.exports = { createPaymentAttemptRepository };
