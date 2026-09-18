# T00 — Current-State Audit: legacy Tow surface vs. Tow v1 contract

> Status: **COMPLETE — audit only, no business behavior changed**
> Issue: #11 · Task: T00 · Execution base: `e1e7dd2d20d5da25df00d8106a904f14041654a1`
> Contract under audit: `docs/tow/tow-api-contract.openapi.yaml` (composed, 66 operations)
> Companion artifact: `docs/tow/T00-LEGACY-TO-TARGET-MAPPING.md`
> Work result: `docs/evidence/t00-work-result.yaml`

## 1. Scope and method

This audit answers one question: **what exists today in the repository that T01–T18 can reuse,
adapt, replace or must create from zero**, and what stands in the way.

Method:

1. Read Issue #11 and the normative Tow documents in `docs/tow/` before touching anything.
2. Enumerate the composed Tow v1 contract and probe the real Express application with one
   request per contract operation (no credentials): `socorre_ai_backend/scripts/tow/legacy-surface-probe.js`.
3. Read the legacy HTTP surface, models, services, migrations and tests line by line.
4. Cross-check every claim against a command whose output is captured under `docs/evidence/t00/`.
5. Register every contradiction with the normative documents instead of resolving it silently.

Evidence index (all captured by commands run in this task):

| Evidence | Artifact |
| --- | --- |
| Tow v1 operations present in the legacy app | `docs/evidence/t00/legacy-surface-probe.txt` |
| Composed operation inventory (66) | `docs/evidence/t00/target-contract-operations.md` |
| OpenAPI structure gate output | `docs/evidence/t00/green-openapi-validation.txt` |
| Contract suite output | `docs/evidence/t00/green-contract-suite.txt` |
| Focused Tow suite (two runs) | `docs/evidence/t00/green-tow-focused.txt`, `green-tow-focused-run2.txt` |
| Full regression suite | `docs/evidence/t00/green-full-suite.txt` |
| `verify:tow` end-to-end (two runs) | `docs/evidence/t00/green-verify-tow-run1.txt`, `green-verify-tow-run2.txt` |
| Security review commands and redacted output | `docs/evidence/t00/security-review.txt` |
| Google Maps/Routes audit commands | `docs/evidence/t00/google-routes-audit.txt` |
| Syntax check of every new JS file | `docs/evidence/t00/green-syntax-check.txt` |
| Pre-harness RED evidence | `docs/evidence/t00/red-*.txt` |

Classification legend used throughout:

| Class | Meaning |
| --- | --- |
| **REUSABLE** | Correct as-is for Tow v1; T01+ may build on it without changes to its semantics. |
| **PARTIAL** | Partially satisfies Tow v1; needs extension or a missing sibling capability. |
| **BROKEN** | Present but does not work as intended, or works only by accident. |
| **INCOMPATIBLE** | Works, but its shape/semantics contradict the frozen contract. |
| **TO_BE_REPLACED** | Superseded by a Tow v1 capability; must be retired or reduced to a compatibility shim. |
| **MISSING** | Does not exist; T01+ must create it. |

## 2. Executive summary

**The Tow v1 surface does not exist yet.** Probing the real application with all 66 contract
operations yields `Not routed in the legacy app: 66 / Routed: 0`
(`docs/evidence/t00/legacy-surface-probe.txt`). The legacy app mounts only
`/api/emergency-requests` (`src/app.js:135`) and `/api/tow-proposals` (`src/app.js:140`).

What *does* exist is a complete, tested **legacy tow flow** built on `emergency_requests` +
`tow_proposals`: request creation with a pricing snapshot, nearby search for `tow` partners,
proposal submission with duplicate protection, proposal acceptance with sibling rejection,
partner start/complete with idempotency and CAS concurrency, cancellation, ratings and photo
uploads. That flow is well covered by tests and is the single most valuable asset for T01–T18.

What is **structurally missing**: the entire Tow v1 vocabulary — `state`/`terminal_reason`,
`allowed_actions`, `assignment`, `route_quote`, counteroffers, tow vehicles, vehicle documents,
module registry/feature flag, progressive radius, payment orchestration, wallet/settlement/payout,
disputes/reviews at the Tow level, audit events and idempotency keys.

What is **actively incompatible**: the error envelope (`error` is a string with a top-level
`code`, not an object with `error.code`), money as `decimal(10,2)` reais floats instead of
`amount_cents` integers, distance in km instead of meters, ETA in minutes instead of seconds, and
a five-value `status` that collapses several Tow v1 states.

## 3. Current state by area

### 3.1 HTTP surface and routing — **TO_BE_REPLACED**

| Item | Evidence | Class |
| --- | --- | --- |
| `/api/emergency-requests` (16 routes) | `src/app.js:135`, `src/routes/emergency-requests.js` | TO_BE_REPLACED (request lifecycle) |
| `/api/tow-proposals` (13 routes) | `src/app.js:140`, `src/routes/towProposals.js` | TO_BE_REPLACED (proposal lifecycle) |
| Photo routes `/api/upload/emergency-requests/:id/photos` | `src/routes/upload.js:19-20` | PARTIAL (reusable upload plumbing, wrong URL/DTO) |
| 404 catch-all `{success:false,message:'Rota não encontrada no backend da API'}` | `src/app.js:154-159` | INCOMPATIBLE (no `error.code`) |
| Global 500 handler `{success:false,message:'Erro interno do servidor'}` | `src/app.js:162-167` | INCOMPATIBLE (no `error.code`) |
| Helmet / CORS / rate limit | `src/app.js:31,36-41,54` | REUSABLE |
| `/api/tow/*`, `/api/admin/tow/*` | probe: 66/66 404 | MISSING |

### 3.2 Data model and migrations — **PARTIAL**

Tow-relevant migrations: `009` (emergency_requests), `011`, `013`, `014`, `015`, `019`, `021`,
`022`, `023`, `025` (tow_proposals), `030` (partner type `tow`), `034` (partner type check),
`036` (tow columns), `040` (tow pricing settings), `044` (partial unique index), `045` (photos).

