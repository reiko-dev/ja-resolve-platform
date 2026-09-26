'use strict';

const { paymentValidationError } = require('./errors');
const {
  COMMERCE_TYPES,
  SALES_CHANNELS,
  PAYMENT_METHODS,
  PAYMENT_PROCESSORS,
} = require('./vocabulary');

const DIGITAL_COMMERCE = new Set([
  COMMERCE_TYPES.DIGITAL_GOOD,
  COMMERCE_TYPES.DIGITAL_SUBSCRIPTION,
]);

const PHYSICAL_COMMERCE = new Set([
  COMMERCE_TYPES.PHYSICAL_GOOD,
  COMMERCE_TYPES.REAL_WORLD_SERVICE,
]);

function requireEnumMember(value, vocabulary, field) {
  if (!Object.values(vocabulary).includes(value)) {
    throw paymentValidationError(field + ' is not supported', { field, value });
  }
  return value;
}

/**
 * Central processor-routing policy.
 *
 * Domain modules never select Stripe/Apple/Google directly. They provide the
 * commercial nature, channel and requested method; Payments resolves the rail.
 */
function resolvePaymentProcessor({ commerceType, salesChannel, paymentMethod } = {}) {
  requireEnumMember(commerceType, COMMERCE_TYPES, 'commerce_type');
  requireEnumMember(salesChannel, SALES_CHANNELS, 'sales_channel');
  requireEnumMember(paymentMethod, PAYMENT_METHODS, 'payment_method');

  if (DIGITAL_COMMERCE.has(commerceType)) {
    if (paymentMethod === PAYMENT_METHODS.CASH) {
      throw paymentValidationError('digital commerce cannot be routed to cash', {
        field: 'payment_method',
        reason: 'DIGITAL_CASH_FORBIDDEN',
      });
    }

    if (salesChannel === SALES_CHANNELS.IOS_APP) {
      if (paymentMethod !== PAYMENT_METHODS.STORE_BILLING) {
        throw paymentValidationError('digital purchases in the iOS app must use store billing', {
          field: 'payment_method',
          reason: 'IOS_STORE_BILLING_REQUIRED',
        });
      }
      return PAYMENT_PROCESSORS.APPLE_APP_STORE;
    }

    if (salesChannel === SALES_CHANNELS.ANDROID_APP) {
      if (paymentMethod !== PAYMENT_METHODS.STORE_BILLING) {
        throw paymentValidationError('digital purchases in the Android app must use store billing', {
          field: 'payment_method',
          reason: 'ANDROID_STORE_BILLING_REQUIRED',
        });
      }
      return PAYMENT_PROCESSORS.GOOGLE_PLAY;
    }

    if (paymentMethod === PAYMENT_METHODS.STORE_BILLING) {
      throw paymentValidationError('web digital purchases cannot use mobile store billing', {
        field: 'payment_method',
        reason: 'WEB_STORE_BILLING_FORBIDDEN',
      });
    }
    return PAYMENT_PROCESSORS.STRIPE;
  }

  if (PHYSICAL_COMMERCE.has(commerceType)) {
    if (paymentMethod === PAYMENT_METHODS.STORE_BILLING) {
      throw paymentValidationError('physical goods and real-world services cannot use app-store billing', {
        field: 'payment_method',
        reason: 'PHYSICAL_STORE_BILLING_FORBIDDEN',
      });
    }
    if (paymentMethod === PAYMENT_METHODS.CASH) {
      return PAYMENT_PROCESSORS.INTERNAL_CASH;
    }
    return PAYMENT_PROCESSORS.STRIPE;
  }

  throw paymentValidationError('commerce_type has no payment routing policy', {
    field: 'commerce_type',
  });
}

module.exports = {
  resolvePaymentProcessor,
};
