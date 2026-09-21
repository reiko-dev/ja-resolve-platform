# MUSE — MVP-04 EXT-MVP04 Correction Re-Review (fresh, frozen tree)

- Reviewer: MUSE (adversarial, fresh session; prior MVP-04 review treated as stale).
- Executor: DeepSeek V4.1 Flash (different model; no claim trusted without code + live-run evidence).
- Reviewed SHA: `011a0a5c` (detached worktree HEAD).
- Functional SHA: `6eb7469a`.
- Base: `7ad3e56b` (confirmed ancestor of HEAD). Previous PR head: `c8a602fd`.
- Date (UTC): 2026-09-21. Working directory:
  `/var/folders/tj/v4pyr7mx54j09ps94lqs8qyh0000gn/T/opencode/muse-ext04`.
- Branch `feature/mvp-04-proposals-assignment` exists locally (and as
  `remotes/origin/*`); the worktree itself is detached at `011a0a5c`, as briefed.
- Prohibitions obeyed: no production/test file modified (two temporary
  negative-control mutations were byte-identically restored with sha256
  verification, see §7); no push/merge; MVP-05/counteroffer/#31/#33/VPS untouched.

## 0. Frozen artifact

- `git diff --name-only 6eb7469a..011a0a5c` touches exactly three files, all under
  `docs/evidence/mvp-04/` (`23-green/00-summary.md`,
  `23-green/13a-postgres-c7-red.txt`, `MVP-04-WORK-RESULT.md`). **Zero functional
  files → the docs-only claim holds; no P1.**
- `git status --short` is clean before and after this review (one transient
  `docs/evidence/t01/db-baseline-gate.json` rewrite by my own db-baseline run —
  ephemeral run fields only, fingerprint identical — was restored via
  `git checkout --`; verified clean again).
- Functional correction `c8a602fd..6eb7469a` touches only: 8 tow-module sources,
  the composed OpenAPI contract, 9 test files, and evidence. No migration, no
  base-contract rewrite (verified: `docs/tow/tow-api-contract.base.openapi.yaml`
  untouched), no file outside tow module / tests / docs.

## 1. EXT-MVP04-1 — partner jobs (P1 correction) — VERIFIED

Code (read in full, not trusted from the work result):

- `http/routes.js:60` — `router.get('/partner/jobs', auth, requireTowPartner,
  towRequestController.listJobsForPartner)`. Partner-only; customer → 403 via
  `requireCustomer`-style middleware (`middleware.js`: partner without tow role
  gets 403 `forbidden`); anonymous → 401 from `auth`.
- `http/tow-request-controller.js:49-55` — forwards ONLY
  `{partnerId: req.user.partner_id, query}`. No query/body/path identity input exists.
- `application/tow-request-service.js:200-228` (`listJobsForPartner`) — reads
  `assignmentRepository.listForPartner(partnerId, …)`, batch-loads requests via
  `findByIds`, renders every item with the SAME `buildAssignmentDto` /
  `actionsFor` / `toDto` helpers as the customer path. No DTO fork.
- `adapters/persistence/assignment-repository.js:174-197` — `WHERE
  tow_assignments.partner_id = partnerId` always applied; `state` filters the
  joined request; `from`/`to` are INCLUSIVE (`>=`/`<=`) on
  `tow_assignments.assigned_at` in the same `toIsoInstant` representation used on
  write; ordering `assigned_at DESC, id DESC`; pagination over assignment rows
  with `{rows, total}`.

Live runs (offline SQLite harness, run by me):

- `tests/tow/mvp04/towPartnerJobs.test.js` — **16/16 PASS**, covering: 401
  anonymous, 403 customer, identity-from-token-only, winner sees exactly one job
  with `assignment.partner_id/tow_vehicle_id/final_price/assigned_at`,
  loser/unrelated partners see nothing, customer↔partner assignment DTO equality,
  truthful `state`/`page`/`limit`/`from`/`to` (inclusive-bound test), 422 on
  malformed/inverted bounds and bad page/limit.
- Falsification: the suite asserts losing-proposal and unrelated partners receive
  `[]`, and NC-EXT04-1 semantics (ownership predicate) were proven load-bearing
  by the executor's documented RED and by code inspection of the `WHERE` clause.

## 2. EXT-MVP04-2 — Idempotency-Key (P1 correction) — VERIFIED

Code:

- `http/proposal-controller.js:54-70` — accept and withdraw both pass
  `idempotencyKey: req.get('Idempotency-Key')` (header only, never body).
