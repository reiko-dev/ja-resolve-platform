# JaResolve Tow — Consumer API Contract Draft.4 Addendum

> ## SUPERSEDED — HISTORICAL DOCUMENT (not the normative contract)
>
> The current contract is `docs/tow/tow-api-contract.openapi.yaml` version
> `1.0.0-draft.11` (integration handoff:
> `docs/evidence/mvp-06/31-integration-handoff.md`).
>
> Corrections against the implemented runtime (backend `a7d7cd17`):
>
> - `GET /api/tow/requests/:requestId/route` authorizes the **owner customer or
>   the assigned Tow partner only** (`requireCustomerOrTowPartner`,
>   `src/modules/tow/http/routes.js:123`); an admin context is not an
>   authorization principal on this route.
> - The runtime **never** emits `route_quote.provider_to_pickup`: the route
>   read is the request's own pickup -> destination leg, recomputed on read
>   (`src/modules/tow/application/route-service.js:27-36`). There is no
>   post-assignment truck/partner leg in the response.

> Status: **HISTORICAL — superseded by `1.0.0-draft.11`**  
> Applies to: `tow-api-contract.openapi.yaml` version `1.0.0-draft.4` (historical)  
> Purpose: freeze the remaining transport contracts required by Mobile Cliente, Mobile Parceiro and Dashboard.

This addendum supplements `TOW-API-CONTRACT.md`. Where this addendum is more specific about the endpoints below, it is authoritative together with the canonical OpenAPI entrypoint. It is retained as a historical record only; for current behavior use `1.0.0-draft.11` and the runtime.

## 1. Customer route visualization

### GET `/api/tow/requests/:requestId/route`

Auth: owner customer or assigned Tow partner only.

Returns the authoritative route snapshot used by the service:

```json
{
  "success": true,
  "data": {
    "request_id": "tow_req_123",
    "pickup": {},
    "destination": {},
    "route_quote": {
      "provider_to_pickup": {
        "distance_meters": 6300,
        "duration_seconds": 720
      },
      "pickup_to_destination": {
        "distance_meters": 8050,
        "duration_seconds": 900
      },
      "total_distance_meters": 14350,
      "total_duration_seconds": 1620
    },
    "encoded_polyline": "optional-google-compatible-polyline",
    "generated_at": "2026-09-17T20:00:00.000Z"
  }
}
```

The app may render Google Maps from this data. It must not recalculate authoritative Tow pricing from a client-side route.

The runtime never emits `provider_to_pickup`: the route snapshot is always the request's own pickup -> destination leg, recomputed on read (`src/modules/tow/application/route-service.js:27-36`). There is no post-assignment truck/partner leg in the response.

## 2. Tow partner operational state

Matching requires authoritative partner operational state and a recent location before assignment. This must not be an undocumented mobile-only convention.

### GET `/api/tow/partner/status`

Returns:

- `module_enabled`;
- `online`;
- `available`;
- `operational`;
- active TowVehicle summary;
- latest pre-assignment location;
- machine-readable `blocking_reasons`.

Typical blockers include:

```text
MODULE_DISABLED
PARTNER_NOT_APPROVED
PARTNER_OFFLINE
PARTNER_UNAVAILABLE
NO_ACTIVE_TOW_VEHICLE
TOW_VEHICLE_DOCUMENT_NOT_APPROVED
TOW_VEHICLE_DOCUMENT_EXPIRED
PLATFORM_FEE_DEBT_LIMIT
ACTIVE_SERVICE
```

### PATCH `/api/tow/partner/status`

Auth: `partner_type=tow`.

Headers:

```http
Idempotency-Key: <uuid>
```

True partial body:

```json
{
  "online": true,
  "available": true
}
```

The backend remains authoritative. A requested `available=true` may still result in `operational=false` because of a blocker.

### PUT `/api/tow/partner/location`

Stores the latest pre-assignment provider location used by matching:

