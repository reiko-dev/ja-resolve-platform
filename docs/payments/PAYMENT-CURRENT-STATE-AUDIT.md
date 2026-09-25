# Payment Current-State Audit

**Branch:** `feat/Pagamentos`  
**PR:** #45  
**Phase:** 0 — Current-State Persistence and Contract Audit  
**Status:** COMPLETE  
**Backend audited HEAD before this document:** `32325233c9070c16ec330b037f203a3e7a53c2be`  
**Mobile audited main:** `90e8bac80f640450cf73c3726b6b1a80d4d972af`  
**Companion documents:**
- `docs/payments/PAYMENT-PLATFORM-FOUNDATION.md`
- `docs/payments/PAYMENT-PLATFORM-IMPLEMENTATION-PLAN.md`

---

## 1. Purpose and method

This is the required read-only audit before Phase 1 creates any Payment Platform persistence.

The goal is to identify every currently relevant financial authority, write path, projection, constraint and legacy subsystem so the new Payment Platform is introduced without:

- destroying historical financial data;
- creating a third competing payment authority;
- breaking the validated Tow CASH flow;
- trusting Store/client totals as canonical;
- silently reusing mock PSP infrastructure as production infrastructure;
- coupling settlement decisions to payment execution;
- treating legacy subscription/wallet/dispute behavior as the new architecture by accident.

No runtime, schema or API behavior is changed by this audit.

---

# 2. Executive result

The repository currently contains **two active payment architectures plus several embedded financial projections**:

```text
A. Canonical Tow financial path
   tow_requests.payment_method
            ↓
   tow_assignments.final_price_amount_cents
            ↓
   tow_payments
   CASH / integer cents / DB uniqueness

B. Legacy generic payment path
   POST /api/payments
            ↓
   payments
            ↓
   mock stripe / mercadopago / pagseguro
   decimal money / client amount / gateway-shaped status

C. Embedded financial projections / adjacent ledgers
   purchase_orders
   delivery_orders
   subscriptions + subscription_history
   wallets + wallet_transactions
   commissions
   disputes
   emergency_requests legacy payment projection
```

The canonical Tow path is materially stronger than the legacy generic path: it uses integer cents, frozen assignment pricing, database-enforced one-payment identity and guarded state transitions.

The legacy generic path is still mounted and writable, so it cannot simply be deleted. It must be isolated as compatibility/legacy while the new shared Payment Platform is introduced additively.

The Store mobile has a good internal cents authority, but the real backend boundary still converts it to decimal/double and sends client-calculated monetary totals to two independent write endpoints.

**Phase 0 conclusion, updated by project-stage execution policy:**

```text
PHASE_0_STATUS = COMPLETE
PHASE_1_READY = YES
REAL_USERS = NONE
AUTHORITATIVE_PAYMENT_HISTORY_TO_PRESERVE = NONE
DESTRUCTIVE_FINANCIAL_CLEANUP_ALLOWED = YES
LEGACY_PAYMENTS_REUSE_AS_NEW_CORE = NO
LEGACY_PAYMENT_BACKFILL_REQUIRED = NO
DUAL_WRITE_REQUIRED = NO
TOW_CASH_BEHAVIOR_CHANGE_ALLOWED = NO
STORE_CLIENT_TOTAL_AS_BACKEND_AUTHORITY = NO
SETTLEMENT_IMPLEMENTATION_ALLOWED = NO (until Gate S1)
```

The permission to discard legacy payment data does **not** imply that destructive cleanup must happen before it is useful. The implementation plan intentionally keeps Phase 1 low-blast-radius: build the clean core without backfill or dual-write, migrate current consumers, then delete the obsolete financial stack immediately after the last consumer moves.

---

# 3. Current financial topology

