# JaResolve Tow — Consumer API Contract

> Contract version: `tow-v1-draft`  
> Status: **Normative target contract for backend + early consumer implementation**  
> Base path: `/api/tow`  
> Admin base path: `/api/admin/tow`

## 1. Contract policy

Este documento define os **paths, DTOs, enums, error codes e semantics** que Mobile Cliente, Mobile Parceiro e Dashboard podem usar para implementação antecipada com mocks.

O backend atual possui rotas históricas de `emergency-requests` e `tow-proposals`. T00 deve auditá-las. A implementação nova deve convergir para este contrato canônico; aliases legados, se temporariamente necessários, não devem virar dependência nova dos consumidores.

**B4 (in force) — deprecated legacy surface.** `/api/tow/*` is the canonical API. The legacy Tow surface (`/api/tow-proposals*` and the Tow branches of `/api/emergency-requests*`) is deprecated in place: headers `Deprecation: true`, `Warning: 299` and `Link: </api/tow/module-status>; rel="successor-version"`. No first-party consumer was found; removal awaits external-consumer confirmation (`docs/evidence/tow-zero-debt/B4-legacy-removal-issue.md`). Do not add new consumer dependencies on those routes.

Breaking change depois do merge deste contrato exige atualização explícita da especificação + contract tests.

---

## 2. Global conventions

### 2.1 Authentication

```http
Authorization: Bearer <jwt>
```

### 2.2 Content type

```http
Content-Type: application/json
```

Uploads usam `multipart/form-data`.

### 2.3 Idempotency

Operações críticas mutáveis aceitam/exigem:

```http
Idempotency-Key: <uuid>
```

Aplicável especialmente a:

- create Tow request;
- proposal creation;
- proposal/counteroffer acceptance;
- payment selection/creation;
- operational transitions;
- cancellation;
- debt payment;
- admin payout processing.

### 2.4 Time

Todos timestamps são ISO-8601 UTC:

```text
2026-09-17T05:15:00.000Z
```

### 2.5 Money

Valores monetários de contrato usam inteiro em centavos:

```json
{
  "amount_cents": 18000,
  "currency": "BRL"
}
```

Consumidores não devem usar floating-point como fonte de verdade financeira.

### 2.6 Distance

Distâncias usam metros inteiros:

```json
{
  "distance_meters": 14350,
  "duration_seconds": 1260
}
```

### 2.7 Response envelope

Success:

```json
{
  "success": true,
  "message": "optional",
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "message": "human readable",
  "error": {
    "code": "invalid_tow_state",
    "details": {}
  }
}
```

### 2.8 HTTP status policy

```text
200 success/update
201 created
202 accepted async operation when applicable
400 malformed request
401 unauthenticated
403 authenticated but forbidden
404 resource not found
409 domain/state/idempotency conflict
422 field/business validation error
500 unexpected server error
503 temporary external dependency unavailable
```

---

# 3. Canonical enums

## 3.1 Tow module

```text
tow
```

## 3.2 Partner type

```text
tow
```

## 3.3 Vehicle classes

```text
motorcycle
light_vehicle
medium_truck
heavy_truck
```

## 3.4 Equipment type

```text
flatbed
wheel_lift
heavy_wrecker
```

## 3.5 Tow request state

```text
SEARCHING
NEGOTIATING
ASSIGNED
EN_ROUTE
ARRIVED
IN_TRANSIT
COMPLETION_PENDING
COMPLETED
CANCELLED
EXPIRED
DISPUTED
```

## 3.6 Terminal reason

```text
NO_PROVIDER_AVAILABLE
SERVICE_DISABLED
CUSTOMER_CANCELLED
PARTNER_CANCELLED
CUSTOMER_NO_SHOW
PARTNER_NO_SHOW
ADMIN_OVERRIDE
```

## 3.7 Proposal status

```text
ACTIVE
COUNTERED
ACCEPTED
REJECTED
WITHDRAWN
EXPIRED
CLOSED
```

## 3.8 Counteroffer status

```text
PENDING
ACCEPTED
REJECTED
EXPIRED
CLOSED
```

## 3.9 Payment method

```text
card
pix
cash
```

## 3.10 Payment status

Shared contract values:

```text
NOT_SELECTED
PENDING
REQUIRES_ACTION
AUTHORIZED
PAID
CASH_SELECTED
CASH_RECEIVED
CAPTURED
PARTIALLY_REFUNDED
REFUNDED
CANCELLED
EXPIRED
FAILED
```

