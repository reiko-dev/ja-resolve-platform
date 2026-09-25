# Payment Platform Code Contract

**Status:** IMPLEMENTATION BASELINE  
**Applies to:** `feat/Pagamentos`  
**Architecture:** `PAYMENT-PLATFORM-FOUNDATION.md`  
**Execution plan:** `PAYMENT-PLATFORM-IMPLEMENTATION-PLAN.md`

## 1. Purpose

This document is the code-level contract for humans and workhorses implementing Payments.

If implementation convenience conflicts with this document or the architecture foundation, convenience loses.

## 2. Module boundary

Canonical code lives under:

```text
src/modules/payments/
├── domain/
├── application/
├── ports/
├── adapters/
└── composition.js
```

Rules:

- `domain/` imports no Express, Knex, database singleton, Stripe SDK or legacy payment service.
- `application/` orchestrates domain + ports only.
- `ports/` defines capabilities required by application code.
- `adapters/` owns Knex/provider-specific infrastructure.
- `composition.js` is the only place that binds concrete persistence to the application service.
- Source domains consume the application service. They do not import persistence adapters or PSP SDKs.

## 3. Persistence authority

Canonical financial persistence is:

```text
payment_obligations
payment_attempts
```

The legacy `payments` table is not a source, migration target or fallback.

There is no dual-write.

### Payment

A Payment is one immutable business obligation plus mutable financial lifecycle state.

The business identity is `business_key`.

Examples:

```text
TOW_SERVICE:<assignment-id>
STORE_ORDER:<purchase-order-id>
PREMIUM_SUBSCRIPTION:<billing-cycle-id>
```

The business amount is frozen before Payment creation.

### PaymentAttempt

A PaymentAttempt is one concrete execution attempt against the selected processor.

Attempt creation never recalculates amount or changes source-domain pricing.

## 4. Idempotency contract

There are three different identities. Do not merge them:

```text
business_key
= identity of the business obligation

payer_id + idempotency_key
= identity of a client/application create command

processor + provider_idempotency_key
= identity of a processor mutation
```

An idempotency key replay with identical fingerprint returns the canonical row.

The same key/business identity with different financial data is a conflict, never an overwrite.

## 5. Money

Canonical money is:

```text
amount_cents: positive integer
currency: ISO-style uppercase 3-letter code
```

No canonical adapter/service accepts BRL-formatted strings or decimal money.

A future Stripe adapter may convert cents only at its external boundary if required by the Stripe API.

## 6. State transitions

Code must use the state-machine helpers.

Direct arbitrary status writes outside persistence migration/test setup are prohibited.

### Payment

```text
PENDING
 ├─ PROCESSING
 ├─ PAID
 ├─ CANCELLED
 └─ EXPIRED

PROCESSING
 ├─ PENDING
 ├─ PAID
 ├─ FAILED
 ├─ CANCELLED
 └─ EXPIRED

FAILED
 ├─ PROCESSING
 ├─ CANCELLED
 └─ EXPIRED
```

`PAID`, `CANCELLED` and `EXPIRED` are terminal in the Payment state machine.

Refund is a later separate aggregate. A refund must not transition PAID back to PENDING/FAILED.

### PaymentAttempt

```text
PENDING -> PROCESSING | SUCCEEDED | FAILED | CANCELLED
PROCESSING -> SUCCEEDED | FAILED | CANCELLED
```

Attempt terminal states never transition.

A failed attempt does not imply the business obligation disappeared.

## 6.1 Settlement evidence / PAID contract

Canonical authority:

```text
docs/payments/PAYMENT-SETTLEMENT-EVIDENCE-CONTRACT.md
```

The application integration surface must use:

```text
markPaymentPaid({ payment_id, evidence })
```

not arbitrary external `transitionPayment(..., PAID)`.

Accepted evidence types:

```text
INTERNAL_CASH_CONFIRMATION
PROCESSOR_PAYMENT_CONFIRMATION
STORE_BILLING_VERIFICATION
```

Accepted evidence is persisted immutably on the Payment with durable uniqueness of `(settlement_evidence_type, settlement_evidence_id)`.

A SUCCEEDED PaymentAttempt is necessary for processor-attempt settlement but is not sufficient by itself; the trusted adapter/orchestration must establish final collection/capture.

Client timestamps, callbacks, QR generation, token creation and unverified receipts cannot mark Payment PAID.

## 7. Cash

`INTERNAL_CASH` does not create an external PaymentAttempt.

Tow CASH migration will map the existing manual receipt lifecycle to canonical Payment state in Phase 3.

Until that phase, `tow_payments` remains untouched.

## 8. Provider execution

No provider SDK belongs in the application service.

Phase 5 adds a Stripe adapter behind the existing `PaymentProcessorAdapter`.

Required future flow:

```text
Payment
  ↓
PaymentAttempt
  ↓
PaymentProcessorAdapter
  ↓
Stripe
```

Never:

```text
Tow/Store service -> Stripe SDK
```

## 9. Source-domain integration contract

A source domain must supply:

```text
context_type
context_id
payer_id
commerce_type
sales_channel
amount_cents
currency
method
idempotency_key
```

Payments resolves the processor centrally.

Payments must not accept source-domain calculation inputs such as distance, cart lines, discount rules or tariff tables.

## 9.1 Store integration authority

Phase 4 Store integration is governed by:

\`\`\`text
docs/payments/PHASE-4-STORE-FINANCIAL-AUTHORITY-CONTRACT.md
\`\`\`

Payments receives only the frozen PurchaseOrder financial facts.

It must not accept Store calculation inputs or treat client-provided totals as authority.

Canonical mapping:

\`\`\`text
business_key = STORE_ORDER:<purchase_order_id>
amount_cents = PurchaseOrder.total_cents
commerce_type = PHYSICAL_GOOD
\`\`\`

Store controllers/application code must not directly mutate Payment status or import Payment persistence adapters.

## 10. What the workhorse should implement next

After this baseline:

1. prove the Phase 1 repositories and constraints on PostgreSQL, including concurrency;
2. finish any missing persistence tests without changing architecture;
3. close Phase 1 evidence and ledger;
4. harden Phase 2 application behavior;
5. migrate Tow CASH in Phase 3;
6. migrate Store authority + integration in Phase 4;
7. only then implement Stripe.

If a task appears to require changing these boundaries, stop and record the architectural reason instead of silently changing them.