```text
                                ┌────────────────────┐
                                │   Mobile Cliente   │
                                │ checkout.totalCents│
                                └─────────┬──────────┘
                                          │ converts /100
                                          │
                     ┌────────────────────┴─────────────────────┐
                     │                                          │
                     ▼                                          ▼
             POST /purchase-orders                       POST /payments
                     │                                          │
                     ▼                                          ▼
              purchase_orders                              payments
              decimal money                                decimal money
              payment_status                               gateway status
                     │                                          │
                     │                                    mock gateways
                     │                                          │
                     └──────── no durable canonical link ───────┘


Canonical Tow:

TowRequest.payment_method
          │
          ▼
proposal accepted
          │
          ▼
tow_assignments.final_price_amount_cents
          │
          ▼
tow_payments
CASH / PENDING -> RECEIVED
DB uniqueness + guarded transition


Legacy settlement/dispute:

payments(completed)
      │
      ├── commissions
      │       └── wallets / wallet_transactions
      │
      └── disputes
              └── legacy refund mutation
```

---

# 4. Migration lineage

## 4.1 Active migration directory

The Knex configuration for development, test and production points to:

```text
socorre_ai_backend/database/migrations
```

The active sequence is the consolidated baseline plus modern Tow/service-catalog migrations.

The legacy migration directory is **not** the active migration source.

## 4.2 Important consequence

`database/migrations-legacy` is archival migration history, but many tables originally created there were consolidated into:

```text
database/migrations/001_baseline_schema.js
```

Therefore these tables are still part of the current database model even though their original migration files are under `migrations-legacy`.

Do not interpret "migrations-legacy" as "table is no longer active".

---

# 5. Canonical Tow financial path

## 5.1 Tow proposal and assignment pricing

### Authority

```text
tow_request_proposals.price_amount_cents
          ↓ proposal accepted
tow_assignments.final_price_amount_cents
```

The assignment freezes the accepted final service price.

### Money

```text
INTEGER cents
currency = BRL
```

### Database invariants

The current schema enforces, among other constraints:

- one assignment per Tow request;
- one assignment per accepted proposal;
- one live assignment per partner;
- one live assignment per vehicle;
- non-negative integer money;
- BRL currency;
- proposal creation idempotency;
- frozen route/tariff/vehicle pricing snapshot.

### Disposition

**KEEP**

The assignment final price remains the Tow business amount authority.

Payments must consume it; Payments must never recompute it.

---

## 5.2 `tow_requests.payment_method`

### Current meaning

The customer's commercial payment-method choice made at Tow request creation.

New first-party requests require the choice; historical requests may remain `NULL`.

Current implemented value:

```text
CASH
```

### Important boundary

This is a **business choice**, not the financial execution record.

### Disposition

**KEEP / EVOLVE**

Keep as the Tow-owned commercial choice.

Future card/PIX support may expand the accepted vocabulary, but the field must not become PSP state.

---

## 5.3 `tow_payments`

### Current authority

The canonical Tow CASH financial record.

Columns include:

```text
tow_request_id
assignment_id
method
amount_cents
currency
status
received_at
received_by_partner_id
```

### Database invariants

- `UNIQUE(tow_request_id)`;
- `UNIQUE(assignment_id)`;
- method must be `CASH`;
- amount is non-negative integer cents;
- currency must be `BRL`;
- status is `PENDING | RECEIVED`;
- PENDING cannot carry receipt metadata;
- RECEIVED requires both receipt timestamp and receiving partner.

### Write path

A new first-party payment is materialized inside the proposal-accept transaction from:

```text
TowRequest.payment_method
+
TowAssignment.final_price_amount_cents
```

The first-party flow does **not** require the legacy payment-method selection operation after acceptance.

The receipt transition uses a guarded:

```text
PENDING -> RECEIVED
```

update, making retries non-destructive.

### Disposition

**MIGRATE**

The behavior and historical records must be preserved, but Phase 3 should migrate this aggregate onto the shared Payment Platform.

Until that migration is proven, `tow_payments` remains authoritative for Tow CASH.

Do not dual-write two independent financial authorities without an explicit transitional invariant.

---

## 5.4 Tow payment compatibility endpoint

```text
PUT /tow/requests/{requestId}/payment-method
```

Current code and contract identify this as historical/recovery compatibility for old requests.

### Disposition

**COMPATIBILITY_ONLY**

Do not make it part of the modern first-party journey.

---

## 5.5 Tow CASH confirmation

```text
POST /tow/requests/{requestId}/cash-received
```

The endpoint is bodyless for financial amount/currency.

Amount always comes from the frozen assignment.

