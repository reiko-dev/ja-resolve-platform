# Phase 2 — Payment Application Core Execution Plan

**Branch:** `feat/Pagamentos`  
**PR:** #45  
**Status:** BLOCKED_BY_PHASE_1  
**Prerequisite:** Phase 1 — Canonical Persistence Contract = DONE  
**Primary implementation surface:** `socorre_ai_backend/src/modules/payments/`

---

## 1. Objective

Phase 2 hardens the shared Payment application core so that business domains can create, query and evolve financial obligations without depending on HTTP or a concrete payment provider.

The target is a complete financial lifecycle that can be exercised using the canonical repositories plus fake/in-memory processor evidence only.

Phase 2 does **not** integrate Tow, Store, Stripe, Apple, Google, refunds, provider events, reconciliation or settlement.

The output of this phase is the stable application contract that later bounded contexts will consume.

---

## 2. Entry gate

Do not start Phase 2 until Phase 1 is formally closed.

Phase 1 closure requires, at minimum:

- migration 011 validated on PostgreSQL;
- Payment persistence constraints green;
- PaymentAttempt persistence constraints green;
- concurrency/idempotency evidence green;
- focused Payments tests green;
- Tow regression tests preserved;
- Phase 1 ledger updated to `DONE`.

If one of these is still failing, fix Phase 1 first.

---

## 3. Existing baseline

The following capabilities already exist in the current branch and should be hardened rather than rewritten:

```text
createObligation()
getPayment()
beginAttempt()
transitionPayment()
transitionAttempt()
attachExternalTransaction()
```

Existing supporting foundations:

```text
Payment / PaymentAttempt domain vocabulary
central processor routing policy
positive integer-cent validation
idempotency fingerprint
Payment state machine
PaymentAttempt state machine
payment_obligations repository
payment_attempts repository
unit of work
composition root
```

The workhorse should preserve these boundaries unless tests prove a concrete defect.

---

# 4. Execution order

## 2.1 — Formalize application commands

### Objective

Define explicit application-level command contracts.

### Required commands

```text
CreatePaymentObligation
GetPayment
GetPaymentByBusinessKey
GetPaymentByIdempotencyKey
BeginPaymentAttempt
MarkPaymentProcessing
MarkPaymentPaid
MarkPaymentFailed
CancelPayment
ExpirePayment
MarkAttemptProcessing
MarkAttemptSucceeded
MarkAttemptFailed
CancelAttempt
AttachExternalTransaction
```

Exact function names may differ slightly, but semantics must remain explicit.

### CreatePaymentObligation input

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

The caller must NOT provide:

```text
processor
status
paid_at
cancelled_at
provider status
gateway
provider transaction id
fees
settlement data
```

Processor selection remains central.

### BeginPaymentAttempt input

```text
payment_id
provider_idempotency_key
```

The caller must NOT provide:

```text
amount
currency
processor
attempt_number
status
```

### Acceptance checklist

- [ ] command shapes are explicit;
- [ ] caller cannot choose processor;
- [ ] caller cannot choose initial Payment status;
- [ ] caller cannot choose attempt number;
- [ ] caller cannot inject payment timestamps;
- [ ] application service remains independent from Express and PSP SDKs.

---

## 2.2 — Complete canonical read operations

### Objective

Expose stable lookup operations without leaking repository implementation details.

Required reads:

```text
getPayment(paymentId)
getPaymentByBusinessKey(businessKey)
getPaymentByIdempotencyKey(payerId, idempotencyKey)
```

### Rules

- missing records return a consistent application result/error;
- no Knex row should escape directly to a source domain;
- reads must not mutate state;
- business-key and idempotency-key lookups must return the same canonical Payment identity when referring to the same obligation.

### Acceptance checklist

- [ ] lookup by id;
- [ ] lookup by business key;
- [ ] lookup by payer/idempotency key;
- [ ] not-found behavior is deterministic;
- [ ] read operations do not create or repair state implicitly.

---

