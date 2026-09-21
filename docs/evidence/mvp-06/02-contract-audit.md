# MVP-06 — Contract Audit (CASH)

Issue: #18
Contract files:
`docs/tow/tow-api-contract.base.openapi.yaml` (base, `info.version` `1.0.0-draft.2`)
`docs/tow/tow-api-contract.openapi.yaml` (canonical entrypoint, `info.version` **`1.0.0-draft.8`**)

Composition: the canonical document overrides `info`/`openapi`/`servers`/`security`/`tags`, merges
`components` canonical-over-base, inherits every `$ref`-only path item, and **replaces** an inline path item
entirely. `SHADOWED_METHOD_ALLOWLIST` is empty: no base method may be silently dropped
(`tests/helpers/towContract.js`, `scripts/tow/validate-openapi.js`).

Effective composed surface before MVP-06: **66 operations / 56 paths**, validated with 0 unresolved refs.

---

## 1. Payment-related operations in the frozen contract

### 1.1 `PUT /tow/requests/{requestId}/payment-method` — `selectTowPaymentMethod`

| Item | Value |
| --- | --- |
| Defined | base, inline; canonical inherits via `$ref` |
| Tags | Tow Customer |
| Security | bearerAuth |
| Parameters | `RequestId`, `Idempotency-Key` (required, 8–128) |
| Body | `SelectPaymentMethodInput` = `{ method: PaymentMethod, payment_source_token?: string\|null }`, `additionalProperties: false`, required `[method]` |
| Responses | `200` `PaymentSummaryResponse`; `409` `DomainConflict`; `422` `ValidationError` |

Classification: **MVP_SUBSET — IMPLEMENT_AS_IS for `cash` only.**
`PaymentMethod` is `[card, pix, cash]`. MVP-06 accepts exactly `cash`. `card` and `pix` are Phase 2: they are
schema-valid but **not implemented**, so the runtime answers `422 validation_error` with the explicit reason
`method_not_supported_in_mvp`. The enum is **not** narrowed (the long-term contract keeps describing CARD/PIX);
the implemented subset is recorded in the readiness report and in the contract revision note.
`payment_source_token` is accepted by the schema and **rejected** at runtime for cash (it is PSP-only);
MVP-06 never stores or forwards a token.

### 1.2 `GET /tow/requests/{requestId}/payment` — `getTowPaymentSummary`

| Item | Value |
| --- | --- |
| Defined | base, inline; canonical inherits via `$ref` |
| Tags | Tow Customer, Tow Partner |
| Parameters | `RequestId` |
| Responses | `200` `PaymentSummaryResponse`; `404` `NotFound` |

Classification: **IMPLEMENT_AS_IS** (plus the module's standard `401`/`403`, which the operation does not
enumerate; the composed contract lists responses, it does not forbid others — this is the same convention
MVP-05 used for the tracking read).

### 1.3 `POST /tow/requests/{requestId}/cash-received` — `markTowCashReceived`

| Item | Value |
| --- | --- |
| Defined | base, inline; canonical inherits via `$ref` |
| Tags | Tow Partner |
| Parameters | `RequestId`, `Idempotency-Key` (required, 8–128) |
| Body | **none** |
| Responses | `200` `PaymentSummaryResponse` ("Cash receipt recorded"); `409` `DomainConflict` |

Classification: **IMPLEMENT_AS_IS.**
The absence of a body is the contract-level proof that the **amount is not client-supplied**: there is no
field in which a client could send one. MVP-06 therefore rejects unknown body fields with `422`
(`additionalProperties`-equivalent strictness) so an invented `amount_cents` cannot be silently ignored.

### 1.4 `GET /tow/partner/financial-summary` — `getTowPartnerFinancialSummary`

Canonical-only inline operation. Response `PartnerFinancialSummary` carries `wallet_available_cents`,
`pending_settlement_cents`, `platform_fee_debt_cents`, `blocked_by_debt` — wallet/settlement/debt concepts
that MVP-06 explicitly defers.

Classification: **PHASE2_ONLY.** Not routed. Not re-declared. Not advertised.

### 1.5 Debts and payout batches

`GET /tow/customer/debts`, `POST /tow/customer/debts/{debtId}/pay` (card/pix only),
`GET/POST /admin/tow/payout-batches*`.

Classification: **PHASE2_ONLY.** Untouched.

## 2. Payment data shapes already frozen

```yaml
Money:
  type: object
  additionalProperties: false
  required: [amount_cents, currency]
  properties:
    amount_cents: { type: integer, minimum: 0 }
    currency: { const: BRL }

PaymentMethod: { type: string, enum: [card, pix, cash] }
PaymentStatus:
  type: string
  enum: [NOT_SELECTED, PENDING, REQUIRES_ACTION, AUTHORIZED, PAID, CASH_SELECTED,
         CASH_RECEIVED, CAPTURED, PARTIALLY_REFUNDED, REFUNDED, CANCELLED, EXPIRED, FAILED]

PaymentSummary:
  type: object
  required: [status, can_start_service]
  properties:
    request_id: { type: [string, 'null'] }
    method: oneOf [PaymentMethod, null]
    status: PaymentStatus
    amount_cents: { type: [integer, 'null'], minimum: 0 }
    currency: { type: [string, 'null'], enum: [BRL, null] }
    can_start_service: boolean
    pix: oneOf [PixPaymentDetails, null]

PaymentSummaryResponse = EnvelopePaymentSummary
  { success: const true, data: PaymentSummary }
```

