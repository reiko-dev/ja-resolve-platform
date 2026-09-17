# Tow OpenAPI — Contract Decisions

Status: **normative pre-merge decisions**

## 1. Consumer discovery / rehydration

To guarantee recovery after logout/login, reinstall, process death, device switch or loss of the local request ID, Tow consumers MUST be able to rediscover authoritative work through REST.

### Customer

Canonical endpoint:

```http
GET /api/tow/requests
```

Auth: authenticated customer.

Supported query parameters:

```text
state        optional TowRequestState
from         optional ISO-8601 date-time
 to          optional ISO-8601 date-time
page         optional integer >= 1
limit        optional integer, bounded by backend
```

Semantics:
- returns only requests owned by the authenticated customer;
- sorted newest-first unless an explicit future contract supersedes it;
- supports finding an active request without the consumer knowing its id;
- consumers SHOULD use the collection endpoint on app/session rehydration, then fetch `GET /api/tow/requests/{requestId}` for the authoritative aggregate snapshot;
- REST remains the recovery source of truth even when realtime events are enabled.

### Partner

Canonical endpoint:

```http
GET /api/tow/partner/jobs
```

Auth: authenticated `partner_type=tow`.

Supported query parameters:

```text
state        optional TowRequestState
from         optional ISO-8601 date-time
 to          optional ISO-8601 date-time
page         optional integer >= 1
limit        optional integer, bounded by backend
```

Semantics:
- returns Tow requests assigned to that partner, including current in-flight work and history;
- used to restore an ASSIGNED/EN_ROUTE/ARRIVED/IN_TRANSIT/COMPLETION_PENDING job after process/session loss;
- does not replace `/api/tow/partner/opportunities`; opportunities are unassigned business, jobs are assigned/historical work;
- REST remains authoritative.

## 2. Tow settings PATCH semantics

Canonical endpoint:

```http
PATCH /api/admin/tow/settings
```

This is a **true partial update**.

Contract rules:
- request body MAY contain any non-empty subset of supported Tow settings;
- omitted properties retain their existing persisted values;
- backend MUST merge the patch with current settings and validate invariants on the resulting complete configuration;
- request with zero supported properties is invalid;
- unknown properties are rejected;
- the PATCH input schema MUST NOT inherit `required` fields from the full `TowSettings` response schema.

The previous `allOf: TowSettings + object` form is prohibited because `TowSettings` requires the complete object and would make generated clients treat PATCH as a full replacement.

## 3. OpenAPI requirements resulting from these decisions

Before PR #9 leaves Draft, `tow-api-contract.openapi.yaml` must contain:

- `GET /tow/requests` with customer ownership semantics, filters, pagination and a typed paginated response;
- `GET /tow/partner/jobs` with partner ownership semantics, filters, pagination and a typed paginated response;
- a dedicated `TowSettingsPatch` schema where every setting property is optional, `additionalProperties: false`, and `minProperties: 1`;
- stable `operationId`s for both discovery endpoints;
- reusable pagination/date/state parameters where appropriate;
- typed success responses suitable for generated clients/mock servers.

Any later breaking change requires an explicit contract revision and contract tests.