# Tow OpenAPI — Consistency Review

> Status: **PASS — contract freeze reviewed**  
> Canonical entrypoint: `docs/tow/tow-api-contract.openapi.yaml`  
> Composition file: `docs/tow/tow-api-contract.base.openapi.yaml`

Reviewed against:

- `TOW-PRICING-CONTRACT.md`
- `TOW-SERVICE-SPECIFICATION.md`
- `TOW-BUSINESS-RULE-MATRIX.md`
- `TOW-MODULE-CONTRACT.md`
- `TOW-API-CONTRACT.md`
- `TOW-API-CONTRACT-DRAFT4-ADDENDUM.md`
- `TOW-CONSUMER-FLOW-SPEC.md`
- `TOW-CONSUMER-FLOW-COVERAGE.md`
- `TOW-OPENAPI-CONTRACT-DECISIONS.md`
- `TOW-CONTRACT-FREEZE-REVIEW.md`

## Structural validation

Executed evidence:

```text
OpenAPI version:                 3.1.0
Contract version:                1.0.0-draft.4
Canonical paths:                 56
Composed operations:             66
$ref occurrences checked:        490
External/local-file $refs:       124
Unresolved refs:                 0
Missing operationId:             0
Duplicate operationId:           0
Path-parameter mismatches:       0
Operations without 2xx:          0
2xx responses without schema:    0
JSON Schema definition errors:   0
TowSettingsPatch errors:         0
```

The validator resolved local refs into `tow-api-contract.base.openapi.yaml` and validated component schemas with JSON Schema Draft 2020-12 semantics.

## Consumer contract smoke

```text
Mobile Cliente
  operations exercised:          18
  request bodies validated:       8
  response bodies validated:     18

Mobile Parceiro
  operations exercised:          29
  request bodies validated:      10
  response bodies validated:     29

Dashboard
  operations exercised:          20
  request bodies validated:       6
  response bodies validated:     20

Missing operation:                0
Schema generation error:          0
Schema validation error:          0
Undocumented Tow DTO required:    0
```

## Frozen corrections represented by the contract set

- customer discovery/rehydration: `GET /api/tow/requests`;
- partner job recovery: `GET /api/tow/partner/jobs`;
- true-partial `PATCH /api/admin/tow/settings`;
- authoritative route/geometry;
- partner operational status/location;
- complete opportunity cards;
- partner Tow financial summary;
- Dashboard document/request/dispute detail;
- partner-level payout detail/reconciliation;
- money in cents;
- distance in meters;
- `CASH_SELECTED` canonical status;
- `SERVICE_DISABLED` terminal reason distinct from `service_module_disabled` error code.

## Pricing relationship

OpenAPI exposes server-calculated prices; consumer never calculates Tow pricing.

`TOW-PRICING-CONTRACT.md` freezes:

```text
Google Routes meters
→ proportional excess-distance charge
→ no ceil(excess_km)
→ ROUND_HALF_UP only at cent boundary
```

No additional transport field is required for client-side pricing logic because such logic is intentionally forbidden.

## Final review checklist

- [x] OpenAPI 3.1 parse passes;
- [x] all local external refs resolve;
- [x] operationIds unique;
- [x] every operation has a typed 2xx contract used by consumers;
- [x] TowSettingsPatch is true partial;
- [x] Cliente smoke passes;
- [x] Parceiro smoke passes;
- [x] Dashboard smoke passes;
- [x] no hidden Tow endpoint/DTO required;
- [x] cross-document freeze review passes;
- [x] pricing terminology normalized in functional contracts;
- [x] consumer mock-first handoff semantics aligned;
- [ ] merge PR #9.

## CI obligation

T00 must reproduce parser/ref/operationId/consumer-smoke validation inside the repository/CI. Pre-merge evidence is the freeze gate, not a substitute for repeatable project automation.