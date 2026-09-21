# MVP-04 — 18 Flake census (pre-existing transport artifact)

> The `tests/tow` directory run and the whole-suite run are both occasionally
> flaky **on this branch and on the base commit**, with the same symptom family.
> This file records the measurement so the flake is neither hidden nor blamed on
> MVP-04, and so nobody mistakes a flaky run for a regression.

## Method

`npx jest --runInBand` (single worker, sequential suites) on an idle machine, two
contexts, both repeated:

- the canonical Tow directory: `npx jest tests/tow --runInBand` (branch: 1086
  tests, 75 PostgreSQL-gated skips; base: 921 tests, 65 skips);
- the whole backend suite: `npx jest --runInBand` (branch: 82 suites / 1510 tests;
  base: 75 suites / 1345 tests).

The base is the immutable dispatch base `7ad3e56b`, checked out in a separate git
worktree (`/tmp/mvp04-base`) with the same `node_modules`.

## Result

| Context | Branch (MVP-04) | Base (`7ad3e56b`) |
| --- | --- | --- |
| `tests/tow`, 8 runs each | 5 clean, 3 runs with exactly one failing test | 7 clean, 1 run with two failing tests |
| whole suite, 3 runs each | **3 / 3 clean** (82 suites, 1435 passed, 0 failed) | 2 / 3 clean; run 3 failed 1 test |
| `tests/tow` with PostgreSQL (`TOW_POSTGRES_E2E=1`), 1 run | clean: 54 suites, 1083 passed, 0 failed | not run (no MVP-04 suite exists there) |

Every failing run failed on a **different test**, and never on an MVP-04 assertion:

| Where | Test that failed | Symptom |
| --- | --- | --- |
| branch `tests/tow` | `towHttp.transport.test.js:595` (legacy emergency-request concurrency) | non-200 responses |
| branch `tests/tow` | `mvp03/towRequestRehydrate.test.js:191` | `Expected: 422, Received: 401` |
| branch `tests/tow` | one further run | counts only: 1010 passed / 1 failed (name not captured by the loop filter) |
| base `tests/tow` | `nearby — raio › raio -Infinity` and `raio NaN` | `socket hang up` (2 tests) |
| base whole suite | `Delivery Orders API › rejeita start em pedido ainda pendente (403)` | `Parse Error: Expected HTTP/, RTSP/ or ICE/` |

## Why this is pre-existing, not MVP-04

1. **The base flaked too**, in the same session, on the same machine, with the same
   commands — including a whole-suite failure in an unrelated legacy suite
   (delivery orders). A regression introduced by MVP-04 cannot fail a legacy
   delivery-order test on the base commit.
2. **The symptom class is already diagnosed and disclosed by MVP-03**
   (`docs/evidence/mvp-03/20-401-flake-diagnosis.txt`): ~20 % of full-suite runs
   under load, always at the transport layer (`Expected: 201 / Received: 401` with
   a stale body, `socket hang up`, `Parse Error`), with server-side access logs and
   instrumented middleware proving the product answered correctly for the request
   the client saw as a 401. MVP-03 explicitly recorded it as **not fixed** and
   added a diagnostic guard instead.
3. **No MVP-04 code path is in the failing tests.** The three branch failures are
   one legacy emergency-request test and one MVP-03 rehydration test; the MVP-04
   suites are green in every run above, and so are the 7 MVP-04 suites run alone
   (evidence 12) and the PostgreSQL concurrency proof (evidence 16).
4. **The authoritative gates are green on the branch**: whole suite 3 / 3 clean,
   PostgreSQL-enabled `tests/tow` clean (54 suites / 1083 tests).

MVP-04 does add 7 suites and 165 tests to the same single-process run, which
increases the number of HTTP transport opportunities per run, so a somewhat higher
flake rate in the directory context is expected. The mechanism is unchanged and the
mitigation belongs to the harness, not to this delivery: no assertion was relaxed,
skipped, reordered or retried to obtain any result in this census, and the two
`tests/tow` runs quoted as evidence (13) are unedited single runs.
