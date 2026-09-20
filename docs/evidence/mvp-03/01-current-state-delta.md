# MVP-03 — Current-State Delta

> Issue: #15 — Tow Request & Lean Geographic Matching
> Execution base: `c0ae3c01774dbaaf162113cef574cb728ec8db61` (post-bookkeeping `main`)
> Branch: `feature/mvp-03-tow-request-matching`
> Scope of this document: what already exists, what is reused, what is adapted, what is missing.

This artifact was produced **before** any MVP-03 production code was written
(only the PHASE B bookkeeping correction of `docs/tow/TOW-TASK-GRAPH.yaml` preceded it).

Paths are relative to `socorre_ai_backend/` unless the path starts with `docs/` or `scripts/`
(repository root).

---

## 1. Required capability → existing implementation → disposition

| # | Required MVP-03 capability | Existing implementation (file:line) | Disposition |
|---|---|---|---|
| 1 | Canonical `TowRequest` aggregate (identity, state, coordinates, vehicle, problem, radius, timestamps) | none. `src/modules/tow/domain/` has `tow-vehicle.js`, `pricing.js`, `route.js`, `geo.js`, `eligibility.js` — no request aggregate. `docs/tow/tow-api-contract.base.openapi.yaml:1360-1390` freezes the `TowRequest` DTO | **MISSING** (new `domain/tow-request.js`) |
| 2 | Canonical request states | frozen enum `docs/tow/tow-api-contract.base.openapi.yaml:1157-1160` (`SEARCHING…DISPUTED`). No JS constant exists anywhere in the Tow module | **MISSING** (new domain constant; MVP-03 writes only `SEARCHING`) |
| 3 | Geo primitives (finite, range) | `src/modules/tow/domain/geo.js:16-46` — `requireCoordinate` + `validateGeoPoint` (frozen WGS84 range, frozen copy) | **REUSE** (unchanged; MVP-03 calls it) |
| 4 | `(0,0)` operational-invalid rule | the project rule exists only in the **legacy** subsystem: `src/services/EmergencyRequestService.js:76-78` (`isZeroZero`) and `:82-104` (`assertOperationalCoordinates` → `reason: 'zero_zero'`), plus `src/controllers/partnerController.js:18`. The new Tow module has **no** equivalent | **ADAPT** (add one canonical predicate to `domain/geo.js` and apply it to pickup, destination *and* partner location — one rule, one owner) |
| 5 | Geodesic distance for radius filtering + deterministic ordering | the legacy formula is `6371 * acos(...)` in SQL: `src/models/EmergencyRequest.js:231,237-244` (JS) and `:458,1023,1049` (SQL), with a `CASE` guard at `:464-472`. The new Tow module deliberately has **no** distance primitive (`tests/tow/mvp02/towRouteProviderBoundary.test.js:233-240` asserts the module is Haversine-free) | **REPLACE** (new pure geodesic primitive, used **only** by matching; see §3) |
| 6 | Vehicle classes + weight policy | `src/modules/tow/domain/vehicle-classes.js:9-14,29-31` (`VEHICLE_CLASSES`, `WEIGHT_REQUIRED_CLASSES`, `requiresWeight`) and `src/modules/tow/domain/compatibility.js:21-50` (`isCompatible`: class support + capacity + mandatory weight) | **REUSE** (MVP-03 calls both; no second matrix) |
| 7 | Required-document policy | `src/modules/tow/domain/documents.js:19` (`REQUIRED_DOCUMENT_TYPES = ['vehicle_license']`), `:41-63` (`effectiveDocumentStatus`, `isDocumentValid`, `areRequiredDocumentsSatisfied`) | **REUSE** |
| 8 | Central eligibility composition | `src/modules/tow/domain/eligibility.js:28-59` (`evaluateEligibility`: module → partner type → active vehicle → required docs → compatibility) and `src/modules/tow/application/eligibility-service.js:22-48` | **ADAPT** (call it from a new MVP-03 matching policy; do not fork it) |
| 9 | Module gate before any Tow business | `src/modules/tow/application/module-service.js` (`assertNewBusinessAllowed`), `src/modules/tow/domain/availability.js:27-35` (`isModuleEnabled`), canonical code `service_module_disabled` in `src/modules/tow/domain/errors.js:12-24` | **REUSE** |
| 10 | Single matching radius setting | `src/modules/tow/domain/settings.js:14-18` declares `tow_initial_radius_km` (default 15) and `tow_max_radius_km` (default 50); `src/modules/tow/application/settings-service.js:36-46` (`get`) returns typed values | **REUSE** (no new setting, no progressive expansion) |
| 11 | Authoritative route + price | `src/modules/tow/application/quote-service.js` (`quoteTow`), `src/modules/tow/domain/pricing.js`, `src/modules/tow/adapters/routes/google-routes-adapter.js` | **REUSE** (opportunity quote = the live MVP-02 quote; nothing is persisted) |
| 12 | Partner identity port | `src/modules/tow/application/ports.js:42-43` typedef `PartnerRepository` with a single `findById` returning `{ id, type }`; adapter `src/modules/tow/adapters/persistence/partner-repository.js:9-16` | **ADAPT** (extend the same port + adapter with the canonical operational projection and a bounded candidate query) |
| 13 | Partner operational columns | `database/migrations/001_baseline_schema.js:246-306`: `type` enum incl. `tow` (`:249`), `latitude`/`longitude` nullable (`:254-255`), `is_verified` (`:264`), `is_available` (`:265`), `is_online` (`:266`), `approval_status` (`:295`); indexes `(latitude, longitude)` (`:302`) and `(type, is_available, is_verified)` (`:304`) | **REUSE** (read-only; the new module never imports the legacy `Partner` model) |
| 14 | Candidate discovery query | none in the new module. The legacy partner-side search (`src/services/EmergencyRequestService.js:296-326` → `src/models/EmergencyRequest.js:450-512`) searches **requests**, not partners, and filters `status='pending'` / `proposal_status='awaiting_proposals'` / `proposal_selection_deadline > now` — legacy lifecycle semantics that MVP-03 must not import | **REPLACE** (new bounded candidate query in a new matching adapter) |
| 15 | Tow request persistence | none. `database/migrations/003_mvp01_tow_foundation.js` created `service_modules`, `tow_vehicles`, `tow_vehicle_documents` only | **MISSING** (new migration `004_mvp03_tow_requests.js`) |
| 16 | Idempotency infrastructure | platform-wide: **NOT PRESENT**. No `Idempotency-Key` handling, no idempotency table/column anywhere in `src/` or `database/migrations/` (audit: `docs/evidence/mvp-03/02-legacy-audit.md` §8). The contract requires the header (`docs/tow/tow-api-contract.base.openapi.yaml:1064-1068`) and the error code `idempotency_conflict` is already in the frozen enum (`:1808`) | **MISSING** (smallest correct Tow-scoped solution: persisted `(customer_id, idempotency_key)` UNIQUE + payload fingerprint) |
| 17 | Tow HTTP stack (thin controllers, authz middleware, error mapper, serializer) | `src/modules/tow/http/routes.js`, `middleware.js` (`requireAdmin`, `requireTowPartner`), `error-mapper.js` (TowError → envelope), `serialize.js` (`toIso`), `mount.js`; mounted at `/api/tow` and `/api/admin/tow` by `src/app.js:151-155` | **REUSE / ADAPT** (same router, same error mapper, same envelope helpers; add two controllers) |
| 18 | Customer authz pattern | `src/middleware/auth.js:9-55` resolves `req.user` from `users LEFT JOIN partners` (`partner_id`, `partner_type`); `src/modules/tow/http/middleware.js` implements the Tow-specific 401/403 envelopes | **REUSE** |
| 19 | Customer request rehydration (`GET /tow/requests/{requestId}`) | frozen contract `docs/tow/tow-api-contract.base.openapi.yaml:53-67`; `docs/tow/tow-api-contract.openapi.yaml:77-78` composes it. No implementation | **MISSING** |
| 20 | Customer request list (`GET /tow/requests`) | frozen contract `docs/tow/tow-api-contract.openapi.yaml:26-76` (discovery/recovery endpoint). No implementation | **MISSING** (implemented — it is the documented recovery path and is straightforward) |
| 21 | Partner opportunities (`GET /tow/partner/opportunities`) | frozen contract `docs/tow/tow-api-contract.openapi.yaml:195-209`; response schema `TowOpportunityListResponse` (items: `request`, `proposed_price`, `route_quote`). No implementation | **MISSING** |
| 22 | Legacy tow endpoints (regression surface only) | `src/routes/emergency-requests.js` (nearby/create/start/complete/accept/…), `src/controllers/emergencyRequestController.js`, `src/services/EmergencyRequestService.js`, `src/models/EmergencyRequest.js`, `src/models/TowProposal.js`, `src/controllers/TowProposalController.js` | **IGNORE for the canonical flow** (kept for regression; see §2) |
| 23 | Legacy `emergency_requests` / `tow_proposals` schema | `database/migrations/001_baseline_schema.js:309-383` (mechanic-first table with tow columns bolted on) and `:856-889` (`tow_proposals`, partner-supplied price) | **IGNORE** (evidence/migration input only; see §4) |
| 24 | Legacy matching tests | `tests/tow/g3NearbyCoordinates.test.js` (nearby authz, coordinates incl. `(0,0)`, radius, distance ordering) and `tests/tow/g3TowPostgres.e2e.test.js` (real-PostgreSQL nearby/proposal/withdraw) | **IGNORE for the new flow / KEEP GREEN** (they exercise `/api/emergency-requests`, which is untouched) |

