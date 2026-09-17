# JaResolve Tow — Contract Index

Este diretório é a fonte de verdade da reestruturação do módulo **Guincho / Tow**.

## Normative documents

### Domain and business

1. `TOW-PRICING-CONTRACT.md`
   - decisão final de pricing por distância viária real;
   - cobrança proporcional do excedente em metros;
   - arredondamento somente do resultado monetário para centavos;
   - substitui qualquer referência pré-freeze a `ceil(excess_km)` / quilômetro iniciado.

2. `TOW-SERVICE-SPECIFICATION.md`
   - comportamento funcional completo do serviço;
   - estados, pricing, matching, pagamentos, cancelamentos, dívidas, payout e governança.

3. `TOW-BUSINESS-RULE-MATRIX.md`
   - regras identificáveis/testáveis;
   - invariants;
   - prioridade e cobertura esperada.

4. `TOW-MODULE-CONTRACT.md`
   - Tow como módulo/componente;
   - `module_key=tow`, `service_key=tow`, `partner_type=tow`;
   - global feature flag;
   - graceful drain.

### Backend execution

5. `TOW-TDD-IMPLEMENTATION-PLAN.md`
   - política RED → GREEN → REFACTOR → gate;
   - sequência T00–T18;
   - Clean Architecture/SOLID;
   - critérios de readiness.

6. `TOW-TASK-GRAPH.yaml`
   - dependências machine-readable;
   - outputs/test suites/gates.

7. GitHub Epic #10 + Issues #11–#29
   - especificação executável por task;
   - a Issue da task é a ordem operacional imediata do executor.

### Consumer-first contract

8. `TOW-CONSUMER-FLOW-SPEC.md`
   - fluxo de Mobile Cliente;
   - fluxo de Mobile Parceiro;
   - fluxo de Dashboard;
   - UX/domain-state boundaries;
   - o que pode ser implementado antecipadamente com mocks.

9. `TOW-API-CONTRACT.md`
   - paths canônicos originalmente congelados;
   - DTOs;
   - enums;
   - error codes;
   - authorization;
   - idempotency;
   - REST/realtime semantics.

10. `TOW-API-CONTRACT-DRAFT4-ADDENDUM.md`
   - endpoints/DTOs adicionais necessários para cobertura integral dos três consumidores;
   - rota/geometry;
   - status/localização do parceiro;
   - oportunidade completa;
   - resumo financeiro Tow do parceiro;
   - detalhes operacionais/dispute/documentos do Dashboard;
   - payout partner-level;
   - normalização de enums e nomes monetários.

11. `tow-api-contract.openapi.yaml`
   - **entrypoint canônico OpenAPI 3.1** para geração de client, mock server e contract tests;
   - versão atual: `1.0.0-draft.4`;
   - compõe partes estáveis de `tow-api-contract.base.openapi.yaml` por `$ref` local.

12. `TOW-CONSUMER-FLOW-COVERAGE.md`
   - matriz fluxo × endpoint para Cliente, Parceiro e Dashboard;
   - prova documental de que cada capability planejada possui contrato explícito;
   - registra normalizações encontradas durante a revisão.

13. `TOW-OPENAPI-CONTRACT-DECISIONS.md`
   - decisões congeladas sobre discovery/rehydration de Cliente e Parceiro;
   - semântica verdadeira de PATCH parcial dos Tow settings.

14. `TOW-OPENAPI-CONSISTENCY-REVIEW.md`
   - revisão estrutural do contrato;
   - checklist de lint/resolution/codegen antes de sair de Draft.

`tow-api-contract.base.openapi.yaml` é **artefato de composição**, não contrato a ser consumido diretamente pelos apps. Consumidores devem apontar para `tow-api-contract.openapi.yaml`.

## Precedence

Para pricing, a decisão final é específica e tem precedência sobre qualquer wording anterior:

```text
TOW-PRICING-CONTRACT
→ pricing sections in TOW-SERVICE-SPECIFICATION / TOW-BUSINESS-RULE-MATRIX
```

Em particular, `ceil(excess_km)` e cobrança por "quilômetro iniciado" estão revogados.

Para demais regras funcionais:

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

Se uma Issue pré-freeze ainda reproduzir a antiga regra de `ceil`, `TOW-PRICING-CONTRACT.md` é a correção normativa explícita e deve ser aplicada antes da implementação.

Para consumidores:

```text
tow-api-contract.openapi.yaml
→ TOW-API-CONTRACT-DRAFT4-ADDENDUM.md
→ TOW-CONSUMER-FLOW-COVERAGE.md
→ TOW-API-CONTRACT.md
→ TOW-CONSUMER-FLOW-SPEC.md
→ TOW-OPENAPI-CONTRACT-DECISIONS.md
```

`TOW-CONSUMER-FLOW-SPEC.md` continua definindo intenção/UX do fluxo; o OpenAPI canônico define o shape de transporte. O Addendum/Coverage registra as correções necessárias quando exemplos antigos usam nomenclatura não canônica.

Se surgir contradição entre contratos, **não escolher silenciosamente um comportamento**. Registrar o conflito e corrigir os documentos antes da implementação dependente.

## Early frontend rule

Mobile Cliente, Mobile Parceiro e Dashboard podem iniciar antecipadamente usando mocks gerados a partir do contrato OpenAPI canônico.

Isso permite construir UI, state management, repositories e testes antes do backend completo.

Entretanto:

```text
mock-ready != backend-integration-ready
```

Somente T18 pode emitir:

```text
TOW BACKEND READY FOR INTEGRATION
```

Nenhum consumidor deve compensar backend incompleto com regra crítica local ou endpoint/DTO inventado.
