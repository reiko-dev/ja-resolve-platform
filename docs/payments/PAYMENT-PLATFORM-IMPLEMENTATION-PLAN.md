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

Implement the smallest durable persistence contract required by the shared Payment Platform.

This phase is now treated as **greenfield financial persistence**.

Project-stage assumption:

```text
REAL_USERS = NONE
AUTHORITATIVE_PRODUCTION_PAYMENT_HISTORY = NONE
LEGACY_PAYMENT_DATA_RETENTION_REQUIRED = NO
LEGACY_PAYMENT_API_COMPATIBILITY_REQUIRED = NO
```

This permission applies to payment/financial legacy only. It does not authorize deleting unrelated Tow, Store, user, partner or order-domain data.

Do not wire Stripe/IAP yet.

## Revised strategy

The absence of real payment history removes the need for:

- legacy financial backfill;
- decimal-to-cents conversion of historical rows;
- dual-write;
- dual-read;
- a payment compatibility window;
- preserving legacy payment IDs;
- preserving old mock gateway state.

However, deleting the legacy stack **before it blocks us** would make Phase 1 slower because the legacy `payments` table is referenced by wallet, commission, dispute and subscription-history structures.

Therefore Phase 1 uses the lowest-blast-radius strategy:

```text
create clean canonical persistence
        ↓
do not write legacy from new code
        ↓
migrate Tow in Phase 3
        ↓
migrate Store in Phase 4
        ↓
delete legacy financial stack immediately after the last consumer moves
```

There is no backfill and no synchronization between the two architectures.

Legacy is temporary dead-end compatibility, not a migration source.

## Physical tables in Phase 1

Implement exactly the persistence needed by the application core:

```text
payment_obligations
payment_attempts
```

Do **not** create speculative tables early.

Moved to later phases:

```text
payment_provider_events -> Phase 6
refunds                 -> Phase 8
settlement tables       -> after Decision Gate S1
```

The domain entity remains named `Payment`. `payment_obligations` is the physical table name used to avoid coupling Phase 1 to the active legacy `payments` table.

This name may remain permanently; a cosmetic rename is not a release requirement.

## Canonical `payment_obligations`

Minimum persisted fields:

```text
id
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
idempotency_fingerprint
paid_at
cancelled_at
expires_at
created_at
updated_at
```

### Rules

- `amount_cents` is an exact integer and MUST be greater than zero;
- formatted/decimal money is never persisted as the canonical amount;
- the originating business domain supplies the frozen amount;
- `processor` must match the central routing vocabulary;
- `status` must use the canonical Payment vocabulary;
- no generic JSON field may become an alternate monetary or status authority;
- payment rows are not physically deleted by normal runtime operations.

## Canonical `payment_attempts`

Minimum persisted fields:

```text
id
payment_id
attempt_number
processor
status
provider_idempotency_key
external_transaction_id
failure_code
failure_message
created_at
updated_at
```

A PaymentAttempt represents one execution attempt against a payment rail.

It must not own or recalculate the business amount.

## Durable constraints

Phase 1 must enforce in PostgreSQL, at minimum:

```text
UNIQUE(payment_obligations.business_key)

UNIQUE(
  payment_obligations.payer_id,
  payment_obligations.idempotency_key
)

UNIQUE(
  payment_attempts.payment_id,
  payment_attempts.attempt_number
)

UNIQUE(
  payment_attempts.processor,
  payment_attempts.provider_idempotency_key
)

UNIQUE(
  payment_attempts.processor,
  payment_attempts.external_transaction_id
)
WHERE external_transaction_id IS NOT NULL
```

Also enforce:

- `amount_cents > 0`;
- valid currency shape;
- canonical enum/check vocabularies;
- `attempt_number > 0`;
- FK from attempt to Payment;
- timestamp/status coherence where it can be expressed without making future processors impossible.

## Idempotency contract

`business_key` answers:

```text
Which business obligation is this?
```

Examples:

```text
TOW_SERVICE:<assignment-id>
STORE_ORDER:<purchase-order-id>
PREMIUM_SUBSCRIPTION:<billing-cycle-id>
```

`idempotency_key` answers:

```text
Is this the same create command being replayed?
```

`idempotency_fingerprint` allows Phase 2 to distinguish:

```text
same key + same command      -> replay existing Payment
same key + different command -> idempotency_conflict
```

Do not weaken DB uniqueness to make retries easier.

## Migration policy

Use a new forward migration after the current migration head.

Do not rewrite historical migrations merely because payment data is disposable.

Phase 1 migration is additive and contains **no payment-data migration**.

The reason is operational safety, not historical preservation: a forward migration keeps local/test/staging databases deterministic and avoids requiring a full database reset for unrelated domains.

Legacy payment tables may be dropped later without retaining their rows.

## Repository layer

