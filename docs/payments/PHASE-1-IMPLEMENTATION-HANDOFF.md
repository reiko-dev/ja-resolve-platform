# Phase 1 Implementation Handoff

**Phase:** 1 — Canonical Persistence Contract  
**Status:** IN_PROGRESS  
**Implementation commit:** `e11aea73e3241d30b071b501ea1fe9f2f4fe74c8`

## 1. What is implemented

The Payment Platform now has an executable internal foundation.

### Persistence

```text
database/migrations/011_payment_platform_core.js
```

Creates:

```text
payment_obligations
payment_attempts
```

with canonical cents, state checks and durable uniqueness.

No legacy payment rows are migrated.

### Domain

```text
src/modules/payments/domain/
├── errors.js
├── vocabulary.js
├── money.js
├── payment.js
├── payment-attempt.js
├── idempotency.js
├── payment-transitions.js
└── index.js
```

The domain owns:

- payment vocabulary;
- processor-routing vocabulary;
- positive integer-cent validation;
- payment obligation construction;
- payment-attempt construction;
- idempotency fingerprinting;
- Payment state-machine rules;
- PaymentAttempt state-machine rules.

### Ports

```text
src/modules/payments/ports/
├── payment-processor.js
├── payment-repository.js
├── payment-attempt-repository.js
└── unit-of-work.js
```

These are the stable boundaries application code should depend on.

### Persistence adapters

```text
src/modules/payments/adapters/persistence/
├── payment-obligation-repository.js
├── payment-attempt-repository.js
└── unit-of-work.js
```

Important behavior already encoded:

- database decides uniqueness;
- PostgreSQL unique violations are classified instead of replaced with pre-read idempotency;
- nested transaction/savepoint protects outer transactions from PostgreSQL 23505 abort behavior;
- Payment transitions use guarded `WHERE id AND status`;
- attempts are numbered under a parent Payment row lock;
- provider idempotency keys replay the canonical attempt;
- external transaction ids are attach-once.

### Application service

```text
src/modules/payments/application/payment-service.js
```

Current internal operations:

```text
createObligation
getPayment
beginAttempt
transitionPayment
transitionAttempt
attachExternalTransaction
```

This is NOT an HTTP API.

### Composition root

```text
src/modules/payments/composition.js
```

`createPaymentPlatform({ db, clock })` builds the repositories, unit of work and application service.

Tow and Store should consume this composition/application surface in later phases instead of importing Knex or provider adapters.

## 2. Idempotency already encoded

### Business obligation

```text
UNIQUE(business_key)
```

### Application command

```text
UNIQUE(payer_id, idempotency_key)
```

plus SHA-256 `idempotency_fingerprint`.

Behavior:

```text
same identity + same facts
→ replay canonical Payment

same identity/key + different facts
→ IDEMPOTENCY_CONFLICT
```

### Processor attempt

```text
UNIQUE(payment_id, attempt_number)
UNIQUE(processor, provider_idempotency_key)
UNIQUE(processor, external_transaction_id) WHERE external_transaction_id IS NOT NULL
```

## 3. Important domain rules encoded

- `amount_cents > 0`;
- processor is derived by central routing policy;
- caller cannot force a processor that conflicts with routing;
- `INTERNAL_CASH` does not manufacture a fake external PaymentAttempt;
- Payment terminal states do not reopen;
- PaymentAttempt terminal states do not reopen;
- a failed attempt does not automatically fail the parent Payment;
- PAID timestamp is stamped by the financial transition, not supplied by a client;
- cancellation timestamp is stamped by the transition.

## 4. Tests added

```text
tests/payments/paymentDomain.test.js
tests/payments/paymentTransitions.test.js
tests/payments/paymentApplicationService.test.js
tests/payments/paymentArchitectureBoundary.test.js
```

The SQLite integration harness was extended with mirrors of the two canonical tables.

The application tests cover:

- one canonical Payment create;
- identical command replay;
- idempotency conflict on changed money;
- business-key replay with a different request idempotency key;
- processor-attempt numbering;
- provider-attempt replay;
- no fake cash processor attempt;
- PAID transition idempotency;
- failed attempt remaining separate from Payment state;
- DB rejection of zero-value Payment.

## 5. Validation performed by Sol

All critical new/modified JavaScript files were fetched from commit
`e11aea73e3241d30b071b501ea1fe9f2f4fe74c8` and parsed successfully as JavaScript.

This proves syntax only.

The complete Jest/PostgreSQL suites have NOT been executed from this session because:

- this repository has no workflow run on the current PR HEAD;
- the authorized Remote Desktop Commander device is offline.

Do not convert "syntax parse passed" into "tests green".

## 6. Mandatory workhorse validation before Phase 1 can close

Run from `socorre_ai_backend` on the branch HEAD:

```bash
npm test -- tests/payments --runInBand
npm run test:pg
```

Also exercise migration explicitly using the repository's PostgreSQL validation environment.

Required evidence:

1. migration 011 UP succeeds on a clean current schema;
2. migration 011 DOWN succeeds;
3. UP succeeds again after DOWN;
4. DB CHECKs reject invalid money/status vocabulary;
5. duplicate `business_key` is rejected;
6. duplicate payer/idempotency key is rejected;
7. duplicate provider idempotency key is rejected;
8. duplicate external transaction id is rejected;
9. two concurrent creates of the same business obligation result in one canonical Payment;
10. two concurrent attempt creations cannot produce the same attempt number;
11. transaction rollback leaves no partial Payment/Attempt write;
12. pre-existing Tow tests remain green.

## 7. What the workhorse must NOT add while closing Phase 1

Do not add:

- Stripe SDK;
- Stripe API calls;
- Apple/Google verification;
- HTTP payment routes;
- provider-event table;
- refunds table;
- Store integration;
- Tow migration;
- wallet/commission settlement;
- dual-write to legacy `payments`;
- data backfill from legacy `payments`.

If validation requires one of these, the design has drifted.

## 8. Expected Phase 1 closure

The ideal next commit is a small validation/fix commit, not another architecture rewrite.

After all Phase 1 gates are green:

- update the master ledger from `IN_PROGRESS` to `DONE`;
- record PostgreSQL/concurrency evidence;
- begin Phase 2 only from the canonical repositories/application boundaries already present.