```json
{
  "latitude": -9.97,
  "longitude": -67.80,
  "recorded_at": "2026-09-17T20:00:00.000Z"
}
```

After assignment, service tracking continues through the existing request tracking endpoint.

## 3. Partner opportunity completeness

### GET `/api/tow/partner/opportunities`

Each returned opportunity must be sufficient to render the opportunity card without locally reproducing compatibility/pricing rules.

Each item includes:

- request/customer vehicle summary;
- active TowVehicle used for the quote;
- Google Routes-derived `route_quote`;
- server-calculated `proposed_price`;
- explicit positive compatibility result;
- `opportunity_expires_at`.

Only eligible opportunities are returned. The positive compatibility object is explanatory UI data, not permission for the client to perform matching itself.

## 4. Partner Tow financial summary

### GET `/api/tow/partner/financial-summary`

Provides the Tow-specific values required by the partner UI:

```json
{
  "success": true,
  "data": {
    "currency": "BRL",
    "wallet_available_cents": 120000,
    "pending_settlement_cents": 35000,
    "platform_fee_debt_cents": 2000,
    "platform_fee_debt_limit_cents": 10000,
    "blocked_by_debt": false
  }
}
```

Shared wallet endpoints may still be used for generic transaction history. This endpoint exists so the Tow UI does not infer the module-specific cash platform-fee debt policy from generic wallet data.

## 5. Dashboard document verification detail

### GET `/api/admin/tow/vehicle-documents/:documentId`

The Dashboard requires, in one typed contract:

- document metadata and secure file reference;
- TowVehicle detail;
- owning partner summary.

This is the detail contract used before approve/reject.

## 6. Dashboard operational request detail

### GET `/api/admin/tow/requests/:requestId`

The Dashboard detail response is richer than the consumer `TowRequest` aggregate. It includes:

- authoritative request;
- all proposal/counteroffer history embedded through proposal objects;
- authoritative route snapshot;
- tracking history;
- payment summary;
- financial consequence/settlement summary;
- audit events.

This is required for operational support, cancellation/no-show investigation and admin override review.

## 7. Dashboard dispute detail

### GET `/api/admin/tow/disputes/:disputeId`

The dispute detail must provide the evidence needed by the flow specification without requiring undocumented DB access:

- dispute;
- request;
- proposals/counteroffers;
- route snapshot;
- tracking history;
- payment;
- customer debt records;
- financial summary;
- audit events.

Dispute resolution remains a separate explicit command endpoint.

## 8. Payout review and reconciliation

The Dashboard payout flow requires partner-level line items, not only aggregate totals.

### GET `/api/admin/tow/payout-batches/preview`

Returns:

- total partner count;
- total amount;
- item per partner with eligible amount, cash platform-fee debt offset and final payout amount.

### POST `/api/admin/tow/payout-batches`

Creates the frozen batch and returns the same partner-level item structure.

### GET `/api/admin/tow/payout-batches/:batchId`

Returns batch status and item-level reconciliation.

### POST `/api/admin/tow/payout-batches/:batchId/process`

Returns the post-processing item-level result. Retry must remain idempotent.

## 9. Terminology normalization for consumer implementations

The following names are canonical:

```text
CASH payment readiness status: CASH_SELECTED
Tow disabled terminal reason: SERVICE_DISABLED
Tow disabled API error code: service_module_disabled
Vehicle document states: pending | approved | rejected | expired
```

Tow monetary settings exposed through API use integer-cent names:

```text
tow_platform_fixed_fee_cents
tow_cancellation_fee_cents
tow_max_platform_fee_debt_cents
```

Percent settings remain numeric percentages.

Stable error-code support also includes:

```text
idempotency_conflict
external_dependency_unavailable
```

## 10. Contract rule

Consumer implementations must not invent an endpoint, hidden DTO, local matching rule, local pricing rule or direct database dependency to fill a missing contract.

If a required consumer capability is not representable by `tow-api-contract.openapi.yaml` plus the normative Tow documents, implementation must stop and the contract must be revised first.