### Disposition

**KEEP BEHAVIOR**

Its implementation will move behind the shared Payments application layer during Phase 3, but the consumer-visible business behavior must remain stable.

---

# 6. Legacy generic `payments`

## 6.1 Current table

The active baseline contains a generic `payments` table with:

```text
amount DECIMAL(10,2)
fee_amount DECIMAL(10,2)
net_amount DECIMAL(10,2)

status:
pending
processing
completed
failed
cancelled
refunded

method:
credit_card
debit_card
pix
bank_slip
cash
bank_transfer

gateway
gateway_transaction_id
gateway_payment_id
gateway_response

user_id
partner_id
emergency_request_id
delivery_order_id
purchase_order_id
subscription_id
tow_proposal_id
payment_type
```

### Durable-idempotency state

There is no canonical:

```text
business_key UNIQUE
idempotency_key UNIQUE
(processor, external_transaction_id) UNIQUE
```

The gateway transaction identifier is indexed, not a durable uniqueness authority.

### Disposition

**COMPATIBILITY_ONLY → DEPRECATE**

This table is active and may contain historical data, so it must not be dropped in Phase 1.

It must also **not** be repurposed in-place as the new canonical Payment store.

---

## 6.2 Active POST `/api/payments`

This endpoint is mounted in `app.js`.

It currently accepts from the authenticated client:

- `amount`;
- `method`;
- `gateway`;
- domain references such as `partnerId`, `purchaseOrderId`, `emergencyRequestId`;
- optional method-specific payloads through the spread request object.

The service then calculates fees and persists the payment.

### Findings

#### P0-F01 — Client-controlled payment amount

**Severity: HIGH**

The request amount is financial input from the client.

This violates the new architecture:

> the business domain, not the payment client request, supplies the authoritative amount.

#### P0-F02 — Client-controlled processor selection

**Severity: HIGH**

The client supplies `gateway`.

This conflicts with the central `PaymentRoutingPolicy`.

#### P0-F03 — Domain-reference integrity is not the creation authority

**Severity: HIGH**

The generic route can receive business references from the request body. Payment creation is not currently driven by a verified business obligation loaded server-side.

#### P0-F04 — No durable create idempotency

**Severity: HIGH**

The generic create path has no idempotency key or unique business identity.

A retry can create another row.

#### P0-F05 — Insert and processor call are not one recoverable financial protocol

**Severity: HIGH**

The flow is:

```text
INSERT payment
→ call gateway
→ UPDATE payment with gateway response
```

There is no PaymentAttempt record and no durable recovery protocol for an unknown provider outcome.

#### P0-F06 — Cash is incorrectly gateway-shaped

**Severity: MEDIUM**

The generic service requires a `gateway` even though cash is a valid method.

The new architecture correctly models cash as `INTERNAL_CASH`, not a fake PSP.

### Disposition

**DEPRECATE FOR NEW WRITES**

Keep only while existing consumers are migrated.

No new feature should be built on this endpoint.

---

# 7. Legacy gateway implementations

Current gateway files:

```text
services/gateways/stripeGateway.js
services/gateways/mercadopagoGateway.js
services/gateways/pagseguroGateway.js
```

All three are simulations.

Characteristics include:

- artificial delay;
- random transaction identifiers;
- random success/failure status;
- no real provider SDK/API;
- no cryptographic webhook verification.

The generic webhook route explicitly returns `410 Gone` in production because real signature verification is not implemented.

No Stripe package/provider integration is present in the backend dependency list audited here.

### Positive existing control

A security regression test ensures the simulated gateways do not log raw card/PIX/bank-slip payload values.

### Remaining security boundary

The generic payment request/service can still receive method-specific raw data in backend memory. Logging hardening is not equivalent to provider tokenization.

### Disposition

**REMOVE_LATER**

They may remain as isolated legacy/dev fixtures until replacement, but must never become the implementation of the new `PaymentProcessorAdapter`.

---

# 8. Legacy `Payment.js` model consistency

The legacy model exposes methods that reference fields not present on the current baseline `payments` table, including logic for:

```text
refund_reason
is_conciliated
conciliation_id
```

