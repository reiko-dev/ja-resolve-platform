# MVP-06 — PostgreSQL concurrency gate (F1–F6)

Issue: #18 · Date: 2026-09-21
Harness: disposable PostgreSQL 14 on `DB_PORT=55434`, project `socorre-tow-test-55434-cb0d0933`.
Command: `DB_PORT=55434 npm run test:pg` style disposable environment (up → migrate 001..007 → suites → down).

```text
PASS tests/tow/mvp06/towMvp06Postgres.e2e.test.js
  MVP-06 PostgreSQL — CASH payment authority and concurrency
    ✓ F1 — concurrent cash confirmations produce ONE payment and ONE received_at
    ✓ F2 — different valid keys still produce exactly one payment
    ✓ F3 — a wrong partner racing the assigned partner can never win
    ✓ F4 — PostgreSQL itself rejects a duplicate payment authority
    ✓ F5 — cash cannot be RECEIVED before COMPLETED is committed
    ✓ F6 — a cancelled Tow can never produce a RECEIVED payment
    ✓ the two UNIQUE identities and every CHECK exist in PostgreSQL
    ✓ the database rejects an incoherent receipt and a non-CASH method
    ✓ migration 007 applies from an empty schema and down() is exact

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
```

## What each proof establishes

| id | proof |
| --- | --- |
| **F1** | 4 concurrent confirmations → every response is a 200 with the **same** canonical payment; exactly one row; one `received_at` (the frozen backend instant); `received_by_partner_id` is the assigned partner |
| **F2** | first confirmation, then a second with a **different valid key** after advancing the clock → identical DTO, still one row (the key is not the authority) |
| **F3** | two concurrent confirmations from the WRONG partner plus one from the assigned partner → both wrong ones 403 `not_assigned_partner`, the row belongs to the assigned partner |
| **F4** | a raw SQL `INSERT` duplicating `tow_request_id` is rejected with PostgreSQL `23505`; duplicating `assignment_id` under a different request id is also `23505` |
| **F5** | an uncommitted `COMPLETED` writer holds the request row lock; the blocked HTTP confirmation creates no row and sees `IN_TRANSIT`; after commit it succeeds with `CASH_RECEIVED` |
| **F6** | cash selected (`CASH_SELECTED`), then cancelled → confirmation 409 `invalid_tow_state`; the row stays `PENDING` with `received_at IS NULL` and `received_by_partner_id IS NULL` |

## Database guards asserted directly from the catalog

```text
pg_indexes   tow_payments_tow_request_id_unique, tow_payments_assignment_id_unique
pg_constraint tow_payments_method_check
              tow_payments_amount_check
              tow_payments_currency_check
              tow_payments_status_check
              tow_payments_receipt_coherence_check
information_schema  amount_cents = integer, received_at nullable
```

And a direct SQL attempt at an incoherent receipt (`RECEIVED` without `received_at`, `PENDING` with
`received_at`, `method = 'CARD'`, `amount_cents = -1`) is rejected with `23514` in every case.

## Inherited concurrency gates on this tree

| gate | result |
| --- | --- |
| MVP-05 E1–E6 | 6/6 GREEN |
| MVP-04 C1–C9 | 10/10 GREEN (includes C1, the concurrent-accept authority S13 binds to) |
| T01 baseline | 33/33 GREEN |
| MVP-03 | 7/7 GREEN |
| legacy | 9/9 GREEN |

See `20-inherited-postgres.txt`-style raw output captured in the receipt comment.
