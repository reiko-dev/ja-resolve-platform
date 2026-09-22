# JaResolve — Especificação Funcional Congelada do Módulo Guincho (Tow)

> **SUPERSEDED / HISTORICAL — NOT CONTRACT AUTHORITY.** This document predates the
> current contract and was written against `1.0.0-draft.4`; any counts below are
> historical. Canonical contract: `docs/tow/tow-api-contract.openapi.yaml`
> (`1.0.0-draft.11`, backend pinned at `8f6f622f`). Consumer integration handoff:
> `docs/evidence/mvp-06/31-integration-handoff.md`.

> Status: **normative / frozen for implementation**  
> Module: `tow`  
> Service: `tow`  
> Partner type: `tow`  
> Consumer transport contract: `tow-api-contract.openapi.yaml` `1.0.0-draft.4`

## 1. Objetivo

O serviço **Guincho / Tow** conecta clientes que precisam transportar um veículo a parceiros `tow` elegíveis por disponibilidade, localização, documentação, capacidade e compatibilidade operacional.

O backend é a fonte de verdade do domínio. Mobile Cliente, Mobile Parceiro e Dashboard apresentam estado e enviam intenção; não reimplementam matching, pricing, transições, pagamentos, dívidas, payout ou feature flags.

Fluxo macro:

```text
Solicitação
→ Matching geográfico
→ Múltiplas propostas
→ Aceite OU 1 contraproposta
→ Assignment
→ Payment readiness
→ EN_ROUTE
→ ARRIVED
→ IN_TRANSIT
→ COMPLETION_PENDING
→ COMPLETED ou DISPUTED
→ Settlement/Payout
→ Review
```

As regras de disponibilidade global do serviço são complementadas por `TOW-MODULE-CONTRACT.md`. A regra financeira de pricing é complementada por `TOW-PRICING-CONTRACT.md`.

---

## 2. Identidade modular e feature flag

Identidade canônica:

```text
module_key   = tow
service_key  = tow
partner_type = tow
```

Tow é um módulo explícito. O Dashboard pode habilitar/desabilitar o serviço globalmente.

Semântica de disable:

```text
DISABLE = stop new business + drain in-flight work
```

Quando desabilitado:

- novo Tow request é bloqueado;
- matching/expansão pré-assignment é interrompido;
- novas proposals/counteroffers/assignments são bloqueadas;
- requests `SEARCHING`/`NEGOTIATING` encerram com `terminal_reason = SERVICE_DISABLED`;
- requests já `ASSIGNED` continuam até estado terminal;
- cadastro de partner, TowVehicle e documentos é preservado;
- re-enable permite novos negócios, mas não ressuscita requests/propostas encerrados.

Erro de operação rejeitada pelo feature flag:

```text
service_module_disabled
```

`SERVICE_DISABLED` é terminal reason do request; `service_module_disabled` é `error.code` HTTP. Não são intercambiáveis.

---

## 3. Elegibilidade do parceiro

Somente:

```text
partner_type = tow
```

pode operar o módulo.

Para entrar em matching, o parceiro precisa estar:

```text
module enabled
approved
online
available
not busy
within debt policy
```

No MVP, cada parceiro executa **um Tow por vez**.

Ao consolidar assignment:

```text
available → busy
```

Ao concluir/cancelar e não existir outro bloqueio:

```text
busy → available
```

A disponibilidade operacional deve ser calculada pelo backend e exposta ao app por `GET /api/tow/partner/status`.

---

## 4. TowVehicle

Um parceiro pode cadastrar N veículos, mas no máximo um pode estar `active=true` simultaneamente.

Campos mínimos:

```text
plate
make
model
year
equipment_type
supported_vehicle_classes
max_towed_weight_kg
active
document_status
pricing
```

Pricing por TowVehicle:

```text
minimum_charge_cents
included_km
price_per_additional_km_cents
```

Enquanto existir atendimento atribuído ao parceiro, o veículo do assignment fica congelado e não pode ser trocado para aquele atendimento.

Alterações posteriores no veículo ou tarifa não alteram propostas/assignments já existentes.

---

## 5. Documentação obrigatória do TowVehicle

Cada veículo deve possuir ao menos um documento comprobatório em:

```text
image/jpeg
image/png
application/pdf
```

Entidade conceitual:

```text
TowVehicleDocument
id
tow_vehicle_id
document_type
file_url
mime_type
status
rejection_reason
expires_at
verified_by
verified_at
created_at
```

