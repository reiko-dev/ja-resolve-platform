# Payment Platform Implementation Plan

**Branch:** `feat/Pagamentos`  
**PR:** #45  
**Version:** 1.0  
**Status:** ACTIVE EXECUTION BASELINE  
**Companion architecture:** `docs/payments/PAYMENT-PLATFORM-FOUNDATION.md`

---

## 1. Purpose

This document is the execution baseline for the Payment Platform work.

The foundation document defines **what the architecture is**. This document defines **how we will reach it safely**, in ordered phases, without allowing implementation convenience to redefine the architecture.

The work is not considered complete when Stripe, PIX, card or IAP "works" in isolation. It is complete when all payment rails converge on one canonical financial model with durable idempotency, auditable provider events, reconciliation, safe migrations and explicit domain boundaries.

---

## 2. Non-negotiable execution rule

Implementation must follow this direction:

```text
Business bounded context
        ↓
authoritative business obligation
        ↓
Payment Platform
        ↓
processor adapter / internal cash
        ↓
external financial rail when applicable
```

Never:

```text
Tow/Store
  ↓
Stripe/Apple/Google directly
```

Never:

```text
Payments
  ↓
recalculate Tow tariff / Store checkout
```

The source domain determines **whether a financial obligation exists and its authoritative amount**.

Payments owns **financial execution and financial state**.

---

## 3. Execution protocol

Each phase must produce four things:

1. **Code** implementing only the phase scope.
2. **Tests** proving the happy path and negative invariants.
3. **Evidence** recording relevant commands, migrations, concurrency results and decisions.
4. **Commit(s)** whose message identifies the phase.

A phase is not complete merely because the app appears to work.

A phase is complete when its exit gate is satisfied.

### Workhorse authority

The workhorse MAY:

- implement structures already decided here;
- choose local naming where architecture is unaffected;
- refactor internal code when behavior and contracts are preserved;
- add tests, migration helpers and adapters required by the phase;
- remove dead code only when replacement/migration evidence proves it is safe.

The workhorse MUST NOT independently decide:

- a new money authority;
- a new payment state machine;
- a new business pricing rule;
- a direct provider dependency from Tow/Store;
- Stripe Connect charge model;
- merchant of record;
- platform commission/business fee semantics;
- who bears chargeback/refund/negative balance liability;
- any migration that destroys historical financial data;
- any shortcut that makes a client or socket event canonical financial state.

If one of those decisions becomes necessary, implementation stops at that decision boundary and records the blocker.

---

## 4. Global invariants

Every phase must preserve these invariants:

1. Canonical internal money uses integer cents.
2. Currency is explicit.
3. The originating domain supplies the authoritative business amount.
4. Payments does not recalculate business prices.
5. Payment is distinct from PaymentAttempt.
6. Payment is distinct from Refund.
7. Payment is distinct from Settlement/Transfer/Payout.
8. Financial states are distinct from operational states.
9. Client/mobile state is not canonical financial truth.
10. Provider intent/QR/token creation is not proof of payment.
11. Every externally repeatable financial mutation is idempotent.
12. Durable uniqueness is preferred over in-memory duplicate prevention.
13. Provider events are authenticated, deduplicated and persisted.
14. Webhooks/notifications are not assumed to arrive exactly once.
15. Reconciliation exists for externally processed money.
16. Tow CASH first-party behavior must not regress.
17. Store checkout must not gain a second total authority.
18. Legacy generic payment code is not the new core by default.
19. Shared UI/tracking remains independent of domain-specific financial aggregates.
20. Stripe Connect implementation waits for the explicit settlement decision gate.

---

# PHASE 0 — Current-State Persistence and Contract Audit

## Objective

Produce an implementation-grade map of every existing financial persistence structure and contract before adding or modifying tables.

The prior architectural audit established that legacy and Tow payment implementations coexist. This phase turns that knowledge into an exact migration map.

## Required audit

Inventory at minimum:

```text
database migrations
payments table
tow_payments table
tow_requests.payment_method
tow_assignments final price columns
purchase_orders / store-order financial columns
subscription-related persistence
commission/settlement-related persistence
legacy payment routes
Tow payment routes
OpenAPI payment schemas/routes
provider mock gateways
security tests
payment indexes/unique constraints
foreign keys
historical nullable columns
production/backfill assumptions
```

For every relevant table/column record:

