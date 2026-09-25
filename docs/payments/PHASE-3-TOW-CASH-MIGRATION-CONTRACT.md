# Phase 3 — Tow CASH Migration Contract

**Decision:** D1 — Tow CASH Migration Contract  
**Status:** CLOSED  
**Scope:** migration of the validated Tow CASH flow to the shared Payment Platform  
**Branch:** feat/Pagamentos  
**PR:** #45

This document is the implementation authority for Phase 3.

It preserves the validated first-party Tow behavior while replacing tow_payments as the financial authority.

It supersedes older text that still treats backfill, permanent dual-write, post-assignment payment selection, lazy payment creation, or historical Tow compatibility as open requirements.

There are no real users and no authoritative legacy Tow payment history to preserve.

---

# 1. Goal

Tow remains responsible for:

- request/proposal/assignment lifecycle;
- route/tariff pricing;
- frozen final service price;
- commercial payment-method choice;
- operational completion;
- authorization of the cash-receipt business action.

The shared Payment Platform becomes responsible for:

- canonical financial obligation;
- financial status;
- financial idempotency;
- accepted settlement evidence;
- paid timestamp;
- future processor/reconciliation/refund concerns.

Target:

~~~text
TowRequest
    ↓
TowProposal
    ↓
TowAssignment
    ↓
Payment
~~~

Final Phase 3 design must NOT contain competing TowPayment + Payment authorities.

---

# 2. Preserved first-party journey

~~~text
customer creates Tow request
and chooses CASH once
        ↓
request SEARCHING / NEGOTIATING
        ↓
no Payment exists yet
        ↓
customer accepts winning proposal
        ↓
TowAssignment freezes final price
        ↓
canonical Payment is created atomically
        ↓
Payment = PENDING / CASH / INTERNAL_CASH
        ↓
Tow execution progresses
        ↓
Tow = COMPLETED
        ↓
assigned partner confirms physical cash receipt
        ↓
INTERNAL_CASH_CONFIRMATION
        ↓
Payment = PAID
~~~

There is no second payment-method choice after proposal acceptance.

---

# 3. Canonical Payment identity

## Decision

~~~text
context_type = TOW_SERVICE
context_id   = <tow_assignment.id>
business_key = TOW_SERVICE:<tow_assignment.id>
~~~

TowAssignment is the source identity because it is the first canonical object that freezes the winning proposal, provider, vehicle, accepted service, final amount and currency.

TowRequest exists before a payable obligation exists. TowProposal is only an offer.

The current model enforces one assignment per request, so the assignment identity is stable for the current lifecycle.

Forbidden sources of financial identity/amount include:

- request id used as a price authority;
- proposal id used as the final obligation;
- current tariff;
- current route quote;
- client payment amount;
- legacy EmergencyRequest price;
- legacy generic Payment id.

---

# 4. Canonical Payment mapping

When the assignment is created, Tow supplies this obligation:

~~~text
context_type     = TOW_SERVICE
context_id       = String(assignment.id)
business_key     = TOW_SERVICE:<assignment.id>

payer_id         = String(tow_request.customer_id)

commerce_type    = REAL_WORLD_SERVICE
sales_channel    = tow_request.sales_channel

amount_cents     = assignment.final_price_amount_cents
currency         = assignment.final_price_currency

method           = CASH
processor        = derived centrally as INTERNAL_CASH

status           = PENDING

idempotency_key  = tow-payment:<assignment.id>:v1
expires_at       = null
~~~

Tow must not choose processor directly.

The deterministic Payment idempotency key is generated from the stable business identity. It is not the customer's HTTP Idempotency-Key.

---

# 5. Money authority

~~~text
Payment.amount_cents
=
TowAssignment.final_price_amount_cents
~~~

~~~text
Payment.currency
=
TowAssignment.final_price_currency
~~~

Payments never recalculates Tow pricing.

The shared Payment Platform requires amount_cents > 0. Therefore a normal payable CASH Tow assignment must also have final_price_amount_cents > 0 before Payment materialization.

Zero-value Tow services are outside current scope. A future free/promotional service must explicitly define whether no Payment is created or whether the Payment model is widened.

---

# 6. Commercial payment choice

The customer chooses the commercial payment method when creating the Tow request.

Phase 3 mapping:

~~~text
consumer vocabulary: cash
Tow persistence:      CASH
Payment method:       CASH
Payment processor:    INTERNAL_CASH
~~~

