'use strict';

const {
  PAYMENT_STATUSES,
  PAYMENT_ATTEMPT_STATUSES,
  assertPaymentTransition,
  assertPaymentAttemptTransition,
} = require('../../src/modules/payments');

describe('Payment state machine', () => {
  test('allows a payment to progress from pending to processing to paid', () => {
    expect(
      assertPaymentTransition(PAYMENT_STATUSES.PENDING, PAYMENT_STATUSES.PROCESSING)
    ).toEqual({ from: 'PENDING', to: 'PROCESSING', replay: false });

    expect(
      assertPaymentTransition(PAYMENT_STATUSES.PROCESSING, PAYMENT_STATUSES.PAID)
    ).toEqual({ from: 'PROCESSING', to: 'PAID', replay: false });
  });

  test('treats same-state transition as an idempotent replay', () => {
    expect(
      assertPaymentTransition(PAYMENT_STATUSES.PENDING, PAYMENT_STATUSES.PENDING)
    ).toEqual({ from: 'PENDING', to: 'PENDING', replay: true });
  });

  test('does not reopen a terminal paid payment', () => {
    expect(() => assertPaymentTransition(
      PAYMENT_STATUSES.PAID,
      PAYMENT_STATUSES.PROCESSING
    )).toThrow(/invalid payment status transition/i);
  });
});

describe('PaymentAttempt state machine', () => {
  test('allows processing to succeed', () => {
    expect(
      assertPaymentAttemptTransition(
        PAYMENT_ATTEMPT_STATUSES.PROCESSING,
        PAYMENT_ATTEMPT_STATUSES.SUCCEEDED
      )
    ).toEqual({ from: 'PROCESSING', to: 'SUCCEEDED', replay: false });
  });

  test('does not reopen a terminal failed attempt', () => {
    expect(() => assertPaymentAttemptTransition(
      PAYMENT_ATTEMPT_STATUSES.FAILED,
      PAYMENT_ATTEMPT_STATUSES.PROCESSING
    )).toThrow(/invalid payment_attempt status transition/i);
  });
});