Implement persistence adapters under the shared Payments module.

Minimum Payment repository capabilities:

```text
create
findById
findByBusinessKey
findByIdempotencyKey
guarded status transition
withTransaction
classify uniqueness conflict
```

Minimum PaymentAttempt repository capabilities:

```text
create
findById
findByPaymentAndAttempt
attach external transaction id
guarded status transition
withTransaction
classify uniqueness conflict
```

Repositories must not:

- calculate prices;
- choose a processor;
- call a PSP;
- mutate source-domain records;
- parse formatted money.

## Legacy policy during Phase 1

No new code may depend on:

```text
src/services/paymentService.js
src/routes/payments.js
src/services/gateways/*
src/models/Payment.js
legacy payments table
legacy wallet/commission payment coupling
```

Existing legacy code may remain temporarily mounted while this branch is being built, but it is frozen:

```text
NO NEW FEATURES
NO NEW CONSUMERS
NO NEW SCHEMA COUPLING
NO BACKFILL
NO DUAL-WRITE
```

Because there are no real users, once the last current consumer is replaced the old path can be deleted immediately. No compatibility window is required.

## Required tests

Use real PostgreSQL for persistence/concurrency evidence.

Required:

- migration up/down or repository migration convention equivalent;
- create/read canonical Payment;
- create/read PaymentAttempt;
- reject zero/negative/non-integer canonical money;
- business-key uniqueness;
- payer-scoped idempotency-key uniqueness;
- duplicate attempt-number rejection;
- duplicate provider-idempotency-key rejection;
- duplicate external transaction rejection;
- FK behavior;
- guarded status transition;
- concurrent duplicate Payment creation;
- concurrent duplicate attempt creation;
- transaction rollback leaves no partial financial write.

Do not spend Phase 1 test effort on Stripe, webhooks, refunds, IAP or settlement.

## Exit gate

Phase 1 is complete when all of the following are true:

```text
1. PostgreSQL contains a clean canonical Payment persistence model.
2. Payment and PaymentAttempt repositories are implemented.
3. Duplicate business obligations cannot be created concurrently.
4. Duplicate processor attempts cannot be created concurrently.
5. Canonical money is integer cents only.
6. No data was migrated from legacy payments.
7. No new runtime code depends on legacy payment infrastructure.
8. Tow still behaves exactly as before; its migration has not started.
9. No PSP is wired yet.
```

The next step is Phase 2 application orchestration over this persistence.

---

# PHASE 2 — Payment Application Core

## Status

```text
BLOCKED_BY_PHASE_1
```

Detailed execution contract:

```text
docs/payments/PHASE-2-APPLICATION-CORE-PLAN.md
```

## Objective

Harden the shared Payment application layer so business domains can create, query and evolve canonical financial obligations without HTTP or a concrete PSP.

Phase 2 owns:

```text
application command contracts
canonical reads
PaymentAttempt lifecycle
semantic Payment transitions
settlement-evidence validation
Payment ↔ PaymentAttempt coordination
application projections / DTOs
stable error contract
application-core lifecycle tests
```

Phase 2 explicitly does NOT own:

```text
provider events
webhooks
reconciliation
refund persistence/execution
Stripe integration
Apple/Google verification
Tow migration
Store migration
settlement / Stripe Connect
public Payment HTTP routes
```

Provider events remain in Phase 6.

Refunds remain in Phase 8.

## Exit gate

Phase 2 is complete only when the two canonical lifecycle scenarios are proven without a concrete PSP:

```text
External rail:
Payment PENDING
→ Attempt #1 FAILED
→ Attempt #2 SUCCEEDED
→ accepted PROCESSOR_ATTEMPT evidence
→ Payment PAID

Internal cash:
Payment PENDING
→ no PaymentAttempt
→ accepted INTERNAL_CASH_CONFIRMATION evidence
→ Payment PAID
```

Application/domain code must remain independent from Express, Knex rows as public contracts, Stripe, Apple, Google and legacy payment services.

See `PHASE-2-APPLICATION-CORE-PLAN.md` for the complete ordered checklist and acceptance matrix.

---

# PHASE 3 — Migrate Tow CASH to the Shared Payment Core

## Decision contract

D1 is CLOSED.

Canonical implementation authority:

```text
docs/payments/PHASE-3-TOW-CASH-MIGRATION-CONTRACT.md
```

Phase 3 must implement that contract without reopening its decisions unless a concrete code contradiction or new product requirement is found.

## Frozen integration

```text
Payment identity  = TOW_SERVICE:<assignment_id>
payer             = Tow customer
commerce_type     = REAL_WORLD_SERVICE
sales_channel     = frozen TowRequest.sales_channel
amount_cents      = TowAssignment.final_price_amount_cents
currency          = TowAssignment.final_price_currency
method            = CASH
processor         = INTERNAL_CASH
initial status    = PENDING
PaymentAttempt    = none
```

