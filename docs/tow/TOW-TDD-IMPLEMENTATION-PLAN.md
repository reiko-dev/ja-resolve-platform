# Tow Service — TDD Implementation Plan

> Projeto: **JaResolve**  
> Domínio: **Guincho / Tow**  
> PR de implementação: `Implements Tow Service`  
> Branch: `feature/implements-tow-service`  
> Fonte de verdade funcional: `TOW-SERVICE-SPECIFICATION.md`  
> Fonte de verdade de regras: `TOW-BUSINESS-RULE-MATRIX.md`

---

## 1. Objetivo deste plano

Este documento transforma a especificação funcional do domínio de Guincho em um plano de implementação **orientado por TDD**, com:

- tasks pequenas e ordenadas;
- dependências explícitas entre tasks;
- critérios de entrada e saída;
- bateria mínima de testes por task;
- pontos seguros de paralelização;
- gates de integração;
- definição objetiva de quando o backend pode ser declarado `TOW BACKEND READY FOR INTEGRATION`.

O backend deve estar funcionalmente fechado, testado e contratualmente estável **antes** de iniciar integração de Mobile Cliente, Mobile Parceiro ou Dashboard como consumidores do domínio.

---

# 2. Política TDD obrigatória

Toda task deste plano deve seguir, nesta ordem:

```text
RED
  ↓
GREEN
  ↓
REFACTOR
  ↓
INTEGRATION GATE
  ↓
TASK ACCEPTED
```

## 2.1 RED

Antes de alterar código de produção:

1. escrever os testes que representam a regra de negócio da task;
2. confirmar que os testes novos falham pela razão esperada;
3. registrar a evidência do RED no WorkResult/receipt da task.

Um teste que já nasce verde não comprova TDD. Nesse caso, deve ser demonstrado que a regra já existe e, se necessário, a task deve mudar de objetivo para auditoria/compatibilização.

## 2.2 GREEN

Implementar somente o código mínimo necessário para tornar verdes os testes definidos no RED.

Não antecipar funcionalidades de tasks futuras.

## 2.3 REFACTOR

Depois de GREEN:

- remover duplicação;
- melhorar nomes e separação de responsabilidades;
- preservar contratos externos;
- executar novamente toda a bateria da task e a suíte de regressão definida pelas dependências.

## 2.4 Regras não negociáveis

- Bug novo → primeiro criar teste de regressão que reproduz o bug.
- Não remover, enfraquecer ou alterar expectativa de teste apenas para obter GREEN.
- Não mockar regra de domínio que precisa ser validada contra PostgreSQL.
- Gateways externos podem ser fake/mock em integração, mas devem respeitar contrato realista.
- Tempo, jobs e expirações devem usar relógio controlável nos testes.
- Testes de concorrência devem executar concorrência real contra banco de teste.
- Toda transição financeira deve ser idempotente.
- Toda transição de estado deve possuir teste de autorização e de estado inválido.
- Cada task só pode começar quando todas as dependências obrigatórias estiverem `ACCEPTED`.

---

# 3. Taxonomia de testes

| Código | Tipo | Objetivo |
|---|---|---|
| `UNIT` | Unitário | Regra pura, cálculo, policy, validator, state transition |
| `DB` | Persistência | Constraints, índices, FK, unicidade, transações |
| `MIG` | Migration | Baseline, reset, migrate up/down quando aplicável, seed |
| `API` | Integração HTTP | Route + auth + controller/service + PostgreSQL |
| `CONTRACT` | Contrato | Payloads, status HTTP, erros canônicos, backward contract deliberado |
| `AUTHZ` | Autorização | Papel, ownership, partner assignment, admin override |
| `CONC` | Concorrência | Locks, dupla aceitação, idempotência concorrente |
| `TIME` | Tempo/jobs | Expiração, timeout, expansão de raio, auto-confirmação |
| `MAPS` | Geoespacial | Adapter Routes, distância, falhas, deterministic fake |
| `GATEWAY` | Pagamento | Contract fake para cartão/PIX, webhook, refund, idempotência |
| `E2E` | E2E backend | Fluxo completo pela API com PostgreSQL real de teste |
| `SEC` | Segurança | Upload, MIME, tamanho, acesso, dados sensíveis |
| `PERF` | Performance focal | Query crítica, matching e índices sob volume sintético |
| `UI` | UI/widget/component | Somente nas tasks consumidoras pós-backend |
| `UX` | Fluxo de usuário | Somente nas tasks consumidoras pós-backend |
| `A11Y` | Acessibilidade | Somente nas UIs consumidoras |

