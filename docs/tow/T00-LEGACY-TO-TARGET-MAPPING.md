# T00 — Legacy → Tow v1 Migration & Ownership Map

> Status: **COMPLETE — mapping artifact, no behavior changed**
> Issue: #11 · Task: T00 · Execution base: `e1e7dd2d20d5da25df00d8106a904f14041654a1`
> Companion: `docs/tow/T00-CURRENT-STATE-AUDIT.md` · Evidence: `docs/evidence/t00/`
> Contract: `docs/tow/tow-api-contract.openapi.yaml` (66 composed operations)

Purpose: give every T01–T18 task a single row per legacy artifact telling it what to keep, adapt,
replace or deprecate, whether the change breaks existing consumers, and where the evidence lives.

**Status** = `KEEP` · `ADAPT` · `REPLACE` · `DEPRECATE` · `MISSING`
**Breaking?** = does the Tow v1 target break the legacy consumer contract? (`yes` / `no` / `n/a`)
**Owning task** = the task in `TOW-TASK-GRAPH.yaml` that must act on the row.

## A. HTTP endpoints — legacy `/api/emergency-requests`

| Current | Target Tow v1 | Status | Action | Breaking? | Owning task | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `POST /api/emergency-requests` | `createTowRequest` `POST /tow/requests` | REPLACE | New `CreateTowRequestInput` (`pickup`/`destination`/`vehicle`/`problem_description`), server pricing snapshot, `Idempotency-Key`, `service_module_disabled` gate | yes | T02, T03, T05, T07 | `validation.js:302-357`; `emergencyRequestController.js:65-84`; `EmergencyRequest.js:747-771` |
| `GET /api/emergency-requests` (admin) | `adminListTowRequests` `GET /admin/tow/requests` | REPLACE | Admin filters + `PaginationMeta`; keep legacy route until consumers migrate | yes | T17 | `emergencyRequestController.js:767-782` |
| `GET /api/emergency-requests/user` | `listTowRequests` `GET /tow/requests` | REPLACE | `state`/`from`/`to`/`page`/`limit`, `TowRequestListResponse` | yes | T10 | `emergencyRequestController.js:127-144` |
| `GET /api/emergency-requests/partner` | `listPartnerTowJobs` `GET /tow/partner/jobs` | REPLACE | State names + `allowed_actions`; assignment-scoped | yes | T09, T10 | `emergencyRequestController.js:152-179` |
| `GET /api/emergency-requests/nearby` | `listTowOpportunities` `GET /tow/partner/opportunities` | REPLACE | `TowOpportunity` DTO, progressive radius, meters | yes | T06 | `emergencyRequestController.js:186-199`; `EmergencyRequest.js:1020-1041` |
| `GET /api/emergency-requests/stats` (admin) | `getTowPartnerFinancialSummary` + admin views | REPLACE | Split admin stats from partner financial summary | yes | T16, T17 | `emergencyRequestController.js:789-798` |
| `GET /api/emergency-requests/:id` | `getTowRequest` `GET /tow/requests/{requestId}` | REPLACE | `TowRequest` DTO (`state`, `terminal_reason`, `allowed_actions`, `assignment`, `route_quote`) | yes | T10 | `emergencyRequestController.js:94-116` |
| `GET /api/emergency-requests/:id/proposals` | `listTowRequestProposals` `GET /tow/requests/{requestId}/proposals` | ADAPT | Keep owner/admin visibility; expose all proposal statuses | yes | T07 | `emergencyRequestController.js:274-290` |
| `POST /api/emergency-requests/:id/accept-proposal` | `acceptTowProposal` `POST /tow/proposals/{proposalId}/accept` | REPLACE | Proposal-addressed; atomic assignment; `request_already_assigned` | yes | T09 | `emergencyRequestController.js:301-320`; `EmergencyRequest.js:836-915` |
| `POST /api/emergency-requests/:id/accept` | — (mechanic direct accept) | DEPRECATE | Mechanic-only; no Tow v1 equivalent; keep for mechanic flow, do not port | n/a | — (out of Tow scope) | `emergencyRequestController.js:210-264`; `EmergencyRequest.js:529-545` |
| `POST /api/emergency-requests/:id/start` | `startTowEnRoute` + `markTowArrived` + `startTowInTransit` | REPLACE | One legacy state becomes three; `invalid_tow_transition` | yes | T10 | `emergencyRequestController.js:330-396`; `EmergencyRequest.js:548-563` |
| `POST /api/emergency-requests/:id/complete` | `finishTowService` + `confirmTowCompletion` | REPLACE | Split finish/confirm; `payment_not_ready`; `amount_cents` | yes | T10, T12 | `emergencyRequestController.js:411-515`; `EmergencyRequest.js:566-589` |
| `POST /api/emergency-requests/:id/cancel` | `cancelTowRequestByCustomer` `POST /tow/requests/{id}/cancel` | REPLACE | `TerminalReason`, cancellation policy, fee in cents | yes | T11 | `emergencyRequestController.js:583-669`; `EmergencyRequest.js:1127-1160` |
| `POST /api/emergency-requests/:id/rate` | `createTowReview` `POST /tow/requests/{id}/review` | REPLACE | Tow-scoped review DTO; keep legacy rating for mechanic | yes | T17 | `emergencyRequestController.js:525-572`; `EmergencyRequest.js:607-631` |
| `GET /api/emergency-requests/:id/payment-summary` | `getTowPaymentSummary` `GET /tow/requests/{id}/payment` | REPLACE | `Money.amount_cents`, canonical `PaymentStatus` | yes | T12 | `emergencyRequestController.js:727-751`; `EmergencyRequest.js:773-802` |
| `POST /api/emergency-requests/:id/payment` | `selectTowPaymentMethod` `PUT /tow/requests/{id}/payment-method` | REPLACE | Enum-validated `card\|pix\|cash`; `payment_method_not_changeable` | yes | T12, T13, T14, T15 | `emergencyRequestController.js:679-717` |
| — | `changeTowDestination` `PATCH /tow/requests/{id}/destination` | MISSING | New capability; re-quote route/pricing | n/a | T05, T06 | contract op 41; probe 404 |
| — | `cancelTowRequestByPartner` `POST /tow/requests/{id}/cancel-partner` | MISSING | Partner-side cancellation + `PARTNER_CANCELLED` | n/a | T11 | contract op 40 |
| — | `reportTowCustomerNoShow` `POST /tow/requests/{id}/customer-no-show` | MISSING | `customer_no_show_not_allowed_yet` gate | n/a | T11 | contract op 43 |
| — | `markTowCashReceived` `POST /tow/requests/{id}/cash-received` | MISSING | Cash flow + debt creation | n/a | T15 | contract op 42 |
| — | `getTowTracking` / `postTowTrackingPoint` | MISSING | Tracking DTO; socket stays complementary | n/a | T10 | contract ops 54-55 |
| — | `getTowRequestRoute` `GET /tow/requests/{id}/route` | MISSING | `RouteQuote` meters/seconds + geometry | n/a | T05 | contract op 53 |
| — | `createTowDispute` `POST /tow/requests/{id}/disputes` | MISSING | Tow-scoped dispute | n/a | T17 | contract op 45 |
| `POST /api/upload/emergency-requests/:id/photos` (+ GET) | `uploadTowVehicleDocument` `POST /tow/vehicles/{vehicleId}/documents` | REPLACE | Tow-vehicle-scoped, document type/status, admin approval | yes | T03, T17 | `src/routes/upload.js:19-20`; `g2PhotoContract.test.js:463-897` |

