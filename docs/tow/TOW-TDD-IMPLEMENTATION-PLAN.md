# Tow Service — TDD Implementation Plan

> Projeto: **JaResolve**  
> Domínio: **Guincho / Tow**  
> PR de contrato: **#9 — Implements Tow Service**  
> Epic: **#10**  
> Execução backend: **Issues #11–#29 / T00–T18**

## 1. Fontes de verdade

### Regras funcionais

1. `TOW-PRICING-CONTRACT.md` — pricing congelado;
2. `TOW-SERVICE-SPECIFICATION.md` — comportamento funcional;
3. `TOW-BUSINESS-RULE-MATRIX.md` — invariants testáveis;
4. `TOW-MODULE-CONTRACT.md` — módulo/feature flag/graceful drain.

### Transport/consumer

5. `tow-api-contract.openapi.yaml` — shape canônico;
6. `TOW-API-CONTRACT-DRAFT4-ADDENDUM.md`;
7. `TOW-CONSUMER-FLOW-SPEC.md`;
8. `TOW-CONSUMER-FLOW-COVERAGE.md`;
9. `TOW-CONSUMER-CONTRACT-SMOKE-RESULT.md`.

### Execução backend

10. `TOW-TASK-GRAPH.yaml`;
11. Issues #11–#29 — especificação executável imediata da task.

Precedência operacional:

```text
Issue da task
→ TOW-TASK-GRAPH.yaml
→ este plano
```

Nenhuma task pode reintroduzir regra revogada, inclusive `ceil(excess_km)`.

---

## 2. Arquitetura obrigatória

Tow é módulo explícito:

```text
module_key   = tow
service_key  = tow
partner_type = tow
```

Boundary:

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
    ├── Payment providers
    ├── File Storage
    └── Scheduler
```

Payment, Wallet/Ledger, Maps, File Storage e Audit são horizontais e consumidos via ports.

### SOLID

- **SRP:** use case/policy com responsabilidade única;
- **OCP:** novas capabilities sem cascata de condicionais;
- **LSP:** fake e adapter obedecem ao mesmo contract;
- **ISP:** gateways pequenos e específicos;
- **DIP:** Domain/Application dependem de abstrações.

Domain não importa Express, Knex/PostgreSQL, Google/PSP SDK, filesystem ou scheduler concreto.

---

## 3. Feature flag

```text
DISABLE = stop new business + drain in-flight work
```

Disabled:

- bloqueia novo request;
- bloqueia matching/radius pré-assignment;
- bloqueia proposal/counteroffer/assignment novo;
- encerra `SEARCHING`/`NEGOTIATING` com `SERVICE_DISABLED`;
- preserva cadastro de partner/vehicle/doc;
- preserva e deixa concluir `ASSIGNED+`.

Re-enable não ressuscita trabalho encerrado.

Availability é port/policy central.

---

## 4. Ciclo TDD obrigatório

Cada task:

```text
RED
→ GREEN
→ REFACTOR
→ INTEGRATION GATE
→ ACCEPTED
→ MERGE
```

### RED

- escrever regra/teste antes do comportamento;
- provar falha pela razão correta;
- registrar evidência.

Se comportamento já existir, registrar baseline e criar teste de compatibilidade/regressão em vez de fabricar RED artificial.

### GREEN

Implementar somente escopo da task.

### REFACTOR

- remover duplicação;
- revisar Clean Architecture/SOLID;
- regressão da task + dependências.

### Regras não negociáveis

- bug → regression test first;
- não relaxar expectation para “passar”;
- concorrência crítica → PostgreSQL real;
- tempo → fake clock, sem sleep real;
- network gateway → fake/contract na suíte padrão;
- financeiro → idempotência obrigatória;
- critical transition → authz + invalid-state test;
- task só inicia com dependencies `ACCEPTED`.

---

## 5. Test taxonomy

| Código | Tipo |
|---|---|
| UNIT | regra pura/policy/value object |
| DB | constraints/FK/index/transaction |
| MIG | reset/migrate/seed |
| API | HTTP + auth + application + DB |
| CONTRACT | payload/error/port contract |
| AUTHZ | role/ownership/assignment/admin |
| CONC | concorrência/lock/idempotency |
| TIME | expiry/timeout/scheduler |
| MAPS | RouteProvider/Google adapter |
| GATEWAY | card/PIX/refund/webhook |
| LEDGER | debt/wallet/settlement/payout |
| AUDIT | append-only/history |
| SEC | upload/secrets/signatures |
| PERF | focal query/batch/index |
| E2E | backend flow |
| UI | consumer component/widget |
| UX | consumer user flow |
| A11Y | accessibility |

---

## 6. Sequência backend

```text
PR #9 Contract
 ↓
