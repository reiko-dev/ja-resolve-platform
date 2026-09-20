# MVP-04 Work Result

## Status
READY_FOR_MUSE_REVIEW

## Base / Branch / Head
- Repository: `socorre-system`
- Execution base (frozen): `7ad3e56bab9bfc839dca88dc2832e425383b7741` — `origin/main`
  at dispatch time, i.e. post-MVP-03 bookkeeping. MVP-03 is the accepted
  dependency: merge `f100bea9`, receipt PR #37 comment `#5752423773`, release note
  `#5752429388`.
- Branch: `feature/mvp-04-proposals-assignment`
- Implementation head (frozen): **`8b550440c9c6bbbe3bb0ccac555d340c6716da74`** —
  48 files, +6641/−148 (13 commits).
- Evidence follow-up: **`ee150deb`** — `docs/evidence/mvp-04/05..20` (docs only,
  no source or test change). This `MVP-04-WORK-RESULT.md` is a second docs-only
  follow-up, the MVP-02/MVP-03 precedent.
- Issue: #16 (MVP-04 — Proposal Lifecycle & Atomic Assignment)
- Push / PR / merge: **not performed.** No push, no PR, no merge, no MVP-05/#17,
  no counteroffer, no tracking, no payments, no scheduler, no #31, no #33, no
  production/VPS. This executor stops before Muse review by instruction.

## Current-State Delta
Delivered before any code as `docs/evidence/mvp-04/01-current-state-delta.md`
(every capability → existing implementation `file:line` → disposition), with
`02-legacy-audit.md` (legacy inventory) and `03-persistence-decision.md` (the
persistence ruling).

What already existed and was **reused unchanged**: the MVP-01 foundation (module
gate, `TowVehicle`, vehicle documents, settings, tariff), the MVP-02 route/pricing
stack (`quoteService`, Google Routes as the only distance authority), and the
MVP-03 request aggregate, matching pipeline, opportunity feed and idempotency
infrastructure. What was genuinely **missing**: the proposal aggregate, the
assignment aggregate, the two tables, the five routes, the accept transaction, the
partner's proposal book, the customer's proposal list, and any guard against
erasing a vehicle that proposals or assignments point at.

## Persistence Decision
`03-persistence-decision.md` — decision: **Option B, two canonical tables**
(`tow_request_proposals`, `tow_assignments`), never the legacy `tow_proposals`.

The legacy table cannot carry this delivery: it is keyed by
`emergency_request_id`, stores `proposed_price` as `decimal(10,2)`, speaks a
different five-value lowercase vocabulary (`pending/accepted/rejected/expired/
withdrawn` — no `ACTIVE`, no `CLOSED`, no `COUNTERED`), has no idempotency column
or uniqueness authority, and cascades on partner delete. The atomicity hard stop
requires database-enforced uniqueness, which would mean altering a table owned by
another subsystem. `migration 005` therefore creates only the two new tables, and
an architecture test asserts the migration's only `dropTableIfExists` arguments are
`['tow_assignments', 'tow_request_proposals']` with no
`alterTable`/`renameTable`/`dropColumn`.

## Architecture
Unchanged MVP-01..03 layering, extended by two aggregates:

- `domain/**` (pure) — new `tow-proposal.js` (497 lines), `assignment.js`,
  `ids.js`, `instants.js`; `tow-request.js` gained the assignment projection and
  the `allowed_actions` truth table; `errors.js` gained the HTTP status mapping for
  the four proposal-lifecycle conflict codes (all four are 409s, and
  `request_already_assigned` doubles as the backstop of the `UNIQUE` constraint, so
  a losing concurrent accept answers the same code as a sequential one).
- `application/**` — new `proposal-service.js`, `assignment-service.js`; `ports.js`
  gained `TowProposalRepository`, `AssignmentRepository` and `UnitOfWork`;
  `tow-request-service.js` now hydrates `assignment` and `has_live_proposal`.
