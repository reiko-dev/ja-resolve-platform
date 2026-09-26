# Payment API Boundary Decision

**Decision:** D4 — Payment API Boundary Decision  
**Status:** CLOSED  
**Scope:** public/internal API boundary of the shared Payment Platform  
**Branch:** feat/Pagamentos  
**PR:** #45

This document defines which Payment capabilities are internal application services and which may cross an HTTP/provider boundary.

It intentionally replaces the legacy generic /api/payments model.

---

# 1. Core decision

The Payment Platform is not a public CRUD resource in the current MVP.

Canonical direction:

~~~text
Tow HTTP API
    ↓
Tow application/domain
    ↓
Payment application service

Store HTTP API
    ↓
Store application/domain
    ↓
Payment application service
~~~

Not:

~~~text
mobile/client
    ↓
POST /api/payments
{ amount, gateway, status, arbitrary business ids }
~~~

The owning business domain creates the authoritative obligation first, then invokes Payments internally.

---

# 2. Public generic Payment API

## Decision

For the current MVP:

~~~text
NO generic public create-payment endpoint
NO generic public confirm-payment endpoint
NO generic public cancel-payment endpoint
NO generic public refund-payment endpoint
NO generic public mutate-payment-status endpoint
NO generic public user/partner payment CRUD/list endpoint
~~~

Payments remains an internal application module except for narrowly defined provider-facing callbacks/webhooks introduced in their own phases.

A future read-only financial-history feature may justify a dedicated query API, but it is not created speculatively.

---

# 3. Legacy /api/payments disposition

The current legacy routes are not part of the canonical Payment Platform.

Legacy capabilities to retire include conceptually:

~~~text
POST /api/payments
GET  /api/payments
GET  /api/payments/:id
GET  /api/payments/partner/:partnerId
POST /api/payments/:id/confirm
POST /api/payments/:id/cancel
POST /api/payments/:id/refund
POST /api/payments/webhook/:gateway
~~~

The current route accepts client amount, method, gateway and arbitrary domain references and therefore violates the new authority model.

Retirement rule:

~~~text
identify runtime consumer
→ migrate consumer to source-domain flow
→ prove replacement
→ remove legacy route/service
~~~

There is no compatibility requirement for real users.

Do not add new consumers to legacy /api/payments while migration is in progress.

---

# 4. Who may create a canonical Payment

Only trusted backend application code representing an owning business obligation may call CreatePaymentObligation.

Examples:

~~~text
Tow assignment acceptance
Store checkout finalization
future subscription billing-cycle creation
~~~

An HTTP client cannot directly call CreatePaymentObligation.

The source domain must already own/freeze:

~~~text
context identity
payer identity
authoritative amount_cents
currency
commerce type
sales channel
commercial payment method
idempotency identity
~~~

Payments derives processor centrally.

---

# 5. Client financial authority prohibition

No public request may authoritatively supply these Payment facts when they are server-derived:

~~~text
amount_cents
currency
processor
payment status
paid_at
settlement evidence
external transaction id
provider success/failure
gateway/provider choice
attempt number
refund completion
~~~

A source-domain endpoint may accept commercial intent such as payment_method or expected_total_cents only where that domain contract explicitly allows it.

Examples:

~~~text
Tow request creation:
payment method is commercial intent
amount is NOT client authority

Store checkout:
payment method + expected_total_cents are allowed intent/consent
canonical total is backend authority
~~~

---

# 6. Source-domain HTTP ownership

User-facing payment actions should normally live under the resource that owns the business obligation.

Examples:

~~~text
POST /api/tow/requests/:id/cash-received
POST /api/purchase-orders/checkout
future: POST /api/purchase-orders/:id/payment-attempts
future: POST /api/subscriptions/:id/renew
~~~

Exact route names may evolve, but the authority rule does not:

~~~text
HTTP action
→ source-domain authorization/business validation
→ Payment application command
~~~

The controller must not write Payment persistence directly.

---

# 7. Payment reads

## Current MVP decision

Payment state is projected through the owning business resource.

Examples:

~~~text
GET /api/tow/requests/:requestId/payment
GET /api/purchase-orders/:id
  -> embedded canonical payment summary when relevant
~~~

No generic GET /api/payments/:id is required now.

No generic GET /api/payments list is required now.

## Future query API

If the product later needs a consolidated payment history, build a dedicated read/query surface with explicit authorization and projections.

It must not expose persistence rows, provider secrets or raw provider responses.

---

# 8. Authorization model

Knowing a Payment id is never sufficient authorization.

Authorization is derived from the owning business context and current authenticated actor.

Examples:

~~~text
TOW_SERVICE
→ owning customer
→ assigned partner only where Tow contract permits
→ authorized admin