## B. HTTP endpoints — legacy `/api/tow-proposals`

| Current | Target Tow v1 | Status | Action | Breaking? | Owning task | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `POST /api/tow-proposals` | `createTowProposal` `POST /tow/requests/{requestId}/proposals` | REPLACE | No request body; server-calculated price; duplicate → `conflict`/`proposal_not_actionable` | yes | T05, T07 | `TowProposalService.js:33-180`; contract op 51 |
| `GET /api/tow-proposals/emergency/:id` | `listTowRequestProposals` | ADAPT | Remove hardcoded `status='pending'` filter | no | T07 | `TowProposalController.js:46` |
| `GET /api/tow-proposals/partner` | `listPartnerTowProposals` `GET /tow/partner/proposals` | ADAPT | Add `state` filter + pagination meta | yes | T07 | `TowProposalController.js:76` |
| `GET /api/tow-proposals/:id` | embedded in `listTowRequestProposals` | REPLACE | No standalone proposal GET in the contract | yes | T07 | contract op 51 |
| `POST /api/tow-proposals/:id/accept` | `acceptTowProposal` `POST /tow/proposals/{proposalId}/accept` | REPLACE | Returns `TowRequest`; atomic assignment; idempotency key | yes | T09 | `TowProposalController.js:120-161` |
| `POST /api/tow-proposals/:id/reject` | sibling auto-reject / `withdrawTowProposal` | REPLACE | `reason` must persist; no customer-facing reject operation in contract | yes | T07 | `TowProposalController.js:175-206`; `TowProposal.js:163-173` |
| `POST /api/tow-proposals/:id/withdraw` | `withdrawTowProposal` `POST /tow/proposals/{proposalId}/withdraw` | ADAPT | Canonical envelope + idempotency key | yes | T07 | `TowProposalController.js:218-225`; `TowProposalService.js:262-281` |
| `POST /api/tow-proposals/:id/views` | — | DEPRECATE | Not in Tow v1 | n/a | — | `TowProposalController.js:236-243` |
| `GET /api/tow-proposals` (admin) | `adminListTowRequests` + `adminListTowAuditEvents` | DEPRECATE | Admin proposal listing not in contract | n/a | T17 | `TowProposalController.js:264-273` |
| `GET /api/tow-proposals/stats` (admin) | `getTowPartnerFinancialSummary` (partner) + admin audit | DEPRECATE | Stats split by audience | n/a | T16, T17 | `TowProposalController.js:330-333` |
| `GET /api/tow-proposals/expiring-soon` (admin) | internal job | DEPRECATE | Operational endpoint not in contract | n/a | T07 | `TowProposalController.js:293` |
| `POST /api/tow-proposals/emergency/:id/expire` (admin) | internal job / `adminOverrideCancelTowRequest` | DEPRECATE | Not in contract | n/a | T07, T17 | `TowProposalController.js:308-314` |
| — | `createTowCounteroffer` `POST /tow/proposals/{proposalId}/counteroffer` | MISSING | Single counteroffer, `counteroffer_already_used` | n/a | T08 | contract op 36 |
| — | `acceptTowCounteroffer` / `rejectTowCounteroffer` | MISSING | Counteroffer terminal transitions | n/a | T08 | contract ops 21-22 |

