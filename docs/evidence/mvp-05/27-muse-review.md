# MUSE — MVP-05 Adversarial Review (27)

Reviewer: MUSE (adversarial, independent of the DeepSeek V4.1 Flash executor).
Method: frozen-tree verification, source audit with `file:line` evidence, full live-gate
re-execution by the reviewer, real-PostgreSQL reruns, two self-executed negative
controls (mutate → RED → byte-identical restore → GREEN).
Date (UTC): 2026-09-21. Working directory detached HEAD (see §0).

## 0. Frozen-tree verification — PASS

- `git rev-parse HEAD` → `aef99960`; `git log --oneline -8` confirms the stack
  `a3aa1d75` (MVP-04 accepted main) → `331893f0` (RED suites) → `66d605a2`
  (functional head) → `e388bee6` (evidence 01–26) → `aef99960` (work result).
  The branch name `feature/mvp-05-service-execution-tracking` is not checked out
  (detached HEAD at `aef99960`); the commit graph is the reviewed object and it
  matches the work result's claim.
- `git diff --name-only 66d605a2..aef99960` touches **only** `docs/evidence/mvp-05/`
  (`01`, `02`, `04`–`26`, `MVP-05-WORK-RESULT.md`) plus
  `docs/evidence/t01/db-baseline-gate.json`. **No functional file** (no `src/`,
  `database/`, `tests/`, `scripts/`) changed after the functional head — P1
  condition absent. `git status --short` was clean before this artifact was
  written (one transient dirtied file, `docs/evidence/t01/db-baseline-gate.json`,
  rewritten by my own `test:db-baseline` run and reverted with `git checkout --`
  before commit).
- Functional delta `a3aa1d75..66d605a2`: 54 files, `+6542/−55` — implementation,
  8 MVP-05 suites, migration 006, contract overlay draft.8. No out-of-scope
  production surface (see §12).

## 1. State machine — PASS

- Single authority `socorre_ai_backend/src/modules/tow/domain/tow-request-state-machine.js:46-53`:
  `ASSIGNED→{EN_ROUTE,CANCELLED}`, `EN_ROUTE→{ARRIVED,CANCELLED}`,
  `ARRIVED→{IN_TRANSIT,CANCELLED}`, `IN_TRANSIT→{COMPLETED}`, terminal
  `COMPLETED/CANCELLED` with empty edge sets. Exactly the required graph; no
  `COMPLETION_PENDING`/`NO_SHOW`/extra state is produced by any edge.
- Forbidden edges rejected: `classifyTransition` (`tow-request-state-machine.js:167-172`)
  returns `ILLEGAL` for every non-listed pair (including all skips
  `ASSIGNED→ARRIVED/IN_TRANSIT/COMPLETED`, `EN_ROUTE→IN_TRANSIT/COMPLETED`,
  `ARRIVED→COMPLETED`, `IN_TRANSIT→CANCELLED`, anything from terminal states);
  services convert it to 409 `invalid_tow_transition` with `details.from/to`
  (`execution-service.js:104-106`, `cancellation-service.js:95-97`). The
  `ASSIGNED→COMPLETED` skip is pinned by test and by my own NC-2 rerun (§11).
- Domain owns transitions: controllers are thin identity/body forwarders
  (`http/execution-controller.js:17-25`, `cancellation-controller.js:17-35`,
  `tracking-controller.js:20-38`); the four milestones are one parameterised
  `transition({operation})` (`execution-service.js:78-146`); the repository never
  decides the edge — `milestoneColumn` arrives from the domain
  (`tow-request-repository.js:295-321`).
- Milestones set once from the backend clock: `clock.now()` is captured before the
  transaction (`execution-service.js:88`, `cancellation-service.js:80`,
  `tracking-service.js:83`); state + milestone (+ attribution) are one guarded CAS
  UPDATE (`WHERE id AND state = :from`, `tow-request-repository.js:316-320`);
  REPLAY is a pure read returning the canonical row with zero writes
  (`execution-service.js:101-103`, `cancellation-service.js:88-94`). The
  `arrived`/`finish` bodies are validated as `LocationInput` acknowledgements and
  never stored (`execution-service.js:84-86`). Client timestamps never become
  milestones; the only client instant persisted is tracking `observed_at`, which is
  ordering data, not a milestone.