The audited baseline does not define those fields on `payments`.

The only observed `refund_amount` in the baseline belongs to the disputes model, not the payments table.

### Disposition

**DEPRECATE**

Do not port these methods into the new core.

Real reconciliation and refunds must use first-class canonical persistence.

---

# 9. Store / Checkout

## 9.1 Mobile internal money model

The current mobile main has a strong local invariant:

```text
ClienteCheckoutSummary
├── subtotalCents
├── feesCents
├── discountCents
└── totalCents =
    subtotalCents + feesCents - discountCents
```

Cart items use:

```text
unitCents
subtotalCents = unitCents * quantity
```

Formatted BRL is a presentation projection.

Tests verify that checkout, PIX display, purchase-order payload and payment payload derive from the same local total.

### Disposition

**KEEP AS CLIENT INTENT/PRESENTATION**

This is a good client invariant.

It is **not** sufficient to make the client the backend financial authority.

---

## 9.2 Mobile/backend monetary boundary

The repository contract still uses doubles for:

```text
ClientePaymentCreate.amount
ClientePurchaseOrderCreate.subtotal
ClientePurchaseOrderCreate.totalPrice
unitPrice
deliveryFee
```

The runtime converts cents with `/ 100` before sending to the backend.

### Disposition

**MIGRATE**

Phase 4 must move the API boundary to exact cents or otherwise ensure that the backend never treats the client decimal as authority.

---

## 9.3 Purchase order creation

The active user route:

```text
POST /api/purchase-orders
```

accepts Store order creation.

The controller currently requires client-provided:

```text
subtotal
total_price
```

and writes them with `parseFloat`.

The baseline persists:

```text
subtotal DECIMAL
delivery_fee DECIMAL
taxes DECIMAL
discount DECIMAL
total_price DECIMAL
```

### P0-F07 — Store total is currently client-authoritative

**Severity: CRITICAL FOR PAYMENT MIGRATION**

The backend does not currently freeze a trusted Store order amount independently from the client payload.

Therefore Phase 4 cannot safely create canonical Payments from the current `purchase_orders.total_price` without first fixing how that order total is established.

### Required Phase 4 rule

The backend must derive/freeze the order monetary snapshot from trusted catalog/business inputs and expose integer-cent authority, e.g.:

```text
subtotal_cents
delivery_fee_cents
taxes_cents
discount_cents
total_cents
```

Exact naming is a Phase 4 implementation detail.

---

## 9.4 Purchase-order payment projection

Current `purchase_orders` also contains:

```text
payment_method
payment_status
paid_at
payment_info
```

### P0-F08 — Client can submit `payment_status` on order creation

**Severity: HIGH**

The user-facing create route allows authenticated users and the controller takes `payment_status` from the request body before inserting the order.

A business order must never accept client assertion of `paid` or `refunded` as financial truth.

### Disposition

**COMPATIBILITY_ONLY**

After Payment Platform integration these fields may remain as read projections for compatibility, but canonical financial status belongs to Payments.

Client writes to financial status must be eliminated.

---

## 9.5 Two independent checkout writes

Current mobile real flow is explicitly:

```text
POST /purchase-orders
then
POST /payments
```

There is no backend `/checkout` transaction.

The payment request is created from the same mobile `totalCents`, but the current call does not use the newly created purchase order as the server-side amount authority.

The audited runtime also does not pass that new `purchaseOrderId` into the subsequent payment creation.

### P0-F09 — Order/payment atomicity and identity gap

**Severity: HIGH**

Failure cases include:

- order created, payment creation fails;
- retry creates a second order;
- payment exists without durable order identity;
- client amount and persisted order amount can diverge;
- payment cannot reliably derive partner/store settlement identity from the order.

### Required Phase 4 result

The server-side flow must become equivalent to:

```text
create/freeze PurchaseOrder
        ↓
canonical order id + total_cents
        ↓
create/get Payment by stable business key
        ↓
Payment amount copied from server-side order authority
```

Retries must return the existing business/payment identity rather than duplicate it.

---

## 9.6 Current PIX screen

The current PIX screen:

- renders a seeded/mock transport payload as QR;
- displays `checkout.totalCents`;
- relies on a user action to continue confirmation.

