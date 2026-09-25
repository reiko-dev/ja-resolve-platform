'use strict';

const REQUIRED_PROCESSOR_METHODS = Object.freeze([
  'create',
  'retrieve',
  'cancel',
  'refund',
  'reconcile',
  'verifyProviderEvent',
]);

function assertPaymentProcessorAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new TypeError('payment processor adapter must be an object');
  }

  for (const method of REQUIRED_PROCESSOR_METHODS) {
    if (typeof adapter[method] !== 'function') {
      throw new TypeError('payment processor adapter must implement ' + method + '()');
    }
  }

  return adapter;
}

module.exports = {
  REQUIRED_PROCESSOR_METHODS,
  assertPaymentProcessorAdapter,
};