- Terminal detection `isTerminalTowRequestState` (`tow-request-state-machine.js:126-128`)
  gates tracking writes (`tracking-service.js:91-93`).

## 2. Authz — PASS

- Milestones: `auth` + `requireTowPartner` at routing (`http/routes.js:87-90`),
  identity strictly from `req.user.partner_id` (`http/execution-controller.js:19`),
  assignment check inside the locked transaction **before** state classification
  (`application/job-lock.js:59-69` → `lockJobForPartner`; `execution-service.js:93-106`).
  Foreign partner cannot learn state: 403 precedes 409 — proven by test and by my
  NC-1 rerun, which removed the check and got 200 where 403 was required (§11).
- Cancellation: customer path `requireCustomer` + `lockRequestForCustomer`
  (ownership 403 `not_request_owner`); partner path `requireTowPartner` +
  `lockJobForPartner` (403 `not_assigned_partner`) (`routes.js:94-95`,
  `cancellation-service.js:146-171`, `job-lock.js:41-69`).
- Tracking write is assigned-partner-only (`routes.js:101`,
  `tracking-service.js:89`); tracking read is the only two-principal route with its
  own guard (`requireCustomerOrTowPartner`, `middleware.js:57-70`) and
  ownership-or-assignment enforcement in the service (`tracking-service.js:114-147`).
- Anonymous → 401 via `auth`; non-canonical id → 404 before any DB compare
  (`job-lock.js:29-34`); unknown request → 404 `not_found`. All exercised by the
  operation-contract suite (16/16, every declared status driven against the real
  app) and the API suites, all GREEN in my runs (§10).

## 3. Tracking — PASS

- Write authority: assigned partner only; customer/admin have no write route
  (`routes.js:101`); a valid tow partner on another job gets 403 before state
  inspection (`tracking-service.js:89`).
- Validation: `validateTrackingPoint` rejects out-of-bounds/non-finite/missing
  coordinates (domain input validators; 422 surface declared and contract-tested).
- Staleness: deterministic rejection of strictly-older `observed_at` via pre-read
  fast path **plus** the `.where('observed_at', '<=', …)` CAS predicate in the
  write (`tracking-repository.js:101-136`); equal instants accepted; newer replaces.
  One row per request enforced structurally by
  `tow_request_tracking_tow_request_id_unique` (`006:145`).
- Read isolation: owning customer or assigned partner only; foreign customer 403;
  request A's point never served for request B (lookup strictly by
  `tow_request_id`, `tracking-repository.js:78-80`; read path `tracking-service.js:114-147`).
- Terminal writes rejected with 409 `invalid_tow_state` (`tracking-service.js:91-93`).
- No Google call on tracking: `route` is composed from the request's own
  pickup/destination columns (`tracking-service.js:133-144`); asserted by the
  operation-contract suite. PG E4 (concurrent newer-wins/older-409) rerun GREEN (§10).

## 4. Cancellation — PASS

- Legal states `ASSIGNED/EN_ROUTE/ARRIVED` only, for owning customer and assigned
  partner; `IN_TRANSIT/COMPLETED/SEARCHING` → 409 `invalid_tow_transition`
  (`cancellation-service.js:87-97`, state machine graph).
- Attribution persisted once: `cancelled_at` + `cancelled_by_actor_type/id` +
  `cancellation_reason` + `terminal_reason` written in the same CAS UPDATE
  (`tow-request-repository.js:303-314`); replay returns the canonical row with the
  **winner's** attribution, never rewritten (`cancellation-service.js:88-94`,
  `112-120` — loser re-reads and replays). PG E3 rerun GREEN (one attribution,
  both responses report the winner).
- Foreign actor learns nothing: ownership/assignment check precedes state read
  (`cancellation-service.js:85`, `job-lock.js`), so an already-cancelled job still
  answers 403 to a foreign caller.
- No fee/debt/refund/rematch: `domain/cancellation.js:30-34` freezes
  `{fee_due_cents: 0, currency: 'BRL', customer_debt_created: false}`; no
  `refund_status` member is emitted (deliberate, documented); no payment/debt/
  rematch code exists in the delivery (census §12). The zero is contract-required
  output, not economics.

## 5. Graceful drain — PASS

