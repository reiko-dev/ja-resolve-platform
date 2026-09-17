# JaResolve Tow — Consumer Flow Specification

> Status: **Normative pre-implementation contract**  
> Scope: Mobile Cliente, Mobile Parceiro e Dashboard  
> Domain: `tow`  
> Module: `module_key=tow`, `service_key=tow`, `partner_type=tow`

## 1. Purpose

Este documento define **como os consumidores devem implementar o fluxo de Guincho/Tow antes da conclusão do backend**, usando mocks/fakes baseados no contrato oficial.

Ele não autoriza o app a reimplementar regras críticas. O backend continuará sendo a fonte de verdade para disponibilidade do módulo, elegibilidade, preço, negociação, state machine, pagamentos, cancelamentos, dívidas, payout e auditoria.

Os consumidores podem antecipar:

- navegação;
- telas;
- estados de apresentação;
- repositories/clients;
- DTOs;
- mocks;
- widget/component/UI tests;
- fluxos UX;
- tratamento dos erros contratuais.

A integração real somente é considerada fechada depois do gate `TOW BACKEND READY FOR INTEGRATION`.

---

## 2. Shared assumptions

### 2.1 Base URL

```text
<environment>/api
```

### 2.2 Authentication

Rotas autenticadas usam:

```http
Authorization: Bearer <jwt>
```

### 2.3 Response envelope

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
    "code": "stable_machine_code",
    "details": {}
  }
}
```

Consumidores devem tomar decisão por `error.code`, nunca por matching de `message`.

---

## 3. Canonical Tow states

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

Reason codes terminais relevantes:

```text
NO_PROVIDER_AVAILABLE
SERVICE_DISABLED
CUSTOMER_CANCELLED
PARTNER_CANCELLED
CUSTOMER_NO_SHOW
PARTNER_NO_SHOW
ADMIN_OVERRIDE
```

O app não deve inferir transições localmente. Ele apenas apresenta ações permitidas pelo contrato/estado retornado pelo backend.

---

## 4. Tow Module availability

Todo consumidor deve carregar o status global do módulo antes de oferecer novas operações Tow.

```text
TowModule.enabled = true | false
```

Quando `false`:

- Mobile Cliente não oferece criação de novo Tow;
- Mobile Parceiro não oferece novos jobs/proposals;
- Dashboard mostra o módulo como desabilitado;
- requests já `ASSIGNED` continuam visíveis e operáveis até terminal;
- cadastros de parceiro, TowVehicle e documentos permanecem disponíveis conforme permissão.

A UI esconder/desabilitar ações é conveniência. O backend continua rejeitando chamadas indevidas.

---

# 5. Mobile Cliente — fluxo completo

## 5.1 Entry point

```text
Home
 ↓
GET Tow Module Status
 ├─ disabled → mostrar indisponível
 └─ enabled
      ↓
   Solicitar Guincho
```

Estados de UI mínimos:

- loading module availability;
- enabled;
- disabled + motivo opcional;
- network error com retry.

## 5.2 Create request

Usuário informa:

```text
pickup
current vehicle
vehicle class
make/model
weight/PBT quando obrigatório
destination
problem description
observations
```

Fluxo:

```text
POST request
  ↓
SEARCHING
  ↓
mostrar mapa pickup/destination
  ↓
aguardar proposals
```

A UI não calcula preço final nem raio de matching.

## 5.3 Searching

Cliente vê:

- pickup/destination;
- status `SEARCHING`;
- indicador de busca;
- raio atual, quando exposto pelo backend;
- opção de cancelar;
- opção de alterar destination enquanto permitido.

Mudança de destination pre-assignment:

```text
PATCH destination
 ↓
backend invalida negociação/preço anterior
 ↓
novo ciclo de busca/propostas
```

Se backend retornar `SERVICE_DISABLED`, a tela encerra o fluxo com estado informativo; não tenta reabrir automaticamente.

## 5.4 Proposals / Negotiation

```text
SEARCHING
 ↓
NEGOTIATING
 ↓
lista de proposals
```

Cada card deve poder apresentar, quando disponível:

- partner display name;
- rating summary;
- TowVehicle summary;
- equipment type;
- ETA estimado;
- distância estimada;
- calculated price;
- proposal expiration;
- status.

Ações do cliente:

```text
ACCEPT
ou
COUNTEROFFER (1x)
```

Após contraproposta:

```text
WAITING_PARTNER_RESPONSE
 ↓
