'use strict';

const {
  COMMERCE_TYPES,
  SALES_CHANNELS,
  PAYMENT_METHODS,
  PAYMENT_PROCESSORS,
  resolvePaymentProcessor,
  buildPaymentObligation,
} = require('../../src/modules/payments');

describe('Payments foundation routing policy', () => {
  test.each([
    [COMMERCE_TYPES.DIGITAL_SUBSCRIPTION, SALES_CHANNELS.IOS_APP, PAYMENT_METHODS.STORE_BILLING, PAYMENT_PROCESSORS.APPLE_APP_STORE],
    [COMMERCE_TYPES.DIGITAL_GOOD, SALES_CHANNELS.ANDROID_APP, PAYMENT_METHODS.STORE_BILLING, PAYMENT_PROCESSORS.GOOGLE_PLAY],
    [COMMERCE_TYPES.DIGITAL_SUBSCRIPTION, SALES_CHANNELS.WEB, PAYMENT_METHODS.CARD, PAYMENT_PROCESSORS.STRIPE],
    [COMMERCE_TYPES.PHYSICAL_GOOD, SALES_CHANNELS.IOS_APP, PAYMENT_METHODS.CARD, PAYMENT_PROCESSORS.STRIPE],
    [COMMERCE_TYPES.PHYSICAL_GOOD, SALES_CHANNELS.ANDROID_APP, PAYMENT_METHODS.PIX, PAYMENT_PROCESSORS.STRIPE],
    [COMMERCE_TYPES.REAL_WORLD_SERVICE, SALES_CHANNELS.IOS_APP, PAYMENT_METHODS.CASH, PAYMENT_PROCESSORS.INTERNAL_CASH],
  ])('routes %s / %s / %s to %s', (commerceType, salesChannel, paymentMethod, expected) => {
    expect(resolvePaymentProcessor({ commerceType, salesChannel, paymentMethod })).toBe(expected);
  });

  test('rejects Stripe-like payment methods for in-app digital commerce', () => {
    expect(() => resolvePaymentProcessor({
      commerceType: COMMERCE_TYPES.DIGITAL_SUBSCRIPTION,
      salesChannel: SALES_CHANNELS.IOS_APP,
      paymentMethod: PAYMENT_METHODS.CARD,
    })).toThrow(/store billing/i);
  });

  test('rejects store billing for physical commerce', () => {
    expect(() => resolvePaymentProcessor({
      commerceType: COMMERCE_TYPES.PHYSICAL_GOOD,
      salesChannel: SALES_CHANNELS.ANDROID_APP,
      paymentMethod: PAYMENT_METHODS.STORE_BILLING,
    })).toThrow(/cannot use app-store billing/i);
  });
});

describe('Payment obligation invariants', () => {
  test('keeps money as integer cents and derives processor centrally', () => {
    const payment = buildPaymentObligation({
      context_type: 'TOW_SERVICE',
      context_id: 77,
      payer_id: 12,
      commerce_type: COMMERCE_TYPES.REAL_WORLD_SERVICE,
      sales_channel: SALES_CHANNELS.ANDROID_APP,
      amount_cents: 23560,
      currency: 'BRL',
      method: PAYMENT_METHODS.PIX,
      idempotency_key: 'tow:77:payment:v1',
    });

    expect(payment).toEqual(expect.objectContaining({
      business_key: 'TOW_SERVICE:77',
      amount_cents: 23560,
      currency: 'BRL',
      processor: PAYMENT_PROCESSORS.STRIPE,
      status: 'PENDING',
    }));
  });

  test('rejects decimal monetary authority', () => {
    expect(() => buildPaymentObligation({
      context_type: 'STORE_ORDER',
      context_id: 9,
      payer_id: 12,
      commerce_type: COMMERCE_TYPES.PHYSICAL_GOOD,
      sales_channel: SALES_CHANNELS.WEB,
      amount_cents: 235.6,
      currency: 'BRL',
      method: PAYMENT_METHODS.CARD,
      idempotency_key: 'store:9:payment:v1',
    })).toThrow(/integer of cents/i);
  });

  test('does not allow a caller to bypass the central routing policy', () => {
    expect(() => buildPaymentObligation({
      context_type: 'PREMIUM_SUBSCRIPTION',
      context_id: 'sub-1',
      payer_id: 12,
      commerce_type: COMMERCE_TYPES.DIGITAL_SUBSCRIPTION,
      sales_channel: SALES_CHANNELS.IOS_APP,
      amount_cents: 1990,
      currency: 'BRL',
      method: PAYMENT_METHODS.STORE_BILLING,
      processor: PAYMENT_PROCESSORS.STRIPE,
      idempotency_key: 'premium:sub-1:v1',
    })).toThrow(/central payment routing policy/i);
  });
});