- `composition.js:143-164`: `executionService`, `trackingService`,
  `cancellationService` are built **without** `moduleService`; no
  `assertNewBusinessAllowed()` call exists on any execution/tracking/cancellation
  path (grep: gate calls only in `matching-service.js:76`,
  `tow-request-service.js:104`, `proposal-service.js:128,309`,
  `assignment-service.js:152` — all new-business paths, correctly still gated).
- `towMvp05GracefulDrain.test.js` (6/6 GREEN in my run) proves an assigned job
  completes and tracking/cancellation keep working after disable, while
  request/proposal/assignment stay blocked. My NC-6 equivalent was not rerun, but
  the executor's NC-MVP05-6 log shows the expected RED (200→409
  `service_module_disabled`) and GREEN restore; the mechanism (gate absence in
  `composition.js`) was directly verified in source.

## 6. Assignment release — PASS

- Terminal transitions release in the same transaction:
  `execution-service.js:125-131` (COMPLETED) and `cancellation-service.js:122-125`
  (CANCELLED) call `releaseByRequestId` inside `unitOfWork.run`, guarded by
  `released_at IS NULL` (`assignment-repository.js:263-276`). Exactly-once under
  contention proven by PG E2/E3 reruns (one release each).
- Non-terminal milestones never touch the release path (no call outside the
  `isTerminalTowRequestState` branch); replay performs no second release
  (early return before any write).
- Partner/vehicle reuse: occupancy remains `released_at IS NULL` (partial unique
  indexes, MVP-04 C4 rerun GREEN); `/partner/jobs` (`listForPartner`,
  `assignment-repository.js:174-197`) has **no** `released_at` filter — history is
  preserved — while occupancy enforcement is index-based, not query-based. Old
  assignment rows are never deleted, so jobs stay rehydratable (only
  `released_at`/`release_reason`/`updated_at` mutated, identity columns untouched).

## 7. Persistence — PASS

- Migration `006_mvp05_service_execution_tracking.js`: additive only — 8 nullable
  columns on `tow_requests` (no default/backfill/drop/rename/retype, no new index
  on `tow_requests`), one new table `tow_request_tracking` with
  `UNIQUE(tow_request_id)`, FK `tow_request_id→tow_requests` CASCADE,
  `partner_id→partners` RESTRICT, lat/lon CHECKs. Justified in-file (§5
  header comment) and in `05-persistence-decision.md`.
- DB invariants: 11 named CHECKs from one exported list driving both `up()` and
  reverse-order `down()` (`006:81-104,152-161`) — milestone ordering, terminal
  coherence (`(state='COMPLETED')=(completed_at IS NOT NULL)` and CANCELLED
  twin), attribution pair coherence, reason length ≤ 2000, terminal_reason state
  coherence. PG E5 rerun GREEN (raw-SQL violations refused `23514`/`23503`,
  `down()→up()` exact).
- Migrations exactly `001..006` (directory listing verified; no `007`).
- Fingerprint `2d513150…` (36 tables) reproduced deterministically: my own
  `DB_PORT=55434 npm run test:db-baseline` run printed run-2 fingerprint
  `2d51315075542832bbc4d5effa78ae83be05fc51f342cc0b0a7cc9ba78b35834`,
  identical ×2, 36 tables, teardown verified. (The script run rewrote
  `docs/evidence/t01/db-baseline-gate.json`; reverted before commit.)
- `db-baseline.js` delta vs base is one justified line: `tow_request_tracking`
  added to `REQUIRED_TABLES`.

## 8. Contract — PASS

- Base `docs/tow/tow-api-contract.base.openapi.yaml` is **byte-identical** to the
  dispatch base (`git diff --quiet a3aa1d75 HEAD -- <base>` empty — rerun by me).
- Overlay `1.0.0-draft.7 → 1.0.0-draft.8`, explicit/additive/documented in
  `15-contract-revision-addendum.md`: eight operations re-declared inline with
  truthful status surfaces (same `operationId`/method/path/tags/schemas);
  `ErrorResponse.error.code` gains `stale_tracking_update` (+ inherited-gap
  `partner_not_operational`, proven returned since MVP-04); viewer-aware
  `allowed_actions` and cancel-body bounds recorded as clarifications. No
  path/parameter/shape/enum member removed or narrowed (the only `-` lines are
  the eight replaced `$ref`s and the version string; enum diff is purely
  `+partner_not_operational, +stale_tracking_update`).