---

## 2. Legacy boundary — what is evidence and what is architecture

The legacy `EmergencyRequest` subsystem is **evidence and migration input, not the architecture**.

| Legacy artifact | What it does today | Why it cannot be the MVP-03 flow |
|---|---|---|
| `src/controllers/emergencyRequestController.js:183-201` (`getNearby`) | returns `data: requests[]` + a `search` block (not the canonical `TowOpportunityListResponse`) | DTO and envelope differ from the frozen contract |
| `src/services/EmergencyRequestService.js:296-326` (`findNearby`) | lists **requests** for a partner, filtered by `status='pending'`, `proposal_status='awaiting_proposals'` and a **proposal selection deadline** | imports MVP-04 lifecycle semantics (proposal deadline) into discovery |
| `src/services/EmergencyRequestService.js:378+` (`createRequest`) | writes `emergency_requests` with free-text `vehicle_info`, `estimated_price`, `request_type` text | no canonical vehicle class/weight, no canonical state machine, money in BRL decimals |
| `src/models/EmergencyRequest.js:450-512` (`findNearby`) | SQL `6371 * acos(...)` distance, ordered by distance, plus a `CASE` guard for `(0,0)` | distance authority lives in the legacy model, and the SQL ordering has no documented `partner_id` tie-break |
| `src/models/TowProposal.js` + `src/controllers/TowProposalController.js` | partner-supplied `proposed_price` / `estimated_time_minutes` | MVP-04 scope; explicitly excluded from MVP-03 |
| `database/migrations/001_baseline_schema.js:309-383` | `emergency_requests.status` enum is `pending/accepted/in_progress/completed/cancelled/expired`; `request_type` and `proposal_status` are unconstrained `text`; `search_radius_km` nullable; `estimated_price`/`final_price` decimal BRL | incompatible state model, incompatible money/units, no DB-level canonical invariants |
| `database/migrations/001_baseline_schema.js:856-889` | `tow_proposals.proposed_price` decimal BRL, `estimated_time_minutes`, `status` enum `pending/accepted/…` | a second, competing proposal vocabulary (`pending` vs canonical `ACTIVE`) |

