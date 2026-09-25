# Phase 4 — Store Financial Authority Contract

**Decision:** D2 — Store Financial Authority Contract  
**Status:** CLOSED  
**Scope:** Store/PurchaseOrder monetary authority before integration with the shared Payment Platform  
**Branch:** feat/Pagamentos  
**PR:** #45

This document is the implementation authority for the financial side of Phase 4.

It replaces the current client-authoritative PurchaseOrder creation model with a backend-owned, immutable monetary snapshot.

There are no real users and no authoritative Store payment history to preserve. The correct model should be implemented directly rather than maintaining compatibility with the current decimal/client-supplied financial fields.

---

# 1. Current problem being replaced

The current PurchaseOrder path accepts financial facts from the request body, including:

- subtotal;
- total_price;
- delivery_fee;
- taxes;
- discount;
- item unit_price;
- payment_status;
- payment_info / price_breakdown.

It persists those values using decimal/parseFloat arithmetic.

The current model also exposes:

- generic update(id, updateData);
- purchase-order payment_status and paid_at;
- refunded as an order status;
- delivery code that re-parses PurchaseOrder decimal money;
- product catalog price as DECIMAL;
- store delivery fee as DECIMAL.

These are not retained as the Phase 4 financial authority.

---

# 2. Target authority model

The canonical Store financial flow is:

~~~text
client sends commercial intent
        ↓
Store application service loads trusted catalog/store state
        ↓
backend validates items, stock and delivery inputs
        ↓
backend calculates all money in integer cents
        ↓
PurchaseOrder + PurchaseOrderItems freeze immutable monetary snapshot
        ↓
canonical Payment copies PurchaseOrder.total_cents
        ↓
order/payment commit atomically
~~~

The client may display and submit an expected total, but it cannot author the final total.

Payments never calculates Store pricing.

---

# 3. Store application boundary

Phase 4 should introduce or refactor toward a Store application service responsible for checkout finalization.

Conceptual boundary:

~~~text
StoreCheckoutService
├── validate commercial intent
├── load/lock products
├── resolve canonical unit prices
├── validate/reserve stock
├── calculate delivery fee through backend pricing authority
├── apply server-side tax/discount policy
├── freeze PurchaseOrder
├── freeze PurchaseOrderItems
└── create canonical Payment in same transaction
~~~

The HTTP controller must not calculate or persist money directly.

The Payment module must not load products, calculate delivery, evaluate coupons or manage stock.

---

# 4. Canonical product price

## Decision

The Phase 4 checkout price authority for a normal product is:

~~~text
products.price_cents
~~~

It is a positive safe integer of cents.

The current DECIMAL products.price must stop being the checkout authority.

## Current alternate catalog price columns

Legacy columns such as:

~~~text
cost_price
sale_price
wholesale_price
~~~

must not silently participate in checkout.

For Phase 4:

~~~text
effective checkout unit price = products.price_cents
~~~

until an explicit server-side pricing/promotion policy is implemented.

If sale/wholesale pricing is retained for other product features, its monetary representation must also move to integer cents before becoming authoritative.

The client cannot choose which price tier applies.

---

# 5. Canonical PurchaseOrder monetary snapshot

The Store order freezes these exact canonical fields:

~~~text
subtotal_cents
delivery_fee_cents
tax_cents
discount_cents
total_cents
currency
~~~

All are integer cents.

For Phase 4:

~~~text
currency = BRL
~~~

The invariant is:

~~~text
total_cents
=
subtotal_cents
+ delivery_fee_cents
+ tax_cents
- discount_cents
~~~

Required checks:

~~~text
subtotal_cents >= 0
delivery_fee_cents >= 0
tax_cents >= 0
discount_cents >= 0
total_cents > 0
discount_cents <= subtotal_cents + delivery_fee_cents + tax_cents
~~~

No decimal monetary field is canonical.

---

# 6. Canonical PurchaseOrder item snapshot

## Decision

Use normalized immutable order-line persistence rather than treating the current JSON/text items field as financial authority.

Target:

~~~text
purchase_order_items
├── id
├── purchase_order_id
├── product_id
├── product_name_snapshot
├── sku_snapshot
├── unit_price_cents
├── quantity
├── line_total_cents
├── created_at
└── updated_at
~~~

Required invariant:

~~~text
line_total_cents = unit_price_cents * quantity
~~~

with quantity a positive integer.

