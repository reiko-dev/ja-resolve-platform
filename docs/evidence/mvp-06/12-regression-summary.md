# MVP-06 — Regression summary

Date: 2026-09-21 · Branch: `feature/mvp-06-cash-readiness`

All counts are from the MVP-06 tree over the deterministic SQLite harness unless noted. Inherited floors come
from the accepted MVP-05 receipt; no accepted pass disappeared.

## Focused suites

| Suite | MVP-06 | MVP-05 floor | Status |
| --- | --- | --- | --- |
| `npm run validate:openapi` | PASS (contract `1.0.0-draft.9`) | PASS | preserved |
| `npm run test:contract` | 7 suites / **95 passed** | ≥ 95 | preserved exactly |
| `npx jest tests/tow/mvp01` | **124 passed** / 10 skipped | ≥ 124 | preserved exactly |
| `npx jest tests/tow/mvp02` | **204 passed** | ≥ 204 | preserved exactly |
| `npx jest tests/tow/mvp03` | **177 passed** / 7 skipped | ≥ 177 | preserved exactly |
| `npx jest tests/tow/mvp04` | **189 passed** / 10 skipped | ≥ 189 | preserved exactly |
| `npx jest tests/tow/mvp05` | **89 passed** / 6 skipped | ≥ 89 | preserved exactly |
| `npx jest tests/tow/mvp06` | **75 passed** / 9 skipped | new | added |
| `npx jest tests/tow` | **1209 passed** / 90 skipped / 0 failed | ≥ 1134 | +75 |
| `npx jest --runInBand` | 97 suites / **1666 passed** / 90 skipped / 0 failed | ≥ 1591 | +75 |
| `DB_PORT=55434 npm run test:db-baseline` | GREEN | GREEN | preserved |

## Why the counts grew and nothing was weakened

The +75 tests are exactly the new MVP-06 suites:

| Suite | Tests |
| --- | --- |
| `towMvp06CashPayment.test.js` | 23 |
| `towMvp06Readiness.test.js` (S01–S20) | 20 |
| `towMvp06Attack.test.js` (gauntlet) | 9 |
| `towMvp06Architecture.test.js` | 23 |
| **offline total** | **75** |
| `towMvp06Postgres.e2e.test.js` (F1–F6 + DB guards) | 9 (opt-in, PG only) |

Three inherited suites were edited, each for a reason that is additive or a deliberate, documented revision:

1. `tests/tow/mvp03/towMvp03Architecture.test.js` and `tests/tow/mvp04/towMvp04Architecture.test.js`: the
   `tow_payments` table was removed from their forbidden-table lists, because MVP-06 now **owns** that table.
   The bans for everything still unimplemented (`tow_audit_events`, `tow_request_snapshots`, `tow_tracking`,
   the legacy `payments`/`tow_proposals`) remain, and the MVP-06 architecture suite asserts them positively.
   Test counts unchanged (109 passed across the three baseline suites).
2. `tests/tow/baseline/dbBaselineSafety.test.js`, `tests/tow/baseline/dbBaseline.e2e.test.js` and
   `scripts/tow/run-db-baseline-gate.js`: the pinned migration list gained `007_mvp06_cash_payment.js`. The
   "smuggled migration fails loudly" assertions remain and still test an unexpected `006_smuggled_scope.js`.
3. Seven contract suites pinned the canonical version to `1.0.0-draft.8`; the canonical revision is now
   `1.0.0-draft.9` (see `02-contract-audit.md` §4). Only the literal version string changed; every
   shape/semantic assertion is untouched.

No test was deleted, skipped or scoped down. No accepted assertion changed its meaning.

## Flake observed once and re-verified

`npx jest tests/tow` reported `1 failed` immediately after the negative-control session (the failing test was
`MVP-01 API — Tow foundation › module status and toggle › admin toggle disables new business and is
idempotent`, asserting the toggle's `disabled_reason` metadata). The same suite then passed 4/4 consecutive
runs and the full `tests/tow` batch passed 4/4 consecutive runs, as did full Jest. Root cause is the shared
SQLite harness file retaining a module row between the mutation session and the batch; the gauntlet suite now
restores the module to enabled so it cannot leak state. Both results are preserved in `18-flake-census.md`.