**Rules enforced in this delivery**

1. `src/modules/tow/domain/**` and `src/modules/tow/application/**` import **no** legacy model, service or controller. This is asserted by a source-scan test (`tests/tow/mvp03/towArchitectureBoundary.test.js`).
2. The only legacy contact is a **narrow, justified adapter read**: `adapters/persistence/partner-repository.js` and `adapters/persistence/matching-repository.js` read the shared `partners`, `tow_vehicles` and `tow_vehicle_documents` tables through Knex — never through `src/models/Partner.js`.
3. Legacy endpoints stay mounted and green for regression (`tests/tow/g3NearbyCoordinates.test.js`, `tests/tow/g3TowPostgres.e2e.test.js`, `tests/tow/towPostgres.e2e.test.js`, `tests/tow/towProposalIdempotency.test.js`), but they are **not** the MVP-03 surface.
4. `/api/tow/**` never returns a legacy `emergency_requests` row and never writes one.

---

## 3. Geo authority boundary (pricing distance vs. matching distance)

| Concern | Authority | File |
|---|---|---|
| Price, route legs, duration, polyline | **Google Routes** (MVP-02), via the `RouteProvider` port; a provider failure is `external_dependency_unavailable` and produces **no** price | `src/modules/tow/adapters/routes/google-routes-adapter.js`, `src/modules/tow/application/quote-service.js` |
| Radius filtering + deterministic ordering only | **local geodesic primitive** (pure domain), never persisted, never sent to the client as a price/route | `src/modules/tow/domain/geo.js` (new `geodesicDistanceMeters`) |