The seed explicitly describes the PIX payload as mock transport data.

### Disposition

**MIGRATE**

The UI is reusable, but the financial semantics must change:

```text
QR created != PAID
user taps confirm != PAID
verified Stripe/provider event == financial confirmation
```

---

# 10. Delivery domain

The active delivery service is another potential future consumer of Payments.

It is stronger than current PurchaseOrder creation in one respect: it loads product data and calculates item/delivery totals on the backend.

However it still persists money as decimal and performs arithmetic through JS numeric/float values.

Embedded fields include:

```text
delivery_fee
items_price
total_price
payment_method
payment_status
```

### Disposition

**MIGRATE LATER**

Do not make delivery a Phase 1–4 blocker.

Do not treat its embedded `payment_status` as a future canonical payment state.

When delivery is connected to Payments, first convert/freeze its business price in integer cents.

---

# 11. Subscriptions

## 11.1 What the current subscription table represents

The current `subscriptions` table is partner-oriented:

```text
partner_id
type = mecanico | posto_combustivel | auto_pecas
monthly_fee
due_date
next_billing_date
payment_method
payment_gateway
gateway_subscription_id
auto_renew
status
```

This is not evidence of an existing end-user App Store/Google Play entitlement architecture.

### Important conclusion

Do **not** assume this legacy partner subscription model is the future mobile digital subscription model.

The relationship between partner B2B subscription and future app digital entitlements requires explicit domain design.

### Disposition

**KEEP BUSINESS DOMAIN / MIGRATE FINANCIAL INTEGRATION**

---

## 11.2 Subscription payment confirmation

The authenticated subscription routes include:

```text
POST /subscriptions/:id/payment
POST /subscriptions/:id/payment-failure
POST /subscriptions/:id/renew
```

The payment operation currently marks the subscription active / advances billing and records history without first proving a canonical provider Payment.

It records the history with `payment_id = null`.

### P0-F10 — Subscription state can become financially active without verified Payment

**Severity: HIGH**

The current operation is not an acceptable Apple/Google/Stripe financial confirmation boundary.

### P0-F11 — Subscription routes lack financial ownership/role enforcement at the route level

**Severity: HIGH**

The audited router applies authentication globally, but does not apply a role guard to the payment/renew operations. The controller shown does not establish ownership before changing the referenced subscription.

This must be corrected when the financial path is migrated.

### Disposition

**DEPRECATE CURRENT PAYMENT CONFIRMATION PATH**

Preserve subscription records, but replace payment activation with verified Payment Platform events.

---

## 11.3 `subscription_history`

The history table stores:

- actions;
- decimal amount;
- optional legacy payment_id;
- gateway_transaction_id;
- payment_method;
- billing period;
- audit metadata.

### Disposition

**COMPATIBILITY_ONLY / HISTORICAL AUDIT**

Do not use it as the canonical financial ledger.

Future history can reference canonical Payment IDs/events while old rows remain readable.

---

# 12. Wallets, commissions and settlement

## 12.1 Current tables

The baseline contains:

```text
wallets
wallet_transactions
commissions
```

All monetary balances/amounts are decimal.

The current architecture combines:

- commission calculation;
- partner earnings;
- wallet credits;
- withdrawals;
- payment references.

## 12.2 Current commission processing

A completed legacy payment can call `commissionService.processCommission`.

The service:

1. pre-reads `commissions` for an existing row by `payment_id`;
2. loads legacy `payments`;
3. parses decimal money with `parseFloat`;
4. calculates commission with JS floating arithmetic;
5. inserts `commissions`;
6. credits a wallet.

### P0-F12 — Commission duplicate prevention is not DB-enforced

**Severity: HIGH FOR SETTLEMENT**

`commissions.payment_id` is indexed but not unique in the audited baseline.

The pre-read is not a concurrency-safe idempotency authority.

### P0-F13 — Commission and wallet credit are not one clear shared financial transaction boundary

**Severity: HIGH FOR SETTLEMENT**

The commission service opens a transaction, while the wallet service creates its own transaction for balance mutation.

This is not an acceptable foundation for future marketplace settlement.

### P0-F14 — Wallet balance is mutable float/decimal state

