# MUSE — MVP-03 Adversarial Review (pre-merge, frozen tree)

- Role: adversarial reviewer (MUSE). Executor: DeepSeek V4.1 Flash (different model).
- Frozen SHA under review: `62494d38` (`62494d38ad54f96425951939a92b6c68d9423158`).
- Base: MVP-02 accepted main `c0ae3c01`. Branch: `feature/mvp-03-tow-request-matching`.
- Commits: `15f7f57a` (feature) → `4e0e296d` (docs) → `1756742e` (idempotency
  transport hardening) → `1bbfd13a` (pre-Muse hardening docs) →
  `62494d38` (correction-2: T01 e2e pin + 401 flake guard).
- Task: MVP-03 — Tow Request & Lean Geographic Matching (issue #15).
- Review date (UTC): 2026-09-20. Method: read plan + work result + evidence,
  full per-file diff audit, live gate execution, own negative-control re-runs.
- Standing: skepticism by default; every quantitative claim below was checked
  against code or a live run. Where the tree did not match the work result,
  it is said loudly (see F1).

## 0. Scope discipline — PASS (Tow-only)

`git diff c0ae3c01..62494d38 --stat`: 58 files, +10325/−43. Per-file review:

- Migrations: exactly one — `socorre_ai_backend/database/migrations/004_mvp03_tow_requests.js`.
  `down` drops only `tow_requests`. No legacy table touched (architecture test
  enforces this; verified the assertion logic, not just its result).
- Production source: confined to `socorre_ai_backend/src/modules/tow/**`
  (new: `domain/tow-request.js`, `domain/idempotency.js`, `domain/matching.js`,
  `application/tow-request-service.js`, `application/matching-service.js`,
  `application/list-query.js`, `adapters/persistence/tow-request-repository.js`,
  `http/tow-request-controller.js`; extended: `domain/geo.js`, `domain/errors.js`,
  `domain/index.js`, `application/index.js`, `application/ports.js`,
  `adapters/persistence/partner-repository.js`, `http/middleware.js`,
  `http/routes.js`, `http/serialize.js`, `composition.js`) plus the minimal
  `src/app.js` options-forwarding (`createApp(options)` → `createTowModule(options.tow || {})`;
  production calls `createApp()` with defaults only — test-injection path, no
  production behavior change).
- Harness mirrors of the migration (asserted to agree with it):
  `scripts/tow/db-baseline.js` (`REQUIRED_TABLES` + `tow_requests`),
  `scripts/tow/run-db-baseline-gate.js` (`PINNED_MIGRATIONS` + 004),
  `tests/helpers/testDb.js` (SQLite DDL), `tests/helpers/tow/mvp03.js` (new).
- Bookkeeping (disclosed, matches work-result §Bookkeeping):
  `docs/tow/TOW-TASK-GRAPH.yaml` (2 fields, old values preserved in comments),
  `docs/evidence/t01/db-baseline-gate.json` (regenerated gate output:
  fingerprint `f2771dcf…`, 33 tables/32 rows, 004 listed, port 55434).
- Two pre-existing test files extended additively (`dbBaselineSafety.test.js`
  pin 001–004; `mvp01/towPartnerRepository.test.js` + operational-location
  fields, original `toMatchObject({id, type})` preserved). `tests/tow/mvp02/**`
  untouched.
- MVP-04 / #16: NO (no proposal, counteroffer, assignment, state machine,
  scheduler, expiry). MVP-05/06: NO. #31 / #33: NO. VPS/deploy/prod/infra: NO
  (grep over the src/database/scripts diff for vps|deploy|docker|nginx|payment|
  wallet|debt|dispute hits only comments/enums pre-existing or explicitly
  out-of-scope). No `package.json` change → no new runtime dependency.
- Scope audit: MVP-04 NO | #33 NO | #31 NO | VPS NO.

## 1. Canonical TowRequest — PASS with P3 notes (F2, F6)

- Migration `004_mvp03_tow_requests.js:65-129`: 23 columns, `numeric` coords,
  CHECKs for state enum (11), terminal-reason enum-or-null, vehicle class,
  coordinate ranges, year [1900,2200], weight ≥ 1, radius > 0, non-empty
  problem description; `UNIQUE (customer_id, idempotency_key)`; FK
  `customer_id → users.id ON DELETE CASCADE`; indexes
  `(customer_id, created_at)` and `(state, created_at)`. Deterministic (no env,
  no clock, no seed). Correct per plan.
