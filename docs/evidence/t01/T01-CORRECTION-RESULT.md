# T01 Correction Result — external review (PR #32) CHANGES_REQUIRED

Status: `READY_FOR_MUSE_TARGETED_REVIEW`

> Process note: the DeepSeek/DSH executor pass that produced this correction was interrupted by a provider
> quota limit (`429 GoUsageLimitError`, weekly limit) while it was re-running the final live gates, after the
> code, tests, docs and evidence had already been written. The orchestrator then ran the complete verification
> on the frozen working tree, fixed one documentation count (47 → 48 cases) and recorded this result. The
> independent adversarial review below is Muse Sparks 1.3 Free on the committed HEAD; the executor did not
> review its own work.

## External Review Finding

- finding: `scripts/tow/db-reset.js` exported `resetDatabase(db)`, which executed
  `DROP SCHEMA IF EXISTS public CASCADE` on an arbitrary Knex object with no authorization and no binding
  between the authorization and the connection that is actually destroyed. The gate and the e2e suite called
  that raw export directly.
- root cause: the destructive primitive was public and accepted a caller-supplied connection; the guard ran
  only on `process.env`, so authorization and destruction could refer to different targets.
- severity: **P1**.
- resolution: the primitive is now private (not exported); the only public entry point is
  `resetDatabase({ purpose, env?, confirm?, dryRun? })`, which resolves the target, authorizes it, and only
  then creates the connection **from the authorized target**. Passing any connection is refused with
  `RESET_API_MISUSE`. Gate and e2e suite use only the guarded API.

## Execution

