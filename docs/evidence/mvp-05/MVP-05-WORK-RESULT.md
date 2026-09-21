# MVP-05 Work Result

## Status
READY_FOR_MUSE_REVIEW — implementation, contract revision, PostgreSQL concurrency
proof and evidence are committed on the branch; not pushed, not merged, no PR
opened, MVP-06/#18 not started.

## Base / Branch / Head
- Repository: `socorre-system` (monorepo; backend at `socorre_ai_backend/`)
- Execution base (frozen, authoritative): **`a3aa1d75aabd476182ef9b69ac5056b83e967ef2`**
- Branch: `feature/mvp-05-service-execution-tracking`
- Commits on the branch (3):
  - `331893f0` — RED suites and fixtures (10 files, +2528) — committed first on
    purpose, so the RED record in `03-red/` is the state of the tree before any
    implementation existed;
  - **`66d605a2023e90ab75d3cb9e67cf28b57c07d73f`** — implementation + tests +
    contract (54 files, +6542/−55) — **the frozen implementation head**;
  - `e388bee60a61c985e136777c57ee8d9902e925e9` — docs-only evidence 01–26
    (26 files, +1812/−11) — `git diff --stat 66d605a2..HEAD` touches `docs/` only,
    so nothing executable changed after the implementation head.
- Branch delta vs base: 80 files, +8354/−66.
- Push / PR / merge: **not performed.** No push, no PR, no merge, no MVP-06/#18,
  no Hermes, no production/VPS. This executor stops before Muse review.
- Dependency: MVP-04 (proposal lifecycle & atomic assignment) is the accepted
  dependency; this delivery consumes `tow_assignments` (`released_at IS NULL` =
  occupancy, `release_reason`) and `tow_request_proposals` without modifying
  either table.

## Current-State Delta
Delivered before any code as `01-current-state-delta.md` (every capability →
existing implementation `file:line` → disposition), with `02-contract-audit.md`
(what the frozen base already declared versus what the runtime could actually
produce). Reused unchanged: the MVP-01 module gate/vehicles/documents/settings,
the MVP-02 route/pricing stack, the MVP-03 request aggregate and matching
pipeline, the MVP-04 proposal + assignment aggregates and their transactions, and
the `Idempotency-Key` transport validation. Genuinely missing and delivered here:
the execution state machine, the four milestone operations, the current-tracking
point (write + guarded read), basic cancellation with attribution, terminal
release, the drain behaviour, the eight route wirings, migration 006, and the
PostgreSQL concurrency proof.

## Contract
`draft.7 → draft.8`, documented in `15-contract-revision-addendum.md`:
- the eight operations the base already declared for this flow are **re-declared
  in the overlay with their truthful status surface** (`401/403/404/409/422` plus
  the success status), keeping their `operationId`, method, path, tags and
  response schemas;
- `ErrorResponse.error.code` gains **`stale_tracking_update`** (a point strictly
  older than the stored one);
- the **inherited gap** `partner_not_operational` (returned by the MVP-04
  proposal route since MVP-04, declared nowhere) is closed in the overlay enum
  and in `TOW-API-CONTRACT.md` §12 — found mechanically by the new architecture
  assertion that every code in `domain.ERROR_STATUS` is declared;
- two behavioural clarifications are recorded (viewer-aware `allowed_actions`;
  the customer cancel body is optional/max 1000 while the partner's is
  required/1–2000 — the runtime matches both bounds exactly);
- **no path, parameter, response shape or enum member is removed or narrowed**,
  and `docs/tow/tow-api-contract.base.openapi.yaml` is **byte-identical to the
  dispatch base** (`git diff --quiet a3aa1d75 HEAD -- <base>` is empty);
- `npm run validate:openapi` PASS with an **empty allowlist**, and the operation
  contract suite (`towMvp05OperationContract.test.js`, 16/16) drives every
  declared status of all eight operations against the real app and validates each
  body with Ajv against the composed schema.

## State Machine
`domain/tow-request-state-machine.js` — one frozen graph:
`ASSIGNED → EN_ROUTE → ARRIVED → IN_TRANSIT → COMPLETED`, plus `CANCELLED`
terminal from `ASSIGNED|EN_ROUTE|ARRIVED`. No state was added (no
`COMPLETION_PENDING` production, no `NO_SHOW`, no `DISPUTED`, no `REMATCHING`),
no edge can be skipped, and every other `(from, to)` pair is 409
`invalid_tow_transition` with `details.from/to`. The four milestone operations are
one implementation parameterised by an edge, so a per-endpoint rule cannot drift;
`06-state-machine.md` records the graph, the classification (REPLAY / ILLEGAL /
APPLY) and the tests.