| Item | Evidence | Class |
| --- | --- | --- |
| `emergency_requests.status` enum `pending\|accepted\|in_progress\|completed\|cancelled\|expired` | `database/migrations/009:28` | INCOMPATIBLE (5 of 11 Tow v1 states missing; `expired` never written for requests) |
| `emergency_requests.request_type` plain text `'tow'\|'mechanic'` | `036:5`, `EmergencyRequest.js:755,806` | PARTIAL |
| `emergency_requests.proposal_status` plain text, no constraint | `036:6`; writers `EmergencyRequest.js:760,896,1011` | PARTIAL (no enum, no `COUNTERED`) |
| `search_radius_km decimal(8,2)` | `036:12` | PARTIAL (no initial/increment/max radius) |
| `cancellation_reason`/`cancellation_by`/`cancelled_at` | `036:14-15` | PARTIAL (`cancellation_by` free text `user`/`admin`; no `TerminalReason`) |
| `tow_proposals` (price, ETA, truck type, capacity, winch, status, expires_at, counters, distance) | `025:4-33` | TO_BE_REPLACED (client-priced, reais, minutes) |
| `tow_proposals.status` enum `pending\|accepted\|rejected\|expired\|withdrawn` | `025:19-20` | INCOMPATIBLE (no `COUNTERED`/`CLOSED`) |
| Partial unique index `tow_proposals_one_pending_per_partner` | `044:12-16` | REUSABLE (pattern; key will change with Tow v1 proposals) |
| Partner type `tow` (PG enum + SQLite CHECK) | `030:12`, `034:10` | REUSABLE |
| `tow_vehicles`, `tow_vehicle_documents`, `tow_counteroffers`, `tow_assignments`, `tow_tracking_points`, `tow_disputes`, `tow_reviews`, `tow_payout_batches`, `tow_audit_events`, `tow_module_state` | grep: no such migrations | MISSING |
| Money columns as `decimal(10,2)` reais | `009:35-36`, `025:8,30`, `036:12` | INCOMPATIBLE (contract requires `amount_cents` integer) |
| Duplicate `029_*` migration prefixes | `database/migrations/029_*` (two files) | BROKEN (tech debt) |

### 3.3 Domain states and enums — **INCOMPATIBLE**

| Canonical enum | Legacy | Class |
| --- | --- | --- |
| `TowRequestState` (11) | `pending`, `accepted`, `in_progress`, `completed`, `cancelled` | INCOMPATIBLE — `in_progress` collapses EN_ROUTE+ARRIVED+IN_TRANSIT; SEARCHING/NEGOTIATING/ASSIGNED/COMPLETION_PENDING/DISPUTED absent; EXPIRED unreachable |
| `TerminalReason` (7 + null) | absent (grep `terminal_reason` → 0 hits) | MISSING |
| `TowProposalStatus` | `pending`, `accepted`, `rejected`, `expired`, `withdrawn` | INCOMPATIBLE (no `COUNTERED`/`CLOSED`) |
| `CounterofferStatus` | absent (grep `counteroffer` in `src/` + migrations → 0 hits) | MISSING |
| `PaymentMethod` `card\|pix\|cash` | unvalidated passthrough of `req.body.method/gateway/currency` (`emergencyRequestController.js:694-700`) | INCOMPATIBLE |
| `PaymentStatus` | legacy `payments.status` values from `paymentService.js` | INCOMPATIBLE |
| `VehicleDocumentStatus` | absent | MISSING |
| `allowed_actions` | absent (grep → 0 hits) | MISSING |

### 3.4 Payload, DTO and units — **INCOMPATIBLE**

| Contract | Legacy | Class |
| --- | --- | --- |
| `CreateTowRequestInput {pickup, destination, vehicle, problem_description}` | `{type, request_type, latitude, longitude, location_type, address, vehicle_*, description}` (`validation.js:302-357`) | INCOMPATIBLE |
| `Idempotency-Key` on create/accept/counteroffer/withdraw/finish/cancel | no header parsing anywhere | MISSING |
| `POST /tow/requests/{id}/proposals` with **no body**, server-calculated price | client-supplied `{proposed_price, estimated_time_minutes}` (`TowProposalService.js:33-56`) | INCOMPATIBLE |
| `Money {amount_cents, currency:'BRL'}` | `decimal(10,2)` reais floats; settings `'6'/'25'/'90'/'40'` (`040:5-43`) | INCOMPATIBLE |
| `RouteQuote.total_distance_meters` / `total_duration_seconds` | `distance` km float; `estimated_time_minutes`; `partner_eta_minutes` (`025:31`) | INCOMPATIBLE |
| `TowRequest.state` + `terminal_reason` + `allowed_actions` + `assignment` + `route_quote` | absent; returns raw `status` row | MISSING |
| `PaginationMeta {page,limit,total,total_pages}` | `pagination:{page,limit,total,totalPages}` (OK-C) / `data:{total,page,limit,totalPages}` | INCOMPATIBLE |
| `ErrorResponse {success,message,error:{code,details?}}` | `{success,message}` / `{error:'...'}` / `{success,code,message,error:<string>}` | INCOMPATIBLE |
| RFC3339 timestamps | knex `Date`/ISO strings | REUSABLE (serialize explicitly) |
| `TowSettingsPatch` partial semantics | no equivalent (legacy settings are flat key/value) | MISSING |

### 3.5 Error envelope, codes and HTTP statuses — **INCOMPATIBLE**

Canonical: `{success:false, message, error:{code, details?}}` with a 27-value `error.code` enum.

Legacy reality (`src/services/ServiceError.js:29-49`):

```js
// success path of sendServiceError
{ success: false, code: error.code, message: error.message, error: error.message }
```