Estados canônicos:

```text
pending
approved
rejected
expired
```

Fluxo:

```text
vehicle created
→ document uploaded
→ pending
→ admin review
   ├─ approved
   └─ rejected
```

Se `expires_at` vencer, o documento passa a ser tratado como `expired` para elegibilidade.

Um TowVehicle somente é operacional quando existe documentação aprovada e válida. Aprovação do parceiro não substitui aprovação do veículo.

---

## 6. Classes de veículo transportado

Classes canônicas iniciais:

```text
motorcycle
light_vehicle
medium_truck
heavy_truck
```

Referência:

```text
motorcycle    → motocicletas
light_vehicle → carros, SUVs, picapes, vans/utilitários leves
medium_truck  → caminhões médios
heavy_truck   → caminhões pesados
```

Matching exige:

```text
requested_vehicle_class ∈ active_tow_vehicle.supported_vehicle_classes
AND
requested_weight <= active_tow_vehicle.max_towed_weight_kg
```

Para `medium_truck` e `heavy_truck`, peso/PBT é obrigatório.

---

## 7. Tipo de equipamento do guincho

Valores canônicos iniciais:

```text
flatbed
wheel_lift
heavy_wrecker
```

A modelagem deve permitir evolução futura sem espalhar condicionais ou quebrar contratos existentes.

---

## 8. Dados do chamado

Entrada mínima do cliente:

```text
pickup
destination
vehicle.class
vehicle.make
vehicle.model
problem_description
observations (optional)
```

Para caminhões médios/pesados:

```text
vehicle.weight_kg / PBT
```

Fotos do veículo do cliente são opcionais no MVP.

Request novo entra em:

```text
SEARCHING
```

Cliente com dívida financeira impeditiva não pode criar novo atendimento.

---

## 9. Google Maps / Routes

Google Maps é a visualização geográfica padrão dos consumidores.

A distância tarifável é sempre viária e autoritativa pelo backend:

```text
provider_current_position → pickup
+
pickup → destination
```

Portanto:

```text
total_distance_meters =
  provider_to_pickup.distance_meters
  + pickup_to_destination.distance_meters
```

Não usar Haversine/linha reta para pricing.

A rota usada na proposta é congelada em snapshot. A rota efetivamente percorrida depois do acordo não recalcula automaticamente o preço.

O contrato de visualização é:

```http
GET /api/tow/requests/:requestId/route
```

Consumidores podem renderizar route/polyline, mas não recalculam preço.

---

## 10. Precificação — regra congelada

A regra normativa está em `TOW-PRICING-CONTRACT.md`.

**Não existe mais `ceil(excess_km)` nem cobrança por quilômetro iniciado.**

Tarifa:

```text
minimum_charge_cents
included_km
price_per_additional_km_cents
```

Fórmula conceitual:

```text
included_meters = included_km * 1000

excess_meters = max(
  0,
  total_distance_meters - included_meters
)

variable_charge_cents =
  ROUND_HALF_UP(
    excess_meters
    * price_per_additional_km_cents
    / 1000
  )

calculated_price_cents =
  minimum_charge_cents
  + variable_charge_cents
```

Somente o resultado monetário é arredondado, uma vez, para centavos, com `ROUND_HALF_UP`.

Exemplo:

```text
minimum_charge       = R$ 150,00
included_km          = 10
additional_km price  = R$ 8,00
route                = 14,350 km
excess               = 4,350 km
variable             = R$ 34,80
final                = R$ 184,80
```

A distância não é arredondada para 15 km e o excedente não vira 5 km.

O backend deve usar aritmética integer/rational/decimal-safe; floating-point binário não pode ser fonte de verdade financeira.

---

## 11. Proposta inicial

O parceiro não informa preço arbitrário.

O backend calcula a proposta a partir de:

```text
active TowVehicle
+
route snapshot
+
tariff snapshot
+
pricing policy
```

Parceiro escolhe apenas:

```text
SEND PROPOSAL
ou
IGNORE
```

Cada proposta preserva snapshot imutável de veículo, tarifa, rota, distância e preço.

---

## 12. Matching geográfico

Elegibilidade mínima:

```text
TowModule.enabled
partner_type=tow
partner.approved
partner.online
partner.available
not busy
debt within policy
active TowVehicle
approved/non-expired document
vehicle compatibility
valid current location
within current radius
```