- `adapters/persistence/**` — new `tow-proposal-repository.js`,
  `assignment-repository.js`, `row-lock.js` (the `FOR UPDATE` / no-op split);
  `tow-request-repository.js` became connection-scoped
  (`build(connection)`) so the accept transaction can reuse it against `trx`;
  `vehicle-repository.js` gained the reference count and the delete guard.
- `http/**` — new `proposal-controller.js` and five routes; the existing guards
  (`requireCustomer`, `requireTowPartner`) are reused.
- `composition.js` — the only place the pure layers meet Knex, HTTP and the clock;
  it wires the two new services and the unit of work.

Enforced by `tests/tow/mvp04/towMvp04Architecture.test.js` (29 tests): Domain and
Application import only relative siblings, contain no
`express`/`knex`/`fs`/`axios`/`process.env`/`Math.random`/`Date.now`, no file
outside `adapters/` requires `node:crypto` (the fingerprint digest is computed in
the adapter only), the migration touches no legacy table, the module gate is the
first check of every write path, exactly the five MVP-04 operations are routed,
no MVP-05 route/table/vocabulary leaked in, `COUNTERED` is never written by the
runtime, the five operation ids exist in the canonical contract, and the DTO
vocabulary agrees with it. Additionally — a fact about the frozen tree, verified by
scan rather than by a guard, since this Jest config sets no `forbidOnly` — there is
no `.only`, `.skip`, `xit`, `xtest` or `xdescribe` anywhere under `tests/tow/`.

## Canonical TowProposal Aggregate
`domain/tow-proposal.js`:

- `TOW_PROPOSAL_STATUSES` is the frozen seven-value enum
  (`ACTIVE, COUNTERED, ACCEPTED, REJECTED, WITHDRAWN, EXPIRED, CLOSED`);
  `INITIAL_TOW_PROPOSAL_STATUS = 'ACTIVE'`. MVP-04 **writes** `ACTIVE` (create),
  `ACCEPTED` (winner), `CLOSED` (the losers of an assignment) and `WITHDRAWN`
  (the partner's exit). It never writes `COUNTERED` or `REJECTED` (no counteroffer
  exists in this delivery — `CONTRACT_CONFLICT-4`, enum kept, value never
  produced), and it never writes `EXPIRED` either: an expired proposal keeps its
  `ACTIVE` row and is refused by `assertProposalActionable` with
  `409 proposal_expired`, because expiry is decided by the action and this
  delivery has no scheduler (see Remaining Findings).
- `FORBIDDEN_PROPOSAL_INPUT_KEYS` — the create body must be **empty**
  (`additionalProperties: false`). The client cannot send a price, a vehicle, a
  route or an expiry; sending one is `422 validation_error`, not a silent ignore.
- `canonicalProposalFingerprintSource` — the idempotency identity is exactly
  `(partner_id, tow_request_id, tow_vehicle_id)`; the adapter persists only its
  SHA-256 digest, so the same key with a different active vehicle is a conflict.
- `buildTowProposalRecord` — server-priced record: money as **integer cents** with
  currency `BRL`, plus `route_quote`, `pricing_snapshot` and a vehicle snapshot
  (plate, make, model, year, equipment, classes, max weight, document status,
  active) so a later vehicle edit cannot rewrite history.
- `buildTowProposalDto` — the contract shape, `counteroffer: null`, `partner`
  present only when a business name was snapshotted, every instant through
  `toIsoInstant`.
- `isProposalExpired` / `assertProposalActionable` — a proposal is expired from the
  instant its deadline is **reached** (`now >= expires_at`), and expiry is decided
  by the action, never by a background job (no scheduler exists).

## Canonical TowAssignment
`domain/assignment.js`: an assignment is `(tow_request_id, proposal_id,
partner_id, tow_vehicle_id, final_price, vehicle_snapshot, assigned_at)`, live while
`released_at IS NULL`. `final_price` is copied from the winning proposal's frozen
price — the accept path cannot re-price, and `buildAssignmentDto` is what the
request DTO exposes as `assignment` (populated truthfully for the first time,
`CONTRACT_CONFLICT-7`).

