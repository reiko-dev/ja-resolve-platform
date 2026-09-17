# Tow OpenAPI — Consistency Review

Status: **pre-merge review**  
Contract: `docs/tow/tow-api-contract.openapi.yaml`  
Reviewed against:
- `TOW-API-CONTRACT.md`
- `TOW-CONSUMER-FLOW-SPEC.md`
- `TOW-SERVICE-SPECIFICATION.md`
- `TOW-MODULE-CONTRACT.md`

## Result

The original draft was structurally useful but **not yet sufficient as a code-generation/mock contract**. The reviewed draft (`1.0.0-draft.2`) closes the main inconsistencies identified below.

## Corrections applied

### 1. Missing endpoints documented in Markdown
Added to OpenAPI:
- `DELETE /api/tow/vehicles/{vehicleId}/documents/{documentId}`
- `GET /api/admin/tow/vehicle-documents/{documentId}`
- `GET /api/admin/tow/disputes/{disputeId}`

### 2. Response bodies were underspecified
The first draft had many `description`-only responses, which prevented useful generated clients/mocks.

Typed response schemas were added for:
- operational state transitions;
- cancellation and financial consequence;
- tracking read/write;
- TowVehicle CRUD;
- vehicle documents;
- customer debts/payment;
- module status/toggle;
- Tow settings;
- admin request/dispute/document lists;
- payout preview/batches;
- audit event list.

### 3. DTO mismatch between Markdown and OpenAPI
Aligned fields present in consumer examples but absent from schemas:
- `TowRequest.matching`;
- `TowProposal.route_quote`;
- `TowProposal.created_at`;
- richer `TowVehicleSummary`;
- explicit terminal reasons and allowed actions.

### 4. Query/filter contract mismatch
Added documented pagination/filter parameters to:
- partner opportunities;
- partner proposals;
- admin vehicle document queue;
- admin requests;
- admin disputes;
- admin audit events.

### 5. Idempotency inconsistency
Added `Idempotency-Key` to mutable operations that the consumer contract treats as retry-sensitive, including:
- destination change;
- tracking point submission;
- vehicle document deletion;
- Tow settings patch.

### 6. OpenAPI 3.1 nullability
Removed the OpenAPI 3.0-style `nullable: true` pattern from the reviewed contract. Nullable fields now use JSON Schema 2020-12/OpenAPI 3.1 forms such as:

```yaml
type: [string, 'null']
```

or explicit `oneOf` with `type: 'null'`.

### 7. Error contract
The canonical stable machine-readable error codes are represented by `ErrorResponse.error.code`, including module-disabled, debt, state, proposal/counteroffer, payment and authorization conflicts.

### 8. Units and primitive consistency
The reviewed contract consistently treats:
- money as integer cents;
- currency as `BRL`;
- route distance as integer meters;
- duration as integer seconds;
- timestamps as ISO-8601 `date-time`.

## Remaining technical blocker found during review

### `TowSettingsPatch` partial-update schema

The current draft models `TowSettingsPatch` through `allOf` with the fully-required `TowSettings` schema. Under JSON Schema/OpenAPI 3.1 semantics, that means a client may be forced to send every required Tow setting, contradicting the documented **partial PATCH** contract.

Before PR #9 leaves Draft this must be corrected so that:
- `PATCH /api/admin/tow/settings` accepts one or more known Tow settings;
- unknown properties remain forbidden;
- validation of cross-field invariants occurs against the resulting complete settings set in the backend;
- generated clients do not consider every field mandatory for PATCH.

This is a **merge blocker for the consumer contract**, not a T00 implementation detail.

## Blocking consistency rule for T00

T00 must validate this file with an OpenAPI 3.1-aware parser/linter and generate an endpoint-by-endpoint current→target map.

A backend implementation must not change a path, enum, field, error code or response shape merely to preserve a legacy endpoint. Any contract change requires:
1. explicit update to the normative docs;
2. OpenAPI update;
3. contract test demonstrating the intended behavior.

## Remaining product-level contract gap to decide before consumer implementation is considered complete

The current contract supports `GET /api/tow/requests/{requestId}`, but does not yet define a canonical **customer request discovery/history endpoint** or a **partner assigned-job/history endpoint**.

This does not block backend T00, but it matters for resilient consumers after logout/login, reinstall, another device, process death or lost local request ID.

Recommended additions before freezing `tow-v1`:

```text
GET /api/tow/requests
  → authenticated customer's Tow requests/current active request

GET /api/tow/partner/jobs
  → assigned/in-flight/history for the authenticated Tow partner
```

Both should support pagination and state/date filters while keeping backend state authoritative.

## Review gate

Before PR #9 leaves Draft:
- [ ] OpenAPI 3.1 parser/linter passes;
- [ ] `TowSettingsPatch` is truly partial for generated clients;
- [ ] every documented consumer endpoint is present in OpenAPI;
- [ ] every operation has a stable `operationId`;
- [ ] success responses used by consumers have typed schemas;
- [ ] mutable retry-sensitive operations declare idempotency behavior;
- [ ] enum/path/error-code names match Markdown contracts;
- [ ] the discovery/history endpoint decision above is resolved;
- [ ] a generated/mock client can represent Cliente, Parceiro and Dashboard flows without hand-written undocumented DTOs.
