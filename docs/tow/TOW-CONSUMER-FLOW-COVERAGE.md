# JaResolve Tow — Consumer Flow × API Coverage

> **SUPERSEDED / HISTORICAL — NOT CONTRACT AUTHORITY.** This document predates the
> current contract and was written against `1.0.0-draft.4`; any counts below are
> historical. Canonical contract: `docs/tow/tow-api-contract.openapi.yaml`
> (`1.0.0-draft.11`, backend pinned at `8f6f622f`). Consumer integration handoff:
> `docs/evidence/mvp-06/31-integration-handoff.md`.

> Status: **pre-merge normative coverage review — functional/transport smoke PASS**  
> Canonical API: `tow-api-contract.openapi.yaml` `1.0.0-draft.4`  
> Scope: Mobile Cliente, Mobile Parceiro, Dashboard

## Result

All consumer flows described by the Tow contract have an explicit REST contract or an explicitly shared horizontal dependency. No Mobile/Dashboard implementation should need to invent a Tow endpoint, private DTO, direct database read or local business-rule fallback.

The technical composed-contract validation and generated/mock smoke have also passed. See `TOW-OPENAPI-CONSISTENCY-REVIEW.md` and `TOW-CONSUMER-CONTRACT-SMOKE-RESULT.md` for execution evidence.

## Coverage matrix

| Consumer flow | Canonical contract | Coverage | Notes |
|---|---|---:|---|
| Module availability | `GET /api/tow/module-status` | COVERED | Public/auth-safe availability; backend remains authoritative. |
| Customer request creation | `POST /api/tow/requests` | COVERED | Idempotent; service/debt guards enforced server-side. |
| Customer session rehydration/history | `GET /api/tow/requests` | COVERED | `state`, `from`, `to`, `page`, `limit`. |
| Customer authoritative request snapshot | `GET /api/tow/requests/:requestId` | COVERED | Source of truth after realtime invalidation. |
| Destination change | `PATCH /api/tow/requests/:requestId/destination` | COVERED | Pre-assignment only; backend invalidates affected negotiation/quote. |
| Customer proposal list | `GET /api/tow/requests/:requestId/proposals` | COVERED | Typed proposal/counteroffer objects. |
| Accept proposal | `POST /api/tow/proposals/:proposalId/accept` | COVERED | Atomic assignment. |
| Create counteroffer | `POST /api/tow/proposals/:proposalId/counteroffer` | COVERED | Exactly one according to domain rule. |
| Payment selection/change | `PUT /api/tow/requests/:requestId/payment-method` | COVERED | CARD/PIX/CASH. |
| Payment readiness | `GET /api/tow/requests/:requestId/payment` | COVERED | Partner receives sanitized readiness. |
| Customer cancellation | `POST /api/tow/requests/:requestId/cancel` | COVERED | Typed financial consequence. |
| Route/Google Maps rendering | `GET /api/tow/requests/:requestId/route` | COVERED | Route quote + optional encoded polyline; pricing is never recalculated client-side. |
| Live tracking read | `GET /api/tow/requests/:requestId/tracking` | COVERED | REST recovery source of truth. |
| Completion confirmation | `POST /api/tow/requests/:requestId/completion/confirm` | COVERED | `COMPLETION_PENDING -> COMPLETED`. |
| Customer dispute | `POST /api/tow/requests/:requestId/disputes` | COVERED | Opens dispute; payout subsequently blocked by backend policy. |
| Review | `POST /api/tow/requests/:requestId/review` | COVERED | Completed-only domain guard. |
| Customer debt list | `GET /api/tow/customer/debts` | COVERED | Supports cancellation-debt screen. |
| Customer debt payment | `POST /api/tow/customer/debts/:debtId/pay` | COVERED | CARD/PIX only. |
| Partner operational status | `GET /api/tow/partner/status` | COVERED | Exposes server-calculated blockers. |
| Partner online/available toggle | `PATCH /api/tow/partner/status` | COVERED | UI intent only; operational eligibility stays server-side. |
| Partner pre-assignment location | `PUT /api/tow/partner/location` | COVERED | Supplies matching location before request tracking exists. |
| Partner TowVehicle list/create/edit/delete | `/api/tow/vehicles...` | COVERED | Own vehicles only. |
| Partner TowVehicle activation | `POST /api/tow/vehicles/:vehicleId/activate` | COVERED | Exactly one active vehicle, atomically. |
| Vehicle document upload/list/delete | `/api/tow/vehicles/:vehicleId/documents...` | COVERED | JPEG/PNG/PDF transport contract; lifecycle controlled by backend. |
| Partner opportunity list | `GET /api/tow/partner/opportunities` | COVERED | Active truck, route quote, server price, compatibility explanation and expiry are typed. |
| Send server-priced proposal | `POST /api/tow/requests/:requestId/proposals` | COVERED | No arbitrary partner price field. |
| Partner proposals | `GET /api/tow/partner/proposals` | COVERED | Status/pagination contract. |
| Withdraw proposal | `POST /api/tow/proposals/:proposalId/withdraw` | COVERED | Domain state guards. |
| Counteroffer accept/reject | `/api/tow/counteroffers/:id/accept|reject` | COVERED | No second bargaining round. |
| Partner assigned job rehydration/history | `GET /api/tow/partner/jobs` | COVERED | Distinct from unassigned opportunities. |
| EN_ROUTE | `POST /api/tow/requests/:id/en-route` | COVERED | Payment readiness enforced by backend. |
| ARRIVED | `POST /api/tow/requests/:id/arrived` | COVERED | Location evidence typed. |
| IN_TRANSIT | `POST /api/tow/requests/:id/in-transit` | COVERED | State transition. |
| FINISH | `POST /api/tow/requests/:id/finish` | COVERED | Location evidence; enters completion pending. |
| Partner service tracking write | `POST /api/tow/requests/:id/tracking` | COVERED | Retry-safe contract. |
| Mark CASH received | `POST /api/tow/requests/:id/cash-received` | COVERED | Does not create electronic service earning. |
| Partner cancellation | `POST /api/tow/requests/:id/cancel-partner` | COVERED | Customer not charged. |
| Customer no-show | `POST /api/tow/requests/:id/customer-no-show` | COVERED | Timeout guard server-side. |
| Partner Tow financial status | `GET /api/tow/partner/financial-summary` | COVERED | Wallet/pending settlement/platform-fee debt/block state. |
| Generic wallet history | shared `GET /api/wallets`, `/transactions` | COVERED-SHARED | Horizontal existing contract; not duplicated in Tow. |
| Dashboard module get/toggle | `GET/PATCH /api/admin/tow/module` | COVERED | Disable uses graceful drain semantics. |
| Dashboard Tow settings | `GET/PATCH /api/admin/tow/settings` | COVERED | PATCH is true partial update. |
| Document verification queue | `GET /api/admin/tow/vehicle-documents` | COVERED | Filter/pagination. |
| Document verification detail | `GET /api/admin/tow/vehicle-documents/:documentId` | COVERED | Document + TowVehicle + partner. |
| Document approve/reject | `/approve`, `/reject` | COVERED | Reject reason explicit. |
| Dashboard request monitoring | `GET /api/admin/tow/requests` | COVERED | State/partner/customer/payment/date filters. |
| Dashboard request detail/timeline | `GET /api/admin/tow/requests/:requestId` | COVERED | Operational + negotiation + route + tracking + payment + financial + audit. |
| Admin override cancel/complete | `/override-cancel`, `/override-complete` | COVERED | Reason required and audited. |
| Dashboard dispute queue | `GET /api/admin/tow/disputes` | COVERED | Typed filters. |
| Dashboard dispute evidence detail | `GET /api/admin/tow/disputes/:disputeId` | COVERED | Complete evidence aggregate. |
| Dashboard dispute resolve | `POST /api/admin/tow/disputes/:disputeId/resolve` | COVERED | Explicit command, never direct DB mutation. |
| Payout preview | `GET /api/admin/tow/payout-batches/preview` | COVERED | Partner-level eligible/debt-offset/payout line items. |
| Create payout batch | `POST /api/admin/tow/payout-batches` | COVERED | Frozen batch with line items. |
| Payout batch detail | `GET /api/admin/tow/payout-batches/:batchId` | COVERED | Item-level reconciliation. |
| Process payout batch | `POST /api/admin/tow/payout-batches/:batchId/process` | COVERED | Idempotent processing/reconciliation result. |
| Audit search | `GET /api/admin/tow/audit-events` | COVERED | Request/partner/customer/module actor/date filters. |
| Realtime update acceleration | Socket/Push event contract in Markdown | COVERED-NON-REST | REST remains rehydration/source of truth. |