- Runtime truthfulness: `REQUEST_ALLOWED_ACTIONS` (`domain/tow-request.js:80-87`)
  contains only `accept_proposal/start_en_route/mark_arrived/start_in_transit/
  finish_service/cancel`, and `allowedActionsForRequest` (`tow-request.js:175-190`)
  emits only the truthful subset per viewer/state (partner gets forward
  milestone + `cancel`; customer gets `cancel`; terminal gets nothing). No
  counteroffer/payment/MVP-06/no-show action is ever emitted. (The base schema's
  `allowed_actions` enum lists future lifecycle members — inherited, untouched,
  not advertised by the runtime.)
- Eight routes match canonical paths — runtime (`routes.js:87-101`) ↔ contract
  (`/cancel:267`, `/tracking:308`, `/en-route:362`, `/arrived:382`,
  `/in-transit:408`, `/finish:428`, `/cancel-partner:456`): 8 operations on 7
  paths (tracking GET+POST share one path), all `operationId`s preserved.
- `npm run validate:openapi` PASS with empty allowlist; operation-contract suite
  16/16 Ajv-validates every declared status body against the composed schema.

## 9. PostgreSQL — PASS (rerun by reviewer, canonical env on port 55434)

All PG runs used
`DB_HOST=127.0.0.1 DB_PORT=55434 DB_NAME_TEST=socorre_ai_tow_test
DB_USER=tow_test DB_PASSWORD=tow_test_password DB_SSL=false TOW_POSTGRES_E2E=1`
(port 55432 is held by the unrelated `akry-edge-pg` container — pre-existing,
disclosed, never touched; the bare `TOW_POSTGRES_E2E=1 …` invocation without the
DB env fails with `password authentication failed` because the client defaults to
55432, i.e. the foreign container — environment wiring, not a product failure).

- `towMvp05Postgres.e2e.test.js`: **6/6 GREEN** (E1 duplicate-milestone CAS +
  immobile `updated_at`; E2 milestone×cancel coherent terminal + one release; E3
  dual-cancel one attribution + winner reported twice + frozen zero; E4 tracking
  newer-wins/older-409 one row; E5 11 CHECKs + FK refusals + exact down/up; E6
  lock-wait isolation via `pg_stat_activity`).
- `towMvp04Postgres.e2e.test.js`: **10/10 GREEN** — inherited C1–C9 (plus
  migration-005 authority assertion) remain green.
- `dbBaseline.e2e.test.js`: **33/33 GREEN**; `towMvp03Postgres.e2e.test.js`:
  **7/7 GREEN**; `towPostgres + g3TowPostgres`: **9/9 GREEN**.
- PG failures treated as load-bearing throughout; none occurred once the client
  pointed at the canonical container.

## 10. Gates (run by the reviewer; real counts) — ALL GREEN

| command | result |
| --- | --- |
| `npm run validate:openapi` | PASS, empty allowlist |
| `npm run test:contract` | 7 suites / 95 tests passed |
| `DB_PORT=55434 npm run verify:tow` | GREEN (OpenAPI structure, contract suite, focused Tow offline, migrate-from-zero 6 migrations/36 tables, PG foundation 6/6; teardown 0/0/0) |
| `npx jest tests/tow/mvp01 --runInBand` | 13 passed suites (2 skipped), 124 passed / 10 skipped tests |
| `npx jest tests/tow/mvp02 --runInBand` | 5 suites, 204 passed |
| `npx jest tests/tow/mvp03 --runInBand` | 8 suites, 177 passed / 7 skipped |
| `npx jest tests/tow/mvp04 --runInBand` | 9 suites, 189 passed / 10 skipped |
| `npx jest tests/tow/mvp05 --runInBand` | 7 passed suites (1 PG-gated skipped), 89 passed / 6 skipped — matches work-result claim |
| `npx jest tests/tow --runInBand` | 58 passed suites (6 skipped), 1134 passed / 81 skipped / 0 failed (×1 run; claim was ×3 — one reviewer run is the required gate) |
| `DB_PORT=55434 npm run test:db-baseline` | GREEN — 36 tables, fingerprint `2d513150…` identical ×2 (bare-port invocation fails on the foreign 55432 holder: environment fact, disclosed) |
| `npx jest --runInBand` | 93 suites passed (6 skipped), 1591 passed / 81 skipped / 0 failed — exact match of claim |
| PG up/wait + 5 PG suites (§9) | E1–E6 6/6, C1–C9 10/10, baseline 33/33, mvp03 7/7, legacy 9/9 |
| `npm run test:pg:down` (with `DB_PORT=55434`) | mandatory teardown verified: 0 containers / 0 volumes / 0 networks for `tow-test` |