- Canonical validator `domain/idempotency.js:34-59` (`validateIdempotencyKey`,
  8–128, trims; missing/short/long → `validation_error` → HTTP 422 via
  `ERROR_STATUS`). Accept (`assignment-service.js:150-162`) validates AFTER the
  module gate and BEFORE `isTowProposalId`/transaction open → zero assignment
  rows, no state change on 422, on every path (including already-ASSIGNED).
- Withdraw (`proposal-service.js:307-336`) validates BEFORE `findById` → 422
  precedes 403/404/409 on every path. Ordering after that: ownership
  (`forbidden` → 403) → WITHDRAWN short-circuit (same owner → 200 same DTO) →
  `assertProposalActionable` (ACCEPTED/CLOSED → 409 `proposal_not_actionable`;
  expired ACTIVE → 409 `proposal_expired`, per `domain/tow-proposal.js:475-483`).
- Accept replay authority unchanged: `proposal_id` + DB uniques (verified in
  `acceptWithin`: `findByProposalId` replay check before state guards; blind
  INSERT with `proposal`/`request`/occupancy conflict disambiguation).

Live runs:

- `tests/tow/mvp04/towIdempotencyKey.test.js` — **18/18 PASS**, including:
  missing/short/long → 422 with zero assignment rows / proposal stays ACTIVE;
  8-and-128 boundaries accepted; key validated before proposal read; same-key and
  DIFFERENT-key replays return the same assignment (one row); missing key on
  assigned request still 422; foreign partner 403-with-key / 422-without;
  ACCEPTED/CLOSED → 409 `proposal_not_actionable`; expired ACTIVE → 409
  `proposal_expired`; unknown proposal 404-with-key / 422-without.
- Falsification attempts (mutation without header must fail): the suite performs
  exactly these bypass attempts and all are refused; my two live negative-control
  reruns (§7) additionally prove removal of either guard turns the suites RED.

## 3. EXT-MVP04-3 — operation contract (P2 correction) — VERIFIED

- Composed contract `docs/tow/tow-api-contract.openapi.yaml`: `info.version:
  1.0.0-draft.7` with the draft.7 revision note in `info.description` naming
  EXT-MVP04-1/2/3, `tow_assignments` authority, inclusive `assigned_at` bounds,
  enforced 422, and the full truthful status surface. Base contract untouched.
- `IdempotencyKey` component pinned (`name: Idempotency-Key, in: header,
  required: true, minLength 8, maxLength 128`); `RequestId`/`ProposalId` path
  params present; create operations keep empty-body-only semantics (verified via
  existing `validateCreateTowProposalInput` + proposal-service §12-13, unchanged
  except the withdraw guard); `listPartnerTowJobs` declares exactly
  `state/from/to/page/limit` with 200 (`TowRequestListResponse`) / 401 / 403 / 422.
- `tests/contract/towOperationContract.test.js` — **17/17 PASS**: resolves the
  COMPOSED document (not YAML grep), pins required params, empty-body create,
  real status surface for create/accept/withdraw/partner-jobs, observed runtime
  statuses ⊆ declared, 4xx bodies validate against `ErrorResponse`, draft.7 pin,
  base/canonical convergence. No speculative statuses found (declared accept /
  withdraw surface 200/401/403/404/409/422 matches runtime probes in-suite).
- `npm run validate:openapi` → exit 0 (GREEN, draft.7, 0 unresolved refs, 0
  dropped base methods). `npm run test:contract` → **6 suites / 79 passed**.

## 4. Architecture preserved — VERIFIED

- Accept diff `c8a602fd..6eb7469a` (`assignment-service.js`, controller) is ONLY:
  the `validateIdempotencyKey` import, the `idempotencyKey` param, the guard call,
  and comments. Transaction body (request + proposal row locks, blind INSERT,
  unique/partial-index conflict arbitration, `markAssigned`/`markAccepted`/
  `closeActiveForRequestExcept`) byte-untouched.
- `grep quoteService|quoteTow` in `assignment-service.js` → empty: zero Google
  re-quote during accept; no client price (accept takes only
  `{customerId, proposalId, idempotencyKey}`); final price frozen from the
  proposal snapshot (`buildAssignmentRecord` from `locked.price_*`, unchanged).
- Occupancy authority unchanged: `UNIQUE(tow_request_id)`,
  `UNIQUE(proposal_id)`, live-partner / live-vehicle partial indexes intact
  (repository `violationTarget` disambiguation untouched).
