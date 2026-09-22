# JaResolve Tow — Consumer Contract Smoke Result

> **SUPERSEDED / HISTORICAL — NOT CONTRACT AUTHORITY.** This document predates the
> current contract and was written against `1.0.0-draft.4`; any counts below are
> historical. Canonical contract: `docs/tow/tow-api-contract.openapi.yaml`
> (`1.0.0-draft.11`, backend pinned at `8f6f622f`). Consumer integration handoff:
> `docs/evidence/mvp-06/31-integration-handoff.md`.

> Status: **PASS — freeze-complete, pending contract PR merge**  
> Contract: `tow-api-contract.openapi.yaml` `1.0.0-draft.4`  
> Scope: Mobile Cliente, Mobile Parceiro, Dashboard

## Purpose

This smoke proves that each consumer can traverse its planned Tow flow using only the canonical OpenAPI contract plus documented shared horizontal dependencies, without inventing a Tow endpoint, DTO or local business rule.

The validation generated an operation catalog from the composed OpenAPI paths, resolved local refs, generated minimal schema-valid request/response fixtures and validated them with JSON Schema Draft 2020-12.

## Result

```text
Mobile Cliente:  PASS
Mobile Parceiro: PASS
Dashboard:       PASS

Missing operations:              0
Unresolved refs used by flows:   0
Schema generation errors:        0
Schema validation errors:        0
Undocumented Tow DTO required:   0
```

Executed:

```text
Cliente
  operations:              18
  request bodies checked:   8
  responses checked:       18

Parceiro
  operations:              29
  request bodies checked:  10
  responses checked:       29

Dashboard
  operations:              20
  request bodies checked:   6
  responses checked:       20
```

## Mobile Cliente flow exercised

```text
getTowModuleStatus
→ listTowRequests
→ createTowRequest
→ getTowRequest
→ changeTowDestination
→ listTowRequestProposals
→ acceptTowProposal / createTowCounteroffer
→ selectTowPaymentMethod
→ getTowPaymentSummary
→ getTowRequestRoute
→ getTowTracking
→ cancelTowRequestByCustomer
→ confirmTowCompletion
→ createTowDispute
→ createTowReview
→ listTowCustomerDebts
→ payTowCustomerDebt
```

Result: **PASS**.

## Mobile Parceiro flow exercised

```text
getTowModuleStatus
→ getTowPartnerStatus
→ patchTowPartnerStatus
→ updateTowPartnerLocation
→ list/create/update/activate TowVehicle
→ list/upload TowVehicle documents
→ listTowOpportunities
→ createTowProposal
→ listPartnerTowProposals
→ withdrawTowProposal
→ accept/rejectTowCounteroffer
→ listPartnerTowJobs
→ getTowRequest
→ getTowRequestRoute
→ getTowPaymentSummary
→ startTowEnRoute
→ markTowArrived
→ startTowInTransit
→ finishTowService
→ postTowTrackingPoint
→ markTowCashReceived
→ cancelTowRequestByPartner
→ reportTowCustomerNoShow
→ getTowPartnerFinancialSummary
```

Result: **PASS**.

## Dashboard flow exercised

```text
adminGetTowModule
→ adminToggleTowModule
→ adminGetTowSettings
→ adminPatchTowSettings
→ adminList/Get/Approve/RejectTowVehicleDocument
→ adminList/GetTowRequest
→ adminOverrideCancel/CompleteTowRequest
→ adminList/Get/ResolveTowDispute
→ adminPreview/Create/Get/ProcessTowPayoutBatch
→ adminListTowAuditEvents
```

Result: **PASS**.

## Pricing boundary

The smoke intentionally does not calculate Tow price in consumers.

Frozen rule:

```text
route meters from backend
→ server proportional pricing
→ integer-cent price returned
```

Consumers display the returned value and never use `ceil`, local Google distance or local tariff arithmetic to derive authoritative price.

## Handoff result

Final cross-document freeze review is complete and PASS (`TOW-CONTRACT-FREEZE-REVIEW.md`).

The only remaining prerequisite for the formal mock-first consumer implementation handoff is:

```text
merge PR #9
```

After merge, the contract may emit:

```text
TOW MOBILE CONTRACT READY FOR IMPLEMENTATION
```

This does not imply backend implementation completion; real backend integration remains gated by T18 and `TOW BACKEND READY FOR INTEGRATION`.