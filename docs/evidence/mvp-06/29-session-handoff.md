# MVP-06 — Session handoff (state, next task, restart prompt)

Saved: 2026-09-21
Repository: `reiko-dev/ja-resolve-platform` (local monorepo `/Volumes/Reiko/projects/work/socorre-system`,
backend `socorre_ai_backend`)
Epic: `#10 — Tow` · Deliveries: `#17` (MVP-05, CLOSED) and `#18` (MVP-06, OPEN)

---

## 1. State snapshot

| Item | Value |
| --- | --- |
| Branch checked out | `feature/mvp-06-cash-readiness` |
| `MVP06_EXECUTION_BASE` | `dbb7cef5bb110de16450d70441ea733f40fb31a6` |
| `MVP06_CORRECTION_HEAD` (current HEAD) | `74ab62e3d5da36db6c4bd4bd10f6f6ef4da50ffa` |
| `MVP06_FUNCTIONAL_HEAD` (pre-review) | `f8dd9a08101514e307a9b889dcc852609f2c6c68` |
| MVP-05 PR #39 | **MERGED** (`1d9f04bf…`), tree equivalence PASS, receipt `#5759825979`, Issue #17 **CLOSED** |
| MVP-06 PR | **NOT OPENED YET** |
| Issue #18 | OPEN |
| #31 (security) | OPEN / DEFERRED — untouched |
| #33 (Phase 2) | OPEN / DEFERRED — untouched |
| Working tree | clean (all work committed) |
| GitHub Actions | none in the repo (only GitGuardian on PRs); all evidence is repository-versioned/local |

### Commits on the branch

```text
dbb7cef5  docs(tow): accept MVP-05 and release MVP-06 (#18)      <- MVP06_EXECUTION_BASE
f8dd9a08  feat(mvp06): CASH payment authority and lean E2E (#18) <- first functional head
74ab62e3  fix(mvp06): savepoint + draft.9 note corrections (#18) <- current HEAD
```

### Gates run and their results

On `f8dd9a08` (pre-correction):

| Gate | Result |
| --- | --- |
| `npm run validate:openapi` | PASS — contract `1.0.0-draft.9` |
| `npm run test:contract` | 95/95 |
| `npx jest tests/tow/mvp01..mvp05` | 124 / 204 / 177 / 189 / 89 (all floors preserved) |
| `npx jest tests/tow/mvp06` | 75 passed |
| `npx jest tests/tow` | 1209 passed / 90 skipped / 0 failed |
| `npx jest --runInBand` | 1666 passed / 90 skipped / 0 failed |
| `DB_PORT=55434 npm run test:db-baseline` | GREEN — 37 tables, migrations 001..007, fingerprint `a5605ba9d71f214fb9b289e4d57001099119a2052a2ff5d4d67d66500446e999` twice |
| PG block (F1–F6, E1–E6, C1–C9, T01 33, MVP-03 7, legacy 9) | 74/74 GREEN (`20-inherited-postgres.txt`) |
| Negative controls NC-MVP06-1..6 | RED → byte-identical restore → GREEN (`11-negative-controls.md`) |
| Fresh-context adversarial review R1 | `P0=0 P1=0 blocking P2=0` → APPROVE (`27-adversarial-review.md`) |

On `74ab62e3` (post-correction, current):

| Gate | Result |
| --- | --- |
| `npm run validate:openapi` | PASS — `1.0.0-draft.9` |
| `npm run test:contract` | 95/95 |
| `npx jest tests/tow/mvp01` / `mvp02` / `mvp03` / `mvp04` / `mvp05` | 124 / 204 / 177 / 189 / 89 |
| `npx jest tests/tow/mvp06` | **76 passed** (F4b + offline uniqueness test added) |
| `npx jest --runInBand` | **1667 passed** / 91 skipped / 0 failed |
| PG block (F1–F6 **+F4b**, E1–E6, C1–C9, T01, MVP-03, legacy) | **75/75 GREEN** (`21-postgres-after-corrections.txt`) |
| Negative control NC-MVP06-7 (revert savepoint) | `F4b` RED → byte-identical restore → `F4b` GREEN |

