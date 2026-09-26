'use strict';

const crypto = require('crypto');
const { paymentValidationError } = require('./errors');

function requireIdempotencyKey(value, field = 'idempotency_key') {
  if (typeof value !== 'string') {
    throw paymentValidationError(field + ' must be a string', { field });
  }
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 128) {
    throw paymentValidationError(field + ' must contain 8 to 128 characters', { field });
  }
  return normalized;
}

function fingerprintPaymentObligation(payment) {
  const source = JSON.stringify({
    business_key: payment.business_key,
    context_type: payment.context_type,
    context_id: payment.context_id,
    payer_id: payment.payer_id,
    commerce_type: payment.commerce_type,
    sales_channel: payment.sales_channel,
    amount_cents: payment.amount_cents,
    currency: payment.currency,
    method: payment.method,
    processor: payment.processor,
  });
  return crypto.createHash('sha256').update(source, 'utf8').digest('hex');
}

module.exports = {
  requireIdempotencyKey,
  fingerprintPaymentObligation,
};
