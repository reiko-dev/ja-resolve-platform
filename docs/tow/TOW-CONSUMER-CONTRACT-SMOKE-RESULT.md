# JaResolve Tow — Consumer Contract Smoke Result

> Status: **PASS — pre-merge contract smoke**  
> Contract: `tow-api-contract.openapi.yaml` `1.0.0-draft.4`  
> Scope: Mobile Cliente, Mobile Parceiro, Dashboard

## Purpose

This smoke verifies that each consumer can traverse its planned Tow flow using only the canonical OpenAPI contract and shared documented horizontal dependencies, without inventing a Tow endpoint, DTO or local business rule.

The validation generated an operation catalog from the composed OpenAPI paths, resolved all local `$ref`s, generated minimal request/response payloads from schemas and validated the generated payloads against JSON Schema Draft 2020-12.

## Result summary

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

Executed counts:

```text
Cliente
  operations:             18
  request bodies checked:  8
  responses checked:      18

Parceiro
  operations:             29
  request bodies checked: 10
  responses checked:      29

Dashboard
  operations:             20
  request bodies checked:  6
  responses checked:      20
```

## Mobile Cliente smoke

Operation sequence exercised:

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

The contract is sufficient for module availability, session rehydration, request creation, search/negotiation, payment, route rendering, tracking, completion/dispute/review and cancellation-debt repayment.

## Mobile Parceiro smoke

Operation sequence exercised:

```text
getTowModuleStatus
→ getTowPartnerStatus
→ patchTowPartnerStatus
→ updateTowPartnerLocation
→ listTowVehicles
→ createTowVehicle / updateTowVehicle / activateTowVehicle
→ listTowVehicleDocuments / uploadTowVehicleDocument
→ listTowOpportunities
→ createTowProposal
→ listPartnerTowProposals
→ withdrawTowProposal
→ acceptTowCounteroffer / rejectTowCounteroffer
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

The contract is sufficient for operational availability/location, TowVehicle/document management, opportunities/proposals, negotiation, job rehydration, operational transitions, tracking, cash receipt and Tow-specific financial state.

## Dashboard smoke

Operation sequence exercised:

```text
adminGetTowModule
→ adminToggleTowModule
→ adminGetTowSettings
→ adminPatchTowSettings
→ adminListTowVehicleDocuments
→ adminGetTowVehicleDocument
→ adminApproveTowVehicleDocument / adminRejectTowVehicleDocument
→ adminListTowRequests
→ adminGetTowRequest
→ adminOverrideCancelTowRequest / adminOverrideCompleteTowRequest
→ adminListTowDisputes
→ adminGetTowDispute
→ adminResolveTowDispute
→ adminPreviewTowPayoutBatch
→ adminCreateTowPayoutBatch
→ adminGetTowPayoutBatch
→ adminProcessTowPayoutBatch
→ adminListTowAuditEvents
```

Result: **PASS**.

The contract is sufficient for feature-flag control, true-partial settings update, document verification, operational support, disputes, payout and audit flows.

## Pricing boundary

The smoke does not calculate Tow prices locally. This is intentional.

`TOW-PRICING-CONTRACT.md` freezes pricing as a backend responsibility using authoritative route meters and proportional excess-distance pricing. Consumers only receive/display the backend-calculated integer-cent amounts.

## Handoff implication

From a **consumer transport-contract perspective**, the functionality is now mock-implementable without hidden Tow API dependencies.

This does **not** mean the backend implementation is complete. It means Mobile/Dashboard work may be handed off against OpenAPI/mocks while backend T00–T18 runs in parallel.

The remaining prerequisite before formal Mobile implementation handoff is the final cross-document review/freeze and merge of PR #9.