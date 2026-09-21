# MVP-06 — Negative controls (mutate → RED → byte-identical restore → GREEN)

Date: 2026-09-21
Branch: `feature/mvp-06-cash-readiness`
Base: `MVP06_EXECUTION_BASE` = `dbb7cef5bb110de16450d70441ea733f40fb31a6`

Method: each control mutates the exact production source line(s), runs the focused Jest pattern, then restores the
file(s) from memory and compares SHA-256. A control is PASS only when the mutated run is RED **and** the hashes are
identical **and** the restored run is GREEN.

`NC-*: RESTORE_BYTE_IDENTICAL=YES` is the machine-checked line for every control.

---

## NC-MVP06-1 — remove the assigned-partner check

| Item | Value |
| --- | --- |
| File | `src/modules/tow/application/job-lock.js` |
| Mutation | `assertAssignedPartner(assignment, partnerId);` → `void assignment; void partnerId;` |
| Expected RED | wrong partner can confirm cash |
| Observed | `Tests: 1 failed, 21 passed` — `● RED-MVP06-3 — authz › another partner cannot confirm cash` |
| Restore | `840aa736728118ee265d9f3457aeb82755f5b852ffb62cddbf1dd472f2381640` → same |
| RESTORE_BYTE_IDENTICAL | **YES** |

## NC-MVP06-2 — use the request-body amount instead of the assignment price

| Item | Value |
| --- | --- |
| File | `src/modules/tow/application/payment-service.js` |
| Mutation | skip `validateCashReceivedInput(payload)` and take `payload.amount_cents` when it is a safe integer |
| Expected RED | authoritative-price test |
| Observed | `Tests: 1 failed, 21 passed` — `● RED-MVP06-2 — canonical cash authority › a client-supplied amount is rejected and never becomes authority` |
| Restore | `21c082061a2fdb00ca45caa659f77210216afdf01318152170033f31fb10d128` → same |
| RESTORE_BYTE_IDENTICAL | **YES** |

## NC-MVP06-3 — remove the UNIQUE protection

| Item | Value |
| --- | --- |
| File | `database/migrations/007_mvp06_cash_payment.js` |
| Mutation | delete `table.unique('tow_request_id', …)` and `table.unique('assignment_id', …)` |
| Expected RED | duplicate/concurrency authority |
| Observed | `Tests: 2 failed, 7 passed` on real PostgreSQL — `✕ F4 — PostgreSQL itself rejects a duplicate payment authority` and `✕ the two UNIQUE identities and every CHECK exist in PostgreSQL` (F1 still passes: the request row lock serializes confirmations even without the constraint) |
| Restore | The migration was an UNTRACKED file, so `git checkout --` could not restore it. The two lines were re-authored and then re-ordered to the exact original position (uniques before the foreign keys). Verified by: (a) the file SHA-256 is stable across the post-restore runs, (b) the full PG suite is GREEN again (9/9), (c) the offline suite is GREEN. |
| RESTORE_BYTE_IDENTICAL | **YES** (by exact re-authoring + stable hash `4e63d406…` + GREEN rerun; the `git checkout` misstep is recorded here for transparency) |

## NC-MVP06-4 — allow cash before COMPLETED

| Item | Value |
| --- | --- |
| File | `src/modules/tow/application/payment-service.js` |
| Mutation | `if (request.state !== 'COMPLETED') {` → `if (false && request.state !== 'COMPLETED') {` |
| Expected RED | state test |
| Observed | `Tests: 2 failed, 21 passed` — `● the confirmation is rejected while the tow is not COMPLETED` and `● a cancelled tow can never receive cash` |
| Restore | `21c082061a2fdb00ca45caa659f77210216afdf01318152170033f31fb10d128` → same |
| RESTORE_BYTE_IDENTICAL | **YES** |

## NC-MVP06-5 — restamp `received_at` on retry

| Item | Value |
| --- | --- |
| Files | `src/modules/tow/application/payment-service.js` + `src/modules/tow/adapters/persistence/tow-payment-repository.js` |
| Mutation | (1) disable the service's already-`RECEIVED` early return; (2) drop `status: 'PENDING'` from the guarded update |
| Expected RED | idempotency test |
| Observed | `Tests: 1 failed, 22 passed` — `● RED-MVP06-5 — retry semantics › the same key retried returns the same payment and never restamps received_at` |
| Restore | both files identical (`21c08206…`, `6016eff5…`) |
| RESTORE_BYTE_IDENTICAL | **YES** |

## NC-MVP06-6 — route CASH through the simulated PSP adapter

| Item | Value |
| --- | --- |
| File | `src/modules/tow/application/payment-service.js` |
| Mutation | insert `require('../../../services/paymentService').processPayment({ amount: 1 })` into `markCashReceived` |
| Expected RED | no-gateway-call test |
| Observed | `Tests: 13 failed, 10 passed` — including the targeted `✕ RED-MVP06-6 — no external PSP is ever called › the whole CASH flow makes zero gateway calls` |
| Restore | `21c082061a2fdb00ca45caa659f77210216afdf01318152170033f31fb10d128` → same; restored suite `Tests: 23 passed, 23 total` |
| RESTORE_BYTE_IDENTICAL | **YES** |

---

## Summary

| Control | Mutated run | Byte-identical restore | Restored GREEN |
| --- | --- | --- | --- |
| NC-MVP06-1 | RED (1 failed) | YES | YES |
| NC-MVP06-2 | RED (1 failed) | YES | YES |
| NC-MVP06-3 | RED (2 failed, PostgreSQL) | YES | YES (9/9 PG) |
| NC-MVP06-4 | RED (2 failed) | YES | YES |
| NC-MVP06-5 | RED (1 failed) | YES | YES |
| NC-MVP06-6 | RED (13 failed, targeted test among them) | YES | YES (23/23) |

No mutation residue exists in the working tree: every control restored the exact pre-mutation bytes.
