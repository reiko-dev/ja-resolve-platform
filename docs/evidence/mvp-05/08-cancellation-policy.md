# MVP-05 — 08 Cancellation Policy

> Who may cancel, until when, what is recorded, and what is deliberately NOT.
> Service: `src/modules/tow/application/cancellation-service.js`.
> Contract: `POST /tow/requests/{requestId}/cancel` (draft.8).

## Window: before the vehicle is loaded

| state | customer cancel | assigned partner cancel |
| --- | --- | --- |
| `ASSIGNED` | ✅ 200 | ✅ 200 |
| `EN_ROUTE` | ✅ 200 | ✅ 200 |
| `ARRIVED` | ✅ 200 | ✅ 200 |
| `IN_TRANSIT` | ❌ 409 `invalid_tow_state` | ❌ 409 `invalid_tow_state` |
| `COMPLETED` / `CANCELLED` | ❌ 409 `invalid_tow_state` | ❌ 409 `invalid_tow_state` |
| `SEARCHING` / `NEGOTIATING` | ❌ 409 `invalid_tow_state` (MVP-04 owns those states) | ❌ 409 `invalid_tow_state` |

`IN_TRANSIT` is the cut-off because the service is being performed. This delivery
has **no fee, refund, debt, rematch or dispute** to settle a performed job with,
so a cancel there would strand the job in a state nothing can price. The refusal
is a 409 `invalid_tow_state` with `details.state`, not a silent no-op.

Cancellation is legal from exactly the three states the graph allows
(`CANCELLABLE_TOW_REQUEST_STATES`), and the same pure state machine answers for
both actors — there is no per-actor edge.

## Authorization, in order

Both parties use the same endpoint; the authenticated principal decides the
authority that is checked:

| caller | authority | failure |
| --- | --- | --- |
| customer | `tow_requests.customer_id` | 403 `not_request_owner` |
| partner | `tow_assignments.partner_id` (occupancy `released_at IS NULL`) | 403 `not_assigned_partner` |
| admin / any other role | none — admins do not cancel customer jobs in this delivery | 403 |
| unauthenticated | — | 401 |

The ownership check runs **before** the state is inspected (the shared
`job-lock` preamble), so a foreign caller cannot use the error code as a state
oracle: a non-owner gets 403 whether the job is `ASSIGNED` or `IN_TRANSIT`.
A malformed request id is a 404 before the database is asked. `Idempotency-Key`
is required (8–128 chars) and validated before any mutation.

## What is recorded

One guarded statement writes the state, the instant and the attribution together:

```
state = 'CANCELLED'
cancelled_at = <backend clock>
cancelled_by_actor_type = 'customer' | 'partner'
cancelled_by_actor_id   = <the authenticated principal's id>
cancellation_reason     = <optional, <= 2000 chars>
terminal_reason         = 'CUSTOMER_CANCELLED' | 'PARTNER_CANCELLED'
```

and, **in the same transaction**, the assignment is released
(`released_at = now`, `release_reason = 'CANCELLED'`), guarded by
`released_at IS NULL`.

The reason is optional and free text (bounded at 2000 chars by a CHECK): the
delivery records *why* as given, never as a taxonomy it invents. There is no
cancellation-fee column, no refund row, no debt row and no partner penalty —
`cancellation_reason` is text, not a price.

## Attribution is written once, by the winner

Two cancellations racing (customer vs partner, or a retry of either) resolve to
**one** attribution:

- the row lock (`SELECT ... FOR UPDATE`) serializes them on PostgreSQL, and the
  guarded CAS `WHERE state = :from` is the authority on SQLite;
- the winner's `cancelled_by_actor_*`, `cancelled_at` and `terminal_reason` are
  the ones persisted;
- the loser sees `state = 'CANCELLED'`, which is a **REPLAY**: 200, and the body
  reports the WINNER's `terminal_reason` — the second caller is told who actually
  cancelled, never told its own attribution was applied;
- exactly ONE release happens (`release_reason = 'CANCELLED'`), and the second
  caller's `releaseByRequestId` matches 0 rows.

The PostgreSQL gate proves this with two real concurrent requests (E3), and the
blocked-writer gate (E6) proves a cancellation waiting on an uncommitted terminal
writer reads the committed attribution instead of overwriting it.

## Terminal release, always

A cancellation is terminal, so the assignment is released in the same transaction
— the partner stops being occupied the instant the job is cancelled. The
assignment row is **never deleted**: the job stays in the partner's history and
the customer's recovery still resolves the same partner, vehicle and price.
`tests/tow/mvp05/towMvp05Release.test.js` covers both terminals (`COMPLETED` and
`CANCELLED`) and asserts the release is idempotent (a second call matches 0 rows
and changes nothing).

## Idempotent replay

A repeated cancel (same key, different valid key, or after a lost response) is a
200 replay of the canonical row and writes nothing — including no second
release and no attribution change. This is the same canonical-state idempotency
the milestone operations use; the delivery keeps no cancellation key table.

## What is NOT here

No cancellation fee, no refund, no debt, no partner penalty, no dispute, no
rematch, no "cancel request" approval flow, no customer-confirmation step, and no
admin override. `docs/evidence/mvp-05/14-scope-audit.md` records the absence as a
scope check, not a promise.
