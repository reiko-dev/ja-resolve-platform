# Payment Settlement Evidence Contract

**Decision:** D3 — Settlement Evidence Contract  
**Status:** CLOSED  
**Scope:** canonical proof required to transition a customer Payment to PAID  
**Branch:** feat/Pagamentos  
**PR:** #45

This document is the semantic authority for any operation that marks a canonical Payment as PAID.

Settlement evidence here means accepted evidence that the customer-side financial obligation has been satisfied. It does not mean marketplace settlement, commission, transfer or payout.

---

# 1. Core invariant

A Payment cannot become PAID because a caller requested that status.

Canonical application operation:

~~~text
markPaymentPaid({
  payment_id,
  evidence
})
~~~

Not:

~~~text
transitionPayment(payment_id, PAID)
~~~

The Payment application core validates and durably binds accepted evidence in the same transaction that changes status to PAID.

No accepted evidence means no PAID transition.

---

# 2. Canonical evidence vocabulary

~~~text
INTERNAL_CASH_CONFIRMATION
PROCESSOR_PAYMENT_CONFIRMATION
STORE_BILLING_VERIFICATION
~~~

The older placeholder STORE_VERIFICATION is retired because it is ambiguous.

## INTERNAL_CASH_CONFIRMATION

Used after the owning business domain has authorized a physical-cash receipt action.

## PROCESSOR_PAYMENT_CONFIRMATION

Used only after a trusted processor path has established final customer payment collection/capture.

A request dispatch, token, QR code, created intent, authorization-only result, timeout or local Attempt status is not by itself proof of payment.

## STORE_BILLING_VERIFICATION

Used only after server-side verification of an Apple App Store or Google Play transaction representing the expected digital purchase.

A mobile callback or receipt string from the client is not trusted evidence by itself.

---

# 3. Durable evidence binding

The accepted settlement evidence is persisted on the canonical payment_obligations row.

Phase 2 must extend the canonical Payment persistence with nullable fields equivalent to:

~~~text
settlement_evidence_type
settlement_evidence_id
settlement_source
settlement_actor_ref
settlement_attempt_id
settlement_processor
settlement_external_transaction_id
settlement_verified_at
~~~

paid_at remains the effective financial timestamp.

While unpaid, settlement binding fields are null.

When status = PAID:

~~~text
paid_at IS NOT NULL
settlement_evidence_type IS NOT NULL
settlement_evidence_id IS NOT NULL
settlement_verified_at IS NOT NULL
~~~

The accepted binding is immutable after PAID. Later provider events may corroborate it but must not replace it.

Provider-event persistence remains Phase 6.

---

# 4. Durable uniqueness and replay

PostgreSQL must enforce:

~~~text
UNIQUE(settlement_evidence_type, settlement_evidence_id)
WHERE settlement_evidence_id IS NOT NULL
~~~

Semantics:

~~~text
same evidence + same Payment
→ idempotent replay

same evidence + another Payment
→ PAYMENT_SETTLEMENT_EVIDENCE_CONFLICT
~~~

This rule must not depend only on an application pre-read.

---

# 5. Common evidence contract

Conceptual internal shape:

~~~text
SettlementEvidence
├── type
├── evidence_id
├── source
├── actor_ref?
├── attempt_id?
├── processor?
├── external_transaction_id?
├── effective_at?
└── verified_at
~~~

evidence_id is a stable identity for the financial fact, not an HTTP Idempotency-Key.

source identifies the trusted internal producer/authorizer, for example TOW, STORE, STRIPE_ADAPTER, APPLE_VERIFICATION or GOOGLE_PLAY_VERIFICATION.

actor_ref is required for internal human/business confirmations such as cash and uses an opaque internal reference such as partner:123.

attempt_id is required for processor-payment confirmation.

processor must equal Payment.processor when processor/store evidence is used.

external_transaction_id must be provider-verified and is required for processor/store evidence.

verified_at is always server-owned.

