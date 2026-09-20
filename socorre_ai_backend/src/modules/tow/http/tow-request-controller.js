/**
 * MVP-03 — TowRequest + matching controllers (thin).
 *
 * The controller translates HTTP into an application call and the result into
 * the contract envelope. It contains no business rule: no radius, no distance,
 * no eligibility and no price is ever computed here.
 *
 * `allowed_actions` is emitted by the domain DTO builder, so the truthful empty
 * list of MVP-03 cannot be widened by the transport layer.
 */
'use strict';

const { handle } = require('./error-mapper');
const { serializeOpportunity } = require('./serialize');

function createTowRequestController({ towRequestService }) {
  return {
    create: handle(async (req, res) => {
      const created = await towRequestService.create({
        customerId: req.user.id,
        payload: req.body,
        idempotencyKey: req.get('Idempotency-Key'),
      });
      res.status(201).json({ success: true, data: created });
    }),

    get: handle(async (req, res) => {
      const found = await towRequestService.getForCustomer({
        customerId: req.user.id,
        requestId: req.params.requestId,
      });
      res.json({ success: true, data: found });
    }),

    list: handle(async (req, res) => {
      const result = await towRequestService.listForCustomer({
        customerId: req.user.id,
        query: req.query,
      });
      res.json({ success: true, data: result });
    }),
  };
}

function createMatchingController({ matchingService }) {
  return {
    listOpportunities: handle(async (req, res) => {
      const result = await matchingService.listOpportunitiesForPartner({
        partnerId: req.user.partner_id,
        query: req.query,
      });
      res.json({
        success: true,
        data: {
          items: result.items.map(serializeOpportunity),
          meta: result.meta,
        },
      });
    }),
  };
}

module.exports = { createTowRequestController, createMatchingController };