`error` is a **string**, the machine-readable code sits at the **top level**, and there is no
`details` inside `error`. Additional envelope families observed on the legacy tow surface:

| Family | Shape | Source |
| --- | --- | --- |
| ERR-A | `{success:false,message}` | `emergencyRequestController.js:94-97` and most handlers |
| ERR-B | `{success:false,message,current_status}` | `emergencyRequestController.js:349-353` |
| ERR-C | `{success:false,message:'Dados inválidos',errors:[...],code?}` | `validation.js:482-505` |
| ERR-D | `{error:'...'}` — **no `success`, no `code`** | `emergencyRequestController.js:274,278,288,301,306,318,780`; most `TowProposalController` errors |
| ERR-E | `{success:false,code,message,error,details?}` | `ServiceError.js:29-49` |
| ERR-F | `{success:false,code:'tow_pricing_not_configured',message,missing_settings}` | `emergencyRequestController.js:76-81` |
| ERR-G | `{success:false,message:error.message}` — leaks raw message | `emergencyRequestController.js:666-669,714-717` |

Legacy codes actually emitted: `invalid_coordinates`, `invalid_radius`, `coordinates_required`,
`partner_onboarding_required`, `emergency_invalid_coordinates`, `invalid_payload`,
`emergency_not_found`, `emergency_not_accepting_proposals`, `proposal_duplicate`,
`proposal_price_below_minimum`, `partner_not_tow`, `proposal_not_found`, `proposal_not_pending`,
`forbidden`, `tow_pricing_not_configured`.

Canonical codes with **zero** legacy occurrences: `invalid_tow_state`, `invalid_tow_transition`,
`not_request_owner`, `not_assigned_partner`, `vehicle_not_compatible`, `vehicle_not_operational`,
`tow_document_required`, `tow_document_not_approved`, `proposal_expired`,
`proposal_not_actionable`, `counteroffer_already_used`, `counteroffer_expired`,
`request_already_assigned`, `payment_not_ready`, `payment_failed`,
`payment_method_not_changeable`, `customer_no_show_not_allowed_yet`, `idempotency_conflict`,
`conflict`, `validation_error`, `unauthorized`, `not_found`, `external_dependency_unavailable`.

HTTP statuses in use: 200/201/400/401/403/404/409/500/503. **422 is never used** although the
contract maps `validation_error` to 422. 409 only from `proposal_duplicate`
(`TowProposalService.js:86,152,177`).

### 3.6 Authentication and authorization — **REUSABLE (with extension)**

| Item | Evidence | Class |
| --- | --- | --- |
| `auth` middleware, JWT, revocation check, `req.user.partner_id`/`partner_type` | `src/middleware/auth.js:6-62` | REUSABLE |
| `requireRole` | `src/middleware/auth.js:65-83` | REUSABLE |
| Ownership/assignment guards (owner, assigned partner, admin override) | `emergencyRequestController.js:94-102,214-231,330-338,421-429,583-596` | PARTIAL (Tow v1 needs `not_request_owner`/`not_assigned_partner` codes) |
| Partner onboarding/document gate for tow | `src/models/Partner.js` document rules, `towDocumentFlow.test.js` | PARTIAL |
| Module/feature-flag gate (`service_module_disabled`) | grep → absent | MISSING |
| `partnerValidation.js` tow logic | zero tow logic (grep `tow\|guincho` → 0 hits) | MISSING |

### 3.7 Matching, radius and distance — **TO_BE_REPLACED**

| Item | Evidence | Class |
| --- | --- | --- |
| `findNearby` SQL Haversine + `whereRaw distance <= radius` + tow filters + `excludePartnerId` | `EmergencyRequest.js:450-527` | PARTIAL (reusable SQL pattern; km + no progressive radius) |
| `findForGuinchos` / `findForMechanics` | `EmergencyRequest.js:1020-1069` | PARTIAL |
| JS Haversine (2 independent copies) | `EmergencyRequest.js:223-246`, `Partner.js:9-30` | BROKEN (duplication; km floats) |
| SQL Haversine copies on the tow path (6 total) | `EmergencyRequest.js:458,1023,1049`; `TowProposal.js:67`; `Partner.js:284,291` | BROKEN (duplication) |
| Default radius 15 km, per-request `search_radius_km` from settings | `EmergencyRequestService.js:17,103-122`; `EmergencyRequest.js:751,805,1085-1093` | PARTIAL (no initial/increment/max) |
| Ordering by distance | `EmergencyRequest.js:483`, `g3NearbyCoordinates.test.js:295` | REUSABLE |
| Exclude already-proposed partners | `EmergencyRequest.js:515-523`; `g3NearbyCoordinates.test.js:355-416` | REUSABLE |
| `partner_distance_km decimal(5,2)` | `025:30` | INCOMPATIBLE (meters required) |
| Vehicle compatibility / capacity / winch filtering | `tow_proposals.tow_truck_type/tow_capacity_kg/has_winch` only; no tow_vehicles table | MISSING |

### 3.8 Proposal lifecycle and concurrency — **PARTIAL (strong foundation)**

| Item | Evidence | Class |
| --- | --- | --- |
| Transaction + `SELECT ... FOR UPDATE` + in-transaction re-check + duplicate translation | `TowProposalService.js:16-26,128-180`; `EmergencyRequest.js:970-976` | REUSABLE |
| Partial unique index on pending proposal per (request, partner) | `044:12-16` | REUSABLE |
| CAS-based accept with sibling rejection | `EmergencyRequest.js:836-915`, `TowProposal.js:135-160` | REUSABLE |
| Withdraw / reject / expire | `TowProposal.js:163-212` | REUSABLE |
| Controller-level idempotency for start/complete | `emergencyRequestController.js:344-348,436-439` | PARTIAL |
| Client-chosen price, ETA and truck data | `TowProposalService.js:33-56` | TO_BE_REPLACED |
| Single counteroffer (one per party, expiry, status) | absent | MISSING |
| Atomic assignment + `request_already_assigned` | absent (accept closes the request, no assignment record) | MISSING |
| Proposal expiry driven by persisted deadline | `EmergencyRequest.js:65-76,923-999` | PARTIAL (dialect-dependent `new Date()` vs `Date.now()`) |
| `proposals_received` as historical counter (slot not returned on withdraw) | `g3TowProposals.test.js:489-516` | PARTIAL (semantics must be re-validated for Tow v1) |

