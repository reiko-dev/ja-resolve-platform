'use strict';

const {
  createPaymentObligationRepository,
} = require('./adapters/persistence/payment-obligation-repository');
const {
  createPaymentAttemptRepository,
} = require('./adapters/persistence/payment-attempt-repository');
const {
  createPaymentUnitOfWork,
} = require('./adapters/persistence/unit-of-work');
const {
  createPaymentApplicationService,
  createSystemClock,
} = require('./application/payment-service');

/**
 * Composition root for the internal Payment Platform.
 *
 * Intentionally has no Express router and no provider SDK. Source domains can
 * consume the application service directly during Phase 3/4 migrations.
 */
function createPaymentPlatform({ db, clock = createSystemClock() } = {}) {
  if (!db) throw new TypeError('createPaymentPlatform requires db');

  const paymentRepository = createPaymentObligationRepository(db);
  const paymentAttemptRepository = createPaymentAttemptRepository(db);
  const unitOfWork = createPaymentUnitOfWork(db);

  const paymentService = createPaymentApplicationService({
    paymentRepository,
    paymentAttemptRepository,
    unitOfWork,
    clock,
  });

  return Object.freeze({
    paymentService,
    paymentRepository,
    paymentAttemptRepository,
    unitOfWork,
  });
}

module.exports = { createPaymentPlatform };