Transport-flake census: **zero flakes in any reviewer run** (no stale-401,
`Parse Error`, or `socket hang up` observed). The executor's hardening (one real
listening server per MVP-05 suite) is present in the frozen tests and did not
weaken any assertion (see §13).

## 11. Negative controls — PASS (executor evidence truthful; 2 rerun by reviewer)

- In-repo evidence `11-negative-controls.md` is truthful and reproducible: the raw
  driver **exists** at `/tmp/mvp05-negative-controls.py` (not gone) with
  `/tmp/mvp05-nc/summary.json`, `transcript.txt`, and all 14 per-control RED/GREEN
  logs. Spot-checked `NC-MVP05-2-red-…log`: `✕ ASSIGNED cannot jump to ARRIVED,
  IN_TRANSIT or COMPLETED`, `1 failed, 14 passed` — consistent with the table.
- Reviewer reruns (backups in `…/muse-mvp05-nc/`, never `/tmp`; restore by copy,
  verified with `cmp` + SHA-256):
  - **NC-MVP05-2** (added `COMPLETED: 'finish_service'` to `ASSIGNED` in
    `domain/tow-request-state-machine.js`): RED `✕ ASSIGNED cannot jump…`,
    1 failed / 14 passed — the exact test and counts the executor claims;
    restored hash `9e1aea34…` equals the executor's `sha256_before`; GREEN 15/15.
  - **NC-MVP05-1** (removed `assertAssignedPartner` from `lockJobForPartner` in
    `application/job-lock.js`): RED `✕ a foreign tow partner is 403
    not_assigned_partner on every transition`, 1 failed / 14 passed — exact
    match; restored hash `840aa736…` equals the executor's `sha256_before`;
    GREEN 15/15.
