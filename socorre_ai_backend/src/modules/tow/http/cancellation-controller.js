/**
 * MVP-05 — cancellation controllers (thin).
 *
 * The two routes differ ONLY in the principal they read from the authenticated
 * context and in the body validator the application applies: the customer's
 * reason is optional, the partner's is required. The response is the canonical
 * envelope of the contract — the updated request PLUS the frozen
 * `financial_consequence` of this delivery (zero fee, zero debt, no refund) —
 * built by the application layer, never assembled here.
 */
'use strict';

const { handle } = require('./error-mapper');

function createCancellationController({ cancellationService }) {
  return {
    cancelByCustomer: handle(async (req, res) => {
      const data = await cancellationService.cancelByCustomer({
        customerId: req.user.id,
        requestId: req.params.requestId,
        payload: req.body,
        idempotencyKey: req.get('Idempotency-Key'),
      });
      res.json({ success: true, data });
    }),

    cancelByPartner: handle(async (req, res) => {
      const data = await cancellationService.cancelByPartner({
        partnerId: req.user.partner_id,
        requestId: req.params.requestId,
        payload: req.body,
        idempotencyKey: req.get('Idempotency-Key'),
      });
      res.json({ success: true, data });
    }),
  };
}

module.exports = { createCancellationController };
