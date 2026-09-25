# Payment Platform Foundation — feat/Pagamentos

## Status

FOUNDATION / IMPLEMENTATION GUARDRAIL

This document is the architectural baseline for the feat/Pagamentos work. Implementation may refine names and persistence details, but it must not violate the invariants below without an explicit architectural decision recorded in this PR.

## 1. Architectural decision

The target is not “Tow Payments” plus “Store Payments”.

Tow, Store and future modules remain separate business bounded contexts, but they create financial obligations through one shared Payment Platform.

> Business domains determine the obligation and its authoritative amount. Payments executes, records, reconciles and settles that obligation.

### Tow owns

- proposals and assignment;
- tariff/pricing rules;
- the event that freezes the service price;
- Tow operational lifecycle;
- Tow cancellation/business rules.

Payments must never recalculate route, distance, tariff, proposal value or Tow price. The amount supplied to Payments comes from the frozen assignment final price.

### Store owns

- cart and quantities;
- discounts and fees;
- delivery pricing;
- purchase-order total;
- Store order lifecycle and cancellation rules.

Payments must never reconstruct a Store total from display strings, item prices or formatted BRL values. The amount supplied to Payments is the frozen order/checkout total in integer cents.

### Payments owns

- canonical financial obligation (Payment);
- attempts against external processors (PaymentAttempt);
- financial status transitions;
- processor routing;
- idempotency and durable duplicate prevention;
- provider events/webhooks/server notifications;
- refunds;
- reconciliation;
- later, settlement allocations/transfers/payout tracking.

## 2. Core model direction

Conceptually:

~~~text
Payment
├── id
├── business_key
├── context_type
├── context_id
├── payer_id
├── commerce_type
├── sales_channel
├── amount_cents
├── currency
├── method
├── processor
├── status
├── idempotency_key
├── paid_at
├── cancelled_at
├── expires_at
├── created_at
└── updated_at
~~~

context_type + context_id identifies the source business obligation without teaching Payments how that source domain calculates prices.

Examples:

~~~text
TOW_SERVICE:<canonical-tow-payment-context>
STORE_ORDER:<purchase_order_id>
PREMIUM_SUBSCRIPTION:<subscription-cycle-id>
~~~

The final persistence keys for each integration remain an implementation decision, but they must be stable and idempotent.

## 3. Money invariant

All canonical internal money is integer cents.

~~~text
R$ 235,60 -> amount_cents = 23560, currency = BRL
~~~

Forbidden as internal financial authority:

- float/double money;
- parsing formatted money strings;
- recomputing money from display values;
- client-supplied authoritative totals.

If an external processor API requires decimal representation, conversion happens only inside that processor adapter.

## 4. Payment rail decision: IAP + Stripe

“IAP + Stripe” is the product-level shorthand. Architecturally the rails are:

~~~text
Digital purchase in iOS app     -> Apple App Store / StoreKit billing
Digital purchase in Android app -> Google Play Billing
Digital purchase on Web         -> Stripe
Physical goods                  -> Stripe
Real-world services             -> Stripe
Cash                            -> Internal Cash processor
~~~

The routing decision is represented by CommerceType, SalesChannel, PaymentMethod and a central routing policy.

### Commerce types

~~~text
DIGITAL_GOOD
DIGITAL_SUBSCRIPTION
PHYSICAL_GOOD
REAL_WORLD_SERVICE
~~~

### Sales channels

~~~text
IOS_APP
ANDROID_APP
WEB
~~~

### Payment methods

Initial vocabulary:

~~~text
CASH
CARD
PIX
STORE_BILLING
~~~

STORE_BILLING abstracts the payment instruments managed by Apple/Google inside their store billing flows. Stripe is not a payment method; it is a processor.

### Processors

~~~text
INTERNAL_CASH
STRIPE
APPLE_APP_STORE
GOOGLE_PLAY
~~~

## 5. Routing invariants

Business domains do not select Stripe/Apple/Google directly.

~~~text
PaymentRoutingPolicy.resolve(
  commerceType,
  salesChannel,
  paymentMethod
)
~~~

Examples:

~~~text
DIGITAL_SUBSCRIPTION + IOS_APP + STORE_BILLING
-> APPLE_APP_STORE

DIGITAL_SUBSCRIPTION + ANDROID_APP + STORE_BILLING
-> GOOGLE_PLAY

DIGITAL_SUBSCRIPTION + WEB + CARD/PIX
-> STRIPE

PHYSICAL_GOOD + IOS_APP + CARD/PIX
-> STRIPE

REAL_WORLD_SERVICE + ANDROID_APP + CARD/PIX
-> STRIPE

REAL_WORLD_SERVICE + any supported channel + CASH
-> INTERNAL_CASH
~~~

The foundation code rejects attempts to bypass this central policy.

