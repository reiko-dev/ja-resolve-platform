# MVP-03 — Legacy Subsystem Audit

> Issue: #15 — Tow Request & Lean Geographic Matching
> Execution base: `c0ae3c01774dbaaf162113cef574cb728ec8db61`
> Purpose: record what the legacy `EmergencyRequest` / `TowProposal` subsystem does today, so
> MVP-03 reuses only what is architecturally admissible and never inherits legacy semantics by
> accident.

Paths are relative to `socorre_ai_backend/`.

---

## 1. Inventory

| Artifact | Lines | Role today |
|---|---|---|
| `src/routes/emergency-requests.js` | — | mounts `/api/emergency-requests` (legacy) |
| `src/controllers/emergencyRequestController.js` | 16 route handlers + 3 static helpers (`canAccessRequest` :23, `canOperateLifecycle` :36, `notifyLifecycle` :49) | `create`, `getById`, `getByUser`, `getByPartner`, `getNearby`, `accept`, `getProposals`, `acceptProposal`, `start`, `complete`, `rate`, `cancel`, `createPayment`, `getPaymentSummary`, `getAll`, `getStats` |
| `src/services/EmergencyRequestService.js` | 174-378+ | coordinate parsing/validation, radius resolution, nearby search, creation |
| `src/models/EmergencyRequest.js` | 231-244, 450-512, 1023-1049 | JS + SQL Haversine, `findNearby`, proposal deadline guards |
| `src/models/Partner.js` | — | legacy partner model (mechanic-first) |
| `src/models/TowProposal.js`, `src/controllers/TowProposalController.js` | — | partner-supplied proposals (MVP-04) |
| `tests/tow/g3NearbyCoordinates.test.js` | — | nearby authz/coordinates/radius/order regression |
| `tests/tow/g3TowPostgres.e2e.test.js` | — | real-PostgreSQL nearby + proposal + withdraw e2e |
| `tests/tow/towProposalIdempotency.test.js` | — | legacy proposal idempotency regression |

## 2. `GET /api/emergency-requests/nearby` (the legacy "matching" surface)

`src/controllers/emergencyRequestController.js:183-201` → `src/services/EmergencyRequestService.js:296-326`
→ `src/models/EmergencyRequest.js:450-512`.

* Returns `{ success, data: requests[], count, search: { latitude, longitude, radius, coordinate_source } }`
  — **not** the canonical `TowOpportunityListResponse`, and it carries no quote at all.
* Filters `emergency_requests.status = 'pending'` and, for tow, `proposal_status = 'awaiting_proposals'`
  and `proposal_selection_deadline > now` (`src/models/EmergencyRequest.js:507-511`,
  `src/services/EmergencyRequestService.js:310-316`).
* Distance is computed in SQL as `6371 * acos(...)` (`:458`), ordered by distance (`:484`) with **no
  documented tie-break**.
* A `CASE` guard (`:464-472`) nulls out rows with NULL/out-of-range/`(0,0)` coordinates so the
  `acos` argument cannot leave `[-1, 1]`.
* Partner coordinates come from `resolvePartnerCoordinates` (`src/services/EmergencyRequestService.js:202-208`),
  which requires the authenticated partner's own `latitude`/`longitude` to be operational.
* **No** `is_available` / `is_online` / `is_verified` / `approval_status` filter is applied on the
  partner side in this path — the legacy nearby search filters **requests**, not partners.

**Disposition: IGNORE for the canonical flow.** MVP-03 needs a partner-side candidate query with a
canonical DTO and an authoritative live quote; the legacy path supplies neither, and its
`proposal_status`/deadline filters are MVP-04 semantics.

## 3. Coordinate rules (reusable)

* `src/services/EmergencyRequestService.js:56-73` — `parseCoordinate`: accepts number or numeric
  string, rejects empty/NaN/Infinity, distinguishes `provided`/`invalid`.
* `:76-78` — `isZeroZero(latitude, longitude)`.
* `:82-104` — `assertOperationalCoordinates`: finite → in `[-90,90]`/`[-180,180]` → **not `(0,0)`**,
  throwing `reason: 'not_finite' | 'out_of_bounds' | 'zero_zero'`.
* `:333-373` — `validateCreationCoordinates`: the primary pair is mandatory and must be
  operational; optional `vehicle_origin_*` / `vehicle_destination_*` pairs must be supplied
  together and, when present, operational.
* `src/controllers/partnerController.js:18` applies the same `(0,0)` rule to partner coordinates.

**Disposition: ADAPT.** MVP-03 keeps the *rule* (finite, in range, never `(0,0)`) and gives it a
single canonical owner in the Tow module (`domain/geo.js`), applied to `pickup`, `destination` and
partner location. The legacy implementation is **not** imported: it lives in `src/services/`, which
the Tow application layer must not depend on.

## 4. Legacy persistence

See `docs/evidence/mvp-03/03-persistence-decision.md` §2 for the full column-level audit of
`emergency_requests` (`database/migrations/001_baseline_schema.js:309-383`) and `tow_proposals`
(`:856-889`). Both are **IGNORE** as storage for the canonical flow.

## 5. Legacy money / units

