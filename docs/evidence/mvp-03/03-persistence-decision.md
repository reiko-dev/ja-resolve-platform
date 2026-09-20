# MVP-03 — Persistence Decision (PHASE D)

> Issue: #15 — Tow Request & Lean Geographic Matching
> Execution base: `c0ae3c01774dbaaf162113cef574cb728ec8db61`
> Decision: **Option B — a new canonical `tow_requests` table.**
> Date of decision: before any MVP-03 production code was written.

---

## 1. The two options

**Option A — extend the legacy `emergency_requests` table** and treat it as the canonical
`TowRequest` store.

**Option B — create a new canonical `tow_requests` table** owned by the Tow module, leaving
`emergency_requests` untouched for the legacy mechanic/tow tracks.

---

## 2. Evidence

### 2.1 Legacy `emergency_requests` schema
`database/migrations/001_baseline_schema.js:309-383`

| Column | Definition | Conflict with the canonical contract |
|---|---|---|
| `type` | `enum('mechanical','fuel','tire','battery','other')` **NOT NULL** | a Tow request has no mechanical `type`; every canonical insert would have to invent one |
| `status` | `enum('pending','accepted','in_progress','completed','cancelled','expired')` default `pending` | not the canonical `TowRequestState` (`SEARCHING…DISPUTED`, `docs/tow/tow-api-contract.base.openapi.yaml:1157-1159`); no `NEGOTIATING`/`ASSIGNED`/`EN_ROUTE`/…, and `pending` means "awaiting a mechanic" |
| `request_type` | `text` nullable, **no constraint** | the tow/mechanic discriminator is unconstrained free text; two writers can disagree |
| `proposal_status` | `text` nullable, no constraint; legacy semantics `awaiting_proposals` | MVP-04 lifecycle state living in the MVP-03 discovery table |
| `proposal_selection_deadline` | `timestamp` nullable | legacy `findNearby` filters on it (`src/services/EmergencyRequestService.js:310-316`), so discovery cannot be implemented without importing MVP-04 expiry semantics |
| `latitude`/`longitude` | `decimal(10,8)`/`(11,8)` **NOT NULL** | one point only; the canonical request needs **pickup and destination** (`vehicle_origin_*`/`vehicle_destination_*` are nullable and legacy-named) |
| vehicle data | `vehicle_info text` (free JSON), `vehicle_plate`, `vehicle_model`, `vehicle_year` strings | the canonical contract requires a typed `CustomerVehicle` with a `class` enum and `weight_kg`, which the table cannot express |
| money | `estimated_price`/`final_price` `decimal(10,2)` (BRL) | the canonical money contract is **integer cents** (`amount_cents`); mixing units in one table is a permanent footgun |
| radius | `search_radius_km` `decimal(8,2)` nullable | canonical matching needs a **required, positive** frozen radius |
| `address` | `text` **NOT NULL** | canonical `GeoPoint.formatted_address` is optional |
| proposal FK | `selected_proposal_id` | MVP-04 assignment state inside the request row |
| `view_count`/`response_count`/`rating`/`review_comment` | legacy engagement/review columns | MVP-06 scope |

### 2.2 Legacy `tow_proposals` schema
`database/migrations/001_baseline_schema.js:856-889` — `emergency_request_id` FK, partner-supplied
`proposed_price decimal(10,2)`, `estimated_time_minutes`, `expires_at NOT NULL`, status enum
`pending/accepted/rejected/expired/withdrawn` (canonical vocabulary is `ACTIVE/…`), plus a partial
unique index `tow_proposals_one_pending_per_partner` (`:886-889`). This is a **competing proposal
model**; extending `emergency_requests` would put the MVP-03 discovery rows next to it and invite
accidental coupling.

### 2.3 Architectural boundary
The accepted Tow module (`docs/tow/TOW-MODULE-CONTRACT.md`, MVP-01) is a clean-architecture
module: `domain` and `application` must not touch legacy models, and `tests/tow/mvp01/towArchitectureBoundary.test.js`
enforces it by source scan. A canonical aggregate persisted in `emergency_requests` would force the
Tow application layer to speak the legacy table's vocabulary (mechanic `type`, `pending` status,
BRL decimals, free-text `vehicle_info`), i.e. it would import the legacy model by the back door.