## C. HTTP endpoints — admin, settings, payments, wallet, disputes

| Current | Target Tow v1 | Status | Action | Breaking? | Owning task | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `GET/POST/PUT/DELETE /api/system-settings/*` (24 routes) | `adminGetTowSettings` / `adminPatchTowSettings` | ADAPT | Keep generic store; add Tow-scoped partial patch (`TowSettingsPatch`, `minProperties:1`) | no | T02 | `src/routes/systemSettings.js:9-84`; `tests/contract/towSettingsPatch.test.js` |
| `GET /api/system-settings/guincho` | `adminGetTowSettings` | ADAPT | Reais strings → `*_cents` (see C-10) | yes | T02, T05 | `SystemSettingsController.js:413-429`; `migrations/040:5-43` |
| — | `getTowModuleStatus` `GET /tow/module-status` | MISSING | Public module/flag gate for consumers | n/a | T02 | contract op 25; probe 404 |
| — | `adminGetTowModule` / `adminToggleTowModule` | MISSING | Feature flag + `service_module_disabled` | n/a | T02 | contract ops 5, 6 |
| — | `/tow/vehicles` CRUD + `activate` | MISSING | Tow vehicle registry | n/a | T03 | contract ops 56-63 |
| — | `/tow/vehicles/{id}/documents` CRUD + admin approve/reject | MISSING | Document statuses, `tow_document_required` | n/a | T03, T17 | contract ops 63-66, 17-20 |
| — | `listPartnerTowJobs`, `getTowPartnerStatus`, `patchTowPartnerStatus`, `updateTowPartnerLocation` | MISSING | Partner operational status/location | n/a | T10 | contract ops 26-31 |
| — | `getTowPartnerFinancialSummary` | MISSING | Partner earnings in cents | n/a | T16 | contract op 27 |
| — | `listTowCustomerDebts` / `payTowCustomerDebt` | MISSING | Cash debt + `outstanding_financial_debt` gate | n/a | T15 | contract ops 23-24 |
| `GET /api/payments`, `GET /api/payments/stats/summary`, `POST /api/payments/:id/confirm|cancel|refund`, `POST /api/payments/webhook/:gateway` | payment orchestration inside Tow operations | ADAPT | Reuse provider plumbing; Tow v1 exposes no generic payment endpoint | no | T12–T16 | `src/routes/payments.js:35-298` |
| `GET /api/wallets`, `/transactions`, `POST /withdraw`, `PUT /bank-details`, `GET /:id` (admin) | settlement/payout internal services | ADAPT | Reuse ledger/withdraw; add payout batches | no | T16 | `src/routes/wallets.js:21-161` |
| — | `/admin/tow/payout-batches` (preview/create/get/process) | MISSING | Payout batch lifecycle | n/a | T16 | contract ops 7-10 |
| `POST /api/disputes`, `GET /api/disputes`, `PUT /:id/respond`, `PUT /:id/resolve` | `createTowDispute`, `adminListTowDisputes`, `adminGetTowDispute`, `adminResolveTowDispute` | ADAPT | Tow-scoped DTOs + admin detail | yes | T17 | `src/routes/disputes.js:8-92`; contract ops 2-4, 45 |
| — | `adminListTowRequests`, `adminGetTowRequest`, `override-cancel`, `override-complete` | MISSING | Admin Tow operations | n/a | T17 | contract ops 11-14 |
| — | `adminListTowAuditEvents` | MISSING | Tow audit trail | n/a | T17 | contract op 1 |

