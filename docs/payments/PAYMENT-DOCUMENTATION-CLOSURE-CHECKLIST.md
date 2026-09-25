# Payment Module Documentation Closure Checklist

**Status:** ACTIVE  
**Scope:** documentation/preparation required before Payments integration work expands beyond Phase 2  
**Branch:** `feat/Pagamentos`  
**PR:** #45

This checklist defines the exact documentation closure order for the four decisions that still materially affect Tow, Store and the shared Payment application contract.

The order is mandatory because each block constrains the next one:

```text
D1 — Tow CASH Migration Contract
        ↓
D2 — Store Financial Authority Contract
        ↓
D3 — Settlement Evidence Contract
        ↓
D4 — Payment API Boundary Decision
        ↓
Payment integration preparation closed
```

The objective is not to produce more generic architecture. The objective is to remove the remaining ambiguity that could cause an implementation workhorse to create a second financial authority, trust client money, mark Payments as PAID without evidence, or expose an unsafe generic payment API.

---

# 1. Closure rule

A documentation block is `DONE` only when:

1. the decision document exists in `docs/payments/`;
2. all required questions in this checklist have explicit answers;
3. unresolved alternatives are either rejected or marked out of scope;
4. the master implementation plan no longer contradicts the decision;
5. relevant existing architecture documents are reconciled;
6. the resulting contract is specific enough that implementation does not require inventing a business rule.

Do not start implementation that depends on a block while that block is still `TODO` or `IN_PROGRESS`.

---

# D1 — Tow CASH Migration Contract

**Priority:** 1  
**Blocks:** Phase 3 implementation  
**Target document:** `docs/payments/PHASE-3-TOW-CASH-MIGRATION-CONTRACT.md`  
**Status:** DONE  
**Closure commit:** `34e76664c9e12b86305e71bdbbb4ba6d7fd4691b`

## Objective

Define exactly how the current validated Tow CASH flow moves from `tow_payments` to the shared Payment Platform under the greenfield policy.

The migration must preserve behavior, not legacy financial storage.

## Decisions to freeze

### D1.1 Canonical Payment identity

Choose and document the exact business identity.

Default direction:

```text
context_type = TOW_SERVICE
context_id   = <assignment_id>
business_key = TOW_SERVICE:<assignment_id>
```

The document must state why assignment is the correct identity or replace it with an explicitly justified alternative.

### D1.2 Payment creation instant

Freeze the exact creation event:

```text
proposal accepted
→ TowAssignment created with frozen final price
→ canonical Payment obligation created in the same business transaction boundary
```

Required conclusion:

- no Payment before a final assignment amount exists;
- no client amount enters Payment creation;
- no second payment-method choice is introduced.

### D1.3 Canonical amount mapping

Freeze:

```text
Payment.amount_cents
=
TowAssignment.final_price_amount_cents
```

and:

```text
Payment.currency
=
TowAssignment.final_price_currency
```

Payments never recomputes tariff, route or proposal price.

### D1.4 Method / processor mapping

Freeze:

```text
method    = CASH
processor = INTERNAL_CASH
```

There is no PaymentAttempt for CASH.

### D1.5 Cash receipt semantics

Define the canonical settlement event:

```text
Tow COMPLETED
+ assigned partner confirms cash receipt
→ INTERNAL_CASH_CONFIRMATION
→ Payment PAID
```

The document must define:

- who is authorized to confirm;
- operational prerequisite;
- idempotency behavior;
- timestamp authority;
- replay behavior;
- what happens if confirmation is received twice;
- what happens if the Payment is already terminal.

### D1.6 Removal of `tow_payments`

Greenfield decision to document explicitly:

```text
NO BACKFILL
NO DUAL-WRITE
NO DUAL-READ AS FINAL DESIGN
NO HISTORICAL COMPATIBILITY REQUIREMENT
```

Required migration direction:

