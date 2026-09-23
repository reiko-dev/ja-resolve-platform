/**
 * MVP-05 — the TowRequest execution state machine.
 *
 * This file is the SINGLE authority on which execution edge is legal and, since
 * ISSUE #6, on which cancellation operation is legal for WHICH actor. Nothing
 * else in the module may restate the graph: the application services ask this
 * module, and the persistence layer only enforces the answer with a guarded
 * write. That is what keeps the HTTP surface, the transaction and the tests
 * from drifting apart.
 *
 * The execution graph of this delivery (a strict sequence, plus the cancellation
 * edges the owning customer may exercise from ANY non-terminal state):
 *
 *   ASSIGNED   -> EN_ROUTE     `start_en_route`    milestone `en_route_at`
 *   EN_ROUTE   -> ARRIVED      `mark_arrived`      milestone `arrived_at`
 *   ARRIVED    -> IN_TRANSIT   `start_in_transit`  milestone `in_transit_at`
 *   IN_TRANSIT -> COMPLETED    `finish_service`    milestone `completed_at`
 *   ASSIGNED   -> CANCELLED    `cancel`            milestone `cancelled_at`
 *   EN_ROUTE   -> CANCELLED    `cancel`
 *   ARRIVED    -> CANCELLED    `cancel`
 *   IN_TRANSIT -> CANCELLED    `cancel`
 *
 * Everything else is ILLEGAL, and deliberately so:
 *   - no SKIPPING (`ASSIGNED -> ARRIVED`, `ASSIGNED -> COMPLETED`,
 *     `EN_ROUTE -> IN_TRANSIT`, `ARRIVED -> COMPLETED`): a milestone is evidence
 *     that the previous one happened, so it can never be written out of order;
 *   - NOTHING leaves `COMPLETED` or `CANCELLED`: both are terminal, and a
 *     terminal job is history, not a state to be reopened.
 *
 * CANCELLATION is actor-aware, which is why the graph alone never decides it:
 * `IN_TRANSIT -> CANCELLED` exists for the OWNING CUSTOMER (the vehicle can be
 * unloaded and the job closed), while the ASSIGNED PARTNER keeps its frozen
 * pre-transit scope (`ASSIGNED`/`EN_ROUTE`/`ARRIVED` only). `classifyCancellation`
 * is the function the cancellation service must ask; it reads
 * `CANCELLABLE_TOW_REQUEST_STATES_BY_ACTOR` and never the caller's intent.
 *
 * The states `SEARCHING` and `NEGOTIATING` are NOT execution states: they belong
 * to MVP-03/MVP-04, where the customer's other legal action is
 * `accept_proposal`. They ARE cancellable by the owning customer (a request is
 * never hostage to a negotiation), and `allowedActionsForRequest` below is the
 * one place that answers for BOTH halves of the lifecycle without either half
 * claiming the other's states.
 */
'use strict';

const { TowError } = require('./errors');

/**
 * The legal execution edges, as `from -> { to: action }`.
 *
 * Frozen at every level: a caller may read the graph, never mutate it.
 */
const TOW_EXECUTION_TRANSITIONS = Object.freeze({
  ASSIGNED: Object.freeze({ EN_ROUTE: 'start_en_route', CANCELLED: 'cancel' }),
  EN_ROUTE: Object.freeze({ ARRIVED: 'mark_arrived', CANCELLED: 'cancel' }),
  ARRIVED: Object.freeze({ IN_TRANSIT: 'start_in_transit', CANCELLED: 'cancel' }),
  IN_TRANSIT: Object.freeze({ COMPLETED: 'finish_service', CANCELLED: 'cancel' }),
  COMPLETED: Object.freeze({}),
  CANCELLED: Object.freeze({}),
});

/** The states this graph owns. `SEARCHING`/`NEGOTIATING` are NOT here. */
const TOW_EXECUTION_STATES = Object.freeze(Object.keys(TOW_EXECUTION_TRANSITIONS));

/** Both terminal states of the canonical aggregate. */
const TERMINAL_TOW_REQUEST_STATES = Object.freeze(['COMPLETED', 'CANCELLED']);

/**
 * The milestone COLUMN each target state writes, inside the same transaction as
 * the state change. One row, one instant: the milestone is never a separate
 * write that could be lost.
 */
const MILESTONE_COLUMN_BY_STATE = Object.freeze({
  EN_ROUTE: 'en_route_at',
  ARRIVED: 'arrived_at',
  IN_TRANSIT: 'in_transit_at',
  COMPLETED: 'completed_at',
  CANCELLED: 'cancelled_at',
});

/**
 * The four partner progress operations of the canonical contract, each mapped to
 * the state it targets. `cancel` is NOT here: cancellation is a different
 * operation with a different authorization rule (either party may ask) and its
 * own attribution columns.
 */