**Severity: HIGH FOR SETTLEMENT**

Balances use decimal + parseFloat read/modify/write arithmetic rather than an immutable integer-cent ledger authority.

### Disposition

```text
wallets             COMPATIBILITY_ONLY
wallet_transactions MIGRATE / HISTORICAL
commissions         MIGRATE AFTER GATE S1
```

No Stripe Connect implementation may reuse this model blindly.

The existing data must remain readable until a settlement migration is explicitly designed.

---

# 13. Disputes and legacy refunds

The legacy `disputes` table references the legacy payment and stores decimal disputed/refund amounts.

The dispute service can:

- request a legacy refund;
- mutate the original `payments.status` to `refunded`;
- debit partner financial state;
- resolve the dispute.

The generic `paymentService.refundPayment` similarly treats refund primarily as a mutation of the original Payment.

### Disposition

**KEEP DISPUTE BUSINESS RECORD / MIGRATE FINANCIAL EFFECTS**

A future dispute may decide that a refund is owed, but the refund itself must be a first-class `Refund` record in Payments.

Do not collapse:

```text
Dispute resolution
Payment
Refund
Settlement reversal
```

into one status mutation.

---

# 14. Legacy EmergencyRequest payment projection

The old emergency-request model contains decimal pricing and a mechanism that writes payment state into its JSON price breakdown.

The legacy generic payment service contains Tow-specific helpers that calculate amount from:

```text
emergencyRequest.final_price
or
emergencyRequest.estimated_price
```

using `parseFloat`.

This is distinct from the canonical Tow module.

The canonical Tow contract explicitly states that current Tow cancellation does not create fee/debt/refund/wallet effects and that Tow payment amount derives from canonical assignment cents.

### Disposition

**DEPRECATE AS TOW FINANCIAL AUTHORITY**

Historical emergency data may remain, but no new canonical Tow payment work may depend on this path.

---

# 15. API and contract authority map

| Surface | Current role | Target disposition |
|---|---|---|
| `/api/tow/**/payment` | Canonical Tow CASH projection/actions | MIGRATE behavior into shared Payments in Phase 3 |
| `PUT /tow/.../payment-method` | Historical Tow compatibility | COMPATIBILITY_ONLY |
| `POST /api/payments` | Active legacy generic create | DEPRECATE FOR NEW WRITES |
| `GET /api/payments*` | Active legacy query | COMPATIBILITY_ONLY until consumers migrate |
| `POST /api/payments/:id/confirm` | Legacy/mock status polling | DEPRECATE |
| `POST /api/payments/:id/refund` | Legacy refund mutation | DEPRECATE |
| `POST /api/payments/webhook/:gateway` | Dev/mock only; production 410 | REMOVE_LATER |
| `POST /api/purchase-orders` | Active Store order create | MIGRATE monetary authority |
| purchase-order payment fields | Embedded financial projection | COMPATIBILITY_ONLY |
| subscription payment/renew endpoints | Legacy partner subscription mutation | MIGRATE |
| wallet endpoints | Active legacy balance/withdrawal | COMPATIBILITY_ONLY pending Gate S1 |
| dispute endpoints | Active dispute business flow | KEEP business flow, MIGRATE financial effects |

---

# 16. Persistence disposition matrix

