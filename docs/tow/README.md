# JaResolve Tow — Contract Index

Este diretório é a fonte de verdade da reestruturação do módulo **Guincho / Tow**.

## Normative documents

### Domain and business

1. `TOW-SERVICE-SPECIFICATION.md`
   - comportamento funcional completo do serviço;
   - estados, pricing, matching, pagamentos, cancelamentos, dívidas, payout e governança.

2. `TOW-BUSINESS-RULE-MATRIX.md`
   - regras identificáveis/testáveis;
   - invariants;
   - prioridade e cobertura esperada.

3. `TOW-MODULE-CONTRACT.md`
   - Tow como módulo/componente;
   - `module_key=tow`, `service_key=tow`, `partner_type=tow`;
   - global feature flag;
   - graceful drain.

### Backend execution

4. `TOW-TDD-IMPLEMENTATION-PLAN.md`
   - política RED → GREEN → REFACTOR → gate;
   - sequência T00–T18;
   - Clean Architecture/SOLID;
   - critérios de readiness.

5. `TOW-TASK-GRAPH.yaml`
   - dependências machine-readable;
   - outputs/test suites/gates.

6. GitHub Epic #10 + Issues #11–#29
   - especificação executável por task;
   - a Issue da task é a ordem operacional imediata do executor.

### Consumer-first contract

7. `TOW-CONSUMER-FLOW-SPEC.md`
   - fluxo de Mobile Cliente;
   - fluxo de Mobile Parceiro;
   - fluxo de Dashboard;
   - UX/domain-state boundaries;
   - o que pode ser implementado antecipadamente com mocks.

8. `TOW-API-CONTRACT.md`
   - paths canônicos;
   - DTOs;
   - enums;
   - error codes;
   - authorization;
   - idempotency;
   - REST/realtime semantics.

9. `tow-api-contract.openapi.yaml`
   - contrato OpenAPI 3.1 para geração de client, mock server e contract tests.

## Precedence

Para regra funcional:

```text
TOW-SERVICE-SPECIFICATION
→ TOW-BUSINESS-RULE-MATRIX
→ TOW-MODULE-CONTRACT
```

Para execução de backend:

```text
Issue da task
→ TOW-TASK-GRAPH.yaml
→ TOW-TDD-IMPLEMENTATION-PLAN.md
```

Para consumidores:

```text
tow-api-contract.openapi.yaml
+ TOW-API-CONTRACT.md
+ TOW-CONSUMER-FLOW-SPEC.md
```

Se surgir contradição entre contratos, **não escolher silenciosamente um comportamento**. Registrar o conflito e corrigir os documentos antes da implementação dependente.

## Early frontend rule

Mobile Cliente, Mobile Parceiro e Dashboard podem iniciar antecipadamente usando mocks gerados a partir do contrato OpenAPI.

Isso permite construir UI, state management, repositories e testes antes do backend completo.

Entretanto:

```text
mock-ready != backend-integration-ready
```

Somente T18 pode emitir:

```text
TOW BACKEND READY FOR INTEGRATION
```

Nenhum consumidor deve compensar backend incompleto com regra crítica local.