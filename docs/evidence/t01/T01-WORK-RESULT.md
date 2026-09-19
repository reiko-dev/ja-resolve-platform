# T01 — Work Result

> Every claim in this file is backed by a command whose output is captured under
> `docs/evidence/t01/`.

```
task: T01
task_title: "Clean Database Baseline, Reset & Admin Seed"
issue: 12
epic: 10
depends_on: "T00 (#11, PR #30 — accepted/merged)"
repository: reiko-dev/ja-resolve-platform
branch: feature/t01-clean-db-baseline
execution_base: 4e8b1e9b6461a273eab6881e75516b6b81e6bdac   # HEAD == main at dispatch
implementation_head: b0d668f1f576d18f3dbfd29cae606074aa526374
implementation_head_note: >-
  Functional commit `feat(t01): clean database baseline, guarded reset and
  admin-only seed` (88 files). The receipt commit follows it and touches only
  this file, so `receipt_head` is deliberately not written here: read it from
  the branch head (`git rev-parse HEAD` after the receipt commit).
previous_result_head: 4e8b1e9b6461a273eab6881e75516b6b81e6bdac
history_rewrite_performed: false
force_push_performed: false
pushed: false
pr_created: false
merged: false

result: PASS
```

## 1. Scope check

| Check | Value |
| --- | --- |
| T02+ implemented | **no** — no Tow v1 table, column, endpoint, service or business rule was created |
| Business behavior changed | **no** — the only `src/` change is the migration/seeds directory resolution in `src/config/database.js` |
| Production / VPS touched | **no** — no connection to any production database; no PM2/Nginx/deploy/DNS action |
| Production data changed | **no** |
| Schema changed without justification | **no** — the snapshot diff against the legacy schema has exactly 7 entries, all listed in §5 |
| Legacy domain tables removed | **no** — all 29 tables (27 domain + 2 Knex control) still exist; `mechanics`, `categories`, `services`, `appointments`, `chat_messages` preserved |
| Real secret in the repository | **no** — the admin seed has no fallback password; the gate generates disposable credentials at runtime |
| Issue #31 touched (rotation / history rewrite / `.env.bak` / secret reading) | **no** — deferred, untouched |
| `git add -A` used | **no** — every path was added explicitly |
| Push / PR / merge | **no** — branch is local, PR not opened, nothing merged |
| Other Docker projects touched | **no** — only the T00 Compose project `socorre-tow-test-55432-cb0d0933` |

## 2. Deliverables — code

| Deliverable | Artifact |
| --- | --- |
| Baseline / reset strategy | `docs/tow/T01-DATABASE-BASELINE-DECISION.md` (§4, §5, §7, §8) |
| Clean migrations from zero | `database/migrations/001_baseline_schema.js`, `database/migrations/002_baseline_settings.js` |
| Controlled disposition of the incompatible migrations | `database/migrations-legacy/` (43 files) + `README.md`; disposition table in the decision doc §5 |
| Archived legacy seeds | `database/seeds-legacy/` (5 files) + `README.md` |
| Idempotent admin-only seed | `database/seeds/001_admin.js` → `scripts/tow/admin-seed.js` |
| Reset / migrate / seed / assert / snapshot commands | `scripts/tow/db-reset.js`, `db-migrate.js`, `db-seed.js`, `db-baseline.js`, `schema-snapshot.js`; npm scripts `db:reset`, `db:migrate`, `db:seed`, `db:assert`, `db:snapshot` |
| Fundamental constraints and indexes | `001_baseline_schema.js` (77 FKs, 6 UNIQUE, 39 CHECK, expression/partial unique indexes) |
| Mechanism against accidental destructive reset | `scripts/tow/db-reset-guard.js` + `db-connection.js` (`db:guard` pre-flight, no bypass flag) |
| Integration with the T00 Docker test runtime | `scripts/tow/run-db-baseline-gate.js` reuses `test-env.js`, `docker-compose.test.yml`, `pg-guard.js` (no harness duplication) |
| Gate that creates a new PostgreSQL, migrates, seeds, asserts and destroys it | `npm run test:db-baseline` |
| Single source of truth for the migration/seed directories | `src/config/database.js` (was pointing at a non-existent directory — RED-6) |

## 3. Deliverables — documentation

