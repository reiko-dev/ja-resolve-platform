# Tow MVP Delivery Plan

> Project: JaResolve  
> Domain: Tow / Guincho  
> Contract baseline: PR #9  
> Epic: #10  
> Current implementation baseline: `main @ 7ad3e56bab9bfc839dca88dc2832e425383b7741` (MVP-03 accepted; MVP-04 dispatch base)  
> Phase 1 executable issues: #13–#18  
> Phase 2 hardening backlog: #33

## 1. Why this re-plan exists

The original T00–T18 roadmap describes a production-grade Tow platform: progressive matching, counteroffers, multiple payment rails, debt ledgers, wallet/settlement/payout, disputes, immutable audit and a 75+ E2E certification gate.

That remains the **long-term target**, but it is too large to be the shortest path to a real usable Tow flow.

The implementation is therefore split into two milestones:

```text
PHASE 0 — FOUNDATION
T00 Harness/Audit       ACCEPTED
T01 DB Baseline         ACCEPTED

PHASE 1 — TOW MVP
MVP-01 Foundation
MVP-02 Routes & Pricing
MVP-03 Request & Matching
MVP-04 Proposal & Assignment
MVP-05 Service Execution
MVP-06 CASH + Lean E2E
        ↓
TOW MVP BACKEND READY FOR INTEGRATION

PHASE 2 — PRODUCTION HARDENING (#33)
advanced negotiation
advanced matching/races
CARD + PIX
debt/wallet/settlement/payout
no-show/rematch economics
disputes/reviews/admin/audit
75+ E2E full certification
        ↓
TOW BACKEND READY FOR INTEGRATION
```

## 2. What remains unchanged

The re-plan changes **implementation sequencing and MVP scope**, not the core architectural principles.

Still normative:

- Clean Architecture + SOLID;
- TDD;
- canonical module identity:
  - `module_key=tow`;
  - `service_key=tow`;
  - `partner_type=tow`;
- backend-authoritative pricing;
- Google Routes road distance;
- provider → pickup + pickup → destination;
- proportional excess pricing by meter;
- no `ceil(excess_km)`;
- money in cents;
- `ROUND_HALF_UP` at the monetary boundary;
- external systems behind ports;
- PostgreSQL real for critical DB/concurrency tests;
- no business-rule duplication in mobile clients.

PR #9 and the existing Tow specifications remain the **long-term target contract**.

## 3. Readiness milestones

### 3.1 Mock-first consumer milestone

Already available from PR #9:

```text
TOW MOBILE CONTRACT READY FOR IMPLEMENTATION
```

Consumers may build UI/repositories/state management against mocks/contracts.

### 3.2 MVP backend milestone

New Phase 1 gate:

```text
TOW MVP BACKEND READY FOR INTEGRATION
```

This means only the explicitly implemented MVP subset is safe for real consumer integration.

It does **not** claim the full PR #9 target surface is production-ready.

### 3.3 Full backend milestone

Reserved for Phase 2/#33:

```text
TOW BACKEND READY FOR INTEGRATION
```

This retains the meaning previously assigned to the old T18: complete target contract, production hardening and exhaustive certification.

## 4. Foundation already accepted

### T00 — Harness & Current-State Audit

Status: **ACCEPTED**

### T01 — Clean DB Baseline, Reset & Admin Seed

Status: **ACCEPTED**

Merge:

```text
PR #32
merge commit:
f31962fdd0175303646a34c9d170032bc6a06601
```

Post-merge baseline:

```text
validate:openapi     PASS
contract             62/62 PASS
db safety            48/48 PASS
live T01 PostgreSQL  33/33 PASS
verify:tow           GREEN
full Jest            771 passed / 48 skipped / 0 failures
```

Schema fingerprint:

```text
0e4e8ed825fb1629a1474f590ae5dc1c779685ecb927acbae038276cdfea4926
```

This commit is the starting point for MVP-01.

## 5. Six executable MVP deliveries

### MVP-01 — Tow Foundation

Issue: #13  
Depends on: T01 accepted  
Size: L  
Status: **ACCEPTED**

Merge:

```text
PR #35
merge commit:
c03e2d06d6680eef1f3f961c877985033da0d89f
accepted receipt:
PR #35 comment #5745811538
```

Post-merge baseline (accepted implementation baseline):

```text
validate:openapi     PASS
contract             62/62 PASS
verify:tow           GREEN
db baseline          GREEN
schema fingerprint   37cee47edc8dd1084786ab5fe3c32511c71b9a4a2788f67406391916c7cc0f59
real PostgreSQL      15 suites / 133 passed
full Jest            898 passed / 58 skipped / 0 failures
```