TowRequest.payment_method remains because the commercial choice exists before Payment and is useful to the Tow business flow.

It is not financial-status authority.

The old nullable rule existed only for historical compatibility. That requirement is removed.

Phase 3 should enforce for the canonical new Tow schema:

~~~text
payment_method NOT NULL
payment_method = CASH
~~~

Non-production rows that violate this may be discarded/reset. No backfill is required.

---

# 7. Sales channel

The new Payment contract requires sales_channel, but current TowRequest does not persist it.

Phase 3 adds an immutable commercial/audit field:

~~~text
TowRequest.sales_channel
~~~

Allowed canonical values:

~~~text
IOS_APP
ANDROID_APP
WEB
~~~

The request-creation adapter supplies and validates the channel, and Tow persists it with the request.

The client may report its runtime channel because sales_channel is not monetary authority. The backend validates the enum.

Do not infer sales_channel from User-Agent.

At HTTP boundary, if no existing platform vocabulary exists, use:

~~~text
ios_app
android_app
web
~~~

and map to the canonical uppercase vocabulary.

For a real-world service the current processor routing remains:

~~~text
CASH     -> INTERNAL_CASH
CARD/PIX -> STRIPE
~~~

so sales_channel must not become a client-controlled processor switch.

---

# 8. Atomic creation boundary

Tow assignment creation and canonical Payment creation must remain atomic.

Required transaction:

~~~text
BEGIN

lock TowRequest
lock winning TowProposal

create TowAssignment
freeze final price

create canonical Payment
using the SAME database transaction

close/reject remaining proposal state
update TowRequest -> ASSIGNED

COMMIT
~~~

Any Payment creation failure rolls back the assignment acceptance.

Tow must not import Payment persistence adapters or provider adapters.

Required shared application capability:

~~~text
paymentService.withTransaction(trx)
  .createObligation(command)
~~~

or an equivalent application-level transaction-bound API.

A transaction-bound Payment operation must reuse the existing transaction and must not open an independent outer transaction.

Tow continues to integrate through the Payment application contract, not through Knex Payment repositories.

---

# 9. Creation idempotency

Tow accept replay remains governed by the existing Tow assignment/proposal invariants.

Payment replay is governed by:

~~~text
business_key = TOW_SERVICE:<assignment.id>
idempotency_key = tow-payment:<assignment.id>:v1
~~~

Expected behavior:

~~~text
same assignment + same financial facts
→ same Payment

same assignment + changed amount/method/payer/channel
→ conflict / invariant failure
~~~

A different HTTP Idempotency-Key on an accept replay must not create another Payment.

---

# 10. PaymentAttempt rule

CASH has no external processor execution.

~~~text
Payment.method    = CASH
Payment.processor = INTERNAL_CASH
PaymentAttempt    = none
~~~

Creating a PaymentAttempt for this Tow CASH Payment is an invariant violation.

The assigned partner is not a fake payment processor.

---

# 11. Cash receipt semantics

The retained business endpoint is:

~~~text
POST /api/tow/requests/:requestId/cash-received
~~~

It remains bodyless for amount/currency.

Only the assigned Tow partner may confirm cash receipt.

Cash may be confirmed only when:

~~~text
TowRequest.state = COMPLETED
~~~

Tow owns and checks this operational prerequisite. Payments must not learn the Tow state machine.

Tow emits an already-authorized settlement evidence command:

~~~text
type        = INTERNAL_CASH_CONFIRMATION
payment_id  = <canonical Payment id>
evidence_id = tow-cash-receipt:<assignment.id>:v1
observed_at = backend confirmation instant
actor       = assigned partner identity
source      = TOW
~~~

D3 will finalize the common evidence schema, but the evidence identity and meaning above are frozen by D1.

Valid evidence transitions:

~~~text
Payment PENDING
→ Payment PAID
~~~

with paid_at set from the backend confirmation instant.

No PaymentAttempt is involved.

---

# 12. Cash receipt idempotency

Financial idempotency authority:

~~~text
tow-cash-receipt:<assignment.id>:v1
~~~

The HTTP Idempotency-Key may still be validated as a transport key, but changing it on replay must not create a second financial effect or restamp paid_at.

~~~text
first valid confirmation
→ PENDING -> PAID
→ paid_at = T1

same confirmation replay
→ PAID returned
→ paid_at remains T1
→ no new Payment
→ no PaymentAttempt
→ no second settlement effect
~~~