```text
integrate Tow with canonical Payment
→ prove regressions
→ remove current Tow financial write path
→ remove tow_payments when no runtime consumer remains
```

A short-lived implementation bridge is allowed only if one authority remains clearly canonical.

### D1.7 API compatibility

The current legacy/recovery payment-method endpoint must be classified:

```text
REMOVE
or
TEMPORARY_COMPATIBILITY
```

It must not remain part of the new first-party journey.

## Required test contract

Document at least:

- exact frozen assignment amount copied to Payment;
- no client-supplied amount;
- one Payment per assignment/business key;
- concurrent accept does not duplicate Payment;
- CASH creates no PaymentAttempt;
- cash confirmation is idempotent;
- cash confirmation cannot happen before valid Tow completion;
- Payment PAID and Tow COMPLETED remain separate facts;
- Tow regression suite stays green.

## Reconciliation required in existing docs

When D1 closes, update:

- `PAYMENT-PLATFORM-IMPLEMENTATION-PLAN.md` Phase 3;
- any foundation text that still suggests choosing between backfill/dual-write/preservation strategies for Tow.

## D1 exit gate

D1 is DONE when a workhorse can implement Phase 3 without deciding:

- Payment identity;
- amount source;
- creation instant;
- CASH processor behavior;
- receipt semantics;
- `tow_payments` retirement strategy.

---

# D2 — Store Financial Authority Contract

**Priority:** 2  
**Blocks:** Phase 4 implementation  
**Target document:** `docs/payments/PHASE-4-STORE-FINANCIAL-AUTHORITY-CONTRACT.md`  
**Status:** DONE  
**Closure commit:** `3ec425f62da4b8641ca98770a479f008c075f665`

## Objective

Define the Store/PurchaseOrder monetary authority before Store is connected to Payments.

The current client-side `totalCents` is a useful consistency invariant, but it must not remain the backend financial authority.

## Decisions to freeze

### D2.1 Server-side pricing authority

Define exactly which backend component creates the authoritative Store monetary snapshot.

Required direction:

```text
client sends commercial intent
→ backend loads trusted product/pricing data
→ backend applies business rules
→ backend freezes PurchaseOrder monetary snapshot
→ Payment copies PurchaseOrder.total_cents
```

### D2.2 Canonical PurchaseOrder monetary fields

Define the authoritative integer-cent snapshot.

Recommended minimum:

```text
subtotal_cents
delivery_fee_cents
tax_cents
discount_cents
total_cents
currency
```

The document must define the invariant equation.

Example:

```text
total_cents
=
subtotal_cents
+ delivery_fee_cents
+ tax_cents
- discount_cents
```

If other components exist, name them explicitly.

### D2.3 Item price snapshot

Decide whether each PurchaseOrder line freezes:

```text
product_id
unit_price_cents
quantity
line_total_cents
```

Recommended answer: yes.

This prevents future catalog price changes from rewriting historical order economics.

### D2.4 Client payload trust boundary

Explicitly classify client fields.

The client may propose:

```text
product ids
quantities
delivery choice
coupon/promotion identifier
payment method
```

The client must NOT authoritatively set:

```text
subtotal
fees
discount amount
tax amount
total
payment_status
paid_at
processor
```

The backend must either ignore or reject authoritative monetary/status assertions.

### D2.5 Price changes between cart and checkout

Define what happens when a product price or availability changes after the user saw the cart.

Choose explicitly:

```text
A. checkout recalculates and returns authoritative changed total
B. quoted price is reserved for a defined TTL
```

For the current MVP, prefer the simpler model unless a product requirement requires reservation.

### D2.6 Stock / order atomicity

Define when stock validation/reservation and the PurchaseOrder snapshot occur relative to Payment creation.

The document must prevent:

```text
Payment created for an order that the backend could not validly create
```

### D2.7 Store Payment identity

Freeze the canonical identity.

Default direction:

```text
context_type = STORE_ORDER
context_id   = <purchase_order_id>
business_key = STORE_ORDER:<purchase_order_id>
```

