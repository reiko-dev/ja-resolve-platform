'use strict';

const testDb = require('../helpers/testDb');
const {
  COMMERCE_TYPES,
  SALES_CHANNELS,
  PAYMENT_METHODS,
  PAYMENT_PROCESSORS,
  PAYMENT_STATUSES,
  PAYMENT_ATTEMPT_STATUSES,
  createPaymentPlatform,
} = require('../../src/modules/payments');

function createFakeClock() {
  let now = new Date('2026-09-25T05:00:00.000Z');
  return {
    now: () => new Date(now),
    advance(ms) {
      now = new Date(now.getTime() + ms);
    },
  };
}

function stripeStoreCommand(overrides = {}) {
  return {
    context_type: 'STORE_ORDER',
    context_id: 'order-100',
    payer_id: 'customer-7',
    commerce_type: COMMERCE_TYPES.PHYSICAL_GOOD,
    sales_channel: SALES_CHANNELS.ANDROID_APP,
    amount_cents: 23560,
    currency: 'BRL',
    method: PAYMENT_METHODS.PIX,
    idempotency_key: 'store-order-100-pay-v1',
    ...overrides,
  };
}

describe('Payment Platform application/persistence baseline', () => {
  let clock;
  let platform;

  beforeAll(async () => {
    await testDb.reset();
  });

  beforeEach(async () => {
    await testDb.db('payment_attempts').del();
    await testDb.db('payment_obligations').del();
    clock = createFakeClock();
    platform = createPaymentPlatform({ db: testDb.db, clock });
  });

  test('creates one canonical obligation with processor derived centrally', async () => {
    const created = await platform.paymentService.createObligation(
      stripeStoreCommand()
    );

    expect(created.replay).toBe(false);
    expect(created.payment).toEqual(expect.objectContaining({
      business_key: 'STORE_ORDER:order-100',
      amount_cents: 23560,
      currency: 'BRL',
      processor: PAYMENT_PROCESSORS.STRIPE,
      status: PAYMENT_STATUSES.PENDING,
    }));

    const rows = await testDb.db('payment_obligations');
    expect(rows).toHaveLength(1);
  });

  test('same command replay returns the exact canonical payment', async () => {
    const first = await platform.paymentService.createObligation(
      stripeStoreCommand()
    );

    clock.advance(60_000);
    const replay = await platform.paymentService.createObligation(
      stripeStoreCommand()
    );

    expect(replay.replay).toBe(true);
    expect(replay.payment.id).toBe(first.payment.id);
    expect(replay.payment.created_at).toBe(first.payment.created_at);
    expect(await testDb.db('payment_obligations')).toHaveLength(1);
  });

  test('same idempotency key with different money is rejected, never overwritten', async () => {
    const first = await platform.paymentService.createObligation(
      stripeStoreCommand()
    );

    await expect(
      platform.paymentService.createObligation(
        stripeStoreCommand({
          context_id: 'order-101',
          amount_cents: 99999,
        })
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });

    const rows = await testDb.db('payment_obligations');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount_cents)).toBe(first.payment.amount_cents);
  });

  test('same business obligation with a different key is a replay if financial facts match', async () => {
    const first = await platform.paymentService.createObligation(
      stripeStoreCommand()
    );

    const replay = await platform.paymentService.createObligation(
      stripeStoreCommand({ idempotency_key: 'store-order-100-retry-v2' })
    );

    expect(replay.replay).toBe(true);
    expect(replay.payment.id).toBe(first.payment.id);
    expect(await testDb.db('payment_obligations')).toHaveLength(1);
  });

  test('external processor attempt is numbered and provider-idempotent', async () => {
    const { payment } = await platform.paymentService.createObligation(
      stripeStoreCommand()
    );

    const first = await platform.paymentService.beginAttempt({
      payment_id: payment.id,
      provider_idempotency_key: 'stripe:store-order-100:attempt-1',
    });

    expect(first.replay).toBe(false);
    expect(first.attempt.attempt_number).toBe(1);
    expect(first.attempt.processor).toBe(PAYMENT_PROCESSORS.STRIPE);

    const replay = await platform.paymentService.beginAttempt({
      payment_id: payment.id,
      provider_idempotency_key: 'stripe:store-order-100:attempt-1',
    });

    expect(replay.replay).toBe(true);
    expect(replay.attempt.id).toBe(first.attempt.id);
    expect(await testDb.db('payment_attempts')).toHaveLength(1);
  });

  test('internal cash does not manufacture a fake external attempt', async () => {
    const { payment } = await platform.paymentService.createObligation({
      context_type: 'TOW_SERVICE',
      context_id: 'assignment-55',
      payer_id: 'customer-8',
      commerce_type: COMMERCE_TYPES.REAL_WORLD_SERVICE,
      sales_channel: SALES_CHANNELS.IOS_APP,
      amount_cents: 18000,
      currency: 'BRL',
      method: PAYMENT_METHODS.CASH,
      idempotency_key: 'tow-assignment-55-cash',
    });

    expect(payment.processor).toBe(PAYMENT_PROCESSORS.INTERNAL_CASH);

    await expect(platform.paymentService.beginAttempt({
      payment_id: payment.id,
      provider_idempotency_key: 'cash-does-not-have-provider-attempt',
    })).rejects.toMatchObject({ code: 'PAYMENT_ATTEMPT_NOT_APPLICABLE' });
  });

  test('guarded payment transition stamps PAID once and replays without restamping', async () => {
    const { payment } = await platform.paymentService.createObligation(
      stripeStoreCommand()
    );

    const paid = await platform.paymentService.transitionPayment({
      payment_id: payment.id,
      to_status: PAYMENT_STATUSES.PAID,
    });
    expect(paid.replay).toBe(false);
    expect(paid.payment.status).toBe(PAYMENT_STATUSES.PAID);
    expect(paid.payment.paid_at).toBeTruthy();

    const paidAt = paid.payment.paid_at;
    clock.advance(120_000);
    const replay = await platform.paymentService.transitionPayment({
      payment_id: payment.id,
      to_status: PAYMENT_STATUSES.PAID,
    });

    expect(replay.replay).toBe(true);
    expect(replay.payment.paid_at).toBe(paidAt);
  });

  test('failed attempts require failure code and remain distinct from Payment state', async () => {
    const { payment } = await platform.paymentService.createObligation(
      stripeStoreCommand()
    );
    const { attempt } = await platform.paymentService.beginAttempt({
      payment_id: payment.id,
      provider_idempotency_key: 'stripe:failure-case',
    });

    await expect(platform.paymentService.transitionAttempt({
      attempt_id: attempt.id,
      to_status: PAYMENT_ATTEMPT_STATUSES.FAILED,
    })).rejects.toMatchObject({
      code: 'PAYMENT_ATTEMPT_FAILURE_CODE_REQUIRED',
    });

    const failed = await platform.paymentService.transitionAttempt({
      attempt_id: attempt.id,
      to_status: PAYMENT_ATTEMPT_STATUSES.FAILED,
      failure_code: 'provider_declined',
      failure_message: 'Fixture decline',
    });

    expect(failed.attempt.status).toBe(PAYMENT_ATTEMPT_STATUSES.FAILED);

    const currentPayment = await platform.paymentService.getPayment(payment.id);
    expect(currentPayment.status).toBe(PAYMENT_STATUSES.PENDING);
  });

  test('database rejects zero-value canonical obligations', async () => {
    await expect(testDb.db('payment_obligations').insert({
      business_key: 'STORE_ORDER:zero',
      context_type: 'STORE_ORDER',
      context_id: 'zero',
      payer_id: 'customer-zero',
      commerce_type: 'PHYSICAL_GOOD',
      sales_channel: 'WEB',
      amount_cents: 0,
      currency: 'BRL',
      method: 'CARD',
      processor: 'STRIPE',
      status: 'PENDING',
      idempotency_key: 'zero-payment-key',
      idempotency_fingerprint: 'a'.repeat(64),
    })).rejects.toBeTruthy();
  });
});
