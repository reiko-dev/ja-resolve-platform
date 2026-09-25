'use strict';

function createPaymentObligationRepository(db) {
  if (!db) {
    throw new TypeError('createPaymentObligationRepository requires a database connection');
  }

  const COLUMNS = Object.freeze([
    'id',
    'business_key',
    'context_type',
    'context_id',
    'payer_id',
    'commerce_type',
    'sales_channel',
    'amount_cents',
    'currency',
    'method',
    'processor',
    'status',
    'idempotency_key',
    'idempotency_fingerprint',
    'paid_at',
    'cancelled_at',
    'expires_at',
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
      id: toSafeNumber(row.id, 'payment.id'),
      business_key: row.business_key,
      context_type: row.context_type,
      context_id: row.context_id,
      payer_id: row.payer_id,
      commerce_type: row.commerce_type,
      sales_channel: row.sales_channel,
      amount_cents: toSafeNumber(row.amount_cents, 'payment.amount_cents'),
      currency: row.currency,
      method: row.method,
      processor: row.processor,
      status: row.status,
      idempotency_key: row.idempotency_key,
      idempotency_fingerprint: row.idempotency_fingerprint,
      paid_at: toIso(row.paid_at),
      cancelled_at: toIso(row.cancelled_at),
      expires_at: toIso(row.expires_at),
      created_at: toIso(row.created_at),
      updated_at: toIso(row.updated_at),
    };
  }

  function isUniqueViolation(error) {
    return Boolean(error)
      && (error.code === '23505'
        || /unique constraint|duplicate key|SQLITE_CONSTRAINT/i.test(String(error.message || '')));
  }

  function conflictTarget(error) {
    const source = String(
      (error && error.constraint)
      || (error && error.message)
      || ''
    );
    if (/business_key/i.test(source)) return 'business_key';
    if (/payer.*idempotency|idempotency.*payer/i.test(source)) return 'idempotency_key';
    return 'unknown';
  }

  function build(connection) {
    async function findById(id) {
      return mapRow(await connection('payment_obligations').where({ id }).first(COLUMNS));
    }

    async function findByBusinessKey(businessKey) {
      return mapRow(
        await connection('payment_obligations')
          .where({ business_key: businessKey })
          .first(COLUMNS)
      );
    }

    async function findByIdempotencyKey(payerId, idempotencyKey) {
      return mapRow(
        await connection('payment_obligations')
          .where({ payer_id: String(payerId), idempotency_key: idempotencyKey })
          .first(COLUMNS)
      );
    }

    async function createIdempotent(record) {
      const payload = {
        business_key: record.business_key,
        context_type: record.context_type,
        context_id: record.context_id,
        payer_id: record.payer_id,
        commerce_type: record.commerce_type,
        sales_channel: record.sales_channel,
        amount_cents: record.amount_cents,
        currency: record.currency,
        method: record.method,
        processor: record.processor,
        status: record.status,
        idempotency_key: record.idempotency_key,
        idempotency_fingerprint: record.idempotency_fingerprint,
        paid_at: record.paid_at || null,
        cancelled_at: record.cancelled_at || null,
        expires_at: record.expires_at || null,
        created_at: record.created_at,
        updated_at: record.updated_at,
      };

      let inserted = null;
      let uniqueError = null;

      try {
        // SAVEPOINT keeps a surrounding PostgreSQL transaction usable after 23505.
        await connection.transaction(async (savepoint) => {
          [inserted] = await savepoint('payment_obligations')
            .insert(payload)
            .returning(COLUMNS);
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        uniqueError = error;
      }

      if (!uniqueError) {
        return { row: mapRow(inserted), conflict: null };
      }

      const target = conflictTarget(uniqueError);
      const existing = target === 'idempotency_key'
        ? await findByIdempotencyKey(record.payer_id, record.idempotency_key)
        : await findByBusinessKey(record.business_key);

      return { row: existing, conflict: target };
    }

    async function transitionStatus(id, {
      fromStatus,
      toStatus,
      paidAt = null,
      cancelledAt = null,
      updatedAt,
    }) {
      const patch = {
        status: toStatus,
        paid_at: paidAt,
        cancelled_at: cancelledAt,
        updated_at: updatedAt,
      };

      const [updated] = await connection('payment_obligations')
        .where({ id, status: fromStatus })
        .update(patch)
        .returning(COLUMNS);

      const row = mapRow(updated);
      if (row) return { row, transitioned: true };
      return { row: await findById(id), transitioned: false };
    }

    function withTransaction(trx) {
      if (typeof trx !== 'function') {
        throw new TypeError(
          'payment-obligation-repository.withTransaction requires a knex transaction'
        );
      }
      return build(trx);
    }

    return {
      createIdempotent,
      findById,
      findByBusinessKey,
      findByIdempotencyKey,
      transitionStatus,
      withTransaction,
    };
  }

  return build(db);
}

module.exports = { createPaymentObligationRepository };