### 3.9 Payment, wallet and settlement — **MISSING (legacy primitives only)**

| Item | Evidence | Class |
| --- | --- | --- |
| `/api/payments` (create, list, by partner, stats/summary, detail, confirm, cancel, refund, webhook) | `src/routes/payments.js:35-298` | PARTIAL (generic; no Tow orchestration) |
| `/api/wallets` (balance, transactions, withdraw, bank details, admin detail) | `src/routes/wallets.js:21-161` | PARTIAL |
| `/api/disputes` (create, list, respond, admin resolve) | `src/routes/disputes.js:8-92` | PARTIAL (not Tow-scoped) |
| Payment state on the request (`payment_summary`, `payment` JSON section) | `EmergencyRequest.js:773-802`; `emergencyRequestController.js:727-751` | PARTIAL |
| `PaymentMethod` enum validation | absent on tow routes | MISSING |
| Payment orchestration core, card/PIX/cash flows, cash debt, platform fee, payout batches | no Tow-level implementation | MISSING |
| `PaymentStatus` canonical values (incl. `CASH_SELECTED`) | legacy `payments.status` differs | INCOMPATIBLE |

### 3.10 Tracking and realtime — **PARTIAL**

| Item | Evidence | Class |
| --- | --- | --- |
| Socket.IO rooms `emergency_<id>`, events `emergency_updated`, `partner_location_updated` | `src/services/socketService.js:206-285,367` | PARTIAL (no Tow v1 tracking DTO/route) |
| Partner location update with coordinate validation | `socketService.js:248-285` | PARTIAL |
| `GET/POST /tow/requests/{id}/tracking` | absent | MISSING |
| `PUT /tow/partner/location` | absent (only socket + `PUT /api/partners/:id/location`) | MISSING |
| `GET /tow/requests/{id}/route` (geometry) | absent; no polyline/geometry anywhere | MISSING |

### 3.11 Documents and uploads — **PARTIAL**

| Item | Evidence | Class |
| --- | --- | --- |
| Auth-gated multipart upload, local storage, public URL via `getPublicApiBaseUrl()` | `src/routes/upload.js`, `g2PhotoContract.test.js:463-897` | PARTIAL (reusable plumbing) |
| Tow vehicle documents (types, statuses, approval/rejection, admin queue) | absent | MISSING |
| `VehicleDocumentStatus` | absent | MISSING |

### 3.12 Settings and module registry — **PARTIAL**

| Item | Evidence | Class |
| --- | --- | --- |
| `system_settings` key/value store with category, export/import, validation, reset | `src/routes/systemSettings.js:9-84` | REUSABLE |
| Tow pricing keys `tow_price_per_km`, `tow_platform_fixed_fee`, `tow_minimum_charge`, `tow_cancellation_fee` | `database/migrations/040:5-43`; `SystemSettingsController.js:413-429`; `EmergencyRequest.js:1163` | PARTIAL (reais strings, no cents) |
| Tow radius key `tow_search_radius_km` | `EmergencyRequest.js:1085-1093` | PARTIAL |
| Module registry / `service_module_disabled` / `GET|PATCH /admin/tow/module` | absent | MISSING |
| `GET|PATCH /admin/tow/settings` with `TowSettingsPatch` | absent | MISSING |
| Legacy route registry middleware (`legacyRouteRegistry`, `legacyRoute`) | `src/middleware/` | BROKEN (tech debt, unrelated to Tow v1) |

### 3.13 Notifications and audit — **PARTIAL**

| Item | Evidence | Class |
| --- | --- | --- |
| Notification service invoked on create/proposal/accept/start/complete | `NotificationServiceNew`, asserted by `towLifecycleController.test.js:327,343,408` | REUSABLE |
| Tow audit events (`GET /admin/tow/audit-events`) | absent | MISSING |

### 3.14 Google Maps / Routes — **MISSING** (see §6, boundary AUDIT/BOUNDARY/EVIDENCE only)

### 3.15 Test baseline — **REUSABLE**

| Run | Command | Result |
| --- | --- | --- |
| Pre-T00 focused (twice, identical) | `npx jest tests/tow --runInBand` | 2 skipped, 8 passed suites; 9 skipped, 195 passed, 204 total; exit 0 |
| Pre-T00 full (twice, identical) | `npx jest --runInBand` | 2 skipped, 35 passed suites; 9 skipped, 550 passed, 559 total; exit 0 |
| Post-T00 focused run 1 | `npx jest tests/tow --runInBand` | 2 skipped, 11 passed suites; 14 skipped, 228 passed, 242 total; exit 0 |
| Post-T00 focused run 2 | same | identical counters (determinism check) |
| Post-T00 contract | `npm run test:contract` | 4 suites, 51 tests, exit 0 |
| Post-T00 full | `npx jest --runInBand` | 2 skipped, 42 passed suites; 14 skipped, 634 passed, 648 total; exit 0 |
| Post-T00 gate | `npm run verify:tow` (twice) | 5/5 stages PASS, `GREEN`, identical stage results |

No pre-existing test was modified, skipped or deleted. The delta is +7 suites and +89 tests
(84 passing + 5 opt-in PostgreSQL tests skipped by default).

## 4. Legacy endpoint disposition

Legend: **KEEP** = reuse as-is behind the new surface · **ADAPT** = reuse with contract-shape
changes · **REPLACE** = superseded by a Tow v1 operation · **DEPRECATE** = retire after migration ·
**MISSING** = no legacy counterpart.

### `/api/emergency-requests` (16 routes)