```text
owner/domain
semantic meaning
money unit
nullability
unique constraints
foreign keys
write paths
read paths
whether authoritative or projection
migration risk
target disposition
```

## Deliverable

Create:

```text
docs/payments/PAYMENT-CURRENT-STATE-AUDIT.md
```

with a disposition for every legacy financial structure:

```text
KEEP
MIGRATE
COMPATIBILITY_ONLY
DEPRECATE
REMOVE_LATER
UNKNOWN / REQUIRES_DECISION
```

## Exit gate

Phase 0 is complete only when:

- no payment-related table or main write path is unclassified;
- authoritative money sources are explicitly identified;
- legacy `payments` and canonical Tow payment coexistence is documented;
- migration risks and historical-data constraints are known;
- the next schema phase can proceed without guessing.

---

# PHASE 1 — Canonical Persistence Contract

## Objective

Define and implement durable persistence for the shared Payment Platform.

Do not wire Stripe/IAP yet.

## Target core entities

Minimum target:

```text
payments
payment_attempts
payment_provider_events
refunds
```

Possible support tables may be added only if justified by idempotency, audit or outbox/reconciliation requirements.

Settlement tables are NOT part of this phase.

## Payment persistence requirements

The canonical payment record must be able to represent:

```text
business_key
context_type
context_id
payer_id
commerce_type
sales_channel
amount_cents
currency
method
processor
status
idempotency_key
paid_at
cancelled_at
expires_at
timestamps
```

Exact database types are implementation details, except:

- money must preserve exact integer cents;
- externally visible identifiers must not rely on float conversion;
- uniqueness/idempotency must be enforced durably.

## Expected durable constraints

At minimum investigate and implement the appropriate equivalents of:

```text
UNIQUE(business_key)
UNIQUE(idempotency_key)
UNIQUE(payment_id, attempt_number)
UNIQUE(processor, external_transaction_id) WHERE meaningful
UNIQUE(processor, external_event_id)
```

Do not add a uniqueness constraint blindly if the audit proves an existing business flow legitimately requires more than one obligation per source context. In that case, refine the business key rather than weakening idempotency.

## Migration requirements

Migrations must:

- be deterministic;
- be reversible when technically reasonable;
- not destroy existing Tow CASH data;
- not silently coerce decimal legacy values into cents without a documented conversion strategy;
- support existing production/historical rows;
- include PostgreSQL validation.

## Tests

Required:

- migration up/down or repository migration convention equivalent;
- unique-key enforcement;
- duplicate idempotency attempt;
- invalid money values;
- processor/external event duplicate;
- foreign-key behavior;
- concurrency test for duplicate creation.

## Exit gate

Phase 1 is complete when PostgreSQL itself prevents the primary duplicate-payment classes that matter to the current model.

---

# PHASE 2 — Payment Application Core

## Objective

Introduce the application layer that creates and transitions canonical Payment obligations without depending on HTTP or a concrete PSP.

## Required capabilities

At minimum:

```text
create/retrieve canonical obligation
create attempt
resolve processor through central routing policy
apply canonical financial transitions
record provider event
request refund record
query payment projection
idempotent command handling
```

The application layer must consume repository/processor ports rather than importing Knex/Stripe directly.

## State-machine rule

Do not allow arbitrary status assignment.

Transitions must be explicit and testable.

Initial canonical states remain:

```text
PENDING
PROCESSING
PAID
FAILED
CANCELLED
EXPIRED
```

If implementation proves that additional canonical states are required, stop and document why before changing the vocabulary.

Provider-specific states belong in adapter/event metadata, not the core state vocabulary.

## Exit gate

A complete in-memory/fake-adapter flow can exercise the Payment lifecycle without Express, Stripe, Apple or Google.

---

# PHASE 3 — Migrate Tow CASH to the Shared Payment Core

## Objective

Use the existing validated Tow CASH flow as the first real consumer of the shared Payment Platform.

This is deliberately the first integration because it exercises the common financial core without adding PSP uncertainty.

## Behavior that MUST remain true

```text
customer selects CASH when creating Tow request
        ↓
no payment row before assignment
        ↓
proposal accepted
        ↓
assignment created
        ↓
assignment final price is frozen
        ↓
Payment obligation materializes from that frozen price
        ↓
service completes
        ↓
assigned partner confirms cash received
        ↓
Payment becomes financially paid/received
```

