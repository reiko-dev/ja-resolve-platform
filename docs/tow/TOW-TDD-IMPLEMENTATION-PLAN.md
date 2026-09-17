# Tow Service — TDD Implementation Plan

> Projeto: **JaResolve**  
> Domínio: **Guincho / Tow**  
> PR de contrato: **#9 — Implements Tow Service**  
> Epic: **#10**  
> Execução: **Issues #11–#29 / T00–T18**

## 1. Fontes de verdade

A implementação deve obedecer, em conjunto:

1. `TOW-SERVICE-SPECIFICATION.md` — comportamento funcional do serviço;
2. `TOW-BUSINESS-RULE-MATRIX.md` — regras e invariants;
3. `TOW-MODULE-CONTRACT.md` — fronteira modular, partner linkage e feature flag;
4. `TOW-TASK-GRAPH.yaml` — dependências machine-readable;
5. Issues #11–#29 — **especificação executável detalhada de cada task**.

Em caso de divergência de dependência/execução entre texto histórico e task graph, a ordem é:

```text
Issue da task
→ TOW-TASK-GRAPH.yaml
→ este documento
```

Mudança de regra de negócio exige atualização explícita do contrato e dos testes.

---

## 2. Princípio arquitetural

Tow deve ser um **módulo/componente explícito** do JaResolve:

```text
module_key   = tow
service_key  = tow
partner_type = tow
```

A fronteira esperada segue Clean Architecture:

```text
Tow Module
├── Domain
│   ├── Entities / Aggregates
│   ├── Value Objects
│   ├── Policies / Domain Services
│   └── Invariants
│
├── Application
│   ├── Use Cases
│   ├── Ports
│   └── Orchestration
│
├── Adapters
│   ├── HTTP
│   ├── Persistence
│   ├── Events
│   └── Presenters
│
└── Infrastructure
    ├── PostgreSQL
    ├── Google Routes
    ├── Payment Gateway
    ├── File Storage
    └── Scheduler
```

Dependências horizontais como Payment, Wallet, Audit, Maps e File Storage **não pertencem internamente ao Tow Module**. Tow as consome através de ports.

### Regras SOLID obrigatórias

- **SRP:** use cases e policies com responsabilidade única;
- **OCP:** novas classes/capabilities devem ser adicionáveis sem espalhar condicionais;
- **LSP:** fakes/adapters devem respeitar o mesmo contrato dos ports;
- **ISP:** gateways expõem capacidades específicas, sem interfaces monolíticas artificiais;
- **DIP:** Domain/Application dependem de abstrações, nunca de Express, Knex, Google ou PSP.

Controllers não contêm regra de negócio. SQL/Knex não vaza para Domain/Application.

---

## 3. Tow Module feature flag

O backend é a fonte de verdade de:

```text
TowModule.enabled
```

Semântica do MVP:

```text
DISABLE = stop new business + drain in-flight work
```

Quando disabled:

- bloquear novo Tow request;
- bloquear matching/expansão pre-assignment;
- bloquear novas proposals;
- bloquear novas counteroffers;
- bloquear novo assignment ainda não consolidado;
- encerrar `SEARCHING`/`NEGOTIATING` com `SERVICE_DISABLED`;
- preservar partner `tow`, TowVehicles e documentos;
- permitir que requests já `ASSIGNED` continuem até terminal;
- preservar payment, tracking, completion, cancellation, debt, dispute, settlement, payout e audit de trabalho já atribuído.

Re-enable permite novos negócios, mas não ressuscita requests/proposals encerrados.

A availability flag deve ser consumida por **port/policy central**, não por `if (towEnabled)` espalhado em controllers.

---

## 4. Política TDD obrigatória

Toda task segue exatamente:

```text
RED
 ↓
GREEN
 ↓
REFACTOR
 ↓
INTEGRATION GATE
 ↓
ACCEPTED
 ↓
MERGE
```

### RED

Antes de alterar comportamento de produção:

- escrever os testes da regra;
- provar que falham pela razão correta;
- registrar evidência no WorkResult/receipt.

Se o teste já nasce verde, registrar que o comportamento já existe e ajustar a task para compatibilização/auditoria, sem fabricar um RED falso.

### GREEN

Implementar o mínimo necessário para satisfazer o contrato.

Não antecipar task futura.

### REFACTOR

Depois de GREEN:

- remover duplicação;
- melhorar nomes/separação de responsabilidades;
- verificar SOLID/Clean Architecture;
- rodar novamente a suíte da task + regressão das dependências.

### Regras não negociáveis

- bug → primeiro teste de regressão;
- não enfraquecer expectation para obter GREEN;
- concorrência crítica deve ser testada contra PostgreSQL real;
- tempo/jobs usam fake clock, sem `sleep` real;
- gateways externos usam fakes/contracts na suíte padrão;
- toda operação financeira crítica é idempotente;
- toda transição crítica possui authz + invalid-state tests;
- task só inicia com dependências `ACCEPTED`.

---

## 5. Taxonomia de testes

| Código | Tipo | Objetivo |
|---|---|---|
| `UNIT` | Unitário | regra pura, policy, cálculo, state transition |
| `DB` | Persistência | constraints, FK, índices, transactions |
| `MIG` | Migration | baseline/reset/migrate/seed |
| `API` | Integração HTTP | route + auth + application + PostgreSQL |
| `CONTRACT` | Contrato | payloads, statuses, errors, ports |
| `AUTHZ` | Autorização | role/ownership/assignment/admin |
| `CONC` | Concorrência | locks, CAS, idempotência concorrente |
| `TIME` | Tempo/jobs | expiry, timeout, radius, auto-confirm |
| `MAPS` | Maps/Routes | adapter, distance, provider failures |
| `GATEWAY` | Pagamento | authorize/capture/PIX/refund/webhook |
| `LEDGER` | Financeiro | debt/wallet/settlement/payout arithmetic |
| `AUDIT` | Auditoria | append-only, actor/reason/history |
| `SEC` | Segurança | upload, secrets, auth, webhook validation |
| `PERF` | Performance focal | matching/query/batch/indexes |
| `E2E` | Backend E2E | fluxo real via API + PostgreSQL |
| `UI` | UI/component | consumidores pós-backend |
| `UX` | User flow | consumidores pós-backend |
| `A11Y` | Acessibilidade | consumidores pós-backend |

A bateria exata é definida dentro de cada Issue.

---

## 6. Sequência estrita de execução

```text
PR #9 — Contract
   ↓
T00 / #11 — Harness + Current-State Audit
   ↓
T01 / #12 — Clean DB Baseline + Reset + Admin Seed
   ↓
T02 / #13 — Tow Module Registry + Feature Flag + Settings
   ↓
T03 / #14 — Tow Vehicles + Pricing Config + Documents
   ↓
T04 / #15 — Vehicle Compatibility + Capacity
   ↓
T05 / #16 — Google Routes + Tow Pricing
   ↓
T06 / #17 — Matching + Progressive Radius
   ↓
T07 / #18 — Proposal Lifecycle
   ↓
T08 / #19 — Single Counteroffer
   ↓
T09 / #20 — Atomic Assignment + Concurrency
   ├────────────────────────┐
   ↓                        ↓
T10 / #21                T12 / #23
State + Tracking         Payment Core
   ↓                        ├──────────────┐
T11 / #22                  ↓      ↓       ↓
Cancel + No-show        T13/#24 T14/#25 T15/#26
                       Card    PIX     Cash/Debt
                          └─────┬───────┘
                                ↓
                           T16 / #27
                     Wallet + Settlement + Payout
                                ↓
                           T17 / #28
                  Disputes + Reviews + Audit/Admin
                                ↓
                           T18 / #29
                Contract Freeze + Full E2E + Ready Gate
                                ↓
                 TOW BACKEND READY FOR INTEGRATION
```