Settings:

```text
tow_initial_radius_km
tow_radius_increment_km
tow_max_radius_km
tow_radius_expansion_interval_minutes
tow_request_search_timeout_minutes
```

Invariante:

```text
tow_max_radius_km <= 100
```

Busca:

```text
initial radius
→ expand by increment at configured interval
→ clamp at max radius
→ remain at max radius until global timeout
```

Timeout sem acordo:

```text
state = EXPIRED
terminal_reason = NO_PROVIDER_AVAILABLE
```

Disable durante `SEARCHING`/`NEGOTIATING`:

```text
state = EXPIRED
terminal_reason = SERVICE_DISABLED
```

---

## 13. Múltiplas propostas

Vários parceiros elegíveis podem ter propostas ativas para o mesmo request.

O primeiro a responder não ganha automaticamente.

Cliente pode:

```text
accept one proposal
OR
counteroffer one proposal once
```

Quando assignment é consolidado, todas as demais propostas/negociações tornam-se não acionáveis atomicamente.

---

## 14. Expiração e retirada de proposta

Settings:

```text
tow_proposal_expiry_minutes
tow_counteroffer_expiry_minutes
```

Proposta/contraproposta expirada não pode ser aceita.

Partner pode `withdraw` proposta somente antes de:

```text
accept
counteroffer
expiry
```

Após counteroffer, partner deve aceitar ou rejeitar.

---

## 15. Contraproposta

Existe no máximo uma contraproposta por proposal no MVP.

```text
proposal
→ customer counteroffer
→ partner ACCEPT ou REJECT
```

Não existe segunda rodada de negociação.

---

## 16. Assignment e concorrência

Assignment ocorre por:

```text
proposal → customer accept
```

ou:

```text
proposal → customer counteroffer → partner accept
```

Congelados no assignment:

```text
assigned_partner_id
assigned_tow_vehicle_id
final_price
pickup/destination contract
route snapshot
tariff snapshot
```

Aceite é transacional e idempotente.

Duas negociações concorrentes nunca podem produzir dois assignments para o mesmo request.

Disable concorrente com assignment deve ter exatamente um resultado consistente:

```text
assignment commit primeiro → request ASSIGNED entra em graceful drain
OU
disable commit primeiro → assignment rejeitado / request SERVICE_DISABLED
```

Nunca ambos.

---

## 17. Alteração de destino

Antes do assignment, cliente pode alterar destino quando `allowed_actions` permitir.

A alteração invalida proposta/preço/route snapshot dependentes do destino e exige novo cálculo.

Após assignment:

```text
destination = locked
```

No MVP, mudança posterior exige cancelamento conforme regras aplicáveis e novo request.

---

## 18. State machine

Estados canônicos:

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

Semântica operacional:

```text
EN_ROUTE           = parceiro iniciou deslocamento até pickup
ARRIVED            = parceiro chegou ao pickup
IN_TRANSIT         = veículo foi coletado e segue ao destino
COMPLETION_PENDING = parceiro declarou conclusão; aguarda customer/timeout
COMPLETED          = customer confirmou ou auto-confirm ocorreu
```

Não existe `vehicle_loaded` no MVP.

Transições inválidas são rejeitadas pelo backend.

---

## 19. Tracking

Tracking existe de `EN_ROUTE` até `COMPLETION_PENDING`.

Ponto mínimo:

```text
latitude
longitude
recorded_at
```

Tracking fica associado ao request e é preservado para auditoria/disputa.

REST é fonte de rehydration; realtime é aceleração de UX.

---

## 20. Conclusão

Partner finaliza no destino e fornece evidência mínima:

```text
GPS
Timestamp
```

Estado:

```text
IN_TRANSIT → COMPLETION_PENDING
```

Customer pode:

```text
CONFIRM
ou
DISPUTE
```

Sem resposta, backend auto-confirma após:

```text
tow_completion_confirmation_timeout_minutes
```

Confirmado/auto-confirmado:

```text
COMPLETED
```

Contestação:

```text
DISPUTED
```

Não há OTP ou foto de conclusão obrigatória no MVP.

---

## 21. Cancelamento pelo cliente

Antes de `EN_ROUTE`:

```text
fee = 0
```

A partir de `EN_ROUTE`:

```text
fee = tow_cancellation_fee_cents
```

Existe uma única faixa de cancellation fee no MVP.

