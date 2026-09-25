'use strict';

const {
  PAYMENT_PROCESSORS,
  PAYMENT_STATUSES,
  PAYMENT_ATTEMPT_STATUSES,
  PaymentDomainError,
  buildPaymentObligation,
  buildPaymentAttempt,
  requireIdempotencyKey,
  fingerprintPaymentObligation,
  assertPaymentTransition,
  assertPaymentAttemptTransition,
} = require('../domain');
const { assertPaymentRepository } = require('../ports/payment-repository');
const {
  assertPaymentAttemptRepository,
} = require('../ports/payment-attempt-repository');
const { assertUnitOfWork } = require('../ports/unit-of-work');

function createSystemClock() {
  return Object.freeze({ now: () => new Date() });
}

function createPaymentApplicationService({
  paymentRepository,
  paymentAttemptRepository,
  unitOfWork,
  clock = createSystemClock(),
}) {
  assertPaymentRepository(paymentRepository);
  assertPaymentAttemptRepository(paymentAttemptRepository);
  assertUnitOfWork(unitOfWork);

  if (!clock || typeof clock.now !== 'function') {
    throw new TypeError('payment application service requires clock.now()');
  }

  async function createObligation(command = {}) {
    const idempotencyKey = requireIdempotencyKey(command.idempotency_key);
    const obligation = buildPaymentObligation({
      ...command,
      idempotency_key: idempotencyKey,
    });
    const fingerprint = fingerprintPaymentObligation(obligation);
    const now = clock.now();

    return unitOfWork.run(async (trx) => {
      const payments = paymentRepository.withTransaction(trx);
      const result = await payments.createIdempotent({
        ...obligation,
        idempotency_fingerprint: fingerprint,
        created_at: now,
        updated_at: now,
      });

      if (!result.row) {
        throw new PaymentDomainError('Payment obligation could not be created', {
          code: 'PAYMENT_CREATE_CONFLICT',
          conflict: result.conflict,
        });
      }

      if (result.row.idempotency_fingerprint !== fingerprint) {
        throw new PaymentDomainError(
          'Idempotency key or business key was replayed with different payment data',
          {
            code: 'IDEMPOTENCY_CONFLICT',
            conflict: result.conflict,
            payment_id: result.row.id,
          }
        );
      }

      return Object.freeze({
        payment: result.row,
        replay: Boolean(result.conflict),
      });
    });
  }

  async function getPayment(paymentId) {
    return paymentRepository.findById(paymentId);
  }

  async function beginAttempt({
    payment_id: paymentId,
    provider_idempotency_key: providerIdempotencyKey,
  } = {}) {
    return unitOfWork.run(async (trx) => {
      const payments = paymentRepository.withTransaction(trx);
      const attempts = paymentAttemptRepository.withTransaction(trx);

      const payment = await payments.findById(paymentId);
      if (!payment) {
        throw new PaymentDomainError('Payment was not found', {
          code: 'PAYMENT_NOT_FOUND',
          payment_id: paymentId,
        });
      }

      if (payment.processor === PAYMENT_PROCESSORS.INTERNAL_CASH) {
        throw new PaymentDomainError(
          'Internal cash does not create an external PaymentAttempt',
          {
            code: 'PAYMENT_ATTEMPT_NOT_APPLICABLE',
            payment_id: payment.id,
          }
        );
      }

      if ([
        PAYMENT_STATUSES.PAID,
        PAYMENT_STATUSES.CANCELLED,
        PAYMENT_STATUSES.EXPIRED,
      ].includes(payment.status)) {
        throw new PaymentDomainError(
          'A terminal Payment cannot start another attempt',
          {
            code: 'PAYMENT_TERMINAL',
            payment_id: payment.id,
            status: payment.status,
          }
        );
      }

      const attempt = buildPaymentAttempt({
        payment_id: payment.id,
        processor: payment.processor,
        provider_idempotency_key: providerIdempotencyKey,
      });
      const now = clock.now();

      const result = await attempts.createNext({
        ...attempt,
        created_at: now,
        updated_at: now,
      });

      if (result.conflict) {
        throw new PaymentDomainError(
          'Provider idempotency key belongs to a different Payment',
          {
            code: 'PROVIDER_IDEMPOTENCY_CONFLICT',
            payment_id: payment.id,
          }
        );
      }

      return Object.freeze({
        payment,
        attempt: result.row,
        replay: result.replay,
      });
    });
  }

  async function transitionPayment({
    payment_id: paymentId,
    to_status: toStatus,
  } = {}) {
    return unitOfWork.run(async (trx) => {
      const payments = paymentRepository.withTransaction(trx);
      const payment = await payments.findById(paymentId);
      if (!payment) {
        throw new PaymentDomainError('Payment was not found', {
          code: 'PAYMENT_NOT_FOUND',
          payment_id: paymentId,
        });
      }

      const transition = assertPaymentTransition(payment.status, toStatus);
      if (transition.replay) {
        return Object.freeze({ payment, replay: true });
      }

      const now = clock.now();
      const result = await payments.transitionStatus(payment.id, {
        fromStatus: payment.status,
        toStatus,
        paidAt: toStatus === PAYMENT_STATUSES.PAID ? now : null,
        cancelledAt: toStatus === PAYMENT_STATUSES.CANCELLED ? now : null,
        updatedAt: now,
      });

      if (!result.transitioned) {
        throw new PaymentDomainError(
          'Payment changed concurrently; reload canonical state before retrying',
          {
            code: 'PAYMENT_CONCURRENT_TRANSITION',
            payment_id: payment.id,
            observed_status: payment.status,
            current_status: result.row && result.row.status,
          }
        );
      }

      return Object.freeze({ payment: result.row, replay: false });
    });
  }

  async function transitionAttempt({
    attempt_id: attemptId,
    to_status: toStatus,
    failure_code: failureCode = null,
    failure_message: failureMessage = null,
  } = {}) {
    return unitOfWork.run(async (trx) => {
      const attempts = paymentAttemptRepository.withTransaction(trx);
      const attempt = await attempts.findById(attemptId);
      if (!attempt) {
        throw new PaymentDomainError('PaymentAttempt was not found', {
          code: 'PAYMENT_ATTEMPT_NOT_FOUND',
          attempt_id: attemptId,
        });
      }

      const transition = assertPaymentAttemptTransition(attempt.status, toStatus);
      if (transition.replay) {
        return Object.freeze({ attempt, replay: true });
      }

      if (
        toStatus === PAYMENT_ATTEMPT_STATUSES.FAILED
        && (!failureCode || typeof failureCode !== 'string')
      ) {
        throw new PaymentDomainError('A failed attempt requires a failure code', {
          code: 'PAYMENT_ATTEMPT_FAILURE_CODE_REQUIRED',
          attempt_id: attempt.id,
        });
      }

      const result = await attempts.transitionStatus(attempt.id, {
        fromStatus: attempt.status,
        toStatus,
        failureCode: toStatus === PAYMENT_ATTEMPT_STATUSES.FAILED
          ? failureCode
          : null,
        failureMessage: toStatus === PAYMENT_ATTEMPT_STATUSES.FAILED
          ? failureMessage
          : null,
        updatedAt: clock.now(),
      });

      if (!result.transitioned) {
        throw new PaymentDomainError(
          'PaymentAttempt changed concurrently; reload canonical state before retrying',
          {
            code: 'PAYMENT_ATTEMPT_CONCURRENT_TRANSITION',
            attempt_id: attempt.id,
            observed_status: attempt.status,
            current_status: result.row && result.row.status,
          }
        );
      }

      return Object.freeze({ attempt: result.row, replay: false });
    });
  }

  async function attachExternalTransaction({
    attempt_id: attemptId,
    external_transaction_id: externalTransactionId,
  } = {}) {
    if (typeof externalTransactionId !== 'string' || !externalTransactionId.trim()) {
      throw new PaymentDomainError('external_transaction_id is required', {
        code: 'PAYMENT_EXTERNAL_TRANSACTION_REQUIRED',
      });
    }

    return unitOfWork.run(async (trx) => {
      const attempts = paymentAttemptRepository.withTransaction(trx);
      const current = await attempts.findById(attemptId);
      if (!current) {
        throw new PaymentDomainError('PaymentAttempt was not found', {
          code: 'PAYMENT_ATTEMPT_NOT_FOUND',
          attempt_id: attemptId,
        });
      }

      if (
        current.external_transaction_id
        && current.external_transaction_id !== externalTransactionId
      ) {
        throw new PaymentDomainError(
          'PaymentAttempt already owns a different external transaction',
          {
            code: 'PAYMENT_EXTERNAL_TRANSACTION_CONFLICT',
            attempt_id: current.id,
          }
        );
      }

      const result = await attempts.attachExternalTransactionId(current.id, {
        externalTransactionId: externalTransactionId.trim(),
        updatedAt: clock.now(),
      });

      if (!result.attached) {
        throw new PaymentDomainError('External transaction could not be attached', {
          code: 'PAYMENT_EXTERNAL_TRANSACTION_CONFLICT',
          attempt_id: current.id,
        });
      }

      return Object.freeze({ attempt: result.row });
    });
  }

  return Object.freeze({
    createObligation,
    getPayment,
    beginAttempt,
    transitionPayment,
    transitionAttempt,
    attachExternalTransaction,
  });
}

module.exports = {
  createPaymentApplicationService,
  createSystemClock,
};