| Structure | Money model | Current authority | Disposition |
|---|---|---|---|
| `tow_assignments.final_price_amount_cents` | integer cents | Tow final price | **KEEP** |
| `tow_requests.payment_method` | n/a | Tow commercial method choice | **KEEP / EVOLVE** |
| `tow_payments` | integer cents | Tow CASH financial state | **MIGRATE in Phase 3** |
| legacy `payments` | decimal | legacy generic financial state | **COMPATIBILITY_ONLY / DEPRECATE** |
| legacy gateway files | decimal/float | mock external processing | **REMOVE_LATER** |
| `purchase_orders` money columns | decimal | currently client-fed order money | **MIGRATE in Phase 4** |
| `purchase_orders.payment_*` | mixed | embedded projection | **COMPATIBILITY_ONLY** |
| `delivery_orders` money/payment fields | decimal | delivery business/projection | **MIGRATE LATER** |
| `subscriptions.monthly_fee` | decimal | partner subscription business price | **MIGRATE FINANCIAL REPRESENTATION** |
| subscription payment mutation | decimal/manual | legacy activation | **DEPRECATE** |
| `subscription_history` | decimal | legacy history | **COMPATIBILITY_ONLY** |
| `wallets` | decimal balances | legacy settlement balance | **COMPATIBILITY_ONLY** |
| `wallet_transactions` | decimal | legacy wallet ledger | **MIGRATE after S1** |
| `commissions` | decimal | legacy partner split | **MIGRATE after S1** |
| `disputes` | decimal | dispute business record + legacy effect | **KEEP business / MIGRATE financial effect** |
| EmergencyRequest payment projection | decimal/JSON | legacy emergency financial projection | **DEPRECATE** |
| old `tow_proposals` decimal path | decimal | legacy Tow proposal | **COMPATIBILITY_ONLY** |
| new `src/modules/payments/domain` | integer cents | target pure financial domain | **KEEP / IMPLEMENT** |

---

# 17. Gaps against the target Payment Platform

The following target capabilities do not exist in production-capable form yet:

```text
canonical shared Payment persistence
PaymentAttempt persistence
durable business-key idempotency
durable processor transaction uniqueness
provider event persistence
real Stripe adapter
Apple verification adapter
Google Play verification adapter
real provider signature verification
reconciliation job/state
first-class Refund persistence
settlement allocation model
Stripe Connect integration
canonical integer-cent Store order authority
canonical digital entitlement handoff
```

This is expected. The repository is ready for staged migration, not for direct PSP wiring.

---

# 18. Phase 1 constraints derived from the audit

Phase 1 may now proceed, but it must obey these constraints.

## 18.1 Do not reuse legacy `payments` in place

The table name is already occupied by an active, decimal, gateway-shaped API.

Even though legacy financial data may now be discarded, replacing that table in-place during Phase 1 would force unrelated cleanup of wallet, commission, dispute and subscription-history dependencies before the new core can even be exercised.

That is unnecessary work on the critical path.

### Revised Phase 1 direction

Create the new canonical Payment storage under a distinct physical table name:

```text
payment_obligations
payment_attempts
```

The domain entity remains named `Payment`.

No historical rows are migrated and no dual-write is introduced.

`payment_provider_events` is deferred to Phase 6 and `refunds` to Phase 8 so Phase 1 contains only persistence needed by the immediate application core.

The legacy financial tables may be deleted without preserving their rows as soon as Tow/Store/current consumers no longer depend on them.

---

## 18.2 Canonical money type

Use exact integer cents.

Preferred PostgreSQL representation:

```text
BIGINT amount_cents
CHAR/VARCHAR(3) currency
```

Application boundaries must continue enforcing JavaScript safe integers.

No canonical table should use `DECIMAL(10,2)` as internal money authority.

---

## 18.3 Keep Tow storage untouched until Phase 3

Phase 1 and Phase 2 must not delete or rewrite `tow_payments`.

Tow migration is an explicit later phase with regression evidence.

---

## 18.4 Do not connect Store until server-side order authority exists

A canonical Payment must not copy the current client-fed `purchase_orders.total_price` and call that "backend authority".

Phase 4 must first establish trusted frozen order cents.

---

## 18.5 Do not migrate settlement in Phase 1

```text
wallets
wallet_transactions
commissions
```

stay outside the Payment core migration until Gate S1 closes the merchant-of-record and settlement policy.

Payment persistence must not encode the future Stripe Connect charge model.

---

## 18.6 Do not use real PSP events to mutate legacy status directly

When Stripe/IAP lands later, provider events must resolve:

```text
PaymentAttempt
→ canonical Payment transition
```

not directly update:

```text
legacy payments.status
purchase_orders.payment_status
subscriptions.status
```

Those become projections/domain reactions.

---

# 19. Required integrity fixes by phase

These are not implemented in Phase 0, but they are mandatory closure items.

## Phase 1–2

- canonical durable idempotency;
- canonical state-transition guards;
- no client processor authority;
- no client amount authority in Payments.

## Phase 3