Nem todo método utiliza todos os estados.

## 3.11 Vehicle document status

```text
pending
approved
rejected
expired
```

---

# 4. Core DTOs

## 4.1 GeoPoint

```json
{
  "latitude": -9.974,
  "longitude": -67.807,
  "formatted_address": "optional"
}
```

## 4.2 CustomerVehicle

```json
{
  "class": "light_vehicle",
  "make": "Toyota",
  "model": "Corolla",
  "year": 2022,
  "weight_kg": null,
  "plate": "optional"
}
```

`weight_kg` é obrigatório quando a policy exigir, em especial para `medium_truck` e `heavy_truck`.

## 4.3 TowVehicleSummary

```json
{
  "id": "tv_123",
  "plate": "ABC1D23",
  "make": "Mercedes-Benz",
  "model": "Atego",
  "year": 2024,
  "equipment_type": "flatbed",
  "supported_vehicle_classes": ["motorcycle", "light_vehicle"],
  "max_towed_weight_kg": 3500,
  "document_status": "approved",
  "active": true
}
```

## 4.4 RouteQuote

```json
{
  "provider_to_pickup": {
    "distance_meters": 6300,
    "duration_seconds": 720
  },
  "pickup_to_destination": {
    "distance_meters": 8050,
    "duration_seconds": 900
  },
  "total_distance_meters": 14350,
  "total_duration_seconds": 1620
}
```

## 4.5 Money

```json
{
  "amount_cents": 18200,
  "currency": "BRL"
}
```

## 4.6 TowRequest

```json
{
  "id": "tow_req_123",
  "state": "NEGOTIATING",
  "terminal_reason": null,
  "module_key": "tow",
  "customer_id": "usr_1",
  "pickup": {
    "latitude": -9.974,
    "longitude": -67.807,
    "formatted_address": "Rua A, Rio Branco - AC"
  },
  "destination": {
    "latitude": -9.95,
    "longitude": -67.82,
    "formatted_address": "Rua B, Rio Branco - AC"
  },
  "vehicle": {
    "class": "light_vehicle",
    "make": "Toyota",
    "model": "Corolla",
    "year": 2022,
    "weight_kg": null
  },
  "problem_description": "vehicle not starting",
  "observations": null,
  "matching": {
    "current_radius_km": 20,
    "max_radius_km": 100,
    "search_expires_at": "2026-09-17T05:35:00.000Z"
  },
  "assignment": null,
  "payment": {
    "method": null,
    "status": "NOT_SELECTED",
    "can_start_service": false
  },
  "allowed_actions": ["cancel", "change_destination", "accept_proposal", "counteroffer"],
  "created_at": "2026-09-17T05:15:00.000Z",
  "updated_at": "2026-09-17T05:17:00.000Z"
}
```

### `allowed_actions`

O backend pode retornar ações permitidas para reduzir duplicação de policy no app.

Valores iniciais:

```text
cancel
change_destination
accept_proposal
counteroffer
select_payment_method
confirm_completion
open_dispute
review
send_proposal
withdraw_proposal
accept_counteroffer
reject_counteroffer
start_en_route
mark_arrived
start_in_transit
finish_service
mark_cash_received
report_customer_no_show
```

A ausência de uma ação significa que a UI não deve oferecê-la naquele snapshot.

## 4.7 TowProposal

```json
{
  "id": "tow_prop_1",
  "request_id": "tow_req_123",
  "partner_id": "partner_10",
  "partner": {
    "display_name": "Guincho Exemplo",
    "rating": 4.8,
    "review_count": 124
  },
  "tow_vehicle": {
    "id": "tv_123",
    "plate": "ABC1D23",
    "equipment_type": "flatbed"
  },
  "route_quote": {
    "total_distance_meters": 14350,
    "total_duration_seconds": 1620
  },
  "price": {
    "amount_cents": 18200,
    "currency": "BRL"
  },
  "status": "ACTIVE",
  "expires_at": "2026-09-17T05:22:00.000Z",
  "counteroffer": null,
  "created_at": "2026-09-17T05:17:00.000Z"
}
```

## 4.8 Counteroffer

