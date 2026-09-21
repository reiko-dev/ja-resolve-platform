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

## Flakes never silently accepted

Every non-green run in this delivery is listed above with its resolution. No failing business assertion was
re-run until it happened to pass.
