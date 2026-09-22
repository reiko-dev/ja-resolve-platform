/**
 * S-12 — payment gateways must never log card, PIX or bank-slip payloads.
 *
 * `paymentData` is `{ ...req.body, userId }` (no whitelist) and
 * `paymentService.processPayment` forwards `cardData` / `pixData` /
 * `bankSlipData` into the gateway, so the gateway log call is the last line of
 * defence. The gateways are simulated, which makes this assertion deterministic.
 */
'use strict';

const gateways = [
  { name: 'stripe', gateway: require('../../src/services/gateways/stripeGateway') },
  { name: 'mercadopago', gateway: require('../../src/services/gateways/mercadopagoGateway') },
  { name: 'pagseguro', gateway: require('../../src/services/gateways/pagseguroGateway') },
];

const SENSITIVE_VALUES = [
  '4111111111111111',
  '123',
  'Sensitive Holder',
  'sensitive-pix-key@example.com',
  '12345678900',
];

const paymentData = {
  amount: 184.8,
  currency: 'BRL',
  method: 'credit_card',
  description: 'Tow service',
  referenceId: 'ref-s12-0001',
  cardData: { number: '4111111111111111', cvv: '123', holder: 'Sensitive Holder' },
  pixData: { key: 'sensitive-pix-key@example.com' },
  bankSlipData: { document: '12345678900' },
};

function outputOf(spy) {
  return spy.mock.calls
    .map((args) => args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '))
    .join('\n');
}

describe.each(gateways)('S-12 — $name gateway payload logging', ({ gateway }) => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    jest.useFakeTimers();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('processPayment never logs card, PIX or bank-slip data', async () => {
    const pending = gateway.processPayment({ ...paymentData });
    await jest.advanceTimersByTimeAsync(2000);
    await pending;

    const output = outputOf(logSpy);
    for (const value of SENSITIVE_VALUES) {
      expect(output).not.toContain(value);
    }
    expect(output).not.toMatch(/cardData|pixData|bankSlipData/);
  });

  test('processPayment still logs a correlation-safe summary', async () => {
    const pending = gateway.processPayment({ ...paymentData });
    await jest.advanceTimersByTimeAsync(2000);
    await pending;

    const output = outputOf(logSpy);
    expect(output).toContain('credit_card');
    expect(output).toContain('ref-s12-0001');
  });
});
