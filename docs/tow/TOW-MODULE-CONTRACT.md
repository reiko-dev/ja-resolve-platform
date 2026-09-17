# JaResolve — Tow Module Contract

## 1. Purpose

O serviço **Guincho / Tow** deve existir como um **módulo funcional explícito** do JaResolve, e não como um conjunto de condicionais espalhadas pelo sistema.

O módulo agrupa e vincula, sob uma única fronteira arquitetural:

- o serviço `tow` exposto ao cliente;
- o tipo de parceiro `tow` autorizado a operá-lo;
- seus use cases;
- configurações globais;
- feature flag global;
- regras de eligibility/matching;
- contratos HTTP/eventos;
- integrações de Maps, Payment, Wallet, Documents e Audit;
- capacidades consumidas por Dashboard, Mobile Cliente e Mobile Parceiro.

A existência do `PartnerType = tow` continua sendo um conceito de domínio, mas sua disponibilidade operacional é governada pelo **Tow Module**.

---

## 2. Module identity

Identidade canônica inicial:

```text
module_key   = tow
service_key  = tow
partner_type = tow
```

Esses identificadores devem ser estáveis e não depender de labels de UI.

Conceitualmente:

```text
ServiceModule
└── TowModule
    ├── service_key: tow
    ├── partner_type: tow
    ├── enabled
    ├── settings
    ├── capabilities
    ├── policies/use cases
    └── adapters
```

O objetivo não é criar um plugin dinâmico arbitrário no MVP. O objetivo é criar uma **fronteira modular explícita**, extensível para futuros serviços sem acoplamento transversal.

---

## 3. Global feature flag

O Dashboard deve permitir a um administrador autorizado habilitar/desabilitar o módulo Tow globalmente.

A flag não deve ser hardcoded em frontend. O backend é a fonte de verdade.

Contrato conceitual:

```text
TowModule.enabled: boolean
```

Persistência recomendada:

```text
service_modules
- key
- service_key
- partner_type
- enabled
- disabled_reason nullable
- updated_by
- updated_at
```

`enabled` não deve ser implementado como `if` ad hoc em controllers. Todos os entry points relevantes devem passar por uma policy/guard central, por exemplo:

```text
ServiceModuleAvailability
TowModuleAvailabilityPolicy
```

---

## 4. Disable semantics — graceful drain

Desabilitar Tow significa **impedir novas operações comerciais do serviço sem destruir atendimentos já contratados/em execução**.

Este é o comportamento canônico do MVP.

Quando `TowModule.enabled = false`:

### 4.1 Novas operações bloqueadas

Devem ser bloqueados:

- criação de novo Tow request;
- entrada de novo request em matching;
- expansão de raio para requests ainda não atribuídos;
- criação de novas propostas;
- criação de nova contraproposta;
- novo assignment ainda não consolidado;
- disponibilidade do serviço Tow na lista pública de serviços habilitados;
- entrada de novos parceiros Tow em fluxos operacionais de atendimento.

Erro contratual sugerido:

```text
service_module_disabled
```

com `module_key = tow`.

### 4.2 Requests ainda não atribuídos

Requests em `SEARCHING` ou `NEGOTIATING` quando o módulo for desligado devem ser encerrados de forma determinística com reason code próprio, por exemplo:

```text
SERVICE_DISABLED
```

Não devem continuar esperando novos parceiros/propostas.

Propostas/counteroffers ainda abertas deixam de ser acionáveis.

### 4.3 Atendimentos já atribuídos continuam

Requests que já alcançaram `ASSIGNED` antes da desativação **continuam até um estado terminal**.

Devem continuar funcionando:

- payment readiness já vinculado ao atendimento;
- `EN_ROUTE`;
- `ARRIVED`;
- `IN_TRANSIT`;
- `COMPLETION_PENDING`;
- `COMPLETED`;
- cancellation/no-show;
- refunds/capture;
- debt accounting;
- disputes;
- wallet/settlement/payout;
- audit.

O feature flag não pode abandonar cliente ou parceiro no meio de um serviço já contratado.

Em outras palavras:

```text
DISABLE = stop new business + drain in-flight work
```

Não é um emergency kill-switch de transações já atribuídas.

---

## 5. Re-enable semantics

Quando `TowModule.enabled` voltar para `true`:

- novos Tow requests voltam a ser aceitos imediatamente;
- matching/proposals voltam a operar;
- parceiros Tow elegíveis voltam a aparecer;
- configurações e cadastros existentes permanecem preservados;
- requests encerrados por `SERVICE_DISABLED` não ressuscitam automaticamente;
- não deve haver replay automático de propostas antigas.

Reativação precisa ser idempotente.

---

## 6. Partner type linkage

`PartnerType = tow` pertence ao módulo Tow.

Isso significa:

