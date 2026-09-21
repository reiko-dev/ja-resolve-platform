# MVP-05 — 12 Regression Summary

> Every gate run for this delivery, with the raw transcript that carries it. The
> rule applied throughout: **no inherited suite was modified to accommodate
> MVP-05**, and no assertion was waived.

## The delivery's own gates

| gate | command | result | transcript |
| --- | --- | --- | --- |
| MVP-05 offline suites (7 files) | `npx jest tests/tow/mvp05 --runInBand` | **7 passed / 1 skipped** (the PG-gated file) — 89 passed, 6 skipped, 0 failed | `16-gates-quick.txt` |
| MVP-05 architecture suite | inside the above | **29 / 29** | `16-gates-quick.txt` |
| MVP-05 operation-contract suite | `npx jest tests/contract --runInBand` | 16/16 (of 95 passed, 7 suites, 0 failed) | `16-gates-quick.txt` |
| OpenAPI validity + composition | `npm run validate:openapi` | PASS — `allowlist: (empty — the frozen contract drops no base method)` | `16-gates-quick.txt` |
| MVP-05 PostgreSQL gate E1–E6 | canonical PG env on 55434, `towMvp05Postgres.e2e.test.js` | **6 passed / 6** | `17-postgres-mvp05.txt` |
| Tow directory with PostgreSQL enabled | canonical PG env on 55434, `npx jest tests/tow --runInBand` | **64 suites, 1212 passed, 0 failed** | `21-postgres-tow.txt` |
| Tow directory offline ×3 | `npx jest tests/tow --runInBand` | 3/3 clean — 1134 passed, 81 skipped, 0 failed each | `20-full-jest.txt` |
| Full jest offline | `npx jest --runInBand` | **93 suites, 1591 passed, 81 skipped, 0 failed** (after the transport hardening; the two earlier artifact runs are preserved in `19-full-jest-artifacts.txt`) | `20-full-jest.txt` |
| db-baseline gate | `DB_PORT=55434 npm run test:db-baseline` | **GREEN** — 6 migrations from zero, 36 tables, fingerprint `2d513150…` × 2 identical, teardown verified | `23-baseline-gate.txt` |
| End-to-end verifier | `DB_PORT=55434 npm run verify:tow` | **GREEN** — OpenAPI structure, contract suite, focused Tow suite, migrate-from-zero, PostgreSQL foundation gate | `24-verify-tow.txt` |
| Teardown | `DB_PORT=55434 npm run test:pg:down` + final census | containers 0 / volumes 0 / networks 0 | `22-teardown.txt`, `25-final-teardown.txt` |

## Inherited PostgreSQL gates (canonical env, port 55434)

The MVP-04, MVP-03 and legacy PostgreSQL cases run inside the 64-suite / 1212-test
Tow directory run above, with the real migrations applied by the repository's own
harness:

| inherited gate | result | transcript |
| --- | --- | --- |
| MVP-04 C1–C9 (`tests/tow/mvp04/towMvp04Postgres.e2e.test.js`) | GREEN | `21-postgres-tow.txt` |
| MVP-03 PostgreSQL (`towPartnerOpportunities` PG cases) | GREEN | `21-postgres-tow.txt` |
| legacy `towPostgres.e2e.test.js`, `g3TowPostgres.e2e.test.js` | GREEN | `21-postgres-tow.txt` |
| MVP-05 E1–E6 | GREEN — 6/6 | `17-postgres-mvp05.txt` |
| T01 foundation gate (`DB_PORT=55434 npm run test:pg`) | **GREEN** — `towPostgresFoundation.e2e.test.js` 6/6, migrate-from-zero (6 migrations, 36 tables), container destroyed, 0 left | `26-postgres-foundation.txt` |
| clean-database baseline gate (`DB_PORT=55434 npm run test:db-baseline`) | **GREEN** — 36 tables, fingerprint `2d513150…` × 2 identical | `23-baseline-gate.txt` |

The MVP-05 migration is additive: it appends 8 nullable columns to `tow_requests`,
adds 11 CHECK constraints and creates `tow_request_tracking`. No legacy table,
column or constraint is altered, so no inherited suite needed a change.

## The full-jest artifact runs, and the fix

`npx jest --runInBand` (all 99 suites, 1672 tests) needed three attempts. The two
earlier attempts are preserved verbatim in `19-full-jest-artifacts.txt`:

| attempt | result | failure |
| --- | --- | --- |
| 1 | 1590 passed / 81 skipped / **1 failed** | `tests/tow/towDocumentFlow.test.js` — the legacy flake documented by MVP-03 §11 and MVP-04's review ("1 legacy flake → rerun GREEN") |
| 2 | 1589 passed / 81 skipped / **2 failed** | `tests/contract/towMvp05OperationContract.test.js` — an empty 401 body and a `Parse Error`, i.e. the documented stale-401 / transport signatures. Server-side proof in the same log: the access line `"POST /api/tow/requests/1/en-route HTTP/1.1" 401 60` shows the 401 body **was** written (60 bytes); the client misread it |
| 3 | **1591 passed / 81 skipped / 0 failed — 93 suites, GREEN** | — |

Attempt 2 was in this delivery's own contract suite, so it was fixed rather than
explained away: the eight MVP-05 test files now create **one real listening server
per suite** (`createApp({...}).listen(0)`, closed in `afterAll`) instead of
supertest opening and closing an ephemeral server for every request — the churn
that produces stale responses under a full-suite run. **No assertion was changed**;
the same statuses, bodies, schemas and DB rows are asserted. The PostgreSQL gate,
the Tow directory and the contract suite were all re-run after the change
(`17-21-postgres.txt`, `20-full-jest.txt`).

## What is asserted about MVP-05 in every one of those runs

- `ASSIGNED → EN_ROUTE → ARRIVED → IN_TRANSIT → COMPLETED` is the only forward
  path, terminal `CANCELLED`, everything else 409 `invalid_tow_transition`;
- the assigned partner is the only writer of a milestone; the owning customer and
  the assigned partner are the only readers of tracking;
- cancellation is legal in `ASSIGNED`/`EN_ROUTE`/`ARRIVED` for both actors and
  illegal in `IN_TRANSIT`/`COMPLETED`/`SEARCHING`;
- a terminal state releases the assignment once, with the matching
  `release_reason`;
- execution/tracking/cancellation keep working after the module is disabled;
- `Idempotency-Key` is validated (422) before any mutation, and a replay writes
  nothing;
- one current tracking point per request, monotonic, no history.
