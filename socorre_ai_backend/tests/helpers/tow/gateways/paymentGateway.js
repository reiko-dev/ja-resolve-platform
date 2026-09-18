/**
 * T00 — deterministic fake payment gateway port.
 *
 * BOUNDARY (do not cross in T00)
 * ------------------------------
 * Port double only: records calls and replays a deterministic canned result.
 * It NEVER decides payment status policy, never computes fees, splits,
 * commissions, wallet balances, settlement or payout amounts. Those belong to
 * the Tow payment/settlement tasks (T10+) and to TOW-PRICING-CONTRACT.md.
 *
 * Why this exists: the current `src/services/gateways/*Gateway.js` doubles are
 * non-deterministic — they call `Date.now()`, `Math.random()` and sleep with
 * real `setTimeout` (e.g. `stripeGateway.js` `await new Promise(r =>
 * setTimeout(r, 1000))`), so two runs of the same test produce different
 * transaction ids and different timing. See the T00 audit for the RED evidence.
 *
 * Shape mirrors the existing gateway contract
 * (`processPayment(paymentData) -> { transactionId, paymentId, status,
 * gateway, response }`) so T01+ can inject it without touching call sites.
 */
'use strict';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class FakePaymentGateway {
  /**
   * @param {object} [options]
   * @param {string} [options.status]       canned status returned to callers
   * @param {string} [options.gateway]      gateway label reported in the payload
   * @param {object} [options.failure]      { code, message } to throw instead
   * @param {string} [options.transactionId] deterministic id (no Date.now/random)
   */
  constructor(options = {}) {
    this.status = options.status || 'completed';
    this.gateway = options.gateway || 'fake';
    this.failure = options.failure || null;
    this.transactionId = options.transactionId || 'fake-txn-0001';
    this.paymentId = options.paymentId || 'fake-payment-0001';
    this.calls = [];
    this.name = `fake-payment:${this.gateway}`;
  }

  async processPayment(paymentData) {
    this.calls.push({ method: 'processPayment', paymentData: clone(paymentData) });
    if (this.failure) {
      const error = new Error(this.failure.message || 'fake payment failure');
      error.code = this.failure.code || 'PAYMENT_GATEWAY_ERROR';
      throw error;
    }
    return {
      transactionId: this.transactionId,
      paymentId: this.paymentId,
      status: this.status,
      gateway: this.gateway,
      response: {
        id: this.paymentId,
        status: this.status,
        // Echoed back verbatim: the fake never derives amounts.
        amount: paymentData ? paymentData.amount : undefined,
        currency: paymentData ? paymentData.currency : undefined,
        method: paymentData ? paymentData.method : undefined,
        referenceId: paymentData ? paymentData.referenceId : undefined,
      },
    };
  }

  async getPaymentStatus(transactionId) {
    this.calls.push({ method: 'getPaymentStatus', transactionId });
    if (this.failure) {
      const error = new Error(this.failure.message || 'fake payment failure');
      error.code = this.failure.code || 'PAYMENT_GATEWAY_ERROR';
      throw error;
    }
    return { transactionId, status: this.status, gateway: this.gateway };
  }

  async refund(paymentId, amount) {
    this.calls.push({ method: 'refund', paymentId, amount });
    if (this.failure) {
      const error = new Error(this.failure.message || 'fake payment failure');
      error.code = this.failure.code || 'PAYMENT_GATEWAY_ERROR';
      throw error;
    }
    return { refundId: `${this.paymentId}-refund`, paymentId, amount, status: 'refunded' };
  }

  callCount(method) {
    if (!method) return this.calls.length;
    return this.calls.filter((call) => call.method === method).length;
  }

  lastCall(method) {
    const filtered = method ? this.calls.filter((call) => call.method === method) : this.calls;
    return filtered.length > 0 ? filtered[filtered.length - 1] : null;
  }

  reset() {
    this.calls = [];
    return this;
  }
}

function createFakePaymentGateway(options) {
  return new FakePaymentGateway(options);
}

module.exports = { FakePaymentGateway, createFakePaymentGateway };