Nem toda task precisa de todos os tipos. A bateria mínima está definida por task abaixo.

---

# 4. Hierarquia de execução

## 4.1 DAG principal

```text
T00  Harness + auditoria inicial
 │
 ▼
T01  Baseline do banco + reset + admin seed
 ├───────────────┐
 ▼               ▼
T02 Settings     T03 Tow Vehicles + Docs
 │               │
 │               ▼
 │              T04 Vehicle Compatibility
 │               │
 └──────┬────────┘
        ▼
       T05 Routing + Pricing
        │
        ▼
       T06 Matching + Radius Expansion
        │
        ▼
       T07 Proposals
        │
        ▼
       T08 Counteroffer
        │
        ▼
       T09 Atomic Assignment + Concurrency
        │
        ├───────────────┐
        ▼               ▼
       T10 State        T12 Payment Core
        │               │
        ▼               ├────────┬────────┐
       T11 Cancel/      ▼        ▼        ▼
       No-show         T13      T14      T15
        │              Card     PIX      Cash/Debt
        └───────────────┴────────┴────────┘
                        │
                        ▼
                       T16 Wallet + Settlement + Payout
                        │
                        ▼
                       T17 Disputes + Reviews + Admin Override
                        │
                        ▼
                       T18 Contract Freeze + Full E2E + Regression
                        │
                        ▼
               TOW BACKEND READY FOR INTEGRATION
```

## 4.2 Paralelização segura

Depois de `T01`:

- `T02` e `T03` podem rodar em paralelo.

Depois de `T09`:

- `T10` e `T12` podem avançar parcialmente em paralelo.

Depois de `T12`:

- `T13`, `T14` e `T15` podem ser implementadas em paralelo, desde que compartilhem o mesmo contrato financeiro definido em `T12`.

Não paralelizar tasks que escrevam a mesma state machine ou as mesmas migrations sem coordenação explícita.

---

# 5. Gates globais

## Gate G0 — Harness confiável

Requer `T00` aceita.

## Gate G1 — Schema confiável

Requer `T01` aceita.

## Gate G2 — Provider/Tow Vehicle pronto

Requer `T02`, `T03`, `T04` aceitas.

## Gate G3 — Discovery/Pricing pronto

Requer `T05`, `T06` aceitas.

## Gate G4 — Negotiation pronto

Requer `T07`, `T08`, `T09` aceitas.

## Gate G5 — Operation pronto

Requer `T10`, `T11` aceitas.

## Gate G6 — Finance pronto

Requer `T12`, `T13`, `T14`, `T15`, `T16` aceitas.

## Gate G7 — Governance pronto

Requer `T17` aceita.

## Gate G8 — Backend integration-ready

Requer `T18` aceita.

---

# 6. Tasks detalhadas

## T00 — Tow Test Harness & Current-State Audit

**Objetivo:** garantir que a suíte de testes seja determinística antes de reestruturar o domínio.

**Dependências:** nenhuma.

### RED

Criar smoke tests que demonstrem:

- criação e limpeza isolada de banco de teste;
- autenticação de admin/cliente/parceiro em fixture;
- execução de transaction por teste quando cabível;
- fake clock utilizável;
- fake de Maps/Routes;
- fake de gateway de cartão/PIX;
- nenhuma chamada real para Google/Stripe/Firebase em teste.

### Implementação

- normalizar setup/teardown Jest;
- padronizar factories/builders;
- definir `TowTestContext` ou equivalente;
- documentar comandos de teste;
- auditar endpoints Tow/Emergency/Payments existentes e mapear o que será preservado, substituído ou removido.

### Testes obrigatórios

`UNIT`, `DB`, `API`, `CONTRACT`.

### Exit gate

- suíte focada executa repetidamente sem flakiness;
- banco de teste não compartilha dados entre casos;
- adapters externos estão substituíveis;
- relatório de compatibilidade dos endpoints existentes anexado à task.

---

## T01 — Clean Database Baseline, Reset & Admin Seed

**Objetivo:** criar baseline limpa do JaResolve autorizada para reset destrutivo dos dados.