- preserve Tow DB uniqueness and cash idempotency;
- remove shared-core dependence on Tow-specific financial classes;
- keep first-party "choose method once" behavior.

## Phase 4

- move Store order money to backend-frozen integer cents;
- reject client financial status;
- bind Payment to canonical PurchaseOrder identity;
- make checkout retries safe;
- remove mobile-selected gateway;
- replace manual/mock PIX confirmation semantics.

## Phase 5–7

- provider tokenization / sensitive-data boundary;
- real Stripe adapter;
- authenticated provider events;
- reconciliation;
- Apple/Google server verification;
- replay protection.

## Phase 8

- first-class refunds.

## Phase 9+

- replacement for mutable legacy wallet/commission settlement after Gate S1.

---

# 20. Known high-risk findings ledger

| ID | Severity | Finding | Required closure |
|---|---|---|---|
| P0-F01 | HIGH | Generic Payment amount supplied by client | Phase 1–2 |
| P0-F02 | HIGH | Generic processor/gateway supplied by client | Phase 2 |
| P0-F03 | HIGH | Generic payment not created from server-verified business obligation | Phase 2–4 |
| P0-F04 | HIGH | Generic payment create lacks durable idempotency | Phase 1–2 |
| P0-F05 | HIGH | Legacy insert/provider/update has no PaymentAttempt recovery protocol | Phase 2/5/6 |
| P0-F06 | MEDIUM | Legacy cash requires gateway-shaped model | Phase 3/11 |
| P0-F07 | CRITICAL | Store backend accepts client-computed total | Phase 4 |
| P0-F08 | HIGH | Purchase-order create accepts client payment_status | Phase 4 |
| P0-F09 | HIGH | Store order and payment are separate, unbound writes | Phase 4 |
| P0-F10 | HIGH | Subscription can be activated without verified canonical Payment | Phase 7 / subscription migration |
| P0-F11 | HIGH | Subscription financial mutations lack explicit ownership/role guard | subscription migration |
| P0-F12 | HIGH | Commission duplicate prevention is not DB unique | Phase 9 |
| P0-F13 | HIGH | Commission + wallet credit lack one canonical settlement transaction boundary | Phase 9 |
| P0-F14 | HIGH | Wallet settlement uses mutable decimal/parseFloat balances | Phase 9 |
| P0-F15 | HIGH | Legacy Payment model contains schema-incompatible refund/reconciliation methods | Phase 11 |
| P0-F16 | HIGH | No real PSP/webhook verification exists | Phase 5–7 |

---

# 21. What is already trustworthy

The audit is not a conclusion that all current financial code is invalid.

The following foundations should be preserved:

### Tow

- frozen assignment amount;
- integer cents;
- DB uniqueness;
- atomic assignment/payment materialization;
- bodyless cash receipt;
- guarded PENDING -> RECEIVED transition;
- first-party single method selection.

### Mobile Store

- one internal checkout cents authority;
- cart item `unitCents`;
- derived `totalCents`;
- no parsing formatted money back into numeric authority;
- tests that keep checkout/payment/order payload amounts internally consistent.

### Security

- gateway logging regression test preventing sensitive payment payload values from appearing in logs;
- production refuses the simulated generic webhook as valid;
- Tow payment mock mode is forbidden in production.

These should be carried forward rather than reimplemented from scratch.

---

# 22. Phase 0 exit gate

The Phase 0 requirements from the implementation plan are satisfied:

- payment-related primary tables are inventoried;
- active and legacy migration lineage is understood;
- Tow financial authority is explicit;
- Store client/backend authority mismatch is explicit;
- generic payment write path is classified;
- subscriptions are classified;
- wallet/commission/dispute settlement is classified;
- mock providers and webhook status are classified;
- migration risks are documented;
- historical-data constraints are documented;
- Phase 1 can proceed without treating legacy `payments` or `tow_payments` as an accidental blank slate.

## Final status

```text
PHASE_0 = DONE

NEXT =
PHASE 1 — Canonical Persistence Contract

PHASE 1 DEFAULT =
additive canonical tables;
do not mutate legacy payments in place;
do not migrate Tow yet;
do not connect Store yet;
do not implement settlement yet.
```
