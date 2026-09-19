# MVP-01 Workhorse Execution Brief

> Issue: #13  
> Epic: #10  
> Delivery: MVP-01 — Tow Foundation  
> Base: `main @ f31962fdd0175303646a34c9d170032bc6a06601`  
> Dependency: T01 ACCEPTED  
> Phase-2 boundary: #33

## Mission

Implement the minimum Tow foundation required by the next five MVP deliveries:

```text
Tow Module
+ Tow settings
+ TowVehicle
+ Documents
+ Compatibility
= operational Tow partner eligibility
```

Do not implement routes, requests, matching, proposals, tracking or payment in this delivery.

## Orchestration

Use:

- DeepSeek V4.1 Flash as orchestrator;
- DeepSeek V4.1 Flash as implementation executor/workhorse;
- Muse Sparks 1.3 Free as adversarial reviewer.

Do **not** use Hermes.

GitHub real is the source of truth.

## Preconditions

Before changing code:

1. fetch `origin/main`;
2. confirm `main == f31962fdd0175303646a34c9d170032bc6a06601` or report the exact newer SHA and verify it contains only the Tow MVP planning PR when that PR has been merged;
3. read:
   - Issue #13;
   - `docs/tow/TOW-MVP-DELIVERY-PLAN.md`;
   - `docs/tow/TOW-TDD-IMPLEMENTATION-PLAN.md`;
   - `docs/tow/TOW-TASK-GRAPH.yaml`;
   - `docs/tow/TOW-MODULE-CONTRACT.md`;
   - `docs/tow/TOW-PRICING-CONTRACT.md`;
   - T00/T01 accepted evidence relevant to DB/testing.
4. inspect existing partner/document/Tow-related code before creating parallel abstractions.

## Required first step — current-state delta

Produce a compact map:

```text
required MVP-01 capability
→ existing implementation
→ reuse / adapt / replace / missing
```

At minimum inspect:

- partners and partner types;
- vehicle-like tables/models;
- existing document upload/approval flow;
- system settings;
- module/service registry if any;
- existing Tow/emergency request assumptions;
- current database baseline migrations;
- OpenAPI paths relevant to module/vehicle/documents.

Do not code until the delta is explicit.

## TDD sequence

### RED

Create focused failing tests for:

- canonical Tow module identity;
- module enable/disable + admin authz;
- typed settings validation;
- one-active-TowVehicle invariant;
- document approval eligibility;
- expired/rejected/pending documents blocking operation;
- compatibility policy;
- concurrency for active TowVehicle.

If equivalent behavior already exists and is correct, capture it as a baseline compatibility test rather than manufacturing a fake failure.

### GREEN

Implement only what #13 requires.

### REFACTOR

Review:

- Domain purity;
- ports/interfaces;
- controller thinness;
- duplicated settings lookups;
- DB constraints;
- naming consistency;
- accidental Phase-2 scope.

## Required implementation boundary

### Implement

- `module_key=tow`;
- `service_key=tow`;
- `partner_type=tow`;
- Tow module persistence/status;
- admin-only toggle;
- idempotent toggle;
- `TowModuleAvailability` or equivalent port/policy;
- typed MVP Tow settings;
- TowVehicle persistence/domain/API;
- at most one active TowVehicle per partner;
- canonical pricing config fields in cents/meters;
- required documents;
- document approval/rejection/expiry eligibility;
- compatibility/capacity policy;
- operational eligibility composition.

### Do not implement

- Google Routes;
- final route pricing;
- TowRequest;
- matching query/radius;
- proposals;
- counteroffers;
- assignment;
- tracking;
- cancellation;
- CASH/CARD/PIX;
- debts/wallet/payout;
- disputes/reviews/audit;
- production/VPS changes;
- #31 work.

## Feature flag MVP semantics

For this task, expose the central policy and persistence.

The contract consumed by later MVP tasks is:

```text
disabled:
  block new Tow business
  preserve partner/vehicle/document administration
  allow already-assigned work to drain
```

Do not implement advanced SEARCHING/NEGOTIATING shutdown or disable-vs-assignment race certification here.

## Database

Use the accepted T01 baseline.

Any new migration must:

- run from a fresh DB;
- respect T01 reset/migrate rules;
- be deterministic;
- have DB-level constraints for structural invariants;
- not edit archived legacy migrations.

Critical concurrency/invariant tests use real PostgreSQL.

## Required tests/gates

At minimum:

```bash
npm run validate:openapi
npm run test:contract
npm run verify:tow
npx jest tests/tow --runInBand
npx jest --runInBand
npm run test:db-baseline
```

Plus the new focused MVP-01 unit/API/DB/authz/concurrency/document suites.

For real PostgreSQL-specific MVP-01 tests, use the existing T00/T01 harness and guarantee teardown.

No new hidden skips.

## Muse review

After implementation and complete GREEN:

Muse must review the exact implementation HEAD for:

- scope containment;
- module source of truth;
- authz;
- one-active-vehicle concurrency;
- document eligibility;
- compatibility;
- Domain/Infrastructure boundaries;
- migration correctness;
- regressions;
- accidental #33/Phase-2 work.

Persist the review artifact with:

- exact reviewed SHA;
- P0/P1/P2/P3 counts;
- findings;
- evidence;
- verdict.

If code changes after Muse review, rerun Muse on the new implementation HEAD.

## PR discipline

Create one branch and one PR for #13.

PR must:

- use `Closes #13`;
- not close #14+;
- not touch #33 except links/docs;
- not touch #31;
- not touch production/VPS;
- include evidence and Work Result.

Do not merge without external review.

## Hard stops

Return BLOCKED if:

- base is materially different and planning/dependencies cannot be reconciled;
- T01 regression fails;
- fresh DB migration fails;
- two active TowVehicles can exist for one partner;
- document eligibility can be bypassed;
- non-admin can toggle module/approve docs;
- Domain imports infrastructure;
- implementation requires Google Routes/request/matching/proposal/payment scope;
- Muse has unresolved P0/P1 or blocking P2.

## Expected output

Return:

```markdown
# MVP-01 Work Result

## Status
READY_FOR_EXTERNAL_REVIEW | BLOCKED

## Base / Branch / Head
...

## Current-State Delta
...

## Architecture
...

## Module
...

## TowVehicle
...

## Documents
...

## Compatibility
...

## Migrations
...

## Tests
...

## PostgreSQL Evidence
...

## Regression
...

## Muse Review
...

## Scope
- MVP-02 touched: NO
- Phase 2/#33 touched: NO
- #31 touched: NO
- production/VPS touched: NO

## Remaining Findings
...

## Final Verdict
MVP-01 READY FOR EXTERNAL REVIEW | BLOCKED
```

Do not start MVP-02 automatically.