### D2.8 Checkout idempotency

Define the stable command identity for:

```text
create/freeze PurchaseOrder
→ create/get canonical Payment
```

Retries must not create multiple orders or Payments for the same intended checkout command.

### D2.9 Existing decimal fields

Because there are no real users, document the disposition of legacy decimal Store financial columns:

```text
REPLACE
REMOVE
or
TEMPORARY_PROJECTION_ONLY
```

No historical decimal-to-cents backfill is required.

## Required test contract

Document at least:

- backend recalculates/finalizes money independently of client total;
- client total override cannot change canonical amount;
- client payment_status cannot mark an order paid;
- order line snapshot remains stable after catalog price changes;
- Payment.amount_cents == PurchaseOrder.total_cents;
- checkout replay is idempotent;
- concurrent checkout does not duplicate canonical order/payment identity;
- invalid/insufficient stock fails before canonical financial obligation is incorrectly created;
- Tow and Store coexist without Payments learning Store pricing rules.

## D2 exit gate

D2 is DONE when a workhorse can implement Phase 4 without deciding:

- who calculates Store money;
- what fields are frozen;
- what the client is trusted to send;
- what happens on price changes;
- Payment business identity;
- checkout idempotency model.

---

# D3 — Settlement Evidence Contract

**Priority:** 3  
**Blocks:** final Phase 2 semantic transition hardening and all later payment confirmations  
**Target document:** `docs/payments/PAYMENT-SETTLEMENT-EVIDENCE-CONTRACT.md`  
**Status:** DONE  
**Closure commit:** `dfdec2cba14b9abadb8416e321d192755035bdaf`

## Objective

Define what evidence is sufficient for the canonical Payment application service to transition a Payment to `PAID`.

This prevents future code from treating `markPaid(paymentId)` as an unrestricted status setter.

## Terminology

In this document, "settlement evidence" means evidence accepted by the Payment application core that the customer-side financial obligation has been satisfied.

It does NOT mean marketplace settlement, partner transfer or payout.

Marketplace settlement remains Gate S1 / Phase 9.

## Initial evidence vocabulary

Freeze or refine:

```text
INTERNAL_CASH_CONFIRMATION
PROCESSOR_PAYMENT_CONFIRMATION
STORE_BILLING_VERIFICATION
```

`STORE_VERIFICATION` is retired; Apple/Google verification uses `STORE_BILLING_VERIFICATION`.

## Decisions to freeze

### D3.1 Evidence common fields

Define the minimum internal contract, for example:

```text
type
payment_id
evidence_id
observed_at
actor/source
processor
attempt_id
external_transaction_id
metadata/reference
```

Only fields required by the evidence type should be mandatory.

### D3.2 INTERNAL_CASH_CONFIRMATION

Define validity requirements:

- Payment processor must be `INTERNAL_CASH`;
- Payment method must be `CASH`;
- source domain supplies an authorized business confirmation;
- no PaymentAttempt is required;
- confirmation replay is idempotent;
- evidence identity is stable.

Payments should not itself decide whether Tow operational prerequisites are satisfied; the Tow integration contract supplies an already-authorized confirmation.

### D3.3 PROCESSOR_PAYMENT_CONFIRMATION

Define validity requirements:

- attempt belongs to the Payment;
- attempt processor equals Payment processor;
- attempt is in a qualifying state;
- required external transaction identity is attached where applicable;
- same evidence cannot settle two Payments.

Do not assume every future `SUCCEEDED` attempt equals final capture unless the processor operation semantics say so.

### D3.4 App-store verification evidence

Define the verified purchase relationship:

```text
verified external store transaction
→ stable external transaction identity
→ replay protection
→ canonical Payment
```

Detailed Apple/Google implementation remains Phase 7.

### D3.5 Evidence idempotency

Define:

```text
same evidence + same Payment
→ replay Payment PAID unchanged

same evidence + different Payment
→ conflict
```

