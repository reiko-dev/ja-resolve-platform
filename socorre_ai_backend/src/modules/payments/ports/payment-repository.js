'use strict';

const REQUIRED_PAYMENT_REPOSITORY_METHODS = Object.freeze([
  'createIdempotent',
  'findById',
  'findByBusinessKey',
  'findByIdempotencyKey',
  'transitionStatus',
  'withTransaction',
]);

function assertPaymentRepository(repository) {
  if (!repository || typeof repository !== 'object') {
    throw new TypeError('payment repository must be an object');
  }
  for (const method of REQUIRED_PAYMENT_REPOSITORY_METHODS) {
    if (typeof repository[method] !== 'function') {
      throw new TypeError('payment repository must implement ' + method + '()');
    }
  }
  return repository;
}

module.exports = {
  REQUIRED_PAYMENT_REPOSITORY_METHODS,
  assertPaymentRepository,
};