**Dependências:** `T00`.

### RED

Testes devem falhar até existir schema que garanta:

- reset completo dos dados;
- migrations aplicadas do zero em banco vazio;
- somente admin padrão após seed mínimo;
- segredo/senha de admin vindo de ambiente, nunca hardcoded;
- constraints fundamentais de users/partners/payments/audit.

### Implementação

- eliminar necessidade de migração de dados legados para este domínio;
- consolidar baseline/migrations limpas;
- reset de ambiente de desenvolvimento/teste;
- seed apenas do admin padrão;
- documentar procedimento de reset.

### Testes obrigatórios

`MIG`, `DB`, `SEC`.

### Exit gate

`drop/reset → migrate latest → seed → test` funciona em ambiente limpo e repetível.

---

## T02 — Tow System Settings Contract

**Objetivo:** centralizar todas as configurações globais do Tow no backend.

**Dependências:** `T01`.

### Settings obrigatórios

- `tow_initial_radius_km`
- `tow_radius_increment_km`
- `tow_max_radius_km`
- `tow_radius_expansion_interval_minutes`
- `tow_request_search_timeout_minutes`
- `tow_proposal_expiry_minutes`
- `tow_counteroffer_expiry_minutes`
- `tow_completion_confirmation_timeout_minutes`
- `tow_customer_no_show_timeout_minutes`
- `tow_platform_fixed_fee`
- `tow_cancellation_fee`
- `tow_cancellation_partner_percentage`
- `tow_cancellation_platform_percentage`
- `tow_max_platform_fee_debt`

### RED

- `tow_max_radius_km > 100` rejeitado;
- percentuais de cancelamento devem somar 100;
- valores negativos rejeitados;
- timeouts <= 0 rejeitados;
- settings ausentes retornam erro/config default explicitamente definido, nunca comportamento silencioso.

### Testes obrigatórios

`UNIT`, `DB`, `API`, `CONTRACT`, `AUTHZ`.

### Exit gate

Admin consegue ler/alterar; consumidores operacionais apenas ler; validações protegidas pelo backend.

---

## T03 — Tow Vehicles, Pricing Configuration & Vehicle Documents

**Objetivo:** permitir múltiplos veículos por parceiro Tow, apenas um ativo e documentação obrigatória/aprovada.

**Dependências:** `T01`.

### RED

Cobrir:

- somente `partner_type=tow` cadastra TowVehicle;
- parceiro pode ter N veículos;
- apenas um ativo por parceiro;
- ativar B desativa A atomicamente;
- veículo sem documento aprovado não pode ficar operacional;
- upload aceita imagem/PDF permitidos;
- MIME/tamanho inválido rejeitado;
- documento `pending/approved/rejected`;
- rejection reason obrigatório em rejeição;
- documento expirado invalida elegibilidade;
- admin é quem aprova/rejeita;
- parceiro não aprova próprio documento;
- veículo guarda `minimum_charge`, `included_km`, `price_per_additional_km`.

### Testes obrigatórios

`UNIT`, `DB`, `API`, `CONTRACT`, `AUTHZ`, `SEC`, `CONC` para ativação concorrente.

### E2E focal

Parceiro Tow → cadastra 2 veículos → envia documento → admin aprova → ativa um → troca ativo → apenas um permanece ativo.

### Exit gate

TowVehicle operacional exige parceiro aprovado + veículo ativo + documentação válida/aprovada.

---

## T04 — Vehicle Compatibility & Capacity

**Objetivo:** impedir matching entre guincho e veículo transportado incompatíveis.

**Dependências:** `T03`.

### Classes iniciais

- `motorcycle`
- `light_vehicle`
- `medium_truck`
- `heavy_truck`

### RED

- veículo declara `supported_vehicle_classes`;
- peso/capacidade incompatível rejeita matching;
- medium/heavy exige peso/PBT quando necessário;
- equipamento/capacidade ausente impede elegibilidade quando requerido;
- um TowVehicle pode aceitar múltiplas classes.

### Testes obrigatórios

`UNIT`, `DB`, `API`, `CONTRACT`.

### Exit gate

Existe policy pura `isTowVehicleCompatible(request, towVehicle)` coberta por testes e usada pelo matching.

---

## T05 — Google Routes Adapter & Tow Pricing