## D. Data model

| Current | Target Tow v1 | Status | Action | Breaking? | Owning task | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `emergency_requests` (core request row) | `tow_requests` (or extended `emergency_requests` with Tow columns) | ADAPT | Decision required at T01: extend vs. new table; audit assumes extension of the existing row plus new Tow tables | yes | T01 | `migrations/009`, `036` |
| `emergency_requests.status` enum (6) | `TowRequestState` (11) | REPLACE | New state column/values; legacy `in_progress` cannot be backfilled (C-6) | yes | T10 | `009:28`; contract `TowRequestState` |
| `emergency_requests.request_type` `'tow'\|'mechanic'` | `module_key` | ADAPT | Keep discriminator; Tow v1 exposes `module_key` | yes | T02 | `036:5`; `EmergencyRequest.js:755` |
| `emergency_requests.proposal_status` free text | proposal aggregate state | ADAPT | Constrain + add `COUNTERED`/`CLOSED` | yes | T07, T08 | `036:6`; `EmergencyRequest.js:760,896,1011` |
| `emergency_requests.search_radius_km decimal(8,2)` | progressive radius (`initial`/`increment`/`max`, meters) | REPLACE | Radius expansion state machine | yes | T06 | `036:12`; `EmergencyRequest.js:1085-1093` |
| `emergency_requests.cancellation_reason/by/cancelled_at` | `terminal_reason` + `cancelled_at` | ADAPT | Map `user/admin` → `TerminalReason` (C-5) | yes | T11 | `036:14-15`; `EmergencyRequest.js:1127-1160` |
| `emergency_requests.payment` JSON section | `payment` object (`Money`) | REPLACE | `amount_cents` + canonical `PaymentStatus` | yes | T12 | `EmergencyRequest.js:773-802` |
| `emergency_requests.price_breakdown` JSON (reais km) | pricing breakdown (cents/meters) | REPLACE | Recompute through pricing engine | yes | T05 | `EmergencyRequest.js:271-310` |
| `tow_proposals` | Tow v1 proposals | ADAPT | Keep table, add server price, counteroffer link, expiry, statuses | yes | T07 | `025:4-33` |
| `tow_proposals.status` enum (5) | `TowProposalStatus` | ADAPT | Add `COUNTERED`/`CLOSED`; map `pending→ACTIVE` | yes | T07, T08 | `025:19-20` |
| `tow_proposals.tow_truck_type/tow_capacity_kg/has_winch` | tow vehicle + compatibility | REPLACE | Move to `tow_vehicles` + compatibility rules | yes | T03, T04 | `025:13-16` |
| `tow_proposals.proposed_price/estimated_time_minutes` | server-calculated price + route duration | REPLACE | C-1 must be resolved first | yes | T05, T07 | `025:8-9`; `TowProposalService.js:33-56` |
| Partial unique index `(emergency_request_id, partner_id) WHERE status='pending'` | uniqueness for active proposal per (request, partner) | ADAPT | Recreate for the new status vocabulary | yes | T07 | `044:12-16` |
| `partners.type` includes `'tow'` | partner type/module | KEEP | Reuse; add module gate | no | T02 | `030:12`, `034:10` |
| `partner_documents` + `towDocumentFlow` rules | tow vehicle documents | ADAPT | Separate partner onboarding docs from vehicle docs | yes | T03 | `tests/tow/towDocumentFlow.test.js` |
| — | `tow_vehicles`, `tow_vehicle_documents` | MISSING | New tables | n/a | T03 | grep: no migration |
| — | `tow_counteroffers` | MISSING | Single counteroffer table | n/a | T08 | grep `counteroffer` → 0 hits |
| — | `tow_assignments` | MISSING | Atomic assignment record | n/a | T09 | grep: no migration |
| — | `tow_tracking_points` | MISSING | Tracking persistence | n/a | T10 | grep: no migration |
| — | `tow_disputes`, `tow_reviews` | MISSING | Tow-scoped tables | n/a | T17 | grep: no migration |
| — | `tow_audit_events` | MISSING | Audit trail | n/a | T17 | grep: no migration |
| — | `tow_payout_batches`, `tow_payout_items` | MISSING | Payout lifecycle | n/a | T16 | grep: no migration |
| — | `tow_module_state` (or settings keys) | MISSING | Module registry persistence | n/a | T02 | grep: no migration |
| — | idempotency store | MISSING | `Idempotency-Key` replay/conflict (C-7) | n/a | T09, T18 | grep: no header parsing |
| Duplicate `029_*` migration prefixes | clean migration chain | BROKEN | Renumber/repair before T01 baseline | yes | T01 | `database/migrations/029_*` |