* `emergency_requests.estimated_price` / `final_price`: `decimal(10,2)` BRL (`:329-330`).
* `tow_proposals.proposed_price`: `decimal(10,2)` BRL (`:860`), partner-supplied.
* Canonical MVP-02 money: **integer cents** (`amount_cents`, `currency: 'BRL'`), produced only by
  the authoritative Google Routes quote.

**Disposition: IGNORE.** MVP-03 never reads or writes legacy money columns and never accepts a
client- or partner-supplied price in the canonical flow.

## 6. Legacy vehicle representation

* `emergency_requests.vehicle_info` — free-text JSON blob (`:315`), plus `vehicle_plate`,
  `vehicle_model`, `vehicle_year` **strings** (`:316-318`), `vehicle_type` string (`:368`).
* No vehicle class enum, no `weight_kg`, no capacity relationship to the partner's vehicle.

**Disposition: IGNORE.** Canonical `CustomerVehicle` is typed (`class` ∈ `VEHICLE_CLASSES`,
`weight_kg` integer, `year` integer) and validated by `domain/vehicle-classes.js` +
`domain/tow-request.js`.

## 7. Legacy distance formula (radius-filter audit)

| Location | Formula | Guard |
|---|---|---|
| `src/models/EmergencyRequest.js:231-244` | JS Haversine, `earthRadiusKm = 6371`, `2 * Math.atan2(...)` | caller-side |
| `src/models/EmergencyRequest.js:458` | SQL `6371 * acos(cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) + sin(radians(?)) * sin(radians(latitude)))` | `CASE` at `:464-472` |
| `src/models/EmergencyRequest.js:1023, 1049` | same SQL expression for partner-side listing | same pattern |
| `tests/tow/mvp02/towRouteProviderBoundary.test.js:52` | **architecture guard**: `/\b6371\b|\bhaversine\s*\(|\btoRadians\s*\(|Math\.acos\s*\(/i` scanned over every file under `src/modules/tow` and `tests/helpers/tow` | asserts `offenders === []` |

**Disposition: REPLACE.** MVP-03 introduces a single pure primitive in
`src/modules/tow/domain/geo.js`:

* numerically stable `atan2` form (not the `acos` form, which loses precision at small distances);
* IUGG mean Earth radius in **metres** (not the legacy `6371` km constant, and not the legacy
  expression verbatim);
* used **only** by the matching policy for radius filtering and deterministic ordering;
* never used by, imported by, or reachable from the pricing/route authority
  (`domain/pricing.js`, `domain/route.js`, `application/quote-service.js`, `adapters/routes/**`).

Because the MVP-02 guard is module-wide, MVP-03 **narrows** it (see
`docs/evidence/mvp-03/01-current-state-delta.md` §3): the ban stays in force for the pricing/route
authority files and is strengthened with a new assertion that they never import the primitive;
exactly one file may own it. `docs/evidence/mvp-03/11-negative-controls.md` records the proof that
removing the radius filter turns the new tests RED.

## 8. Idempotency infrastructure (audit result: absent)

* No occurrence of `Idempotency-Key`, `idempotency_key` or `idempotency` in `src/` outside the
  frozen contract enum value `idempotency_conflict`
  (`docs/tow/tow-api-contract.base.openapi.yaml:1808`).
* No idempotency table, column, index or middleware exists in `database/migrations/`.
* `tests/tow/towProposalIdempotency.test.js` covers **legacy proposal** idempotency (duplicate
  pending proposal per partner per request, enforced by the partial unique index
  `tow_proposals_one_pending_per_partner`), which is MVP-04 scope and is **not** reused.
* The canonical contract **requires** the header on `POST /tow/requests`
  (`docs/tow/tow-api-contract.base.openapi.yaml:1064-1068`: `required: true`, `minLength: 8`,
  `maxLength: 128`).

**Disposition: MISSING → implement the smallest correct Tow-scoped mechanism**: a persisted
`(customer_id, idempotency_key)` UNIQUE constraint plus a canonical payload fingerprint, so that a
retry with the same key and payload returns the same request, a retry with a different payload is
`idempotency_conflict`, and two concurrent identical requests produce exactly one row (the unique
constraint is the authority; the pre-read is only an optimisation).

## 9. Auth / request context

* `src/middleware/auth.js:9-55` verifies the JWT (claim `userId`), rejects revoked tokens, loads
  `users LEFT JOIN partners` and exposes `req.user` with `users.*`, `partner_id`, `partner_type`.
* Legacy handlers read `req.user.id` and resolve the partner with
  `knex('partners').where('user_id', req.user.id).first()` (e.g.
  `src/controllers/emergencyRequestController.js:208`).

**Disposition: REUSE** the middleware; the Tow module resolves partner identity through
`req.user.partner_id` / `req.user.partner_type` (already the accepted Tow HTTP pattern in
`src/modules/tow/http/middleware.js`) and through the `PartnerRepository` port — never with an
inline Knex query inside a controller.

## 10. Mounting

`src/app.js:135` mounts the legacy `/api/emergency-requests` router; `:140` mounts
`/api/tow-proposals`; `:151-155` mounts the Tow module at `/api/tow` and `/api/admin/tow`. MVP-03
adds routes only inside the Tow module router; `app.js` is not modified.