### D3.6 Timestamp authority

Define which timestamp becomes `Payment.paid_at`:

- trusted provider/store paid/capture instant when available;
- backend confirmation instant for internal cash.

Never accept a client-supplied paid timestamp as authority.

## Required error semantics

At minimum:

```text
PAYMENT_SETTLEMENT_EVIDENCE_REQUIRED
PAYMENT_SETTLEMENT_EVIDENCE_INVALID
PAYMENT_SETTLEMENT_EVIDENCE_CONFLICT
```

## Required test contract

Document at least:

- PAID without evidence rejected;
- valid cash evidence settles INTERNAL_CASH;
- cash evidence cannot settle STRIPE Payment;
- attempt evidence must reference the same Payment;
- failed attempt cannot settle Payment;
- evidence replay preserves original `paid_at`;
- cross-Payment evidence replay conflicts;
- client-controlled timestamps do not become authoritative.

## D3 exit gate

D3 is DONE when `markPaymentPaid` can be implemented without a caller being able to arbitrarily assert payment success.

---

# D4 — Payment API Boundary Decision

**Priority:** 4  
**Blocks:** public payment API design and source-domain integration shape  
**Target document:** `docs/payments/PAYMENT-API-BOUNDARY-DECISION.md`  
**Status:** DONE  
**Closure commit:** `6be9a6dab45c4b47b6ee7977c4bf3340a78baa3b`

## Objective

Define which Payments capabilities are internal application APIs and which, if any, deserve public HTTP endpoints.

## Default architectural direction

Prefer:

```text
Tow HTTP API
    ↓
Tow application/domain
    ↓
Payment application service

Store HTTP API
    ↓
Store application/domain
    ↓
Payment application service
```

Do NOT recreate the legacy pattern:

```text
POST /api/payments
{
  amount,
  gateway,
  arbitrary domain ids,
  status
}
```

## Decisions to freeze

### D4.1 Public create endpoint

Choose explicitly:

```text
NO generic public create-payment endpoint
```

or document a concrete justified use case that requires one.

Recommended current decision:

```text
NO
```

Payment creation should be initiated by the owning business flow after authoritative amount creation.

### D4.2 Public read endpoints

Decide whether a shared authenticated read endpoint is needed immediately.

Possible future shape:

```text
GET /api/payments/:paymentId
```

But do not add it without a product consumer.

Source domains may project Payment state through their existing resources instead.

### D4.3 Provider/client action endpoints

Define that provider-specific client actions, if later required, are commands over an existing Payment rather than arbitrary Payment creation.

Example future concept:

```text
POST /api/payments/:id/attempts
```

Only add when Phase 5/client integration requires it.

### D4.4 Authorization model

For every future Payment endpoint, require explicit access rules based on the source business object/payment ownership.

Knowing a Payment ID alone must not imply access.

### D4.5 Financial input prohibition

Public APIs must never accept as authority:

```text
amount_cents
currency
processor
status
paid_at
settlement evidence asserted by untrusted client
```

when those facts can be derived from server-side business state.

### D4.6 Error mapping

Application error codes remain canonical.

HTTP is only a transport mapping layer.

Document expected categories:

```text
validation -> 4xx
not found  -> 404-style
authz      -> 403-style
conflict   -> 409-style
provider unavailable / unknown outcome -> explicitly mapped later
```

Do not let controllers translate financial conflicts into generic success.

## Required architecture tests

Document boundary tests that forbid:

- Tow/Store importing payment persistence adapters;
- Tow/Store importing Stripe SDK;
- public controller directly updating Payment status;
- public request body choosing processor;
- public request body supplying canonical amount for source-owned obligations.

## D4 exit gate

D4 is DONE when a workhorse can add HTTP integration later without deciding:

- whether Payments is a generic CRUD service;
- who may create Payments;
- whether client amount/status is trusted;
- how source-domain ownership participates in authorization.