---

# 13. Invalid cash-receipt cases

Before COMPLETED:

~~~text
409 invalid_tow_state
~~~

No Payment mutation.

Foreign partner:

- authorization failure occurs before revealing financial state;
- no Payment mutation.

Payment already PAID:

- return canonical paid projection as idempotent replay;
- do not restamp paid_at.

Payment CANCELLED / EXPIRED / FAILED:

- do not force it to PAID;
- return deterministic financial conflict/invariant error.

Missing Payment after an assignment exists:

- treat as integrity failure;
- do not lazily create or repair on read/cash confirmation.

This intentionally removes the historical lazy-create compatibility behavior.

---

# 14. Tow cancellation during Phase 3

Phase 3 does not invent cancellation fees, debts, refunds or automatic financial reversals.

It must not:

- create a Refund;
- create customer debt;
- settle cash;
- invent a cancellation fee;
- transfer partner funds.

A previously created CASH Payment is not automatically marked PAID.

Do not add cancellation-driven Payment transitions until cancellation/refund policy is explicitly defined.

This preserves the current business-policy scope instead of silently creating new financial consequences.

---

# 15. Consumer PaymentSummary compatibility

Tow may preserve its current consumer projection while changing financial storage.

## Before assignment

No canonical Payment exists.

~~~text
method            = null
status            = NOT_SELECTED
amount_cents      = null
currency          = null
can_start_service = false
pix               = null
~~~

TowRequest.payment_method separately projects the commercial choice cash.

## After assignment, before cash receipt

Canonical Payment:

~~~text
method    = CASH
processor = INTERNAL_CASH
status    = PENDING
~~~

Tow projection:

~~~text
method            = cash
status            = CASH_SELECTED
amount_cents      = Payment.amount_cents
currency          = Payment.currency
can_start_service = true
pix               = null
~~~

## After cash receipt

Canonical Payment:

~~~text
status = PAID
~~~

Tow projection:

~~~text
method            = cash
status            = CASH_RECEIVED
amount_cents      = Payment.amount_cents
currency          = Payment.currency
can_start_service = true
pix               = null
~~~

For Phase 3 CASH, PROCESSING, FAILED, CANCELLED and EXPIRED must not be silently mapped into a valid Tow cash status.

---

# 16. Payment reads

Retain:

~~~text
GET /api/tow/requests/:requestId/payment
~~~

Authorization remains owning customer or assigned partner, plus authorized admin where already supported.

Lookup path:

~~~text
before assignment
→ NOT_SELECTED projection

after assignment
→ request
→ assignment
→ TOW_SERVICE:<assignment.id>
→ canonical Payment
→ Tow PaymentSummary projection
~~~

A read never creates a Payment.

---

# 17. Legacy payment-method endpoint

## Decision: REMOVE

Remove during Phase 3:

~~~text
PUT /api/tow/requests/:requestId/payment-method
~~~

Reasons:

- current first-party requests choose method at creation;
- there are no real historical users to support;
- no historical Tow financial data must be preserved;
- keeping the endpoint preserves a second commercial-decision path with no product value.

Remove the associated controller/application compatibility operation, lazy-payment creation behavior, historical-null compatibility tests, and active route/OpenAPI declaration.

Future CARD/PIX support should evolve the request/payment flow through the shared Payment Platform rather than resurrect this endpoint by default.

---

# 18. tow_payments retirement

tow_payments is removed as a financial authority.

~~~text
NO BACKFILL
NO DATA COPY
NO DUAL-WRITE
NO PERMANENT DUAL-READ
NO HISTORICAL ID PRESERVATION
~~~

Implementation order:

~~~text
1. make Payment application core transaction-bindable
2. add Tow sales_channel
3. create canonical Payment from assignment acceptance
4. switch Tow PaymentSummary reads to canonical Payment
5. switch cash receipt to settlement evidence / Payment PAID
6. remove selectMethod compatibility endpoint/path
7. run Tow + Payments regression suite
8. prove no runtime consumer reads/writes tow_payments
9. drop tow_payments and remove its repository/domain write model/tests
~~~

A short-lived branch-local bridge is allowed during implementation, but final Phase 3 has one financial authority only.

---

# 19. Schema consequences

Phase 3 should use forward migrations that:

1. add tow_requests.sales_channel;
2. remove historical null compatibility for tow_requests.payment_method where practical under the greenfield reset policy;
3. drop tow_payments only after runtime consumers have moved.