## Normalizations discovered during review

### CASH

Canonical API payment status after selecting cash:

```text
CASH_SELECTED
```

`PAYMENT_METHOD_SELECTED` is descriptive prose only and is not a domain/API enum.

### Module disabled

Two distinct contracts exist:

```text
TowRequest.terminal_reason = SERVICE_DISABLED
```

versus a rejected API operation:

```text
error.code = service_module_disabled
```

Consumers must not conflate the two.

### Vehicle document status

Canonical set:

```text
pending
approved
rejected
expired
```

### Money settings

Canonical transport names are:

```text
tow_platform_fixed_fee_cents
tow_cancellation_fee_cents
tow_max_platform_fee_debt_cents
```

Money is always integer cents at the API boundary.

### Pricing

Canonical pricing semantics are defined by `TOW-PRICING-CONTRACT.md`:

```text
route meters
→ proportional excess distance charge
→ ROUND_HALF_UP only at final monetary-cent boundary
```

Consumers never implement this calculation locally.

### Stable error codes

Consumers must also handle:

```text
idempotency_conflict
external_dependency_unavailable
```

in addition to the flow-specific codes already listed in `TOW-CONSUMER-FLOW-SPEC.md`.

## Clean consumer boundary

The review found no justification for any consumer to implement these rules locally:

- Tow module availability policy;
- provider eligibility;
- matching radius;
- vehicle compatibility;
- pricing;
- proposal/counteroffer actionability;
- state transition validity;
- payment readiness;
- cancellation fees;
- customer or partner debt calculations;
- payout eligibility;
- dispute financial effects.

The API exposes state, `allowed_actions`, typed summaries and machine-readable errors. Consumers render/submit intent; the backend decides.

## Technical validation status

- [x] parse `tow-api-contract.openapi.yaml` as OpenAPI 3.1/YAML;
- [x] resolve every local external `$ref` to `tow-api-contract.base.openapi.yaml`;
- [x] verify `operationId` uniqueness across the composed contract;
- [x] validate component schemas as JSON Schema Draft 2020-12;
- [x] generated/mock-client contract smoke for Cliente passes;
- [x] generated/mock-client contract smoke for Parceiro passes;
- [x] generated/mock-client contract smoke for Dashboard passes;
- [x] no undocumented Tow DTO/endpoint is needed by the three smoke flows.

These checks must be reproduced by T00 in repository/CI tooling so they remain enforceable after merge.