## Server-Priced Proposal Creation
`POST /tow/requests/{requestId}/proposals` — `proposal-service.createForPartner`,
in this order, each step with its own observable failure:

1. module gate (`409 service_module_disabled`, the accepted MVP-03 status) — first,
   so a disabled module never prices and never replays;
2. frozen body shape and the 8–128 char `Idempotency-Key` (`422 validation_error`);
3. canonical id and row existence (`404 not_found`);
4. eligibility revalidated with **exactly** the accepted MVP-03 pipeline
   (`evaluateTowMatch` + `assertMatchable`, same inputs as the opportunity feed) —
   `409 vehicle_not_compatible` / `vehicle_not_operational` / `partner_not_operational`
   / `tow_document_required` / `tow_document_not_approved`;
5. replay **before any quote** (`findReplay`, digest compared) — same key + same
   payload returns the stored proposal, same key + different payload is
   `409 idempotency_conflict`;
6. open-state guard: `409 request_already_assigned` on an assigned request,
   `409 proposal_not_actionable` on any other closed state;
7. one live proposal per `(request, partner)`: `409 proposal_already_active`;
8. the authoritative quote — the **only** price source and the first provider call
   of the operation (`quoteService.quoteTow`, provider position + frozen endpoints
   + stored tariff, so the partner is charged the number it was offered);
9. atomic create-or-replay (`createIdempotent`); losing the `(request, partner)`
   race to a sibling key answers the same `409 proposal_already_active`, and a
   digest mismatch answers `409 idempotency_conflict` — a unique violation is never
   a 500;
10. the first proposal moves the request `SEARCHING → NEGOTIATING`
    (`markNegotiating`, idempotent by construction: a concurrent second partner
    changes 0 rows).

`expires_at = now + tow_proposal_expiry_minutes` from settings, snapshotted on the
row.

## Customer List and Partner Book
- `GET /tow/requests/{requestId}/proposals` — owner-only (`403
  not_request_owner`), paginated, optional `status` filter, and it reports the
  request's current `state` alongside the page so the customer sees what the list
  means.
- `GET /tow/partner/proposals` — the partner's own book (identity from the token,
  never from a query parameter), paginated, optional `status` filter.
- The customer's request DTO now carries `allowed_actions: ['ACCEPT_PROPOSAL']`
  only while the request is open **and** a live proposal exists
  (`findLiveRequestIds`), and `[]` otherwise — the truthful subset the base enum
  over-declares (`CONTRACT_CONFLICT-5`). After an accept it is `[]`.

## Withdraw
`POST /tow/proposals/{proposalId}/withdraw` — module gate first, `404` for an
unknown id, `403 forbidden` for another partner's proposal,
`409 proposal_not_actionable` once it is decided or expired, otherwise `200` with
the `WITHDRAWN` proposal. Withdrawing does not touch the request state.

## Atomic Assignment
`POST /tow/proposals/{proposalId}/accept` — `assignment-service.acceptWithin`, one
database transaction, authority in this order:

1. **One transaction** (`UnitOfWork`) for the whole accept.
2. **The request row is locked** (`SELECT … FOR UPDATE` on PostgreSQL; a no-op on
   the single-connection SQLite harness). Every concurrent accept of that request
   serializes here, and the row the lock **returns** is the committed state: the
   guards, `markAssigned`, `closeActiveForRequestExcept` and the response all use
   it, never the pre-lock snapshot (defect P1 below).
3. **The winner's proposal row is locked** too, so one proposal cannot be accepted
   twice, and `assertProposalActionable` runs against the locked row.
4. **The database decides the write**, never a read-then-write check:
   `tow_assignments.tow_request_id` is UNIQUE (one assignment per request, ever),
   `tow_assignments.proposal_id` is UNIQUE (the accept idempotency key), and the
   partial unique indexes on the live rows enforce occupancy
   (`tow_assignments_one_live_per_partner`,
   `tow_assignments_one_live_per_vehicle`, both `WHERE released_at IS NULL`).