accepted | rejected | expired
```

A UI nunca oferece segunda contraproposta.

## 5.5 Assignment

Quando uma proposta/contraproposta é aceita:

```text
ASSIGNED
```

Cliente vê:

- partner;
- TowVehicle;
- final price congelado;
- pickup/destination congelados;
- payment method selector;
- status do pagamento.

Outras proposals deixam de ser acionáveis.

## 5.6 Payment selection

Métodos MVP:

```text
CARD
PIX
CASH
```

### CARD

```text
select CARD
 ↓
provider/client payment source flow
 ↓
backend authorization
 ↓
AUTHORIZED
 ↓
partner pode EN_ROUTE
```

Falha de autorização mantém assignment e permite trocar método antes de `EN_ROUTE`.

### PIX

```text
select PIX
 ↓
backend gera charge
 ↓
mostrar QR/copy-paste
 ↓
PENDING
 ↓
PAID
 ↓
partner pode EN_ROUTE
```

### CASH

```text
select CASH
 ↓
PAYMENT_METHOD_SELECTED
 ↓
partner pode EN_ROUTE
```

Nenhum consumidor deve fingir que CASH foi eletronicamente pago.

## 5.7 Live service tracking

```text
ASSIGNED
 ↓
EN_ROUTE
 ↓
ARRIVED
 ↓
IN_TRANSIT
 ↓
COMPLETION_PENDING
```

Google Maps é a visualização padrão.

Tela deve suportar:

- current partner position;
- pickup;
- destination;
- polyline/route quando disponível;
- state timeline;
- stale/no-location state;
- cancel action quando contratualmente permitida.

Tracking realtime pode usar socket/push, porém o app deve sempre conseguir reidratar o estado oficial por REST.

## 5.8 Completion

Partner finaliza:

```text
COMPLETION_PENDING
```

Cliente pode:

```text
CONFIRM COMPLETION
ou
DISPUTE
```

Se nada fizer, backend auto-confirma após timeout.

Depois:

```text
COMPLETED
 ↓
Review
```

## 5.9 Customer cancellation debt

Se método for CASH, partner já tiver `EN_ROUTE` e customer cancelar:

```text
CustomerFinancialDebt = tow_cancellation_fee
```

Enquanto dívida impeditiva existir:

```text
novo Tow request → blocked
```

App deve mostrar debt screen e permitir quitação por:

```text
CARD
PIX
```

Após confirmação do pagamento, o bloqueio desaparece.

---

# 6. Mobile Parceiro — fluxo completo

## 6.1 Entry and availability

Partner precisa ser:

```text
partner_type=tow
approved
```

Além disso:

- Tow Module enabled para novos jobs;
- partner online/available;
- TowVehicle ativo;
- documentação aprovada/válida;
- compatibilidade/capacidade adequada;
- dívida de platform fee abaixo do limite impeditivo.

O app não reproduz essa policy. Apenas apresenta o resultado retornado.

## 6.2 TowVehicle management

Fluxo antecipável:

```text
Tow Vehicles
 ├─ list
 ├─ create/edit
 ├─ pricing
 ├─ capabilities
 ├─ upload documents
 ├─ document status
 └─ activate exactly one vehicle
```

Documento obrigatório:

```text
JPEG | PNG | PDF
```

Status:

```text
pending
approved
rejected
```

Veículo não aprovado não deve ser apresentado como operacional.

## 6.3 Opportunities

Com módulo enabled, parceiro recebe/lista oportunidades elegíveis.

Opportunity apresenta:

- request id;
- pickup;
- destination;
- customer vehicle summary;
- route estimate;
- server-calculated proposal price;
- expiration;
- compatibility result.

Parceiro não edita preço inicial.

Ação:

```text
SEND PROPOSAL
ou
IGNORE
```

## 6.4 Proposal lifecycle

Depois de enviar:

```text
ACTIVE
```

Enquanto não houver counteroffer/accept:

```text
WITHDRAW permitido
```

Se customer enviar counteroffer:

```text
ACCEPT
ou
REJECT
```

Não existe nova rodada de preço.

## 6.5 Assigned job

Ao vencer negociação:

```text
ASSIGNED
```

Partner/TowVehicle ficam ocupados.

Tela mostra:

- pickup;
- destination;
- customer/vehicle summary;
- frozen final price;
- payment readiness;
- navigation CTA.

## 6.6 Operational transitions

Ações do partner:

```text
START EN_ROUTE
MARK ARRIVED
START IN_TRANSIT
FINISH SERVICE
```

O app só habilita CTA se backend indicar ação válida.

Para request já `ASSIGNED`, desabilitar globalmente Tow não interrompe esse fluxo.

## 6.7 Tracking

Enquanto ativo, app envia localização conforme estratégia operacional definida posteriormente.

Erros de rede devem suportar retry sem duplicar state transitions.

## 6.8 CASH completion

Para CASH:

```text
partner marks cash_received
```

Depois da conclusão confirmada/auto-confirmada:

```text
platform_fee_debt += tow_platform_fixed_fee
```

App pode exibir saldo/dívida do parceiro, mas não calcula a dívida localmente.

---

# 7. Dashboard — fluxo completo

## 7.1 Tow Module control

Dashboard terá controle global:

```text
Tow Module
Enabled [ON/OFF]
```

Antes de desabilitar, UI deve apresentar aviso claro:

```text
Novos atendimentos serão bloqueados.
SEARCHING/NEGOTIATING serão encerrados.
ASSIGNED+ continuarão até conclusão/cancelamento.
```

Disable exige `reason`.

Dashboard envia a intenção; backend decide atomicamente o resultado.

## 7.2 Tow settings

Dashboard permite editar settings globais do módulo:

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
tow_platform_fixed_fee
tow_cancellation_fee
tow_cancellation_partner_percentage
tow_cancellation_platform_percentage
tow_max_platform_fee_debt
```

