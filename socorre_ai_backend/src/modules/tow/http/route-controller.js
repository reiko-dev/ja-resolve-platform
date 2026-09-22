/**
 * B5 — tow request route snapshot controller (thin).
 *
 * `GET /tow/requests/{requestId}/route` is served to TWO principals through the
 * SAME route. Exactly like the tracking read, the controller picks the authority
 * from the AUTHENTICATED ROLE (`req.user.role`) and never from the query or the
 * body: a customer is checked as the request owner, a partner as the assigned
 * partner. The two identities are mutually exclusive, so no downstream branch
 * ever sees both.
 *
 * No distance, no duration, no geometry and no price is computed here: the
 * application service owns the RouteProvider call and the contract DTO.
 */
'use strict';

const { handle } = require('./error-mapper');

function createRouteController({ routeService }) {
  if (!routeService) throw new TypeError('createRouteController requires a routeService');

  return {
    getRoute: handle(async (req, res) => {
      const isPartner = req.user.role === 'partner';
      const data = await routeService.getRequestRoute({
        requestId: req.params.requestId,
        customerId: isPartner ? null : req.user.id,
        partnerId: isPartner ? req.user.partner_id : null,
      });
      res.json({ success: true, data });
    }),
  };
}

module.exports = { createRouteController };
