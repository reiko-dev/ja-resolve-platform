# MVP-04 — 01 Current State Delta

> Delivery: MVP-04 Proposal Lifecycle & Atomic Assignment (Issue #16)
> Branch: `feature/mvp-04-proposals-assignment`
> Authoritative base: `7ad3e56bab9bfc839dca88dc2832e425383b7741`
> (MVP-03 acceptance bookkeeping commit; MVP-03 accepted merge is
> `f100bea9b79536dbe06e5032c451271b5f614f9c`, receipt `PR #37 comment #5752423773`)
> Working tree at time of writing: clean, `HEAD = 7ad3e56b` + the PHASE B docs commit.

This file records **what exists before MVP-04 writes a single line of source** and
**what MVP-04 is therefore allowed to add**. It is the contract for "no hidden
scope": every file MVP-04 touches appears in the delta table below, and every
file that does not appear is out of scope.

---

## 1. Accepted baseline verification (pre-flight, before any edit)

| Gate | Result | Evidence |
|---|---|---|
| Branch | `feature/mvp-04-proposals-assignment` | `git branch --show-current` |
| Base SHA | `7ad3e56bab9bfc839dca88dc2832e425383b7741` | `git rev-parse HEAD` at dispatch |
| Working tree | clean | `git status --short` (empty) |
| MVP-03 merge present | `f100bea9` in `git log` | `docs/tow/TOW-TASK-GRAPH.yaml:11` |
| Migration set | `001..004` only, no `005_*` | `database/migrations/` |
| Schema fingerprint pin | `f2771dcf…8ed2bf` (33 tables) | `docs/tow/TOW-TASK-GRAPH.yaml:12` |

No MVP-04 source, route, table, test or evidence file existed before PHASE B.

---

## 2. What the accepted baseline already provides

### 2.1 Module layout (hexagonal, 47 source files under `src/modules/tow/`)

```text
domain/          17 pure files — no Knex, no Express, no HTTP, no legacy import
application/     11 files — services + ports (JSDoc typedefs only)
adapters/        10 files — Knex persistence, Google Routes, system clock, local storage
http/            12 files — thin controllers, serializers, middleware, error mapper
composition.js   the ONLY file where pure layers meet infrastructure
index.js         public barrel
```

Verified by `tests/tow/mvp03/towMvp03Architecture.test.js` (pure-layer import
ban, single geodesic owner, legacy formula ban, legacy-table ban).

### 2.2 Persistence already in place

| Table | Migration | Owner |
|---|---|---|
| `tow_requests` | `004_mvp03_tow_requests.js` | MVP-03 |
| `tow_vehicles`, `tow_vehicle_documents` | `003_mvp01_tow_foundation.js` | MVP-01 |
| `service_modules`, settings tables | `001/002` | T01/MVP-01 |
| `users`, `partners` | `001_baseline_schema.js` | baseline |

`tow_requests` state machine already carries `SEARCHING`, `NEGOTIATING`,
`ASSIGNED` (plus the MVP-05+ states), and `terminal_reason` already carries
`NO_PROVIDER_AVAILABLE` / `SERVICE_DISABLED` / `*_CANCELLED` / `*_NO_SHOW` /
`ADMIN_OVERRIDE`. **MVP-04 needs no change to `tow_requests` columns.**

### 2.3 Application capabilities already in place (reused, never duplicated)

| Capability | Owner | How MVP-04 reuses it |
|---|---|---|
| Module gate (`service_module_disabled`) | `domain/availability.js` + `module-repository.js` | called first in every new write path |
| Authoritative route quote | `application/quote-service.js` (`quoteTow`) | called only **after** eligibility revalidation |
| Integer-cents pricing | `domain/pricing.js` (`computeTowPrice`) | price authority; MVP-04 stores the result |
| Route snapshot value object | `domain/route.js` (`createRouteQuote`) | frozen into the proposal |
| Eligibility (module → partner type → vehicle active → required docs → compatibility) | `domain/eligibility.js` | revalidated at proposal creation |
| Matching / opportunity feed | `domain/matching.js` + `application/matching-service.js` | `SEARCHING` + `NEGOTIATING` become matchable |
| Idempotency by DB unique constraint | `domain/idempotency.js` + `tow-request-repository.createIdempotent` | same convention for proposals |
| Settings (`tow_proposal_expiry_minutes`, 1..1440, default 10) | `domain/settings.js` + `settings-service.js` | action-time expiry window |
| Error contract | `domain/errors.js` + `http/error-mapper.js` | new codes flow through unchanged |

### 2.4 Contract surface already frozen for MVP-04 (5 of 66 operations)

`docs/tow/tow-api-contract.base.openapi.yaml` already declares:

| Operation | Method + path | Status before MVP-04 |
|---|---|---|
| `listTowRequestProposals` | `GET /tow/requests/{requestId}/proposals` | declared, **not implemented** |
| `createTowProposal` | `POST /tow/requests/{requestId}/proposals` | declared, **not implemented** |
| `acceptTowProposal` | `POST /tow/proposals/{proposalId}/accept` | declared, **not implemented** |
| `withdrawTowProposal` | `POST /tow/proposals/{proposalId}/withdraw` | declared, **not implemented** |
| `listPartnerTowProposals` | `GET /tow/partner/proposals` | declared, **not implemented** |

`TowProposal`, `Assignment`, `TowProposalStatus`, `TowRequest.assignment` and the
`accept_proposal` / `withdraw_proposal` members of `allowed_actions` are already
in the base contract. **MVP-04 implements them; it does not invent new paths.**

Deliberately **not** implemented by MVP-04 (declared but out of scope):
`createTowCounteroffer`, `acceptTowCounteroffer`, `rejectTowCounteroffer`,
`changeTowDestination`, all tracking/execution/payment/dispute/payout operations.

---

## 3. The delta — exactly what MVP-04 adds

### 3.1 New domain (pure)

| File | Responsibility |
|---|---|
| `domain/tow-proposal.js` | `TOW_PROPOSAL_STATUSES`, `INITIAL_TOW_PROPOSAL_STATUS='ACTIVE'`, `ACTIONABLE_PROPOSAL_STATUSES`, `isTowProposalId`, `validateCreateTowProposalInput` (rejects unknown keys — no `proposed_price`/`price`/`amount`/`amount_cents`/`route_distance`/`estimated_price`/`tariff`/`partner_id`/`tow_vehicle_id`), `buildTowProposalRecord`, `buildTowProposalDto`, `isProposalExpired`, `assertProposalActionable` |
| `domain/assignment.js` | `buildAssignmentRecord`, `buildAssignmentDto`, occupancy predicate (`released_at === null`), assignment id validation |

`domain/index.js` barrel extended with both.

### 3.2 New application

| File | Responsibility |
|---|---|
| `application/proposal-service.js` | `createForPartner` (module gate → partner/vehicle/doc context → eligibility revalidation → `quoteTow` → persist snapshot), `listForRequest` (customer ownership + partner membership), `listForPartner`, `withdraw` |
| `application/assignment-service.js` | `accept` — the single atomic operation: module gate → transaction → lock proposal + request → revalidate actionability/expiry → insert assignment → request `ASSIGNED` → winner `ACCEPTED` → remaining `ACTIVE` → `CLOSED` → commit |

`application/ports.js` extended with `TowProposalRepository` and
`AssignmentRepository` typedefs + `PORT_NAMES` entries.

### 3.3 New adapters

| File | Responsibility |
|---|---|
| `adapters/persistence/tow-proposal-repository.js` | `createIdempotent`, `findById`, `findByIdForPartner`, `listByRequest`, `listByPartner`, `findActiveForPartnerAndRequest`, `closeActiveForRequestExcept`, `markAccepted`, `markWithdrawn`, `lockById` |
| `adapters/persistence/assignment-repository.js` | `createForProposal`, `findByRequestId`, `findActiveByPartner`, `findActiveByVehicle`, `lockRequestRow` |

Occupancy is a **row in `tow_assignments` with `released_at IS NULL`** — never
`partners.is_available` and never `tow_vehicles.active`, which are operator
intent, not occupancy.

### 3.4 New HTTP

| File | Responsibility |
|---|---|
| `http/proposal-controller.js` | `createTowProposalController` (list-for-request, create, partner list), `createAssignmentController` (accept, withdraw) |
| `http/serialize.js` (edit) | `serializeProposal`, `serializeAssignment` |
| `http/routes.js` (edit) | mount the 5 operations on the canonical paths |

### 3.5 New persistence

| File | Responsibility |
|---|---|
| `database/migrations/005_mvp04_proposals_assignments.js` | `tow_request_proposals` + `tow_assignments` + all DB invariants (see `03-persistence-decision.md`) |

### 3.6 Edits to existing files (exhaustive list)

| File | Edit | Why |
|---|---|---|
| `domain/matching.js` | `listSearchingCandidates` state filter widened to `SEARCHING` + `NEGOTIATING` | first proposal must not hide the request from other partners |
| `domain/tow-request.js` | `buildTowRequestDto` populates `assignment` when supplied; `allowed_actions` computed truthfully | contract requires real `assignment`/`allowed_actions` |
| `application/matching-service.js` | pass the widened candidate set | same reason |
| `application/tow-request-service.js` | `getForCustomer` hydrates `assignment` | rehydration |
| `adapters/persistence/tow-request-repository.js` | `listSearchingCandidates` accepts both states; add `updateState` / `lockById` | assignment transition |
| `composition.js` | build the two new repositories + two new services | wiring |
| `application/index.js`, `domain/index.js` | export new symbols | barrels |
| `http/routes.js`, `http/serialize.js` | 5 operations | contract |
| `scripts/tow/db-baseline.js` | `REQUIRED_TABLES` += 2 | gate |
| `scripts/tow/run-db-baseline-gate.js` | `PINNED_MIGRATIONS` += `005_*` | pin |
| `tests/helpers/testDb.js` | mirror both tables | offline harness |
| `tests/tow/baseline/dbBaselineSafety.test.js` | assert the new pinned migration list | pin |
| `tests/helpers/tow/mvp03.js` | export a shared canonical scenario helper | reuse |
| `docs/tow/tow-api-contract.base.openapi.yaml` | 2 documented revisions (see `04-contract-conflict-audit.md`) | contract truth |
| `docs/tow/TOW-TASK-GRAPH.yaml` | re-pin schema fingerprint after 005 | baseline truth |

Nothing else changes. In particular: no legacy file, no `src/app.js` route
removal, no MVP-05 route, no scheduler, no payment/tracking code.

---

## 4. Explicit non-goals (frozen)

* counteroffer (any form) — not implemented, not exposed in `allowed_actions`;
* progressive radius / scheduler / background expiry sweeper — expiry is
  **action-time only**;
* tracking, execution milestones, payments, disputes, payouts, audit events;
* tightening or loosening accepted MVP-03 eligibility (`is_verified` /
  `approval_status` stay non-blocking — see `04-contract-conflict-audit.md`);
* legacy `tow_proposals` table reuse or migration;
* any change to `partners.is_available` / `tow_vehicles.active` as an occupancy
  signal.

---

## 5. Test-harness delta

| Area | Baseline | MVP-04 |
|---|---|---|
| Offline DB | in-memory SQLite mirror in `tests/helpers/testDb.js` | + `tow_request_proposals`, `tow_assignments` |
| Concurrency | SQLite **cannot** certify it | real PostgreSQL on `DB_PORT=55434`, `TOW_POSTGRES_E2E=1` |
| Contract | 66 operations, 62/62 contract tests | + live HTTP→OpenAPI validation for the 5 new operations |
| Floors | MVP-01 124, MVP-02 204, MVP-03 177, Tow 856, Full 1280, Contract 62 | may only increase |

---

## 6. Ordering rule that drives the implementation

```text
module gate  →  input validation  →  eligibility revalidation  →  route provider  →  price  →  persist
```

The route provider is **never** called before eligibility succeeds, so an
ineligible partner can never consume a Google Routes call, and a provider
failure can never leave a partially-priced proposal. This mirrors the accepted
MVP-02 ordering guarantee (`EXT-MVP02-1`) and is asserted by a dedicated test.
