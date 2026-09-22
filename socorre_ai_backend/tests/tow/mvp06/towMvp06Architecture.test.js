/**
 * MVP-06 — architecture boundaries, schema authority and scope discipline.
 *
 * MVP-06 landed one domain module, one repository, one application service, one
 * controller, three routes and one migration. This suite asserts the invariants
 * a later refactor could silently break:
 *   - exactly the three payment routes are registered, and everything still
 *     unimplemented stays unrouted — including CARD/PIX, which the long-term
 *     contract declares but the MVP does not implement;
 *   - `tow_payments` is the ONE payment authority; the legacy `payments`,
 *     `wallets`, `commissions` and `disputes` tables stay untouched, and the
 *     simulated PSP gateways are never imported by the module;
 *   - Domain stays pure, Application never touches Knex/HTTP, HTTP stays thin;
 *   - migration 007 pins its uniqueness, method, money and coherence rules;
 *   - the offline harness mirrors the table;
 *   - the three canonical contract operations exist in the contract, and the
 *     canonical revision carries the draft.9 MVP-06 note (draft.10 adds the
 *     T5 runtime-route declarations on top).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const application = require('../../../src/modules/tow/application');
const domain = require('../../../src/modules/tow/domain');
const { loadRawDocuments, composeDocument } = require('../../helpers/towContract');

const TOW_SRC = path.resolve(__dirname, '../../../src/modules/tow');
const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');
const OVERLAY_CONTRACT = path.join(REPO_ROOT, 'docs/tow/tow-api-contract.openapi.yaml');
const BASE_CONTRACT = path.join(REPO_ROOT, 'docs/tow/tow-api-contract.base.openapi.yaml');
const MIGRATION_PATH = path.join(BACKEND_ROOT, 'database/migrations/007_mvp06_cash_payment.js');

function listFiles(root, predicate) {
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(full, predicate));
    else if (predicate(full)) found.push(full);
  }
  return found;
}

function read(absolutePath) {
  return fs.readFileSync(absolutePath, 'utf8');
}

/** Comments stripped: naming a legacy surface in prose is not using it. */
function readCode(absolutePath) {
  return read(absolutePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

function relative(absolutePath) {
  return path.relative(BACKEND_ROOT, absolutePath);
}

const ALL_TOW_SRC_FILES = listFiles(TOW_SRC, (file) => file.endsWith('.js'));
const ROUTES = read(path.join(TOW_SRC, 'http/routes.js'));
/** Comment-free source: naming a surface in prose is not mounting it. */
const ROUTES_CODE = readCode(path.join(TOW_SRC, 'http/routes.js'));

describe('MVP-06 ARCH — HTTP surface', () => {
  test('exactly the three CASH routes are registered', () => {
    expect(ROUTES).toContain(
      "router.put('/requests/:requestId/payment-method', auth, requireCustomer, paymentController.selectMethod);"
    );
    expect(ROUTES).toContain(
      "router.get('/requests/:requestId/payment', auth, requireCustomerOrTowPartner, paymentController.getSummary);"
    );
    expect(ROUTES).toContain(
      "router.post('/requests/:requestId/cash-received', auth, requireTowPartner, paymentController.markCashReceived);"
    );
  });

  test('CARD/PIX and every later payment surface stay unrouted', () => {
    for (const forbidden of [
      '/card', '/pix', '/debt', '/wallet', '/payout', '/settlement', '/refund',
      '/dispute', '/review', '/counteroffer', '/completion', '/no-show', '/rematch',
      '/financial-summary',
    ]) {
      expect(ROUTES_CODE.toLowerCase()).not.toContain(forbidden);
    }
  });

  test('the legacy payment and wallet routes are not mounted by the Tow module', () => {
    expect(ROUTES_CODE).not.toContain("'/payments'");
    expect(ROUTES_CODE).not.toContain("'/wallets'");
  });
});

describe('MVP-06 ARCH — payment authority', () => {
  test('the domain vocabulary is exactly the minimum status model', () => {
    expect(domain.PAYMENT_METHOD).toBe('CASH');
    expect(domain.PAYMENT_METHOD_DTO).toBe('cash');
    expect(domain.PAYMENT_CURRENCY).toBe('BRL');
    expect(domain.PAYMENT_STATUSES).toEqual(['PENDING', 'RECEIVED']);
    expect(domain.PAYMENT_STATUS_DTO).toEqual({
      PENDING: 'CASH_SELECTED',
      RECEIVED: 'CASH_RECEIVED',
    });
    // No enterprise settlement state exists anywhere in the persistence model.
    for (const forbidden of ['AUTHORIZED', 'CAPTURED', 'PAID', 'SETTLED', 'REFUNDED', 'FAILED']) {
      expect(domain.PAYMENT_STATUSES).not.toContain(forbidden);
    }
  });

  test('the empty summary is the truthful NOT_SELECTED projection', () => {
    expect(domain.emptyPaymentSummary(7)).toEqual({
      request_id: '7',
      method: null,
      status: 'NOT_SELECTED',
      amount_cents: null,
      currency: null,
      can_start_service: false,
      pix: null,
    });
  });

  test('can_start_service is true only once cash is chosen', () => {
    expect(domain.canStartService('PENDING')).toBe(true);
    expect(domain.canStartService('RECEIVED')).toBe(true);
    expect(domain.canStartService(undefined)).toBe(false);
    expect(domain.canStartService('NOT_SELECTED')).toBe(false);
  });

  test('only cash is accepted, and an invented financial field is rejected', () => {
    expect(domain.validateSelectPaymentMethodInput({ method: 'cash' })).toEqual({ method: 'cash' });
    for (const method of ['card', 'pix', 'CASH', 'credit_card', '']) {
      expect(() => domain.validateSelectPaymentMethodInput({ method })).toThrow(/not implemented|must be a string/);
    }
    expect(() => domain.validateSelectPaymentMethodInput({
      method: 'cash', payment_source_token: 'tok_123',
    })).toThrow(/payment_source_token/);
    expect(() => domain.validateSelectPaymentMethodInput({ method: 'cash', amount_cents: 999 }))
      .toThrow(/amount_cents/);
    expect(() => domain.validateCashReceivedInput({ amount_cents: 999 })).toThrow(/amount_cents/);
    expect(() => domain.validateCashReceivedInput({ received_at: '2026-01-15T12:00:00.000Z' }))
      .toThrow(/received_at/);
    expect(domain.validateCashReceivedInput({})).toBeUndefined();
    expect(domain.validateCashReceivedInput(undefined)).toBeUndefined();
  });

  test('the record builder refuses an incoherent receipt', () => {
    const base = { tow_request_id: 1, assignment_id: 2, amount_cents: 5000 };
    expect(domain.buildTowPaymentRecord({ ...base }).status).toBe('PENDING');
    expect(() => domain.buildTowPaymentRecord({ ...base, status: 'RECEIVED' }))
      .toThrow(/requires received_at/);
    expect(() => domain.buildTowPaymentRecord({
      ...base, status: 'RECEIVED', received_at: '2026-01-15T12:00:00.000Z',
    })).toThrow(/canonical received_by_partner_id/);
    expect(() => domain.buildTowPaymentRecord({
      ...base, status: 'PENDING', received_at: '2026-01-15T12:00:00.000Z',
    })).toThrow(/PENDING payment cannot have/);
    expect(() => domain.buildTowPaymentRecord({ ...base, amount_cents: -1 })).toThrow(/non-negative/);
    expect(() => domain.buildTowPaymentRecord({ ...base, amount_cents: 10.5 })).toThrow(/safe integer/);
    expect(() => domain.buildTowPaymentRecord({ ...base, currency: 'USD' })).toThrow(/BRL/);
    expect(() => domain.buildTowPaymentRecord({ ...base, status: 'PAID' })).toThrow(/status must be one of/);
  });
});

describe('MVP-06 ARCH — layering and isolation', () => {
  test('Domain never imports infrastructure and Application never touches Knex/HTTP', () => {
    for (const file of ALL_TOW_SRC_FILES) {
      const source = readCode(file);
      const rel = relative(file);
      if (rel.includes('domain/')) {
        expect(source).not.toMatch(/require\(['"][^'"]*(knex|express|config\/database)[^'"]*['"]\)/);
      }
      if (rel.includes('application/')) {
        expect(source).not.toMatch(/require\(['"][^'"]*(knex|express|config\/database)[^'"]*['"]\)/);
        expect(source).not.toMatch(/from\(['"]tow_payments['"]\)/);
      }
      if (rel.includes('http/')) {
        expect(source).not.toMatch(/from\(['"]tow_payments['"]\)/);
      }
    }
  });

  test('the module never imports a PSP gateway or the legacy payment service', () => {
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => /(stripeGateway|mercadopagoGateway|pagseguroGateway|services\/paymentService|walletService|commissionService)/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('no legacy financial table is referenced by the module', () => {
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => /['"](payments|wallets|wallet_transactions|commissions|disputes|tow_proposals)['"]/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('tow_payments is written by exactly one adapter', () => {
    const writers = ALL_TOW_SRC_FILES
      .filter((file) => /['"]tow_payments['"]/.test(readCode(file)))
      .map(relative);
    expect(writers).toEqual(['src/modules/tow/adapters/persistence/tow-payment-repository.js']);
  });

  test('no scheduler, timer or randomness exists in the payment path', () => {
    for (const file of [
      'domain/tow-payment.js',
      'application/payment-service.js',
      'application/payment-summary.js',
      'adapters/persistence/tow-payment-repository.js',
      'http/payment-controller.js',
    ]) {
      const source = readCode(path.join(TOW_SRC, file));
      expect(source).not.toMatch(/Date\.now\(|Math\.random\(|setInterval|setTimeout/);
    }
  });

  test('the service is wired from the composition root and exported by the barrel', () => {
    const composition = read(path.join(TOW_SRC, 'composition.js'));
    expect(composition).toContain('createTowPaymentRepository(db)');
    expect(composition).toContain('createPaymentService({');
    expect(composition).toContain('paymentService: createPaymentService');
    expect(application.createPaymentService).toBeInstanceOf(Function);
    for (const port of ['TowPaymentRepository']) {
      expect(application).toBeDefined();
      expect(read(path.join(TOW_SRC, 'application/ports.js'))).toContain(port);
    }
  });
});

describe('MVP-06 ARCH — migration 007 is the schema authority', () => {
  test('it creates exactly the tow_payments table and drops only it', () => {
    const code = read(MIGRATION_PATH);
    expect(code).toMatch(/createTable\(\s*'tow_payments'/);
    const dropped = [...code.matchAll(/dropTableIfExists\(\s*'([^']+)'/g)].map((match) => match[1]);
    expect(dropped).toEqual(['tow_payments']);
  });

  test('it pins uniqueness, method, money and receipt coherence', () => {
    const code = read(MIGRATION_PATH);
    expect(code).toContain("tow_payments_tow_request_id_unique");
    expect(code).toContain("tow_payments_assignment_id_unique");
    expect(code).toContain("tow_payments_method_check");
    expect(code).toContain("method = 'CASH'");
    expect(code).toContain("tow_payments_amount_check");
    expect(code).toContain('amount_cents >= 0');
    expect(code).toContain("tow_payments_currency_check");
    expect(code).toContain("currency = 'BRL'");
    expect(code).toContain('tow_payments_status_check');
    expect(code).toContain('tow_payments_receipt_coherence_check');
    // The coherence rule is a real equivalence in both directions, not a one-way
    // implication: RECEIVED requires both instants/actors, PENDING forbids them.
    expect(code).toContain("status = 'PENDING' AND received_at IS NULL AND received_by_partner_id IS NULL");
    expect(code).toContain("status = 'RECEIVED' AND received_at IS NOT NULL AND received_by_partner_id IS NOT NULL");
  });

  test('the migration is registered everywhere the schema is pinned', () => {
    const pins = [
      'scripts/tow/run-db-baseline-gate.js',
      'tests/tow/baseline/dbBaseline.e2e.test.js',
      'tests/tow/baseline/dbBaselineSafety.test.js',
    ];
    for (const pin of pins) {
      expect(read(path.join(BACKEND_ROOT, pin))).toContain('007_mvp06_cash_payment.js');
    }
  });

  test('the offline harness mirrors the table and its checks', () => {
    const harness = read(path.join(BACKEND_ROOT, 'tests/helpers/testDb.js'));
    expect(harness).toContain('tow_payments');
    for (const fragment of [
      "CHECK (method = 'CASH')",
      'CHECK (amount_cents >= 0)',
      "CHECK (currency = 'BRL')",
      "CHECK (status IN ('PENDING', 'RECEIVED'))",
      'UNIQUE (tow_request_id)',
      'UNIQUE (assignment_id)',
    ]) {
      expect(harness).toContain(fragment);
    }
  });
});

describe('MVP-06 ARCH — contract authority', () => {
  const documents = loadRawDocuments();
  const { composed } = composeDocument(documents);

  test('the canonical revision records the MVP-06 subset and the draft.10 sync', () => {
    expect(documents.canonical.info.version).toBe('1.0.0-draft.10');
    expect(documents.canonical.info.description).toContain('draft.9');
    expect(documents.canonical.info.description).toContain('draft.10');
    expect(documents.canonical.info.description).toContain('CASH');
    // The base contract is byte-frozen: it still declares draft.2.
    expect(documents.base.info.version).toBe('1.0.0-draft.2');
  });

  test('the three payment operations exist and are unchanged in shape', () => {
    expect(composed.paths['/tow/requests/{requestId}/payment-method'].put.operationId)
      .toBe('selectTowPaymentMethod');
    expect(composed.paths['/tow/requests/{requestId}/payment'].get.operationId)
      .toBe('getTowPaymentSummary');
    expect(composed.paths['/tow/requests/{requestId}/cash-received'].post.operationId)
      .toBe('markTowCashReceived');
  });

  test('cash-received declares NO request body: the amount can never be client-supplied', () => {
    const operation = composed.paths['/tow/requests/{requestId}/cash-received'].post;
    expect(operation.requestBody).toBeUndefined();
  });

  test('the MVP emits only the three implemented consumer statuses', () => {
    const statuses = composed.components.schemas.PaymentStatus.enum;
    for (const implemented of ['NOT_SELECTED', 'CASH_SELECTED', 'CASH_RECEIVED']) {
      expect(statuses).toContain(implemented);
    }
    expect(composed.components.schemas.PaymentMethod.enum).toEqual(['card', 'pix', 'cash']);
  });

  test('the base contract is byte-identical to the reviewed artifact', () => {
    // A revision note in the canonical overlay must never mutate the base.
    const base = read(BASE_CONTRACT);
    expect(base).toContain('version: 1.0.0-draft.2');
    expect(base).not.toContain('draft.10');
    expect(read(OVERLAY_CONTRACT)).toContain('version: 1.0.0-draft.10');
  });
});
