# Tow OpenAPI — Consistency Review

Status: **pre-merge review**  
Canonical entrypoint: `docs/tow/tow-api-contract.openapi.yaml`  
Base composition file: `docs/tow/tow-api-contract.base.openapi.yaml`

Reviewed against:
- `TOW-API-CONTRACT.md`
- `TOW-API-CONTRACT-DRAFT4-ADDENDUM.md`
- `TOW-CONSUMER-FLOW-SPEC.md`
- `TOW-CONSUMER-FLOW-COVERAGE.md`
- `TOW-SERVICE-SPECIFICATION.md`
- `TOW-MODULE-CONTRACT.md`
- `TOW-OPENAPI-CONTRACT-DECISIONS.md`

## Result

The consumer contract is now at **`1.0.0-draft.4`**. Functional flow coverage for Mobile Cliente, Mobile Parceiro and Dashboard is complete, and a direct technical validation of the composed OpenAPI contract has been executed successfully.

## Structural/technical validation executed

The canonical entrypoint and the local base composition file were parsed as YAML and validated with an OpenAPI-3.1-aware structural/ref check plus JSON Schema 2020-12 schema validation.

Evidence from the executed validation:

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

The validator resolved all local references from `tow-api-contract.openapi.yaml` into `tow-api-contract.base.openapi.yaml`, checked every composed operation, and validated all component schemas against JSON Schema Draft 2020-12 syntax.

## Generated/mock contract smoke executed

A contract-generated operation catalog and synthetic schema-valid request/response fixtures were produced from the composed contract and exercised for the three consumer flows.

Results:

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

Missing operation in smoke flows: 0
Schema generation/validation error: 0
Undocumented Tow DTO required:     0
```

The smoke generation intentionally derives operation/path/schema information from the OpenAPI contract instead of hand-writing consumer-only payloads.

## Corrections already incorporated

### Consumer discovery / rehydration

```http
GET /api/tow/requests
GET /api/tow/partner/jobs
```

Both are typed, filtered/paginated and suitable for session/process/device recovery.

### True partial settings update

```http
PATCH /api/admin/tow/settings
```

uses a dedicated `TowSettingsPatch` with:

- every field optional;
- `minProperties: 1`;
- `additionalProperties: false`;
- merge-then-validate semantics on the backend.

### Complete consumer flow coverage

Draft.4 adds/finalizes the contracts needed for:

- authoritative Tow route/geometry;
- partner operational state and pre-assignment location;
- complete opportunity cards;
- partner Tow financial summary;
- Dashboard document/request/dispute detail;
- partner-level payout preview/batch/reconciliation.

See `TOW-CONSUMER-FLOW-COVERAGE.md` for the complete flow × endpoint matrix.

## Pricing clarification

Pricing semantics are now frozen separately in `TOW-PRICING-CONTRACT.md`.

The old `ceil(excess_km)` / "quilômetro iniciado" wording is superseded. Route distance is consumed in meters and excess distance is charged proportionally; only the final monetary amount is rounded to cents with `ROUND_HALF_UP` semantics.

This does not require a new consumer calculation: the OpenAPI continues to expose server-calculated integer-cent prices.

## Remaining pre-merge checks

The following remain part of the final PR review rather than unresolved transport-contract gaps:

- [x] OpenAPI 3.1 YAML parse passes;
- [x] all local external `$ref`s resolve;
- [x] all composed operations have unique `operationId`s;
- [x] every operation has a 2xx response;
- [x] consumer-used success responses are typed;
- [x] `TowSettingsPatch` true-partial semantics validated;
- [x] Mobile Cliente contract smoke passes;
- [x] Mobile Parceiro contract smoke passes;
- [x] Dashboard contract smoke passes;
- [x] no undocumented Tow endpoint/DTO is required by those smoke flows;
- [ ] final PR #9 cross-document review/freeze;
- [ ] merge PR #9 before backend T00 implementation starts.

T00 must retain/reproduce these checks inside the project harness so contract validation becomes repeatable in the repository/CI rather than relying only on the pre-merge review evidence.