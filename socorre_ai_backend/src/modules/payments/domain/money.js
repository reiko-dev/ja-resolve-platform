'use strict';

const { paymentValidationError } = require('./errors');

function requireAmountCents(value, field = 'amount_cents') {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw paymentValidationError(field + ' must be a positive safe integer of cents', { field });
  }
  return value;
}

function requireCurrency(value, field = 'currency') {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    throw paymentValidationError(field + ' must be an ISO-4217 style uppercase code', { field });
  }
  return value;
}

module.exports = {
  requireAmountCents,
  requireCurrency,
};
