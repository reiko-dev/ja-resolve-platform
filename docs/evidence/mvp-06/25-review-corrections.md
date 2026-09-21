# MVP-06 — Autonomous correction of review findings

Date: 2026-09-21
Reviewed head before correction: `f8dd9a08101514e307a9b889dcc852609f2c6c68`
Source review: `docs/evidence/mvp-06/27-adversarial-review.md` (fresh-context adversarial review, Muse role)

The first adversarial review returned `P0 = 0`, `P1 = 0`, `blocking P2 = 0`, with two non-blocking P2 and two
P3 findings. Two of them were corrected anyway, because both are real and cheap to fix: a latent
PostgreSQL defect and an inexact consumer-facing contract sentence.

---

## M6-01 (P2) — unique-violation recovery aborted the PostgreSQL transaction → CORRECTED

**Defect.** `tow-payment-repository.js` caught the `23505` and then issued the winner lookup **on the same
transaction**. PostgreSQL aborts a transaction on a failed statement, so the lookup raised
`25P02 current transaction is aborted`. Unreachable through the runtime (both writers take the request row
`FOR UPDATE` first), but the adapter's documented contract ("the loser learns which identity conflicted
instead of crashing") was false on the production dialect.

**Correction.** The `INSERT` now runs inside a SAVEPOINT (knex nested transaction), so the failed statement is
contained and the surrounding transaction stays usable for the winner lookup. Behavior on SQLite is unchanged.

File: `src/modules/tow/adapters/persistence/tow-payment-repository.js` (`createForAssignment`).

**Reproduction, then proof.**

| Run | Result |
| --- | --- |
| `F4b` with the pre-fix direct insert (negative control **NC-MVP06-7**) | **RED** — `✕ F4b — a duplicate insert inside a transaction recovers without aborting it`; `Tests: 1 failed, 9 passed` |
| restore | byte-identical: `2d70a612dd64c7ff6c5c78a9ac699cdfa5ac47678d5e997d382b3c8969de154a` before and after |
| `F4b` with the savepoint | **GREEN** — `Tests: 10 passed, 10 total` |

`F4b` deliberately bypasses the request-row lock and calls the repository directly, so it exercises the exact
losing path the review probed. An offline regression test was added in the same change
(`towMvp06CashPayment.test.js` — `canonical uniqueness recovery`), which now runs on both dialects.

## M6-02 (P2) — draft.9 transition sentence was inexact → CORRECTED

**Defect.** The draft.9 note said the implemented transitions are "exactly
`NOT_SELECTED -> CASH_SELECTED -> CASH_RECEIVED`". The runtime also implements
`NOT_SELECTED -> CASH_RECEIVED` (the assigned partner confirms on a `COMPLETED` Tow that never had a
selection; the row is created lazily as `RECEIVED`).

**Correction.** The note now states both implemented transition shapes explicitly. The base contract stays
byte-identical and no enum member or response shape changed.

File: `docs/tow/tow-api-contract.openapi.yaml` (draft.9 revision note).

## M6-03 (P3) — replay of a method selection after cancellation → DOCUMENTED AS INTENTIONAL

`PUT /payment-method` answers a replay from the existing row **before** the `CANCELLED` guard, so a cancelled
Tow still replays its real (unchanged) payment state instead of an error code. This is the same replay
philosophy the execution milestones use, it writes nothing, and it has no financial consequence. The ordering
is now explained in the code so it cannot be mistaken for an oversight.

File: `src/modules/tow/application/payment-service.js` (`selectMethod`).

## M6-04 (P3, informational) — payment operations inherit the base response surface → ACCEPTED, NO CHANGE

The canonical payment operations remain `$ref`s to the base, so `401`/`403` are under-declared for them
(unlike the draft.8 execution operations, which were re-declared with the truthful status surface). The task
explicitly required the base contract to stay byte-identical, and under-declaration makes no false claim. If a
future delivery re-declares them, it must also add `401`/`403`/`422` to the canonical items. Recorded here as a
tracked follow-up, not a merge blocker.

---

## Negative-control summary after correction

| Control | Mutation | Result |
| --- | --- | --- |
| NC-MVP06-7 | revert `createForAssignment` to the direct insert (pre-fix) | `F4b` **RED** (1 failed / 9 passed), byte-identical restore, then `F4b` **GREEN** 10/10 |

## Post-correction state

The functional tree changed after the first review, so the review is **stale** by the delivery's own rule.
A fresh focused adversarial review of the corrected delta is recorded in
`docs/evidence/mvp-06/28-adversarial-review-r2.md`.