## 6. Payment is not PaymentAttempt

Payment is the financial obligation. PaymentAttempt is one concrete execution against a rail/processor.

~~~text
Payment
├── Attempt 1 -> FAILED
├── Attempt 2 -> FAILED
└── Attempt 3 -> SUCCEEDED
~~~

A provider timeout or failed attempt does not erase the business obligation.

Planned attempt fields include:

~~~text
payment_id
attempt_number
processor
method
provider_reference
external_transaction_id
amount_cents
currency
status
failure_code
failure_reason
created_at
completed_at
~~~

## 6.1 PAID requires durable settlement evidence

D3 is CLOSED and authoritative:

~~~text
docs/payments/PAYMENT-SETTLEMENT-EVIDENCE-CONTRACT.md
~~~

A Payment does not become PAID through arbitrary status assignment.

Accepted evidence types are:

~~~text
INTERNAL_CASH_CONFIRMATION
PROCESSOR_PAYMENT_CONFIRMATION
STORE_BILLING_VERIFICATION
~~~

The accepted evidence identity is durably and immutably bound to the canonical Payment in the same transaction that sets PAID.

~~~text
same evidence + same Payment
-> idempotent replay

same evidence + different Payment
-> conflict
~~~

A PaymentAttempt marked SUCCEEDED is not by itself proof of final payment; processor orchestration must establish final collection/capture.

Provider events remain a separate Phase 6 concept, and marketplace settlement/payout remains a separate lifecycle.

## 7. Processor adapter boundary

All external rails sit behind a Payment Platform port.

Initial port contract:

~~~text
create(...)
retrieve(...)
cancel(...)
refund(...)
reconcile(...)
verifyProviderEvent(...)
~~~

Tow, Store, Subscription and future domains must not import Stripe, StoreKit or Google Play integrations directly.

## 8. IAP verification and entitlements

The mobile client is not financial authority for digital purchases.

~~~text
Apple/Google transaction
-> backend verification
-> canonical Payment transition
-> internal PaymentSettled event
-> entitlement/subscription domain grants access
~~~

Payment = PAID and Entitlement = ACTIVE are related but different domain facts. Refund/revocation must be propagated rather than implemented as a Payments-owned entitlement toggle.

## 9. Stripe and Stripe Connect

Stripe is the intended processor for eligible real-world services, physical goods and eligible Web digital commerce.

For marketplace/provider settlement, Stripe Connect is the intended integration family, but the Connect charge model is intentionally NOT selected in this foundation commit.

The following decision remains open:

- merchant of record;
- who owns chargebacks/refunds/negative balances;
- who absorbs Stripe fees;
- platform fee model;
- seller/partner receivable timing;
- Direct Charges vs Destination Charges vs Separate Charges and Transfers.

The workhorse must not choose one implicitly while implementing a payment adapter.

## 10. Payment is not Settlement or Payout

These lifecycles are separate:

~~~text
Customer Payment = PAID
        ↓
Settlement allocation
├── platform revenue
└── provider/seller receivable
        ↓
Transfer
        ↓
Payout
~~~

A customer payment becoming PAID does not mean a partner has been paid out.

Planned future entities:

~~~text
SettlementAllocation
Transfer
Payout / payout projection
~~~

They must not be collapsed into Payment.

## 11. Provider events and webhooks

Provider-originated financial events belong to Payments.

Planned common envelope:

~~~text
PaymentProviderEvent
├── processor
├── external_event_id
├── event_type
├── signature_verified
├── payload_hash
├── processing_status
├── received_at
└── processed_at
~~~

Expected durable uniqueness:

~~~text
UNIQUE(processor, external_event_id)
~~~

Stripe webhooks, Apple server notifications and Google Play notifications use different verification adapters but converge on the same internal financial transition discipline.

The current legacy mock webhook endpoint is not a production financial authority and must not be promoted as one.

## 12. Reconciliation

Webhooks/notifications are not assumed to arrive exactly once or at all.

Each external adapter must eventually support reconciliation between local canonical state and processor state to recover from:

- lost webhooks;
- duplicate events;
- network timeouts;
- server restarts;
- provider acceptance followed by a lost HTTP response;
- delayed asynchronous processing.

## 13. Refund is not cancellation

Business cancellation belongs to the source domain. Refund execution belongs to Payments.

A cancelled Tow request or Store order may require no refund, a full refund, a partial refund or a cancellation fee depending on business policy. The originating domain determines the financial consequence; Payments executes and records it.

## 14. Tow CASH migration invariant

The validated first-party Tow CASH behavior is migrated under the CLOSED D1 contract:

```text
docs/payments/PHASE-3-TOW-CASH-MIGRATION-CONTRACT.md
```

Frozen direction:

```text
customer chooses CASH at Tow request creation
→ no Payment before assignment
→ proposal accepted
→ assignment freezes final price
→ canonical Payment TOW_SERVICE:<assignment_id> is created atomically
→ method CASH / processor INTERNAL_CASH / status PENDING
→ service completes
→ assigned partner confirms cash receipt
→ INTERNAL_CASH_CONFIRMATION
→ Payment PAID
```

The legacy post-assignment PUT payment-method path is removed in Phase 3 because there are no historical users to preserve.

There is no Tow payment backfill, no final dual-write and no permanent compatibility authority. tow_payments is removed after canonical integration is proven.

## 14.1 Store financial-authority invariant

The Store integration follows the CLOSED D2 contract:

\`\`\`text
docs/payments/PHASE-4-STORE-FINANCIAL-AUTHORITY-CONTRACT.md
\`\`\`

Frozen direction:

\`\`\`text
client commercial intent
→ backend loads trusted catalog/store state
→ backend calculates integer cents
→ immutable PurchaseOrder + PurchaseOrderItems snapshot
→ canonical Payment STORE_ORDER:<purchase_order_id>
→ Payment.amount_cents = PurchaseOrder.total_cents
\`\`\`

The client may submit \`expected_total_cents\` only as a consent/concurrency guard; a mismatch aborts checkout and requires reconfirmation.

PurchaseOrder and Payment financial state are separate. \`purchase_orders.payment_status\`, \`paid_at\`, client-supplied totals and \`status=refunded\` are not canonical financial authorities.

DeliveryOrder is fulfillment, not customer-payment authority.

## 15. Legacy payment code policy

Existing generic payment files are legacy/experimental until reconciled with this foundation:

~~~text
src/services/paymentService.js
src/routes/payments.js
src/services/gateways/*
~~~

They must not be treated as the new core merely because their names are generic.

Known architectural mismatches include decimal/float money authority, business-specific branches inside a generic service, mock processor behavior and lack of production-grade provider-event verification.

Migration options are explicit and evidence-driven: refactor, wrap temporarily, migrate data or remove. No blind reuse.

## 16. Foundation code in this commit

This commit adds a pure, non-wired Payments module:

~~~text
src/modules/payments/
├── domain/
│   ├── errors.js
│   ├── money.js
│   ├── payment.js
│   ├── routing-policy.js
│   ├── vocabulary.js
│   └── index.js
├── ports/
│   └── payment-processor.js
└── index.js
~~~

It also adds tests that freeze the current architectural choices.

It intentionally does NOT yet add:

- HTTP routes;
- database migrations;
- Stripe SDK dependencies;
- Stripe Connect charge model;
- Apple/Google SDK/server verification implementation;
- migration of existing Tow CASH persistence;
- Store integration;
- replacement/removal of the legacy /payments API.

This keeps the first commit behavior-neutral while giving subsequent implementation a hard target.

## 17. Implementation sequence for the workhorse

The detailed phased authority is `PAYMENT-PLATFORM-IMPLEMENTATION-PLAN.md`.

Current sequence:

1. Close Phase 1 persistence evidence on PostgreSQL.
2. Close Phase 2 application-core semantics, including settlement-evidence validation.
3. Implement the CLOSED D1 Tow CASH migration contract.
4. Implement Store only after D2 closes its backend financial-authority contract.
5. Add Stripe adapter for eligible physical/real-world/Web flows.
6. Add provider-event persistence and reconciliation in Phase 6.
7. Add Apple App Store / Google Play verification in Phase 7.
8. Add first-class Refund persistence/lifecycle in Phase 8.
9. Close merchant-of-record/settlement Gate S1.
10. Only then implement Stripe Connect settlement/transfers/payout tracking.

Provider events and Refund persistence are intentionally not part of Phase 1.

Each phase must include focused unit tests, negative controls, idempotency tests and PostgreSQL/concurrency coverage where financial uniqueness is involved.

## 18. Non-negotiable invariants

1. One shared Payment Platform; multiple business bounded contexts.
2. Payments never calculates Tow or Store business prices.
3. Canonical internal money is integer cents.
4. External processor selection is centralized.
5. Mobile/client state is not financial authority.
6. Payment and PaymentAttempt are separate concepts.
7. Payment and Settlement/Payout are separate lifecycles.
8. Cancellation and Refund are separate concepts.
9. Operational states and financial states are separate state machines.
10. QR/token/intent creation is not proof of payment.
11. Financial mutations must be idempotent with durable enforcement where possible.
12. Provider events must be authenticated, deduplicated, persisted and reconcilable.
13. Tow CASH first-party behavior must not regress.
14. Shared tracking/UI must not depend on Tow-specific or Store-specific financial aggregates.
15. The workhorse must not select a Stripe Connect charge model until merchant-of-record/settlement responsibility is explicitly decided.