Proposal acceptance, assignment creation and Payment creation must commit in the same database transaction.

The shared Payment application service must support transaction-bound creation; Tow must not import Payment persistence adapters.

## Cash receipt

```text
Tow COMPLETED
+ assigned partner confirmation
+ INTERNAL_CASH_CONFIRMATION
→ Payment PAID
```

Evidence identity:

```text
tow-cash-receipt:<assignment_id>:v1
```

Replay must preserve the original paid_at.

## Greenfield retirement rule

```text
NO BACKFILL
NO DATA COPY
NO FINAL DUAL-WRITE
NO PERMANENT DUAL-READ
NO HISTORICAL ID PRESERVATION
```

The legacy post-assignment payment-method endpoint is removed in Phase 3.

tow_payments is dropped after all runtime reads/writes have moved to canonical Payment and regressions are green.

A missing Payment after an assignment exists is an integrity failure, not a lazy-create compatibility case.

## Additional Tow requirement

Phase 3 persists an immutable TowRequest.sales_channel using the canonical channel vocabulary:

```text
IOS_APP
ANDROID_APP
WEB
```

Do not hard-code Android or infer channel from User-Agent.

## Exit gate

Phase 3 is complete only when:

- all tests required by the D1 contract are green;
- the assignment + Payment atomicity is proven on PostgreSQL;
- CASH creates no PaymentAttempt;
- Tow PaymentSummary reads from canonical Payment;
- cash receipt settles canonical Payment idempotently;
- no production runtime consumer reads/writes tow_payments;
- tow_payments and the compatibility selection path are removed;
- complete Tow regressions remain green.

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

# PHASE 11 — Legacy Payments Removal Verification

## Objective

Verify that all legacy payment infrastructure has already been removed after its last consumer migrated.

Because there are no real users and no authoritative legacy payment history to preserve, **legacy retirement is no longer a late compatibility project**.

Removal should happen incrementally as soon as the relevant consumer replacement is complete.

Target legacy area includes:

```text
src/services/paymentService.js
src/routes/payments.js
src/services/gateways/*
src/models/Payment.js
legacy payments persistence
legacy wallet/commission payment coupling
legacy emergency payment coupling
obsolete payment mocks/tests
```

## Rule

Do not keep compatibility surfaces merely for historical reasons.

The only precondition for deletion is:

```text
identify current consumer
→ replace current consumer
→ prove replacement with tests
→ delete legacy path
```

No data-backfill, read-only compatibility window or historical payment-ID preservation is required.

Phase 11 is therefore a final **absence audit**, not the main removal phase.

## Exit gate

There is exactly one active financial write architecture and repository search confirms no runtime consumer imports or mounts the legacy stack.

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

# 4.1 Documentation closure track

The remaining pre-integration documentation decisions for Tow + Store are tracked in:

```text
docs/payments/PAYMENT-DOCUMENTATION-CLOSURE-CHECKLIST.md
```

Mandatory closure order:

```text
D1 — Tow CASH Migration Contract
D2 — Store Financial Authority Contract
D3 — Settlement Evidence Contract
D4 — Payment API Boundary Decision
```

These decisions are intentionally separated from provider-specific work.

D1 blocks Phase 3.

D2 blocks Phase 4.

D3 defines the semantic PAID boundary used by Phase 2 hardening and later integrations.

D4 must close before introducing any new public generic Payment HTTP surface.

The checklist also records which older Foundation/Plan/Code Contract passages must be reconciled after each decision closes.

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
| Phase 0 — Current-state audit | DONE | `feed5da5486d025b98d0b825263d2b7b6740ee5c` / `PAYMENT-CURRENT-STATE-AUDIT.md` |
| Phase 1 — Canonical persistence | IN_PROGRESS | `e11aea73e3241d30b071b501ea1fe9f2f4fe74c8` / `PHASE-1-IMPLEMENTATION-HANDOFF.md` |
| Phase 2 — Application core | BLOCKED_BY_PHASE_1 | `PHASE-2-APPLICATION-CORE-PLAN.md` |
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

The next task is to **validate and close Phase 1**, not to start provider integration.

Implementation baseline:

```text
e11aea73e3241d30b071b501ea1fe9f2f4fe74c8
```

Detailed handoff:

```text
docs/payments/PHASE-1-IMPLEMENTATION-HANDOFF.md
```

Required next work:

- run the focused Payments tests;
- run the PostgreSQL gate;
- validate migration 011 up/down/up;
- add/run real PostgreSQL concurrency cases for duplicate Payment and PaymentAttempt creation;
- fix only findings required to satisfy the existing contract;
- keep Tow/Store/provider wiring out of Phase 1.

Phase 1 becomes `DONE` only after that evidence is versioned.