**Objetivo:** calcular distância tarifável e preço de forma determinística.

**Dependências:** `T02`, `T03`, `T04`.

### RED

Cobrir fórmula:

```text
total_distance = provider_to_pickup + pickup_to_destination
billable_extra_km = max(0, ceil(total_distance - included_km))
price = minimum_charge + billable_extra_km * price_per_additional_km
```

Casos:

- dentro da franquia;
- exatamente no limite;
- decimal acima do limite;
- rota zero/inválida;
- falha/timeout do Routes;
- tarifa inválida;
- snapshot da tarifa e da rota na proposta;
- preço existente não muda quando configuração futura muda.

### Implementação

Criar adapter de Routes desacoplado do domínio; testes nunca usam API externa real.

### Testes obrigatórios

`UNIT`, `MAPS`, `API`, `CONTRACT`.

### Exit gate

Mesmo input + mesmo snapshot → mesmo preço.

---

## T06 — Geographic Matching & Progressive Radius Expansion

**Objetivo:** localizar parceiros elegíveis e expandir raio automaticamente.

**Dependências:** `T02`, `T04`, `T05`.

### RED

- somente partner `tow`;
- `approved + online + available`;
- TowVehicle ativo/aprovado/documentação válida;
- compatibilidade;
- dívida de plataforma abaixo do limite;
- raio começa em `tow_initial_radius_km`;
- expande em `tow_radius_increment_km`;
- nunca ultrapassa `tow_max_radius_km <= 100`;
- expansão respeita `tow_radius_expansion_interval_minutes`;
- após raio máximo, permanece buscando até timeout global;
- encerra `expired/no_provider_available` no timeout;
- parceiro já notificado não gera notificações duplicadas descontroladas.

### Testes obrigatórios

`UNIT`, `DB`, `API`, `TIME`, `PERF` focal, `AUTHZ`.

### E2E focal

Nenhum parceiro em 10 km → parceiro aparece em 20 km → matching após expansão.

### Exit gate

Matching determinístico com fake clock e dataset sintético.

---

## T07 — Tow Proposal Lifecycle

**Objetivo:** permitir múltiplas propostas concorrentes e expiração/withdraw corretos.

**Dependências:** `T05`, `T06`.

### RED

- vários parceiros elegíveis propõem;
- preço da proposta vem exclusivamente do cálculo do backend;
- parceiro não escolhe preço manual;
- snapshot da tarifa/rota;
- expiração configurável;
- proposta expirada não aceita;
- withdraw permitido antes de aceite/contraproposta;
- parceiro não elegível não propõe;
- proposal ownership/autorização;
- uma proposta por parceiro por request, salvo regra explícita futura.

### Testes obrigatórios

`UNIT`, `DB`, `API`, `CONTRACT`, `AUTHZ`, `TIME`.

### Exit gate

Lifecycle completo de proposal testado sem atribuir automaticamente serviço.

---

## T08 — Single Counteroffer

**Objetivo:** implementar exatamente uma contraproposta do cliente por negociação.

**Dependências:** `T07`.

### RED

- cliente proprietário pode contrapropor uma vez;
- segundo counteroffer rejeitado;
- parceiro alvo pode aceitar ou recusar;
- outro parceiro não responde;
- counteroffer expira pelo setting;
- após counteroffer, withdraw simples da proposta fica bloqueado;
- aceitar/recusar é idempotente;
- não existe contra-contraoferta.

### Testes obrigatórios

`UNIT`, `DB`, `API`, `CONTRACT`, `AUTHZ`, `TIME`.

### Exit gate

Fluxos `proposal→accept` e `proposal→counteroffer→accept/reject` cobertos.

---

## T09 — Atomic Assignment & Concurrency Control

**Objetivo:** garantir exatamente um parceiro/veículo atribuído por request.

**Dependências:** `T07`, `T08`.

### RED

- duas propostas aceitas simultaneamente → uma vence;
- duas chamadas de accept na mesma proposta → idempotência;
- accept de counteroffer concorrente → uma transição;
- atribuição congela `final_price`, `assigned_partner_id`, `assigned_tow_vehicle_id`, destino e snapshots;
- todas as demais propostas encerradas atomicamente;
- parceiro e veículo ficam `busy`;
- veículo ativo não pode ser trocado durante atendimento atribuído.

