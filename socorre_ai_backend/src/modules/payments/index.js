'use strict';

const domain = require('./domain');
const processorPort = require('./ports/payment-processor');
const paymentRepositoryPort = require('./ports/payment-repository');
const paymentAttemptRepositoryPort = require('./ports/payment-attempt-repository');
const unitOfWorkPort = require('./ports/unit-of-work');
const { createPaymentApplicationService } = require('./application/payment-service');
const { createPaymentPlatform } = require('./composition');

module.exports = {
  ...domain,
  ...processorPort,
  createPaymentApplicationService,
  createPaymentPlatform,
  domain,
  ports: {
    paymentProcessor: processorPort,
    paymentRepository: paymentRepositoryPort,
    paymentAttemptRepository: paymentAttemptRepositoryPort,
    unitOfWork: unitOfWorkPort,
  },
};
