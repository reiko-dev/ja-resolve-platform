'use strict';

const { paymentValidationError } = require('./errors');
const {
  PAYMENT_ATTEMPT_STATUSES,
  PAYMENT_PROCESSORS,
} = require('./vocabulary');

function requireNonEmptyString(value, field, maxLength = 255) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw paymentValidationError(field + ' must be a non-empty string', { field });
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw paymentValidationError(field + ' exceeds maximum length', { field });
  }
  return normalized;
}

function buildPaymentAttempt(input = {}) {
  const paymentId = Number(input.payment_id);
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0) {
    throw paymentValidationError('payment_id must be a positive safe integer', {
      field: 'payment_id',
    });
  }

  if (!Object.values(PAYMENT_PROCESSORS).includes(input.processor)) {
    throw paymentValidationError('processor is not supported', {
      field: 'processor',
      value: input.processor,
    });
  }

  return Object.freeze({
    payment_id: paymentId,
    processor: input.processor,
    provider_idempotency_key: requireNonEmptyString(
      input.provider_idempotency_key,
      'provider_idempotency_key'
    ),
    status: PAYMENT_ATTEMPT_STATUSES.PENDING,
  });
}

module.exports = { buildPaymentAttempt };
