# JaResolve Tow — Consumer Flow Specification

> **SUPERSEDED / HISTORICAL — NOT CONTRACT AUTHORITY.** This document predates the
> current contract and was written against `1.0.0-draft.4`; any counts below are
> historical. Canonical contract: `docs/tow/tow-api-contract.openapi.yaml`
> (`1.0.0-draft.11`, backend pinned at `8f6f622f`). Consumer integration handoff:
> `docs/evidence/mvp-06/31-integration-handoff.md`.

> Status: **normative / frozen for mock implementation**  
> Scope: Mobile Cliente, Mobile Parceiro e Dashboard  
> Module: `module_key=tow`, `service_key=tow`, `partner_type=tow`  
> Transport: `tow-api-contract.openapi.yaml` `1.0.0-draft.4`

## 1. Purpose

Este documento define como Cliente, Parceiro e Dashboard implementam Tow antes da conclusão do backend, usando o OpenAPI canônico e mocks/fakes derivados do contrato.

Consumers podem implementar antecipadamente:

- feature scaffolding;
- navigation/UI;
- state management;
- DTO/client/repository;
- Google Maps screens;
- mocks/fakes;
- widget/golden/component tests;
- consumer E2E mocked;
- machine-readable error handling.

Consumers **não** reimplementam:

- module availability;
- eligibility/matching;
- pricing;
- proposal actionability;
- state transitions;
- payment readiness;
- cancellation fees;
- debt arithmetic;
- settlement/payout eligibility.

Distinção:

```text
TOW MOBILE CONTRACT READY FOR IMPLEMENTATION
!=
TOW BACKEND READY FOR INTEGRATION
```

A integração real contra backend só é considerada concluída depois de T18.

---

## 2. Shared transport conventions

Base URL:

```text
<environment>/api
```

Auth:

```http
Authorization: Bearer <jwt>
```

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "message": "localized/fallback human message",
  "error": {
    "code": "stable_machine_code",
    "details": {}
  }
}
```

Consumer logic usa `error.code`, nunca comparação textual de `message`.

Money no transport usa integer cents. Distância autoritativa usa metros inteiros.

---

## 3. Canonical Tow state

Request states:

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

Terminal reasons relevantes:

```text
NO_PROVIDER_AVAILABLE
SERVICE_DISABLED
CUSTOMER_CANCELLED
PARTNER_CANCELLED
CUSTOMER_NO_SHOW
PARTNER_NO_SHOW
ADMIN_OVERRIDE
```

Distinção importante:

```text
TowRequest.terminal_reason = SERVICE_DISABLED
```

é diferente de:

```text
error.code = service_module_disabled
```

O app usa `allowed_actions` e respostas do backend para habilitar CTAs; não deriva transition policy por conta própria.

---

## 4. Tow Module availability

Todos os consumers consultam disponibilidade global.

```http
GET /api/tow/module-status
```

Quando disabled:

- Cliente não inicia novo Tow;
- Parceiro não recebe novos jobs/opportunities nem cria proposals;
- Dashboard mostra disabled;
- request `ASSIGNED+` continua visível/operável até terminal;
- gestão cadastral de TowVehicle/documentos continua conforme permissão.

A UI é conveniência; backend continua sendo enforcement real.

---

# 5. Mobile Cliente

## 5.1 App/session recovery

Ao abrir/retomar:

```text
GET module status
→ GET /api/tow/requests
→ identificar atendimento ativo/histórico
→ GET /api/tow/requests/:requestId
```

`GET /api/tow/requests` é a recuperação canônica após process death, relogin, reinstall ou troca de device.

## 5.2 Entry point

```text
Home
→ module status
   ├─ disabled → indisponível
   └─ enabled  → Solicitar Guincho
