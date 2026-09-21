/**
 * MVP-05 — service execution controllers (thin).
 *
 * Four POSTs, one application call each. The controller decides nothing: no
 * state, no milestone, no release, no ownership. In particular the partner
 * identity comes ONLY from `req.user.partner_id` and the `Idempotency-Key` ONLY
 * from the header, so a body can never widen either.
 *
 * The success status is 200, not 201: these operations do not create a resource,
 * they move the canonical request to its next state and return it.
 */
'use strict';

const { handle } = require('./error-mapper');

function createExecutionController({ executionService }) {
  const progress = (method) => handle(async (req, res) => {
    const updated = await executionService[method]({
      partnerId: req.user.partner_id,
      requestId: req.params.requestId,
      payload: req.body,
      idempotencyKey: req.get('Idempotency-Key'),
    });
    res.json({ success: true, data: updated });
  });

  return {
    startEnRoute: progress('startEnRoute'),
    markArrived: progress('markArrived'),
    startInTransit: progress('startInTransit'),
    finishService: progress('finishService'),
  };
}

module.exports = { createExecutionController };