There must be no second first-party payment-method choice after proposal acceptance.

The compatibility payment-method endpoint may remain for historical/recovery flows but cannot become the primary flow.

## Migration rule

The workhorse must explicitly determine whether existing `tow_payments`:

- becomes the canonical `payments` storage through data migration;
- becomes a compatibility projection;
- is dual-read/dual-written temporarily;
- is removed only after verified migration.

Silent duplication of both as competing financial authorities is forbidden.

## Tests

Preserve existing Tow MVP payment tests and add shared-platform tests proving:

- exact assignment final-price amount;
- no client-supplied amount;
- one financial obligation;
- retry safety;
- concurrent accept does not duplicate payment;
- cash receipt is idempotent;
- payment state remains separate from Tow operational state.

## Exit gate

All existing Tow CASH behavior passes while the canonical financial authority is the shared Payment Platform or a documented transition layer with exactly one authority.

---

# PHASE 4 — Connect Store / Checkout to the Shared Payment Core

## Objective

Make Store the second consumer and prove that the Payment Platform supports a different business context without learning Store pricing rules.

## Store authority

The source domain must provide the frozen order/checkout total in integer cents.

Payments must never:

- sum cart items;
- apply discounts;
- calculate delivery;
- parse formatted BRL;
- derive total from UI strings.

## Required flow

```text
cart/checkout domain
        ↓
PurchaseOrder with authoritative total_cents
        ↓
Payment obligation
        ↓
processor routing
```

The Payment record should reference the order context but not duplicate Store pricing logic.

## Tests

Required:

- checkout total == purchase-order total == Payment amount;
- quantity mutation cannot leave stale payment authority;
- client cannot override payment amount;
- repeated order-payment creation is idempotent;
- Tow and Store can coexist without branching business logic inside Payments.

## Exit gate

Tow and Store both create canonical Payment obligations through the same core while retaining independent business pricing logic.

---

# PHASE 5 — Stripe Processor Adapter

## Objective

Implement the first production-capable external processor for eligible payment flows.

Stripe is for:

```text
physical goods
real-world services
eligible Web digital commerce
```

It is not the mobile in-app digital billing rail.

## Requirements

Implement the processor port behind a Stripe adapter.

No Tow or Store service may import the Stripe SDK directly.

Sensitive card data must remain provider/tokenization owned whenever the Stripe integration supports that path.

The adapter is responsible for mapping between:

```text
canonical Payment / PaymentAttempt
↔
Stripe-specific request/response/status
```

Provider-specific status must not leak into the core state vocabulary.

## Idempotency

Every Stripe mutation that can be retried must carry a deterministic platform idempotency strategy.

A timeout after request dispatch must be treated as an unknown outcome requiring retrieve/reconcile, not immediate blind recreation.

## Methods

Initial eligible methods:

```text
CARD
PIX
```

Exact method availability must be determined by the actual configured Stripe account/country capabilities at implementation time. Do not fake support merely because the domain vocabulary contains a method.

## Exit gate

A test/sandbox Stripe flow can create, retrieve and reconcile an attempt through the adapter without changing Tow/Store domain code.

---

# PHASE 6 — Provider Events + Reconciliation

## Objective

Make asynchronous external payment confirmation production-safe.

## Provider-event pipeline

```text
external event
    ↓
provider authenticity/signature verification
    ↓
deduplication
    ↓
durable provider-event persistence
    ↓
PaymentAttempt resolution
    ↓
valid canonical transition
    ↓
internal domain event / projection update
```

No event may mutate financial state before authenticity is established.

## Reconciliation

Implement recovery for at least:

- lost webhook;
- duplicate webhook;
- delayed event;
- HTTP timeout after processor accepted request;
- application restart during processing;
- local state inconsistent with provider state.

Reconciliation must be safe to run repeatedly.

## Exit gate

The system remains financially correct if the same provider event arrives multiple times or does not arrive and is later recovered by reconciliation.

---

# PHASE 7 — Apple App Store and Google Play Billing Verification

## Objective

Integrate mobile digital commerce into the same canonical Payment Platform.

## Routing

```text
DIGITAL + IOS_APP
→ APPLE_APP_STORE

DIGITAL + ANDROID_APP
→ GOOGLE_PLAY
```

The mobile app initiates the store purchase but is not the final authority that a purchase is valid.