- Domain `tow-request.js`: creation can only produce `SEARCHING`
  (`buildTowRequestRecord` takes no state param — `tow-request.js:234-264`);
  frozen input shape with `additionalProperties: false` semantics
  (`rejectUnknownKeys`, `tow-request.js:102-108`); client price/distance
  rejected, never dropped (tested). DTO truthful (`allowed_actions: []`,
  `search_expires_at: null`, neutral payment, `assignment: null`).
- Service `tow-request-service.js:54-87`: module gate FIRST (before validation,
  before replay, before write), then validate → frozen radius snapshot →
  atomic `createIdempotent` → 409 on fingerprint mismatch. `getForCustomer`
  (`tow-request-service.js:89-108`): non-canonical id → 404 without touching
  the integer column; foreign row → 403 `not_request_owner` (existence
  disclosure is intentional and documented); unknown → 404. Two sequential
  queries is a deliberate, documented trade-off — reviewed, not a finding.
- Repository `tow-request-repository.js:188-217`: pre-read as optimisation,
  `UNIQUE` violation recovery as authority (`isUniqueViolation` covers pg
  `23505` + sqlite); loser re-reads winner and compares digests. Race analysis:
  on PG the loser of a concurrent insert always lands in the recovery branch;
  `if (!winner) throw error` fail-closed. No N+1 (single-row ops; list paths
  bounded by limit). `listSearchingCandidates` (`tow-request-repository.js:175-182`)
  capped, ordered oldest-first — deterministic.
- `list-query.js:54-92`: strict pagination (page ≥ 1, limit 1–100, 422 never
  silent fallback), bounded by construction. Opportunities endpoint passes
  `{ states: [] }` so any `?state=` there is a 422 — strict, correct.

## 2. Lean geographic matching — PASS with P3 notes (F3, F4, F5)

- `geo.js:128-148`: single `atan2` haversine primitive on IUGG
  `EARTH_MEAN_RADIUS_METERS = 6371008.8`. Pricing path untouched:
  `towRouteProviderBoundary.test.js` byte-identical per work result (hash
  quoted; mvp02 suite green in my runs), ban resolved by naming/ownership,
  not by relaxing the guard — verified the architecture test asserts single
  `node:crypto` ownership and layer purity.
- `isWithinRadius` (`geo.js:151-156`): inclusive boundary; radius ≤ 0 / NaN →
  false; non-operational points → false. Zero-radius and negative-radius
  semantics safe by construction.
- `evaluateTowMatch` (`matching.js:66-121`): order module → identity →
  availability → online → coordinates → MVP-01 eligibility → radius. Cheap
  checks first, distance computed only for eligible candidates. Radius applied
  against the request's FROZEN `matching_radius_km` (frozen-radius semantics
  real: NC-MVP03-3's second failing test proves per-request scoping).
  Tie-break `compareRequestIds` BigInt-safe (`matching.js:124-134`); ordering
  `selectMatches` pure, non-mutating.
- Eligibility composition genuine (not re-implemented): NC-MVP03-2 removes one
  branch → 8 failures per work result; `is_online` required per frozen
  contract addendum §2; `is_verified`/`approval_status` proven non-excluding
  by inclusion tests. `is_online` rationale is docs-only, no behavior change.
- Provider-call discipline: quote computed only for matched+paginated items;
  `routeProvider.callCount() === 0` on every exclusion path; provider failure
  → 503 with no partial feed (fail-closed, correct).
- Edge cases: antimeridian/poles handled conservatively in
  `boundingBoxForRadius`, but see F4 (helper only, unused in prod path).

## 3. Idempotency — PASS

- Key window 8–128, required header, 422 on missing/short/long
  (`idempotency.js:34-59`); canonical fingerprint source is a fixed-order JSON
  array over NORMALIZED input (`idempotency.js:69-96`) — immune to caller key
  order; `-23.5` vs `-23.50` collapse (same JS number). Radius correctly
  excluded (settings-derived, not payload). Fingerprint stored as sha256 hex
  only (`tow-request-repository.js:59-61`); raw payload never persisted
  (asserted by test).