The sum of all line_total_cents must equal PurchaseOrder.subtotal_cents.

The old serialized items field may temporarily remain as a response/compatibility projection during implementation, but it is not a final financial authority.

A later Product price change never changes an existing PurchaseOrderItem snapshot.

---

# 7. Taxes and discounts in Phase 4

There is no trusted server-side tax or promotion engine in the audited Store checkout path.

Therefore Phase 4 freezes the safe MVP rule:

~~~text
tax_cents      = 0
discount_cents = 0
~~~

unless a separate server-side rule/module is introduced and tested before Phase 4 closes.

The client may not send authoritative tax or discount amounts.

A coupon/promotion identifier may be introduced later, but the backend must calculate the resulting discount.

Do not implement a client-supplied numeric discount as an interim shortcut.

---

# 8. Delivery mode and delivery-fee authority

## Explicit delivery mode

PurchaseOrder must persist delivery_mode as a real immutable business field:

~~~text
STORE_DELIVERY
APP_MOTOBOY
~~~

Do not hide delivery_mode inside price_breakdown or payment_info JSON.

## STORE_DELIVERY

The fee authority is backend store configuration:

~~~text
store.delivery_fee_cents
~~~

If the Store product configuration allows free delivery, the authoritative value is zero.

The current DECIMAL partners.delivery_fee must be replaced as an authoritative checkout input by an integer-cent representation.

## APP_MOTOBOY

The fee authority is a backend delivery-pricing capability:

~~~text
DeliveryPricingPort.quote(...)
→ delivery_fee_cents
~~~

The client cannot supply the fee.

The existing DeliveryOrder distance/fee algorithm may be adapted behind that port, but it must return integer cents and must not use floating-point money as the final financial result.

D2 does not make DeliveryOrder the Store financial authority.

## DeliveryOrder relationship

DeliveryOrder is an operational fulfillment object.

It may copy the already-frozen PurchaseOrder monetary snapshot for display/operations, but:

~~~text
DeliveryOrder total
must never overwrite/recalculate
PurchaseOrder.total_cents
or Payment.amount_cents
~~~

Platform/motoboy fee calculations belong to delivery/settlement concerns and must not silently change the customer Payment amount.

---

# 9. Store minimum-order and other monetary configuration

Any Store configuration used to accept/reject checkout must use cents before becoming authoritative.

At minimum, if minimum order is enforced:

~~~text
store.min_order_value_cents
~~~

must be compared against the canonical subtotal/total as defined by its business rule.

The legacy DECIMAL partners.min_order_value must not become a parallel authority.

---

# 10. Client trust boundary

The checkout client may submit commercial intent:

~~~text
store_id
items:
  - product_id
  - quantity

delivery_mode
delivery address / coordinates when required
payment_method
sales_channel
expected_total_cents
notes / delivery instructions
~~~

The client must NOT authoritatively submit:

~~~text
item name
unit price
line total
subtotal
delivery fee
tax amount
discount amount
total
currency override
payment_status
paid_at
processor
gateway
provider transaction
price_breakdown money
payment_info money
~~~

If legacy clients still send those fields while Phase 4 is being implemented, the new endpoint/validator should reject unknown financial-authority fields rather than silently trusting them.

---

# 11. expected_total_cents is a consent guard, not authority

The first-party checkout should submit:

~~~text
expected_total_cents
~~~

from the amount shown to the customer.

The backend independently recalculates the canonical total.

If:

~~~text
expected_total_cents == canonical total_cents
~~~

checkout may proceed.

If:

~~~text
expected_total_cents != canonical total_cents
~~~

then:

~~~text
NO PurchaseOrder
NO Payment
NO stock reservation/decrement
~~~

and the backend returns a deterministic price-change conflict containing the new authoritative breakdown needed for the UI to refresh/reconfirm.

Recommended error:

~~~text
STORE_CHECKOUT_PRICE_CHANGED
~~~

This protects customer consent without making the client the money authority.

---

# 12. Price changes between cart and checkout

## Decision

Phase 4 uses current-price revalidation at checkout.

There is no price-reservation TTL in this phase.

Flow:

~~~text
user sees cart
        ↓
catalog/store price may change
        ↓
checkout submission
        ↓
backend reloads current canonical prices
        ↓
if displayed total differs:
STORE_CHECKOUT_PRICE_CHANGED
        ↓
user sees/reconfirms new amount
~~~