## Milestones
Five instants live on the canonical `tow_requests` row —
`en_route_at`, `arrived_at`, `in_transit_at`, `completed_at`, `cancelled_at` —
each written **once**, in the same statement as the state change, from the
backend clock (the request body of `arrived`/`finish` is an acknowledgement and is
never stored as a timestamp). A replay is a read: `en_route_at` and `updated_at`
do not move even when the replay arrives at a later instant (asserted offline and
in E1 on PostgreSQL).

## Authz
- milestone writes: `auth` + `requireTowPartner`, and the partner must be **the
  assigned partner** — `403 not_assigned_partner` is decided **before** the state
  is inspected, so a foreign partner cannot learn the state (negative control
  NC-MVP05-1);
- cancellation: customer path `requireCustomer` + ownership
  (`403 not_request_owner`), partner path `requireTowPartner` + assignment;
- tracking read: the only two-principal route of the module
  (`requireCustomerOrTowPartner` + ownership-or-assignment, `403
  not_request_owner` otherwise); the write is the assigned partner's only;
- the module gate is unchanged for new business (request creation, proposals) and
  absent from execution/tracking/cancellation (drain).

## Tracking
ONE current point per request, structural via `UNIQUE(tow_request_id)` on the new
`tow_request_tracking` table: a new point **replaces** the stored one, no history
is kept, and the route geometry is read from the request (the read path makes **no
RouteProvider call** — asserted in the operation contract suite). The write is
monotonic: a point strictly older than the stored one is refused with `409
stale_tracking_update`, an equal instant is accepted, and the guard is a predicate
inside the write (plus the pre-read fast path), which is what makes it hold under
concurrency (E4). `07-tracking-policy.md`.

## Cancellation
Basic cancellation before `IN_TRANSIT`: legal from `ASSIGNED`, `EN_ROUTE` and
`ARRIVED` for the owning customer and the assigned partner; `IN_TRANSIT`,
`COMPLETED` and `SEARCHING` are 409. The customer body is optional
(`reason` ≤ 1000), the partner's is required (1–2000). The winner's attribution
(`cancelled_by_actor_type`, `cancelled_by_actor_id`, `cancellation_reason`) and
`terminal_reason` (`CUSTOMER_CANCELLED` / `PARTNER_CANCELLED`) are written once
and never rewritten: a concurrent loser answers 200 reporting the **winner's**
attribution, not its own. The financial consequence is the frozen zero
(`fee_due_cents: 0`, `currency: 'BRL'`, `customer_debt_created: false`);
`refund_status` is deliberately not emitted because no charge can exist. No fee,
debt, refund, rematch or payment code exists anywhere in the delivery
(`14-scope-audit.md`). `08-cancellation-policy.md`.

## Graceful Drain
Execution, tracking and cancellation carry **no** new-business module gate: an
already-assigned job reaches `COMPLETED` after the module is disabled, and the
tracking/cancellation routes keep working. NC-MVP05-6 re-adds the gate to those
paths in `composition.js` and turns the drain suite RED, so the claim is tested in
both directions. `09-graceful-drain.md`.

## Assignment Release
A terminal state releases the assignment **in the same transaction** as the
transition (`released_at` + `release_reason = 'COMPLETED' | 'CANCELLED'`), so
occupancy (`released_at IS NULL`) and the request state can never disagree;
exactly one release happens under contention (E2, E3). NC-MVP05-3 disables the
release and turns the release suite RED.

## Persistence
`05-persistence-decision.md` — the canonical authorities stay `tow_requests` +
`tow_assignments`, plus the new `tow_request_tracking`. The legacy
`emergency_requests`, `real_time_tracking`, `tow_tracking`, `tow_proposals`,
`payments`, `wallets` and `disputes` are **not** inherited: nothing in this
delivery reads or writes them, and the architecture suite fails if any of them
reappears in the module's sources. Migration 006 appends 8 nullable columns (no
default, no backfill, no drop/rename/retype, no new index on `tow_requests`),
installs 11 named CHECK constraints on PostgreSQL from a single exported list
(the same list drives `down()`, which drops them by name in reverse order — the
fix for a real defect found by E5), and creates `tow_request_tracking`. On SQLite
the equivalent guarantees come from the offline DDL plus the guarded CAS.

## PostgreSQL Concurrency (E1–E6 + inherited C1–C9)
`10-postgres-concurrency.md`, raw transcript `17-postgres-mvp05.txt` — canonical
env `DB_HOST=127.0.0.1 DB_PORT=55434 DB_NAME_TEST=socorre_ai_tow_test
DB_USER=tow_test DB_PASSWORD=tow_test_password DB_SSL=false TOW_POSTGRES_E2E=1`:
- **E1** duplicate milestone contention — four concurrent `en-route`, all 200,
  one APPLY, milestone and `updated_at` do not move on later-instant replays;
- **E2** milestone × cancellation race — the cancellation is never lost, the
  ordering CHECKs hold, exactly one release;
