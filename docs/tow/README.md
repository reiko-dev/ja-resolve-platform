# JaResolve Tow — Contract Index

> Status: **cross-document freeze review PASS**  
> Final review: `TOW-CONTRACT-FREEZE-REVIEW.md`

Este diretório é a fonte de verdade da reestruturação do módulo **Guincho / Tow**.

## Normative documents

### Domain / business

1. `TOW-PRICING-CONTRACT.md`
   - pricing autoritativo por rota real;
   - excedente proporcional por metro;
   - `ROUND_HALF_UP` somente no boundary monetário;
   - `ceil(excess_km)` é proibido.

2. `TOW-SERVICE-SPECIFICATION.md`
   - comportamento funcional congelado;
   - module, vehicle, matching, negotiation, payments, debts, payout, governance.

3. `TOW-BUSINESS-RULE-MATRIX.md`
   - invariants identificáveis/testáveis;
   - prioridades/cobertura mínima.

4. `TOW-MODULE-CONTRACT.md`
   - `module_key=tow`, `service_key=tow`, `partner_type=tow`;
   - feature flag;
   - graceful drain.

### Backend execution

5. `TOW-TDD-IMPLEMENTATION-PLAN.md`
   - RED → GREEN → REFACTOR → gate;
   - T00–T18;
   - Clean Architecture/SOLID;
   - 75 mandatory E2E in T18.

6. `TOW-TASK-GRAPH.yaml`
   - dependencies machine-readable;
   - outputs/tests/gates;
   - separate mock-implementation and real-integration consumer gates.

7. GitHub Epic #10 + Issues #11–#29
   - task executable specification;
   - Issue da task é a ordem operacional imediata.

### Consumer-first contract

8. `tow-api-contract.openapi.yaml`
   - canonical OpenAPI 3.1 entrypoint;
   - generated client/mock/contract test source.

9. `TOW-API-CONTRACT.md`
   - REST semantics, DTO/error/idempotency conventions.

10. `TOW-API-CONTRACT-DRAFT4-ADDENDUM.md`
    - route geometry;
    - partner status/location;
    - complete opportunities;
    - partner financial summary;
    - Dashboard detail/payout contracts.

11. `TOW-CONSUMER-FLOW-SPEC.md`
    - Mobile Cliente flow;
    - Mobile Parceiro flow;
    - Dashboard flow;
    - mock-first implementation boundary.

12. `TOW-CONSUMER-FLOW-COVERAGE.md`
    - flow × endpoint coverage matrix.

13. `TOW-OPENAPI-CONTRACT-DECISIONS.md`
    - discovery/rehydration decisions;
    - true-partial settings PATCH.

14. `TOW-OPENAPI-CONSISTENCY-REVIEW.md`
    - OpenAPI structural/ref/codegen smoke evidence.

15. `TOW-CONSUMER-CONTRACT-SMOKE-RESULT.md`
    - Cliente/Parceiro/Dashboard smoke PASS.

16. `TOW-CONTRACT-FREEZE-REVIEW.md`
    - final cross-document review;
    - resolved contradictions;
    - merge/handoff gates.

`tow-api-contract.base.openapi.yaml` é artefato interno de composição. Apps usam `tow-api-contract.openapi.yaml`.

## Precedence

### Pricing

```text
TOW-PRICING-CONTRACT
→ TOW-SERVICE-SPECIFICATION
→ TOW-BUSINESS-RULE-MATRIX
```

### Functional/domain

```text
TOW-SERVICE-SPECIFICATION
→ TOW-BUSINESS-RULE-MATRIX
→ TOW-MODULE-CONTRACT
```

### Backend execution

```text
Issue da task
→ TOW-TASK-GRAPH.yaml
→ TOW-TDD-IMPLEMENTATION-PLAN.md
```

### Consumer transport

```text
tow-api-contract.openapi.yaml
→ TOW-API-CONTRACT-DRAFT4-ADDENDUM.md
→ TOW-CONSUMER-FLOW-COVERAGE.md
→ TOW-API-CONTRACT.md
→ TOW-CONSUMER-FLOW-SPEC.md
```

Se surgir conflito, não escolher silenciosamente. Corrigir contrato + tests antes da implementação dependente.

## Consumer handoff gates

Após merge do PR de contrato e com smoke já verde:

```text
TOW MOBILE CONTRACT READY FOR IMPLEMENTATION
```

Permite implementação Mobile/Dashboard contra OpenAPI/mocks.

Somente T18 emite:

```text
TOW BACKEND READY FOR INTEGRATION
```

Isso libera substituição de mocks pelo backend real.

```text
mock-ready != backend-integration-ready
```

Nenhum consumer pode criar endpoint/DTO/regra crítica local para compensar backend incompleto.