Once PurchaseOrder is successfully created, its monetary snapshot is immutable even if catalog prices later change.

---

# 13. Stock authority and atomic reservation

## Decision

Stock validation is performed under database transaction/locking before the order/payment commit.

For each product:

- product exists;
- product is active;
- product belongs to the requested Store;
- quantity is a positive integer;
- sufficient stock exists.

Phase 4 first-party checkout does not support overselling/backorders.

Even if a legacy product flag allows backorder, an insufficient-stock first-party checkout must not create the canonical order/payment until a separate backorder policy is explicitly implemented.

## Reservation implementation direction

For the fastest safe MVP, decrement/reserve tracked stock in the same transaction that freezes PurchaseOrder and Payment.

Use guarded database writes/row locks so two concurrent checkouts cannot both consume the same final units.

Conceptual transaction:

~~~text
lock product rows in deterministic order
validate stock
calculate canonical checkout
verify expected_total_cents
decrement/reserve stock
create PurchaseOrder
create PurchaseOrderItems
create canonical Payment
COMMIT
~~~

Any failure rolls back all of those writes.

## Cancellation/restock

A cancellable Store order that has reserved/decremented stock must release that stock exactly once.

Phase 4 must use an idempotent release marker/transition rather than blindly incrementing stock on every cancellation replay.

The exact persistence helper may vary, but duplicate cancellation must not duplicate stock.

---

# 14. PurchaseOrder identity and idempotency

## HTTP/application checkout command

PurchaseOrder creation requires an Idempotency-Key.

Canonical uniqueness:

~~~text
UNIQUE(user_id, idempotency_key)
~~~

or an equivalent durable constraint.

The same user/key with equivalent checkout intent returns the same canonical PurchaseOrder.

The same user/key with materially different checkout intent returns an idempotency conflict.

## Payment identity

~~~text
context_type = STORE_ORDER
context_id   = <purchase_order.id>
business_key = STORE_ORDER:<purchase_order.id>
~~~

Deterministic Payment command idempotency key:

~~~text
store-payment:<purchase_order.id>:v1
~~~

A PurchaseOrder can own one canonical customer Payment obligation in the Phase 4 checkout model.

---

# 15. Payment mapping

After the PurchaseOrder snapshot exists inside the transaction:

~~~text
payer_id      = String(purchase_order.user_id)
commerce_type = PHYSICAL_GOOD
sales_channel = purchase_order.sales_channel
amount_cents  = purchase_order.total_cents
currency      = purchase_order.currency
method        = purchase_order.payment_method
~~~

Processor is derived by the shared routing policy.

For eligible Phase 4 commercial methods:

~~~text
CASH -> INTERNAL_CASH
CARD -> STRIPE
PIX  -> STRIPE
~~~

The existence of the STRIPE routing member does not mean Phase 4 executes Stripe. Provider execution begins in Phase 5.

The ambiguous legacy Store method app is removed from the canonical checkout vocabulary.

A legacy HTTP alias such as credit_card may be accepted only at the transport boundary and normalized to canonical CARD.

---

# 16. Store sales channel

PurchaseOrder persists an immutable:

~~~text
sales_channel
~~~

using:

~~~text
IOS_APP
ANDROID_APP
WEB
~~~

The HTTP boundary may map lowercase consumer values.

Do not infer sales channel from User-Agent.

The client may report its channel because it is not monetary authority; the server validates the vocabulary.

---

# 17. PurchaseOrder and Payment atomicity

PurchaseOrder + PurchaseOrderItems + stock reservation + Payment obligation must commit atomically.

Required boundary:

~~~text
BEGIN

validate/lock Store + products
calculate canonical cents
verify expected_total_cents
reserve/decrement stock
create PurchaseOrder
create PurchaseOrderItems
create canonical Payment using same trx

COMMIT
~~~

If canonical Payment creation fails, the PurchaseOrder and stock mutation roll back.

As in D1, Store integrates through a transaction-bound Payment application service.

Store must not import Payment persistence adapters.

---

# 18. PurchaseOrder financial immutability

After creation, these fields are immutable:

~~~text
user_id
store_id
sales_channel
currency
payment_method
subtotal_cents
delivery_fee_cents
tax_cents
discount_cents
total_cents
PurchaseOrderItem product identity
PurchaseOrderItem quantity
PurchaseOrderItem unit_price_cents
PurchaseOrderItem line_total_cents
~~~

