/**
 * MVP-04 — proposal lifecycle + accept controllers (thin).
 *
 * The controller translates HTTP into an application call and the result into
 * the contract envelope. It contains no business rule: no price, no distance, no
 * eligibility, no expiry and no status transition is ever decided here.
 *
 * Two details are deliberate:
 *   - the identity is ALWAYS taken from the authenticated context
 *     (`req.user.partner_id` / `req.user.id`) and never from the body or the
 *     query, so no client can propose or accept on behalf of somebody else;
 *   - the `Idempotency-Key` header is REQUIRED by the canonical contract on
 *     create, accept and withdraw, and is read here (never from the body) so the
 *     application layer validates it before any mutation. On accept and withdraw
 *     it is a CONTRACT requirement, not the idempotency authority: the proposal
 *     id and the PostgreSQL unique constraints still decide what a replay means;
 *   - the DTOs come from the domain builders (`buildTowProposalDto`,
 *     `buildAssignmentDto`, `buildTowRequestDto`), so `allowed_actions`,
 *     `assignment` and the proposal projection cannot be widened by transport.
 */
'use strict';

const { handle } = require('./error-mapper');

function createProposalController({ proposalService, assignmentService }) {
  return {
    create: handle(async (req, res) => {
      const created = await proposalService.createForPartner({
        partnerId: req.user.partner_id,
        requestId: req.params.requestId,
        idempotencyKey: req.get('Idempotency-Key'),
        body: req.body,
      });
      res.status(201).json({ success: true, data: created });
    }),

    listForRequest: handle(async (req, res) => {
      const result = await proposalService.listForRequest({
        customerId: req.user.id,
        requestId: req.params.requestId,
        query: req.query,
      });
      res.json({ success: true, data: result });
    }),

    listForPartner: handle(async (req, res) => {
      const result = await proposalService.listForPartner({
        partnerId: req.user.partner_id,
        query: req.query,
      });
      res.json({ success: true, data: result });
    }),

    accept: handle(async (req, res) => {
      const assigned = await assignmentService.accept({
        customerId: req.user.id,
        proposalId: req.params.proposalId,
        idempotencyKey: req.get('Idempotency-Key'),
      });
      res.json({ success: true, data: assigned });
    }),

    withdraw: handle(async (req, res) => {
      const withdrawn = await proposalService.withdraw({
        partnerId: req.user.partner_id,
        proposalId: req.params.proposalId,
        idempotencyKey: req.get('Idempotency-Key'),
      });
      res.json({ success: true, data: withdrawn });
    }),
  };
}

module.exports = { createProposalController };
