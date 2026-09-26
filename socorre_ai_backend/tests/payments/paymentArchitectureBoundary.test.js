'use strict';

const fs = require('fs');
const path = require('path');

const DOMAIN_DIR = path.join(__dirname, '../../src/modules/payments/domain');
const APPLICATION_DIR = path.join(__dirname, '../../src/modules/payments/application');

function listJsFiles(dir) {
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(dir, name));
}

describe('Payments architecture boundaries', () => {
  test.each([DOMAIN_DIR, APPLICATION_DIR])('%s does not import HTTP, concrete providers, or legacy payment services', (targetDir) => {
    const forbidden = [
      "require('express')",
      'require("express")',
      "require('knex')",
      'require("knex")',
      'config/database',
      'services/paymentService',
      'services/gateways',
      'stripe',
      'mercadopago',
      'pagseguro',
    ];

    for (const file of listJsFiles(targetDir)) {
      const source = fs.readFileSync(file, 'utf8').toLowerCase();
      for (const token of forbidden) {
        expect(source).not.toContain(token.toLowerCase());
      }
    }
  });
});