Do not retain generic:

~~~text
PurchaseOrder.update(id, arbitraryUpdateData)
~~~

as a path that can mutate frozen commercial/financial fields.

Operational updates must use explicit commands/state transitions.

---

# 19. Payment status does not live on PurchaseOrder

The following legacy fields are not canonical Store financial authority:

~~~text
purchase_orders.payment_status
purchase_orders.paid_at
purchase_orders.payment_info
~~~

Phase 4 target:

- Payment.status is the financial state;
- Payment.paid_at is the paid timestamp;
- provider information belongs to Payment/PaymentAttempt;
- PurchaseOrder API may project a Payment summary, but must not maintain a second mutable payment status.

Because there are no real users/history to preserve, these fields should be removed after runtime consumers move.

No backfill is required.

---

# 20. Refund is not an order status

The current PurchaseOrder model can set:

~~~text
status = refunded
~~~

without a first-class financial Refund.

That conflates operational and financial state.

Phase 4 removes that behavior from the canonical Store order lifecycle.

A Store order may be cancelled/returned according to Store business rules.

Whether money is owed back is decided by the Store/refund policy and executed by Payments in Phase 8.

Do not represent financial refund completion by setting PurchaseOrder.status = refunded.

---

# 21. Canonical PurchaseOrder shape

Recommended minimum canonical fields:

~~~text
purchase_orders
├── id
├── user_id
├── store_id
├── type
├── status
├── sales_channel
├── payment_method
├── currency
├── delivery_mode
├── subtotal_cents
├── delivery_fee_cents
├── tax_cents
├── discount_cents
├── total_cents
├── total_items_quantity
├── delivery_address
├── delivery_latitude
├── delivery_longitude
├── delivery_instructions
├── delivery_contact_name
├── delivery_contact_phone
├── scheduled_delivery_at
├── idempotency_key
├── inventory_released_at
├── notes
├── created_at
└── updated_at
~~~

Fields unrelated to the financial contract may remain when operationally required.

The exact operational status vocabulary may remain Store-owned; financial states must not be mixed into it.

---

# 22. Legacy decimal cleanup

The following legacy monetary authorities must be replaced before Phase 4 closes:

~~~text
purchase_orders.subtotal
purchase_orders.delivery_fee
purchase_orders.taxes
purchase_orders.discount
purchase_orders.total_price

products.price
partners.delivery_fee
partners.min_order_value
~~~

Any additional monetary field that participates in checkout must also be converted to cents before becoming authoritative.

Migration policy:

~~~text
NO HISTORICAL MONEY BACKFILL REQUIRED
NO DUAL MONEY AUTHORITY AS FINAL DESIGN
~~~

Use forward migrations and update/reset non-production seed/fixture data.

Do not keep decimal + cents fields as two writable authorities.

---

# 23. DeliveryOrder financial relationship

When APP_MOTOBOY fulfillment creates/links a DeliveryOrder:

~~~text
PurchaseOrder remains customer-order financial authority
Payment remains customer-payment financial authority
DeliveryOrder remains fulfillment authority
~~~

DeliveryOrder may receive copied cents for operational projection.

It must not parse legacy PurchaseOrder decimals or independently calculate a new customer total.

Any platform/motoboy allocation is not customer Payment authority and later belongs to settlement policy.

---

# 24. Error contract

Phase 4 should expose stable Store application errors at minimum for:

~~~text
STORE_NOT_FOUND
STORE_NOT_ELIGIBLE
STORE_PRODUCT_NOT_FOUND
STORE_PRODUCT_WRONG_STORE
STORE_PRODUCT_INACTIVE
STORE_OUT_OF_STOCK
STORE_INVALID_QUANTITY
STORE_CHECKOUT_PRICE_CHANGED
STORE_CHECKOUT_IDEMPOTENCY_CONFLICT
STORE_INVALID_DELIVERY_MODE
STORE_DELIVERY_NOT_AVAILABLE
STORE_INVALID_PAYMENT_METHOD
STORE_ORDER_NOT_FOUND
STORE_ORDER_FINANCIAL_SNAPSHOT_IMMUTABLE
STORE_CONCURRENT_STOCK_CONFLICT
~~~

HTTP mapping is transport behavior and must not leak SQL errors.

---

# 25. Required tests

## Pricing authority

