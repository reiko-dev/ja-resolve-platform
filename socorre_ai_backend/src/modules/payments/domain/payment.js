'use strict';

const { paymentValidationError } = require('./errors');
const { requireAmountCents, requireCurrency } = require('./money');
const {
  COMMERCE_TYPES,
  SALES_CHANNELS,
  PAYMENT_METHODS,
  PAYMENT_PROCESSORS,
  PAYMENT_STATUSES,
} = require('./vocabulary');
const { resolvePaymentProcessor } = require('./routing-policy');

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw paymentValidationError(field + ' must be a non-empty string', { field });
  }
  return value.trim();
}

function requireEnumMember(value, vocabulary, field) {
  if (!Object.values(vocabulary).includes(value)) {
    throw paymentValidationError(field + ' is not supported', { field, value });
  }
  return value;
}

function buildBusinessKey(contextType, contextId) {
  return requireNonEmptyString(contextType, 'context_type')
    + ':'
    + requireNonEmptyString(String(contextId), 'context_id');
}

/**
 * Builds the canonical Payment obligation without calculating any business
 * price. amount_cents must already be frozen by the originating domain.
 */
function buildPaymentObligation(input = {}) {
  const contextType = requireNonEmptyString(input.context_type, 'context_type');
  const contextId = requireNonEmptyString(String(input.context_id ?? ''), 'context_id');
  const payerId = requireNonEmptyString(String(input.payer_id ?? ''), 'payer_id');
  const commerceType = requireEnumMember(input.commerce_type, COMMERCE_TYPES, 'commerce_type');
  const salesChannel = requireEnumMember(input.sales_channel, SALES_CHANNELS, 'sales_channel');
  const paymentMethod = requireEnumMember(input.method, PAYMENT_METHODS, 'method');
  const amountCents = requireAmountCents(input.amount_cents);
  const currency = requireCurrency(input.currency || 'BRL');

  const expectedProcessor = resolvePaymentProcessor({
    commerceType,
    salesChannel,
    paymentMethod,
  });
  const processor = input.processor || expectedProcessor;

  requireEnumMember(processor, PAYMENT_PROCESSORS, 'processor');
  if (processor !== expectedProcessor) {
    throw paymentValidationError('processor conflicts with the central payment routing policy', {
      field: 'processor',
      expected_processor: expectedProcessor,
      received_processor: processor,
    });
  }

  return Object.freeze({
    business_key: input.business_key
      ? requireNonEmptyString(input.business_key, 'business_key')
      : buildBusinessKey(contextType, contextId),
    context_type: contextType,
    context_id: contextId,
    payer_id: payerId,
    commerce_type: commerceType,
    sales_channel: salesChannel,
    amount_cents: amountCents,
    currency,
    method: paymentMethod,
    processor,
    status: PAYMENT_STATUSES.PENDING,
    idempotency_key: requireNonEmptyString(input.idempotency_key, 'idempotency_key'),
  });
}

module.exports = {
  buildBusinessKey,
  buildPaymentObligation,
};