5. Replay is checked **before** the state guards, because a successful accept
   leaves the request `ASSIGNED`: replaying the same proposal returns the same
   assignment with `200` — with a different `Idempotency-Key` as well, since a
   second job for the same proposal is impossible by construction. The
   `Idempotency-Key` header is accepted but is **not** the authority; the proposal
   id is.
6. A different proposal for an already assigned request is `409
   request_already_assigned`; a live job occupying the partner or the vehicle is
   `409 conflict` (the frozen contract has no `partner_busy` code — the honest
   answer is the generic conflict with `details.reason`).

The response is the `TowRequestResponse`: the request in `ASSIGNED` with the frozen
final price, the `assignment`, and an empty `allowed_actions`.

## Idempotency (three different authorities)
- **Request creation** (MVP-03, unchanged): `UNIQUE(customer_id,
  idempotency_key)`, digest over the frozen request input.
- **Proposal creation**: `UNIQUE(partner_id, idempotency_key)`, digest over
  `(partner, request, active vehicle)`; a sibling key that loses the
  one-live-proposal race is disambiguated by constraint name and answered
  `409 proposal_already_active`.
- **Accept**: the **proposal id**, backed by `UNIQUE(proposal_id)` on
  `tow_assignments` — not the header.

## Migration 005
`database/migrations/005_mvp04_proposals_assignments.js` (286 lines), purely
additive:

- `tow_request_proposals`: `UNIQUE(partner_id, idempotency_key)`; partial
  `UNIQUE(tow_request_id, partner_id) WHERE status = 'ACTIVE'`
  (`tow_request_proposals_one_active_per_partner`); CHECKs on the status
  vocabulary, `BRL`, non-negative integer cents, the route-leg quote (each leg
  present and the legs summing to the totals), the vehicle snapshot enums, at least
  one supported class, and `expires_at > created_at`.
- `tow_assignments`: `UNIQUE(tow_request_id)`, `UNIQUE(proposal_id)`, the two
  partial live-occupancy indexes, `ON DELETE CASCADE` with the request and
  `ON DELETE RESTRICT` with the proposal, the partner and the vehicle.

The migration is pinned by the T01 gate (`001..005`, a smuggled `006_*` is a test
failure, evidence `20-baseline-gate.txt`) and mirrored into the offline harness
(`tests/helpers/testDb.js`, jsonb → TEXT) so the SQLite suites exercise the same
constraints.

## Contract Revision (draft.5 → draft.6)
`docs/evidence/mvp-04/06-contract-revision.md`, commit `78917ee0`, **before** the
implementation commit `de22e3cc`:

- the four MVP-04 path items that draft.5 referenced from the base are now inlined
  in the canonical document (owned by this delivery) with five components added
  (`TowProposal`, `TowProposalStatus`, `EnvelopeTowProposal`,
  `TowProposalResponse`, `ErrorResponse`) — a shape-preserving ownership move:
  `validate:openapi` reports `dropped=[]` for every path and an empty allowlist;
- `ErrorResponse.error.code` gains `proposal_already_active` in **both** documents
  (one line each; the base keeps `1.0.0-draft.2` and gains no path or schema), and
  `CANONICAL_ERROR_CODES` in `tests/helpers/towContract.js` gained the same code so
  the validator now *protects* it. Rationale and the two rejected alternatives are
  in `04-contract-conflict-audit.md` (`CONTRACT_CONFLICT-2`);
- the version pin in `tests/contract/openapi.structure.test.js` moved with the
  document (it still fails loudly on an un-revisited bump).

## Vehicle Reference Guard
A `TowVehicle` that proposals or assignments point at can no longer be erased:
`countVehicleReferences(id)` + `RESTRICT` in the migration, answered as
`409 conflict` (never a 500 and never a silent orphan). Evidence
`08-vehicle-reference-guard.md`, PostgreSQL case C7.