```json
{
  "id": "tow_co_1",
  "proposal_id": "tow_prop_1",
  "amount_cents": 16000,
  "currency": "BRL",
  "status": "PENDING",
  "expires_at": "2026-09-17T05:25:00.000Z",
  "created_at": "2026-09-17T05:20:00.000Z"
}
```

## 4.9 Assignment

```json
{
  "partner_id": "partner_10",
  "tow_vehicle_id": "tv_123",
  "final_price": {
    "amount_cents": 16000,
    "currency": "BRL"
  },
  "assigned_at": "2026-09-17T05:21:00.000Z"
}
```

## 4.10 PaymentSummary

```json
{
  "request_id": "tow_req_123",
  "method": "pix",
  "status": "PENDING",
  "amount_cents": 16000,
  "currency": "BRL",
  "can_start_service": false,
  "pix": {
    "copy_paste": "000201...",
    "qr_code_image_url": "https://...",
    "expires_at": "2026-09-17T05:40:00.000Z"
  }
}
```

Fields específicos de provider não devem vazar além do necessário ao consumidor.

---

# 5. Shared / module endpoints

## 5.1 GET `/api/tow/module-status`

Auth: public ou authenticated-safe.

Response:

```json
{
  "success": true,
  "data": {
    "module_key": "tow",
    "service_key": "tow",
    "enabled": true,
    "disabled_reason": null,
    "updated_at": "2026-09-17T05:00:00.000Z"
  }
}
```

Consumidores devem usar este endpoint para entry-point availability.

---

# 6. Mobile Cliente endpoints

## 6.1 POST `/api/tow/requests`

Auth: customer.

Headers:

```http
Idempotency-Key: <uuid>
```

Request:

```json
{
  "pickup": {"latitude": -9.974, "longitude": -67.807},
  "destination": {"latitude": -9.95, "longitude": -67.82},
  "vehicle": {
    "class": "light_vehicle",
    "make": "Toyota",
    "model": "Corolla",
    "year": 2022,
    "weight_kg": null
  },
  "problem_description": "vehicle not starting",
  "observations": null
}
```

Success: `201`, returns `TowRequest`.

Relevant errors:

```text
service_module_disabled
outstanding_financial_debt
validation_error
```

## 6.2 GET `/api/tow/requests/:requestId`

Auth: owner customer, assigned partner or authorized admin depending caller.

Returns current authoritative `TowRequest` snapshot.

## 6.3 PATCH `/api/tow/requests/:requestId/destination`

Auth: owner customer.

Allowed only pre-assignment.

Request:

```json
{
  "destination": {"latitude": -9.94, "longitude": -67.81}
}
```

Backend invalidates prior negotiation/quotes as defined by domain.

Errors:

```text
invalid_tow_state
request_already_assigned
service_module_disabled
```

## 6.4 GET `/api/tow/requests/:requestId/proposals`

Auth: owner customer.

Response:

```json
{
  "success": true,
  "data": {
    "items": [],
    "request_state": "NEGOTIATING"
  }
}
```

## 6.5 POST `/api/tow/proposals/:proposalId/accept`

Auth: owner customer.

Headers: `Idempotency-Key`.

Success returns updated request with `ASSIGNED` and frozen `assignment`.

Errors:

```text
proposal_expired
proposal_not_actionable
request_already_assigned
service_module_disabled
conflict
```

## 6.6 POST `/api/tow/proposals/:proposalId/counteroffer`

Auth: owner customer.

Headers: `Idempotency-Key`.

Request:

```json
{
  "amount_cents": 16000,
  "currency": "BRL"
}
```

Success: `201`, returns `Counteroffer`.

Errors:

```text
counteroffer_already_used
proposal_expired
proposal_not_actionable
service_module_disabled
```

## 6.7 PUT `/api/tow/requests/:requestId/payment-method`

Auth: owner customer.

Headers: `Idempotency-Key`.

CARD request:

```json
{
  "method": "card",
  "payment_source_token": "provider-token-from-client-sdk"
}
```

PIX request:

```json
{
  "method": "pix"
}
```

CASH request:

```json
{
  "method": "cash"
}
```

Response: `PaymentSummary`.

Method may be changed before `EN_ROUTE` when contract permits.

## 6.8 GET `/api/tow/requests/:requestId/payment`

Auth: owner customer, assigned partner gets sanitized readiness subset, admin as authorized.

Returns current `PaymentSummary`.