const EXECUTION_TARGET_STATE_BY_OPERATION = Object.freeze({
  start_en_route: 'EN_ROUTE',
  mark_arrived: 'ARRIVED',
  start_in_transit: 'IN_TRANSIT',
  finish_service: 'COMPLETED',
});

/**
 * The forward action offered while the request is in a given state: the single
 * non-cancellation edge leaving it. Derived from the graph above — never
 * restated — so a new state cannot be advertised with a stale action.
 *
 *   ASSIGNED -> start_en_route, EN_ROUTE -> mark_arrived,
 *   ARRIVED  -> start_in_transit, IN_TRANSIT -> finish_service
 */
const PROGRESS_ACTION_BY_STATE = Object.freeze(
  Object.entries(TOW_EXECUTION_TRANSITIONS).reduce((acc, [from, edges]) => {
    const forward = Object.entries(edges).find(([to]) => to !== 'CANCELLED');
    if (forward) acc[from] = forward[1];
    return acc;
  }, {})
);

/**
 * The states from which a cancellation is still legal, PER CANCELLING ACTOR.
 *
 * ISSUE #6 — the owning customer may withdraw the request in any NON-TERMINAL
 * phase, including the two negotiation states and after the vehicle is loaded.
 * There is no fee, debt, refund or wallet in this delivery, so dropping the
 * request is free wherever it happens; the job simply closes as `CANCELLED`
 * instead of `COMPLETED`.
 *
 * The assigned partner's scope is NOT widened: an abandoned loaded vehicle is a
 * rider-safety problem, and the partner cancellation remains the pre-transit
 * operation the contract froze.
 */
const CANCELLABLE_TOW_REQUEST_STATES_BY_ACTOR = Object.freeze({
  customer: Object.freeze(['SEARCHING', 'NEGOTIATING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_TRANSIT']),
  partner: Object.freeze(['ASSIGNED', 'EN_ROUTE', 'ARRIVED']),
});

/**
 * The canonical (owning customer) cancellable scope. Kept as the unqualified
 * name because the customer is the principal the lifecycle serves; the partner
 * scope is the narrower subset above.
 */
const CANCELLABLE_TOW_REQUEST_STATES = CANCELLABLE_TOW_REQUEST_STATES_BY_ACTOR.customer;

/** The canonical `terminal_reason` each cancelling party produces. */
const TERMINAL_REASON_BY_CANCELLING_ACTOR = Object.freeze({
  customer: 'CUSTOMER_CANCELLED',
  partner: 'PARTNER_CANCELLED',
});

/** The canonical `release_reason` of a terminal request. */
const RELEASE_REASON_BY_TERMINAL_STATE = Object.freeze({
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
});

const CANCELLATION_ACTOR_TYPES = Object.freeze(['customer', 'partner']);

/** True while the request is in a state this delivery can move. */
function isTowExecutionState(state) {
  return TOW_EXECUTION_STATES.includes(state);
}

/** True for `COMPLETED`/`CANCELLED` — the states that accept no further write. */
function isTerminalTowRequestState(state) {
  return TERMINAL_TOW_REQUEST_STATES.includes(state);
}

/**
 * True while `cancel` is still a legal action for `actorType`.
 *
 * Defaults to the owning customer — the default viewer of every DTO producer —
 * so a caller that does not name an actor never advertises the partner's
 * narrower scope by omission.
 */
function isCancellableTowRequestState(state, actorType = 'customer') {
  const states = CANCELLABLE_TOW_REQUEST_STATES_BY_ACTOR[actorType];
  return Boolean(states && states.includes(state));
}

/** The milestone column a transition to `to` writes, or `null` if `to` is unknown. */
function milestoneColumnForState(state) {
  return MILESTONE_COLUMN_BY_STATE[state] || null;
}

/** The progress action offered in `state` (`finish_service` in `IN_TRANSIT`), or `null`. */
function progressActionForState(state) {
  return PROGRESS_ACTION_BY_STATE[state] || null;
}

/**
 * The three-way answer the services need, and the reason it is three-way:
 *
 *   - `APPLY`  — the edge is legal: write the milestone, and release the
 *                assignment if the target state is terminal;
 *   - `REPLAY` — the request is ALREADY in the target state: the caller is
 *                retrying an operation that succeeded (a lost response, a
 *                duplicated request). It is answered with the canonical current
 *                state and 200, and it writes NOTHING — no second milestone, no
 *                second release, no duplicate event;
 *   - `ILLEGAL` — anything else, including a stale operation that arrives after
 *                a different one won (two partners calling `mark_arrived` and
 *                `cancel` at once): 409 `invalid_tow_transition`.
 *
 * The distinction between `REPLAY` and `ILLEGAL` is exactly what makes the
 * operation idempotent without a second idempotency table: the canonical state
 * IS the record of what happened, and a repeat of the same intent is recognized
 * from it.
 */
const TRANSITION_OUTCOMES = Object.freeze({ APPLY: 'APPLY', REPLAY: 'REPLAY', ILLEGAL: 'ILLEGAL' });