## Tests
Seven new suites in `tests/tow/mvp04/` — **165 tests (155 passed, 10 opt-in
PostgreSQL skips)**, no `.only`, no hidden `.skip`, no real Google call:

| Suite | Tests | Focus |
| --- | --- | --- |
| `towProposalDomain.test.js` | 37 | vocabulary, empty frozen body (every forbidden key), key window, fingerprint source, record/DTO builders, integer-cent money, expiry boundary (`now >= expires_at`), actionable-only-ACTIVE |
| `towProposalCreate.test.js` | 47 | `POST /tow/requests/:id/proposals` end-to-end: 201 shape, module gate before validation/replay, eligibility reuse (including an unverified partner still allowed), open-state guards, `proposal_already_active`, `idempotency_conflict`, `NEGOTIATING` transition, 401/403/404/422, no occupancy check on create |
| `towAssignmentAccept.test.js` | 22 | the accept path: 200 request DTO, replay before guards, `request_already_assigned`, `proposal_not_actionable`, `conflict` occupancy, module gate first, loser closes (`CLOSED`), winner `ACCEPTED`, request `ASSIGNED`, `allowed_actions` empty after |
| `towProposalContract.test.js` | 13 | the **real** HTTP bodies validated by ajv against the composed canonical document (create 201, list 200, accept 200, withdraw 200), exact-member locks, in-suite negative controls (a body with `route_quote` deleted, a string `amount_cents`) proving the validation is not vacuous, base↔canonical convergence |
| `towVehicleReferenceGuard.test.js` | 6 | the delete guard, its 409, and the untouched delete path for an unreferenced vehicle |
| `towMvp04Architecture.test.js` | 29 | layering/purity scans, single `node:crypto` owner, migration scope, the five routes and the module gate's position, no MVP-05 leakage, `COUNTERED` never written, DTO/contract vocabulary agreement |
| `towMvp04Postgres.e2e.test.js` | 10 (+1 opt-in placeholder) | migration 005 from an empty schema and the atomicity matrix C1–C9 (below) |

## Gates

| Gate | Result | Artifact |
| --- | --- | --- |
| `npm run validate:openapi` | **PASS**, exit 0 — 0 enum mismatches, 0 forbidden values, `dropped=[]` on every path, allowlist empty | `10-openapi.txt` |
| `npm run test:contract` | **PASS** 5 suites / 62 tests | `11-contract.txt` |
| `npx jest tests/tow/mvp04 --runInBand` | **155 passed / 10 skipped / 165 · 7 suites** | `12-mvp04-suite.txt` |
| `npx jest tests/tow --runInBand` | **1011 passed / 75 skipped / 1086 · 0 failures** | `13-tow-suite.txt` |
| `npx jest --runInBand` (whole backend) | **82 suites / 1435 passed / 75 skipped / 1510 · 0 failures** | `14-full-jest.txt` |
| Legacy PostgreSQL suites (`TOW_POSTGRES_E2E=1`, pristine container) | **GREEN** 2 suites / 9 tests | `15-postgres-legacy.txt` |
| `npx jest tests/tow --runInBand` with PostgreSQL | **GREEN** 54 suites / 1083 passed / 0 failures | `16-postgres-canonical.txt` |
| T01 clean-baseline gate (`DB_PORT=55434`) | **GREEN** — 35 tables / 33 rows / settings 25, fingerprint `efb6158b…` identical on both runs, migrations `001..005` pinned | `20-baseline-gate.txt`, `docs/evidence/t01/db-baseline-gate.json` |
| Negative controls | **9/9 RED then byte-identically restored, GREEN first try** | `17-negative-controls.md` |
| Flake census | branch whole suite **3/3 clean**; base flaked in both contexts | `18-flake-census.md` |
| Teardown | **0 containers / 0 volumes / 0 networks**, port 55434 free | `19-teardown.txt` |

Notes on the counts, so nobody has to reconstruct them:

- the PostgreSQL-enabled run has **three fewer** tests by construction: the three
  PG-gated files each add a one-test placeholder `describe` when the harness is
  off (`towPostgresFoundation`, `towMvp03Postgres`, `towMvp04Postgres`);
- the offline run's 75 skips are the 65 pre-existing PG-gated tests plus the 10
  MVP-04 ones;
- the flake census is disclosed rather than hidden: `tests/tow` flaked in 3 of 8
  branch runs and in 1 of 8 base runs, always on a different pre-existing test and
  always at the transport layer. The whole-suite gate was 3/3 clean on the branch
  and 2/3 on the base. No assertion was relaxed, skipped, reordered or retried for
  any result in this delivery.

## PostgreSQL Concurrency Proof (C1–C9)
`tests/tow/mvp04/towMvp04Postgres.e2e.test.js`, opt-in, on the disposable
container (`DB_PORT=55434`), because the offline harness cannot express the race
(`better-sqlite3` is synchronous, one connection, no `PRAGMA foreign_keys`).
Details, and the three product defects plus one test defect it found:
`09-postgres-concurrency.md`.

| Case | Proves |
| --- | --- |
| migration | 005 applies from an empty schema; both tables and the atomicity indexes exist |
| C1 | two concurrent accepts of **different** proposals → exactly one assignment; loser `409 request_already_assigned` |
| C2 | N concurrent accepts of the **same** proposal → one assignment, N identical `assigned_at` |
| C3 | `UNIQUE(tow_request_id)` rejects a raw second assignment (23505) — the constraint, not the service, is the authority |
| C4 | one live job per partner is a partial unique index (`released_at IS NULL`) |
| C5 | disable × accept is deterministically serialized |
| C6 | concurrent creates by one partner for one request → one `201`, rest `409 proposal_already_active` |
| C7 | a referenced vehicle is protected by `RESTRICT` (23503) and the delete answers 409 |
| C8 | concurrent same-key different-payload creates → one `201`, one `409 idempotency_conflict`, one row |
| C9 | the unique-violation recovery branch is reached deterministically and compares digests |

## Regression
- MVP-01, MVP-02 and MVP-03 suites are green in the whole-suite gate; the legacy
  PostgreSQL suites are green on a pristine container (they must run **before** the
  canonical run: their `migrate.latest()` collides with the canonical baseline's
  `users` table otherwise).
- The T01 baseline gate still reproduces its fingerprint exactly (35 tables), with
  `005` added to the pinned migration list and a `006_smuggled_scope.js` negative
  control.
- Two MVP-03 **absence** assertions were narrowed instead of deleted, because
  MVP-04 owns the surfaces they banned: the banned route list dropped
  `/proposals` and `/accept` (keeping `/counteroffer`, `/assignment`, `/cancel`,
  `/destination`) and the banned table list dropped `tow_assignments` (keeping the
  legacy `tow_proposals`, anchored so the canonical `tow_request_proposals` does
  not match). Both carry a comment saying what moved and where it is asserted now
  (`tests/tow/mvp04/towMvp04Architecture.test.js`).
- One MVP-03 regression was **found and fixed** by this delivery rather than
  tolerated: P3 in `09-postgres-concurrency.md` — once MVP-04 wrote ISO instants,
  the request window filter compared `'…T13:00:00.000Z' >= '… 13:00:00.000'` and
  `'T' > ' '` widened the window by a day. Every comparison on both sides now binds
  `toIsoInstant` (`07-timestamp-binding.md`).
- No accepted floor was lowered, and the arithmetic is exact: the execution base
  runs `tests/tow` at **921 tests (855 passed, 65 skipped, 1 transport failure)**
  and the branch runs **1086 (1011 passed, 75 skipped, 0 failures)** — a delta of
  exactly 165, all of it inside the seven new `tests/tow/mvp04/` suites (155 passed
  + 10 skipped). No pre-existing suite lost a test: the only edits to pre-existing
  test files are the version pin, the narrowed absence assertions and the
  re-pinned baseline lists (all under Bookkeeping). Contract 62/62, PG legacy 9/9,
  baseline fingerprint unchanged.
  (MVP-03's own evidence recorded `tests/tow` at 913 tests; the base of this
  delivery is 921, so those 8 tests arrived with MVP-03's bookkeeping before this
  delivery began — the comparison that matters here is against `7ad3e56b`.)