### Testes obrigatórios

`DB`, `API`, `CONTRACT`, `CONC`, `AUTHZ`.

### Exit gate

Teste de corrida real contra PostgreSQL comprova impossibilidade de dupla atribuição.

---

## T10 — Operational State Machine & Tracking

**Objetivo:** implementar estados operacionais válidos e tracking.

**Dependências:** `T09`.

### State machine

```text
SEARCHING
→ NEGOTIATING
→ ASSIGNED
→ EN_ROUTE
→ ARRIVED
→ IN_TRANSIT
→ COMPLETION_PENDING
→ COMPLETED
```

Laterais:

- `CANCELLED`
- `EXPIRED`
- `DISPUTED`

### RED

- transições válidas passam;
- transições pulando estado falham;
- somente parceiro atribuído/admin opera transições de parceiro;
- cliente não inicia atendimento;
- `EN_ROUTE` respeita pré-condição financeira do método;
- tracking permitido apenas nos estados ativos;
- timestamp/GPS auditados;
- finish gera `COMPLETION_PENDING`;
- confirmação do cliente gera `COMPLETED`;
- timeout gera auto-confirmação;
- conclusão idempotente.

### Testes obrigatórios

`UNIT`, `DB`, `API`, `CONTRACT`, `AUTHZ`, `TIME`.

### E2E focal

assigned → en_route → arrived → in_transit → completion_pending → completed.

### Exit gate

Nenhuma transição de estado ocorre fora de uma policy/state machine central.

---

## T11 — Cancellation, Customer No-show & Partner No-show

**Objetivo:** fechar todos os caminhos laterais operacionais.

**Dependências:** `T02`, `T10`.

### RED

Cliente:

- antes de `EN_ROUTE`: cancelamento gratuito;
- `EN_ROUTE+`: aplica `tow_cancellation_fee`;
- split da taxa segue percentuais configurados.

Parceiro:

- cancelamento não cobra cliente;
- request pode voltar ao matching;
- registra métrica/reputação;
- sem multa financeira automática no MVP.

No-show cliente:

- somente após `ARRIVED`;
- timeout configurável;
- equivale a cancelamento após deslocamento.

No-show parceiro:

- cliente não paga;
- request retorna ao matching quando ainda válido;
- audit/reputation event.

### Testes obrigatórios

`UNIT`, `DB`, `API`, `CONTRACT`, `AUTHZ`, `TIME`.

### Exit gate

Todos os caminhos laterais terminam em estado consistente e evento de auditoria.

---

## T12 — Payment Orchestration Core

**Objetivo:** definir contrato financeiro comum sem forçar cartão, PIX e dinheiro ao mesmo lifecycle.

**Dependências:** `T02`, `T09`.

### RED

- `payment_method = card|pix|cash`;
- mudança de método permitida antes de `EN_ROUTE` quando pagamento eletrônico falha;
- `final_price` imutável após acordo;
- `tow_platform_fixed_fee` deduzido do parceiro, não somado ao cliente;
- serviço de R$180 e fee R$10 → cliente R$180 / parceiro bruto líquido R$170 antes de outros débitos;
- operações financeiras idempotentes;
- payment record correlacionado à emergency request.

### Testes obrigatórios

`UNIT`, `DB`, `API`, `CONTRACT`, `GATEWAY` contract base.

### Exit gate

Card/PIX/Cash podem implementar estratégias diferentes sob uma interface financeira comum.

---

## T13 — Card Authorization/Capture/Refund

**Objetivo:** cartão com autorização prévia e captura na conclusão.

**Dependências:** `T12`.

### RED

- acordo → authorize `final_price`;
- falha de autorização bloqueia `EN_ROUTE`;
- autorização duplicada é idempotente;
- conclusão confirmada → capture;
- capture duplicado não duplica cobrança;
- cancelamento pré-EN_ROUTE libera/cancela autorização;
- cancelamento pós-EN_ROUTE aplica taxa e captura/ajusta conforme capability do gateway;
- webhook repetido idempotente;
- erro do gateway mantém estado recuperável.

### Testes obrigatórios

`UNIT`, `DB`, `API`, `GATEWAY`, `CONTRACT`, `E2E` com fake gateway.

### Exit gate

Fluxo cartão completo e recuperável diante de retry/webhook duplicado.