/**
 * The graph-level classifier. Used by the MILESTONE operations
 * (`execution-service`), which are actor-independent: the assigned partner is
 * the only writer and the graph alone decides the edge.
 *
 * Cancellation must NOT use this function: the CANCELLED edges in the graph are
 * the union of what a request can be cancelled FROM, and the partner's scope is
 * narrower than the customer's. `classifyCancellation(from, actorType)` is the
 * authority the cancellation service asks.
 *
 * @returns {'APPLY'|'REPLAY'|'ILLEGAL'}
 */
function classifyTransition(from, to) {
  if (from === to) return TRANSITION_OUTCOMES.REPLAY;
  const edges = TOW_EXECUTION_TRANSITIONS[from];
  if (!edges || !Object.prototype.hasOwnProperty.call(edges, to)) return TRANSITION_OUTCOMES.ILLEGAL;
  return TRANSITION_OUTCOMES.APPLY;
}

/**
 * The cancellation-specific classifier, ACTOR-AWARE and terminal-safe.
 *
 *   - `REPLAY`  — already `CANCELLED`: the retry returns the canonical row and
 *                 writes nothing (no second instant, no second release), for
 *                 either actor that still owns/held the job;
 *   - `APPLY`   — the request is in one of the actor's cancellable states:
 *                 `SEARCHING`/`NEGOTIATING`/`ASSIGNED`/`EN_ROUTE`/`ARRIVED`/
 *                 `IN_TRANSIT` for the customer, `ASSIGNED`/`EN_ROUTE`/`ARRIVED`
 *                 for the partner;
 *   - `ILLEGAL` — everything else, including any terminal that is not
 *                 `CANCELLED` (`COMPLETED`) and any out-of-scope state: 409
 *                 `invalid_tow_transition` carrying `details.from/to`.
 *
 * @param {string} from current request state
 * @param {'customer'|'partner'} actorType
 * @returns {'APPLY'|'REPLAY'|'ILLEGAL'}
 */
function classifyCancellation(from, actorType = 'customer') {
  if (from === 'CANCELLED') return TRANSITION_OUTCOMES.REPLAY;
  if (isTerminalTowRequestState(from)) return TRANSITION_OUTCOMES.ILLEGAL;
  return isCancellableTowRequestState(from, actorType)
    ? TRANSITION_OUTCOMES.APPLY
    : TRANSITION_OUTCOMES.ILLEGAL;
}

/**
 * The 409 for a transition that is not legal from the CURRENT state.
 *
 * `details.from`/`details.to` name the edge, never the payload: a caller that
 * raced another operation learns which transition lost, not who won it.
 */
function invalidTransitionError(from, to) {
  return new TowError(
    'invalid_tow_transition',
    `Tow request cannot transition from ${from} to ${to}`,
    { details: { from, to } }
  );
}

/**
 * The 409 for an operation that the current state does not accept AT ALL (a
 * tracking write against a terminal request, for instance). Distinct from
 * `invalidTransitionError` on purpose: there is no edge to name.
 */
function invalidStateError(state, message, details) {
  return new TowError(
    'invalid_tow_state',
    message || `Tow request state ${state} does not accept this operation`,
    { details: { state, ...(details || {}) } }
  );
}

/** The canonical `terminal_reason` of a cancellation by `actorType`. */
function terminalReasonForCancellation(actorType) {
  const reason = TERMINAL_REASON_BY_CANCELLING_ACTOR[actorType];
  if (!reason) {
    throw new TypeError(`unknown cancelling actor type: ${actorType}`);
  }
  return reason;
}

/** The canonical `release_reason` of a terminal state. */
function releaseReasonForTerminalState(state) {
  return RELEASE_REASON_BY_TERMINAL_STATE[state] || null;
}

module.exports = {
  TOW_EXECUTION_TRANSITIONS,
  TOW_EXECUTION_STATES,
  TERMINAL_TOW_REQUEST_STATES,
  MILESTONE_COLUMN_BY_STATE,
  EXECUTION_TARGET_STATE_BY_OPERATION,
  PROGRESS_ACTION_BY_STATE,
  CANCELLABLE_TOW_REQUEST_STATES,
  CANCELLABLE_TOW_REQUEST_STATES_BY_ACTOR,
  TERMINAL_REASON_BY_CANCELLING_ACTOR,
  RELEASE_REASON_BY_TERMINAL_STATE,
  CANCELLATION_ACTOR_TYPES,
  TRANSITION_OUTCOMES,
  isTowExecutionState,
  isTerminalTowRequestState,
  isCancellableTowRequestState,
  milestoneColumnForState,
  progressActionForState,
  classifyTransition,
  classifyCancellation,
  invalidTransitionError,
  invalidStateError,
  terminalReasonForCancellation,
  releaseReasonForTerminalState,
};