Do not rewrite migrations 007/008 merely to hide repository history.

Non-production rows may be reset according to repository conventions because there is no production financial history to preserve.

---

# 20. Module boundary

Tow may know:

- customer;
- assignment;
- final amount/currency;
- payment method;
- sales channel;
- operational completion;
- assigned-partner authorization.

Payments may know:

- payer;
- business key/context;
- commerce type;
- sales channel;
- amount/currency;
- method/processor;
- financial status;
- settlement evidence.

Payments must not receive Tow route geometry, distance, tariff inputs, vehicle pricing rules or Tow state-machine implementation.

Tow must not import Payment Knex repositories, provider SDKs or PaymentAttempt internals for CASH.

---

# 21. Required tests

## Creation

- no canonical Payment before assignment;
- accept creates exactly one Payment;
- business key = TOW_SERVICE:<assignment.id>;
- payer = Tow customer;
- commerce type = REAL_WORLD_SERVICE;
- Payment sales channel equals TowRequest sales channel;
- method = CASH;
- processor = INTERNAL_CASH;
- amount/currency equal frozen assignment exactly;
- client cannot override Payment money;
- zero-value payable assignment rejected by agreed boundary;
- assignment + Payment commit atomically;
- Payment creation failure rolls back assignment acceptance.

## Replay/concurrency

- accept replay returns same assignment and Payment;
- different HTTP idempotency key does not create another Payment;
- concurrent accepts cannot create multiple Payments;
- changed financial facts on same business key conflict.

## CASH

- CASH creates no PaymentAttempt;
- receipt before COMPLETED rejected;
- foreign partner cannot confirm;
- valid assigned partner confirmation settles Payment;
- paid_at comes from backend clock;
- repeat confirmation preserves paid_at;
- missing Payment after assignment is not lazily repaired;
- invalid terminal financial state is not forced to PAID.

## Projection

- pre-assignment = NOT_SELECTED;
- assigned PENDING = CASH_SELECTED;
- PAID = CASH_RECEIVED;
- amount/currency match canonical Payment;
- can_start_service remains only a projection.

## Removal

- PUT /payment-method removed from first-party/runtime dependency;
- no production import/write through tow-payment-repository;
- no production write to tow_payments;
- tow_payments dropped after consumers move;
- generic legacy payments table is not used as Tow fallback.

## Regression

- focused Payments tests green;
- complete Tow suite green;
- PostgreSQL transaction/concurrency gate green;
- OpenAPI validation green after contract updates.

---

# 22. Contract precedence

For Phase 3, this document is authoritative where older Tow payment documentation conflicts with it.

Older long-term Tow contracts may still mention CARD/PIX or post-creation selection. Those declarations do not make those paths active Phase 3 behavior.

Phase 3 implements CASH only, with commercial method choice at Tow request creation and canonical financial state in the shared Payment Platform.

---

# 23. Explicitly deferred decisions

Phase 3 does not decide:

- Tow CARD UI/provider flow;
- Tow PIX UI/provider flow;
- Stripe PaymentIntent semantics;
- authorization/capture;
- Tow cancellation fee policy;
- Tow refund policy;
- partner settlement/commission;
- Stripe Connect;
- chargeback liability;
- tax/fiscal allocation.

---

# 24. D1 closure statement

~~~text
Payment identity:
TOW_SERVICE:<assignment_id>

Payment creation:
same transaction as proposal acceptance / assignment creation

Money:
assignment.final_price_amount_cents + final_price_currency

Payer:
Tow customer

Commerce:
REAL_WORLD_SERVICE

Sales channel:
persisted on TowRequest; IOS_APP / ANDROID_APP / WEB

Method:
CASH

Processor:
INTERNAL_CASH

PaymentAttempt:
none

Initial financial state:
PENDING

Cash settlement:
assigned partner + Tow COMPLETED
→ INTERNAL_CASH_CONFIRMATION
→ PAID

Cash evidence identity:
tow-cash-receipt:<assignment_id>:v1

Legacy post-assignment method selection:
REMOVE

Historical backfill:
NONE

Dual-write:
FORBIDDEN as final design

tow_payments:
REMOVE after canonical reads/writes are proven

Missing Payment after assignment:
INTEGRITY FAILURE, no lazy creation
~~~

A workhorse implementing Phase 3 must not reopen these decisions without a concrete contradiction in the current codebase or a new product requirement.
