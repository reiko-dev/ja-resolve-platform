# MVP-06 — External-style gate (executor-run, distrusting prior claims)

Date: 2026-09-21
PR: #40 · Issue: #18
Gate HEAD: `33a394050b00309e75c753822a113cd33eea1a34`
Raw PG output: `22-external-gate-postgres.txt`

This is the pre-merge external-style gate required by the delivery workflow. It re-reads the real GitHub
state, compares the PR tree to the verified local tree, independently re-checks the CASH invariants and
re-runs the high-value gates. It does not trust the executor summary, the PR description or the Muse verdict.

## 1. Real GitHub state (re-read, not assumed)

```text
PR #40          = OPEN, draft = false, mergeable = MERGEABLE
PR headRefOid   = 33a394050b00309e75c753822a113cd33eea1a34
PR baseRefOid   = dbb7cef5bb110de16450d70441ea733f40fb31a6  (= MVP06_EXECUTION_BASE)
changed files   = 57 (+7297 / -66)
Issue #18       = OPEN
checks          = GitGuardian (only; no CI workflows exist in this repository)
```

`MVP06_EXTERNAL_GATE_HEAD = 33a394050b00309e75c753822a113cd33eea1a34`

## 2. Tree identity

```text
git fetch origin pull/40/head:pr40
PR40_TREE  = 232a57bff3ce505d5797a44316ec4b036e6116fb
LOCAL_TREE = 232a57bff3ce505d5797a44316ec4b036e6116fb
PR_TREE_EQUALS_LOCAL = PASS
```

## 3. Review freshness (section 64)

`git diff --name-status 74ab62e3..33a39405` = **docs-only** (6 files, all under `docs/`):

```text
M docs/evidence/mvp-06/25-review-corrections.md
M docs/evidence/mvp-06/27-adversarial-review.md
A docs/evidence/mvp-06/28-muse-sparks-review-r2.md
A docs/evidence/mvp-06/29-session-handoff.md
A docs/evidence/mvp-06/30-environment-anomaly.md
M docs/evidence/tow-autonomous-finish/LEDGER.md
```

No `src/`, `database/`, `tests/`, `scripts/` or OpenAPI behavior changed after the Muse-reviewed tree.
`EXTERNAL_FINDING: REVIEW_STALE` is **absent**.

## 4. CASH authority (section 65)

- The only amount inputs in the payment path are `assignment.final_price_amount_cents` at
  `payment-service.js:127` and `:195`. A grep for `payload.amount`, `req.query.amount`,
  `req.body.amount` in the service and controller returns **nothing**.
- `cash-received` declares no request body (contract) and the runtime rejects any body (422).
- Money audit across the MVP-06 runtime: no `parseFloat`, `toFixed`, `Math.ceil`, `Math.round` or decimal
  money anywhere; amounts are integer cents and currency is CHECK-pinned to `BRL`.
- Independent S09 boundary proof executed directly against the pricing authority:

```text
{"total_distance_meters":10001,"included_meters":10000,"excess_meters":1,
 "variable_charge_cents":1,"final_price_cents":15001,"currency":"BRL"}
S09 PASS: proportional, not ceil(km)
```

## 5. Zero PSP (section 66)

- No module file imports `gateways/*`, the legacy `paymentService`, `walletService` or `commissionService`.
- A runtime spy test (`towMvp06CashPayment.test.js`, RED-MVP06-6) asserts **0 calls** into the simulated
  Stripe / MercadoPago / PagSeguro adapters and the legacy Tow payment methods across the whole cash flow.
- Static search over the MVP-06 runtime finds only prose explaining why there is no gateway.

## 6. Authz, completion, idempotency, constraints, rehydration

Covered by the freshly re-run suites and the independent PostgreSQL run below; each invariant is bound to a
named test: wrong partner 403 (`F3`, attack), customer 403 / anonymous 401 / unknown 404 (cash suite),
not-COMPLETED 409 and cancelled 409 (`F5`, `F6`, attack), one payment under retry (`F1`, `F2`, S19),
`received_at` immutability (retry tests + `F1`), raw duplicate rejected by PostgreSQL `23505` (`F4`),
savepoint recovery without `25P02` (`F4b`), rehydration through a fresh composition root and HTTP server
(attack A4), and the full identity chain in S20.

## 7. Independent high-value re-runs on this exact tree

| Gate | Result |
| --- | --- |
| `npx jest tests/tow/mvp06` | 76 passed / 10 skipped / 0 failed |
| `tests/tow/mvp06/towMvp06Readiness.test.js` | **S01..S20 = 20/20 PASS** |
| `npx jest tests/tow` | 1210 passed / 91 skipped / 0 failed |
| `npx jest --runInBand` | 1667 passed / 91 skipped / 0 failed |
| `npm run validate:openapi` | PASS — `1.0.0-draft.9` |
| PG (MVP-06 F1–F6 + F4b + guards, MVP-04 C1–C9) | **20/20 GREEN** (`22-external-gate-postgres.txt`) |
| Tow disposable teardown | containers 0 / volumes 0 / networks 0 |
| `akry-*` | untouched (read-only observation; 4 containers, unchanged during this run) |

`S13` is bound to the real PostgreSQL concurrent-accept authority (MVP-04 `C1`) re-run green on this tree.
`S19` is bound to `F1`/`F2` on real PostgreSQL. `S20` is a single cohesive test asserting the identity chain
`request → winning proposal → assignment → payment`.

## 8. Scope (section 12 of the delivery audit, re-checked)

`git diff --name-only dbb7cef5..33a39405` contains no CARD/PIX/debt/wallet/settlement/payout/refund/dispute/
counteroffer/no-show/rematch runtime. The long-term OpenAPI still declares those operations, which is
intentional and documented; the canonical `draft.9` note records the implemented subset, and the base contract
diff against the execution base is **0 lines**.

## 9. Findings

| Severity | Count | Notes |
| --- | --- | --- |
| P0 | 0 | — |
| P1 | 0 | — |
| blocking P2 | 0 | — |
| P3 | 3 | inherited from Muse R2, all documented and non-blocking (SQLite-only unreachable fallback; ignored unknown query params; documented replay-after-cancel for `PUT payment-method`) |

## 10. Verdict

```text
P0 = 0
P1 = 0
blocking P2 = 0
APPROVE_MVP06_FOR_MERGE
```
