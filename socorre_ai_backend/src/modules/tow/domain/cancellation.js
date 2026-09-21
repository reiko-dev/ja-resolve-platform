/**
 * MVP-05 — cancellation: the actor, the reason and the FINANCIAL CONSEQUENCE.
 *
 * This delivery implements *basic* cancellation: a job that has not started
 * transit may be dropped by the owning customer or by the assigned partner, and
 * dropping it is FREE. That is not an omission to be filled in later by an
 * adapter — it is the frozen product decision of MVP-05, so it lives in the pure
 * layer as a constant that every response is built from:
 *
 *     fee_due_cents: 0, currency: 'BRL', customer_debt_created: false
 *
 * There is deliberately no `refund_status` member: a refund is only meaningful
 * once a charge exists, and no MVP-05 cancellation can create one. Emitting
 * `refund_status: null` would advertise a lifecycle the module does not have.
 * Fees, debt, refunds and re-matching are later deliveries; when one of them
 * lands it must REPLACE this function, and the contract revision that introduces
 * it is the place the change becomes visible.
 *
 * The actor type is the persisted attribution of the cancellation
 * (`cancelled_by_actor_type`), and it is also what selects the request's
 * `terminal_reason`: `customer` -> `CUSTOMER_CANCELLED`,
 * `partner` -> `PARTNER_CANCELLED`. The pair `(actor_type, actor_id)` is written
 * together and never rewritten: a replay returns the original attribution.
 */
'use strict';

const { CANCELLATION_ACTOR_TYPES } = require('./tow-request-state-machine');

/** The exact, frozen financial consequence of an MVP-05 cancellation. */
const CANCELLATION_FINANCIAL_CONSEQUENCE = Object.freeze({
  fee_due_cents: 0,
  currency: 'BRL',
  customer_debt_created: false,
});

/** @param {unknown} actorType @returns {boolean} */
function isCancellationActorType(actorType) {
  return CANCELLATION_ACTOR_TYPES.includes(actorType);
}

/**
 * @param {unknown} actorType `customer` | `partner`
 * @returns {{fee_due_cents: number, currency: string, customer_debt_created: boolean}}
 * a fresh plain object (never the frozen singleton), so a JSON serializer can
 * never be handed a shared mutable reference.
 */
function buildCancellationFinancialConsequence(actorType) {
  if (!isCancellationActorType(actorType)) {
    throw new TypeError(`unknown cancellation actor type: ${actorType}`);
  }
  return {
    fee_due_cents: CANCELLATION_FINANCIAL_CONSEQUENCE.fee_due_cents,
    currency: CANCELLATION_FINANCIAL_CONSEQUENCE.currency,
    customer_debt_created: CANCELLATION_FINANCIAL_CONSEQUENCE.customer_debt_created,
  };
}

module.exports = {
  CANCELLATION_FINANCIAL_CONSEQUENCE,
  isCancellationActorType,
  buildCancellationFinancialConsequence,
};