## 2.3 — Harden PaymentAttempt lifecycle

### Objective

Make retries and multiple processor attempts explicit and safe.

Target behavior:

```text
Payment
├── Attempt #1 FAILED
├── Attempt #2 FAILED
└── Attempt #3 SUCCEEDED
```

### Rules

- attempt numbering is persistence-controlled;
- provider idempotency is durable;
- a provider idempotency key cannot move to another Payment;
- an external transaction id can be attached once;
- one failed attempt does not delete or overwrite previous attempts;
- an attempt terminal state cannot reopen;
- an INTERNAL_CASH Payment cannot create an external attempt.

### Acceptance checklist

- [ ] first attempt is #1;
- [ ] subsequent attempt increments deterministically;
- [ ] concurrent beginAttempt cannot duplicate attempt number;
- [ ] same provider idempotency key replays same attempt;
- [ ] same provider idempotency key on another Payment conflicts;
- [ ] external transaction id attach is idempotent;
- [ ] conflicting external transaction id is rejected;
- [ ] terminal attempt cannot reopen.

---

## 2.4 — Replace generic Payment transitions with semantic application operations

### Objective

Prevent future callers from arbitrarily setting financial status.

The domain state machine remains generic internally, but the public application surface should prefer semantic operations.

Target application operations:

```text
markPaymentProcessing(...)
markPaymentPaid(...)
markPaymentFailed(...)
cancelPayment(...)
expirePayment(...)
```

The existing generic `transitionPayment` may remain private/internal if useful, but it should not be the primary integration contract for Tow/Store.

### Rule

A source domain must not be able to perform:

```text
payment.status = 'PAID'
```

or:

```text
transitionPayment(paymentId, arbitraryStatus)
```

without passing through semantic guards.

### Settlement evidence contract

D3 is CLOSED and authoritative:

```text
docs/payments/PAYMENT-SETTLEMENT-EVIDENCE-CONTRACT.md
```

Canonical evidence vocabulary:

```text
INTERNAL_CASH_CONFIRMATION
PROCESSOR_PAYMENT_CONFIRMATION
STORE_BILLING_VERIFICATION
```

Phase 2 must persist the accepted evidence binding on `payment_obligations` and implement semantic:

```text
markPaymentPaid({ payment_id, evidence })
```

A generic arbitrary `transitionPayment(..., PAID)` must not remain the integration contract.

Do not create provider-event persistence in this phase; provider events remain Phase 6.

### Acceptance checklist

- [ ] semantic transition methods exist;
- [ ] direct arbitrary external status mutation is not the integration contract;
- [ ] PAID requires accepted durable settlement evidence under D3;
- [ ] CANCELLED stamps cancellation time internally;
- [ ] PAID stamps paid time internally;
- [ ] same semantic command replay does not restamp timestamps;
- [ ] terminal Payment cannot reopen.

---

## 2.5 — Define Payment ↔ PaymentAttempt coordination rules

### Objective

Clarify what an attempt result means for the parent Payment.

Core rule:

```text
PaymentAttempt != Payment
```

An attempt is execution evidence.

A Payment is the canonical financial obligation.

### Required coordination

A failed attempt:

```text
Attempt FAILED
→ Payment remains payable unless policy explicitly marks it failed/cancelled/expired
```

A succeeded attempt:

```text
Attempt SUCCEEDED
→ may provide settlement evidence
→ application service decides whether Payment can become PAID
```

Do not encode the assumption that every future processor has identical semantics.

For example, authorization and capture may later differ.

### Acceptance checklist

- [ ] failed attempt does not automatically destroy Payment;
- [ ] succeeded attempt can be used as payment evidence;
- [ ] attempt status and Payment status remain separate persisted facts;
- [ ] no provider-specific status enters core vocabulary.

---

## 2.6 — Add canonical read projections

### Objective

Stop consumers from depending on database row shape.

Introduce application DTO/projection builders.

Recommended Payment summary:

```text
PaymentSummary
├── id
├── business_key
├── context_type
├── context_id
├── amount_cents
├── currency
├── method
├── processor
├── status
├── paid_at
├── cancelled_at
├── expires_at
└── latest_attempt
```

Recommended attempt summary:

```text
PaymentAttemptSummary
├── id
├── payment_id
├── attempt_number
├── processor
├── status
├── external_transaction_id
├── failure_code
├── created_at
└── updated_at
```

### Rules

- source domains consume projections/application results, not Knex rows;
- no raw provider payload belongs in canonical DTOs;
- no Store/Tow-specific field belongs in shared Payment DTOs.

### Acceptance checklist

- [ ] Payment DTO builder;
- [ ] PaymentAttempt DTO builder;
- [ ] latest-attempt projection;
- [ ] no persistence-only fields leak unintentionally;
- [ ] no source-domain-specific fields are introduced.

---

## 2.7 — Freeze error contract

### Objective

Give future HTTP/domain integrations predictable error semantics.

Minimum application error vocabulary:

```text
PAYMENT_NOT_FOUND
PAYMENT_CREATE_CONFLICT
IDEMPOTENCY_CONFLICT
PAYMENT_TERMINAL
INVALID_PAYMENT_TRANSITION
PAYMENT_CONCURRENT_TRANSITION

PAYMENT_ATTEMPT_NOT_FOUND
PAYMENT_ATTEMPT_NOT_APPLICABLE
PAYMENT_ATTEMPT_TERMINAL
PAYMENT_ATTEMPT_FAILURE_CODE_REQUIRED
PAYMENT_ATTEMPT_CONCURRENT_TRANSITION

PROVIDER_IDEMPOTENCY_CONFLICT
PAYMENT_EXTERNAL_TRANSACTION_REQUIRED
PAYMENT_EXTERNAL_TRANSACTION_CONFLICT
PAYMENT_SETTLEMENT_EVIDENCE_REQUIRED
PAYMENT_SETTLEMENT_EVIDENCE_INVALID
```

Exact HTTP status mapping is out of scope.

### Acceptance checklist

- [ ] errors have stable codes;
- [ ] validation vs not-found vs conflict are distinguishable;
- [ ] concurrency failures have explicit codes;
- [ ] errors do not expose SQL/provider implementation details.

---

## 2.8 — Complete the Phase 2 test matrix

### Required tests

#### Payment creation

- [ ] valid create;
- [ ] identical replay;
- [ ] same business key + different facts -> conflict;
- [ ] same idempotency key + different facts -> conflict;
- [ ] invalid amount;
- [ ] invalid method/channel combination;
- [ ] caller cannot force processor.

#### Payment reads

- [ ] by id;
- [ ] by business key;
- [ ] by payer/idempotency key;
- [ ] deterministic not-found.

#### Payment transitions

- [ ] PENDING -> PROCESSING;
- [ ] PROCESSING -> PAID;
- [ ] permitted direct cash settlement path;
- [ ] invalid transition rejected;
- [ ] terminal cannot reopen;
- [ ] replay does not restamp `paid_at`;
- [ ] replay does not restamp `cancelled_at`;
- [ ] concurrent transition loser gets explicit conflict.

#### Attempts

- [ ] first attempt = 1;
- [ ] second attempt increments;
- [ ] failed attempt leaves Payment intact;
- [ ] terminal attempt cannot reopen;
- [ ] provider-idempotency replay;
- [ ] provider-idempotency cross-Payment conflict;
- [ ] external transaction attach once;
- [ ] external transaction duplicate across attempts rejected;
- [ ] INTERNAL_CASH attempt rejected.

#### Projection

- [ ] canonical PaymentSummary;
- [ ] canonical PaymentAttemptSummary;
- [ ] latest attempt;
- [ ] no raw persistence/provider payload leakage.

#### Architecture

- [ ] application imports no Express;
- [ ] application imports no Stripe;
- [ ] application imports no Apple/Google SDK;
- [ ] application imports no legacy payment service;
- [ ] application contains no Tow price calculation;
- [ ] application contains no Store total calculation.

