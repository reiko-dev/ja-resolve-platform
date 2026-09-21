# MVP-06 — RED evidence

Date: 2026-09-21
Base: `MVP06_EXECUTION_BASE` = `dbb7cef5bb110de16450d70441ea733f40fb31a6`
Branch: `feature/mvp-06-cash-readiness`

RED-first: the MVP-06 suites were written **before** the migration, the domain aggregate, the repository, the
service, the controllers, the routes and the SQLite harness mirror existed.

## RED-MVP06-1 → RED-MVP06-5 — `tests/tow/mvp06/towMvp06CashPayment.test.js`

Raw output: `03-red/red-mvp06-1-5.txt`

```text
Test Suites: 1 failed, 1 total
Tests:       21 failed, 1 passed, 22 total
```

| RED id | Invariant | Observed failure |
| --- | --- | --- |
| RED-MVP06-1 | cash confirmation endpoint exists and records a receipt | `POST /tow/requests/{id}/cash-received` → **404** (route absent) |
| RED-MVP06-2 | canonical cash authority: one row, frozen accepted price, backend `received_at` | `tow_payments` table absent; no repository; no authority |
| RED-MVP06-3 | authz: wrong partner 403, customer 403, anonymous 401, unknown 404 | confirmation route absent → 404 for every principal |
| RED-MVP06-4 | accepted amount rehydrated as payment (`GET .../payment`, `TowRequest.payment`) | payment routes absent → 404; `TowRequest.payment` hardcoded `NOT_SELECTED` |
| RED-MVP06-5 | retry semantics: same/different valid keys → one payment, immutable `received_at` | no endpoint and no uniqueness authority |

Representative reproduction (verbatim from the raw output):

```text
● MVP-06 — CASH payment › RED-MVP06-1 — cash confirmation endpoint
  expect(received).toBe(expected)
  Expected: 200
  Received: 404

● MVP-06 — CASH payment › RED-MVP06-2 — canonical cash authority
  expect(received).toBe(expected)
  Expected: 200
  Received: 404

● MVP-06 — CASH payment › payment method selection › card and pix are not implemented in the MVP subset
  expect(received).toBe(expected)
  Expected: 422
  Received: 404
```

The single passing test in RED was the 404 assertion (an unknown request is 404) — it passed for the wrong
reason (every payment route was absent). It becomes a meaningful assertion only after the routes exist, which
the GREEN run below records.

## RED-MVP06-6 — end-to-end request → CASH flow

`tests/tow/mvp06/towMvp06Readiness.test.js` (S01–S20) did not exist before this delivery; its S19/S20
scenarios depend on the same missing endpoints and authority. RED evidence is the absence of the suite plus
the RED-MVP06-1..5 failures above, which are the terminal steps of that flow.

## Consequence

Implementation was performed only after this RED was persisted, in the order:

```text
migration 007 → domain aggregate → repository → service → controller/routes → wiring → SQLite mirror
```
