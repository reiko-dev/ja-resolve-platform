'use strict';

const REQUIRED_PAYMENT_ATTEMPT_REPOSITORY_METHODS = Object.freeze([
  'createNext',
  'findById',
  'findByProviderIdempotencyKey',
  'transitionStatus',
  'attachExternalTransactionId',
  'withTransaction',
]);

function assertPaymentAttemptRepository(repository) {
  if (!repository || typeof repository !== 'object') {
    throw new TypeError('payment attempt repository must be an object');
  }
  for (const method of REQUIRED_PAYMENT_ATTEMPT_REPOSITORY_METHODS) {
    if (typeof repository[method] !== 'function') {
      throw new TypeError('payment attempt repository must implement ' + method + '()');
    }
  }
  return repository;
}

module.exports = {
  REQUIRED_PAYMENT_ATTEMPT_REPOSITORY_METHODS,
  assertPaymentAttemptRepository,
};