### Corrections already applied

| Finding | Severity | Disposition |
| --- | --- | --- |
| M6-01 — unique-violation recovery aborted the PG transaction (`25P02`) | P2 non-blocking | **CORRECTED** — INSERT now inside a SAVEPOINT; proven by `F4b` (`25-review-corrections.md`) |
| M6-02 — draft.9 "exactly …" transition sentence inexact | P2 non-blocking | **CORRECTED** — both transition shapes stated in the canonical note |
| M6-03 — `PUT /payment-method` replays 200 on a cancelled tow with an existing row | P3 | intentional idempotent replay, now documented in code |
| M6-04 — payment ops inherit the base response surface (401/403 under-declared) | P3 | accepted, no change (base must stay byte-identical); tracked follow-up |

### Transient flakes observed (both recorded, both re-verified GREEN)

1. One `npx jest tests/tow` batch reported 1 failed in
   `MVP-01 API › module status and toggle › admin toggle disables new business and is idempotent`
   (module metadata assertion). The suite passed 4/4 reruns and the batch passed 4/4 reruns; the gauntlet
   suite now restores the module to enabled. (`18-flake-census.md`)
2. One `npx jest tests/tow/mvp04` batch reported 1 failed; the immediate rerun was **189 passed / 0 failed**
   and full Jest was **1667 passed / 0 failed**. Not classified as a product defect, but the exact test name
   was not captured — see next task step 0.

### Environment note — Muse IS available (previous claim corrected)

An earlier version of this handoff claimed that no external **Muse Sparks 1.3 Free** tooling existed in this
environment. **That was wrong.** The executor looked for a `muse` binary and an opencode agent definition but
never ran `opencode models`. The real model is available:

```text
opencode run --model opencode/muse-spark-1.3-contributor-free --dir <repo> --auto "<prompt>"
```

It has now been executed for real. The authoritative external review is
`docs/evidence/mvp-06/28-muse-sparks-review-r2.md`:

```text
verdict          = APPROVE_MVP06_FOR_MERGE
P0 = 0 · P1 = 0 · blocking P2 = 0 · P3 = 3 (all non-blocking)
reviewed tree    = 74ab62e3d5da36db6c4bd4bd10f6f6ef4da50ffa
```

Muse independently re-ran the suites (S01–S20 20/20, cash 24/24, attack 9/9, architecture 23/23, mvp05 89,
OpenAPI `1.0.0-draft.9` exit 0), the PostgreSQL block (F1–F6 + F4b + inherited C1–C9, 20/20, teardown empty),
proved the S09 one-meter case (`10001 m → 15001`), and executed three of its own negative controls with
byte-identical restores (`job-lock 840aa736…`, `payment-service ae192889…`, `repository 2d70a612…`). Hermes
was not used. The earlier internal substitute review (`27-adversarial-review.md`) is superseded and carries an
errata note.

One caveat Muse recorded and this handoff must keep honest: `docker ps` showed **no `akry-*` containers
running** during Muse's run, whereas the executor observed four `akry-products-e2e-*` containers at the start
of the session and `akry-edge-pg` has since disappeared entirely. The executor's tooling provably operates
only on the compose project `socorre-tow-test-55434-cb0d0933` (dedicated compose file, unique project name)
and never on the `akry-*` projects, but the change is **external and unexplained**; it must be reported to the
operator and must not be silently ignored. See `30-environment-anomaly.md`.

---

## 2. Next task

> **TASK N — MVP-06 PR + external-style gate + merge + post-merge acceptance.**

Review freshness is **restored**: the real Muse Sparks 1.3 Free externa review R2
(`28-muse-sparks-review-r2.md`) approved the corrected functional tree
`74ab62e3d5da36db6c4bd4bd10f6f6ef4da50ffa`. Steps 0–2 of the previous version of this handoff are DONE
(mvp04 was re-run 3× and is green; the freeze is `74ab62e3`; R2 returned
`P0=0 P1=0 blocking P2=0` → `APPROVE_MVP06_FOR_MERGE`).

