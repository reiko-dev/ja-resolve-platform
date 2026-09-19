# Tow Service — TDD Implementation Plan

> Contract baseline: PR #9  
> Epic: #10  
> Current Phase: **Tow MVP**  
> Phase-1 issues: **#13–#18**  
> Phase-2 hardening: **#33**

## 1. Strategy

The long-term target remains the PR #9 Tow contract.

The executable implementation path is now optimized for a usable first product:

```text
T00 ACCEPTED
→ T01 ACCEPTED
→ MVP-01 Foundation
→ MVP-02 Routes & Pricing
→ MVP-03 Request & Matching
→ MVP-04 Proposal & Assignment
→ MVP-05 Service Execution
→ MVP-06 CASH + Lean E2E
→ TOW MVP BACKEND READY FOR INTEGRATION
```

Production-grade features intentionally deferred from the critical path are tracked in #33.

## 2. Architecture constraints

Tow remains an explicit module:

```text
module_key   = tow
service_key  = tow
partner_type = tow
```

Boundary:

```text
Tow
├── Domain
│   ├── Entities/Aggregates
│   ├── Value Objects
│   ├── Policies
│   └── Invariants
├── Application
│   ├── Use Cases
│   ├── Ports
│   └── Orchestration
├── Adapters
│   ├── HTTP
│   ├── Persistence
│   └── Presenters
└── Infrastructure
    ├── PostgreSQL
    ├── Google Routes
    ├── File Storage
    └── Payment adapters when required
```

Rules:

- Domain/Application do not import Express, Knex/PostgreSQL, Google SDK, PSP SDK, filesystem or concrete schedulers;
- external dependencies are ports;
- controllers are thin;
- DB invariants live in DB constraints where appropriate;
- concurrency-critical invariants use real PostgreSQL;
- consumer apps never duplicate Tow pricing or assignment rules.

## 3. TDD cycle

Every delivery:

```text
RED
→ GREEN
→ REFACTOR
→ FOCUSED INTEGRATION GATE
→ ADVERSARIAL REVIEW
→ EXTERNAL REVIEW
→ MERGE
→ POST-MERGE VERIFY
→ ACCEPTED RECEIPT
```

If behavior already exists, record baseline compatibility rather than fabricating a meaningless RED.

No next delivery starts until the prior accepted receipt is verified.

## 4. Pricing invariant

Always:

```text
total_distance_meters =
  provider_to_pickup + pickup_to_destination

excess_meters =
  max(0, total_distance_meters - included_distance_meters)

variable_charge_cents =
  ROUND_HALF_UP(
    excess_meters * price_per_additional_km_cents / 1000
  )

final_price_cents =
  minimum_charge_cents + variable_charge_cents
```

No `ceil(excess_km)`.

## 5. MVP feature-flag semantics

Phase 1 proves the minimum useful semantics:

- disabled blocks new request;
- disabled blocks new matching/proposal;
- already assigned work may continue to terminal;
- registration/administration of partner/vehicle/documents remains.

Deferred to #33:

- progressive matching shutdown;
- automatic SEARCHING/NEGOTIATING closure;
- full disable-vs-assignment race matrix;
- re-enable/non-resurrection certification.

## 6. Executable deliveries

| ID | Issue | Delivery | Size | Depends on |
|---|---:|---|---|---|
| MVP-01 | #13 | Module + Vehicles + Documents + Compatibility | L | T01 |
| MVP-02 | #14 | Google Routes + Authoritative Pricing | M/L | MVP-01 |
| MVP-03 | #15 | Tow Request + Lean Matching | L | MVP-02 |
| MVP-04 | #16 | Proposals + Atomic Assignment | L/XL | MVP-03 |
| MVP-05 | #17 | State Execution + Tracking + Basic Cancellation | L | MVP-04 |
| MVP-06 | #18 | CASH + Lean End-to-End Gate | L/XL | MVP-05 |

### MVP-01 gate

Backend can determine whether a Tow partner/vehicle is operationally eligible.

### MVP-02 gate

Backend produces an authoritative road-route quote and final price.

### MVP-03 gate

Customer creates a request and eligible nearby partners can discover it.

Matching uses one configurable radius; no progressive scheduler.

### MVP-04 gate

Multiple proposals may exist, but exactly one assignment wins atomically.

Counteroffer is not part of Phase 1.

### MVP-05 gate

```text
ASSIGNED
→ EN_ROUTE
→ ARRIVED
→ IN_TRANSIT
→ COMPLETED
```

Tracking and basic cancellation are functional.

### MVP-06 gate

CASH completes the first real payment path.

The current Stripe/MercadoPago/PagSeguro adapters are simulations, therefore electronic PSP readiness is not claimed.

## 7. Lean MVP E2E certification

MVP-06 requires at least 20 scenarios covering:

- module enabled/disabled;
- TowVehicle/docs/compatibility eligibility;
- matching;
- Google Routes;
- proportional pricing;
- proposals;
- atomic assignment;
- operational transitions;
- tracking isolation;
- completion;
- idempotent CASH receipt;
- full happy path.

It also requires:

- fresh PostgreSQL migrate/seed;
- T01 reset safety;
- OpenAPI validation;
- contract regression;
- `verify:tow`;
- full backend regression;
- readiness report;
- accepted receipt.

The gate emits only:

```text
TOW MVP BACKEND READY FOR INTEGRATION
```

## 8. Phase 2

#33 owns the deferred target:

- counteroffer;
- progressive matching scheduler;
- timeout/no-show/rematch;
- complex cancellation economics;
- CARD;
- PIX;
- real PSP integrations/webhooks;
- debts;
- wallet/ledger;
- settlement/payout;
- disputes/reviews/admin override/audit;
- full security/performance/reliability hardening;
- 75+ E2E full target certification.

Only Phase 2 may emit:

```text
TOW BACKEND READY FOR INTEGRATION
```

## 9. Current foundation

T00: ACCEPTED.  
T01: ACCEPTED.

Current base:

```text
main @ f31962fdd0175303646a34c9d170032bc6a06601
```

Post-T01 baseline:

```text
OpenAPI              PASS
contract             62/62
DB safety            48/48
live T01 PostgreSQL  33/33
verify:tow           GREEN
full Jest            771 passed / 48 skipped / 0 failures
```

## 10. Workhorse readiness

```text
READY(MVP-01) = T01 ACCEPTED

READY(MVP-n) =
  predecessor.status == ACCEPTED
```

MVP-01/#13 is the only Phase-1 implementation task currently READY.

Do not:

- start #14 before #13 accepted;
- reopen #19–#29 as MVP dependencies;
- pull #33 scope into an MVP PR;
- touch #31 during functional work unless explicitly requested;
- touch production/VPS as part of these implementation tasks.

## 11. Definition of Done — Phase 1

Phase 1 is complete when:

- #13–#18 are closed by accepted PRs;
- all post-merge verification gates pass;
- the 20 mandatory MVP scenarios are green;
- fresh DB baseline remains reproducible;
- customer request → partner proposal → assignment → tracking → completion → CASH works end-to-end;
- MVP subset documentation matches real HTTP behavior;
- `TOW MVP BACKEND READY FOR INTEGRATION` has an accepted receipt.