---

## T14 — PIX Payment & Refund

**Objetivo:** PIX pago antes do `EN_ROUTE`, com refund em cancelamento.

**Dependências:** `T12`.

### RED

- gerar cobrança PIX após acordo;
- somente pagamento confirmado permite `EN_ROUTE`;
- webhook duplicado idempotente;
- cancelamento gratuito → refund integral;
- cancelamento pós-EN_ROUTE → refund `final_price - cancellation_fee`;
- split da cancellation fee persistido;
- refund falho entra em estado recuperável/retry.

### Testes obrigatórios

`UNIT`, `DB`, `API`, `GATEWAY`, `CONTRACT`, `E2E` com fake PIX.

### Exit gate

Nenhum serviço PIX inicia sem confirmação do pagamento.

---

## T15 — Cash, Partner Platform Fee Debt & Customer Cancellation Debt

**Objetivo:** tratar corretamente dinheiro físico e dívidas derivadas.

**Dependências:** `T12`, `T11`.

### RED

Pagamento cash concluído:

- parceiro marca `cash_received`;
- cliente confirma ou auto-confirma;
- cria `platform_fee_debt += tow_platform_fixed_fee`;
- dívida é descontada automaticamente de recebimentos eletrônicos futuros;
- parceiro acima de `tow_max_platform_fee_debt` não aceita novos chamados.

Cancelamento cash pós-EN_ROUTE:

- cria `CustomerFinancialDebt` = cancellation fee;
- cliente fica impedido de abrir novo atendimento enquanto dívida impeditiva existir;
- dívida quitável somente por cartão/PIX no MVP;
- após pagamento, split da taxa é aplicado;
- pagamento da dívida é idempotente.

### Testes obrigatórios

`UNIT`, `DB`, `API`, `CONTRACT`, `AUTHZ`, `E2E`.

### Exit gate

Dívida de parceiro e dívida de cliente são entidades financeiras auditáveis, não flags soltas.

---

## T16 — Wallet, Settlement Eligibility & Daily Payout Batch

**Objetivo:** separar receita capturada de saldo elegível e payout bancário.

**Dependências:** `T13`, `T14`, `T15`.

### RED

- crédito eletrônico entra `pending_settlement`;
- somente settlement confirmado vira `available_for_payout`;
- platform fee debt é abatida antes de saldo disponível;
- disputed/blocked nunca entra em payout;
- lote diário agrupa por parceiro;
- um parceiro → um payout consolidado por lote;
- processamento manual pelo Dashboard no MVP;
- retry não duplica payout;
- partial failure do lote mantém itens individualmente rastreáveis.

### Estados financeiros

- `pending_settlement`
- `available_for_payout`
- `payout_processing`
- `paid`
- `blocked`

### Testes obrigatórios

`UNIT`, `DB`, `API`, `CONTRACT`, `CONC`, `E2E` financeiro.

### Exit gate

Reconciliação: soma de ledger = soma de créditos - fees - debts - payouts, sem saldo órfão.

---

## T17 — Disputes, Reviews, Admin Override & Immutable Audit

**Objetivo:** fechar governança operacional.

**Dependências:** `T10`, `T11`, `T16`.

### RED

Disputa:

- cliente contesta em `COMPLETION_PENDING`;
- atendimento vira `DISPUTED`;
- payout do parceiro fica bloqueado;
- resolução administrativa desbloqueia/ajusta financeiramente.

Review:

- apenas cliente do serviço `COMPLETED` avalia;
- uma avaliação por atendimento;
- sem rating reverso no MVP.

Admin override:

- admin pode cancelar/concluir excepcionalmente;
- `reason` obrigatório;
- `admin_user_id`, timestamp e antes/depois registrados;
- audit log não pode ser alterado pelo fluxo normal.

### Testes obrigatórios

`UNIT`, `DB`, `API`, `CONTRACT`, `AUTHZ`, `SEC`, `E2E` focal.

### Exit gate

Toda ação sensível é reconstruível via audit trail.

---

## T18 — Contract Freeze, Full E2E, Regression & Ready Gate

**Objetivo:** provar que o domínio completo está pronto para consumidores.

**Dependências:** `T02` a `T17` todas `ACCEPTED`.

### Atividades