## E. Values, units and enums

| Current | Target Tow v1 | Status | Action | Breaking? | Owning task | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `pending/accepted/in_progress/completed/cancelled` | 11 `TowRequestState` values | REPLACE | New state machine | yes | T10 | `009:28`; `tests/helpers/towContract.js:42-70` |
| `cancellation_by: 'user'\|'admin'` | 7 `TerminalReason` values | REPLACE | Explicit reason per transition (C-5) | yes | T11 | `EmergencyRequest.js:1127,1148` |
| `tow_proposals.status` (5) | `TowProposalStatus` | ADAPT | Add COUNTERED/CLOSED | yes | T07, T08 | `025:19-20` |
| — | `CounterofferStatus` | MISSING | New enum | n/a | T08 | grep → 0 hits |
| unvalidated `method/gateway/currency` | `PaymentMethod card\|pix\|cash` | REPLACE | Validate at the edge | yes | T12 | `emergencyRequestController.js:694-700` |
| `payments.status` legacy values | `PaymentStatus` (incl. `CASH_SELECTED`) | REPLACE | Mapping table required | yes | T12, T15 | `paymentService.js`; contract `PaymentStatus` |
| — | `VehicleDocumentStatus` | MISSING | New enum | n/a | T03 | grep → 0 hits |
| — | `allowed_actions` | MISSING | Server-derived per state | n/a | T10 | grep → 0 hits |
| reais floats (`decimal(10,2)`) | `Money.amount_cents` integer | REPLACE | Migration + rounding policy (C-10) | yes | T02, T05 | `009:35-36`, `025:8`, `040:5-43` |
| km floats (`distance`, `partner_distance_km`) | meters integer | REPLACE | `RouteQuote.total_distance_meters` | yes | T05, T06 | `EmergencyRequest.js:456`; `025:30` |
| minutes ints (`estimated_time_minutes`, `partner_eta_minutes`) | seconds integer | REPLACE | `RouteQuote.total_duration_seconds` | yes | T05 | `025:9,31` |
| `pagination:{page,limit,total,totalPages}` | `meta:{page,limit,total,total_pages}` | REPLACE | Serializer per response | yes | T18 | `emergencyRequestController.js:127-137` |
| 7 legacy error envelope families | `{success,message,error:{code,details?}}` | REPLACE | Single error writer before first Tow endpoint (B-5) | yes | T01, T18 | `ServiceError.js:29-49`; `src/app.js:154-167` |
| legacy error codes (15) | 27 canonical codes | REPLACE | Code map per operation | yes | T18 | `TowProposalService.js`, `EmergencyRequestService.js` |
| HTTP 200/201/400/403/404/409/500/503 | + 422 for `validation_error` | ADAPT | 422 never used today | yes | T18 | grep: no 422 |