### 2.4 Data safety / isolation
`emergency_requests` is written by the live legacy flow
(`src/services/EmergencyRequestService.js:378+`, `src/models/EmergencyRequest.js`). Adding
canonical Tow rows there means:
* legacy `GET /api/emergency-requests/nearby` (`request_type='tow'`, `proposal_status='awaiting_proposals'`)
  could surface canonical MVP-03 requests to legacy clients with a different DTO — an unintended
  cross-track leak;
* a future legacy migration/backfill would silently rewrite canonical rows.

Option B keeps the two tracks physically separate: `/api/tow/**` never reads or writes
`emergency_requests`, and the legacy endpoints stay byte-identical for regression.

### 2.5 PR #9 (mechanics flow) safety
Option B adds **no column, index, constraint or default** to any table used by the mechanic flow.
The only shared tables read by MVP-03 are `partners`, `tow_vehicles` and `tow_vehicle_documents`
(read-only, through Tow adapters). Option A would have added a nullable column set plus new enum
values to a table on the mechanic critical path — a strictly larger blast radius.

---

## 3. Decision

**Option B.** A new migration `database/migrations/004_mvp03_tow_requests.js` creates
`tow_requests` with:

* `id` — surrogate PK;
* `customer_id` — FK → `users(id)`, `ON DELETE CASCADE`, NOT NULL (ownership authority);
* `state` — CHECK against the canonical `TowRequestState` enum, NOT NULL, default `SEARCHING`;
* `terminal_reason` — nullable, CHECK against the canonical `TerminalReason` enum (NULL in MVP-03);
* `pickup_latitude`/`pickup_longitude`, `destination_latitude`/`destination_longitude` — NOT NULL
  (the frozen input shape makes both mandatory);
* `pickup_formatted_address`/`destination_formatted_address` — nullable;
* `vehicle_class` — CHECK against `VEHICLE_CLASSES`, NOT NULL;
* `vehicle_make`, `vehicle_model` — NOT NULL; `vehicle_year` (CHECK range), `vehicle_weight_kg`
  (CHECK `>= 1`), `vehicle_plate` — nullable;
* `problem_description` — NOT NULL, length CHECK; `observations` — nullable, length CHECK;
* `matching_radius_km` — NOT NULL, CHECK `> 0` (the frozen `tow_initial_radius_km` at creation);
* `idempotency_key` + `idempotency_fingerprint` — NOT NULL, with
  `UNIQUE (customer_id, idempotency_key)` (the concurrency authority for `POST /tow/requests`);
* `created_at`/`updated_at`;
* indexes `(customer_id, created_at)`, `(state, created_at)`.

No PostGIS, no extension, no geometric type: coordinates are plain `decimal(10,8)`/`(11,8)`, the
same representation already used by `partners` and `tow_vehicles`, and the radius filter is a
bounded box query plus a pure domain geodesic comparison.

**Not persisted in MVP-03** (deliberate): route distance, route duration, polyline, price,
assignment, proposal, payment, search expiry. Price is always the live MVP-02 quote.

---

## 4. Migration safety

* `004` only creates a new table and its indexes/constraints; it does not alter or backfill any
  existing table, so it is safe on a populated production database.
* `down()` drops exactly what `up()` created.
* The T01 clean-baseline gate (`scripts/tow/db-baseline.js`, `scripts/tow/run-db-baseline-gate.js`)
  is updated to pin `004` and to require `tow_requests` in `REQUIRED_TABLES`. `tow_requests` is
  **not** added to `ALLOWED_NON_EMPTY_TABLES` (a freshly migrated database must have zero tow
  requests), and the "exactly one admin / no functional data" invariant is unchanged.
* The schema fingerprint is re-captured intentionally and proven deterministic across two fresh
  migration runs.