| Document | Content |
| --- | --- |
| `docs/tow/database-baseline.md` | pre-conditions, allowed environments, migrate/seed order, admin seed env vars, rollback/recovery, **explicit destructive warning**, Docker gate, troubleshooting |
| `docs/tow/database-schema.md` | complete schema listing (29 tables, 692 columns, FKs, uniques, checks, indexes) + dependency diagram + fingerprint |
| `docs/tow/T01-DATABASE-BASELINE-DECISION.md` | current state, RED problems, required tables, migration strategy, per-migration disposition, admin seed strategy, reset safety model, fresh-container strategy, risks, recorded decisions |
| `docs/tow/README.md`, `docs/tow/T00-TEST-HARNESS.md` | index and canonical-command updates |

## 4. Test results

| Suite | Command | Result |
| --- | --- | --- |
| SAFETY (offline) | `npx jest tests/tow/baseline/dbBaselineSafety.test.js` | **24/24 PASS** |
| SEED (offline) | `npx jest tests/tow/baseline/adminSeed.test.js` | **16/16 PASS** |
| SNAPSHOT (offline) | `npx jest tests/tow/baseline/schemaSnapshot.test.js` | **11/11 PASS** |
| MIGRATION + DATABASE + SEED + SAFETY (real PostgreSQL) | `TOW_POSTGRES_E2E=1 npx jest tests/tow/baseline/dbBaseline.e2e.test.js` | **28/28 PASS** |
| All T01 suites together | `TOW_POSTGRES_E2E=1 npx jest tests/tow/baseline` | **4 suites, 79/79 PASS** |
| Clean-database gate | `npm run test:db-baseline` | **GREEN ×3** (runs 1, 2 and the final run on the committed tree) |
| Negative controls | mutate → run → restore (sha256 verified) | **6/6 RED as expected** |

What the MIGRATION suite proves (real PostgreSQL, disposable container):

- empty database → `migrate` latest with no error, from a **new volume** (0 tables asserted first);
- reset + migrate + seed + assert is repeatable and produces the **same fingerprint**
  (`0e4e8ed825fb1629a1474f590ae5dc1c779685ecb927acbae038276cdfea4926`);
- no dependence on legacy data: nothing is copied from `mechanics`/`services`;
- destroy volume and repeat → same result (runs 1, 2 and 3 all identical);
- the active migrations directory contains exactly the two baseline files.

What the DATABASE suite proves: FKs reject invalid references (including the new
`wallet_transactions.dispute_id`), UNIQUE constraints are really applied (including the
case-insensitive e-mail index), CHECK/NOT NULL are applied, the expected indexes exist and the
5 redundant legacy indexes do **not** exist.

What the SEED suite proves: exactly one administrator and nothing else functional; a repeated
seed creates no duplicate and does not rotate the password; a second user (even non-admin) is
rejected by the assertion; credentials are required from the environment; no source file of the
seed path contains a hardcoded credential.

What the SAFETY suite proves: reset fails when the environment is not authorized; production can
never be reached (`NODE_ENV=production`, `prod`/`live`/`vps`/`homolog`/`staging` names, remote
hosts, wildcard binds, privileged users, `DATABASE_URL`); no production/VPS volume is used by the
gate; there is no bypass flag.

## 5. Equivalence with the legacy schema (no silent drift)

| Metric | Legacy chain (43 migrations) | T01 baseline | Delta |
| --- | --- | --- | --- |
| Tables | 29 | 29 | 0 |
| Columns | 692 | 692 | 0 |
| Foreign keys | 76 | 77 | +1 (`wallet_transactions_dispute_id_foreign`) |
| UNIQUE constraints | 6 | 6 | 0 |
| CHECK constraints | 39 | 39 | 0 |
| Indexes | 167 | 163 | +1 added / −5 redundant |
| Enums | 0 | 0 | 0 |
| Sequences | 28 | 28 | 0 |

The 7 intentional deltas are enumerated in `docs/evidence/t01/schema-legacy-vs-baseline.txt`:
the missing `wallet_transactions.dispute_id` FK (RED-2) plus its index, and the removal of 5
indexes that merely duplicated existing UNIQUE constraints.

## 6. Evidence index

| Evidence | Artifact |
| --- | --- |
| T00 regression before the change | `docs/evidence/t01/00-pre-change-regression.txt` |
| RED probe of the old baseline (RED-1..RED-6) | `docs/evidence/t01/01-red-probe-before-fix.txt` |
| Gate run 1 / run 2 | `docs/evidence/t01/02-clean-database-gate-run1.txt`, `03-clean-database-gate-run2.txt` |
| Gate run on the committed tree | `docs/evidence/t01/06-final-gate-committed-state.txt` |
| Negative controls (falsifiability) | `docs/evidence/t01/04-negative-controls.txt` |
| T00 regression after the change | `docs/evidence/t01/05-post-change-regression.txt` |
| Schema snapshot of the baseline (and byte-identical recompute) | `docs/evidence/t01/schema-baseline.json`, `schema-baseline-fresh.json` |
| Schema snapshot of the legacy chain + comparison | `docs/evidence/t01/schema-legacy-chain.json`, `schema-legacy-vs-baseline.txt`, `schema-legacy-chain.summary.txt` |
| Structured gate result | `docs/evidence/t01/db-baseline-gate.json` |
| Structural settings captured from the real database | `docs/evidence/t01/baseline-settings.json` |

