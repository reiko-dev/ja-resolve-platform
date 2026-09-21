# JaResolve Tow — Contract & Execution Index

> Contract baseline: **PR #9 merged / freeze review PASS**  
> Current implementation strategy: **six-delivery Tow MVP**  
> MVP execution plan: `TOW-MVP-DELIVERY-PLAN.md`  
> Epic: #10

Este diretório contém duas camadas diferentes e ambas devem ser preservadas:

1. **Target contract** — o comportamento completo de longo prazo congelado no PR #9.
2. **Execution plan** — o caminho incremental atual para colocar um Tow utilizável em produção de forma controlada.

## Current execution strategy

A implementação não segue mais T02→T18 como 17 milestones obrigatórios antes do primeiro fluxo utilizável.

O caminho executável atual é:

```text
T00 ACCEPTED
→ T01 ACCEPTED
→ MVP-01 #13 Foundation
→ MVP-02 #14 Routes & Pricing
→ MVP-03 #15 Request & Matching
→ MVP-04 #16 Proposal & Assignment
→ MVP-05 #17 Execution & Tracking
→ MVP-06 #18 CASH + Lean E2E
→ TOW MVP BACKEND READY FOR INTEGRATION
```

Depois:

```text
#33 Production Hardening
→ advanced negotiation/matching
→ CARD/PIX
→ debts/wallet/settlement/payout
→ governance/audit
→ 75+ E2E/full contract certification
→ TOW BACKEND READY FOR INTEGRATION
```

Historical issues #19–#29 are retained as design evidence but are superseded as executable Phase-1 tasks.

## Normative documents

### MVP execution

1. `TOW-MVP-DELIVERY-PLAN.md`
   - current Phase-1 sequencing;
   - six executable deliveries;
   - CASH decision;
   - lean 20-scenario MVP E2E gate;
   - Phase-2 boundary;
   - Workhorse readiness rules.

2. `TOW-TDD-IMPLEMENTATION-PLAN.md`
   - TDD lifecycle;
   - architecture constraints;
   - current MVP task graph and gates.

3. `TOW-TASK-GRAPH.yaml`
   - machine-readable current execution graph.

4. GitHub Epic #10 + Issues #13–#18
   - immediate executable task specifications.

5. GitHub Issue #33
   - deferred production-hardening backlog.

### Domain / business target

6. `TOW-PRICING-CONTRACT.md`
   - pricing autoritativo por rota real;
   - excedente proporcional por metro;
   - `ROUND_HALF_UP` no boundary monetário;
   - `ceil(excess_km)` proibido.

7. `TOW-SERVICE-SPECIFICATION.md`
   - complete long-term functional target.

8. `TOW-BUSINESS-RULE-MATRIX.md`
   - target invariants/test matrix.

9. `TOW-MODULE-CONTRACT.md`
   - canonical module identity and graceful drain.

### Consumer target contract

10. `tow-api-contract.openapi.yaml`
    - canonical long-term OpenAPI 3.1 target.

11. `TOW-API-CONTRACT.md`

12. `TOW-API-CONTRACT-DRAFT4-ADDENDUM.md`

13. `TOW-CONSUMER-FLOW-SPEC.md`

14. `TOW-CONSUMER-FLOW-COVERAGE.md`

15. `TOW-OPENAPI-CONTRACT-DECISIONS.md`

16. `TOW-OPENAPI-CONSISTENCY-REVIEW.md`

17. `TOW-CONSUMER-CONTRACT-SMOKE-RESULT.md`

18. `TOW-CONTRACT-FREEZE-REVIEW.md`

The PR #9 OpenAPI remains a **superset target**. MVP readiness applies only to the subset explicitly implemented by #13–#18.

### Accepted foundation

19. `T00-CURRENT-STATE-AUDIT.md`

20. `T00-TEST-HARNESS.md`

21. `TOW-DOCKER-TEST-STRATEGY.md`

22. `T01-DATABASE-BASELINE-DECISION.md`

23. `database-baseline.md`

24. `database-schema.md`

Current accepted implementation baseline:

```text
main @ f31962fdd0175303646a34c9d170032bc6a06601
schema fingerprint:
0e4e8ed825fb1629a1474f590ae5dc1c779685ecb927acbae038276cdfea4926
```

## Precedence

### Immediate implementation scope

```text
Issue #13–#18
→ TOW-MVP-DELIVERY-PLAN.md
→ TOW-TASK-GRAPH.yaml
→ TOW-TDD-IMPLEMENTATION-PLAN.md
```

### Pricing behavior

```text
TOW-PRICING-CONTRACT
→ TOW-SERVICE-SPECIFICATION
→ TOW-BUSINESS-RULE-MATRIX
```

MVP re-planning does not weaken the pricing rule.

### Consumer transport

```text
tow-api-contract.openapi.yaml = long-term target contract
TOW-MVP-DELIVERY-PLAN.md       = current implemented subset boundary
```

Do not claim a deferred target endpoint is implemented merely because it exists in the frozen OpenAPI.

## Readiness gates

### Mock-first consumer work

```text
TOW MOBILE CONTRACT READY FOR IMPLEMENTATION
```

Already available from PR #9.

### Real MVP backend integration

After MVP-06 accepted:

```text
TOW MVP BACKEND READY FOR INTEGRATION
```

Allows consumers to replace mocks only for the explicitly completed MVP subset.

### Full target integration

After Phase 2/#33:

```text
TOW BACKEND READY FOR INTEGRATION
```

This remains the production-hardening/full-contract milestone.

## Current next task

```text
MVP-06 — CASH Payment & Lean End-to-End Ready Gate
Issue #18
READY
base: MVP05_ACCEPTED_MAIN @ 1d9f04bf26ffb0d51af99d2d59b162712f1ffd45
      (the MVP-05 acceptance bookkeeping commit that carries this line is the
      effective MVP06_EXECUTION_BASE)
branch: feature/mvp-06-cash-readiness
```

#31 remains deferred for dev/test functional work and must be resolved before production security sign-off/go-live.
