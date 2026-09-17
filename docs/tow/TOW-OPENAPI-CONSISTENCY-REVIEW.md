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

The consumer contract is now at **`1.0.0-draft.4`**.

The functional flow-to-contract review for Mobile Cliente, Mobile Parceiro and Dashboard is complete: every capability described for early consumer implementation now maps to an explicit Tow REST contract or an explicitly shared horizontal contract.

This does **not** yet mean the PR is ready to leave Draft. Structural parser/linter resolution and generated/mock-client smoke tests remain evidence-producing gates.

## Corrections already applied before draft.4

- missing consumer/admin endpoints from the original Markdown contract were added;
- consumer-facing success responses were typed;
- `TowRequest`, `TowProposal`, `TowVehicle`, tracking, debts, payouts and filters were aligned;
- OpenAPI 3.1 nullability syntax was normalized;
- retry-sensitive mutable operations gained `Idempotency-Key` where required;
- stable machine-readable error codes, money-in-cents and distance-in-meters conventions were aligned;
- customer request discovery/history was frozen at `GET /api/tow/requests`;
- partner assigned-job/history recovery was frozen at `GET /api/tow/partner/jobs`;
- `TowSettingsPatch` was corrected to a true partial update.

## Draft.4 corrections from flow-by-flow review

### 1. Authoritative route/geometry for Maps

Added:

```http
GET /api/tow/requests/{requestId}/route
```

The response exposes the authoritative route quote and optional Google-compatible encoded polyline so Cliente/Parceiro can render Maps without recalculating pricing or route authority locally.

### 2. Partner availability and matching location

Added:

```http
GET   /api/tow/partner/status
PATCH /api/tow/partner/status
PUT   /api/tow/partner/location
```

The mobile partner flow can now represent online/available intent, server-calculated operational blockers and current pre-assignment location without relying on undocumented profile behavior.

### 3. Complete opportunity DTO

`GET /api/tow/partner/opportunities` now has a draft.4 typed item that includes:

- request;
- active TowVehicle;
- route quote;
- server-calculated proposed price;
- positive compatibility explanation;
- opportunity expiry.

No matching/pricing decision must be recreated by Mobile Parceiro.

### 4. Tow-specific partner financial UI

Added:

```http
GET /api/tow/partner/financial-summary
```

This exposes wallet availability, pending settlement, cash platform-fee debt, debt limit and block state. Shared wallet history endpoints remain horizontal.

### 5. Dashboard document detail

`GET /api/admin/tow/vehicle-documents/{documentId}` now returns document + TowVehicle + partner summary, which is sufficient to implement the verification UI.

### 6. Dashboard operational request detail

`GET /api/admin/tow/requests/{requestId}` now returns a typed operational aggregate containing request, proposals/counteroffers, route, tracking, payment, financial summary and audit events.

### 7. Dashboard dispute evidence detail

`GET /api/admin/tow/disputes/{disputeId}` now exposes the evidence set required by the consumer flow rather than only the basic `Dispute` row.

### 8. Payout partner-level review/reconciliation

Preview/create/detail/process contracts now expose partner-level payout items including eligible amount, platform-fee debt offset, final payout and item processing status.

### 9. Consumer terminology normalization

The review froze these transport names:

```text
CASH_SELECTED                  payment status
SERVICE_DISABLED               TowRequest terminal reason
service_module_disabled        API error code
pending|approved|rejected|expired document status
```

Money settings use `_cents` at the API boundary.

`idempotency_conflict` and `external_dependency_unavailable` are also part of the stable error-code set consumers must understand.

## Flow coverage evidence

The detailed matrix is versioned in:

```text
TOW-CONSUMER-FLOW-COVERAGE.md
```

It maps each planned Mobile Cliente, Mobile Parceiro and Dashboard capability to a canonical endpoint and marks whether the dependency is Tow-specific or horizontal/shared.

The review found **no remaining functional capability that requires inventing an undocumented Tow endpoint or DTO**.

## Composition note

The canonical draft.4 OpenAPI entrypoint composes unchanged stable Path Items and schemas from:

```text
tow-api-contract.base.openapi.yaml
```

and overrides/adds the contracts required by later review decisions.

OpenAPI tooling used by the project MUST resolve local external `$ref`s. `tow-api-contract.base.openapi.yaml` is not a consumer entrypoint.

## T00 blocking checks

T00 must verify with actual tooling:

- canonical entrypoint parses as OpenAPI 3.1;
- all local external `$ref`s resolve;
- all `operationId`s are unique across the composed contract;
- `listTowRequests` is typed and usable for customer recovery;
- `listPartnerTowJobs` is typed and usable for partner recovery;
- `adminPatchTowSettings` accepts a non-empty subset rather than the full settings object;
- route/status/location/opportunity/financial-summary clients can be generated without handwritten hidden DTOs;
- Dashboard document/request/dispute/payout detail clients can be generated without handwritten hidden DTOs;
- generated/mock clients can execute representative Cliente, Parceiro and Dashboard smoke flows;
- endpoint-by-endpoint `current -> target` mapping is produced.

## Review gate before PR #9 leaves Draft

- [ ] OpenAPI 3.1 parser/linter passes canonical entrypoint + external refs;
- [ ] `operationId` uniqueness check passes;
- [x] customer discovery/history endpoint frozen;
- [x] partner assigned-job/history endpoint frozen;
- [x] `TowSettingsPatch` true-partial semantics frozen;
- [x] route/geometry contract frozen;
- [x] partner status/location contract frozen;
- [x] partner opportunity DTO complete for planned UI;
- [x] partner Tow financial summary contract frozen;
- [x] Dashboard document detail contract complete;
- [x] Dashboard operational request detail contract complete;
- [x] Dashboard dispute evidence contract complete;
- [x] payout partner-level review/reconciliation contract complete;
- [x] full consumer flow × endpoint matrix completed;
- [ ] generated/mock-client smoke test passes for Cliente;
- [ ] generated/mock-client smoke test passes for Parceiro;
- [ ] generated/mock-client smoke test passes for Dashboard;

Only after the unchecked structural/tooling gates have evidence should PR #9 leave Draft.