- `1756742e` hardening audited in full: shared `http.createServer` + single
  `request.agent`, `closeAllConnections()` + `close()` teardown; retry exactly
  once and ONLY on transport errors (`ECONNRESET`/`ECONNREFUSED`/`EPIPE`/
  `socket hang up`); HTTP statuses never retried/tolerated; all 201 + one-id
  + one-row assertions unchanged. Evidence `13-idempotency-hardening-5x.txt`
  shows 5× 9/9 with mixed 201/409 traffic (409s are the conflict-path tests
  in the same file, not retries). No weakening — PASS.
- True-concurrency authority is the PG leg (NC-MVP03-4b); the work result
  honestly records that the offline suite cannot exercise the recovery branch
  (better-sqlite3 serializes). Correct and disclosed.

## 4. Authz + module gate — PASS (independently re-proven, §8)

- All four new endpoints gated: `POST/GET /tow/requests` and
  `GET /tow/requests/:requestId` → `auth, requireCustomer`
  (`routes.js:33-35`); `GET /tow/partner/opportunities` → `auth,
  requireTowPartner` (`routes.js:38`). `requireCustomer` rejects partner/admin
  with 403 (`middleware.js:36-44`); `requireTowPartner` requires role +
  `PARTNER_TYPE` + `partner_id` (`middleware.js:19-26`).
- Partner feed fixed by `req.user.partner_id` — no cross-partner query
  possible. Customer reads owner-scoped via `findByIdForCustomer` with
  `req.user.id`. No IDOR, no tenant leakage (single-tenant users table,
  per-customer scoping at repository level).
- Disabled gate: 409 `service_module_disabled`, persists nothing, evaluated
  before validation AND before replay (no validation-detail leak, no replay
  of old rows). Matches plan.

## 5. OpenAPI/contract — PASS

- Contract-first: endpoints pre-existed in the frozen contract
  (`docs/tow/tow-api-contract.openapi.yaml`: `/tow/requests` get+post,
  `/tow/partner/opportunities`, `IdempotencyKey` required 8–128 at
  `tow-api-contract.base.openapi.yaml:1064-1068`); no contract file needed
  changing — consistent with the diff (no contract yaml touched).
- Implementation matches the documented surface: 201 create / 200 reads /
  401 unauthenticated / 403 wrong-role-or-not-owner / 409 conflict+disabled /
  422 validation / 503 provider failure. `validate:openapi` PASS live
  (66 operations, 0 dropped methods, `/tow/requests base=[post]
  composed=[get,post] dropped=[]`); `test:contract` 62/62 live. No
  undocumented behavior found; download routes pre-date MVP-03 and are
  documented as future-contract candidates without changing the frozen file.

## 6. Correction-2 (`62494d38`) — PASS, closely audited

- C2-1 (T01 pin): `dbBaseline.e2e.test.js:44-49` pin now 001..004 with comment
  mirroring `run-db-baseline-gate.js PINNED_MIGRATIONS` and the offline
  `dbBaselineSafety` pin. Loud cross-check preserved: directory read intact
  (`:98-106`), `toEqual` intact, error prints the whole pin, synthetic
  smuggled-005 control present (`dbBaselineSafety.test.js:674-676`). No
  fingerprint hardcoded (run1-vs-run2 comparison kept). Live proof: T01 e2e
  33/33 GREEN on my run (was 5-failed state per `19-e2e-pin-fix.txt`,
  consistent). FIXED and verified.
- C2-2 (401 flake): `git show 62494d38 --stat` = 3 docs/evidence files + 2
  test files; ZERO production files — verified. `expectCreated`
  (`towRequestCreate.test.js`) keeps strict `expect(status).toBe(201)` on
  success, adds body/user/claims/nowSecret diagnostics only on failure, used
  at 3 call sites. No assertion relaxed.