## 6.9 POST `/api/tow/requests/:requestId/cancel`

Auth: owner customer.

Headers: `Idempotency-Key`.

Request:

```json
{
  "reason": "optional customer reason"
}
```

Response includes cancellation consequence:

```json
{
  "success": true,
  "data": {
    "request": {},
    "financial_consequence": {
      "fee_due_cents": 5000,
      "currency": "BRL",
      "customer_debt_created": false,
      "refund_status": "PENDING"
    }
  }
}
```

## 6.10 POST `/api/tow/requests/:requestId/completion/confirm`

Auth: owner customer.

Headers: `Idempotency-Key`.

Transitions `COMPLETION_PENDING → COMPLETED`.

## 6.11 POST `/api/tow/requests/:requestId/disputes`

Auth: owner customer.

Request:

```json
{
  "reason": "service_not_completed_as_expected",
  "description": "optional details"
}
```

Returns dispute and updated request state.

## 6.12 POST `/api/tow/requests/:requestId/review`

Auth: owner customer.

Allowed only `COMPLETED`.

Request:

```json
{
  "rating": 5,
  "comment": "optional"
}
```

## 6.13 GET `/api/tow/requests/:requestId/tracking`

Auth: owner customer, assigned partner/admin as permitted.

Response:

```json
{
  "success": true,
  "data": {
    "latest": {
      "latitude": -9.97,
      "longitude": -67.80,
      "recorded_at": "2026-09-17T05:26:10.000Z"
    },
    "route": {
      "pickup": {},
      "destination": {}
    }
  }
}
```

## 6.14 GET `/api/tow/customer/debts`

Auth: customer.

Returns open/paid Tow financial debts.

## 6.15 POST `/api/tow/customer/debts/:debtId/pay`

Auth: owner customer.

Headers: `Idempotency-Key`.

Request:

```json
{
  "method": "pix"
}
```

or CARD with `payment_source_token`.

Cash is not accepted for debt payoff in MVP.

---

# 7. Mobile Parceiro — TowVehicle endpoints

## 7.1 GET `/api/tow/vehicles`

Auth: partner `tow`.

Returns own vehicles.

## 7.2 POST `/api/tow/vehicles`

Auth: partner `tow`.

Request:

```json
{
  "plate": "ABC1D23",
  "make": "Mercedes-Benz",
  "model": "Atego",
  "year": 2024,
  "equipment_type": "flatbed",
  "supported_vehicle_classes": ["motorcycle", "light_vehicle"],
  "max_towed_weight_kg": 3500,
  "pricing": {
    "minimum_charge_cents": 15000,
    "included_km": 10,
    "price_per_additional_km_cents": 800
  }
}
```

## 7.3 GET `/api/tow/vehicles/:vehicleId`

Auth: owner partner/admin.

## 7.4 PATCH `/api/tow/vehicles/:vehicleId`

Auth: owner partner.

Edits metadata/capabilities/pricing according to state restrictions.

## 7.5 DELETE `/api/tow/vehicles/:vehicleId`

Auth: owner partner.

Only when safe under domain constraints.

## 7.6 POST `/api/tow/vehicles/:vehicleId/activate`

Auth: owner partner.

Headers: `Idempotency-Key`.

Guarantees max one active vehicle.

Errors:

```text
tow_document_required
tow_document_not_approved
vehicle_not_operational
conflict
```

## 7.7 GET `/api/tow/vehicles/:vehicleId/documents`

Auth: owner partner/admin.

## 7.8 POST `/api/tow/vehicles/:vehicleId/documents`

Auth: owner partner.

Multipart:

```text
file: JPEG | PNG | PDF
document_type: vehicle_license | tow_authorization | other_supported_type
expires_at: optional ISO date
```

Response returns document with `pending` status.

## 7.9 DELETE `/api/tow/vehicles/:vehicleId/documents/:documentId`

Auth: owner partner, subject to document lifecycle restrictions.

---

# 8. Mobile Parceiro — operational endpoints

## 8.1 GET `/api/tow/partner/opportunities`

Auth: eligible `tow` partner.

Returns current opportunities already filtered by backend eligibility.

Query parameters may include pagination only; consumer must not recreate radius/compatibility filtering.

## 8.2 POST `/api/tow/requests/:requestId/proposals`

Auth: eligible `tow` partner.

Headers: `Idempotency-Key`.

