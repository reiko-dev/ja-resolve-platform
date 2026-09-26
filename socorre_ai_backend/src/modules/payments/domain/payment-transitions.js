'use strict';

const { paymentValidationError } = require('./errors');
const {
  PAYMENT_STATUSES,
  PAYMENT_ATTEMPT_STATUSES,
} = require('./vocabulary');

const PAYMENT_TRANSITIONS = Object.freeze({
  [PAYMENT_STATUSES.PENDING]: Object.freeze([
    PAYMENT_STATUSES.PROCESSING,
    PAYMENT_STATUSES.PAID,
    PAYMENT_STATUSES.CANCELLED,
    PAYMENT_STATUSES.EXPIRED,
  ]),
  [PAYMENT_STATUSES.PROCESSING]: Object.freeze([
    PAYMENT_STATUSES.PENDING,
    PAYMENT_STATUSES.PAID,
    PAYMENT_STATUSES.FAILED,
    PAYMENT_STATUSES.CANCELLED,
    PAYMENT_STATUSES.EXPIRED,
  ]),
  [PAYMENT_STATUSES.FAILED]: Object.freeze([
    PAYMENT_STATUSES.PROCESSING,
    PAYMENT_STATUSES.CANCELLED,
    PAYMENT_STATUSES.EXPIRED,
  ]),
  [PAYMENT_STATUSES.PAID]: Object.freeze([]),
  [PAYMENT_STATUSES.CANCELLED]: Object.freeze([]),
  [PAYMENT_STATUSES.EXPIRED]: Object.freeze([]),
});

const ATTEMPT_TRANSITIONS = Object.freeze({
  [PAYMENT_ATTEMPT_STATUSES.PENDING]: Object.freeze([
    PAYMENT_ATTEMPT_STATUSES.PROCESSING,
    PAYMENT_ATTEMPT_STATUSES.SUCCEEDED,
    PAYMENT_ATTEMPT_STATUSES.FAILED,
    PAYMENT_ATTEMPT_STATUSES.CANCELLED,
  ]),
  [PAYMENT_ATTEMPT_STATUSES.PROCESSING]: Object.freeze([
    PAYMENT_ATTEMPT_STATUSES.SUCCEEDED,
    PAYMENT_ATTEMPT_STATUSES.FAILED,
    PAYMENT_ATTEMPT_STATUSES.CANCELLED,
  ]),
  [PAYMENT_ATTEMPT_STATUSES.SUCCEEDED]: Object.freeze([]),
  [PAYMENT_ATTEMPT_STATUSES.FAILED]: Object.freeze([]),
  [PAYMENT_ATTEMPT_STATUSES.CANCELLED]: Object.freeze([]),
});

function assertKnownStatus(status, vocabulary, field) {
  if (!Object.values(vocabulary).includes(status)) {
    throw paymentValidationError(field + ' is not supported', {
      field,
      value: status,
    });
  }
}

function assertTransition(map, vocabulary, from, to, kind) {
  assertKnownStatus(from, vocabulary, kind + '_status_from');
  assertKnownStatus(to, vocabulary, kind + '_status_to');

  if (from === to) return Object.freeze({ from, to, replay: true });

  if (!map[from].includes(to)) {
    throw paymentValidationError(
      'invalid ' + kind + ' status transition: ' + from + ' -> ' + to,
      {
        code: 'INVALID_' + kind.toUpperCase() + '_TRANSITION',
        from,
        to,
      }
    );
  }

  return Object.freeze({ from, to, replay: false });
}

function assertPaymentTransition(from, to) {
  return assertTransition(
    PAYMENT_TRANSITIONS,
    PAYMENT_STATUSES,
    from,
    to,
    'payment'
  );
}

function assertPaymentAttemptTransition(from, to) {
  return assertTransition(
    ATTEMPT_TRANSITIONS,
    PAYMENT_ATTEMPT_STATUSES,
    from,
    to,
    'payment_attempt'
  );
}

module.exports = {
  PAYMENT_TRANSITIONS,
  ATTEMPT_TRANSITIONS,
  assertPaymentTransition,
  assertPaymentAttemptTransition,
};