- congelar contratos HTTP oficiais;
- remover aliases/rotas Tow legadas incompatíveis ou documentar compat layer intencional;
- gerar documentação de integração;
- executar matriz de regras integral;
- executar suíte ampla de regressão;
- executar E2E obrigatórios;
- validar reset/migrate/seed em ambiente limpo;
- validar ausência de chamada externa real em testes;
- verificar cobertura de regras P0.

### E2E mínimos obrigatórios

1. Tow card + aceite direto + conclusão.
2. Tow card + counteroffer + conclusão.
3. Tow PIX + aceite direto + conclusão.
4. Tow PIX + counteroffer + conclusão.
5. Tow cash + conclusão + platform fee debt.
6. Múltiplas propostas e escolha de uma.
7. Dupla aceitação concorrente bloqueada.
8. Proposta expirada.
9. Counteroffer expirado.
10. Segundo counteroffer rejeitado.
11. Withdraw antes de counteroffer.
12. Expansão automática de raio.
13. Timeout sem provider.
14. Veículo sem documento aprovado não recebe matching.
15. Documento expirado bloqueia veículo.
16. Veículo incompatível não recebe matching.
17. Cancelamento cliente antes de EN_ROUTE.
18. Cancelamento cliente após EN_ROUTE.
19. Customer no-show.
20. Partner cancellation e rematching.
21. Partner no-show e rematching.
22. Cash cancellation debt bloqueia novo atendimento.
23. Quitação da customer debt via PIX/cartão.
24. Partner fee debt abatida de futuro recebimento eletrônico.
25. Limite de partner fee debt bloqueia novos chamados.
26. Disputa bloqueia payout.
27. Auto-confirmação de conclusão por timeout.
28. Admin override com audit log.
29. Payout diário consolidado sem duplicação.
30. Reset completo + migrations + seed apenas admin.
31. Transporte de motorcycle.
32. Transporte de light_vehicle.
33. Transporte de medium_truck compatível.
34. Transporte de heavy_truck compatível.

### Testes obrigatórios

`UNIT` regressão, `DB`, `MIG`, `API`, `CONTRACT`, `AUTHZ`, `CONC`, `TIME`, `MAPS`, `GATEWAY`, `SEC`, `E2E`.

### Ready gate

Só declarar:

```text
TOW BACKEND READY FOR INTEGRATION
```

quando:

- todas as tasks T00–T18 estiverem `ACCEPTED`;
- nenhum teste P0 estiver skipped;
- nenhum E2E obrigatório estiver skipped;
- suíte focada estiver 100% verde;
- regressões novas fora do domínio Tow não forem introduzidas;
- contrato oficial estiver documentado;
- schema puder ser criado do zero;
- seed mínimo produzir apenas o admin padrão;
- toda regra da `TOW-BUSINESS-RULE-MATRIX.md` estiver vinculada a pelo menos um teste automatizado.

---

# 7. Matriz resumida Task × Testes

| Task | UNIT | DB/MIG | API/CONTRACT | AUTHZ/SEC | TIME/MAPS | GATEWAY | CONC | E2E |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| T00 | ✓ | ✓ | ✓ |  | ✓ | ✓ |  |  |
| T01 |  | ✓ |  | ✓ |  |  |  |  |
| T02 | ✓ | ✓ | ✓ | ✓ |  |  |  |  |
| T03 | ✓ | ✓ | ✓ | ✓ |  |  | ✓ | ✓ focal |
| T04 | ✓ | ✓ | ✓ |  |  |  |  |  |
| T05 | ✓ |  | ✓ |  | ✓ |  |  |  |
| T06 | ✓ | ✓ | ✓ | ✓ | ✓ |  |  | ✓ focal |
| T07 | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |
| T08 | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |
| T09 |  | ✓ | ✓ | ✓ |  |  | ✓ |  |
| T10 | ✓ | ✓ | ✓ | ✓ | ✓ |  |  | ✓ focal |
| T11 | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |
| T12 | ✓ | ✓ | ✓ |  |  | ✓ |  |  |
| T13 | ✓ | ✓ | ✓ |  |  | ✓ |  | ✓ |
| T14 | ✓ | ✓ | ✓ |  |  | ✓ |  | ✓ |
| T15 | ✓ | ✓ | ✓ | ✓ |  |  |  | ✓ |
| T16 | ✓ | ✓ | ✓ |  |  |  | ✓ | ✓ |
| T17 | ✓ | ✓ | ✓ | ✓ |  |  |  | ✓ |
| T18 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