No price field is accepted from partner.

Request:

```json
{}
```

Response: server-calculated `TowProposal`.

Errors:

```text
service_module_disabled
vehicle_not_compatible
vehicle_not_operational
partner_platform_fee_debt_limit
```

## 8.3 GET `/api/tow/partner/proposals`

Auth: partner.

Supports status/pagination filters.

## 8.4 POST `/api/tow/proposals/:proposalId/withdraw`

Auth: proposal owner partner.

Allowed only before counteroffer/assignment.

## 8.5 POST `/api/tow/counteroffers/:counterofferId/accept`

Auth: target partner.

Headers: `Idempotency-Key`.

May atomically produce assignment.

## 8.6 POST `/api/tow/counteroffers/:counterofferId/reject`

Auth: target partner.

Headers: `Idempotency-Key`.

Closes that negotiation.

## 8.7 POST `/api/tow/requests/:requestId/en-route`

Auth: assigned partner.

Headers: `Idempotency-Key`.

Requires payment readiness for method.

## 8.8 POST `/api/tow/requests/:requestId/arrived`

Auth: assigned partner.

Request:

```json
{
  "location": {"latitude": -9.974, "longitude": -67.807}
}
```

## 8.9 POST `/api/tow/requests/:requestId/in-transit`

Auth: assigned partner.

Headers: `Idempotency-Key`.

## 8.10 POST `/api/tow/requests/:requestId/finish`

Auth: assigned partner.

Request:

```json
{
  "location": {"latitude": -9.95, "longitude": -67.82}
}
```

Transitions to `COMPLETION_PENDING`.

## 8.11 POST `/api/tow/requests/:requestId/tracking`

Auth: assigned partner.

Request:

```json
{
  "latitude": -9.97,
  "longitude": -67.80,
  "recorded_at": "2026-09-17T05:26:10.000Z"
}
```

Endpoint must be idempotent/deduplicated enough for retry semantics.

## 8.12 POST `/api/tow/requests/:requestId/cash-received`

Auth: assigned partner.

Only CASH flow.

Headers: `Idempotency-Key`.

Does not create electronic wallet earning for `final_price`.

## 8.13 POST `/api/tow/requests/:requestId/cancel-partner`

Auth: assigned partner.

Request:

```json
{
  "reason": "vehicle_failure"
}
```

Customer is not charged. Rematch only if Tow Module enabled and domain permits.

## 8.14 POST `/api/tow/requests/:requestId/customer-no-show`

Auth: assigned partner.

Allowed only after `ARRIVED` + configured timeout.

---

# 9. Admin / Dashboard endpoints

## 9.1 GET `/api/admin/tow/module`

Auth: admin.

Returns full module metadata.

## 9.2 PATCH `/api/admin/tow/module`

Auth: admin.

Headers: `Idempotency-Key`.

Request disable:

```json
{
  "enabled": false,
  "reason": "maintenance"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "module_key": "tow",
    "enabled": false,
    "disabled_reason": "maintenance",
    "affected_unassigned_requests": 3,
    "assigned_requests_draining": 2,
    "updated_at": "2026-09-17T05:30:00.000Z"
  }
}
```

## 9.3 GET `/api/admin/tow/settings`

Auth: admin.

Returns typed Tow settings.

## 9.4 PATCH `/api/admin/tow/settings`

Auth: admin.

Supports partial update; backend validates full resulting invariant set.

Example:

```json
{
  "tow_max_radius_km": 100,
  "tow_proposal_expiry_minutes": 5,
  "tow_counteroffer_expiry_minutes": 5
}
```

## 9.5 GET `/api/admin/tow/vehicle-documents`

Auth: admin.

Query:

```text
status=pending|approved|rejected|expired
partner_id=
vehicle_id=
page=
limit=
```

## 9.6 GET `/api/admin/tow/vehicle-documents/:documentId`

Auth: admin.

Returns metadata + secure file access reference.

## 9.7 POST `/api/admin/tow/vehicle-documents/:documentId/approve`

Auth: admin.

Headers: `Idempotency-Key`.

## 9.8 POST `/api/admin/tow/vehicle-documents/:documentId/reject`

Auth: admin.

Request:

```json
{
  "reason": "document unreadable"
}
```

## 9.9 GET `/api/admin/tow/requests`

Auth: admin.

Filters:

```text
state
terminal_reason
partner_id
customer_id
payment_method
payment_status
from
to
page
limit
```

## 9.10 GET `/api/admin/tow/requests/:requestId`

Auth: admin.

Returns aggregate view including operational + negotiation + payment/financial summaries + audit references.

## 9.11 POST `/api/admin/tow/requests/:requestId/override-cancel`

Auth: admin.

Headers: `Idempotency-Key`.

Request:

```json
{
  "reason": "required"
}
```

## 9.12 POST `/api/admin/tow/requests/:requestId/override-complete`

Auth: admin.

Headers: `Idempotency-Key`.

Request requires non-empty reason.

## 9.13 GET `/api/admin/tow/disputes`

Auth: admin.

Filters by status/request/partner/customer/date.

## 9.14 GET `/api/admin/tow/disputes/:disputeId`

Auth: admin.

Returns evidence/timeline.

## 9.15 POST `/api/admin/tow/disputes/:disputeId/resolve`

Auth: admin.

Headers: `Idempotency-Key`.

Request example:

```json
{
  "resolution": "release_partner_funds",
  "reason": "evidence confirms completion"
}
```

Exact allowed financial outcomes are finalized by T17 but must remain explicit, not free-form DB mutation.

## 9.16 GET `/api/admin/tow/payout-batches/preview`

Auth: admin.

Returns eligible partner totals without side effects.

## 9.17 POST `/api/admin/tow/payout-batches`

Auth: admin.

Headers: `Idempotency-Key`.

Creates a frozen logical batch from eligible balances.

## 9.18 GET `/api/admin/tow/payout-batches/:batchId`

Auth: admin.

Returns batch/items/status.

## 9.19 POST `/api/admin/tow/payout-batches/:batchId/process`

Auth: admin.

Headers: `Idempotency-Key`.

Must never duplicate payout on retry.

## 9.20 GET `/api/admin/tow/audit-events`

Auth: admin.

Filters:

```text
request_id
partner_id
customer_id
module_action
actor_id
from
to
page
limit
```

---

# 10. Existing horizontal endpoints reused

Tow does not duplicate shared infrastructure unnecessarily.

Consumers may continue using official shared contracts where appropriate:

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/verify
POST /api/auth/logout

GET  /api/notifications
PUT  /api/notifications/:id/read
PUT  /api/notifications/read-all
PUT  /api/notifications/fcm-token

GET  /api/wallets
GET  /api/wallets/transactions
```

Payment gateway-specific webhooks remain backend-only and are not consumer APIs.

---

# 11. Realtime contract

REST remains source of truth.

Suggested Socket.IO event namespace/payload envelope:

```json
{
  "event": "tow.request.updated",
  "request_id": "tow_req_123",
  "version": 12,
  "occurred_at": "2026-09-17T05:26:10.000Z"
}
```

Initial event names:

```text
tow.module.updated
tow.request.updated
tow.proposal.created
tow.proposal.updated
tow.counteroffer.updated
tow.assignment.created
tow.tracking.updated
tow.payment.updated
tow.dispute.updated
```

Events are invalidation/update signals. Consumers must be able to recover solely through REST.

---

# 12. Stable error codes

```text
service_module_disabled
outstanding_financial_debt
partner_platform_fee_debt_limit
partner_not_operational
invalid_tow_state
invalid_tow_transition
not_request_owner
not_assigned_partner
vehicle_not_compatible
vehicle_not_operational
tow_document_required
tow_document_not_approved
proposal_expired
proposal_not_actionable
counteroffer_already_used
counteroffer_expired
request_already_assigned
payment_not_ready
payment_failed
payment_method_not_changeable
customer_no_show_not_allowed_yet
idempotency_conflict
conflict
validation_error
unauthorized
forbidden
not_found
external_dependency_unavailable
```

---

# 13. Consumer implementation rule

Mobile/Dashboard podem gerar clients, repositories, mocks e telas a partir deste contrato imediatamente após merge do PR de contrato.

Até T18:

- mocks são permitidos;
- feature UI pode evoluir;
- integração parcial com endpoints já implementados pode ocorrer em ambiente de desenvolvimento;
- **não declarar integração concluída**;
- não criar fallback local para regra ainda ausente no backend;
- não mudar DTO/path silenciosamente para acomodar endpoint legado.

T18 congela o contrato implementado e comprova compatibilidade final.