---

# 5. Canonical lifecycle scenarios

Phase 2 is not complete until these scenarios are proven.

## 5.1 External processor retry lifecycle

```text
Create Payment
      ↓
PENDING
      ↓
Begin Attempt #1
      ↓
PROCESSING
      ↓
FAILED

Payment remains payable
      ↓
Begin Attempt #2
      ↓
PROCESSING
      ↓
SUCCEEDED
      ↓
accepted PROCESSOR_PAYMENT_CONFIRMATION evidence
      ↓
Payment PAID
```

Required invariant:

```text
Attempt #1 remains immutable historical evidence.
```

## 5.2 Internal cash lifecycle

```text
Create Payment
      ↓
PENDING
      ↓
NO PaymentAttempt
      ↓
accepted INTERNAL_CASH_CONFIRMATION evidence
      ↓
Payment PAID
```

Required invariant:

```text
Cash must never create a fake provider transaction.
```

## 5.3 Idempotency lifecycle

```text
Create command A
→ Payment X

Replay command A
→ Payment X

Same key / changed amount
→ IDEMPOTENCY_CONFLICT

Same business obligation / equivalent facts
→ Payment X
```

---

# 6. Explicit out-of-scope list

Do NOT add during Phase 2:

```text
Stripe SDK
Stripe PaymentIntent
PIX QR generation
provider webhook
payment_provider_events table
reconciliation
Apple verification
Google Play verification
refunds table
refund execution
Stripe Connect
settlement allocations
wallet replacement
new public /api/payments HTTP route
Tow migration
Store migration
subscription integration
```

If a task requires one of these to make the application core pass, stop and record the architectural reason.

---

# 7. Workhorse implementation sequence

The workhorse should execute in this exact order:

```text
1. Close Phase 1 first.
2. Add explicit read application operations.
3. Add semantic Payment transition operations.
4. Introduce settlement-evidence validation.
5. Harden PaymentAttempt coordination.
6. Add projection/DTO builders.
7. Normalize/freeze application error codes.
8. Expand unit/application tests.
9. Add fake-repository/fake-adapter lifecycle test.
10. Run focused Payments suite.
11. Run PostgreSQL gate to ensure application assumptions match persistence.
12. Update master ledger to DONE only when all gates pass.
```

Avoid large refactors between these steps.

Prefer small commits grouped by behavior.

---

# 8. Phase 2 exit gate

Phase 2 is DONE only when all statements below are true:

```text
1. Business domains can create a canonical Payment through the application service.
2. Business domains can retrieve canonical Payment projections without repository access.
3. Processor attempts can be retried without overwriting history.
4. Payment and PaymentAttempt state machines are separately enforced.
5. Arbitrary status assignment is not the integration contract.
6. PAID requires explicit accepted settlement evidence.
7. INTERNAL_CASH reaches PAID without a PaymentAttempt.
8. External attempts can fail and retry while Payment remains valid.
9. Idempotent replays preserve canonical ids and timestamps.
10. Concurrency losers produce explicit deterministic errors.
11. Application/domain code imports no HTTP or concrete PSP.
12. No Tow/Store pricing logic exists inside Payments.
13. Focused tests are green.
14. PostgreSQL persistence gate remains green.
```

Only after this gate should Phase 3 — Tow CASH migration begin.

---

# 9. Handoff to Phase 3

Phase 3 should consume only the stable Phase 2 application contract.

Expected conceptual Tow integration:

```text
Tow assignment freezes amount
        ↓
CreatePaymentObligation
        ↓
Payment(method=CASH, processor=INTERNAL_CASH)
        ↓
Tow service completes
        ↓
INTERNAL_CASH_CONFIRMATION
        ↓
Payment PAID
```

Tow must not import:

```text
payment_obligations repository
payment_attempts repository
Knex payment adapter
Stripe/provider adapter
```

Tow integrates through the Payment application service only.
