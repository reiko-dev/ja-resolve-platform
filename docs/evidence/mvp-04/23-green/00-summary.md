# MVP-04 EXT — gate sweep (EXT-MVP04-1 / EXT-MVP04-2 / EXT-MVP04-3)

Frozen tree: `feature/mvp-04-proposals-assignment` at `c8a602fd` + the EXT
correction working tree (contract draft.7, `GET /tow/partner/jobs`, required
`Idempotency-Key`, operation-level contract suite). Every transcript in this
directory is the raw command output, captured after the last source/test edit
(the C7 fixture fix), except where a rerun is named explicitly.

Driver scripts stay outside the repository (`/tmp/nc-ext04/offline-gates.sh`,
`pg-gates.sh`, `pg-gates2.sh`, `final-evidence.sh`, `pg-suites.js`) for the same
reason as the MVP-04 negative-control driver: they orchestrate disposable
environments and are not part of the delivered code.

| # | Gate | Result | Artifact |
| --- | --- | --- | --- |
| 01 | `npm run validate:openapi` | **PASS** exit 0 — contract version `1.0.0-draft.7`, 56 composed paths / 66 operations, 0 unresolved refs, 0 duplicate operationIds, 0 dropped base methods, allowlist empty | `01-validate-openapi.txt` |
| 02 | `npm run test:contract` | **PASS** 6 suites / **79 tests** (62 before the EXT pass, +17 operation-level) | `02-test-contract.txt` |
| 03 | `npm run verify:tow` (`DB_PORT=55434`) | **GREEN** — structure PASS, contract 79/79, Tow suite 1045 passed / 75 skipped, PostgreSQL foundation 6/6, migrations 5, teardown clean | `03-verify-tow-rerun.txt` (first attempt: `03-verify-tow.txt`) |
| 04 | `npx jest tests/tow/mvp01 --runInBand` | **GREEN** 13 suites / 124 passed / 10 skipped | `04-mvp01.txt` |
| 05 | `npx jest tests/tow/mvp02 --runInBand` | **GREEN** 5 suites / 204 passed | `05-mvp02.txt` |
| 06 | `npx jest tests/tow/mvp03 --runInBand` | **GREEN** 8 suites / 177 passed / 7 skipped | `06-mvp03.txt` |
| 07 | `npx jest tests/tow/mvp04 --runInBand` | **GREEN** 9 suites / **189 passed** / 10 skipped (155 + 16 partner jobs + 18 idempotency) | `07-mvp04.txt` |
| 08 | `npx jest tests/tow --runInBand` | **GREEN** 51 suites / **1045 passed** / 75 skipped / 0 failures | `08-tow-suite.txt` (first attempt: `08a-tow-suite-flake-parse-error.txt`) |
| 09 | `DB_PORT=55434 npm run test:db-baseline` (run 1) | **GREEN** 35 tables / 33 rows / settings 25; run-1 and run-2 fingerprints identical `efb6158bf9df52434f8e21bfa6d15a98fa9a5ee02a0ca0ee13144dc9c27d9cdc` | `09-db-baseline-1.txt` |
| 10 | `DB_PORT=55434 npm run test:db-baseline` (run 2) | **GREEN** same fingerprint — schema unchanged, migrations still `001..005` | `10-db-baseline-2.txt` |
| 11 | `npx jest --runInBand` (whole backend) | **GREEN** 85 suites / **1486 passed** / 75 skipped / **0 failures** | `11-full-jest.txt` |
| 12 | PostgreSQL suites (`DB_PORT=55434`, `TOW_POSTGRES_E2E=1`) | **GREEN** MVP-04 C1–C9 **10/10**, T01 baseline **33/33**, MVP-03 **7/7**, legacy G2/G3 **9/9** (2 suites) | `13-postgres-suites.txt` |
| 13 | Teardown | **GREEN** `test:pg:guard` SAFE on `127.0.0.1:55434`, 0 containers / 0 volumes left for `socorre-tow-test` | `14-teardown.txt` |

## Disclosures

**Port collision (environmental, not a regression).** The first `test:db-baseline`
attempts and the first `verify:tow` attempt ran without `DB_PORT`, so the harness
defaulted to `55432`, which is already published by the unrelated `akry-edge-pg`
container (never touched). Both attempts failed at `docker compose up` with
`Bind for 0.0.0.0:55432 failed: port is already allocated` and tore their own
project down cleanly. Transcripts kept: `09a-…`, `10a-…` (baseline) and
`03-verify-tow.txt` (verify). Every rerun pins `DB_PORT=55434`, the disposable
port this delivery has always used.

**Transport flake (disclosed, rerun).** The first `verify:tow` attempt also hit
one `socket hang up` in the pre-existing `tests/tow/g2PhotoContract.test.js`, and
the first standalone `tests/tow` rerun hit one
`Parse Error: Expected HTTP/, RTSP/ or ICE/` in the pre-existing
`tests/tow/mvp04/towAssignmentAccept.test.js` — two of the three documented
Supertest transport signatures. Neither failure is in a new EXT test, both tests
pass in every other run (including the whole-backend run with 0 failures), and
the reruns are captured. No assertion was relaxed, skipped or retried for any
result.

**One fixture fix required by EXT-MVP04-2.** The PostgreSQL C7 test called
`proposalService.withdraw(...)` directly, bypassing the HTTP layer that now
carries the required header. The fixture now supplies an `Idempotency-Key` exactly
like the route does (`towMvp04Postgres.e2e.test.js`, commented in place); the
first PostgreSQL attempt is preserved in `13-postgres-suites.txt` history — 9/10
with C7 RED — and the rerun is 10/10. No production code and no assertion changed.

**Counts only grew.** `test:contract` 62 → 79, `mvp04` 155 → 189, `tests/tow`
1011 → 1045, whole backend 1435 → 1486. Nothing was deleted or weakened; the
only pre-existing assertions touched are the four `draft.6 → draft.7` version
pins.