STORE_ORDER
→ owning customer
→ owning Store/authorized Store actor only where order contract permits
→ authorized admin
~~~

Payment payer_id may support validation/querying, but it is not by itself the complete authorization policy for partner/admin/business access.

The source domain remains the authority for business-object visibility.

Authorization checks must occur before returning sensitive financial/provider data.

---

# 9. Public Payment projection

User-facing APIs expose a safe Payment projection, not a database row.

Recommended customer-safe shape:

~~~text
PaymentSummary
├── id
├── business_key?        // include only when useful
├── amount_cents
├── currency
├── method
├── status
├── paid_at
├── expires_at
└── payment_action?      // provider-safe action when applicable
~~~

Do not expose by default:

~~~text
idempotency fingerprints
internal actor refs
raw settlement evidence internals
raw provider payloads
provider secrets
full gateway responses
internal failure stack/SQL
private reconciliation metadata
~~~

Partner/admin projections may differ, but must be explicit DTOs.

---

# 10. Processor attempt initiation

Phase 5 may require the client to obtain a provider-safe action such as a Stripe client secret or PIX presentation data.

This does not require a generic create-Payment endpoint.

Preferred flow:

~~~text
source-domain Payment already exists
        ↓
authorized source-domain command requests an attempt
        ↓
Payment application begins PaymentAttempt
        ↓
processor adapter creates/retrieves provider operation
        ↓
API returns safe payment_action projection
~~~

Possible future route:

~~~text
POST /api/purchase-orders/:id/payment-attempts
~~~

or another source-domain equivalent.

If a shared /api/payments/:id/attempts endpoint is ever introduced, it requires a new explicit decision proving that source-domain authorization can be safely delegated without reintroducing generic financial authority.

Current D4 does not authorize such a shared endpoint.

---

# 11. payment_action contract

A payment_action is provider-safe client continuation data, not financial authority.

Conceptually it may contain:

~~~text
type
attempt_id
expires_at?
client_secret?          // when safe/required by provider
pix_copy_paste?         // when provider-safe
pix_qr_payload?         // when provider-safe
next_action_metadata?
~~~

It must never imply that Payment is PAID.

Creating/displaying a QR code, token or client_secret does not create D3 settlement evidence.

Provider-specific fields are finalized in Phase 5.

---

# 12. Confirming payment

## Client confirmation

There is no public endpoint equivalent to:

~~~text
POST /api/payments/:id/confirm
~~~

that trusts the client to assert success.

A mobile button such as 'Já paguei', 'Confirmar' or a successful SDK callback may trigger refresh/retrieval, but cannot directly mark Payment PAID.

PAID requires D3 settlement evidence.

## Cash

For internal cash, confirmation remains a source-domain authorized business command, for example Tow cash-received.

## External processor

Processor confirmation comes from trusted processor retrieval/response/webhook verification, never from an untrusted client status.

---

# 13. Cancellation boundary

Payment cancellation is not a generic client command.

The owning business domain decides whether the underlying obligation may be cancelled.

Flow:

~~~text
source-domain cancel command
→ business cancellation rules
→ if financial cancellation is required
→ Payment application cancel operation
~~~

A user cannot cancel a Payment independently from the Tow/Store/order obligation unless a later product contract explicitly permits it.

Provider cancellation behavior remains Phase 5/6 specific.

---

# 14. Refund boundary

There is no generic public:

~~~text
POST /api/payments/:id/refund
~~~

in the current architecture.

Refund eligibility and amount are decided by the owning business/refund policy.

Phase 8 introduces first-class Refund execution.

Conceptual future flow:

~~~text
Store/Tow/Admin refund policy authorizes amount/reason
→ Payments Refund command
→ processor/internal execution
→ Refund state
~~~

A client never marks a Payment refunded by status update.

---

# 15. Provider webhook/server-notification boundary

Provider callbacks are not user-facing Payment APIs.

They may be externally reachable but use provider authentication, not user auth.

Phase 6 requirements include:

~~~text
provider-specific endpoint
signature/authenticity verification
external event id deduplication
raw-body handling where provider requires it
durable ProviderEvent persistence
idempotent processing
reconciliation
~~~

Generic legacy:

~~~text
POST /api/payments/webhook/:gateway
~~~

is not the target design.

Provider endpoints should be explicit, for example conceptually:

~~~text
POST /api/payment-providers/stripe/webhook
~~~

Exact paths are decided in Phase 6 alongside provider requirements.

No webhook may mark PAID before authenticity verification and D3 evidence validation.

---

# 16. Apple/Google verification boundary

Mobile clients may submit provider-issued transaction material to an explicit digital-commerce verification command, but that material is untrusted input.

Conceptual flow:

~~~text
mobile store transaction material
→ authenticated digital-commerce endpoint
→ server-side Apple/Google verification adapter
→ STORE_BILLING_VERIFICATION evidence
→ Payment PAID
→ entitlement domain
~~~

The endpoint belongs to the digital-commerce/subscription product flow, not a generic status setter.

Phase 7 finalizes its exact API.

---

# 17. Idempotency boundary

Mutating source-domain HTTP commands must carry/use durable idempotency where defined by their domain.

Do not reuse one idempotency key for different semantic layers.

Examples:

~~~text
HTTP checkout idempotency key
!= Payment business_key
!= Payment create idempotency key
!= provider_idempotency_key
!= settlement_evidence_id
!= provider external_event_id
~~~

Each identity protects a different operation.

---

# 18. HTTP error mapping

Canonical application/domain error codes remain authoritative.

Controllers map them to transport statuses without converting financial conflicts into success.

Recommended categories:

~~~text
validation             -> 400/422 style
authentication         -> 401
authorization          -> 403
not found              -> 404
idempotency/conflict   -> 409
invalid state          -> 409
provider unavailable   -> 502/503 style when appropriate
unknown provider result-> recoverable application response; never invented PAID/FAILED
~~~

Exact endpoint schemas can refine status choices.

Do not return SQL/provider stack details to clients.

---

# 19. Internal application API

The stable Payment Platform integration surface is application-level, not HTTP-level.

Expected internal operations include conceptually:

~~~text
createObligation
getPayment / projections
beginAttempt
attachExternalTransaction
markAttemptProcessing/Succeeded/Failed
markPaymentProcessing
markPaymentPaid(payment_id, evidence)
cancelPayment
expirePayment
transaction-bound variants where required
~~~

Source domains import/use this application contract through composition/dependency injection.

They do not import Payment Knex repositories.

---

# 20. Administrative operations

Administrative financial mutation is not automatically authorized by role = admin.

Any future manual adjustment/refund/reconciliation action must define:

~~~text
explicit permission
reason
actor
audit record
idempotency
allowed source/payment states
financial effect
~~~

D4 does not add a generic admin override that can set arbitrary Payment status.

Manual financial repair is an audited command, not database CRUD.

---

# 21. Architecture tests

Required boundary tests must prove:

- Tow/Store do not import Payment persistence adapters;
- Tow/Store do not import Stripe/Apple/Google SDKs;
- public controllers cannot directly update Payment status;
- no public request selects processor/gateway as authority;
- no public generic Payment create accepts canonical amount;
- client callbacks cannot construct accepted D3 processor/store evidence;
- generic confirm/refund/cancel shortcuts are absent from the new Payment surface;
- provider webhook handling is separated from authenticated user APIs;
- user-facing projections do not expose raw provider payloads/secrets.

---

# 22. Legacy removal sequence

Because current legacy /api/payments still has runtime consumers, do not delete it before replacement flows are proven.

Required sequence:

~~~text
Phase 3 Tow
→ ensure Tow has no legacy generic Payment dependency

Phase 4 Store
→ migrate Store checkout/payment dependency

later subscription/other consumers
→ migrate as their canonical contracts are implemented

after last consumer
→ remove src/routes/payments.js
→ remove src/services/paymentService.js
→ remove mock gateway services
→ remove legacy Payment model/table dependencies when safe
~~~

No new feature may extend the legacy API during this window.

---

# 23. Explicitly deferred

D4 does not decide:

- exact Stripe client_secret/PaymentIntent endpoint schemas;
- exact PIX presentation response;
- exact Stripe webhook URL/body/signature handling;
- Apple/Google verification payload schema;
- consolidated user payment-history product;
- admin refund UX;
- chargeback/dispute APIs;
- settlement/payout APIs;
- public SDK design.

Those are introduced only when their phase/product consumer exists.

---

# 24. D4 closure statement

~~~text
Payment Platform public CRUD:
NO

Generic public create Payment:
NO

Generic client confirm PAID:
NO

Generic client cancel Payment:
NO

Generic client refund Payment:
NO

Generic Payment reads/list in MVP:
NO

Payment creation authority:
trusted owning business application flow

User-facing payment state:
projected through owning source domain

Processor attempt initiation:
source-domain authorized command; shared generic route not authorized by D4

PAID authority:
D3 settlement evidence only

Cancellation:
source-domain business decision first

Refund:
source-domain/refund policy + Phase 8 first-class Refund

Provider callbacks:
provider-authenticated explicit Phase 6 boundary

Apple/Google:
server-side verification through digital-commerce flow

Legacy /api/payments:
DEPRECATE; no new consumers; remove after last runtime consumer migrates

Authorization:
derive from owning business context, not possession of Payment id
~~~

A workhorse must not recreate a generic client-authoritative Payment API under a different route name.