- Both restorations byte-identical (`cmp` clean, before-hash == after-hash, and
  both equal the executor's recorded pristine hashes — cross-validating the
  executor's SHA-256 table). `git status` clean afterwards (no source residue).

## 12. Scope — PASS (MVP-06 NO | payments NO | counteroffer NO | no-show NO | #33 NO | #31 NO | VPS NO)

- Census over the functional diff (`src/`, `database/`): banned-term hits are
  comments-only disclaimers (no ETA/geofencing/routing/trail owned), the frozen
  zero `fee_due_cents: 0` (`domain/cancellation.js:30-34`), and prose mentions of
  `debt/rematch` explaining their absence. Zero code implementing fees, debt,
  refunds, rematch, payments, wallets, disputes, WebSocket, scheduler/cron,
  geofencing, ETA, tracking history, counteroffer, no-show, settlement/payout,
  review, `#31`/`#33`, VPS/Hermes, or extra states. The openapi
  `allowed_actions` future-enum members and error codes
  (`counteroffer_*`, `payment_*`, `customer_no_show_*`) are inherited base text,
  byte-identical, never emitted by the runtime (§8).
- `towMvp05Architecture.test.js` (29/29 in my run) mechanically bans legacy
  tables, unrouted surfaces, and scope leaks.

## 13. No weakened tests — PASS

- `git diff a3aa1d75..66d605a2 | grep -E '\.only|\.skip|…'` hits only the standard
  PG-gating idiom (`postgres.isEnabled() ? describe : describe.skip`, including
  the new PG e2e file's equivalent) — pre-existing pattern, not weakened coverage.
- The eight MVP-05 suites' transport hardening (one listening server per suite)
  changes harness setup only. Adaptations found are **strengthenings**, not
  weakenings: `towPartnerJobs.test.js` now asserts exact viewer-aware action sets
  (`['cancel']` customer vs `['start_en_route','cancel']` partner) instead of
  cross-viewer equality, and fabricates the full milestone chain to satisfy the
  new terminal-coherence CHECKs. No removed assertions found.
- RED record `docs/evidence/mvp-05/03-red/` (index + run transcript) predates the
  implementation commit as claimed.

## Findings

- P0: 0. P1: 0. Blocking P2: 0.
- P3 (documented, non-blocking):
  1. `cancellation-service.js:4-8` header comment names the partner route
     `POST /tow/partner/jobs/{requestId}/cancel`; the actual wired route is
     `POST /tow/requests/:requestId/cancel-partner` (`routes.js:95`) and the
     contract path `/tow/requests/{requestId}/cancel-partner`. Comment-only staleness.
  2. `18-flake-census.md` claims the Supertest artifacts reproduce on the
     untouched base commit; not independently re-verified by the reviewer (zero
     flakes observed in any reviewer run, so no contradiction — just unconfirmed).
  3. The bare `TOW_POSTGRES_E2E=1 npx jest …` invocations from the gate list fail
     with `password authentication failed` unless the canonical DB env
     (`DB_HOST/DB_PORT/DB_*`) is exported, because the client defaults to port
     55432 held by the foreign `akry-edge-pg` container. Environment fact,
     pre-existing and disclosed — recorded here so the verdict block's "Live
     gates" line is unambiguous about the exact commands run.

## Claims audited

Verified: docs-only post-functional diff; 6-state graph + cancellation edges;
domain-owned transitions; milestone-once/backend-clock/replay-as-read; 403-before-409
ownership; tracking monotonicity + one-row + terminal refusal + no route call;
cancellation states/attribution/replay/frozen zero; drain (no gate on 8 paths,
gate retained on new business); same-transaction release + history-preserving
`/partner/jobs`; additive 006 + 11 CHECKs + exact down/up + 001..006 + no 007 +
`2d513150…`/36 tables; draft.8 additive + truthful `allowed_actions` + 8 routes;
scope exclusions; NC table (hashes cross-validated); all gate counts listed in §10
(exact matches where the work result gave numbers: mvp05 89/6, tests/tow 1134/81,
full 1591/81, contract 95, E1–E6 6/6, C1–C9 10/10).
Falsified: none. One doc nit (P3-1) found by reading, not by execution.

---

# MUSE — MVP-05 Adversarial Review
Verdict: APPROVE
Reviewed SHA: aef99960
Functional SHA: 66d605a2
P0: 0
P1: 0
blocking P2: 0
P3: [stale partner-cancel path in cancellation-service.js header comment (comment-only); flake-on-base reproduction not independently re-verified (no flakes observed); PG e2e requires canonical DB env on 55434 because 55432 is held by foreign container (pre-existing, disclosed)]
Checks: 1 PASS | 2 PASS | 3 PASS | 4 PASS | 5 PASS | 6 PASS | 7 PASS | 8 PASS | 9 PASS | 10 ALL-GREEN (counts in §10) | 11 PASS (executor truthful, NC-1 + NC-2 rerun RED→GREEN byte-identical) | 12 PASS | 13 PASS (hardening assertion-neutral, adaptations strengthen)
Claims audited: verified (frozen tree, state machine, authz, tracking, cancellation, drain, release, persistence/fingerprint, contract draft.8, all gate counts, scope, NC hashes) / falsified: none
Live gates: validate:openapi -> PASS (empty allowlist); test:contract -> 7 suites/95 passed; verify:tow (DB_PORT=55434) -> GREEN; jest mvp01 -> 124p/10s; mvp02 -> 204p; mvp03 -> 177p/7s; mvp04 -> 189p/10s; mvp05 -> 89p/6s; tests/tow -> 1134p/81s/0f; test:db-baseline (DB_PORT=55434) -> GREEN 36 tables fp 2d513150…x2; full jest -> 93 suites 1591p/81s/0f; PG E1-E6 -> 6/6; PG C1-C9 -> 10/10; baseline PG -> 33/33; mvp03 PG -> 7/7; legacy PG -> 9/9; test:pg:down -> 0/0/0
PostgreSQL: E1-E6 rerun 6/6 GREEN; MVP-04 C1-C9 rerun 10/10 GREEN; baseline 33/33, mvp03 7/7, legacy towPostgres+g3 9/9 GREEN (canonical env, port 55434)
Scope: MVP-06 NO | payments NO | counteroffer NO | no-show NO | #33 NO | #31 NO | VPS NO