### Mudança importante

`T03` **depende de T02**. Eles não podem mais rodar em paralelo, porque TowVehicle/Partner Tow consomem a identidade e availability policy do Tow Module.

### Paralelização segura

Depois de `T09`, `T10` e `T12` podem avançar em paralelo quando seus contratos não conflitam.

Depois de `T12`, `T13`, `T14` e `T15` podem avançar conforme as dependências específicas registradas nas Issues/task graph.

---

## 7. Gates

| Gate | Requer | Significado |
|---|---|---|
| `G0` | T00 | harness confiável |
| `G1` | T01 | schema/baseline confiável |
| `G2` | T02–T04 | module + provider/vehicle prontos |
| `G3` | T05–T06 | pricing/discovery prontos |
| `G4` | T07–T09 | negotiation/assignment prontos |
| `G5` | T10–T11 | operation pronta |
| `G6` | T12–T16 | finance pronto |
| `G7` | T17 | governance pronta |
| `G8` | T18 | backend integration-ready |

---

## 8. Tasks e outputs principais

| Task | Issue | Output principal |
|---|---:|---|
| T00 | #11 | harness determinístico + audit atual |
| T01 | #12 | DB baseline/reset/admin-only seed |
| T02 | #13 | **Tow Module + global feature flag + settings** |
| T03 | #14 | TowVehicle + pricing config + documents |
| T04 | #15 | compatibility/capacity policy |
| T05 | #16 | RouteProvider + pricing policy |
| T06 | #17 | matching/radius + `SERVICE_DISABLED` behavior |
| T07 | #18 | proposal lifecycle |
| T08 | #19 | one-counteroffer invariant |
| T09 | #20 | single-winner assignment + disable-vs-assignment concurrency |
| T10 | #21 | state machine/tracking + graceful drain ASSIGNED+ |
| T11 | #22 | cancellation/no-show |
| T12 | #23 | provider-agnostic payment core |
| T13 | #24 | card authorization/capture/refund |
| T14 | #25 | PIX/pay/refund |
| T15 | #26 | CASH + partner/customer debts |
| T16 | #27 | wallet/settlement/manual daily payout |
| T17 | #28 | disputes/reviews/admin override/audit + module toggle audit |
| T18 | #29 | freeze + regression + **66 E2E minimum** |

A descrição completa de código, docs, testes, RED/GREEN e Definition of Done está na Issue correspondente.

---

## 9. Feature flag test gates

O conjunto mínimo específico do Tow Module deve provar:

1. module enabled permite novo Tow request;
2. module disabled bloqueia novo Tow request via backend;
3. disable durante `SEARCHING`/`NEGOTIATING` encerra `SERVICE_DISABLED`;
4. disable bloqueia novas proposals/counteroffers;
5. disable concorrente com assignment tem resultado transacional determinístico;
6. request `ASSIGNED` antes do disable continua até terminal;
7. partner/TowVehicle/documentos permanecem cadastrados;
8. re-enable libera novos requests sem ressuscitar antigos;
9. somente admin altera flag;
10. toggle e efeitos são auditáveis.

---

## 10. Contract between tasks

Quando uma task produz contrato consumido por outra, o contrato deve estar estabilizado/mergeado antes da dependente iniciar.

Principais contratos:

- `T02`: `TowModuleAvailability`, module registry e `TowSettings`;
- `T03`: TowVehicle/Document repositories e API;
- `T04`: compatibility policy;
- `T05`: RouteProvider/RouteQuote/Pricing;
- `T07`: Proposal;
- `T08`: CounterOffer;
- `T09`: Assignment;
- `T10`: State Machine;
- `T12`: Payment strategy/gateway ports;
- `T16`: Wallet/Settlement/Payout ledger.

Mudança posterior em contrato exige:

1. teste RED/regressão;
2. revisão das tasks consumidoras;
3. atualização da Issue/task graph/docs.

