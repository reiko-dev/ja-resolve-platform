'use strict';

const domain = require('./domain');
const processorPort = require('./ports/payment-processor');

module.exports = {
  ...domain,
  ...processorPort,
  domain,
  ports: {
    paymentProcessor: processorPort,
  },
};