- Scope test change note: `towMvp04Architecture.test.js` removed `'/jobs'` from
  the forbidden-substring list — REQUIRED and SAFE: the new canonical route
  `/partner/jobs` contains that substring. I read `routes.js` in full (106
  lines): no other `/jobs` route exists, and the test now positively pins
  `router.get('/partner/jobs', auth, requireTowPartner`. Non-issue (P3 record only).

## 5. Concurrency (real PostgreSQL, C1–C9) — VERIFIED 10/10

Own container on `DB_PORT=55434` (`test:pg:up`/`wait` healthy), torn down after
(§8). Sequential runs (parallel PG suites against one DB interfere — my own
methodology error once, corrected):

- `towMvp04Postgres.e2e.test.js` — **10/10 PASS** (migration probe + C1–C9),
  reproduced on a consecutive rerun (10/10 again); C9 additionally green in
  isolation. DB (23505 / partial indexes) is the arbiter per the passing
  assertions (concurrent accepts collapse to one assignment; occupancy enforced).
- `dbBaseline.e2e.test.js` — **33/33**; `towMvp03Postgres.e2e.test.js` — **7/7**;
  `towPostgres.e2e.test.js + g3TowPostgres.e2e.test.js` — **9/9**.

## 6. Schema — VERIFIED

- Migrations on disk exactly `001..005`; correction diff adds none (only the
  pre-existing `005_mvp04_proposals_assignments.js` differs from base `7ad3e56b`,
  which predates MVP-04 — not part of this correction).
- `DB_PORT=55434 npm run test:db-baseline` → GREEN; run-1 and run-2 fingerprints
  both `efb6158bf9df52434f8e21bfa6d15a98fa9a5ee02a0ca0ee13144dc9c27d9cdc` —
  matches the required pin.

## 7. Negative controls (mine — 2 of NC-EXT04-1..4 rerun)

Backups under `/var/folders/tj/v4pyr7mx54j09ps94lqs8qyh0000gn/T/opencode/muse-ext04-nc/`
(never `/tmp`). Pre-mutation hashes matched the executor's recorded values exactly
(`ea56e80e…`, `fafa34b1…`), confirming the frozen tree state.

- **NC-EXT04-2 rerun** (removed accept `validateIdempotencyKey`):
  RED `2 failed suites, 6 failed / 29 passed / 35 total` — EXACT counts as
  documented. Restored via `cp`, sha256 `ea56e80ea2deb4c5950c1ad2ba66fad7ab312e8a75a2116ed6f258b0a1413a72`
  OK → GREEN `2 passed, 35/35`.
- **NC-EXT04-3 rerun** (removed withdraw `validateIdempotencyKey`):
  RED `2 failed suites, 5 failed / 30 passed / 35 total` — EXACT counts as
  documented. Restored via `cp`, sha256 `fafa34b146da4f5fc8b503325b71e8349262a6f4f89c7b0fedbc7fb41519a016`
  OK → GREEN `2 passed, 35/35`.
- `grep -rn "NC-EXT04-\|MUSE-REREVIEW" src/` → empty (no residue);
  `git status --short` → clean.

## 8. Gates (all run by me; real counts)

| Command | Result |
|---|---|
| `npm run validate:openapi` | PASS (exit 0, draft.7) |
| `npm run test:contract` | 6 suites / 79 passed |
| `npm run verify:tow` | contract 79/79 + Tow 1045 passed / 75 skipped / 0 failures; PG stage RED ONLY on env startup (port 55432 held by foreign `akry-edge-pg`, never touched — see P3-1). Offline stages all PASS. |
| `npx jest tests/tow/mvp01 --runInBand` | 13 passed (+2 PG-skipped suites) / 124 passed, 10 skipped |
| `npx jest tests/tow/mvp02 --runInBand` | 5 / 204 passed |
| `npx jest tests/tow/mvp03 --runInBand` | 8 / 177 passed, 7 skipped |
| `npx jest tests/tow/mvp04 --runInBand` | 9 / 189 passed, 10 skipped |
| `npx jest tests/tow --runInBand` | 51 passed (+5 PG-skipped) / 1045 passed, 75 skipped, 0 failures |
| `npm run test:db-baseline` | GREEN on `DB_PORT=55434` (default port collided, see P3-1); fingerprint pin match ×2 |
| `npx jest --runInBand` | 85 passed (+5 PG-skipped) / 1486 passed, 75 skipped, **0 failures** |
| `test:pg:up + wait (DB_PORT=55434)` | healthy |
| `TOW_POSTGRES_E2E=1 … towMvp04Postgres.e2e` | **10/10** (×2 full runs + isolated C9) |
| `… dbBaseline.e2e` | **33/33** |
| `… towMvp03Postgres.e2e` | **7/7** |
| `towPostgres + g3TowPostgres (full creds)` | **9/9** |
| `npm run test:pg:down` | 0 containers / 0 volumes / 0 networks for `socorre-tow-test` |