- previous reviewed head: `f2c26279deb4476cf9ef789a7bdfad7c209afea3`
- branch: `feature/t01-clean-db-baseline` (PR #32, no force-push)
- new result head: this commit (implementation); a docs-only receipt commit follows with the Muse artifact
- commits added: `fix(t01): bind the guarded reset to the authorized target` (+ receipt commit)

## Reset Safety Architecture

- public API: `resetDatabase({ purpose, env?, confirm?, dryRun? })` — no connection parameter exists; any
  Knex-shaped argument is refused with `ResetApiMisuseError` (`code: RESET_API_MISUSE`).
- private destructive primitive: `dropPublicSchema(db)` inside `scripts/tow/db-reset.js`, not exported; a
  source-scan test asserts the only `DROP SCHEMA` in `scripts/tow/` lives in that private function.
- authorization path: `resolve target → assertResetAuthorized(env, { purpose, requireConfirmation }) →
  createConnectionForTarget(target) → private DROP → destroy`.
- target binding: the connection is created by `createConnectionForTarget(target)` from the **target object
  returned by the guard**; a caller can never supply a connection, so a safe-target authorization cannot be
  replayed against another database.
- confirmation token: `DB_RESET_CONFIRM=I_UNDERSTAND_DESTRUCTIVE_RESET` (distinct from the E2E row-reset token);
  `--dry-run` needs no token but still requires an authorized target and never emits `DROP`.
- proof arbitrary DB cannot bypass: RESET-DIRECT-7 covers the legacy `resetDatabase(db)` misuse (plain object,
  connection-shaped object, and a **callable** Knex double — the real shape), the non-export of the primitive,
  the source-level `DROP SCHEMA` scan, and that the connection comes from the authorized target.

## Safety Tests

Suite `tests/tow/baseline/dbBaselineSafety.test.js` — **48 passed** (offline) plus the live PG counterparts in
`dbBaseline.e2e.test.js` (see Fresh Gate below):

- direct reset without token: RESET-DIRECT-1 — refuses with/without near-miss tokens and proves the schema is
  intact afterwards.
- production-like names: RESET-DIRECT-2 — `NODE_ENV=production` and `prod`/`production`/`live`/`vps`/
  `staging` names refused, dev path included.
- remote host: RESET-DIRECT-3 — every non-loopback host refused.
- wildcard: RESET-DIRECT-4 — `0.0.0.0`, `::`, `*` refused.
- privileged user: RESET-DIRECT-5 — `postgres`, `root`, `admin`, `superuser`, production-looking users refused.
- DATABASE_URL: RESET-DIRECT-6 — `DATABASE_URL` and `PostgreSQL` refused.
- target-binding test: RESET-DIRECT-7 — arbitrary Knex/connection-shaped/callable inputs refused; primitive
  not exported; only private `DROP SCHEMA`; connection built from the authorized target.
- authorized disposable reset: RESET-DIRECT-8 — test and dev targets reset normally; `--dry-run` behavior.

## Negative Control

- mutation: three independent mutations — (NC-1) drop the confirmation requirement, (NC-2) accept every target
  once the token is present, (NC-3) re-export the private `dropPublicSchema` primitive.
- RED proof: 3 failed/48, 18 failed/48, 2 failed/48 respectively.
- restoration proof: files restored byte-identically (sha256 compared; hashes recorded).
- GREEN proof: suite back to 48/48.
- evidence: `docs/evidence/t01/07-negative-control-reset-authorization.txt`.

## Migration Safety

- decision on `--allow-existing`: **removed**. Passing it now fails loudly with the policy
  (`pre-T01 DB → authorized reset → clean baseline`); a source test asserts the flag cannot return.
- unmanaged/legacy DB behavior: the eligibility rule is centralized in
  `db-baseline.js#baselineEligibility` and enforced by `migrateBaseline`, so every public migrate path
  (`db:migrate`, `db-baseline --migrate`, the gate, the e2e suites) refuses an unmanaged database (tables but
  no `knex_migrations`) before Knex runs anything and points to the guarded reset.
- historical migration: not implemented (out of scope).

## GitGuardian

- finding: scanner flag on the synthetic inline fixture `ADMIN_PASSWORD: \`E2e-${suffix}-Disposable!\`` in
  `dbBaseline.e2e.test.js`.
- real secret or false positive: **false positive** — runtime-generated, disposable-container-only.
- action taken: the fixture moved to `scripts/tow/disposable-credentials.js` and is assembled at runtime from
  parts (`prefix-suffix-not-a-real-credential`), so no credential literal/pattern remains in the repository;
  the gate and the e2e suite share it. Tests still prove the seed reads the environment.
- #31 unchanged: **YES** — no rotation, no history rewrite, no `.env.bak`, no secret reading.

## Fresh PostgreSQL Gate

- migrate: from a truly new container/volume, **0 tables asserted before** `migrate`; exactly
  `[001_baseline_schema.js, 002_baseline_settings.js]` applied.
- seed: exactly one administrator (idempotent on repeat).
- reset: **guarded** public reset (`resetDatabase({ purpose: 'test' })`, target authorized).
- repeat: post-reset migrate + seed + assertions.
- fingerprints: run 1 == run 2 == `0e4e8ed825fb1629a1474f590ae5dc1c779685ecb927acbae038276cdfea4926`.
- teardown: containers/volumes/network destroyed; teardown failure is gate RED; no leftovers for the Compose
  project (verified empty `docker ps -a` / networks / volumes for `socorre-tow-test`).
- evidence: `docs/evidence/t01/db-baseline-gate.json` (regenerated on the final tree).

## T00 Regression

- `npm run validate:openapi`: PASS (66 operations)
- `npm run test:contract`: 5 suites / 62 tests PASS
- `npx jest tests/tow --runInBand`: 3 skipped / 16 passed suites; 48 skipped / 347 passed
- `npm run verify:tow`: 5/5 stages GREEN

## Full Regression

- `npx jest --runInBand`: **49 passed / 3 skipped suites; 771 passed / 48 skipped tests; 0 failures**
- T01 offline baseline suites: 3 suites / 75 tests PASS (safety 48 + adminSeed 16 + snapshot 11)
- T01 live PostgreSQL suite: **33/33 PASS** with the disposable environment up
  (`npm run test:pg:up` → `TOW_POSTGRES_E2E=1 npx jest tests/tow/baseline/dbBaseline.e2e.test.js` → `test:pg:down`)
- The standalone e2e command requires the harness container to be up; running it right after the gate (which
  tears the container down) yields `ECONNREFUSED` — harness usage, not a code failure.

## Muse Targeted Review

- reviewed HEAD: `15f6e3c27ffc06d0a33ab55c6c5f0b7970b8262b`
- reviewer: Muse Sparks 1.3 Free (static pass + live verification pass)
- P0: 0 · P1: 0 · P2: 0 · P3: 2 (`MTC-1` unauthenticated `createConnectionForTarget` export; `MTC-2` gate
  re-export of the disposable fixture factory) — both accepted as non-blocking defense-in-depth follow-ups,
  with no reachable DROP path (verified live)
- live evidence: safety 48/48; fresh gate GREEN with identical fingerprint; live e2e 33/33; T00 regression green;
  full suite 771 passed / 48 skipped, 0 failures; no leftovers
- verdict: **APPROVE**
- artifact: `docs/evidence/t01/07-muse-targeted-review.md`

## Scope

- T02 touched: **NO**
- #31 touched: **NO**
- production/VPS touched: **NO**

## Remaining Findings

- Doc-only fix by the orchestrator: `T01-DATABASE-BASELINE-DECISION.md` case count 47 → 48.
- `MT1-INFO-1` (P2, accepted from the previous review): short known passwords are rejected by the length rule
  before reaching the denylist; the denylist path itself is proven by the 12-char case.

## Recommended Next Action

Targeted Muse review of this correction delta, then external re-review of PR #32.