| Legacy route | Tow v1 target | Action |
| --- | --- | --- |
| `POST /` | `POST /tow/requests` (`createTowRequest`) | REPLACE (new DTO, pricing snapshot, idempotency key) |
| `GET /` (admin) | `GET /admin/tow/requests` (`adminListTowRequests`) | REPLACE (filter/pagination shape) |
| `GET /user` | `GET /tow/requests` (`listTowRequests`) | REPLACE (`PaginationMeta`) |
| `GET /partner` | `GET /tow/partner/jobs` (`listPartnerTowJobs`) | REPLACE (state names, `allowed_actions`) |
| `GET /nearby` | `GET /tow/partner/opportunities` (`listTowOpportunities`) | REPLACE (`TowOpportunity` DTO, progressive radius) |
| `GET /stats` | `GET /tow/partner/financial-summary` (`getTowPartnerFinancialSummary`) | REPLACE |
| `GET /:id` | `GET /tow/requests/{requestId}` (`getTowRequest`) | REPLACE (`TowRequest` DTO) |
| `GET /:id/proposals` | `GET /tow/requests/{requestId}/proposals` (`listTowRequestProposals`) | ADAPT |
| `POST /:id/accept-proposal` | `POST /tow/proposals/{proposalId}/accept` (`acceptTowProposal`) | REPLACE (proposal-addressed, atomic assignment) |
| `POST /:id/accept` (mechanic direct accept) | — | DEPRECATE (mechanic-only, no Tow v1 equivalent) |
| `POST /:id/start` | `POST /tow/requests/{id}/en-route` + `/arrived` + `/in-transit` | REPLACE (three states instead of one) |
| `POST /:id/complete` | `POST /tow/requests/{id}/finish` + `/completion/confirm` | REPLACE |
| `POST /:id/cancel` | `POST /tow/requests/{id}/cancel` (`cancelTowRequestByCustomer`) | REPLACE (`TerminalReason`, policy) |
| `POST /:id/rate` | `POST /tow/requests/{id}/review` (`createTowReview`) | REPLACE |
| `GET /:id/payment-summary` | `GET /tow/requests/{id}/payment` (`getTowPaymentSummary`) | REPLACE (`amount_cents`) |
| `POST /:id/payment` | `PUT /tow/requests/{id}/payment-method` (`selectTowPaymentMethod`) | REPLACE |
| — | `PATCH /tow/requests/{id}/destination` | MISSING |
| — | `POST /tow/requests/{id}/cancel-partner` | MISSING |
| — | `POST /tow/requests/{id}/customer-no-show` | MISSING |
| — | `POST /tow/requests/{id}/cash-received` | MISSING |
| — | `GET|POST /tow/requests/{id}/tracking` | MISSING |
| — | `GET /tow/requests/{id}/route` | MISSING |
| — | `POST /tow/requests/{id}/disputes` | MISSING |
| — | `POST /tow/counteroffers/{id}/accept|reject` | MISSING |
| — | `GET /tow/customer/debts`, `POST /tow/customer/debts/{id}/pay` | MISSING |
| Photo routes (`/api/upload/emergency-requests/:id/photos`) | `POST /tow/vehicles/{id}/documents` | REPLACE (tow-vehicle-scoped, document statuses) |

### `/api/tow-proposals` (13 routes)

| Legacy route | Tow v1 target | Action |
| --- | --- | --- |
| `POST /` | `POST /tow/requests/{requestId}/proposals` | REPLACE (no client price; server-calculated) |
| `GET /emergency/:id` | `GET /tow/requests/{requestId}/proposals` | ADAPT (drop hardcoded `status='pending'` filter) |
| `GET /partner` | `GET /tow/partner/proposals` | ADAPT |
| `GET /:id` | `GET /tow/requests/{id}/proposals` (embedded) | REPLACE |
| `POST /:id/accept` | `POST /tow/proposals/{proposalId}/accept` | REPLACE |
| `POST /:id/reject` | `POST /tow/proposals/{proposalId}/withdraw` (partner) / auto-reject | REPLACE (reason must persist) |
| `POST /:id/withdraw` | `POST /tow/proposals/{proposalId}/withdraw` | ADAPT |
| `POST /:id/views` | — | DEPRECATE |
| `GET /` (admin) | `GET /admin/tow/requests` + audit | DEPRECATE |
| `GET /stats` (admin) | `GET /tow/partner/financial-summary` + admin views | DEPRECATE |
| `GET /expiring-soon` (admin) | internal job; `GET /admin/tow/audit-events` | DEPRECATE |
| `POST /emergency/:id/expire` (admin) | internal job / `adminOverrideCancelTowRequest` | DEPRECATE |
| — | `POST /tow/proposals/{proposalId}/counteroffer` | MISSING |

### Admin surface

| Legacy | Tow v1 target | Action |
| --- | --- | --- |
| `/api/system-settings/*` (24 routes) | `GET|PATCH /admin/tow/settings` | ADAPT (partial patch semantics) |
| — | `GET|PATCH /admin/tow/module` | MISSING |
| — | `/admin/tow/vehicle-documents` (list/get/approve/reject) | MISSING |
| — | `/admin/tow/disputes` (list/get/resolve) | MISSING |
| — | `/admin/tow/audit-events` | MISSING |
| — | `/admin/tow/payout-batches` (preview/create/get/process) | MISSING |
| — | `/admin/tow/requests/{id}/override-cancel|override-complete` | MISSING |

## 5. Required coverage confirmation

The task requires explicit confirmation for a fixed list of capabilities. Confirmed against the
composed contract and the legacy code:

| Capability | Contract operation(s) | Legacy today | Confirmed |
| --- | --- | --- | --- |
| Route (geometry/distance/duration) | `getTowRequestRoute` → `TowRouteResponse` with `RouteQuote` (meters/seconds, geometry) | No route endpoint, no polyline, no `duration_seconds` anywhere; only Haversine km and partner-provided minutes | **MISSING** |
| Partner status | `getTowPartnerStatus`, `patchTowPartnerStatus` → `PartnerTowStatusResponse` | No HTTP status resource; `partners.is_available`/subscription gates only | **MISSING** |
| Partner location | `updateTowPartnerLocation` → `PartnerLocationInput` | `PUT /api/partners/:id/location` + socket `partner_location_updated` | **PARTIAL** |
| Opportunity DTO | `listTowOpportunities` → `TowOpportunityListResponse` | `GET /api/emergency-requests/nearby` returns raw request rows with `distance` km | **MISSING** |
| Partner financial summary | `getTowPartnerFinancialSummary` → `PartnerFinancialSummaryResponse` | `GET /api/payments/stats/summary` (generic, not Tow-scoped, no `amount_cents`) | **PARTIAL** |
| Admin request detail | `adminGetTowRequest` → `AdminTowRequestDetailResponse` | `GET /api/emergency-requests/:id` (owner/partner/admin, no admin-specific DTO) | **PARTIAL** |
| Admin dispute detail | `adminGetTowDispute`, `adminListTowDisputes`, `adminResolveTowDispute` | `GET/PUT /api/disputes/*` (generic, not Tow-scoped) | **PARTIAL** |
| Admin vehicle document detail | `adminGetTowVehicleDocument`, `adminListTowVehicleDocuments`, approve/reject | No tow vehicle documents at all (only emergency request photos) | **MISSING** |
| Payout detail | `adminGetTowPayoutBatch`, `adminPreviewTowPayoutBatch`, `adminCreateTowPayoutBatch`, `adminProcessTowPayoutBatch` | `GET /api/wallets/:id` (admin) + `POST /api/wallets/withdraw`; no payout batch | **MISSING** |

All nine capabilities are reachable in the contract through named operations and schemas — no
consumer needs to invent an endpoint or DTO. The T00 consumer smoke proves this for the three
clients (`tests/contract/consumerSmoke.test.js`).

## 6. Google Maps / Routes audit (AUDIT + BOUNDARY + EVIDENCE only)

**Audit.** There is **no Google API client anywhere** in `socorre_ai_backend/src`: no
`GOOGLE_MAPS_API_KEY` usage, no Directions/Routes/Distance Matrix client, no HTTP call to
`maps.googleapis.com` (the only `googleapis` hits in `src/` are Firebase Auth OAuth metadata URLs in
`notificationService.js:23-25`). Distances are computed locally by Haversine in six SQL sites on
the tow path plus two JS implementations (§3.7). ETA is whatever the partner types into the proposal
(`estimated_time_minutes`, `TowProposalService.js:49,114,388,393`). There is no route geometry,
no polyline, no `duration_seconds` and no traffic model.

**Boundary.** T00 fixes the boundary only:

* Tow v1 consumes a **routes port** (`RouteQuote`: `total_distance_meters` integer,
  `total_duration_seconds` integer, geometry) — the contract already declares it
  (`tow-api-contract.base.openapi.yaml` `RouteQuote`).
* The deterministic harness provides `FakeMapsGateway`
  (`tests/helpers/tow/gateways/mapsGateway.js`) with a fixed route
  (`8400 m / 1320 s`, LineString) and a `failure` switch, so no Tow test needs the network.
* T05 owns the real adapter (Google Routes) and its error mapping to
  `external_dependency_unavailable`. **T00 implements no adapter and makes no external call.**

**Evidence.** `docs/evidence/t00/red-4-legacy-gateway-nondeterminism.txt` records the legacy
gateway non-determinism baseline; the probe and the mapping document record the absence of any
Google client.

## 7. Contradictions and ambiguities register

Registered, not resolved. Each item names the authorities in tension and the owning task.

| # | Type | Description | Authorities | Owner |
| --- | --- | --- | --- | --- |
| C-1 | CONTRACT AMBIGUITY | The legacy tow flow prices the proposal **client-side** (`proposed_price`), while the contract's `createTowProposal` accepts **no body** and returns a server-calculated price. Which component owns the price (partner input vs. pricing engine) is not stated in the contract text. | Issue #11; `TOW-API-CONTRACT.md` §proposals; `TOW-BUSINESS-RULE-MATRIX.md` pricing rows; `tow-api-contract.base.openapi.yaml:83-100` | T07 (+T05 pricing) |
| C-2 | CONTRACT AMBIGUITY | `TowSettingsPatch` requires `minProperties: 1` but the contract does not state the response semantics of a patch that changes nothing else (`GET` shape vs. full settings echo). Harness asserts partial semantics only. | `TOW-API-CONTRACT.md` §settings; `tow-api-contract.openapi.yaml` `TowSettingsPatch` | T02 |
| C-3 | IMPLEMENTATION DETAIL | Legacy `proposals_received` is a historical counter that is **not** decremented on withdraw; Tow v1 has no equivalent field, so the semantics of "proposal count" for radius/matching must be defined. | `g3TowProposals.test.js:489-516`; contract matching section | T06 |
| C-4 | IMPLEMENTATION DETAIL | Proposal expiry compares `new Date()` on PostgreSQL but `Date.now()` on SQLite (`EmergencyRequest.js:65-76`) — two different clock sources for the same rule. T00 provides a fake clock but it cannot control PostgreSQL `NOW()`. | `EmergencyRequest.js:65-76`; T00 deterministic foundation | T07 |
| C-5 | BUSINESS RULE AMBIGUITY | Legacy cancel sets `cancellation_by` to `'user'` for both the customer and the assigned partner (only `'admin'` differs), so `CUSTOMER_CANCELLED` vs `PARTNER_CANCELLED` cannot be derived from legacy data. | `EmergencyRequest.js:1127,1148`; `TOW-API-CONTRACT.md` `TerminalReason` | T11 |
| C-6 | IMPLEMENTATION DETAIL | Legacy `in_progress` collapses EN_ROUTE/ARRIVED/IN_TRANSIT. Backfilling historical rows into Tow v1 states is impossible without inventing timestamps. | `009:28`; `036:14`; contract `TowRequestState` | T10 |
| C-7 | CONTRACT AMBIGUITY | The contract requires `Idempotency-Key` on several operations but does not define the conflict body/`idempotency_conflict` trigger window (same key + different payload vs. same key + in-flight). | `tow-api-contract.base.openapi.yaml:29,88,107`; error enum | T09/T18 |
| C-8 | IMPLEMENTATION DETAIL | The 404 catch-all (`src/app.js:154-159`) answers `{success:false,message}` for **every** unknown path, including `/api/tow/*`. Consumers cannot distinguish "route absent" from "resource absent" until T01+ mounts the surface. | probe output; `src/app.js:154-159` | T01 |
| C-9 | IMPLEMENTATION DETAIL | `emergency_requests.status` has an `expired` value that is **never written** for requests, while `TowRequestState` includes `EXPIRED`. Dead enum member or unfinished feature — undetermined. | `009:28`; grep of writers | T10 |
| C-10 | BUSINESS RULE AMBIGUITY | Legacy tow pricing keys are stored in **reais** (`'6'/'25'/'90'/'40'`) and consumed as floats; the contract's settings are `*_cents`. Whether existing production values must be migrated or reinterpreted is a business decision. | `040:5-43`; `EmergencyRequest.js:271-310`; contract settings schemas | T02/T05 |