`TowRequest.payment` is a **required** member of the embedded request DTO, so every recovery path must carry a
truthful summary. `TowRequest.allowed_actions` enumerates `select_payment_method` and `mark_cash_received`.

MVP-06 uses exactly `NOT_SELECTED` → `CASH_SELECTED` → `CASH_RECEIVED`. It never emits `PENDING`,
`REQUIRES_ACTION`, `AUTHORIZED`, `PAID`, `CAPTURED`, `PARTIALLY_REFUNDED`, `REFUNDED`, `CANCELLED`,
`EXPIRED` or `FAILED`. `pix` is always `null`.

### `can_start_service` semantics (MVP-06 definition)

| situation | value | reason |
| --- | --- | --- |
| no payment row (`NOT_SELECTED`) | `false` | nothing is selected |
| `CASH_SELECTED` | `true` | cash is a valid way to start; it is collected at completion, so the method being chosen is exactly what unblocks the service |
| `CASH_RECEIVED` | `true` | the obligation is already settled |

No runtime service transition is gated on this flag in MVP-06: `can_start_service` is informational, and the
MVP-05 graph remains the only execution authority. This is recorded because it is consumer-visible.

### `allowed_actions` — deliberate MVP-06 omission

`TowRequest.allowed_actions` (base contract enum) names `select_payment_method` and `mark_cash_received`.
**MVP-06 does not advertise them.** `allowed_actions` stays exactly as MVP-05 delivered it.

Reason: the member is defined by this module as "the actions the caller can complete right now", and adding
two new entries would change a surface already accepted by external review under MVP-05 (several accepted
suites assert the exact arrays). MVP-06 therefore takes the **omit-never-lie** option: an absent action is
not a false claim, and the authority consumers need is `TowRequest.payment.status` /
`GET /tow/requests/{requestId}/payment`:

| consumer question | authoritative signal |
| --- | --- |
| should the customer be offered "pay in cash"? | `request.payment.status === 'NOT_SELECTED'` and the request has an assignment |
| may the partner record the cash? | `request.payment.status !== 'CASH_RECEIVED'` and `request.state === 'COMPLETED'` and the caller is the assigned partner |

This decision is recorded here and in the readiness report so it can never be mistaken for an oversight. A
future delivery may advertise the two actions, which would then be a documented behavioral revision.

## 3. Error vocabulary

Canonical codes relevant here: `payment_not_ready`, `payment_failed`, `payment_method_not_changeable`
(already declared in the base error enum). MVP-06 returns:

| situation | status | code |
| --- | --- | --- |
| anonymous | 401 | `unauthorized` (auth middleware) |
| wrong customer / wrong partner / non-tow partner | 403 | `not_request_owner` / `not_assigned_partner` / `forbidden` |
| unknown or non-canonical request id | 404 | `not_found` |
| cash confirmation on a request that is not `COMPLETED` | 409 | `invalid_tow_state` (with `details.state`) |
| cash confirmation when the payment can never be cash | 409 | `payment_method_not_changeable` (**not reachable in MVP** — `method` is pinned to `CASH` by a DB CHECK; kept out of the reachable set) |
| selecting `card`/`pix`, or `payment_source_token` | 422 | `validation_error` |
| malformed/absent `Idempotency-Key` | 422 | `validation_error` |
| invented body fields on `cash-received` | 422 | `validation_error` |

No new error code is introduced by MVP-06.

## 4. Contract revision decision

The three operations already exist in the base contract. MVP-06 requires **no shape change**.

However, two consumer-visible facts must be recorded rather than silently assumed:

1. `selectTowPaymentMethod` implements only `cash`; `card`/`pix` are rejected with 422 in MVP.
2. `can_start_service` becomes `true` once `cash` is selected (it was always `false` before this delivery).

**Decision: bump the canonical contract `info.version` `1.0.0-draft.8` → `1.0.0-draft.9`** with an
`info.description` revision note recording exactly these two items, the deliberate `allowed_actions` omission
of §2, and the fact that no path, parameter, response shape or enum member is removed or narrowed and the
base contract stays byte-identical.

This follows the established revision pattern (draft.5 → draft.6 → draft.7 → draft.8) and satisfies the "no
silent mutation" rule. Existing assertions that pin the canonical version to `draft.8` are updated to
`draft.9` as part of the same revision.

## 5. Operations declared but **not** implemented by MVP-06

| Operation | Classification | Runtime |
| --- | --- | --- |
| `SELECT` card/pix payment method | PHASE2_ONLY | 422 `method_not_supported_in_mvp` |
| `getTowPartnerFinancialSummary` | PHASE2_ONLY | unrouted (404) |
| `listTowCustomerDebts`, `payTowCustomerDebt` | PHASE2_ONLY | unrouted (404) |
| `adminPreview/Create/Get/ProcessTowPayoutBatch` | PHASE2_ONLY | unrouted (404) |
| `adminListTowRequests` payment filters | PHASE2_ONLY | admin payment filters not implemented |
| counteroffer, dispute, review, no-show, rematch | PHASE2_ONLY | unrouted (404) |

No Phase 2 route is added and no Phase 2 table is created.