---

## 11. Receipt obrigatório por task

Toda task deve gerar evidence/receipt contendo:

```text
Task ID
Issue
Dependency heads/receipts
Execution base
RED evidence
GREEN evidence
Tests added
Tests executed
Results
Files changed
Migrations changed
Contracts changed
Known limitations
Reviewer findings
Accepted/rejected status
Result commit SHA
```

Compilar não é Definition of Done.

---

## 12. T18 — Ready Gate

T18 não adiciona feature nova. T18 prova o sistema.

Deve executar:

- full UNIT regression;
- DB/MIG;
- API/CONTRACT;
- AUTHZ/SEC;
- CONC;
- TIME;
- MAPS;
- GATEWAY;
- LEDGER;
- AUDIT;
- Module/Feature Flag focused suite;
- full backend E2E;
- suite ampla do backend.

O gate mínimo contém **66 cenários E2E** definidos em #29.

Somente emitir:

```text
TOW BACKEND READY FOR INTEGRATION
```

quando:

- T00–T17 estiverem mergeadas/ACCEPTED;
- 66 E2E mínimos verdes;
- nenhum P0/P1 crítico skip/TODO;
- schema sobe do zero;
- seed contém somente admin padrão;
- module feature flag/graceful drain provados;
- assignment/payment/payout concurrency provada;
- documentação reflete comportamento real;
- contratos oficiais congelados.

Caso contrário:

```text
NOT READY
```

com issue(s) corretiva(s).

---

## 13. Consumidores pós-backend

Mobile Cliente, Mobile Parceiro e Dashboard só iniciam integração definitiva depois de T18.

### Dashboard

Plano TDD próprio deverá cobrir:

- toggle global Enabled/Disabled do Tow Module;
- preview/aviso do impacto do disable;
- settings Tow;
- vehicle document verification;
- payout batch;
- admin override/dispute;
- component/UI tests;
- API integration;
- A11Y;
- browser E2E.

### Mobile Cliente

- esconder/desabilitar entrada Tow baseado no status retornado pelo backend;
- backend continua sendo o enforcement real;
- request/proposal/counteroffer/payment/tracking/completion/dispute/review;
- widget/UI/UX/API/MAPS/E2E;
- debt repayment.

### Mobile Parceiro

- respeitar module availability;
- cadastro/gestão de TowVehicle pode permanecer acessível conforme contrato;
- nenhum novo job/proposal quando disabled;
- proposal/counteroffer/tracking/completion;
- UNIT/UI/UX/API/MAPS/E2E.

Nenhuma regra crítica é reimplementada nesses consumidores.

---

## 14. Regra para executor IA/workhorse

```text
READY(task) =
  all(dep.status == ACCEPTED)
  AND task.status in [PENDING, RETRY]
```

O executor não pode:

- pular dependency gate;
- executar T03 antes de T02;
- declarar task aceita sem testes/evidence;
- iniciar integração final dos consumidores antes de T18;
- alterar module semantics sem atualizar contrato/testes;
- contornar module availability em controller;
- manter legado incompatível somente para preservar teste antigo sem decisão explícita.

`TOW-TASK-GRAPH.yaml` é o formato machine-readable para essa orquestração.

---

## 15. Definition of Done da iniciativa Tow backend

A iniciativa está encerrada somente quando:

1. PR #9 de contrato estiver mergeado;
2. Issues #11–#29 estiverem fechadas por PRs aceitos;
3. Tow existir como módulo explícito;
4. partner type `tow` estiver vinculado operacionalmente ao módulo;
5. feature flag global/graceful drain estiverem comprovados;
6. matriz de regras estiver mapeada para testes;
7. 66 E2E mínimos estiverem verdes;
8. banco for reconstruível do zero;
9. seed inicial possuir somente admin padrão;
10. contratos e runbooks estiverem congelados;
11. `TOW BACKEND READY FOR INTEGRATION` tiver sido emitido com evidência.