- Root-cause claims in `20-401-flake-diagnosis.txt`: the REPORT is detailed
  and its stance ("reproduced at class level, exact trigger not pinned, NOT
  claimed fixed") is the honest one. I could NOT independently verify the
  removed instrumentation (morgan + auth.js logs are gone by design), so the
  "product excluded" conclusion is taken as well-evidenced-but-unreproducible
  by a third party. My own flake census (§7) is consistent with a real
  transport-level flake and shows zero MVP-03 involvement. The guard is
  diagnostics-only and appropriate; the recommended follow-up (shared server
  per file + load loop) is endorsed. No speculative fix was made — correct.

## 7. No weakened tests — PASS

- `git diff c0ae3c01..62494d38 | grep -E '\.only\(|\.skip\(|xdescribe\(|xit\(|xtest\('`
  → empty. `describe.skip` occurrences are the pre-existing opt-in-PG gating
  pattern. `toBeLessThan*` additions are new geo-math tolerances
  (0.5 m on a known 111194.93 m distance, boundary/bbox assertions) —
  legitimate float assertions, not widened tolerances (nothing pre-existing
  was widened). No removed assertions, no swallowed errors, no
  `.only`/`.skip` anywhere in the new suites (architecture test also scans
  for these and passes).

## 8. Negative controls — 2/2 independently re-run by MUSE

- NC-MVP03-1 (module gate bypass), re-run by me: backed up
  `tow-request-service.js` (sha recorded), replaced
  `await moduleService.assertNewBusinessAllowed();` with
  `await Promise.resolve();` → `towRequestCreate.test.js` RED with EXACTLY
  the 2 gate tests failing (`a disabled module refuses creation with 409
  service_module_disabled`; `the module gate runs before payload
  validation`), 24 passed. Restored via backup copy: `diff -q` identical,
  `git status` clean → re-run GREEN 26/26. Control is load-bearing — VERIFIED.
- Smuggled-005 detection (offline safety suite): `dbBaselineSafety.test.js`
  52/52 GREEN live, including the synthetic `005_smuggled_scope.js` rejection
  test. Detection intact after the C2-1 pin widening — VERIFIED.
- NC-MVP03-2/3/4/4b: not re-run (budget); the two re-runs above cover the
  highest-risk claims (gate load-bearing, pin cross-check loud). Their
  transcripts stand unrefuted.

## 9. Findings (no P1, no P2)

- F1 [P3 — work-result honesty, docs-only] `MVP-03-WORK-RESULT.md:97-99`
  claims "the lighter classes must not carry it [weight]". FALSIFIED:
  `tow-request.js:158-172` requires weight only for truck classes and places
  no upper restriction on light classes; `towRequestDomain.test.js:83-90`
  asserts a `light_vehicle` WITH `weight_kg: 1200` as the canonical valid
  payload. Code behavior (weight optional-but-allowed for light classes) is
  self-consistent and contract-conformant; only the prose overstates. Fix the
  sentence, not the code.
- F2 [P3 — harness fidelity] `tests/helpers/testDb.js` SQLite `tow_requests`
  DDL mirrors columns but NOT the CHECK constraints (no state-enum, coordinate
  range, or radius>0 checks). DB-level enforcement is therefore proven only on
  the PG leg. Disclosed nowhere. Suggest a comment or a PG-only constraint
  test; not a blocker (PG e2e covers round-trip + uniqueness authority).
- F3 [P3 — robustness] `geo.js:145-147`: haversine `a` is not clamped to
  [0,1]; a floating-point overshoot at near-antipodal points yields NaN via
  `sqrt(1-a)`. Fail-safe (NaN → non-candidate, never a false match), one-line
  clamp recommended.
- F4 [P3 — dead-code helper] `geo.js:166-184`: `boundingBoxForRadius` clamps
  min/max longitude independently to ±180, misrepresenting boxes that span
  the antimeridian. Unused in the production path (deliberately deferred
  bbox push-down); tests pin current behavior. Fix when/if it becomes load-
  bearing.
- F5 [P3 — contract accuracy edge] `matching-service.js:96-120`: `meta.total`
  counts matches AFTER the 500-candidate cap, so a >500-SEARCHING backlog
  understates the true total. Deterministic and documented cap; consider
  documenting that `total` is cap-bounded.
- F6 [P3 — fail-open formatting] `tow-request.js:271-285`: `toIsoInstant`
  returns the raw string when unparseable instead of null/throw. Reachable
  only for corrupt DB values; low risk.

## 10. Claims audited (spot-checks vs evidence/code/live runs)

| Claim (WORK-RESULT) | Result |
|---|---|
| `tests/tow/mvp03` 170 passed / 7 skipped / 177 | VERIFIED (my run: identical) |
| `tests/tow` 848 / 65 / 913, 0 failures | VERIFIED (my run: identical) |
| full jest 1272 / 65 / 1337, 0 failures | VERIFIED with flake note (5/6 green; 1 transient, §11) |
| `test:contract` 62/62; `validate:openapi` PASS, `/tow/requests` shadowing | VERIFIED (my runs) |
| T01 gate 33 tables / 32 rows / settings 25, fingerprint `f2771dcf…` both runs | VERIFIED (33/33 live; committed JSON matches) |
| `62494d38` touches no production file | VERIFIED (`--stat`: 3 evidence + 2 test files) |
| `expectCreated` keeps strict 201 | VERIFIED (diff: `expect(status).toBe(201)` retained) |
| hardening: 5× 9/9, no test added/removed | CONSISTENT (suite GREEN in my runs; 5x log plausible, not re-run) |
| NC table (counts per control) | PARTIALLY VERIFIED (NC-1 re-run: RED 2/file-scope vs doc 58-scope — consistent) |
| lighter classes "must not carry" weight | FALSIFIED (F1 — prose only) |
| 401 flake 4/20 under load, product excluded | PLAUSIBLE, stance honest; not independently reproducible (instrumentation removed) |

## 11. Live gates (run by MUSE in the worktree)

| Command | Result |
|---|---|
| `npm run validate:openapi` | PASS (OpenAPI 3.1.0, 66 ops, 0 dropped, 0 unresolved refs) |
| `npm run test:contract` | 5 suites / 62 tests PASS |
| `npx jest tests/tow/mvp03 --runInBand` | 170 passed / 7 skipped / 177 |
| `npx jest tests/tow --runInBand` | 848 passed / 65 skipped / 913, 0 failures |
| `npx jest --runInBand` (×6) | 5× 1272/65/1337 green; 1st run 1 failed (see flake note) |
| `DB_PORT=55434 npm run test:pg:up && ...:wait` | healthy |
| `DB_PORT=55434 TOW_POSTGRES_E2E=1 jest tests/tow/baseline/dbBaseline.e2e.test.js` | 33/33 (C2-1 verified) |
| `DB_PORT=55434 TOW_POSTGRES_E2E=1 jest tests/tow/mvp03/towMvp03Postgres.e2e.test.js` | 7/7 |
| `DB_HOST=... DB_PORT=55434 ... jest tests/tow/towPostgres.e2e.test.js tests/tow/g3TowPostgres.e2e.test.js` | 9/9 |
| `npm run test:pg:down` + docker filter check | 0 tow containers / volumes / networks |
| NC-MVP03-1 re-run (mutate → RED → restore → GREEN) | 2 failed (gate tests only) → 26/26; `diff -q` identical, tree clean |
| `dbBaselineSafety.test.js` (smuggled-005) | 52/52 |

Notes: (a) one T01 invocation without `DB_PORT=55434` failed with pg auth
error — my environment error (container lives on 55434), not a product
finding; corrected run 33/33. (b) PG commands above carry `DB_PORT=55434`
because the shared host has 55432/55433 occupied (same reason as the
executor's runs).

## 12. Flake assessment (honest)

A transport-level flake in the supertest harness is REAL and pre-existing:
the executor documents 4/20 loaded full-suite failures across legacy AND new
files (`towDocumentFlow`, `deliveryOrders`, `g2PhotoContract`,
`towRequestCreate`) with server-side proof the product answered correctly,
and I observed 1 transient full-suite failure in 6 unloaded runs. Against a
falsification attempt: NO MVP-03 suite failed in any of my runs (mvp03 green
6/6 including the observed-flake runs' siblings; PG legs green throughout),
and the single unidentified failure in my first full run cannot honestly be
attributed to any file (output truncated before the suite name was captured
— my procedural fault, recorded here rather than upgraded into a claim).
The executor's "NOT claimed fixed + permanent diagnostic guard" posture is
the correct one; the guard weakens nothing. Endorsed follow-up: single
shared `http.createServer` per test file + 20× load loop. This flake is NOT
a merge blocker for MVP-03: it is harness-level, predates the delivery,
and never manifests in focused or PG runs.

## 13. Verdict rationale

No P1 (correctness/safety/contract break) and no P2 found after a full diff
audit, live execution of every mandated gate, and two independent negative-
control re-runs. Six P3 findings: one falsified prose sentence (F1), four
robustness/harness notes (F2–F4, F6), one pagination-edge accuracy note (F5).
The frozen tree matches the work result everywhere else I checked, and where
it does not (F1) the code — not the claim — is correct. Correction-2 is
verified clean (test-only, assertions intact, pin fixed and proven).

Verdict: APPROVE_WITH_FINDINGS (all findings P3; none block merge).
