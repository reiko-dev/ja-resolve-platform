# T01 — Targeted Muse adversarial review (post external-review correction)

```text
verdict: APPROVE
reviewed_head: 15f6e3c27ffc06d0a33ab55c6c5f0b7970b8262b
reviewer: Muse Sparks 1.3 Free (static pass + live verification pass)
scope: PR #32 correction delta f2c26279..15f6e3c2 (external review P1)
```

## Summary

All live gates pass at HEAD `15f6e3c2` with zero failures and results identical to the recorded correction
baselines (fresh-gate fingerprint `0e4e8ed825fb1629a1474f590ae5dc1c779685ecb927acbae038276cdfea4926` matches
exactly; live e2e 33/33; full suite 771 passed / 48 skipped). The two known P3 notes (MTC-1 unauthenticated
`createConnectionForTarget` export, MTC-2 `disposableAdminCredentials` re-export) remain accepted
defense-in-depth items with no reachable DROP path — confirmed live by the misuse-refusal probe and the
`DROP SCHEMA` scan. No regressions; worktree left clean, no containers left over.

## Findings

| id | severity | location | evidence | required_fix |
|---|---|---|---|---|
| MTC-1 | P3 | `scripts/tow/db-connection.js` (`createConnectionForTarget` export) | Export is reachable without prior authorization, but live probes confirm no exported path reaches the DROP primitive (safety test “the destructive primitive is NOT exported and no export reaches it” passed; misuse probe throws `RESET_API_MISUSE`). | None blocking; optionally make the export private or bind it to an authorized target in a follow-up. |
| MTC-2 | P3 | `run-db-baseline-gate.js` re-export of `disposableAdminCredentials` | Credential-literal scan (`grep -rn "Disposable!"`, excl. node_modules) returns zero hits; fixture credentials are generated per run (`gate-admin-<random>@example.test`). | None blocking; optionally narrow the re-export in a follow-up. |

No P0, P1 or P2 findings were found.

## Live checks (real commands + observed output)

- **safety_suite_live**: `npx jest tests/tow/baseline/dbBaselineSafety.test.js --runInBand` → 1 suite passed,
  **48/48** tests passed (RESET-DIRECT-4/5/6/7/8, eligibility centralization, no `--allow-existing` hatch).
- **fresh_gate_live**: `npm run test:db-baseline` → **GREEN**. New disposable volume confirmed (0 tables) →
  migrate `001_baseline_schema.js` + `002_baseline_settings.js` → seed `gate-admin-30686084@example.test` (id=1)
  → baseline OK (29 tables, 29 rows, settings=25) → run 1 fingerprint `0e4e8ed8…f4926` → **guarded** reset
  dropped 29 tables → repeat OK (29/29) → run 2 fingerprint identical → teardown verified (no
  container/volume/network left). Fingerprint matches the recorded correction value exactly.
- **live_pg_e2e**: `npm run test:pg:up && npm run test:pg:wait` (healthy) →
  `TOW_POSTGRES_E2E=1 npx jest tests/tow/baseline/dbBaseline.e2e.test.js --runInBand` → **33/33 passed**
  (incl. live RESET-DIRECT-1/7/8 and reset+migrate+seed+assert repeatability) → `npm run test:pg:down`.
- **t00_regression_live**: `validate:openapi` PASS (JSON Schema errors 0, TowSettingsPatch errors 0);
  `test:contract` 5 suites / 62 tests; `npx jest tests/tow` 16 passed / 3 skipped suites, 347 passed /
  48 skipped; `verify:tow` GREEN (incl. PostgreSQL foundation gate 6/6, teardown done).
- **full_regression_live**: `npx jest --runInBand` → 49 passed / 3 skipped suites, **771 passed / 48 skipped,
  0 failures** — matches the recorded baseline exactly.
- **drop_schema_paths**: `grep -rn "DROP SCHEMA" scripts/tow/` → single hit `scripts/tow/db-reset.js` (the
  private primitive). No other DROP path.
- **misuse_refusal_probe**: `await resetDatabase(<fake Knex>)` (no DB) → rejects with `RESET_API_MISUSE`.
- **credential_literal_scan**: `grep -rn "Disposable!"` (repo, excl. node_modules) → zero hits.
- **leftovers**: `docker ps -a | grep socorre-tow-test` → none; `git status --short` → clean (the gate's
  run-specific rewrite of `db-baseline-gate.json` — random project/admin ids only, fingerprint identical — was
  reverted with `git checkout`).

## Verified claims

- fresh gate GREEN with fingerprint `0e4e8ed8…f4926` → `npm run test:db-baseline` → CONFIRMED (exact match)
- live e2e 33/33 → CONFIRMED
- contract 5/62 → CONFIRMED
- tow 347 passed / 48 skipped → CONFIRMED
- full 771 passed / 48 skipped, 0 failures → CONFIRMED
- only `DROP SCHEMA` is the private primitive → CONFIRMED
- connection-shaped object refused with `RESET_API_MISUSE` → CONFIRMED
- no credential literal in repo → CONFIRMED
- no leftover disposable containers → CONFIRMED

## Unverified or risky

None within T01 scope. MTC-1/MTC-2 accepted as P3 follow-ups; no P0/P1/P2 found live. T02 / Issue #31 untouched.