```

UI states mínimos:

```text
loading
enabled
disabled
network_error/retry
```

## 5.3 Create request

```http
POST /api/tow/requests
```

Input visual mínimo:

```text
pickup
destination
vehicle class
make/model
weight/PBT quando exigido
problem description
observations
```

Resultado inicial:

```text
SEARCHING
```

UI não calcula preço nem raio de matching.

## 5.4 Searching

Renderizar:

- pickup/destination;
- `SEARCHING`;
- matching summary quando disponível;
- cancel;
- change destination apenas se `allowed_actions` permitir.

Alteração:

```http
PATCH /api/tow/requests/:requestId/destination
```

Backend invalida quote/proposal dependente e reinicia o ciclo adequado.

Se request terminar com `SERVICE_DISABLED`, mostrar estado terminal informativo e não tentar ressuscitar automaticamente.

## 5.5 Proposals / negotiation

```http
GET /api/tow/requests/:requestId/proposals
```

Card pode exibir:

- partner display name/rating;
- TowVehicle/equipment;
- route/ETA;
- server price;
- expiry;
- proposal/counteroffer status.

Ações:

```http
POST /api/tow/proposals/:proposalId/accept
POST /api/tow/proposals/:proposalId/counteroffer
```

Existe no máximo uma counteroffer por proposal. UI não oferece segunda rodada.

## 5.6 Assignment

Após acordo:

```text
ASSIGNED
```

Mostrar:

- partner;
- TowVehicle;
- frozen final price;
- frozen pickup/destination;
- payment selector/readiness.

Outras proposals ficam não acionáveis.

## 5.7 Payment

Métodos:

```text
card
pix
cash
```

Selection/change:

```http
PUT /api/tow/requests/:requestId/payment-method
GET /api/tow/requests/:requestId/payment
```

CARD:

```text
AUTHORIZED → partner pode EN_ROUTE
```

PIX:

```text
PENDING → PAID → partner pode EN_ROUTE
```

CASH:

```text
CASH_SELECTED → partner pode EN_ROUTE
```

`PAYMENT_METHOD_SELECTED` não é enum canônico.

Se método eletrônico falhar antes de `EN_ROUTE`, UI pode permitir troca sem perder assignment quando backend indicar ação válida.

## 5.8 Route + live tracking

Route snapshot:

```http
GET /api/tow/requests/:requestId/route
```

Tracking:

```http
GET /api/tow/requests/:requestId/tracking
```

Google Maps é a visualização padrão.

Renderizar:

- partner current position;
- pickup;
- destination;
- route/polyline quando retornada;
- state timeline;
- stale/no-location state.

Nunca recalcular Tow price a partir da rota no client.

## 5.9 Completion / dispute / review

Fluxo:

```text
EN_ROUTE
→ ARRIVED
→ IN_TRANSIT
→ COMPLETION_PENDING
```

Customer pode:

```http
POST /api/tow/requests/:requestId/completion/confirm
POST /api/tow/requests/:requestId/disputes
```

Após `COMPLETED`:

```http
POST /api/tow/requests/:requestId/review
```

Auto-confirm ocorre no backend após timeout; app não agenda regra crítica local.

## 5.10 Customer cancellation debt

Cash + cancel pós-EN_ROUTE pode produzir debt.

```http
GET  /api/tow/customer/debts
POST /api/tow/customer/debts/:debtId/pay
```

Pagamento de debt:

```text
card | pix
```

Enquanto existir debt impeditiva, novo request recebe `outstanding_financial_debt`.

---

# 6. Mobile Parceiro

## 6.1 Session/operational recovery

Ao abrir/retomar:

```text
GET module status
→ GET partner status
→ GET partner jobs
```

Endpoints:

```http
GET   /api/tow/partner/status
PATCH /api/tow/partner/status
PUT   /api/tow/partner/location
GET   /api/tow/partner/jobs
```

`operational` e `blocking_reasons` são calculados pelo backend.

Blockers típicos:

```text
MODULE_DISABLED
PARTNER_NOT_APPROVED
PARTNER_OFFLINE
PARTNER_UNAVAILABLE
NO_ACTIVE_TOW_VEHICLE
TOW_VEHICLE_DOCUMENT_NOT_APPROVED
TOW_VEHICLE_DOCUMENT_EXPIRED
PLATFORM_FEE_DEBT_LIMIT
ACTIVE_SERVICE
```

O app não reproduz essa policy.

## 6.2 TowVehicle management

```http
GET/POST          /api/tow/vehicles
GET/PATCH/DELETE  /api/tow/vehicles/:vehicleId
POST              /api/tow/vehicles/:vehicleId/activate
GET/POST          /api/tow/vehicles/:vehicleId/documents
DELETE            /api/tow/vehicles/:vehicleId/documents/:documentId
```

Document states:

```text
pending
approved
rejected
expired
```

Upload aceita JPEG/PNG/PDF conforme contrato.

Somente um TowVehicle ativo por partner. UI envia intenção; backend garante atomicidade.

## 6.3 Opportunities

```http
GET /api/tow/partner/opportunities
```

Cada item já deve trazer:

- request/customer vehicle summary;
- active TowVehicle;
- route quote;
- server-calculated proposal price;
- positive compatibility explanation;
- expiry.

Partner não digita preço inicial.

Enviar proposal:

```http
POST /api/tow/requests/:requestId/proposals
```

## 6.4 Proposal / counteroffer

```http
GET  /api/tow/partner/proposals
POST /api/tow/proposals/:proposalId/withdraw
POST /api/tow/counteroffers/:counterofferId/accept
POST /api/tow/counteroffers/:counterofferId/reject
```

Withdraw somente quando backend permitir. Não existe contra-contra-proposta.

## 6.5 Assigned job

Recovery/history:

```http
GET /api/tow/partner/jobs
```

Tela mostra:

- pickup/destination;
- customer/vehicle summary;
- final price;
- payment readiness;
- route/navigation;
- allowed operational actions.

Disable global não interrompe request já `ASSIGNED`.

## 6.6 Operational transitions

```http
POST /api/tow/requests/:requestId/en-route
POST /api/tow/requests/:requestId/arrived
POST /api/tow/requests/:requestId/in-transit
POST /api/tow/requests/:requestId/finish
```

Tracking write:

```http
POST /api/tow/requests/:requestId/tracking
```

Network retry deve preservar idempotência por contrato; UI não avança state localmente antes da confirmação autoritativa necessária.

## 6.7 Cash

```http
POST /api/tow/requests/:requestId/cash-received
```

Partner não calcula platform fee debt.

Tow-specific financial state:

```http
GET /api/tow/partner/financial-summary
```

Pode exibir:

```text
wallet_available_cents
pending_settlement_cents
platform_fee_debt_cents
platform_fee_debt_limit_cents
blocked_by_debt
```

Generic transaction history pode continuar usando wallet horizontal existente.

## 6.8 Cancellation / no-show

```http
POST /api/tow/requests/:requestId/cancel-partner
POST /api/tow/requests/:requestId/customer-no-show
```

Backend decide eligibility/financial consequences.

---

# 7. Dashboard

## 7.1 Module control

```http
GET   /api/admin/tow/module
PATCH /api/admin/tow/module
```

Disable exige `reason`.

Antes de confirmar, UI informa:

```text
new Tow requests blocked
SEARCHING/NEGOTIATING will close with SERVICE_DISABLED
ASSIGNED+ will drain normally
```

Backend resolve atomicamente corrida com assignment.

## 7.2 Settings

```http
GET   /api/admin/tow/settings
PATCH /api/admin/tow/settings
```

PATCH é true partial.

Settings canônicos:

```text
tow_initial_radius_km
tow_radius_increment_km
tow_max_radius_km
tow_radius_expansion_interval_minutes
tow_request_search_timeout_minutes
tow_proposal_expiry_minutes
tow_counteroffer_expiry_minutes
tow_completion_confirmation_timeout_minutes
tow_customer_no_show_timeout_minutes
tow_platform_fixed_fee_cents
tow_cancellation_fee_cents
tow_cancellation_partner_percentage
tow_cancellation_platform_percentage
tow_max_platform_fee_debt_cents
```

## 7.3 Vehicle document verification

```http
GET  /api/admin/tow/vehicle-documents
GET  /api/admin/tow/vehicle-documents/:documentId
POST /api/admin/tow/vehicle-documents/:documentId/approve
POST /api/admin/tow/vehicle-documents/:documentId/reject
```

Detail inclui document + TowVehicle + partner.

## 7.4 Operational monitoring

```http
GET /api/admin/tow/requests
GET /api/admin/tow/requests/:requestId
```

List filters incluem state, partner, customer, payment e período.

Detail contém request, proposals/counteroffers, route, tracking, payment, financial summary e audit events.

## 7.5 Admin override

```http
POST /api/admin/tow/requests/:requestId/override-cancel
POST /api/admin/tow/requests/:requestId/override-complete
```

`reason` obrigatório; backend registra actor/timestamp/before/after.

## 7.6 Disputes

```http
GET  /api/admin/tow/disputes
GET  /api/admin/tow/disputes/:disputeId
POST /api/admin/tow/disputes/:disputeId/resolve
```

Detail fornece evidence aggregate sem acesso direto ao DB.

## 7.7 Payout batches

```http
GET  /api/admin/tow/payout-batches/preview
POST /api/admin/tow/payout-batches
GET  /api/admin/tow/payout-batches/:batchId
POST /api/admin/tow/payout-batches/:batchId/process
```

Preview/batch possuem line items por partner e debt offset.

## 7.8 Audit

```http
GET /api/admin/tow/audit-events
```

UI não depende de logs efêmeros do servidor.

---

# 8. Consumer UI state modelling

Separar:

```text
Presentation/UI state
- loading
- refreshing
- submitting
- error
```

from:

```text
Domain state
- SEARCHING
- NEGOTIATING
- ASSIGNED
...
```

Não criar pseudo-domain states que não existam no contrato.

---

# 9. Realtime

```text
REST = source of truth / rehydration
Socket/Push = notification / UX acceleration
```

Eventos sugeridos:

```text
tow.request.updated
tow.proposal.created
tow.proposal.updated
tow.counteroffer.updated
tow.assignment.created
tow.tracking.updated
tow.payment.updated
tow.dispute.updated
tow.module.updated
```

Se realtime falhar, REST deve reconstruir o estado.

---

# 10. Error codes mínimos

```text
service_module_disabled
outstanding_financial_debt
partner_platform_fee_debt_limit
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
external_dependency_unavailable
conflict
validation_error
unauthorized
forbidden
not_found
```

Consumers localizam mensagem por code.

---

# 11. Mock implementation handoff gate

Após merge do contrato, consumer implementation pode começar se:

```text
OpenAPI parse/ref validation = PASS
operationId uniqueness = PASS
Cliente smoke = PASS
Parceiro smoke = PASS
Dashboard smoke = PASS
undocumented endpoint/DTO required = 0
```

Essas condições estão evidenciadas em:

```text
TOW-OPENAPI-CONSISTENCY-REVIEW.md
TOW-CONSUMER-CONTRACT-SMOKE-RESULT.md
TOW-CONSUMER-FLOW-COVERAGE.md
```

---

# 12. Contract change rule

Após merge, breaking change que afete consumer exige:

1. atualização do OpenAPI;
2. atualização dos docs funcionais afetados;
3. contract/regression test;
4. atualização das Issues consumidoras;
5. comunicação explícita;
6. nenhuma adaptação silenciosa para legado.

Se uma capability necessária não estiver representável pelo contrato, consumer implementation deve parar e o contrato deve ser corrigido antes de criar fallback local.