## F. Models, services and cross-cutting mechanisms

| Current | Target Tow v1 | Status | Action | Breaking? | Owning task | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `EmergencyRequest.findNearby` (SQL Haversine, radius filter, `excludePartnerId`) | opportunity query | ADAPT | Meters, progressive radius, compatibility filters | yes | T06 | `EmergencyRequest.js:450-527` |
| `EmergencyRequest.findForGuinchos` / `findForMechanics` | opportunity query | ADAPT | Keep as the tow branch; drop duplicate SQL | yes | T06 | `EmergencyRequest.js:1020-1069` |
| Haversine duplication (6 SQL + 2 JS on the tow path; 13 SQL + 5 JS repo-wide) | one distance source | REPLACE | Consolidate before T05/T06 | yes | T05, T06 | `EmergencyRequest.js:223-246,458,1023,1049`; `Partner.js:9-30,284,291`; `TowProposal.js:67`; `docs/evidence/t00/google-routes-audit.txt` |
| `TowProposalService.createProposal` (trx + FOR UPDATE + duplicate translation) | proposal creation | KEEP | Reuse transaction pattern; change price ownership | no | T07 | `TowProposalService.js:16-26,128-180` |
| `EmergencyRequest.acceptProposal` (trx + CAS + sibling rejection) | atomic assignment | ADAPT | Add assignment record + `request_already_assigned` | yes | T09 | `EmergencyRequest.js:836-915` |
| `EmergencyRequest.start/complete/cancel` CAS updates | state transitions | ADAPT | New state machine + audit events | yes | T10, T11 | `EmergencyRequest.js:548-604` |
| Controller idempotency (repeat start/complete) | state-machine idempotency | ADAPT | Keep semantics; add `Idempotency-Key` layer | no | T09, T10 | `emergencyRequestController.js:344-348,436-439` |
| `ServiceError` + `sendServiceError` | canonical error writer | REPLACE | `error:{code,details}` envelope | yes | T01, T18 | `ServiceError.js:29-49` |
| `auth` / `requireRole` middleware | unchanged | KEEP | Reuse for Tow v1 | no | T01 | `src/middleware/auth.js:6-83` |
| Ownership/assignment guards | `not_request_owner` / `not_assigned_partner` | ADAPT | Reuse logic, canonical codes | yes | T10 | `emergencyRequestController.js:94-102,330-338` |
| `NotificationServiceNew` hooks | unchanged | KEEP | Reuse; add Tow v1 event names | no | T10–T17 | `towLifecycleController.test.js:327,343,408` |
| Socket.IO `emergency_<id>` room + `emergency_updated`/`partner_location_updated` | tracking complement | ADAPT | Add Tow v1 tracking events; contract routes are source of truth | yes | T10 | `socketService.js:206-285,367` |
| Upload plumbing (`multer`, local storage, public URL base) | tow document upload | KEEP | Reuse; scope to tow vehicles, keep auth gate | no | T03 | `src/routes/upload.js`; `g2PhotoContract.test.js:463-897` |
| `system_settings` store + validation/export/import | Tow settings + module registry | ADAPT | Add `*_cents` Tow keys and module flag | yes | T02 | `src/routes/systemSettings.js:9-84` |
| `legacyRouteRegistry` / `legacyRoute` middleware | — | DEPRECATE (unrelated) | Do not extend; not part of Tow v1 | n/a | — | `src/routes/systemSettings.js:53-69` |
| `emergencyRequestController_old.js` | — | DEPRECATE | Dead code; delete under a cleanup task | no | T01 (optional) | grep → 0 references |
| Unreferenced `TowProposalService` methods | — | DEPRECATE | Delete or wire; avoid dual accept paths | no | T07 | route grep |
| Google Routes / Distance Matrix client | routes port + adapter | MISSING | T05 implements; T00 fixes the port and fake only | n/a | T05 | §6 of the audit |

