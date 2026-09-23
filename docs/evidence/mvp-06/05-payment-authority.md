# MVP-06 — Payment authority, creation rule and idempotency

Issue: #18 · Branch: `feature/mvp-06-cash-readiness` · Date: 2026-09-21

> **TOW ROUND REVISION (2026-09-23, contract draft.14).** The creation rule in §2 changed:
> the commercial choice is now made ONCE, at creation (`POST /tow/requests` requires
> `payment_method`), and the `POST /tow/proposals/{proposalId}/accept` transaction materializes
> the `TowPayment` from that choice in the same commit that creates the assignment. The amount
> authority (§1), the status mapping (§3), the method vocabulary (§4) and the idempotency
> guarantees (§5) are unchanged. `PUT /tow/requests/{requestId}/payment-method` is now a
> legacy/compatibility path only: the first-party flow never calls it, and for a request that
> already owns its payment it returns the canonical row without writing.

## 1. Amount authority

```text
tow_payments.amount_cents = tow_assignments.final_price_amount_cents
tow_payments.currency     = tow_assignments.final_price_currency   (= 'BRL')
```

`final_price_amount_cents` is the only money column in the Tow module, written exactly once at accept time
from the locked winning proposal (`assignment-service.js`), never updated afterwards. The payment service
reads it **inside** the transaction that creates the payment row.

Rejected sources (all of them are provably absent):

| candidate source | why rejected |
| --- | --- |
| request body `amount_cents` | no such field exists in the contract; the body of `markTowCashReceived` is rejected entirely (422) |
| query string | never read by the service; proven by attack `A2` |
| mobile/partner-supplied total | no operation accepts a price; the proposal body itself is empty by contract |
| latest tariff / settings | a settings change must never reprice an accepted job |
| a new Google quote | the route provider is never called on the payment path (asserted) |
| legacy `payments.amount` decimal | a different table and a different money type |

## 2. Creation rule (Tow round, contract draft.14)

The customer chooses the method **once**, before the request exists:

```text
POST /tow/requests                              { payment_method: "cash" }  -> TowRequest.payment_method = cash
POST /tow/proposals/{proposalId}/accept         (winning proposal)         -> creates PENDING
                                                                               from the commercial choice
POST /tow/requests/{requestId}/cash-received    (assigned partner)          -> transitions PENDING -> RECEIVED
GET  /tow/requests/{requestId}/payment          (rehydration)               -> NEVER writes
```

- **before the assignment** there is no payment row, truthfully: `assignment_id` and
  `final_price_amount_cents` do not exist yet, and the commercial method stays visible on
  `TowRequest.payment_method` / the opportunity item. `TowRequest.payment` projects `NOT_SELECTED`;
- **at accept** the payment is materialized INSIDE the assignment transaction (`PENDING`,
  `amount_cents = assignment.final_price_amount_cents`, `currency = assignment.final_price_currency`), so
  `ASSIGNED` and `CASH_SELECTED` commit together or not at all. The consistency rule
  `TowRequest.payment_method == TowPayment.method` is enforced by construction: the method comes from the
  request, never from a second selection;
- **the first-party journey never calls `PUT /tow/requests/{requestId}/payment-method`**. That operation
  remains a legacy/compatibility path for historical requests (created before draft.13, `payment_method =
  null`) and for idempotent recovery; for a request that already owns its payment it returns the canonical
  row before any state check and writes nothing.

Why this is the smallest architecture that satisfies the brief:

- **one payment** — guaranteed by `UNIQUE(tow_request_id)` + `UNIQUE(assignment_id)`, not by a read-then-write;
- **frozen accepted amount** — the amount is copied from the assignment at accept and never recomputed;
- **rehydratable status** — the row is the only state; a process restart re-reads it (attack `A4`);
- **idempotent confirmation** — a retry finds the row and returns it unchanged, and the guarded
  `PENDING → RECEIVED` update (with `WHERE status = 'PENDING'`) cannot restamp `received_at`;
