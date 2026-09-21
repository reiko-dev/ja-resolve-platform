# MVP-06 — Current State Delta Audit

Issue: #18 — MVP-06 — CASH Payment & Lean End-to-End Ready Gate
Execution base: `MVP06_EXECUTION_BASE` = `dbb7cef5bb110de16450d70441ea733f40fb31a6`
Branch: `feature/mvp-06-cash-readiness`
Audit date: 2026-09-21

This audit answers one question: what already exists in the repository that MVP-06 can reuse,
what must be adapted, what must be rejected, and what belongs to Phase 2 (#33)?

---

## 1. TowRequest

| Item | Fact |
| --- | --- |
| Table | `tow_requests` (migration `004_mvp03_tow_requests.js`, extended by `006_mvp05_service_execution_tracking.js`) |
| Identity | `id` serial PK |
| Owner | `customer_id` → `users.id` (`ON DELETE CASCADE`) |
| State | `state` varchar(30), CHECK enum, 11 states |
| Money columns | **none** — `004` header states "no pricing, route, assignment or payment column exists"; `006` adds none |
| Partner reference | **none** — the link is reverse: `tow_assignments.tow_request_id` |
| Terminal authority | `state` + `terminal_reason` + milestone instants, with DB coherence checks |
| Contract DTO | `domain/tow-request.js:buildTowRequestDto` — `payment` currently hardcoded neutral (`NOT_SELECTED`, no method, no amount, `can_start_service:false`) |

MVP decision: **do not add a payment column to `tow_requests`.** Payment is a separate aggregate with its
own table; `TowRequest.payment` is a **projection** of that aggregate, loaded by the application layer and
injected into the DTO. A column on `tow_requests` would create a second truth.

## 2. TowAssignment

| Item | Fact |
| --- | --- |
| Table | `tow_assignments` (migration `005_mvp04_proposals_assignments.js`) |
| Identity | `id` serial PK |
| Uniqueness | `UNIQUE(tow_request_id)`, `UNIQUE(proposal_id)`; partial unique on live `partner_id` / `tow_vehicle_id` |
| **Price authority** | `final_price_amount_cents` integer NOT NULL, `final_price_currency` varchar(3) NOT NULL default `'BRL'` |
| Price checks | `final_price_amount_cents >= 0`, `final_price_currency = 'BRL'` |
| Provenance | copied at accept from the locked winning proposal: `final_price: { amount_cents: locked.price_amount_cents, currency: locked.price_currency }` (`assignment-service.js:115`) |
| Lifecycle | `assigned_at`, `released_at`, `release_reason`; released on `COMPLETED`/`CANCELLED` in the same transaction; the row is **never deleted** |

**Canonical amount authority for CASH = `tow_assignments.final_price_amount_cents`.**
`final_price_amount_cents` is the **only** money column in the Tow module and is the frozen accepted price.
There is no `accepted_price` column and no second price copy. Correct field name is
`final_price_amount_cents` (NOT `final_price_cents`).

## 3. Execution state / COMPLETED semantics

- State machine authority: `domain/tow-request-state-machine.js`.
- Legal MVP graph: `ASSIGNED → EN_ROUTE → ARRIVED → IN_TRANSIT → COMPLETED`; cancellation only from
  `ASSIGNED | EN_ROUTE | ARRIVED`.
- `COMPLETED` is written by `execution-service.js` via a guarded CAS (`applyExecutionTransition`) in ONE
  transaction that also releases the assignment (`releaseByRequestId`).
- DB coherence: `tow_requests_completed_state_check` — `(state = 'COMPLETED') = (completed_at IS NOT NULL)`.
- The assignment row **survives** release, so after `COMPLETED` the canonical assignment (and therefore the
  frozen final price) is still resolvable by `tow_request_id`.

MVP decision: cash reception requires `state === 'COMPLETED'`. Because the assignment is still readable
after release, the amount authority remains resolvable at confirmation time. This is why reception does not
need to be fused into the completion transaction: the separate-operation form has **no lost authority**.

## 4. Existing PaymentService

`src/services/paymentService.js` (792 lines, legacy singleton):

- Gateway map: `stripe`, `mercadopago`, `pagseguro` → `src/services/gateways/*`, all three **simulated**
  (no HTTP client, no SDK, no `process.env`, `setTimeout` + `Math.random`).
- Writes the legacy `payments` table (`decimal(10,2)` BRL floats) and, on completion,
  `commissions` + `wallets` + `wallet_transactions` through `commissionService`.
- Tow-specific methods `createTowEmergencyPayment` / `createTowCancellationFeePayment` are reachable **only**
  from the legacy `/api/emergency-requests/:id/payment` routes and default to `method:'pix'`,
  `gateway:'mercadopago'`.
- Money is floating-point BRL, not cents.

Classification: **REJECT** for the Tow MVP payment path. Reason: it couples a Tow payment to a simulated PSP,
uses a different money representation (floats), a different aggregate root (`emergency_requests`) and a
different table. Reusing it would make the CASH flow depend on a fake gateway and on `decimal` money.

## 5. Legacy payment tables

`database/migrations/001_baseline_schema.js` creates `payments`, `wallets`, `wallet_transactions`,
`commissions`, `disputes`.

| Table | Money | Key columns |
| --- | --- | --- |
| `payments` | `decimal(10,2)` | `user_id`, `partner_id`, `emergency_request_id`, `method enum(... 'cash' ...)`, `status enum(pending,processing,completed,...)`, `gateway`, `payment_type`, `tow_proposal_id` |
| `wallets` | `decimal(10,2)` | balances |
| `wallet_transactions` | `decimal(10,2)` | ledger |
| `commissions` | `decimal(10,2)` | split |

Classification: **REJECT** as the CASH authority, **PHASE2** as a future financial stack.

Reasons to reject: no FK exists from any legacy payment row to `tow_requests`/`tow_assignments`; the money
type is decimal, not integer cents; `status` vocabulary (`pending/processing/completed/...`) is a PSP
vocabulary; and the table is shared with four non-Tow domains, so a Tow-only uniqueness rule cannot be
expressed on it without narrowing other domains. Migration `005` header already states the legacy rejection.

## 6. PSP adapters

| Adapter | File | Real network? | Credentials? |
| --- | --- | --- | --- |
| Stripe | `src/services/gateways/stripeGateway.js` | no | none |
| MercadoPago | `src/services/gateways/mercadopagoGateway.js` | no | none |
| PagSeguro | `src/services/gateways/pagseguroGateway.js` | no | none |

All three are **simulated** and the `/api/payments/webhook/:gateway` handler returns `410 Gone` in
production.

Classification: **PHASE2** (or REJECT for MVP). MVP-06 must make **zero** calls into any of them, and the
module must not import them at all.

## 7. Payment status vocabulary (contract)

`PaymentMethod` = `[card, pix, cash]`
`PaymentStatus` = `[NOT_SELECTED, PENDING, REQUIRES_ACTION, AUTHORIZED, PAID, CASH_SELECTED, CASH_RECEIVED, CAPTURED, PARTIALLY_REFUNDED, REFUNDED, CANCELLED, EXPIRED, FAILED]`

MVP persistence uses the **minimum** model required by the delivery brief:

```text
tow_payments.status ∈ { PENDING, RECEIVED }
```

and maps to the frozen consumer vocabulary:

| `tow_payments.status` | `PaymentSummary.status` | meaning |
| --- | --- | --- |
| (no row) | `NOT_SELECTED` | no payment exists for this request |
| `PENDING` | `CASH_SELECTED` | cash chosen; not yet handed over |
| `RECEIVED` | `CASH_RECEIVED` | cash received, `received_at` frozen |

No `PENDING → REQUIRES_ACTION/AUTHORIZED/PAID/CAPTURED/...` state is reachable in MVP. No enterprise
settlement state is added to the database.

## 8. Money representation

`domain/pricing.js` header: Tow money is **always integer cents**, currency fixed `BRL`; `ROUND_HALF_UP` only
at the cent boundary. `Money` contract schema is `{ amount_cents: integer >= 0, currency: const BRL }`.

MVP decision: `tow_payments.amount_cents` is `integer NOT NULL CHECK (>= 0)`, `currency` is
`varchar(3) NOT NULL DEFAULT 'BRL' CHECK (= 'BRL')`. **No decimal arithmetic anywhere in Tow.**

## 9. Idempotency utilities

`domain/idempotency.js`:

- `validateIdempotencyKey(value)` — required, 8–128 chars, shared by every operation whose contract declares
  the `Idempotency-Key` header.
- `canonicalFingerprintSource(payload)` — for `POST /tow/requests` only.

MVP decision: cash confirmation does **not** need a generalized key table. The idempotency authority is the
**database uniqueness** on the payment identity (`UNIQUE(tow_request_id)`, `UNIQUE(assignment_id)`) plus the
guarded status transition. This exactly mirrors MVP-04/MVP-05: `Idempotency-Key` is validated (422) but the
canonical row, not the key, is the idempotency authority. A retry with a **different valid key** must still
return the same payment.

## 10. Authz utilities

`application/job-lock.js`:

- `lockRequestForCustomer({requests, requestId, customerId})` — 404 non-canonical/unknown, 403 foreign owner.
- `lockJobForPartner({requests, assignments, requestId, partnerId})` — 404 non-canonical/unknown, 403 for a
  partner that does not hold the assignment. **Ownership is checked before state**, so a foreign caller can
  never use the error code as a state oracle.

`http/middleware.js`: `requireCustomer`, `requireTowPartner`, `requireCustomerOrTowPartner`, `requireAdmin`.

MVP decision: reuse these exact utilities. The partner identity comes **only** from `req.user.partner_id`;
`select_tow_payment` (customer) uses `req.user.id`. No request-body, query or path field ever selects a
principal.

## 11. Customer / partner recovery DTO

| Surface | File | Today |
| --- | --- | --- |
| `GET /tow/requests/{id}` | `tow-request-service.getForCustomer` | assignment + viewer-aware `allowed_actions`; `payment` neutral |
| `GET /tow/requests` | `tow-request-service.listForCustomer` | batch assignments; `payment` neutral |
| `GET /tow/partner/jobs` | `tow-request-service.listJobsForPartner` | batch assignments; `payment` neutral |
| `GET /tow/requests/{id}/tracking` | `tracking-service.read` | tracking point only |

MVP decision: `buildTowRequestDto` gains an injected `payment` option and the three TowRequest read paths (plus
the assignment/execution/cancellation write responses) load the payment summary from the canonical repository.
The default remains the truthful empty `NOT_SELECTED` summary, so a caller that has not loaded it advertises
nothing rather than guessing. **No second payment DTO and no competing mutable financial status.**

## 12. Classification summary

| Artifact | Classification | MVP-06 action |
| --- | --- | --- |
| `tow_assignments.final_price_amount_cents` | **REUSE** | canonical amount authority |
| `tow_assignments` uniqueness / lifecycle | **REUSE** | payment identity anchors on `assignment_id` |
| `domain/idempotency.validateIdempotencyKey` | **REUSE** | 422 before any mutation |
| `application/job-lock` | **REUSE** | authz + serialization point |
| `domain/errors` + `http/error-mapper` | **REUSE** | new codes added if required (none needed) |
| `domain/tow-request.buildTowRequestDto` | **ADAPT** | inject truthful `payment` summary |
| `tow-request-service` / `assignment-service` / `execution-service` / `cancellation-service` | **ADAPT** | load payment summary for the response DTO |
| legacy `payments` table | **REJECT** | different money type + no Tow FK |
| legacy `paymentService` | **REJECT** | simulated PSP coupling, float money |
| simulated Stripe/MercadoPago/PagSeguro adapters | **PHASE2** | never called by CASH |
| `wallets` / `commissions` / `wallet_transactions` / `disputes` | **PHASE2** | untouched |
| CARD / PIX runtime | **PHASE2** | rejected with 422 (documented subset) |
| refunds/debts/settlement/payout | **PHASE2** | untouched |

## 13. New artifacts required

1. `database/migrations/007_mvp06_cash_payment.js` — one coherent migration creating `tow_payments`.
2. `domain/tow-payment.js` — record builder, validators, DTO projection, status mapping.
3. `adapters/persistence/tow-payment-repository.js` — the only writer of the table.
4. `application/payment-service.js` — `selectMethod`, `markCashReceived`, `getSummary`.
5. `http/payment-controller.js` + three routes.
6. SQLite harness mirror in `tests/helpers/testDb.js`.
7. Narrowed architecture bans in the MVP-03/MVP-04 suites (they banned `tow_payments` while no delivery owned
   it; MVP-06 now owns it) and a new MVP-06 architecture suite that bans what remains unimplemented.