The MVP-02 architecture suite contains a module-wide guard
(`tests/tow/mvp02/towRouteProviderBoundary.test.js:233-240`, pattern at `:52`) that forbids the
tokens `6371`, `haversine(`, `toRadians(` and `Math.acos(` anywhere under `src/modules/tow`. That
guard was written when the module had no matching at all; MVP-03 legitimately introduces a
*discovery* distance, so the guard is the first thing a reviewer should check for weakening.

**It is kept in full — byte-identical, zero tokens removed, zero files exempted.** No allowlist,
no path exclusion, no regex relaxation and no `// eslint-disable`-style escape was added to
`tests/tow/mvp02/towRouteProviderBoundary.test.js`. The file is unmodified in this delivery
(proved by hash in `docs/evidence/mvp-03/11-negative-controls.md`). Ownership is asserted
*instead of* relaxation, by three new MVP-03 tests:

* the primitive is the numerically stable `atan2` formulation using the IUGG mean Earth radius
  **in metres** (`EARTH_MEAN_RADIUS_METERS = 6371008.8`), which the banned `\b6371\b` token cannot
  match — the legacy `6371 * acos(...)` expression is never reused, and `Math.acos` is never used;
* exactly **one** file (`src/modules/tow/domain/geo.js`) may define the primitive, and a test
  asserts that no other file in the module contains the distance formula;
* the **pricing/route authority** (`domain/pricing.js`, `domain/route.js`,
  `application/quote-service.js`, `adapters/routes/**`) must never import or reach the geodesic
  primitive, so a price can never be computed from it.

The identifier chosen for the degrees→radians conversion is `degreesToRadiansValue`, precisely
because the case-insensitive `\btoRadians\s*\(` guard would otherwise match a naive `toRadians(`
name. The guard therefore remains a true invariant: it still forbids the legacy formula
everywhere in the module, and MVP-03's primitive is a deliberately different construction.

See `docs/evidence/mvp-03/02-legacy-audit.md` §7 for the full audit of the legacy formula and
`docs/evidence/mvp-03/11-negative-controls.md` for the proof that a radius-filter bypass turns RED.

---

## 4. Persistence decision (PHASE D)

See `docs/evidence/mvp-03/03-persistence-decision.md`. Summary: **option B — a canonical
`tow_requests` table** — because option A (extend `emergency_requests`) cannot satisfy the
canonical contract without inheriting historical semantics (mechanic-first `status` enum,
unconstrained `request_type`/`proposal_status`, BRL decimal money, free-text `vehicle_info`,
nullable `search_radius_km`, and MVP-04 proposal columns already present).

---

## 5. What MVP-03 deliberately does **not** touch

* MVP-04 scope: proposals, counteroffers, expiry, snapshots, accept, assignment, `tow_proposals`.
* MVP-05/06 scope: en-route/arrived/in-transit/finish, tracking, cancellation, payment, disputes,
  reviews, payouts, partner status/location endpoints, partner debt.
* Legacy `emergency_requests` behaviour, routes, controllers, services and models.
* #31, #33, production/VPS configuration.