# 8. Critério de aceite por task

Toda task deve gerar um receipt com:

```text
Task ID
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

Uma task não pode ser considerada concluída apenas porque o código compila.

---

# 9. Contratos entre tasks

Quando uma task produz contrato consumido por outra, o contrato deve ser estabilizado antes da dependente iniciar.

Exemplos:

- `T02` entrega nomes/tipos dos settings.
- `T03` entrega schema e API de TowVehicle.
- `T05` entrega `RouteQuote`/pricing snapshot.
- `T07` entrega Proposal contract.
- `T08` entrega CounterOffer contract.
- `T09` entrega Assignment contract.
- `T10` entrega state machine.
- `T12` entrega Payment Strategy contract.
- `T16` entrega Wallet/Payout ledger contract.

Mudança posterior em contrato exige:

1. teste de regressão;
2. revisão das tasks consumidoras;
3. atualização explícita da matriz.

---

# 10. O que não entra no backend T00–T18

Para preservar a estratégia backend-first, estas integrações ficam bloqueadas até `T18`:

- UI do Mobile Cliente;
- UI do Mobile Parceiro;
- integração final do Dashboard com o domínio Tow;
- Google Maps visual nos apps;
- UX final de proposta/contraproposta;
- UX final de pagamento;
- UX final de tracking.

O backend poderá possuir endpoints administrativos necessários, mas o consumidor visual só começa após o Ready Gate.

---

# 11. Testes UI/UX pós-backend

Depois de `TOW BACKEND READY FOR INTEGRATION`, cada consumidor deverá ter seu próprio plano TDD.

## Dashboard

Bateria mínima:

- `UI` component tests;
- integração API;
- validação de formulário dos settings;
- upload/preview de documento de TowVehicle;
- fluxo admin approve/reject;
- payout batch preview/confirm;
- `A11Y` para controles críticos;
- browser E2E dos fluxos administrativos.

## Mobile Parceiro

Bateria mínima:

- unit tests de repository/notifier/state;
- widget tests;
- golden tests para estados críticos quando útil;
- integração API;
- E2E realista: receber chamado → proposta → counteroffer → aceite → tracking → conclusão;
- estados offline/erro/retry;
- Google Maps UI e permissão de localização.

## Mobile Cliente

Bateria mínima:

- unit tests de repository/notifier/state;
- widget tests;
- golden tests dos estados críticos;
- integração API;
- E2E: abrir chamado → propostas → aceitar/contrapropor → pagar → acompanhar → confirmar → avaliar;
- PIX/card/cash UI;
- dívida pendente e bloqueio de novo atendimento;
- acessibilidade e estados de loading/error/empty.

Nenhuma regra crítica deverá ser reimplementada nesses consumidores; os testes de UI validam apresentação e integração do contrato do backend.

---

# 12. Regra para execução por IA/workhorse

O executor deve sempre escolher a próxima task usando:

```text
READY(task) =
  all(dep.status == ACCEPTED)
  AND task.status in [PENDING, RETRY]
```

Quando houver múltiplas tasks READY e sem conflito de arquivos/contratos, elas podem ser paralelizadas.

O executor não pode:

- pular dependency gate;
- declarar task aceita sem testes;
- iniciar integração Mobile/Dashboard antes de T18;
- modificar regra de negócio sem atualizar a especificação e matriz;
- manter código legado incompatível apenas para fazer teste antigo passar sem decisão explícita.

---

# 13. Definition of Done do PR `Implements Tow Service`

O PR pode sair de Draft somente quando:

1. T00–T18 aceitas;
2. matriz de regras 100% mapeada para testes;
3. todos os E2E obrigatórios verdes;
4. banco reconstruível do zero;
5. apenas admin padrão no seed inicial;
6. contratos oficiais documentados;
7. nenhum consumidor depende de endpoint Tow legado removido sem compatibilidade intencional;
8. domínio financeiro reconciliado;
9. concorrência de assignment/payout comprovada;
10. `TOW BACKEND READY FOR INTEGRATION` emitido com evidências.

Depois disso, Mobile Cliente, Mobile Parceiro e Dashboard podem iniciar suas integrações contra um contrato congelado.