## Negative Controls
Nine controls, one per safeguard, each mutated → RED → restored byte-for-byte
(SHA-256) → GREEN, all on the first attempt: the three writes of the accept
(losers `CLOSED`, winner `ACCEPTED`, request `ASSIGNED`), the module gate position,
the MVP-03 eligibility reuse, both idempotency digest comparisons (ordinary replay
and the unique-violation recovery), the vehicle delete guard, and the
`UNIQUE(tow_request_id)` constraint itself. Table and reasoning:
`17-negative-controls.md`.

`NC-MVP04-6b` is the reason C9 exists: the recovery branch was mutated and the
suite stayed **green** in the first batch, because the race could be won
sequentially and the loser never reached the mutated line. That was a test defect,
fixed by making the branch deterministically reachable; NC-6b is RED on every run
since.

## Bookkeeping (disclosed)
Files outside the MVP-04 implementation that this delivery touched, and why:

- `docs/tow/tow-api-contract.base.openapi.yaml` — **one line**: the shared
  `ErrorResponse.error.code` enum gained `proposal_already_active`, identical to the
  canonical list. The base keeps its `1.0.0-draft.2` version, its paths and its
  schemas; leaving it behind would have made the two documents disagree about a
  schema they both declare. Disclosed in `06-contract-revision.md`.