effective_at may be accepted only from a trusted provider/store verification path.

---

# 6. Timestamp authority

~~~text
effective_at = when the trusted financial fact occurred
verified_at  = when our backend accepted/verified it
~~~

Payment.paid_at uses trusted effective_at when available; otherwise it uses verified_at.

For INTERNAL_CASH_CONFIRMATION:

~~~text
verified_at = backend clock now
paid_at     = verified_at
~~~

The source domain does not supply paid_at.

For processor/store verification, a trusted verified provider timestamp may become paid_at. Client-supplied timestamps never do.

---

# 7. INTERNAL_CASH_CONFIRMATION

Valid only when:

~~~text
Payment.method    = CASH
Payment.processor = INTERNAL_CASH
~~~

Required:

~~~text
type = INTERNAL_CASH_CONFIRMATION
evidence_id
source
actor_ref
~~~

No PaymentAttempt is required or allowed as settlement proof for internal cash.

Payments does not decide whether the actor was operationally authorized. Tow/Store performs that authorization before submitting the evidence.

D1 evidence identity remains:

~~~text
tow-cash-receipt:<assignment_id>:v1
~~~

---

# 8. PROCESSOR_PAYMENT_CONFIRMATION

Used for external-processor Payments such as the initial Phase 5 Stripe CARD/PIX flows.

Required:

~~~text
type = PROCESSOR_PAYMENT_CONFIRMATION
evidence_id
processor
attempt_id
external_transaction_id
verified_at
~~~

The referenced PaymentAttempt must exist, belong to the same Payment, use the same processor, be SUCCEEDED, and own the same external_transaction_id.

Critical rule:

~~~text
PaymentAttempt SUCCEEDED alone
!= automatic Payment PAID
~~~

The trusted processor adapter/orchestration must also establish that the operation represented final customer payment collection/capture.

Authorization-only semantics do not create settlement evidence.

Canonical evidence identity is namespaced from the verified processor transaction, conceptually:

~~~text
processor-payment:<PROCESSOR>:<external_transaction_id>
~~~

The exact Stripe external identity is finalized in Phase 5.

---

# 9. STORE_BILLING_VERIFICATION

Valid only when:

~~~text
Payment.method = STORE_BILLING
Payment.processor = APPLE_APP_STORE or GOOGLE_PLAY
~~~

Required:

~~~text
type = STORE_BILLING_VERIFICATION
evidence_id
processor
external_transaction_id
verified_at
~~~

The Phase 7 verifier must prove that the transaction is authentic, belongs to the expected app/store environment, maps to the expected internal obligation, is not invalid/revoked at verification time, and has not already settled another Payment.

Conceptual evidence identity:

~~~text
store-billing:<PROCESSOR>:<external_transaction_id>
~~~

Phase 7 chooses the exact Apple/Google field with correct durable uniqueness semantics.

---

# 10. Payment state requirements

Normal accepted settlement evidence may transition:

~~~text
PENDING    -> PAID
PROCESSING -> PAID
~~~

PAID plus the exact same evidence is an idempotent replay.

For the current contract:

~~~text
FAILED
CANCELLED
EXPIRED
~~~

must not be silently forced to PAID.

A network timeout or lost provider response must not be modeled as final Payment FAILED merely to clear uncertainty. Keep the external outcome recoverable through PROCESSING/attempt state and later retrieve/reconciliation.

---

# 11. Already-paid semantics

Same Payment + same evidence:

~~~text
return canonical Payment
replay = true
preserve original paid_at
preserve original settlement binding
~~~

Same Payment + different evidence:

~~~text
PAYMENT_ALREADY_SETTLED_WITH_DIFFERENT_EVIDENCE
~~~

Same evidence + another Payment:

~~~text
PAYMENT_SETTLEMENT_EVIDENCE_CONFLICT
~~~

Later provider corroboration belongs to ProviderEvent/reconciliation, not replacement of canonical settlement evidence.

---