## G. Reusable T00 test assets (mechanism only)

| Asset | Path | Consumed by |
| --- | --- | --- |
| Contract loader/composer/validator | `socorre_ai_backend/tests/helpers/towContract.js` | T01–T18 contract gates |
| Payload builders (schema-valid + exact) | `socorre_ai_backend/tests/helpers/tow/builders.js` | T01–T18 |
| Consumer flows (Cliente/Parceiro/Dashboard) | `socorre_ai_backend/tests/helpers/towConsumerFlows.js` | T18 ready gate |
| Factories (customer/partner/admin/request/proposal/settings/scenario) | `socorre_ai_backend/tests/helpers/tow/factories.js` | T01–T18 |
| Auth token helpers (valid/expired/forged) | `socorre_ai_backend/tests/helpers/tow/auth.js` | T01–T18 |
| Fake clock | `socorre_ai_backend/tests/helpers/tow/clock.js` | T07, T10, T11 |
| Fake maps gateway (8400 m / 1320 s) | `socorre_ai_backend/tests/helpers/tow/gateways/mapsGateway.js` | T05, T06 |
| Fake payment gateway | `socorre_ai_backend/tests/helpers/tow/gateways/paymentGateway.js` | T12–T16 |
| PostgreSQL foundation + guard | `socorre_ai_backend/tests/helpers/tow/postgres.js`, `scripts/tow/pg-guard.js` | T01–T18 |
| Canonical commands | `npm run test:tow`, `test:contract`, `validate:openapi`, `test:pg`, `verify:tow` | T01–T18 |

## H. Ownership summary (rows per task)

| Task | Rows it owns |
| --- | --- |
| T01 | migration chain repair, DB baseline/reset/seed, canonical error writer, `tow_requests` decision, module/flag persistence, auth reuse |
| T02 | module registry + feature flag, `TowSettingsPatch`, reais→cents settings migration (C-10) |
| T03 | tow vehicles, vehicle documents, upload scoping |
| T04 | compatibility/capacity/winch rules |
| T05 | routes adapter + port, pricing engine, meters/seconds, `RouteQuote` |
| T06 | opportunity DTO, progressive radius, single distance source |
| T07 | proposal lifecycle, server-calculated price (C-1), expiry (C-4), counteroffer link |
| T08 | single counteroffer + statuses |
| T09 | atomic assignment, idempotency keys (C-7) |
| T10 | state machine, `allowed_actions`, tracking, partner status/location |
| T11 | cancellation/no-show policies, `TerminalReason` (C-5) |
| T12 | payment orchestration core + `PaymentStatus` |
| T13 | card flow |
| T14 | PIX flow |
| T15 | cash/debt + `outstanding_financial_debt` |
| T16 | wallet/settlement/payout batches |
| T17 | disputes/reviews/admin override/vehicle-document admin/audit events |
| T18 | contract freeze, 422/status policy, consumer smoke re-run, ready gate |