`tow_platform_fixed_fee_cents` não é somada à cancellation fee. São conceitos distintos.

---

## 22. Divisão da cancellation fee

Settings:

```text
tow_cancellation_fee_cents
tow_cancellation_partner_percentage
tow_cancellation_platform_percentage
```

Invariante:

```text
partner_percentage + platform_percentage = 100
```

O split vigente no momento do cancelamento deve ser persistido/auditável.

---

## 23. Cancelamento pelo parceiro

Após assignment, se partner cancelar:

- customer não paga fee;
- autorização de cartão deve ser liberada/refundada conforme estágio;
- PIX deve ser reembolsado conforme estágio;
- request pode retornar ao matching se ainda válido e módulo habilitado;
- evento entra em reputação/analytics/audit;
- sem multa financeira automática ao partner no MVP.

---

## 24. No-show do cliente

Após `ARRIVED`, aplica-se:

```text
tow_customer_no_show_timeout_minutes
```

Após timeout válido:

```text
CUSTOMER_NO_SHOW
```

Financeiramente usa a mesma cancellation fee pós-`EN_ROUTE`.

---

## 25. No-show do parceiro

Customer não paga fee.

Request pode retornar ao matching se permitido.

Evento é auditado e entra em reputação operacional.

Sem multa financeira automática no MVP.

---

## 26. Métodos de pagamento

MVP:

```text
card
pix
cash
```

Acordo/assignment não é perdido apenas porque um método eletrônico falhou antes de `EN_ROUTE`; customer pode trocar método enquanto permitido.

---

## 27. Cartão

Fluxo alvo:

```text
ASSIGNED
→ authorize(final_price)
→ AUTHORIZED
→ EN_ROUTE permitido
→ service
→ COMPLETED
→ capture
```

Falha de autorização bloqueia `EN_ROUTE`.

Capture/refund/release devem ser idempotentes e compatíveis com o gateway adotado.

---

## 28. PIX

Fluxo:

```text
ASSIGNED
→ create PIX charge
→ PENDING
→ PAID
→ EN_ROUTE permitido
→ service
→ COMPLETED
→ settlement eligibility
```

Cancelamento gratuito:

```text
full refund
```

Cancelamento após `EN_ROUTE`:

```text
refund = final_price - tow_cancellation_fee_cents
```

Fee retida é split conforme configuração.

---

## 29. Cash

Ao selecionar cash, status canônico do contrato é:

```text
CASH_SELECTED
```

Isso permite `EN_ROUTE` sem cobrança eletrônica prévia.

Na conclusão:

```text
partner marks cash_received
→ customer confirms / auto-confirm
→ COMPLETED
```

O serviço cash não cria earning eletrônico do `final_price` para a wallet do partner.

---

## 30. Dívida do parceiro por cash

Após serviço cash concluído:

```text
PartnerPlatformFeeDebt += tow_platform_fixed_fee_cents
```

A dívida deve ser automaticamente abatida de recebimentos eletrônicos futuros antes de payout.

Setting:

```text
tow_max_platform_fee_debt_cents
```

Regra:

```text
platform_fee_debt_cents > tow_max_platform_fee_debt_cents
→ bloquear novos atendimentos Tow
```

Não existe sentinel implícito: `0` significa limite zero, não “desabilitado”.

---

## 31. Cancelamento cash após EN_ROUTE

Como não há valor eletrônico retido, o cancelamento cria dívida do customer:

```text
CustomerFinancialDebt
amount_cents = tow_cancellation_fee_cents
status = PENDING
```

Enquanto existir dívida impeditiva:

```text
novo atendimento → outstanding_financial_debt
```

Quitação permitida:

```text
card
pix
```

Após confirmação:

- customer é desbloqueado;
- cancellation fee é distribuída entre partner/JaResolve conforme snapshot do split.

---

## 32. Taxa fixa da plataforma

Setting de transporte/configuração:

```text
tow_platform_fixed_fee_cents
```

Serviço eletrônico:

```text
customer pays final_price
partner gross entitlement = final_price - fixed_fee
platform revenue = fixed_fee
```

Serviço cash:

```text
customer pays partner directly
platform fixed fee becomes PartnerPlatformFeeDebt
```

A taxa não é adicionada por fora ao total acordado com o customer.

---

## 33. Wallet e settlement

Pagamento eletrônico concluído entra primeiro em settlement, não diretamente em payout.

