# Tow OpenAPI — Consistency Review

Status: **pre-merge review**  
Canonical entrypoint: `docs/tow/tow-api-contract.openapi.yaml`  
Base composition file: `docs/tow/tow-api-contract.base.openapi.yaml`

Reviewed against:
- `TOW-API-CONTRACT.md`
- `TOW-CONSUMER-FLOW-SPEC.md`
- `TOW-SERVICE-SPECIFICATION.md`
- `TOW-MODULE-CONTRACT.md`
- `TOW-OPENAPI-CONTRACT-DECISIONS.md`

## Result

The consumer contract is now at **`1.0.0-draft.3`** and the previously open discovery/PATCH gaps are resolved in the canonical OpenAPI entrypoint.

## Corrections already applied before draft.3

- missing consumer/admin endpoints from the Markdown contract were added;
- consumer-facing success responses were typed;
- `TowRequest`, `TowProposal`, `TowVehicle`, tracking, debts, payouts and filters were aligned;
- OpenAPI 3.1 nullability syntax was normalized;
- retry-sensitive mutable operations gained `Idempotency-Key` where required;
- stable machine-readable error codes, money-in-cents and distance-in-meters conventions were aligned.

## Draft.3 corrections

### 1. Customer discovery / rehydration

Canonical endpoint:

```http
GET /api/tow/requests
```

It returns only requests owned by the authenticated customer and supports:

```text
state
from
to
page
limit
```

The response is a typed paginated `TowRequestListResponse`.

This allows the app to recover authoritative state after logout/login, reinstall, device switch, process death or loss of a local request id.

### 2. Partner job discovery / rehydration

Canonical endpoint:

```http
GET /api/tow/partner/jobs
```

It returns assigned/in-flight/history work for the authenticated `partner_type=tow` and supports the same state/date/pagination filters.

It is intentionally distinct from:

```http
GET /api/tow/partner/opportunities
```

`opportunities` = unassigned business; `jobs` = assigned/historical work.

### 3. True partial Tow settings PATCH

`PATCH /api/admin/tow/settings` now references a dedicated `TowSettingsPatch` schema where:

- all supported properties are optional;
- `additionalProperties: false`;
- `minProperties: 1`;
- omitted settings retain their persisted values;
- the backend validates invariants after merging the patch with the complete current configuration.

The incorrect inheritance from full `TowSettings.required` is no longer part of the canonical contract.

## Composition note

To preserve the already reviewed draft.2 without duplicating thousands of lines, the canonical draft.3 OpenAPI entrypoint composes unchanged Path Items and schemas from:

```text
tow-api-contract.base.openapi.yaml
```

The canonical file overrides only the newly frozen discovery endpoints and corrected settings PATCH contract.

OpenAPI tooling used by the project MUST resolve local external `$ref`s. T00 must lint/parse the canonical entrypoint with an OpenAPI 3.1-aware resolver before backend implementation begins.

## T00 blocking checks

T00 must verify:

- canonical entrypoint parses as OpenAPI 3.1;
- all local external `$ref`s resolve;
- `listTowRequests` is unique and typed;
- `listPartnerTowJobs` is unique and typed;
- `adminPatchTowSettings` accepts a non-empty subset rather than the full object;
- generated/mock client can represent customer rehydration, partner rehydration and Dashboard settings patch without handwritten undocumented DTOs;
- endpoint-by-endpoint `current -> target` mapping is produced.

## Review gate before PR #9 leaves Draft

- [ ] OpenAPI 3.1 parser/linter passes canonical entrypoint + external refs;
- [x] customer discovery/history endpoint frozen;
- [x] partner assigned-job/history endpoint frozen;
- [x] `TowSettingsPatch` true-partial semantics frozen;
- [x] stable operationIds defined for both discovery endpoints;
- [x] typed paginated responses defined;
- [x] state/date/pagination filters defined;
- [ ] generated/mock client smoke test passes;
- [ ] all consumer flows are rechecked against draft.3.
