/**
 * MVP-05 — current-position tracking controllers (thin).
 *
 * `write` is 202 Accepted, not 200: the point is stored as the current position
 * and there is no per-point resource to return — the contract exposes exactly
 * the stored `{latitude, longitude, recorded_at}` triple and nothing else.
 *
 * `read` is served to TWO different principals through the SAME route. The
 * controller picks the authority from the AUTHENTICATED ROLE (`req.user.role`),
 * never from the query or the body: a customer is checked as the request owner,
 * a partner as the assigned partner. That is why `customerId` and `partnerId`
 * are mutually exclusive here — a caller can never present both.
 */
'use strict';

const { handle } = require('./error-mapper');

function createTrackingController({ trackingService }) {
  return {
    write: handle(async (req, res) => {
      const point = await trackingService.write({
        partnerId: req.user.partner_id,
        requestId: req.params.requestId,
        payload: req.body,
        idempotencyKey: req.get('Idempotency-Key'),
      });
      res.status(202).json({ success: true, data: point });
    }),

    read: handle(async (req, res) => {
      const isPartner = req.user.role === 'partner';
      const data = await trackingService.read({
        requestId: req.params.requestId,
        customerId: isPartner ? null : req.user.id,
        partnerId: isPartner ? req.user.partner_id : null,
      });
      res.json({ success: true, data });
    }),
  };
}

module.exports = { createTrackingController };