- `tests/helpers/towContract.js` — the same code added to `CANONICAL_ERROR_CODES`
  (the validator's "must be present" list), so the new code is protected rather
  than merely allowed.
- `tests/helpers/testDb.js` — the two MVP-04 tables added to the SQLite harness
  (`TABLES` + `SCHEMA`, mirroring the migration's CHECKs, jsonb → TEXT).
- `scripts/tow/db-baseline.js`, `scripts/tow/run-db-baseline-gate.js`,
  `docs/evidence/t01/db-baseline-gate.json` — the T01 baseline re-pinned to
  `001..005` and 35 tables (fingerprint `f2771dcf…` → `efb6158b…`). The gate was
  re-run on the frozen tree; the regenerated JSON differed from the committed one
  **only** in the random seed admin e-mail, so the pinned artifact was restored and
  the run is recorded as `20-baseline-gate.txt` (same fingerprint on both runs).
- `tests/tow/baseline/dbBaseline.e2e.test.js`,
  `tests/tow/baseline/dbBaselineSafety.test.js` — extended additively to pin the
  new migration and tables, including the smuggled-migration negative control.
- `tests/tow/mvp03/towMvp03Architecture.test.js`,
  `tests/tow/mvp03/towPartnerOpportunitiesContract.test.js` — the narrowed absence
  assertions and the moved version pin described under Regression. No MVP-03
  behaviour assertion was weakened.
- `docs/tow/TOW-MVP-DELIVERY-PLAN.md`, `docs/tow/TOW-TASK-GRAPH.yaml` — MVP-04
  dispatch base recorded and stale planning metadata refreshed (docs only).
- `tests/contract/openapi.structure.test.js` — the canonical version pin moved to
  `draft.6`.

## Scope
- MVP-01 / MVP-02 / MVP-03 touched: only additively, and only where this delivery
  must (the request repository became connection-scoped, the request service
  hydrates `assignment`/`has_live_proposal`, the vehicle repository gained the
  reference guard, `ports.js`/`composition.js`/`routes.js` gained wirings). All
  MVP-01..03 gates and counts are preserved.
- MVP-05 / #17 touched: **NO** — no counteroffer, no tracking, no cancellation, no
  completion, no payment execution, no debt/wallet/dispute logic, no scheduler, no
  expiry job. `COUNTERED` is never written; `search_expires_at` stays `null`.
- #31 / #33 touched: NO. Production / VPS touched: NO.
- Legacy `EmergencyRequest` / `tow_proposals` subsystem: audited and left
  byte-identical (asserted by the architecture test).
- No max-proposals-per-request cap was added: the matrix does not mandate one, and
  inventing a limit would be a new business rule.
- No `git add -A`; explicit paths only; no push, no PR, no merge.

## Remaining Findings
- **The transport flake is pre-existing and not fixed here.**
  `tests/tow` and the whole-suite run occasionally fail one unrelated test with a
  transport symptom (`socket hang up`, a stale 401, `Parse Error`). Measured on
  both sides of this delivery (`18-flake-census.md`): the base flaked in both
  contexts, including a whole-suite failure in a legacy delivery-order suite.
  MVP-03 diagnosed the family and recorded it as not fixed; MVP-04 adds 7 suites
  and 165 tests to the same single-process run, which raises the number of
  transport opportunities. The fix belongs to the harness (shared listeners), not
  to this delivery.
- **`is_verified` / `approval_status` still do not gate proposals**
  (`CONTRACT_CONFLICT-1`): MVP-04 reuses the accepted MVP-03 eligibility verdict
  exactly, and a dedicated test pins that an unverified partner can still create a
  proposal. Tightening it is a policy change with its own RED test.
- **No scheduler means expiry is lazy.** `expires_at` is stored and enforced on
  action; a proposal whose deadline passed while nobody acted stays `ACTIVE` in the
  table until an action touches it. That is truthful for this delivery and is the
  reason `search_expires_at`/`opportunity_expires_at` stay `null`.
- **`COUNTERED`, `REJECTED` and `EXPIRED` are unreachable by design.** They exist
  in the frozen enum and are never written: a consumer must not infer a
  counteroffer workflow, a rejection flow or an expiry job from the enum. An
  expired proposal is *refused* (`409 proposal_expired`) while its row still reads
  `ACTIVE`, and it is `CLOSED` if the request is assigned before anyone acts on it.
  The delivery that owns expiry semantics is the one that may write `EXPIRED`.
- **Occupancy is answered with the generic `conflict`.** The frozen contract has no
  `partner_busy`/`vehicle_busy` code; `details.reason` names which one, and adding a
  code would be a contract revision of its own.
- **`released_at` is always `NULL` in this delivery.** Nothing releases a job yet
  (no cancellation, no completion), so the partial occupancy indexes only ever see
  live rows; the release path is MVP-05+.
- **Legacy `models/Partner.js` still references non-existent columns**
  (`specialty`, `last_seen`) — pre-existing, recorded in `02-legacy-audit.md`,
  deliberately not fixed here.
- **No lint/typecheck script exists** in the backend package (unchanged from
  MVP-01..03); the Jest suites and the architecture boundary tests are the
  enforcement.
- **The negative-control driver lives outside the repository** (`/tmp`), because it
  mutates tracked sources; its results are recorded in `17-negative-controls.md`
  with hashes.

## Final Verdict
MVP-04 delivers the proposal lifecycle and the atomic assignment on the accepted
MVP-03 base: a partner creates a **server-priced** proposal for an eligible open
request, several proposals coexist, the customer lists them and accepts exactly
one, and PostgreSQL — through one transaction, a row lock and database-enforced
uniqueness — establishes **exactly one** assignment while the winner becomes
`ACCEPTED`, the losers `CLOSED`, the request `ASSIGNED`, and the partner and
vehicle become busy. The claim is proven where it can only be proven: against real
PostgreSQL, under concurrency, with nine negative controls showing that each
safeguard fails loudly when it is broken.

Evidence: `docs/evidence/mvp-04/01..20` and this file. Implementation head
`8b550440`, docs-only follow-ups `ee150deb` and this commit. Not pushed, not
merged, no PR opened: awaiting Muse review.