- backend ignores/rejects client subtotal/total as authority;
- backend ignores/rejects client unit price as authority;
- product.price_cents is used for Phase 4 unit price;
- line_total_cents = unit_price_cents * quantity;
- subtotal equals sum of line totals;
- delivery fee comes from backend authority;
- tax/discount are zero unless server policy exists;
- total invariant holds exactly;
- all money is integer cents.

## Price-change consent

- matching expected_total_cents allows checkout;
- mismatching expected_total_cents returns STORE_CHECKOUT_PRICE_CHANGED;
- mismatch creates no order;
- mismatch creates no Payment;
- mismatch changes no stock.

## Catalog snapshot

- catalog price change after order creation does not alter PurchaseOrderItem;
- product rename after order creation does not alter snapshot name;
- payment amount remains equal to frozen total.

## Stock/concurrency

- insufficient stock creates no order/payment;
- two concurrent buyers cannot both consume the same last stock;
- Payment failure rolls back stock mutation;
- cancellation releases stock once;
- cancellation replay does not double-restock.

## Idempotency

- same checkout key + same intent returns same PurchaseOrder and Payment;
- same key + changed intent conflicts;
- concurrent duplicate checkout creates one PurchaseOrder;
- one PurchaseOrder owns one canonical Payment.

## Financial separation

- client payment_status cannot mark Payment paid;
- PurchaseOrder has no mutable financial-status authority;
- Store operational delivery/cancellation does not directly invent refund state;
- DeliveryOrder cannot change customer total;
- Payment.amount_cents equals PurchaseOrder.total_cents exactly.

## Architecture

- Store controller does not calculate monetary totals;
- Store application code does not import Stripe;
- Store application code does not import Payment repositories;
- Payments does not import Product/Store/Delivery pricing;
- no parseFloat money remains in canonical Phase 4 checkout path.

---

# 26. Implementation order

Recommended Phase 4 sequence:

~~~text
1. introduce cents-based Store/catalog monetary fields
2. introduce PurchaseOrderItem snapshot persistence
3. introduce explicit delivery_mode / sales_channel / idempotency
4. build backend StoreCheckoutService
5. implement backend delivery-fee authority
6. add stock locking/reservation
7. implement expected_total_cents consent guard
8. create PurchaseOrder + items atomically
9. create canonical Payment in same transaction
10. switch API projections to canonical cents + Payment state
11. migrate DeliveryOrder linkage to frozen cents
12. remove generic financial update/payment_status/refunded shortcuts
13. remove legacy decimal financial authorities after consumer search
14. run Store + Payments + PostgreSQL concurrency gates
~~~

---

# 27. Explicitly deferred

D2 does not decide:

- Stripe PaymentIntent creation;
- card authorization vs capture;
- PIX expiration/webhook behavior;
- processor event schema;
- provider fees;
- Store refund entitlement/policy;
- tax engine;
- promotion/coupon engine;
- dynamic sale/wholesale pricing;
- marketplace seller settlement;
- Stripe Connect;
- chargeback allocation;
- fiscal/tax liability.

If these features are introduced, they must preserve the authority model in this document.

---

# 28. D2 closure statement

D2 is CLOSED with these decisions:

~~~text
Store money authority:
backend StoreCheckoutService

Product checkout price:
products.price_cents

Order lines:
normalized immutable PurchaseOrderItems

PurchaseOrder money:
subtotal_cents
delivery_fee_cents
tax_cents
discount_cents
total_cents
currency

Tax/discount in Phase 4:
0 unless server-owned policy exists

Price-change policy:
recalculate at checkout
expected_total_cents is consent guard
mismatch -> conflict, no writes

Delivery fee:
backend authority
STORE_DELIVERY -> configured store cents
APP_MOTOBOY -> DeliveryPricingPort cents

Stock:
lock/validate/reserve in checkout transaction
no backorder in Phase 4 first-party flow

Payment identity:
STORE_ORDER:<purchase_order_id>

Payment amount:
PurchaseOrder.total_cents

Payment creation:
same transaction as PurchaseOrder + stock reservation

PurchaseOrder payment_status/paid_at:
remove as authority

Order status refunded:
remove as financial shortcut

Generic financial updates:
forbidden after snapshot

Legacy decimal money:
remove after consumers move
no historical backfill
~~~

A workhorse implementing Phase 4 must not reopen these decisions without a concrete contradiction in the current codebase or a new product requirement.