## 7. No regression in T00

| Command | Before | After | Verdict |
| --- | --- | --- | --- |
| `npm run validate:openapi` | PASS | PASS | no regression |
| `npm run test:contract` | 5 suites / 62 tests | 5 suites / 62 tests | no regression |
| `npx jest tests/tow` (offline) | 2 skipped / 13 passed suites · 15 skipped / 272 passed | 3 skipped / 16 passed suites · 43 skipped / 323 passed | +3 T01 suites, +51 T01 tests |
| `npm run verify:tow` | GREEN (5 gates) | GREEN (5 gates) | no regression |
| `npx jest` (full) | 2 skipped / 46 passed suites · 15 skipped / 696 passed | 3 skipped / 49 passed suites · 43 skipped / 747 passed | +3 T01 suites, +51 passed, +28 e2e skipped (opt-in) |

`tests/tow/g2PhotoContract.test.js` was updated (3 require paths) because migration `045` moved to
`database/migrations-legacy/`; the test still passes and no assertion changed.

## 8. Definition of Done

| DoD item | Status | Evidence |
| --- | --- | --- |
| Own PR with `Closes #12` | **pending (executor stops before PR)** | branch `feature/t01-clean-db-baseline`, implementation head `b0d668f1`; PR title/body prepared: `T01 — Clean Database Baseline, Reset & Admin Seed` / `Closes #12` |
| Evidence `fresh container → migrate → seed → assertions → destroy → repeat` | **done** | `02-`, `03-`, `06-` gate transcripts + `db-baseline-gate.json` |
| MIGRATION suite green | **done** | 28 e2e tests (incl. MIGRATION group) + 3 gate runs |
| DATABASE suite green | **done** | e2e DATABASE group (FK/unique/check/not-null/indexes) |
| SEED suite green | **done** | 16 offline + e2e SEED group |
| SAFETY suite green | **done** | 24 offline + e2e SAFETY group + 6 negative controls |
| Operational docs versioned | **done** | `database-baseline.md`, `database-schema.md`, `T01-DATABASE-BASELINE-DECISION.md`, README/harness updates |
| Tests demonstrate the old baseline's problems (TDD RED) | **done** | `01-red-probe-before-fix.txt` (RED-1..RED-6) captured before the restructuring |

## 9. Hard stops

None triggered:

| Hard stop | Status |
| --- | --- |
| Fresh database does not boot | not triggered — gate GREEN ×3 from a brand new volume |
| Reset guard can reach production | not triggered — production/remote/privileged/`DATABASE_URL` targets are refused, no bypass |
| Seed has a hardcoded secret | not triggered — `ADMIN_EMAIL`/`ADMIN_PASSWORD` are mandatory, no fallback, hygiene test green |
| Seed creates functional data beyond the admin | not triggered — assertion fails on any second user or any functional row |
| Migrations depend on historical data | not triggered — migration `015` was dropped and archived; migrations contain no `.insert`/`.del`/`.update` |
| Unjustified schema changes | not triggered — 7 documented deltas, everything else identical |
| T00 regressed | not triggered — see §7 |

## 10. Known risks and follow-ups

- The string `admin123` still appears in the repository only as (a) the archived legacy seed
  (`database/seeds-legacy/initial_data.js`, already in the history before T01), (b) the denylist
  entry in `admin-seed.js` and (c) the RED evidence that documents its removal. It is not a live
  credential and cannot be used by the baseline seed. Issue #31 (secret rotation) remains deferred.
- Old databases are upgraded by an authorized reset, not by incremental migration; this is a
  deliberate decision of Issue #12 and is documented in `database-baseline.md` §6.
- `reviews.entity_id` stays a polymorphic reference (no simple FK possible); documented as a
  conscious exception in `database-schema.md` §4.1.
- The 5 removed redundant indexes reduce write amplification but change the index set; a future
  performance review should confirm no query depended on them (they duplicated UNIQUE constraints,
  so the planner can use those instead).

## 11. Status

```
T01 EXECUTOR GREEN — READY FOR MUSE REVIEW
```
