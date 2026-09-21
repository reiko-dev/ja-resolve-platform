# MVP-06 — Schema baseline

Date: 2026-09-21 · Command: `DB_PORT=55434 npm run test:db-baseline`

## Migrations

```text
001_baseline_schema.js
002_baseline_settings.js
003_mvp01_tow_foundation.js
004_mvp03_tow_requests.js
005_mvp04_proposals_assignments.js
006_mvp05_service_execution_tracking.js
007_mvp06_cash_payment.js        <-- added by MVP-06, the only new migration
```

No `008` exists. The pinned migration list in `scripts/tow/run-db-baseline-gate.js`,
`tests/tow/baseline/dbBaseline.e2e.test.js` and `tests/tow/baseline/dbBaselineSafety.test.js` was updated in the
same change, so a smuggled migration still fails the gate loudly.

## Deterministic reproduction (fresh disposable PostgreSQL 14)

```text
[db-gate] stage 2/9: verify the database is empty
[db-gate] database is empty (0 tables) — new disposable volume confirmed
[db-gate] stage 3/9: migrate from zero
[db-gate] migrations applied: 001..007 (batch 1)
[db-gate] stage 4/9: seed the default administrator
[db-gate] stage 5/9: assert the clean baseline
[db-gate] baseline OK: 37 tables, 35 row(s), settings=25
[db-gate] stage 6/9: schema snapshot (run 1)
[db-gate] run 1 fingerprint: a5605ba9d71f214fb9b289e4d57001099119a2052a2ff5d4d67d66500446e999
[db-gate] stage 7/9: guarded destructive reset + repeat
[db-gate] guarded reset dropped 37 table(s)
[db-gate] repeat OK: 37 tables, 35 row(s)
[db-gate] stage 8/9: schema snapshot (run 2) + fingerprint comparison
[db-gate] run 2 fingerprint: a5605ba9d71f214fb9b289e4d57001099119a2052a2ff5d4d67d66500446e999
[db-gate] fingerprints identical: reset+migrate+seed reproduces the same schema
[db-gate] teardown verified: no container/volume/network left (0/0/0)
[db-gate] GREEN
```

| Item | MVP-05 accepted | MVP-06 |
| --- | --- | --- |
| migrations | 001..006 | **001..007** |
| tables | 36 | **37** |
| fingerprint | `2d51315075542832bbc4d5effa78ae83be05fc51f342cc0b0a7cc9ba78b35834` | `a5605ba9d71f214fb9b289e4d57001099119a2052a2ff5d4d67d66500446e999` |
| deterministic across reset+migrate+seed | yes | yes (two identical runs) |
| rows after seed | 34 | 35 (one more `knex_migrations` row for `007`) |

The delta is exactly one table (`tow_payments`) and one migration row. Nothing was dropped, renamed or
re-typed.

## Fresh database + seed acceptance

The gate itself is the fresh-DB proof: stage 2 asserts a genuinely empty database (0 tables), stage 3 migrates
from zero, stage 4 seeds the default administrator, stage 5 asserts the clean baseline (required tables, exactly
one admin, 25 settings), and stages 6–8 prove the schema is reproducible from zero. No fixture outside the
repository or the harness is used, and no manual data patch exists.

## Teardown

```text
containers = 0
volumes    = 0
networks   = 0
```

for the disposable Tow project `socorre-tow-test-55434-cb0d0933`. The unrelated `akry-*` infrastructure was
never touched (5 `akry-*` containers were running before and after every gate).
