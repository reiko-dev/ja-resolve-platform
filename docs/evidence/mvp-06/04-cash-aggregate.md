# MVP-06 — CASH aggregate and schema decisions

Issue: #18 · Branch: `feature/mvp-06-cash-readiness` · Date: 2026-09-21

## 1. Table

`tow_payments` — created by the single additive migration `007_mvp06_cash_payment.js`.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | serial PK | no | auto | |
| `tow_request_id` | integer | no | — | FK → `tow_requests.id` `ON DELETE CASCADE`, **UNIQUE** |
| `assignment_id` | integer | no | — | FK → `tow_assignments.id` `ON DELETE CASCADE`, **UNIQUE** |
| `method` | varchar(10) | no | — | CHECK `= 'CASH'` |
| `amount_cents` | integer | no | — | CHECK `>= 0` |
| `currency` | varchar(3) | no | `'BRL'` | CHECK `= 'BRL'` |
| `status` | varchar(20) | no | `'PENDING'` | CHECK `IN ('PENDING','RECEIVED')` |
| `received_at` | timestamptz | yes | — | set once, on the `PENDING → RECEIVED` transition |
| `received_by_partner_id` | integer | yes | — | FK → `partners.id` `ON DELETE RESTRICT` |
| `created_at` / `updated_at` | timestamptz | no | `CURRENT_TIMESTAMP` | |

Coherence CHECK (both directions, not a one-way implication):

```sql
(status = 'PENDING'  AND received_at IS NULL     AND received_by_partner_id IS NULL)
OR
(status = 'RECEIVED' AND received_at IS NOT NULL AND received_by_partner_id IS NOT NULL)
```

## 2. Why these two UNIQUE constraints

Both relationships are genuinely one-to-one in MVP-06:

- one Tow request has at most one assignment **ever** (`tow_assignments.tow_request_id` is already UNIQUE);
- one assignment belongs to exactly one request (`tow_assignments.proposal_id` is already UNIQUE).

So `UNIQUE(tow_request_id)` and `UNIQUE(assignment_id)` are both true statements about the domain, and each is
independently the idempotency authority for a concurrent double insert. Keeping both means a bypass of one
identity (a raw insert with a different request id but the same assignment) is still rejected.

This is what makes the concurrency proof `F4` (raw duplicate `INSERT`) meaningful: the database, not the
service, is the last line of defence.

## 3. Why the amount is copied, not joined

`tow_assignments` is the price authority and the assignment row is **never deleted** (it is released, not
removed), so the amount could always be read through the FK. It is stored on the payment anyway because a
payment is an **immutable historical receipt**: re-reading the price through a join would let a future edit of
the assignment silently rewrite a receipt that was already handed to a partner.

The copied value is always `tow_assignments.final_price_amount_cents` at the instant the payment row is
created (see `05-payment-authority.md`).

## 4. Why the legacy `payments` table is not used

| Requirement | legacy `payments` | `tow_payments` |
| --- | --- | --- |
| money type | `decimal(10,2)` BRL float | integer cents |
| FK to Tow aggregates | none | `tow_request_id`, `assignment_id` |
| uniqueness per Tow job | impossible (shared with 4 domains) | two UNIQUE identities |
| status vocabulary | PSP (`pending/processing/completed/failed/refunded`) | `PENDING`/`RECEIVED` |
| gateway columns | yes (unused, simulated) | none |

## 5. Why no column on `tow_requests`

A `payment_status`/`paid_at` column on `tow_requests` would be a **second truth** that could disagree with
`tow_payments`. `TowRequest.payment` is instead a projection of the single payment row, injected by the
application layer (`application/payment-summary.js`) into `buildTowRequestDto`. There is no mutable financial
flag on the request row.

## 6. Offline mirror

`tests/helpers/testDb.js` creates the same table with the same UNIQUE constraints and the same five CHECKs, so
the offline suites exercise the same invariants. Real PostgreSQL remains the authority for concurrency
(`towMvp06Postgres.e2e.test.js` F1–F6).

## 7. Migration discipline

- exactly **one** migration was added: `007`;
- the pinned migration lists in `scripts/tow/run-db-baseline-gate.js`,
  `tests/tow/baseline/dbBaseline.e2e.test.js` and `tests/tow/baseline/dbBaselineSafety.test.js` were updated in
  the same change, so a smuggled `008` still fails loudly;
- `down()` drops exactly `tow_payments` and nothing else;
- no seed, no backfill, no clock, no environment value: a pre-MVP-06 database has no payments, which is
  truthful.