- **E3** dual cancellation race — one attribution persisted, both responses
  report the winner's `terminal_reason`, one release, frozen zero consequence;
- **E4** tracking contention — one row, the newer point always wins, the older is
  409 `stale_tracking_update`, an equal instant is accepted;
- **E5** schema guards — 11 CHECKs present, raw SQL violations refused with
  `23514`, a tracking row for a missing request refused with `23503`, and
  `down()` → `up()` is exact;
- **E6** blocked writer — `pg_stat_activity` proves the lock wait, the uncommitted
  state does not leak, and the loser resolves against the committed winner.
- **6 passed / 6**, and the same run re-runs the inherited gates: **MVP-04 C1–C9**,
  **MVP-03** PostgreSQL, legacy `towPostgres`/`g3TowPostgres`, T01 foundation
  (`npm run test:pg` 6/6, migrate-from-zero, 36 tables), clean-database baseline
  gate (36 tables, fingerprint `2d513150…` × 2 identical).

## Negative Controls
`11-negative-controls.md` — six mutations, **all RED on the first attempt**, each
restored **byte-identically** (SHA-256 before == after, proven without
`git checkout` because the tree carried uncommitted sources): NC-1 assignment
check, NC-2 illegal milestone jump, NC-3 terminal release, NC-4 tracking read
authority, NC-5 tracking monotonicity (offline **and** PostgreSQL E4), NC-6
module gate on the drain path. The driver lives outside the repository
(`/tmp/mvp05-negative-controls.py`); results in `/tmp/mvp05-nc/summary.json`.

## Regression
`12-regression-summary.md` + raw transcripts `16`–`26`:
- MVP-05 offline suites 89 passed / 6 skipped (the PG-gated file), architecture
  29/29, operation-contract 16/16;
- `npm run test:contract` 7 suites / 95 tests passed; `npm run validate:openapi`
  PASS with an empty allowlist;
- `tests/tow` offline ×3: 1134 passed / 81 skipped / 0 failed each;
- **full jest: 93 suites, 1591 passed, 81 skipped, 0 failed**;
- `tests/tow` with PostgreSQL: **64 suites, 1212 passed, 0 failed**;
- `verify:tow` (DB_PORT=55434): **GREEN** — OpenAPI structure, contract suite,
  focused Tow suite, migrate-from-zero (6 migrations, 36 tables), PostgreSQL
  foundation gate;
- teardown: containers 0 / volumes 0 / networks 0.
- Two full-jest attempts before the transport hardening failed on the documented
  Supertest artifacts (one legacy `towDocumentFlow` flake; one stale-401 +
  `Parse Error` in the MVP-05 contract suite, with the server-side proof that the
  401 body was written: `"POST /api/tow/requests/1/en-route HTTP/1.1" 401 60`).
  Fixed rather than waived: the eight MVP-05 suites now use one real listening
  server per suite instead of an ephemeral server per request; no assertion
  changed. Preserved verbatim in `19-full-jest-artifacts.txt` and `18-flake-census.md`.
- Environment fact (pre-existing, disclosed): `verify:tow` defaults to port
  55432, permanently held by the unrelated `akry-edge-pg` container (never
  touched); every PostgreSQL gate here pins `DB_PORT=55434`.

## Muse Review
**PENDING.** No Muse review has been requested or performed for this delivery.

## PR
**PENDING.** No push, no PR, no merge. Issue #17 remains open; MVP-06/#18 was not
started.

## Scope
`14-scope-audit.md` — delivered exactly the five outcomes of the task, and
mechanically banned everything else: no extra state, no fee/debt/refund/rematch,
no payment, no dispute, no WebSocket, no scheduler/timer, no geofencing, no ETA,
no tracking history, no new business rules for MVP-03/04 surfaces. The only two
"banned-term" hits are deliberate and documented: the frozen zero
`fee_due_cents: 0` (the contract *requires* the module to state that a
cancellation is free) and the inherited `payment` DTO block that MVP-03 already
required. No MVP-06/#18 work, no Hermes.

## Final Verdict
Every MVP-05 outcome is implemented, contract-declared and proven by tests that
were RED before the implementation existed and by six negative controls that each
break one safeguard: the six-state execution path with no skippable edge, current
partner tracking with one point per request and a monotonic write, basic
cancellation before `IN_TRANSIT` with frozen attribution and zero financial
consequence, terminal assignment release in the same transaction, and graceful
drain after the module is disabled. Migration 006 is additive, reversible and part
of the reproducible baseline; the base contract is byte-identical; the overlay is
`draft.8` with only additive declarations. All gates are green on the canonical
PostgreSQL environment, the schema fingerprint is stable, and the workspace is
torn down to 0/0/0. The delivery is committed on
`feature/mvp-05-service-execution-tracking` and **ready for Muse review**.