T00 #11 Harness/Audit
 ↓
T01 #12 DB Baseline
 ↓
T02 #13 Module + Feature Flag + Settings
 ↓
T03 #14 TowVehicle + Documents
 ↓
T04 #15 Compatibility
 ↓
T05 #16 Google Routes + Pricing
 ↓
T06 #17 Matching/Radius
 ↓
T07 #18 Proposals
 ↓
T08 #19 Counteroffer
 ↓
T09 #20 Atomic Assignment
 ├──────────────┐
 ↓              ↓
T10 #21       T12 #23
State          Payment Core
 ↓              ├────┬────┐
T11 #22        ↓    ↓    ↓
Cancel       T13  T14  T15
             Card PIX Cash/Debt
               └──┬───┘
                  ↓
               T16 #27
           Wallet/Settlement/Payout
                  ↓
               T17 #28
             Governance/Audit
                  ↓
               T18 #29
        Contract Freeze + Full E2E
                  ↓
      TOW BACKEND READY FOR INTEGRATION
```

Safe parallelization:

- depois de T09: T10 e T12 quando sem file/contract conflict;
- depois de T12: T13/T14/T15 conforme dependências específicas;
- nunca duas tasks concorrentes alterando a mesma state machine/migration sem coordenação explícita.

---

## 7. Gates

| Gate | Requer | Significado |
|---|---|---|
| G0 | T00 | harness confiável |
| G1 | T01 | DB baseline confiável |
| G2 | T02–T04 | module/provider/vehicle |
| G3 | T05–T06 | routes/pricing/matching |
| G4 | T07–T09 | negotiation/assignment |
| G5 | T10–T11 | operation/cancellation |
| G6 | T12–T16 | finance |
| G7 | T17 | governance/audit |
| G8 | T18 | backend integration-ready |

---

## 8. Tasks e outputs

| Task | Issue | Output principal |
|---|---:|---|
| T00 | #11 | deterministic harness + current→target audit + OpenAPI repeatable validation |
| T01 | #12 | clean DB baseline/reset/admin seed |
| T02 | #13 | Tow Module + feature flag + settings |
| T03 | #14 | TowVehicle/pricing config/documents |
| T04 | #15 | compatibility/capacity |
| T05 | #16 | RouteProvider + proportional pricing policy |
| T06 | #17 | matching/radius/timeout/module guard |
| T07 | #18 | proposal lifecycle |
| T08 | #19 | single counteroffer |
| T09 | #20 | one-winner assignment + disable race |
| T10 | #21 | state machine/tracking/completion |
| T11 | #22 | cancellation/no-show |
| T12 | #23 | payment orchestration core |
| T13 | #24 | card |
| T14 | #25 | PIX |
| T15 | #26 | cash + debts |
| T16 | #27 | ledger/settlement/payout |
| T17 | #28 | dispute/review/admin/audit |
| T18 | #29 | freeze + **75 mandatory E2E** + ready receipt |

A Issue da task define entregáveis completos de code/docs/tests/RED/GREEN/DoD.

---

## 9. Pricing gate

T05 e regressões devem provar:

```text
total_distance_meters = leg1 + leg2
excess_meters = max(0, total - included)
variable cents = proportional excess with ROUND_HALF_UP
```

Obrigatório:

- 1 metro acima do included boundary;
- fractional excess (ex.: 4.350 km);
- half-cent boundary;
- no `ceil(excess_km)`;
- immutable route/tariff/price snapshot.

---

## 10. Module gate

Focused suite deve provar:

1. enabled permite novo request;
2. disabled bloqueia request;
3. disable encerra SEARCHING/NEGOTIATING;
4. disable bloqueia proposal/counteroffer;
5. disable×assignment é atomicamente determinístico;
6. ASSIGNED pre-disable continua;
7. partner/vehicle/doc persistem;
8. re-enable libera novo business sem resurrection;
9. admin-only toggle;
10. audit completo.

---

## 11. Contract between tasks

Producer contract deve estar mergeado/accepted antes do consumer task iniciar.

Principais outputs:

```text
T02 → TowModuleAvailability + TowSettings
T03 → TowVehicle/Document
T04 → CompatibilityPolicy
T05 → RouteProvider + RouteQuote + Pricing
T07 → Proposal
T08 → Counteroffer
T09 → Assignment
T10 → State Machine
T12 → Payment ports/orchestrator
T16 → Ledger/Settlement/Payout
```

Mudança posterior exige RED/regression + doc/Issue update.

---

## 12. Receipt por task

```text
Task ID / Issue
Dependency receipts
Execution base
RED evidence
GREEN evidence
Tests added/executed/results
Files/migrations/contracts changed
Known limitations
Reviewer findings
Accepted/rejected
Result SHA
```

Compilar não é DoD.

---

## 13. T18 Ready Gate

T18 não adiciona feature. T18 prova o sistema.

Obrigatório:

```text
UNIT
DB/MIG
API/CONTRACT
AUTHZ/SEC
CONC
TIME
MAPS
GATEWAY
LEDGER
AUDIT
MODULE focused
E2E
full backend regression
```

A lista autoritativa possui **75 cenários E2E mínimos** na Issue #29.

Somente emitir:

```text
TOW BACKEND READY FOR INTEGRATION
```

quando:

- T00–T17 accepted/merged;
- 75 E2E mandatory GREEN;
- nenhum P0/P1 crítico skip/TODO;
- schema sobe do zero;
- seed contém somente admin;
- Clean Architecture/SOLID sem violação crítica;
- pricing proportional frozen behavior provado;
- feature flag/graceful drain provados;
- concurrency crítica provada;
- contrato HTTP real corresponde ao OpenAPI;
- docs refletem comportamento real.

Caso contrário:

```text
NOT READY
```

com issue corretiva.

---

## 14. Consumer implementation handoff

**Mock implementation NÃO é bloqueada por T18.**

Após PR #9 mergeado e contract-smoke GREEN, Mobile Cliente, Mobile Parceiro e Dashboard podem iniciar implementação contra OpenAPI/mocks.

Marco 1:

```text
TOW MOBILE CONTRACT READY FOR IMPLEMENTATION
```

Permite:

- DTO/client/repository;
- feature architecture;
- navigation/UI;
- state management;
- Maps/tracking UI;
- mock server/fakes;
- widget/golden/component/E2E mocked.

Marco 2, somente T18:

```text
TOW BACKEND READY FOR INTEGRATION
```

Permite substituir mocks pelo backend real e fechar API/integration E2E.

Consumers não podem:

- depender de legacy route nova;
- inventar endpoint/DTO;
- duplicar rule crítica;
- considerar mock-ready como backend-ready.

---

## 15. Workhorse readiness

```text
READY(task) =
  all(dep.status == ACCEPTED)
  AND task.status in [PENDING, RETRY]
```

Proibido:

- skip dependency;
- accept sem tests/evidence;
- alterar pricing/module semantics sem contract update;
- preservar legado incompatível apenas para manter teste antigo;
- iniciar **integração real** de consumer antes de T18.

---

## 16. Definition of Done da iniciativa backend

A iniciativa backend termina somente quando:

1. PR #9 mergeado;
2. #11–#29 fechadas por PR accepted;
3. Tow é módulo explícito;
4. partner type `tow` está vinculado ao módulo;
5. feature flag/graceful drain comprovados;
6. pricing proporcional congelado comprovado;
7. rule matrix mapeada a tests;
8. 75 E2E obrigatórios verdes;
9. banco reproduzível do zero;
10. admin-only seed;
11. contrato HTTP/OpenAPI alinhado;
12. `TOW BACKEND READY FOR INTEGRATION` emitido com evidence.