# 12. Atomic mark-paid operation

Conceptually:

~~~text
BEGIN

lock/read Payment
validate Payment state
validate evidence type against method/processor

if processor evidence:
  validate PaymentAttempt ownership/status/external transaction

claim durable evidence identity
persist immutable settlement binding
set status = PAID
set paid_at
set settlement_verified_at

COMMIT
~~~

Concurrent duplicate evidence must produce one canonical financial effect and deterministic replay/conflict outcomes.

No partial state where evidence is accepted but Payment remains unpaid is allowed.

---

# 13. Evidence is not ProviderEvent

SettlementEvidence is the canonical fact accepted to justify PAID.

PaymentProviderEvent is an external event/envelope persisted in Phase 6 for verification, deduplication, audit and reconciliation.

A Payment may receive many ProviderEvents but has one canonical accepted settlement binding in the current single-settlement model.

---

# 14. Evidence is not marketplace settlement

Payment PAID means:

~~~text
customer-side obligation satisfied
~~~

It does not mean:

~~~text
partner/seller paid out
commission finalized
transfer executed
Stripe Connect payout completed
~~~

Those remain separate lifecycles.

---

# 15. Data minimization

Do not persist raw card data, provider secrets or complete unverified receipts in the settlement binding.

Persist only canonical references needed for identity, audit, correlation and replay/conflict protection.

Raw provider payload/event storage belongs to the Phase 6 provider-event security contract.

---

# 16. Error contract

D3 freezes these application errors:

~~~text
PAYMENT_SETTLEMENT_EVIDENCE_REQUIRED
PAYMENT_SETTLEMENT_EVIDENCE_INVALID
PAYMENT_SETTLEMENT_EVIDENCE_CONFLICT
PAYMENT_ALREADY_SETTLED_WITH_DIFFERENT_EVIDENCE
PAYMENT_SETTLEMENT_ATTEMPT_REQUIRED
PAYMENT_SETTLEMENT_ATTEMPT_MISMATCH
PAYMENT_SETTLEMENT_ATTEMPT_NOT_SUCCEEDED
PAYMENT_SETTLEMENT_PROCESSOR_MISMATCH
PAYMENT_SETTLEMENT_EXTERNAL_TRANSACTION_REQUIRED
PAYMENT_SETTLEMENT_EXTERNAL_TRANSACTION_MISMATCH
PAYMENT_SETTLEMENT_SOURCE_INVALID
PAYMENT_SETTLEMENT_ACTOR_REQUIRED
~~~

Existing not-found, terminal and concurrency error codes remain applicable.

---

# 17. Phase 2 implementation consequence

The current generic transitionPayment(paymentId, PAID) must not remain the public application integration path.

Phase 2 implements semantic:

~~~text
markPaymentPaid({ payment_id, evidence })
~~~

Any generic transition primitive remains private/internal.

Phase 2 also adds the durable settlement-binding columns/constraints before PAID semantics are considered complete.

No concrete Stripe/Apple/Google SDK is needed to test this; fake trusted evidence builders are sufficient.

---

# 18. Required persistence constraints

Where practical, enforce:

~~~text
status = PAID
→ paid_at IS NOT NULL
→ settlement_evidence_type IS NOT NULL
→ settlement_evidence_id IS NOT NULL
→ settlement_verified_at IS NOT NULL
~~~

and:

~~~text
status != PAID
→ accepted settlement binding is null
~~~

plus the partial unique evidence identity.

Do not weaken these constraints merely to simplify fixtures.

---

# 19. Required tests

Common:

- PAID without evidence rejected;
- unknown evidence type rejected;
- valid evidence settles Payment;
- identical replay preserves Payment id and paid_at;
- different evidence on already PAID Payment conflicts;
- same evidence on another Payment conflicts;
- concurrent same-evidence settlement produces one effect;
- client-supplied paid timestamp is ignored/rejected.

Cash:

- CASH + INTERNAL_CASH accepts valid internal evidence;
- actor_ref required;
- no PaymentAttempt;
- cash evidence cannot settle a STRIPE Payment.

Processor:

- attempt belongs to same Payment;
- processor matches;
- attempt is SUCCEEDED;
- external transaction matches;
- SUCCEEDED attempt without trusted final-payment confirmation cannot mark PAID;
- FAILED/CANCELLED attempt cannot settle.

Store billing:

- STORE_BILLING requires Apple/Google processor;
- unverified client receipt cannot settle;
- verified transaction is replay-safe;
- same store transaction cannot settle two Payments.

State:

- PENDING -> PAID with valid evidence;
- PROCESSING -> PAID with valid evidence;
- FAILED/CANCELLED/EXPIRED not force-settled;
- PAID remains terminal.

Architecture:

- source domains cannot use arbitrary generic PAID transition;
- controllers cannot manufacture trusted processor/store evidence;
- verification adapters construct trusted external evidence;
- Payments does not evaluate Tow permissions or Store pricing.

---

# 20. Interaction with D1 — Tow CASH

Tow does:

~~~text
authorize assigned partner
verify Tow = COMPLETED
→ INTERNAL_CASH_CONFIRMATION
evidence_id = tow-cash-receipt:<assignment_id>:v1
actor_ref = partner:<partner_id>
source = TOW
→ Payments assigns server verified_at
→ Payment PAID
~~~

Tow does not pass paid_at.

---

# 21. Interaction with D2 — Store

D2 remains the Store order/money authority.

Phase 4 may create CARD/PIX Payment PENDING without executing a PSP. Phase 5 later supplies PROCESSOR_PAYMENT_CONFIRMATION.

A future Store CASH flow must separately define Store business authorization that can produce INTERNAL_CASH_CONFIRMATION.

PurchaseOrder.payment_status remains non-authoritative/removed as defined by D2.

---

# 22. Later phases

Phase 5 Stripe must distinguish request-created, authorization, processing, final collected/captured, failure and unknown outcome. Only final verified collection/capture may produce PROCESSOR_PAYMENT_CONFIRMATION.

Phase 6 provider events/reconciliation must reuse the same D3 evidence identity semantics and never restamp an already settled Payment with the same evidence.

Phase 7 Apple/Google verification adapters are the only components allowed to construct STORE_BILLING_VERIFICATION evidence. The mobile app is never the trusted verifier.

---

# 23. Explicitly deferred

D3 does not decide exact Stripe object ids, Apple transaction field details, Google purchase-token field details, provider-event schema, reconciliation correction policy, refunds, partial payments, split tender, chargebacks, entitlement lifecycle or marketplace settlement.

The current Payment model assumes one customer obligation is settled once by one canonical evidence identity.

A future partial/split-payment requirement requires a new explicit design.

---

# 24. D3 closure statement

~~~text
PAID:
requires accepted durable settlement evidence

Evidence types:
INTERNAL_CASH_CONFIRMATION
PROCESSOR_PAYMENT_CONFIRMATION
STORE_BILLING_VERIFICATION

STORE_VERIFICATION:
retired

Evidence durability:
immutable binding on payment_obligations

Evidence uniqueness:
(type, evidence_id) unique when present

Cash:
authorized source-domain confirmation
no PaymentAttempt
paid_at = backend verified_at

Processor:
trusted final collected/captured fact
matching SUCCEEDED attempt
matching processor + external transaction
SUCCEEDED attempt alone is insufficient

Store billing:
server-side Apple/Google verification only
client callback/receipt alone is insufficient

Normal payable states:
PENDING
PROCESSING

Already PAID:
same evidence -> replay
different evidence -> conflict

FAILED/CANCELLED/EXPIRED:
normal markPaymentPaid cannot force PAID

Provider events:
separate Phase 6 concept

Marketplace settlement/payout:
separate lifecycle
~~~

A workhorse must not introduce any shortcut that marks Payment PAID without satisfying this contract.