/**
 * MVP-06 — CASH payment controllers (thin).
 *
 * HTTP in, contract envelope out. No amount, no currency, no method rule and no
 * authorization decision is computed here: the body is passed to the domain
 * validator, the principal comes only from the authenticated context
 * (`req.user.id` for the customer, `req.user.partner_id` for the partner) and
 * every business outcome is a `TowError` mapped by the shared error mapper.
 *
 * `markCashReceived` deliberately forwards `req.body` so an invented financial
 * field is REJECTED by the domain (422) instead of being silently dropped.
 */
'use strict';

const { handle } = require('./error-mapper');

function createPaymentController({ paymentService }) {
  if (!paymentService) throw new TypeError('createPaymentController requires a paymentService');

  return {
    /**
     * `PUT /tow/requests/{requestId}/payment-method` (owning customer).
     */
    selectMethod: handle(async (req, res) => {
      const summary = await paymentService.selectMethod({
        customerId: req.user.id,
        requestId: req.params.requestId,
        payload: req.body,
        idempotencyKey: req.get('Idempotency-Key'),
      });
      res.json({ success: true, data: summary });
    }),

    /**
     * `POST /tow/requests/{requestId}/cash-received` (assigned partner).
     */
    markCashReceived: handle(async (req, res) => {
      const summary = await paymentService.markCashReceived({
        partnerId: req.user.partner_id,
        requestId: req.params.requestId,
        payload: req.body,
        idempotencyKey: req.get('Idempotency-Key'),
      });
      res.json({ success: true, data: summary });
    }),

    /**
     * `GET /tow/requests/{requestId}/payment` (owner customer OR assigned
     * partner). Exactly one identity is forwarded; never both.
     */
    getSummary: handle(async (req, res) => {
      const isCustomer = req.user.role === 'user';
      const summary = await paymentService.getSummary({
        requestId: req.params.requestId,
        customerId: isCustomer ? req.user.id : null,
        partnerId: isCustomer ? null : req.user.partner_id,
      });
      res.json({ success: true, data: summary });
    }),
  };
}

module.exports = { createPaymentController };
