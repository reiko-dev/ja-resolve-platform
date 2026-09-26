'use strict';

class PaymentDomainError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PaymentDomainError';
    this.code = details.code || 'PAYMENT_DOMAIN_ERROR';
    this.details = Object.freeze({ ...details });
  }
}

function paymentValidationError(message, details = {}) {
  return new PaymentDomainError(message, {
    ...details,
    code: details.code || 'PAYMENT_VALIDATION_ERROR',
  });
}

module.exports = {
  PaymentDomainError,
  paymentValidationError,
};