Steps remaining, in order:

3. **Open the MVP-06 PR** (`Closes #18`) with the title
   `MVP-06 — CASH Payment & Lean End-to-End Readiness Gate` and a body containing: execution base, functional
   head, reviewed head, CASH architecture, price authority, schema, idempotency, authz, rehydration, the
   S01..S20 table, OpenAPI `draft.8 → draft.9`, fingerprint, migrations, PG F1–F6 (+F4b), inherited
   concurrency gates, negative controls, regression counts, review verdicts (with the Muse disclosure), and
   the scope exclusions.
4. **External-style gate** against the real PR and exact HEAD (the prompt's sections 63–77): re-read the PR
   from GitHub, verify base/HEAD/mergeable, verify review freshness is docs-only after the reviewed head
   (`74ab62e3` must remain the functional head), independently re-check
   authority/authz/completion/idempotency/PG constraints/rehydration/S01–S20/S09/S13/S19/S20, and produce the
   external verdict or correct the findings and loop.

   Note on the review record: R2 was executed by the real Muse Sparks 1.3 Free model, but it is an
   **executor-invoked** session, not a third-party approval. The PR and the receipt must describe it exactly
   that way (model, command, tree, verdict), and must not imply an approval from a different organization.
5. **Merge the exact approved HEAD (squash)**, verify tree equivalence, close #18 if not auto-closed.
6. **Post-merge final acceptance from merged `main`**: full Jest, Tow, contract, OpenAPI, DB baseline, the full
   PG block, S01–S20, fresh-DB + seed, teardown 0/0/0, and record the final table count/fingerprint.
7. **Post `MVP06_ACCEPTED` receipt** on the MVP-06 PR with all the evidence listed in the workflow, including
   the CI disclosure (no GitHub Actions) and the Muse disclosure.
8. **Docs-only planning bookkeeping on `main`**: MVP-06 ACCEPTED, Phase 1 COMPLETE, #33 DEFERRED, #31 DEFERRED;
   record `MVP06_ACCEPTED_MAIN` and `TOW_MVP_FINAL_MAIN`.
9. **Final GitHub re-read + repository cleanliness + scope audit**, then emit exactly
   `TOW MVP BACKEND READY FOR INTEGRATION` and STOP (no Phase 2, no #31, no production).

### Inventory of evidence already committed

```text
docs/evidence/mvp-06/01-current-state-delta.md
docs/evidence/mvp-06/02-contract-audit.md
docs/evidence/mvp-06/03-red/RED.md + red-mvp06-1-5.txt
docs/evidence/mvp-06/04-cash-aggregate.md
docs/evidence/mvp-06/05-payment-authority.md
docs/evidence/mvp-06/10-postgres-concurrency.md
docs/evidence/mvp-06/11-negative-controls.md
docs/evidence/mvp-06/12-regression-summary.md
docs/evidence/mvp-06/13-schema-baseline.md
docs/evidence/mvp-06/14-scope-audit.md
docs/evidence/mvp-06/18-flake-census.md
docs/evidence/mvp-06/20-inherited-postgres.txt
docs/evidence/mvp-06/21-postgres-after-corrections.txt
docs/evidence/mvp-06/25-review-corrections.md
docs/evidence/mvp-06/27-adversarial-review.md
docs/evidence/mvp-06/TOW-MVP-READINESS.md
docs/evidence/tow-autonomous-finish/LEDGER.md
```

### Hard blockers

None. There is no missing credential, no permission problem, no ambiguity with materially different business
outcomes, no unrecoverable state.

---

## 3. Restart prompt (paste this into a new session)

```text
# TOW — AUTONOMOUS FINISH (RESUME FROM HANDOFF)

Repository: reiko-dev/ja-resolve-platform
Local monorepo: /Volumes/Reiko/projects/work/socorre-system (backend: socorre_ai_backend)
Epic: #10 — Tow
Deliveries: MVP-05 / #17 (CLOSED, merged) and MVP-06 / #18 (OPEN, implemented, not yet published)

Primary executor: DeepSeek V4.1 Flash. Adversarial reviewer: the real Muse Sparks 1.3 Free model, available
here as `opencode/muse-spark-1.3-contributor-free` and invoked with:
  opencode run --model opencode/muse-spark-1.3-contributor-free --dir /Volumes/Reiko/projects/work/socorre-system --auto "<brief>"
Hermes is FORBIDDEN; never use it. Muse review R2 already APPROVED `74ab62e3` (see
docs/evidence/mvp-06/28-muse-sparks-review-r2.md); verify freshness instead of re-running it.

# ==== READ FIRST (saved state) ====
docs/evidence/mvp-06/29-session-handoff.md   <- full state, gates, next task, inventory
docs/evidence/mvp-06/TOW-MVP-READINESS.md    <- S01..S20 + consumer surface + NOT READY list
docs/evidence/mvp-06/25-review-corrections.md
docs/evidence/mvp-06/27-adversarial-review.md
docs/evidence/tow-autonomous-finish/LEDGER.md

# ==== CURRENT STATE ====
branch:                 feature/mvp-06-cash-readiness
MVP06_EXECUTION_BASE:   dbb7cef5bb110de16450d70441ea733f40fb31a6
MVP06_FUNCTIONAL_HEAD:  f8dd9a08101514e307a9b889dcc852609f2c6c68 (reviewed by R1)
current HEAD:           74ab62e3d5da36db6c4bd4bd10f6f6ef4da50ffa (R1 corrections, unreviewed)
MVP-06 PR:              NOT OPENED
Issue #18:              OPEN
working tree:           clean
GitHub Actions:         none in the repo (only GitGuardian); all evidence is local/versioned

Already GREEN on 74ab62e3:
  validate:openapi PASS (1.0.0-draft.9); contract 95/95
  mvp01 124 · mvp02 204 · mvp03 177 · mvp04 189 · mvp05 89 · mvp06 76
  full Jest 1667 passed / 91 skipped / 0 failed
  PG block 75/75 GREEN (F1–F6 + F4b, E1–E6, C1–C9, T01 33, MVP-03 7, legacy 9)
  schema 37 tables, migrations 001..007, fingerprint
  a5605ba9d71f214fb9b289e4d57001099119a2052a2ff5d4d67d66500446e999 (twice identical)

# ==== SCOPE BOUNDARY (unchanged) ====
Goal: TOW MVP BACKEND READY FOR INTEGRATION (Phase 1 only).
Do NOT implement Phase 2 / #33. Do NOT touch security issue #31. Do NOT touch production/VPS.
Do NOT touch akry-* containers. Never merge unreviewed functional code.

# ==== INHERITED HARD RULES ====
- amount authority = tow_assignments.final_price_amount_cents; cash-received has NO body and makes ZERO PSP calls;
- exactly one payment per request/assignment, enforced by PostgreSQL UNIQUE(tow_request_id)/UNIQUE(assignment_id);
- only the ASSIGNED partner confirms cash, only on a COMPLETED tow, idempotent with an immutable received_at;
- no request-body/query/tariff/new-quote amount can ever influence the paid amount;
- the base OpenAPI must stay byte-identical; only the canonical draft.9 note may change;
- every accepted suite floor must be preserved or grow (mvp01 124 / mvp02 204 / mvp03 177 / mvp04 189 /
  mvp05 89 / tow 1134 / full 1591 / contract 95).

# ==== EXECUTE, AUTONOMOUSLY, IN THIS ORDER ====

0. Re-read the saved state files above and verify the working tree is clean and HEAD is
   74ab62e3 (or a later docs-only equivalent). If main/PR state differs from the handoff, reconcile first.
   Capture the exact identity of the previously observed transient mvp04 failure: run
   `npx jest tests/tow/mvp04 --runInBand` twice; if it fails, record the failing test + assertion before
   continuing (do not accept a repeat silently).

1. FREEZE MVP06_FUNCTIONAL_HEAD_R2 = current HEAD.

2. REVIEW FRESHNESS IS ALREADY RESTORED — DO NOT REDO IT. The real Muse Sparks 1.3 Free review R2 exists at
   `docs/evidence/mvp-06/28-muse-sparks-review-r2.md` and approved `74ab62e3` with P0=0, P1=0, blocking P2=0.
   Verify only that `74ab62e3` is still the functional head and that every commit after it is docs-only
   (`git diff --name-only 74ab62e3..HEAD`). If a functional file changed after `74ab62e3`, the review is stale
   again: correct, re-freeze, and run a NEW Muse review with
   `opencode run --model opencode/muse-spark-1.3-contributor-free --dir <repo> --auto "<review brief>"`.
   Muse IS available; Hermes is forbidden and must not be used.

3. OPEN THE MVP-06 PR: title `MVP-06 — CASH Payment & Lean End-to-End Readiness Gate`, body `Closes #18`,
   including execution base, functional/reviewed/current heads, CASH architecture, price authority, schema,
   idempotency, authz, rehydration, the S01..S20 table, OpenAPI draft.9, fingerprint, migrations, PG F1–F6/F4b,
   inherited gates, negative controls, regression counts, review verdicts with the Muse disclosure, and the
   explicit NOT-READY list.

4. EXTERNAL-STYLE GATE against the real PR and exact HEAD (sections 63–77 of the original prompt):
   re-read PR state/base/HEAD/mergeable from GitHub, verify every post-review change is docs-only, then
   independently re-verify CASH authority, no PSP, authz, completion requirement, idempotency, DB constraints,
   rehydration, S01–S20 (with S09 proportional pricing and the S13→C1 / S19→F1/F2 bindings), and scope.
   Produce APPROVE_MVP06_FOR_MERGE or correct and loop.

5. MERGE the exact approved HEAD with squash; record MVP06_APPROVED_HEAD/TREE, MVP06_MERGE_SHA, MVP06_MERGED_AT;
   require PR MERGED and Issue #18 CLOSED (close explicitly if Closes does not); verify tree equivalence
   (approved tree == merged tree); STOP with MVP06_MERGE_TREE_MISMATCH if it differs.

6. POST-MERGE FINAL ACCEPTANCE from merged main: clean tree; validate:openapi; contract;
   DB_PORT=55434 verify:tow; jest mvp01..mvp06; tests/tow; DB_PORT=55434 test:db-baseline; full Jest;
   full PG block; fresh-DB+seed; S01–S20; teardown containers/volumes/networks = 0; akry-* untouched.
   Record the final table count and run the fingerprint twice.

7. POST the `MVP06_ACCEPTED` receipt on the MVP-06 PR (all evidence, plus: no GitHub Actions exists; the
   adversarial review was executed by the real Muse Sparks 1.3 Free model, invoked by the executor via
   `opencode run --model opencode/muse-spark-1.3-contributor-free`, on the exact reviewed tree — describe it
   exactly that way and do not imply a third-party organizational approval).

8. DOCS-ONLY planning bookkeeping on main: T00/T01/MVP-01..MVP-06 ACCEPTED, "Tow MVP Phase 1 = COMPLETE",
   Phase 2 #33 DEFERRED, #31 DEFERRED; record MVP06_ACCEPTED_MAIN and TOW_MVP_FINAL_MAIN. No functional
   change after acceptance.

9. FINAL: re-read GitHub state (both PRs MERGED, both issues CLOSED, main == TOW_MVP_FINAL_MAIN, #31/#33
   deferred), repository cleanliness (no *.bak/*.tmp/*.orig/debug residue, no untracked secrets), scope audit,
   then emit exactly:

   TOW MVP BACKEND READY FOR INTEGRATION

   and STOP. Do not begin Phase 2 / #33. Do not begin #31. Do not deploy.

# ==== STOP POLICY ====
Stop only for a real hard blocker (unavailable required credential/access, missing GitHub permission,
production-only knowledge, incompatible external state change, genuine product ambiguity, an uncorrectable
blocking P0/P1/P2, or a data-destructive action needing authorization). Test/lint/compile/patch/merge-conflict
failures and known local environment collisions are NOT blockers: fix, rerun, continue. Never present local
execution as GitHub Actions.
```