## Required backend responsibilities

Implement processor adapters capable of:

- validating external purchase identifiers/tokens server-side;
- preventing transaction replay;
- mapping verified external transactions to Payment/PaymentAttempt;
- processing server-side store notifications through the provider-event discipline;
- reconciling purchases/subscriptions where the provider API supports it.

## Entitlement boundary

Payments emits the verified financial fact.

The owning digital/subscription domain grants or revokes access.

Never:

```text
Payment service directly toggles arbitrary product/course/app permissions
```

## Exit gate

A verified Apple/Google transaction produces a canonical Payment transition and a separate entitlement-domain reaction, with replay protection.

---

# PHASE 8 — Refund Lifecycle

## Objective

Implement refunds as first-class financial records, not status shortcuts.

## Rule

```text
Business domain decides:
"refund is owed" + amount/reason

Payments decides:
how to execute and record it
```

Cancellation is not refund.

## Required model

A Refund must retain:

- payment reference;
- amount_cents;
- currency;
- reason/reference;
- processor;
- external refund reference when applicable;
- canonical status;
- timestamps;
- idempotency key.

Partial refunds must not be represented by mutating the original Payment amount.

## Tests

Required:

- full refund;
- partial refund if supported by business policy;
- duplicate refund request;
- provider timeout/reconciliation;
- refund greater than refundable balance rejected;
- cancelled business object without refund remains financially distinct.

## Exit gate

Refund behavior is auditable, idempotent and processor-independent.

---

# DECISION GATE S1 — Marketplace Settlement / Merchant of Record

## Timing

This decision is intentionally made **after the common Payment core and basic processors are proven**, but **before Stripe Connect settlement is implemented**.

It does not block Phases 0–8.

It blocks Phase 9.

## Questions that must be answered

For Tow partners, Store sellers and future marketplace actors:

1. Who is merchant of record?
2. Is the customer paying Já Resolve or the provider/seller directly?
3. Who bears processor fees?
4. Who bears chargebacks?
5. Who bears negative balances?
6. Who authorizes/refunds?
7. Does the platform retain a commission/application fee?
8. When does a provider receivable become earned?
9. When may funds be transferred?
10. Are transfers delayed until service/order completion?
11. What happens when a paid order/service is disputed after transfer?
12. Which actor is responsible for tax/fiscal obligations for the underlying sale/service?
13. Are Tow and Store settlement policies identical or merely implemented on the same settlement infrastructure?

## Required output

Create an explicit decision document before implementation:

```text
docs/payments/PAYMENT-SETTLEMENT-DECISION.md
```

It must select and justify the appropriate Stripe Connect model rather than starting from:

```text
Direct Charges
Destination Charges
Separate Charges and Transfers
```

as a purely technical preference.

---

# PHASE 9 — Settlement and Stripe Connect

## Prerequisite

`PAYMENT-SETTLEMENT-DECISION.md` must be CLOSED.

## Objective

Represent the distribution of already-paid customer funds separately from the Payment lifecycle.

## Target conceptual model

```text
Payment
   ↓
SettlementAllocation
├── PLATFORM
└── PROVIDER/SELLER
          ↓
       Transfer
          ↓
       Payout projection/status
```

Payment = PAID must not imply Partner = PAID_OUT.

## Requirements

- immutable/traceable allocation basis;
- integer cents;
- no allocation sum exceeding captured/settled amount;
- provider/seller identity frozen appropriately;
- transfer idempotency;
- external transfer reference uniqueness;
- recoverable/reconcilable transfer status;
- refund/chargeback interaction follows the closed decision.

## Exit gate

The platform can prove where each cent of a marketplace payment belongs and whether it has merely been allocated, transferred or actually paid out.

---

# PHASE 10 — Observability, Security and Operational Hardening

## Objective

Make the platform operable in production.

## Required capabilities

At minimum:

- structured financial logs without PAN/CVV/secrets;
- correlation IDs across Payment → Attempt → ProviderEvent → Refund/Transfer;
- metrics for failures, pending-age and reconciliation findings;
- dead-letter/retry handling where asynchronous processing exists;
- audit trail for manual/admin financial actions;
- alerts for stuck PROCESSING payments;
- alerts for provider/local state divergence;
- secret/config validation;
- production prohibition for mock processors;
- rate limiting/authorization on sensitive financial endpoints.