Estados mínimos:

```text
pending_settlement
available_for_payout
payout_processing
paid
```

Dispute/hold é condição de elegibilidade, não saldo livre.

Ordem financeira:

```text
gross electronic entitlement
→ fixed platform fee
→ existing PartnerPlatformFeeDebt offset
→ settlement eligibility
→ available_for_payout
```

Cada centavo deve ser reconstruível a partir de ledger entries auditáveis.

---

## 34. Payout

Não existe payout bancário por serviço individual.

Dashboard cria/processa lote diário manual.

Cada parceiro entra com no máximo um item agregado por batch.

Somente saldo `available_for_payout` e não held/disputed participa.

Retry/reconciliation não pode duplicar payout.

---

## 35. Disputas

Customer pode abrir disputa durante o fluxo permitido, especialmente `COMPLETION_PENDING`.

Request passa a:

```text
DISPUTED
```

Funds associados ficam fora do payout até resolução.

Evidências preservadas:

```text
request
proposal/counteroffer history
route snapshot
tracking
payment/refund
customer/partner debt
financial ledger
audit timeline
```

Resolução é comando administrativo explícito e auditável. O contrato v1 não permite mutação direta de saldo/DB pelo Dashboard.

---

## 36. Review

Customer pode avaliar partner somente após `COMPLETED`.

MVP:

```text
customer → partner
```

Uma avaliação oficial por request/customer, salvo futura regra explícita de edição.

---

## 37. Admin override

Admin autorizado pode excepcionalmente:

```text
override cancel
override complete
resolve dispute
```

Override exige:

```text
reason
admin_user_id
timestamp
before/after
```

Toda ação gera audit event imutável.

---

## 38. Audit

Devem ser auditáveis, no mínimo:

```text
module enable/disable
request creation
matching/radius expansion
route/pricing snapshot
proposal/counteroffer lifecycle
assignment
state transitions
tracking/completion evidence
cancellation/no-show
payment/refund
customer/partner debt
settlement/payout
dispute/review
admin override
```

Logs efêmeros não substituem trilha persistida.

---

## 39. Settings globais

Matching:

```text
tow_initial_radius_km
tow_radius_increment_km
tow_max_radius_km
tow_radius_expansion_interval_minutes
tow_request_search_timeout_minutes
```

Negotiation:

```text
tow_proposal_expiry_minutes
tow_counteroffer_expiry_minutes
```

Completion:

```text
tow_completion_confirmation_timeout_minutes
tow_customer_no_show_timeout_minutes
```

Finance:

```text
tow_platform_fixed_fee_cents
tow_cancellation_fee_cents
tow_cancellation_partner_percentage
tow_cancellation_platform_percentage
tow_max_platform_fee_debt_cents
```

API e persistência financeira devem usar integer cents; não criar aliases monetários em float.

---

## 40. Entidades conceituais

```text
ServiceModule / TowModule
Partner
TowVehicle
TowVehiclePricing
TowVehicleDocument
TowRequest
TowProposal
TowCounterOffer
TowTrackingPoint
Payment
Wallet / LedgerEntry
PartnerPlatformFeeDebt
CustomerFinancialDebt
PayoutBatch
PayoutBatchItem
Review
Dispute
AuditEvent
```

A decomposição física pode variar, desde que invariantes e contratos permaneçam.

---

## 41. API canônica

Consumidores novos usam exclusivamente o namespace modular:

```text
/api/tow/...
/api/admin/tow/...
```

Contrato transport autoritativo:

```text
docs/tow/tow-api-contract.openapi.yaml
```

Capacidades centrais incluem:

```text
GET/POST  /api/tow/requests
GET       /api/tow/requests/:requestId
PATCH     /api/tow/requests/:requestId/destination
GET       /api/tow/requests/:requestId/route
GET/POST  /api/tow/requests/:requestId/proposals

POST      /api/tow/proposals/:proposalId/accept
POST      /api/tow/proposals/:proposalId/counteroffer
POST      /api/tow/proposals/:proposalId/withdraw
POST      /api/tow/counteroffers/:counterofferId/accept
POST      /api/tow/counteroffers/:counterofferId/reject

GET/PATCH /api/tow/partner/status
PUT       /api/tow/partner/location
GET       /api/tow/partner/opportunities
GET       /api/tow/partner/proposals
GET       /api/tow/partner/jobs
GET       /api/tow/partner/financial-summary

GET/POST  /api/tow/vehicles
GET/PATCH/DELETE /api/tow/vehicles/:vehicleId
POST      /api/tow/vehicles/:vehicleId/activate
GET/POST  /api/tow/vehicles/:vehicleId/documents
DELETE    /api/tow/vehicles/:vehicleId/documents/:documentId

PUT       /api/tow/requests/:requestId/payment-method
GET       /api/tow/requests/:requestId/payment
POST      /api/tow/requests/:requestId/en-route
POST      /api/tow/requests/:requestId/arrived
POST      /api/tow/requests/:requestId/in-transit
POST      /api/tow/requests/:requestId/finish
GET/POST  /api/tow/requests/:requestId/tracking
POST      /api/tow/requests/:requestId/completion/confirm
POST      /api/tow/requests/:requestId/disputes
POST      /api/tow/requests/:requestId/review

GET/PATCH /api/admin/tow/module
GET/PATCH /api/admin/tow/settings
GET       /api/admin/tow/vehicle-documents...
GET       /api/admin/tow/requests...
GET/POST  /api/admin/tow/disputes...
GET/POST  /api/admin/tow/payout-batches...
GET       /api/admin/tow/audit-events
```

Rotas históricas `emergency-requests` / `tow-proposals` pertencem apenas à auditoria de compatibilidade T00. Nenhum novo Mobile/Dashboard deve depender delas.

---

## 42. Banco e migrations

Nesta reestruturação é autorizado reset destrutivo dos dados atuais.

Objetivo:

```text
clean database
→ migrations from zero
→ coherent schema
→ seed only default admin
```

Credencial do admin vem de environment/secret, nunca hardcoded.

Não é obrigatório preservar dados legados incompatíveis.

---

## 43. Estratégia de testes

TDD é obrigatório: `RED → GREEN → REFACTOR → INTEGRATION GATE`.

Unitários devem cobrir, no mínimo:

```text
module availability
pricing proporcional por metro
ROUND_HALF_UP em centavos
route legs/snapshot
compatibility/capacity
active TowVehicle uniqueness
document approval/expiry
proposal lifecycle
one-counteroffer invariant
radius expansion/timeouts
state transitions
cancellation/no-show
payment readiness
platform fee/cancellation split
partner/customer debt
wallet/settlement/payout
```

Integração deve cobrir:

```text
API + authz + PostgreSQL
migrations
module toggle
matching
proposal/counteroffer
real DB concurrency for assignment
tracking
vehicle documents
Maps adapter contract
Card/PIX fake gateway
cash debts
ledger/payout
admin/dispute/audit
```

T18 mantém a suíte E2E final autoritativa definida na Issue #29.

Somente T18 pode emitir:

```text
TOW BACKEND READY FOR INTEGRATION
```

---

## 44. Consumer-first development

Após merge do PR de contrato, Mobile Cliente, Mobile Parceiro e Dashboard podem iniciar **implementação contra OpenAPI/mocks** em paralelo ao backend.

Permitido antes de T18:

```text
feature scaffolding
DTO/client/repository
state management
navigation/UI
Maps screens
mock server/fakes
widget/golden/component tests
consumer E2E mocked
```

Bloqueado até T18:

```text
declarar integração real concluída
substituir contrato por endpoint legado
inventar DTO/endpoint/regra local para compensar backend ausente
```

Distinção formal:

```text
TOW MOBILE CONTRACT READY FOR IMPLEMENTATION
!=
TOW BACKEND READY FOR INTEGRATION
```

---

## 45. Governança do freeze

Este documento, junto de:

```text
TOW-PRICING-CONTRACT.md
TOW-BUSINESS-RULE-MATRIX.md
TOW-MODULE-CONTRACT.md
TOW-API-CONTRACT.md
TOW-API-CONTRACT-DRAFT4-ADDENDUM.md
TOW-CONSUMER-FLOW-SPEC.md
tow-api-contract.openapi.yaml
```

forma o contrato congelado da iniciativa Tow.

Mudança de regra, enum, path, error code, state, financial semantic ou pricing após merge exige:

1. decisão explícita;
2. atualização dos documentos afetados;
3. teste RED/contract test correspondente;
4. comunicação aos consumidores;
5. revisão das Issues dependentes.

Nenhum executor pode reinterpretar silenciosamente o contrato para acomodar legado.