## 8. Tech debt register

| Item | Evidence | Impact on T01+ |
| --- | --- | --- |
| `src/controllers/emergencyRequestController_old.js` (580 lines, zero references) | grep `emergencyRequestController_old` in `src/` and `tests/` → 0 hits | Dead code; do not copy patterns from it |
| Duplicate `029_*` migration prefixes | two files under `database/migrations/` | Migration ordering risk for T01 baseline/reset |
| Unreferenced `TowProposalService` methods (`acceptProposal`, `rejectProposal`, `expireProposal`, `expirePendingProposals`, `sendExpiringNotifications`, `processProposalExpirations`, `getProposalSummary`) | route grep | Confusing dual paths (service vs. model) for proposal accept |
| `TowProposal.updateStatus` only served the removed `PATCH /:id/status` | `TowProposal.js:101-107`; `towProposals.test.js:551,561` | Dead code |
| `emergencyRequestSchemas.accept` defined but never wired | `validation.js:359-362` | `POST /:id/accept` accepts unvalidated `estimated_price`/`estimated_duration` |
| `TowProposalController.calculatePartnerDistance` unused | `TowProposalController.js:339-360` | Dead code |
| Haversine duplication: 13 SQL `6371 * acos` sites and 5 JS `calculateDistance*` sites repo-wide, of which 6 SQL + 2 JS sit on the tow path | `docs/evidence/t00/google-routes-audit.txt`; §3.7 | Single distance source required before T05/T06 |
| Envelope family sprawl (7 shapes on two prefixes) | §3.5 | Every migrated endpoint needs an envelope adapter |
| `incrementViews` is a non-atomic raw increment | `TowProposal.js:215-222` | Minor; views are not part of Tow v1 |
| `legacyRouteRegistry`/`legacyRoute` middleware + `/legacy-route-*` settings routes | `src/routes/systemSettings.js:53-69` | Unrelated to Tow v1; must not be touched by T01+ |
| `DEFAULT_NEARBY_RADIUS_KM = 15` hardcoded default | `EmergencyRequestService.js:17` | Conflicts with settings-driven radius; T06 owns the resolution |

## 9. Security review (T00 §5.10)

Scope: the Tow-relevant backend surface (`socorre_ai_backend/`) **and its git history**. No secret
value is reproduced in this document or in any T00 artifact — only locations, types and lengths.

> **Pass-2 correction.** The pass-1 review scanned only the current working tree. That missed a real
> committed secret that is still reachable from `origin/main` and `production/main` (S-11), and
> over-classified dev placeholders as P0 (S-1). Both are corrected below; S-9 is narrowed to what it
> actually proves.

| # | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| S-1 | **P2 hygiene** (re-classified in pass 2; was P0) | Dev/test placeholder literals in `docker-compose.yml` and `docker-compose-simple.yml` (8-char DB passwords, 40-char JWT secrets). These are local quick-start/homologation defaults referenced only from `quick-start.sh:5`, `README.md:81`, `SETUP_GUIDE.md:166` and `docs/GUIA-DEPLOY-HOMOLOGACAO-HOSTINGER.md:136`. **This repository contains no evidence that they were ever used in a production or customer-facing environment** — there is no production compose file and no deploy script referencing them — so P0 cannot be asserted. That also cannot be *disproven* from the repository alone: if an operator ever deployed these files as-is, this escalates to P0 and both secrets must be rotated. | `docker-compose.yml`, `docker-compose-simple.yml` (locations only, values not reproduced); `docs/evidence/t00/security-review.txt` §S-1 |
| S-2 | Medium | Legacy error path leaks raw `error.message` to the client on cancel/payment failures (potential SQL/constraint disclosure). | `emergencyRequestController.js:666-669,714-717` |
| S-3 | Low | 404/500 global handlers return a fixed message without `error.code`; no stack is leaked. | `src/app.js:154-167` |
| S-4 | Info | JWT production guard verified: `getJwtSecret()` throws in production when `JWT_SECRET` is missing/blank; dev fallback is explicit. | `src/config/jwt.js:19-28`; `docs/evidence/t00/security-review.txt` §S-4 |
| S-5 | Info | No hardcoded provider secrets (Google/Stripe/Mercado Pago/PagSeguro) found in `src/`, `scripts/`, `database/` or `tests/`. | `docs/evidence/t00/security-review.txt` §S-5 (only the T00 guard test names the keys; no literal assignment) |
| S-6 | Info | No raw GPS coordinates, `Authorization` headers or request bodies are logged; HTTP logging uses morgan `combined`. | `src/app.js`, logger config |
| S-7 | Info | No `express.static` exposure of the repository or uploads directory. | `docs/evidence/t00/security-review.txt` §S-7 |
| S-8 | Info | Uploads require authentication and store files locally under `uploads/images`, exposed through a public URL base resolved by `getPublicApiBaseUrl()`; the new tow document upload must not widen this. | `src/routes/upload.js`, `g2PhotoContract.test.js:463-529` |
| S-9 | Info | `BEGIN PRIVATE KEY` hits in the **current tracked tree** are documentation placeholders (`your-private-key-here`, `sua_private_key_aqui`) — not usable keys. **This says nothing about history: see S-11.** | `docs/evidence/t00/security-review.txt` §S-9 (4 source hits, 0 non-placeholder) |
| S-10 | Info | `node_modules` is not tracked in HEAD, but appeared in the initial commit `2f9f19cf`. No action for T00; recorded for hygiene. | `docs/evidence/t00/security-review.txt` §S-10; `git ls-files node_modules` → 0 |
| S-11 | **P0** | **Real committed secret in git history.** `socorre_ai_backend/.env` was committed in `2f9f19cf` and deleted from HEAD in `50e57ff6`, but its blob (`6e8fc90f…`, 40-hex id, not a secret) is still reachable from `origin/main`, `origin/feature/implements-tow-service` and `production/main`. It contains exactly one `FIREBASE_PRIVATE_KEY` PEM block (count = 1, **not** a placeholder) plus `FIREBASE_PRIVATE_KEY_ID`. The sibling `socorre_ai_backend/.env.production` blob (`a8867d8f…`) carried production-themed `DB_PASSWORD` (len 21) and `JWT_SECRET` (len 54) literals. The untracked local `socorre_ai_backend/.env.bak` (mode 0644, 2987 bytes) holds one PEM block of the same kind. | `docs/evidence/t00/security-review.txt` §S-11 (counts/lengths only, values never printed) |
| S-12 | **P1** | **PCI-unsafe payment payload logging in the current tree.** All three gateways log the full `paymentData` before calling the provider (`console.log('Processando pagamento …', paymentData)` at line 5 of `stripeGateway.js`, `mercadopagoGateway.js`, `pagseguroGateway.js`). `paymentData` is `{ ...req.body, userId }` (`src/routes/payments.js:48-51`) with no whitelist, and `src/services/paymentService.js:223-232` forwards `cardData`/`pixData`/`bankSlipData` into it, so client-supplied card/PIX/bank-slip data can be written to logs. | `docs/evidence/t00/security-review.txt` §S-12 |

**S-11 required external actions** (owner: operations, outside T00 scope — T00 performed no history
rewrite, no file deletion and no secret rotation): (1) revoke + rotate the Firebase service-account
key; (2) evaluate rotation of the historical production DB password and JWT secret if that
environment was ever deployed (rotating the JWT secret invalidates every issued token); (3) delete
`.env.bak` only **after** rotation (human decision); (4) consider a history purge only **after**
rotation, coordinated across every branch that contains `2f9f19cf`; (5) add a secret scanner
(gitleaks/trufflehog) to CI in a later task.

**S-12 required action** (owner: T13/T14, or T18): stop logging `paymentData`; log at most a
correlation id and the payment method. T00 registered the finding and changed no production code.

T00 introduces no new secret: `.env.test.example` contains **empty** placeholders for every
provider key and a local-only test database password (`tow_test_password`) that exists solely
inside `docker-compose.test.yml` and is never used outside the loopback test container.

## 10. T01+ readiness and blockers

**Ready.** The harness (OpenAPI gate, patch semantics, consumer discovery, consumer smoke,
deterministic foundation, PostgreSQL gate) is green and reproducible; RED evidence proves it did
not exist at the execution base; the legacy mapping document classifies every legacy endpoint,
table and enum.

**Blockers and risks carried into T01+** (no blocker prevents T00 from closing):

1. **B-1 — Tow v1 persistence is entirely absent.** T01 must create the clean-DB baseline,
   reset and admin seed before any other task; nothing in T00 fabricated Tow v1 tables.
2. **B-2 — C-1 (pricing ownership) must be resolved by T07 before `createTowProposal` can be
   implemented**, because the legacy flow and the contract disagree on who sets the price.
3. **B-3 — C-10 (reais vs. cents) must be resolved by T02/T05** before migrating the four
   `tow_*` settings keys; a wrong choice silently changes every historical price.
4. **B-4 — the fake clock cannot control PostgreSQL `NOW()`** (C-4); T07/T10 must design expiry
   comparisons so tests remain deterministic on PostgreSQL.
5. **B-5 — envelope unification is a prerequisite for the first Tow v1 endpoint** (§3.5):
   without an `{success,message,error:{code}}` writer, every new endpoint would ship a third
   envelope family.
6. **B-6 — the historical committed secret (S-11) requires an external rotation that T00 cannot
   perform.** Until the Firebase service-account key in `2f9f19cf:socorre_ai_backend/.env` is
   revoked and rotated — and the historical DB password / JWT secret are evaluated for rotation —
   the exposure stays live on `origin/main` and `production/main`. Owner: **operations** (outside
   T00 scope). T00 deliberately did not rewrite history, delete `.env.bak` or touch the secret;
   any purge must follow rotation, not precede it. S-12 is a code-level follow-up owned by
   T13/T14 (or T18), not a T00 blocker.

**Explicitly not done by T00** (scope check): no feature-flag behavior, no tow vehicle flow, no
document approval, no pricing engine, no matching/radius expansion, no proposal lifecycle, no
counteroffer, no atomic assignment, no payment orchestration, no tracking flow, no
completion/cancellation policy, no wallet/settlement/payout, no dispute resolution. No endpoint
or DTO was invented; no existing business behavior was changed.