## Exit gate

A production incident can be diagnosed without querying raw provider dashboards as the only source of truth.

---

# PHASE 11 — Legacy Payments Retirement

## Objective

Remove the competing generic/legacy payment authority only after canonical replacements are proven.

Target legacy area includes:

```text
src/services/paymentService.js
src/routes/payments.js
src/services/gateways/*
legacy payments persistence/columns where applicable
legacy emergency payment coupling
```

## Rule

Do not delete first and discover consumers later.

For every legacy API/write path:

```text
consumer inventory
→ replacement
→ compatibility/migration window
→ tests
→ deprecation evidence
→ removal
```

Any historical data retained for audit must remain readable after write retirement.

## Exit gate

There is exactly one active financial write architecture.

Legacy code may remain only as an explicitly read-only compatibility surface with an owner and removal condition.

---

# PHASE 12 — Release Readiness Gate

## Objective

Prove the complete financial foundation rather than only feature demos.

## Required final evidence

At minimum:

```text
full backend test suite
focused Payments suite
Tow regression suite
Store/Checkout financial consistency suite
PostgreSQL migration test
concurrency/idempotency tests
provider sandbox tests
provider-event duplicate/replay tests
reconciliation tests
refund tests
security/logging tests
OpenAPI validation
secret scan
production config validation
```

If Stripe Connect is in the release scope:

```text
settlement allocation invariants
transfer idempotency
Connect sandbox evidence
negative-balance/refund/chargeback cases defined by S1
```

If IAP is in the release scope:

```text
Apple verification replay test
Google verification replay test
server notification deduplication
entitlement handoff tests
```

## Exit gate

The PR can only leave draft when:

- all implemented phases are marked complete with evidence;
- unresolved decisions are not silently implemented;
- no known financial-authority duplication remains inside completed scope;
- CI/gates are green;
- review confirms the architectural invariants in the foundation document are still true.

---

# 5. Phase dependency graph

```text
PHASE 0 — Audit
    ↓
PHASE 1 — Persistence
    ↓
PHASE 2 — Application Core
    ↓
PHASE 3 — Tow CASH migration
    ↓
PHASE 4 — Store integration
    ↓
PHASE 5 — Stripe adapter
    ↓
PHASE 6 — Provider events + reconciliation
    ↓
PHASE 7 — Apple / Google verification
    ↓
PHASE 8 — Refunds
    ↓
DECISION GATE S1 — Settlement / Merchant of Record
    ↓
PHASE 9 — Stripe Connect settlement
    ↓
PHASE 10 — Operational hardening
    ↓
PHASE 11 — Legacy retirement
    ↓
PHASE 12 — Release readiness
```

Phases may share preparatory code, but they must not be declared complete out of order when a dependency is unresolved.

---

# 6. Progress ledger

This table is the canonical progress summary for this PR.

| Stage | Status | Evidence / Commit |
|---|---|---|
| Foundation architecture | DONE | `28e6ce78d38153757577d0e7940604213970bf45` |
| Phase 0 — Current-state audit | TODO | — |
| Phase 1 — Canonical persistence | TODO | — |
| Phase 2 — Application core | TODO | — |
| Phase 3 — Tow CASH migration | TODO | — |
| Phase 4 — Store integration | TODO | — |
| Phase 5 — Stripe adapter | TODO | — |
| Phase 6 — Provider events/reconciliation | TODO | — |
| Phase 7 — Apple/Google verification | TODO | — |
| Phase 8 — Refund lifecycle | TODO | — |
| Decision Gate S1 — Settlement | TODO | — |
| Phase 9 — Stripe Connect settlement | BLOCKED_BY_S1 | — |
| Phase 10 — Operational hardening | TODO | — |
| Phase 11 — Legacy retirement | TODO | — |
| Phase 12 — Release readiness | TODO | — |

Status vocabulary:

```text
TODO
IN_PROGRESS
BLOCKED
BLOCKED_BY_<GATE>
DONE
SUPERSEDED
```

Every phase-closing commit should update this ledger.

---

# 7. Immediate next action

The next implementation task is **Phase 0 — Current-State Persistence and Contract Audit**.

Do not begin schema implementation until that audit is committed.

The Phase 0 report must be factual and read-only. Its purpose is to ensure that Phase 1 migrations are designed from the real production-compatible schema rather than from the desired architecture alone.