Validação final é do backend.

## 7.3 Vehicle document verification

Dashboard precisa oferecer fila de documentos:

```text
pending
approved
rejected
expired
```

Admin pode:

```text
APPROVE
REJECT + reason
```

Deve visualizar arquivo JPEG/PNG/PDF e dados do TowVehicle/partner.

## 7.4 Operational monitoring

Dashboard deve conseguir consultar/filter:

- requests por status;
- partner;
- customer;
- período;
- payment method/status;
- disputes;
- cancellation/no-show reason.

Request detail deve apresentar timeline operacional e financeira.

## 7.5 Admin override

Ações excepcionais:

```text
CANCEL
COMPLETE
```

Sempre exigem `reason`.

UI deve deixar claro que a ação será auditada.

## 7.6 Disputes

Admin vê fila de disputes e detalhe completo:

- request;
- proposal/counteroffer;
- final price;
- route snapshot;
- tracking;
- payment/refund;
- cancellation/debt;
- audit timeline.

Resolution sempre gera audit entry e ajuste financeiro explícito quando aplicável.

## 7.7 Payout batches

Dashboard financeiro:

```text
Preview eligible balances
 ↓
Create batch
 ↓
Review partner totals
 ↓
Process batch
 ↓
Track result/reconciliation
```

Somente `available_for_payout` participa.

---

# 8. Consumer-side state modelling

Recomendação para os três consumidores: separar estado da tela de estado do domínio.

Exemplo:

```text
UI state
- loading
- refreshing
- error
- submitting

Domain state
- SEARCHING
- NEGOTIATING
- ASSIGNED
...
```

Não criar estados locais como `accepted_by_me` ou `almost_completed` que não existam no contrato.

---

# 9. Realtime strategy

O contrato de verdade é REST.

Realtime é aceleração de UX:

```text
REST = rehydration/source of truth
Socket/Push = notification of change
```

Ao receber evento realtime, consumidor deve atualizar/recarregar o aggregate oficial quando necessário.

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

Nomes finais podem ser congelados junto ao contrato realtime, mas não devem carregar regra crítica exclusiva.

---

# 10. Error codes consumers must support

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
conflict
validation_error
unauthorized
forbidden
not_found
```

UI deve mapear estes códigos para mensagens localizadas.

---

# 11. What can start before backend completion

Permitido imediatamente após merge do contrato:

### Mobile Cliente
- feature scaffolding;
- DTOs/repositories/interfaces;
- mock server/fakes;
- request creation UI;
- proposal/counteroffer UI;
- payment method states;
- Maps/tracking screens;
- completion/dispute/review;
- debt repayment UI;
- widget/golden/E2E mocked.

### Mobile Parceiro
- TowVehicle/document UI;
- opportunity/proposal UI;
- counteroffer response;
- assigned job timeline;
- Maps/navigation/tracking UI;
- cash received flow;
- tests against mocks.

### Dashboard
- module toggle UI;
- settings forms;
- document verification UI;
- request/dispute detail;
- payout batch UI;
- component/browser tests against mocks.

Não considerar integração backend concluída até T18.

---

# 12. Contract change rule

Depois que este documento for mergeado, qualquer breaking change que afete consumidor exige:

1. atualização deste documento;
2. atualização de `TOW-API-CONTRACT.md` e OpenAPI fragment;
3. atualização das Issues consumidoras afetadas;
4. teste de contrato/compatibilidade;
5. comunicação explícita aos consumidores.

Não alterar silenciosamente path, enum, state, error code ou significado de campo.