Unifies the essential scope of the old T02 + T03 + T04.

Delivers:

- Tow module registry and availability policy;
- admin enable/disable;
- typed MVP settings;
- Tow partner linkage;
- TowVehicle;
- one active TowVehicle per partner;
- per-vehicle pricing config in canonical units;
- required vehicle documents;
- admin document approval;
- operational eligibility;
- compatibility/capacity policy.

MVP feature-flag semantics:

- disabled blocks new Tow business;
- partner/vehicle/document registration remains;
- already assigned work is allowed to drain;
- advanced disable races/automatic SEARCHING closure are Phase 2.

Gate:

```text
backend can answer:
"Is this partner/TowVehicle eligible to perform this Tow?"
```

### MVP-02 — Google Routes & Authoritative Pricing

Issue: #14  
Depends on: MVP-01 accepted  
Size: M/L  
Status: **READY / current delivery**

Execution base: `c03e2d06d6680eef1f3f961c877985033da0d89f`  
Branch: `feature/mvp-02-routes-pricing`

Delivers:

- RouteProvider port;
- Google Routes adapter;
- deterministic fake;
- provider → pickup route;
- pickup → destination route;
- canonical meters;
- server-authoritative pricing;
- immutable quote data for proposals.

Pricing remains exactly:

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

Gate:

```text
partner + pickup + destination
→ authoritative route quote
→ authoritative final_price_cents
```

### MVP-03 — Tow Request & Lean Matching

Issue: #15  
Depends on: MVP-02 accepted  
Size: L

Delivers:

- TowRequest;
- pickup/destination/customer vehicle;
- module gate;
- one configurable matching radius;
- deterministic eligibility query;
- active TowVehicle/docs/compatibility/location checks;
- partner opportunity listing;
- customer request rehydration.

Explicit simplification:

- no progressive-radius scheduler;
- no background search timer;
- no global search timeout state machine.

When no eligible provider is found, return/record a controlled unavailable result and let the client retry.

Gate:

```text
customer request
→ eligible nearby Tow partners
```

### MVP-04 — Proposal & Atomic Assignment

Issue: #16  
Depends on: MVP-03 accepted  
Size: L/XL

Delivers:

- multiple simultaneous proposals;
- backend-calculated price;
- immutable route/tariff/price snapshot;
- action-time proposal expiry;
- customer accepts one;
- PostgreSQL atomic assignment;
- exactly one winner under concurrent acceptance;
- remaining proposals become non-actionable;
- partner/TowVehicle operational busy state.

Not in MVP:

- counteroffer.

Gate:

```text
request
→ proposals
→ customer selection
→ exactly one assignment
```

### MVP-05 — Service Execution & Live Tracking

Issue: #17  
Depends on: MVP-04 accepted  
Size: L

MVP state path:

```text
ASSIGNED
→ EN_ROUTE
→ ARRIVED
→ IN_TRANSIT
→ COMPLETED
```

Alternative terminal:

```text
CANCELLED
```

Delivers:

- authoritative state machine;
- role/ownership authz;
- milestone timestamps;
- partner location updates;
- customer current-location visibility;
- request isolation;
- simple cancellation before IN_TRANSIT;
- assigned-work graceful drain if module is disabled.

Deferred:

- no-show;
- rematch;
- cancellation fees/debts;
- completion timeout;
- disputes.

Gate:

```text
assigned Tow
→ physical execution
→ customer tracking
→ completed service
```

### MVP-06 — CASH Payment & Lean End-to-End Gate

Issue: #18  
Depends on: MVP-05 accepted  
Size: L/XL

Payment decision:

```text
MVP payment rail = CASH
```

Reason:

The repository currently has PaymentService and Stripe/MercadoPago/PagSeguro adapter files, but those adapters are simulations. They are not production PSP integrations.

The MVP will not pretend an external payment integration exists.

Delivers:

- CASH method linked to Tow assignment/request;
- final amount from accepted server snapshot;
- no external gateway call;
- assigned partner confirms `cash_received`;
- idempotent retry;
- financial status rehydration;
- no duplicate cash payment records.

Explicitly deferred:

- CARD;
- PIX;
- partner debt;
- customer debt;
- wallet;
- settlement;
- payout;
- PSP refunds/webhooks;
- disputes/holds.

## 6. Lean MVP E2E gate

MVP-06 must prove at least these 20 scenarios:

1. enabled module allows request;
2. disabled module rejects request;
3. partner without TowVehicle excluded;
4. vehicle without valid documents excluded;
5. incompatible vehicle excluded;
6. compatible partner inside radius found;
7. Google route quote generated;
8. server-side price generated;
9. 1 meter above included distance uses proportional pricing;
10. eligible partner sends proposal;
11. two partners can propose;
12. customer accepts one proposal;
13. concurrent accepts produce one assignment;
14. assigned partner enters EN_ROUTE;
15. partner enters ARRIVED;
16. partner enters IN_TRANSIT;
17. tracking is visible only to the correct customer/request;
18. service reaches COMPLETED;
19. CASH receipt retry has one financial effect;
20. complete request → proposal → assignment → tracking → completion → CASH happy path.

Also mandatory:

- fresh PostgreSQL migration/seed gate;
- T01 reset safety;
- OpenAPI validation;
- contract regression;
- `verify:tow`;
- full backend regression;
- no new hidden skips;
- readiness report;
- accepted receipt;
- post-merge verification.

## 7. Phase 2 — Production Hardening

Issue: #33.

It consolidates the production-grade scope intentionally removed from the MVP critical path:

- counteroffers;
- progressive radius and search schedulers;
- complete disable-vs-assignment race matrix;
- no-show/rematch;
- cancellation economics;
- CARD;
- PIX;
- signed/idempotent PSP webhooks;
- debts;
- wallet/ledger;
- settlement;
- payout;
- disputes;
- reviews;
- admin overrides;
- immutable audit;
- full security/performance/reliability certification;
- full long-term OpenAPI implementation;
- 75+ scenario E2E gate.

Historical issues #19–#29 remain preserved as design evidence but are superseded as executable Phase-1 tasks.

## 8. Workhorse execution policy

A Workhorse may start a Phase-1 task only when its immediate predecessor is **ACCEPTED**.

```text
READY(MVP-01) = T01 ACCEPTED

READY(MVP-n) =
  previous MVP delivery ACCEPTED
```

Every delivery follows:

```text
RED
→ GREEN
→ REFACTOR
→ focused integration gate
→ adversarial review
→ external review
→ merge
→ post-merge verification
→ accepted receipt
```

Do not automatically start the next issue before the receipt is verified against GitHub real.

## 9. Scope discipline

A future long-term contract is not permission to implement future scope inside an MVP PR.

If implementation requires a deferred feature to make the current MVP path work, stop and document the dependency rather than silently expanding the task.

#31 remains deferred during functional dev/test but must be resolved before production security sign-off/go-live.

## 10. Current state

```text
PR #9 contract                         MERGED ✅
T00                                    ACCEPTED ✅
T01                                    ACCEPTED ✅
#31 security                           DEFERRED
MVP-01 / #13                           ACCEPTED ✅
MVP-02 / #14                           ACCEPTED ✅
MVP-03 / #15                           ACCEPTED ✅
MVP-04 / #16                           ACCEPTED ✅
MVP-05 / #17                           ACCEPTED ✅
MVP-06 / #18                           ACCEPTED ✅
Phase 2 / #33                          DEFERRED
```

**Tow MVP Phase 1 = COMPLETE.** The final milestone `TOW MVP BACKEND READY FOR INTEGRATION` has been emitted
for the explicitly implemented MVP consumer subset (see
`docs/evidence/mvp-06/TOW-MVP-READINESS.md`). It is NOT the stronger Phase 2 milestone
`TOW BACKEND READY FOR INTEGRATION`.

Accepted implementation baseline:

```text
main @ f100bea9b79536dbe06e5032c451271b5f614f9c   # MVP-03 accepted (PR #37, receipt #5752423773)
main @ 7ad3e56bab9bfc839dca88dc2832e425383b7741   # MVP-03 acceptance bookkeeping = MVP-04 dispatch base
main @ c7d1e8e78778cd39c116a64a543e9d41718ebbc2   # MVP-04 accepted (PR #38, receipt #5755286376)
main @ 1d9f04bf26ffb0d51af99d2d59b162712f1ffd45   # MVP-05 accepted (PR #39, receipt #5759825979)
main @ c5ca8cc112f39ca8b1d0952b7c1a9305619f24b4   # MVP-06 accepted (PR #40, receipt #5763421609)
```

Next executable work:

```text
NONE in Phase 1. The Tow MVP Phase 1 backend critical path is complete.
Phase 2 / #33 (production hardening) and #31 (security) both require a new explicit decision.
```
