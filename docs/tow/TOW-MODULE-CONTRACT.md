# JaResolve — Tow Module Contract

> Status: **normative / frozen for implementation**

## 1. Purpose

Guincho/Tow é um **módulo funcional explícito** do JaResolve, não um conjunto de condicionais espalhadas.

O módulo vincula:

- serviço `tow`;
- `partner_type=tow`;
- use cases/policies;
- settings;
- global feature flag;
- matching/eligibility;
- contracts HTTP/events;
- consumo de Maps, Payment, Wallet, File Storage e Audit por ports.

Shared capabilities continuam componentes horizontais e não são duplicados dentro do Tow Module.

---

## 2. Identity

```text
module_key   = tow
service_key  = tow
partner_type = tow
```

Identificadores são estáveis e independentes de labels de UI.

Conceito:

```text
ServiceModule
└── TowModule
    ├── identity
    ├── enabled
    ├── settings
    ├── capabilities
    ├── policies/use cases
    └── adapters
```

O MVP não exige plugin runtime genérico; exige fronteira modular clara e extensível.

---

## 3. Global feature flag

Admin autorizado controla:

```text
TowModule.enabled: boolean
```

Backend é fonte de verdade.

Persistência conceitual:

```text
service_modules
- key
- service_key
- partner_type
- enabled
- disabled_reason
- updated_by
- updated_at
```

Availability é consumida por port/policy central, por exemplo:

```text
ServiceModuleAvailability
TowModuleAvailability
```

Controllers não consultam tabela/setting e não espalham `if (towEnabled)`.

---

## 4. Disable semantics

Regra:

```text
DISABLE = stop new business + drain in-flight work
```

### 4.1 Bloqueado após disable

- create new Tow request;
- start/continue unassigned matching;
- radius expansion de request não atribuído;
- create proposal;
- create counteroffer;
- consolidate new assignment quando disable venceu a corrida;
- anunciar Tow como serviço operacionalmente disponível.

Erro HTTP estável:

```text
service_module_disabled
```

### 4.2 Requests não atribuídos

`SEARCHING` e `NEGOTIATING` encerram deterministicamente com:

```text
state = EXPIRED
terminal_reason = SERVICE_DISABLED
```

Proposals/counteroffers abertas tornam-se não acionáveis.

### 4.3 Requests já atribuídos

Se `ASSIGNED` foi consolidado antes do disable, continuam:

```text
payment readiness
EN_ROUTE
ARRIVED
IN_TRANSIT
COMPLETION_PENDING
COMPLETED
cancellation/no-show
capture/refund
customer/partner debt
dispute
settlement/payout
audit
```

Feature flag não abandona serviço já contratado.

---

## 5. Re-enable semantics

Ao habilitar novamente:

- novos Tow requests voltam a ser aceitos;
- matching/proposals voltam a funcionar;
- partners/vehicles/settings permanecem preservados;
- request encerrado por `SERVICE_DISABLED` não é reaberto;
- proposal/counteroffer antiga não sofre replay;
- repeated enable/disable é idempotente.

---

## 6. Partner linkage

`PartnerType=tow` pertence operacionalmente ao módulo Tow.

Disable:

- não apaga partner;
- não converte tipo;
- não apaga TowVehicle/documents;
- permite gestão cadastral/admin conforme authz;
- impede novos fluxos comerciais Tow.

Feature flag controla **capacidade operacional**, não existência cadastral.

---

## 7. Dashboard module control

Contrato:

```http
GET   /api/admin/tow/module
PATCH /api/admin/tow/module
```

Toggle exige:

```text
admin authorization
reason
updated_by
updated_at
audit event
```

Antes de disable, UI deve conseguir informar impacto:

```text
new work will stop
SEARCHING/NEGOTIATING will terminate
ASSIGNED+ will drain
```

A **implementação visual do Dashboard pode começar após o merge do contrato usando mocks/OpenAPI**. Somente a **integração real com backend** fica bloqueada até `TOW BACKEND READY FOR INTEGRATION`.

---

## 8. Clean Architecture boundary

```text
Tow
├── Domain
│   ├── Entities/Aggregates
│   ├── Value Objects
│   ├── Policies
│   └── Invariants
├── Application
│   ├── Use Cases
│   ├── Ports
│   └── Orchestration
├── Adapters
│   ├── HTTP
│   ├── Persistence
│   ├── Events
│   └── Presenters
└── Infrastructure
    ├── PostgreSQL
    ├── Google Routes
    ├── Payment adapters
    ├── File Storage
    └── Scheduler
```

Domain/Application não conhecem Express, Knex/PostgreSQL, Google SDK, PSP SDK, filesystem ou scheduler concreto.

SOLID obrigatório:

- SRP nos use cases/policies;
- DIP via ports;
- ISP para gateways específicos;
- LSP entre fakes e adapters;
- OCP para novas capabilities sem condicionais transversais.

---

## 9. Required guard points

Availability deve ser aplicada antes de:

1. criar request;
2. iniciar/continuar matching não atribuído;
3. criar proposal;
4. criar counteroffer;
5. consolidar assignment;
6. anunciar Tow como disponível.

Depois de `ASSIGNED`, o guard não bloqueia operações necessárias para concluir/encerrar o serviço.

---

## 10. Concurrency

Testes transacionais devem cobrir:

```text
disable vs create request
disable vs proposal
disable vs radius expansion
disable vs assignment
repeated toggle
re-enable after closures
```

Invariante crítico:

```text
assignment commits first
→ ASSIGNED drains
```

ou:

```text
disable commits first
→ assignment rejected / SERVICE_DISABLED
```

Nunca os dois resultados para o mesmo request.

---

## 11. Audit

Cada toggle registra:

```text
module_key=tow
action=ENABLE|DISABLE
before
after
reason
admin_user_id
timestamp
```

Também são auditados requests encerrados por `SERVICE_DISABLED` e a preservação de in-flight work.

Logs efêmeros não substituem AuditEvent persistido.

---

## 12. Test contract

UNIT:

- enabled/disabled policies;
- graceful drain;
- re-enable;
- linkage service/partner type.

DB:

- unique module row/key;
- atomic persistence;
- audit metadata.

API/AUTHZ:

- admin get/toggle;
- non-admin toggle rejected;
- stable module status/error contract.

CONCURRENCY:

- disable vs create/proposal/assignment;
- idempotent repeated toggle.

E2E:

- enabled starts new business;
- disabled blocks new business;
- SEARCHING/NEGOTIATING close with `SERVICE_DISABLED`;
- ASSIGNED drains to terminal;
- re-enable allows new business without resurrection.

---

## 13. Consumer source-of-truth

Mobile Cliente, Mobile Parceiro e Dashboard podem hide/disable UI com base no module status, mas segurança funcional nunca depende da UI.

Mesmo chamada HTTP manual ou client desatualizado deve ser rejeitado para novas operações quando Tow estiver disabled.

Mock/frontend implementation pode iniciar após contract merge. Backend integration final só inicia após T18.