---

# 2. Closure order and dependencies

The four blocks close in this order:

| Order | Decision block | Why it comes here | Blocks |
|---:|---|---|---|
| 1 | D1 — Tow CASH Migration | First real consumer; must preserve validated behavior | Phase 3 |
| 2 | D2 — Store Financial Authority | Fixes the second money authority before integration | Phase 4 |
| 3 | D3 — Settlement Evidence | Freezes the semantic PAID boundary shared by all rails | Phase 2 hardening / 3+ |
| 4 | D4 — Payment API Boundary | Defines transport only after internal domain contracts are clear | future HTTP/provider integration |

D3 may be drafted while D1/D2 are being discussed, but it should not be declared DONE until its terminology is validated against both cash and external/store flows.

---

# 3. Documentation status ledger

| Block | Status | Required artifact |
|---|---|---|
| D1 — Tow CASH Migration Contract | DONE | `PHASE-3-TOW-CASH-MIGRATION-CONTRACT.md` / `34e76664c9e12b86305e71bdbbb4ba6d7fd4691b` |
| D2 — Store Financial Authority Contract | DONE | `PHASE-4-STORE-FINANCIAL-AUTHORITY-CONTRACT.md` / `3ec425f62da4b8641ca98770a479f008c075f665` |
| D3 — Settlement Evidence Contract | DONE | `PAYMENT-SETTLEMENT-EVIDENCE-CONTRACT.md` / `dfdec2cba14b9abadb8416e321d192755035bdaf` |
| D4 — Payment API Boundary Decision | DONE | `PAYMENT-API-BOUNDARY-DECISION.md` / `6be9a6dab45c4b47b6ee7977c4bf3340a78baa3b` |

---

# 4. Existing-document reconciliation checklist

The current document set is useful, but some earlier text predates the greenfield simplification.

Before declaring the preparation package closed, reconcile:

## `PAYMENT-PLATFORM-FOUNDATION.md`

- [x] update implementation sequence that still groups provider events/refunds with early persistence work;
- [x] make the Phase 1 minimal-table strategy explicit;
- [x] reflect no legacy payment-data preservation requirement;
- [x] preserve the non-negotiable invariants.

## `PAYMENT-PLATFORM-IMPLEMENTATION-PLAN.md`

- [x] replace Phase 3 migration alternatives with the closed D1 strategy;
- [x] expand Phase 4 from a generic Store statement to the closed D2 authority contract;
- [x] reference D3 as the PAID semantic contract;
- [ ] reference D4 before any new public Payment API is introduced.

## `PAYMENT-PLATFORM-CODE-CONTRACT.md`

- [x] reference settlement evidence after D3 closes;
- [x] reference API boundary after D4 closes;
- [x] keep source-domain integrations application-service-only.

---

# 5. What does NOT need to be decided now

These are intentionally deferred and must not block D1–D4:

```text
Stripe API shape / PaymentIntent implementation
manual authorization vs capture details beyond current MVP decision
webhook schema
provider event persistence implementation
Apple StoreKit verification specifics
Google Play verification specifics
refund business-policy matrix
Merchant of Record
Stripe Connect charge model
provider transfer timing
tax/fiscal allocation
production alert thresholds
```

They belong to their corresponding later phase/gate.

---

# 6. Preparation package exit gate

**STATUS: CLOSED**

The Payments documentation/preparation package for Tow + Store is considered closed when:

```text
D1 = DONE
D2 = DONE
D3 = DONE
D4 = DONE
```

and:

- Foundation, master plan and code contract contain no conflicting legacy strategy;
- Phase 3 can be implemented without architectural invention;
- Phase 4 can be implemented without trusting client money;
- Payment PAID cannot be asserted without defined evidence;
- no generic public Payment API can bypass source-domain authority.

At that point, subsequent documentation should be phase-specific and created immediately before Stripe, provider events, IAP, refunds and settlement work rather than expanding the core architecture further.