No Supertest transport flake encountered in any run this session. One transient:
first PG mvp04 full run right after bring-up showed C8/C9 RED; both pass in
isolation and in two consecutive full reruns (warm-up timing, not a code defect;
recorded as P3-2). One methodology error of mine: running two PG suites in
parallel against one DB failed the baseline suite; sequential reruns are all
green (P3-3).

## 9. Scope — VERIFIED, no violations

Functional diff references to "counteroffer" are comment updates plus the
architecture test asserting NO counteroffer/tracking/payment/MVP-05 route leaks
(positive guard, passing). `routes.js` contains no counteroffer, payment,
tracking, payout, or dispute route. No `#31`/`#33`/VPS references in the
correction diff. Only files touched: tow module, tow/contract tests, composed
contract, evidence.

## 10. Evidence integrity — SPOT-CHECKS PASS

- `22-ext04-red.txt` (RED: partner/jobs 404; keyless accept → 200/ASSIGNED/1 row;
  keyless withdraw → 200/WITHDRAWN): corroborated against the pre-correction
  tree — `git show c8a602fd:…/routes.js` contains `partner/jobs` 0×;
  `assignment-service.js` contains `validateIdempotencyKey` 0×; `withdraw()` took
  no `idempotencyKey` param. Probe file deleted from tree. Claims TRUE.
- `24-ext04-negative-controls.md`: pre-mutation hashes equal live file hashes;
  my two reruns reproduced the documented RED counts exactly and restored
  byte-identically. Claims TRUE.
- `MVP-04-WORK-RESULT.md` "External Correction Pass": every technical claim
  (route wiring, exclusive token identity, same-authority read, inclusive bounds,
  guard ordering, replay semantics, draft.7, C7 fixture key, gate counts,
  disclosures) matches code I read and runs I performed. Gate counts I
  reproduced exactly (79 / 124 / 204 / 177 / 189 / 1045 / 1486 / 10 / 33 / 7 / 9 /
  fingerprint). The `verify:tow` GREEN claim differs only in that their PG stage
  ran while 55432 was free; my environment had it occupied (their own 09a/10a
  collision files disclose the same hazard), and I covered the PG ground with
  pinned-port runs. Claims TRUE (with that environmental note).

## Findings

- **P0: 0. P1: 0. Blocking P2: 0.**
- **P3 (documented, non-blocking):**
  - P3-1: Default PG port 55432 is occupied by the unrelated `akry-edge-pg`
    container in this environment, so `verify:tow`'s PG stage and
    `test:db-baseline` fail at container startup with defaults. Environmental,
    pre-disclosed by the executor (09a/10a files), worked around with
    `DB_PORT=55434`; all PG ground covered there. Suggest pinning a disposable
    port in the gate scripts.
  - P3-2: First PG mvp04 full run post-bring-up showed transient C8/C9 RED;
    green in isolation and in two consecutive full reruns. Timing warm-up, not code.
  - P3-3: Parallel PG suites against one DB interfere (my methodology error);
    sequential runs all green.
  - P3-4: `'/jobs'` removed from the architecture test's forbidden-substring
    list — necessary (new canonical `/partner/jobs` contains it) and safe
    (full `routes.js` read: no other jobs route). No action needed.

## Claims audited

19 verified / 0 falsified. Verified: docs-only `011a0a5c`; route wiring +
partner-only auth; token-exclusive identity; `tow_assignments` authority; shared
DTO (no fork); winner/loser/unrelated visibility; 401/403/anonymous behavior;
canonical list-response validation; customer↔partner assignment equality;
truthful state/page/limit/inclusive from-to; header read at controller; canonical
8–128 validator before mutation on both paths; 422 envelope + zero mutation;
structural replay (same + different key); withdraw state machine
(WITHDRAWN-replay 200 / ACCEPTED+CLOSED 409-not-actionable / expired 409-expired /
foreign 403 / header enforced on all paths); composed-document operation pins;
draft.7 + description + base convergence + `validate:openapi` green; no
speculative statuses; transaction/price/snapshot/occupancy preservation;
C1–C9 10/10 with DB as arbiter; 001..005 + fingerprint; 2 NC reruns RED→restore→
GREEN; scope; RED-evidence truth; work-result counts. Falsified: none.