- o tipo pode continuar persistido/cadastrado enquanto o módulo estiver desabilitado;
- admin pode continuar validando cadastro, documentos e veículos;
- o parceiro pode continuar acessando dados administrativos permitidos;
- entretanto, não pode receber/aceitar novos atendimentos Tow enquanto o módulo estiver desabilitado.

Não apagar, converter ou desativar permanentemente parceiros quando o módulo for desligado.

A flag controla **capacidade operacional do serviço**, não a existência cadastral do parceiro.

---

## 7. Dashboard responsibilities

O Dashboard deve futuramente expor uma tela/controle administrativo contendo, no mínimo:

```text
Tow
Status: Enabled | Disabled
```

Ao alterar o status:

- exigir permissão administrativa;
- opcionalmente exigir `reason` ao desabilitar;
- registrar `updated_by` e `updated_at`;
- gerar AuditEvent;
- mostrar impacto da operação, principalmente quantidade de requests não atribuídos e atendimentos in-flight.

A UI do Dashboard é posterior ao gate `TOW BACKEND READY FOR INTEGRATION`, mas o backend/API do toggle pertence ao domínio Tow e deve existir antes desse gate.

---

## 8. Architectural boundary

O módulo deve seguir Clean Architecture:

```text
Tow Module
├── Domain
│   ├── TowRequest
│   ├── TowVehicle
│   ├── TowProposal
│   ├── TowModuleAvailability
│   ├── Pricing/Compatibility Policies
│   └── domain invariants
│
├── Application
│   ├── use cases
│   ├── ports
│   └── module guard / availability policy
│
├── Adapters
│   ├── HTTP
│   ├── persistence
│   ├── events
│   └── presenters
│
└── Infrastructure
    ├── PostgreSQL
    ├── Google Routes
    ├── Payment Gateway
    ├── File Storage
    └── Scheduler
```

Dependências compartilhadas como Payment, Wallet, Audit, File Storage e Maps continuam componentes horizontais. Tow as consome através de ports; não deve duplicá-las internamente.

---

## 9. Required backend guard points

A disponibilidade do módulo deve ser verificada, no mínimo, antes de:

1. criar Tow request;
2. iniciar/continuar matching de request não atribuído;
3. criar proposal;
4. criar counteroffer;
5. consolidar assignment de request ainda não atribuído;
6. anunciar Tow como serviço disponível para clientes/parceiros.

Após `ASSIGNED`, o guard global não pode impedir as transições necessárias para completar/encerrar o serviço.

---

## 10. Concurrency and idempotency

O toggle pode ocorrer enquanto o sistema processa requests.

Devem existir testes que provem pelo menos:

- disable concorrente com criação de request → nenhum novo request operacional após commit do disable;
- disable concorrente com proposal → nenhuma nova proposal válida após commit do disable;
- disable concorrente com assignment → resultado determinístico e transacional;
- request já `ASSIGNED` antes do disable continua;
- repeated disable/enable é idempotente;
- nenhum request encerrado por `SERVICE_DISABLED` é reaberto automaticamente na reativação.

A estratégia transacional concreta fica para implementação, mas o invariant acima é obrigatório.

---

## 11. Audit requirements

Toda alteração do estado global do módulo deve registrar:

```text
module_key
action = ENABLE | DISABLE
before
after
reason
admin_user_id
timestamp
```

Também devem ser auditáveis encerramentos de requests causados por `SERVICE_DISABLED`.

---

## 12. Test requirements

### UNIT
- module enabled permite novas operações;
- module disabled bloqueia operações pré-assignment;
- assigned/in-flight continua quando disabled;
- re-enable libera novas operações;
- linkage `service_key=tow ↔ partner_type=tow` permanece consistente.

### DB
- module row/registry é único por `module_key`;
- enable/disable é persistido atomicamente;
- audit metadata preservada.

### API / AUTHZ
- admin autorizado consulta/toggle;
- customer/partner não podem toggle;
- status público/consumer retorna disponibilidade correta;
- erro `service_module_disabled` é estável.

### CONCURRENCY
- disable vs create request;
- disable vs proposal;
- disable vs assignment;
- repeated toggle idempotente.

### E2E
- enabled → fluxo Tow pode começar;
- disabled → novo Tow request é bloqueado;
- disable durante SEARCHING/NEGOTIATING → request encerra com `SERVICE_DISABLED`;
- disable após ASSIGNED → atendimento completa normalmente;
- re-enable → novos requests voltam a funcionar;
- partner `tow` continua cadastrado, mas não recebe chamados enquanto módulo está disabled.

---

## 13. Source-of-truth rule

A disponibilidade do módulo deve ser consultada pelo backend e exposta aos consumidores.

Mobile Cliente, Mobile Parceiro e Dashboard podem esconder/desabilitar UI com base nesse contrato, mas **a segurança funcional nunca depende da UI**.

Mesmo com cliente desatualizado ou chamada HTTP manual, o backend deve rejeitar novas operações Tow quando o módulo estiver desabilitado.
