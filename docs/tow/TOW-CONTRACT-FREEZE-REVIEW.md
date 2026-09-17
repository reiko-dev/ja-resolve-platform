# JaResolve Tow — Final Cross-Document Contract Freeze Review

> Status: **PASS — ready to merge contract PR**  
> Scope: domain, module, pricing, OpenAPI, consumer flows, TDD execution graph and final backend gate

## Result

The Tow contract set has been cross-reviewed and normalized for implementation.

No known P0 contract contradiction remains between the authoritative documents required for backend execution or mock-first consumer implementation.

## Frozen decisions

### Module identity

```text
module_key   = tow
service_key  = tow
partner_type = tow
```

### Feature flag

```text
DISABLE = stop new business + drain in-flight work
```

- new requests/matching/proposals/counteroffers/assignments are blocked;
- SEARCHING/NEGOTIATING terminate with `SERVICE_DISABLED`;
- ASSIGNED+ continues to terminal;
- re-enable does not resurrect closed work.

### Pricing

Authoritative source: `TOW-PRICING-CONTRACT.md`.

```text
road distance from Google Routes
provider → pickup + pickup → destination
excess billed proportionally by meter
no ceil(excess_km)
ROUND_HALF_UP only at monetary-cent boundary
```

### Money / distance transport

```text
money    = integer cents
distance = integer meters
```

Canonical money setting names:

```text
tow_platform_fixed_fee_cents
tow_cancellation_fee_cents
tow_max_platform_fee_debt_cents
```

### Cash payment status

```text
CASH_SELECTED
```

`PAYMENT_METHOD_SELECTED` is not a canonical enum.

### Service disabled semantics

```text
TowRequest.terminal_reason = SERVICE_DISABLED
error.code                 = service_module_disabled
```

### Vehicle document states

```text
pending | approved | rejected | expired
```

### Consumer namespace

```text
/api/tow/...
/api/admin/tow/...
```

Legacy `emergency-requests`/`tow-proposals` routes are compatibility-audit inputs for T00, not new consumer dependencies.

## Cross-document corrections completed

The final review removed/normalized the following contradictions:

1. old `ceil(excess_km)` pricing wording in the service specification and business-rule matrix;
2. outdated “kilometre started” billing examples;
3. document state sets that omitted `expired`;
4. cash status prose that used `PAYMENT_METHOD_SELECTED` instead of `CASH_SELECTED`;
5. money settings without explicit cent-based transport names;
6. legacy conceptual API paths inside the functional specification;
7. TDD references to 66 final E2E scenarios — final gate is now **75**;
8. task-graph wording that incorrectly blocked mock-first consumer implementation until T18;
9. module-contract wording that incorrectly implied Dashboard UI could only start after backend completion;
10. T18 pricing test that previously expected `ceil` behavior.

## OpenAPI validation evidence

Pre-merge validation already recorded:

```text
OpenAPI 3.1 parse:            PASS
External/local refs:          PASS
Unresolved refs:              0
Duplicate operationIds:       0
Path parameter mismatches:    0
2xx schema coverage:          PASS
TowSettingsPatch semantics:   PASS
```

See `TOW-OPENAPI-CONSISTENCY-REVIEW.md`.

## Consumer contract smoke evidence

```text
Mobile Cliente:  PASS
Mobile Parceiro: PASS
Dashboard:       PASS

Missing operations:            0
Undocumented Tow DTO required: 0
```

See `TOW-CONSUMER-CONTRACT-SMOKE-RESULT.md` and `TOW-CONSUMER-FLOW-COVERAGE.md`.

## Handoff gates

### After PR #9 merge

Emit:

```text
TOW MOBILE CONTRACT READY FOR IMPLEMENTATION
```

This allows Mobile Cliente, Mobile Parceiro and Dashboard to implement against OpenAPI-generated clients/mocks while backend T00–T18 proceeds.

### After T18

Emit:

```text
TOW BACKEND READY FOR INTEGRATION
```

Only then replace mocks with the real backend and close real integration E2E.

## Backend execution freeze

- T00–T18 remain strict dependency-gated tasks;
- every behavior change follows RED → GREEN → REFACTOR → gate;
- each task has its own PR/receipt;
- T18 has **75 mandatory E2E scenarios**;
- T18 cannot soften readiness criteria.

## Final pre-merge checklist

- [x] pricing contradiction removed;
- [x] module semantics aligned;
- [x] consumer flow terminology aligned;
- [x] task graph aligned with early handoff;
- [x] T18 updated to 75 scenarios;
- [x] OpenAPI structural validation PASS;
- [x] consumer contract smoke PASS;
- [x] no consumer requires hidden Tow endpoint/DTO;
- [x] legacy routes are not canonical consumer dependencies;
- [x] mock-ready and backend-ready gates are explicitly distinct.

## Freeze rule

After merge of PR #9, breaking changes require explicit contract revision, affected tests, dependent-Issue review and consumer communication. Executors must not silently reinterpret the frozen contract to preserve legacy behavior.