- **no scheduler** — nothing is created for a job that never reaches an assignment, so no clock-driven state
  can exist.

The alternative (`create at completion`) was rejected: it would fuse the payment into the completion
transaction and make the separate `mark_cash_received` operation (the one the contract declares) impossible to
implement truthfully. Because the assignment row survives release, the separate operation loses **no**
authority. The pre-draft.14 alternative (lazy creation on the first financial write) was superseded by the
product rule that the method is chosen exactly once, at creation.

## 3. Status mapping

| persisted `tow_payments.status` | consumer `PaymentSummary.status` | `can_start_service` |
| --- | --- | --- |
| (no row: pre-assignment, or historical request without a choice) | `NOT_SELECTED` | `false` |
| `PENDING` (materialized at accept) | `CASH_SELECTED` | `true` |
| `RECEIVED` (partner confirmed) | `CASH_RECEIVED` | `true` |

The persistence vocabulary is deliberately the minimum the delivery brief allows. Every other member of the
frozen `PaymentStatus` enum describes CARD/PIX, refunds or settlement and is **unreachable** in this phase.
Since draft.14, a NEW request can no longer be observed as `NOT_SELECTED` after a successful accept: the
accept materializes `PENDING` (`CASH_SELECTED`) from the commercial choice.

## 4. Method

`method = 'CASH'` in persistence, `cash` in the DTO. `card` and `pix` are schema-valid in the long-term
contract but answer `422 validation_error` with `reason: method_not_supported_in_mvp`. `payment_source_token`
is rejected for cash (there is no gateway to send it to).

## 5. Idempotency

`Idempotency-Key` is declared by the contract and is **validated** (8–128 chars, 422 before any transaction
opens). It is **not** the idempotency authority:

| scenario | outcome |
| --- | --- |
| same key retried | 200, same canonical payment, same `received_at` |
| different valid key | 200, same canonical payment |
| concurrent confirmations | one row (`F1`); the request row lock serializes them |
| raw duplicate insert | rejected by PostgreSQL `23505` (`F4`) |

This mirrors MVP-04 (proposal id is the authority) and MVP-05 (canonical state is the authority).

## 6. Authz

| operation | principal | source of identity | foreign caller |
| --- | --- | --- | --- |
| `PUT payment-method` | owning customer | `req.user.id` | 403 `not_request_owner` |
| `GET payment` | owning customer OR assigned partner | `req.user.id` / `req.user.partner_id` | 403 |
| `POST cash-received` | assigned partner | `req.user.partner_id` | 403 `not_assigned_partner` |

No request body, query or path field can select a principal. `received_by_partner_id` is always the
authenticated partner of the **assignment**, never a client value. Ownership is checked **before** any state
is inspected, so a foreign caller cannot use the error code as a state oracle.

## 7. Completion prerequisite

`POST cash-received` requires `tow_requests.state = 'COMPLETED'`. Every other state answers
`409 invalid_tow_state` with `details.state`:

`SEARCHING`, `NEGOTIATING`, `ASSIGNED`, `EN_ROUTE`, `ARRIVED`, `IN_TRANSIT`, `CANCELLED`.

`F5` proves the race: a confirmation blocked behind an uncommitted completion cannot create any payment row,
and resolves against the committed `COMPLETED` state after the commit.

## 8. Exemption from the module gate

Payments, like the MVP-05 milestones, are **not** gated by `assertNewBusinessAllowed()`. Confirming cash for a
job that already ran is drain work; a disabled module must never strand a partner who already handed over
cash. Attack `A3` asserts both halves: the receipt succeeds after disable, while a new request is blocked.

## 9. `allowed_actions` — documented omission

MVP-06 does **not** add `select_payment_method` / `mark_cash_received` to `TowRequest.allowed_actions`. That
member is defined as "what the caller can complete right now"; adding entries would mutate a surface already
accepted under MVP-05. An omitted action is not a false claim. The authoritative consumer signals are
`TowRequest.payment.status` and `GET /tow/requests/{requestId}/payment`. See `02-contract-audit.md` §2.
