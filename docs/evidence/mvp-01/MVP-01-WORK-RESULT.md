# MVP-01 Work Result

## Status
READY_FOR_EXTERNAL_REVIEW

## Base / Branch / Head
- Repository: `socorre-system`
- Base (execution): `c8e40d71dd23c32a76050c05518353b6d030753f` (post-merge main of PR #34, Tow MVP replan; T00/T01 ACCEPTED)
- Branch: `feature/mvp-01-tow-foundation`
- Implementation head: `cd509eaf283729426e5f83588fc6e07e16a3ecbf`
- Push / PR / merge: **not performed** (executor stops before Phase J; orchestrator runs Muse then opens the PR with `Closes #13`)

## Current-State Delta
Delivered as its own required artifact before any code:
`docs/evidence/mvp-01/01-current-state-delta.md` maps every MVP-01 capability →
existing implementation (`file:line`) → REUSE/ADAPT/REPLACE/MISSING. Summary:
- no Tow v1 module/vehicle/document vocabulary existed; `partners.type='tow'`
  and `system_settings` are the only reusable assets;
- partner onboarding documents (`partner_documents`, `DocumentService`) are a
  different entity and were **not** overloaded;
- the legacy `emergency_requests`/`tow_proposals` flow is out of MVP-01 scope
  and untouched.

## Architecture
Clean module under `src/modules/tow/`:
- `domain/**` — pure: identity, errors, vehicle classes, pricing, vehicle
  invariants, document policy, availability policy, compatibility policy,
  eligibility composition, settings schema. No Express/Knex/fs/provider import.
- `application/**` — services + ports only; depends on ports, never adapters.
- `adapters/**` — Knex persistence, local file storage, system clock.
- `http/**` — thin controllers + DTO serializers + canonical error mapper.
- `composition.js` — the only place pure layers meet infrastructure.
Boundary is enforced by `tests/tow/mvp01/towArchitectureBoundary.test.js`
(domain/application import only relative pure files; HTTP controllers import no
persistence client; no hidden `.only`/`test.skip`).

## Module
- Canonical identity `module_key=tow`, `service_key=tow`, `partner_type=tow`
  (`domain/identity.js`), single DB-constrained row in `service_modules`.
- Admin-only `GET|PATCH /api/admin/tow/module`; idempotent toggle (repeated
  same-state toggle writes nothing and keeps the first reason); metadata
  `enabled`, `disabled_reason`, `updated_by`, `updated_at`.
- Public `GET /api/tow/module-status` (contract has no security on this path).
- Central availability policy (`isModuleEnabled` / `assertModuleEnabled`) throws
  the canonical `service_module_disabled` (409).
- MVP graceful-drain contract exposed: blocks new business, preserves
  administration, allows ASSIGNED to drain; advanced SEARCHING/NEGOTIATING
  closure and disable races deliberately deferred to #33.

## TowVehicle
- `tow_vehicles` table + domain + API (`/api/tow/vehicles` CRUD,
  `/activate`, `/deactivate`), partner-owned via `req.user.partner_id`.
- **At most one active per partner**: PostgreSQL partial unique index
  `tow_vehicles_one_active_per_partner` plus transactional activation that
  deactivates siblings; a unique violation maps to `conflict`.
- Canonical pricing persisted as integer cents + `included_km` decimal:
  `minimum_charge_cents`, `included_km`, `price_per_additional_km_cents`.
- `(partner_id, plate)` uniqueness, CHECK constraints for year/weight/cents,
  equipment-type and vehicle-class vocabularies.
- `document_status` is derived from the vehicle documents for every response.

## Documents
- `tow_vehicle_documents` table; storage behind a `FileStorage` port (local
  adapter only in infrastructure).
- Statuses `pending|approved|rejected|expired` (DB CHECK). `expires_at` in the
  past makes an approved document effectively `expired` for eligibility.
- Partner upload/list/delete scoped to the owning partner; admin
  list/get/approve/reject under `/api/admin/tow/vehicle-documents`.
- A TowVehicle is operational only with the required document
  (`vehicle_license`) approved and valid.

## Compatibility
- Central pure policy `domain/compatibility.js`:
  requested class ∈ `supported_vehicle_classes`, requested weight ≤
  `max_towed_weight_kg`, weight/PBT mandatory for `medium_truck`/`heavy_truck`.
- Canonical classes `motorcycle|light_vehicle|medium_truck|heavy_truck`,
  equipment `flatbed|wheel_lift|heavy_wrecker`.
- Operational eligibility composition
  (`module + active vehicle + valid documents + compatibility`) is one pure
  function plus an application service (`GET`-less seam for MVP-03).

## Migrations
- New deterministic `003_mvp01_tow_foundation.js`; `001/002` and
  `database/migrations-legacy/**` untouched.
- Structural seed: exactly one `service_modules` row (`tow/tow/tow`), no
  functional data. New fingerprint:
  `37cee47edc8dd1084786ab5fe3c32511c71b9a4a2788f67406391916c7cc0f59`
  (identical across reset+migrate runs).
- T01 expectations updated **deterministically**: the gate and the T01 e2e
  suite derive the applied-migration list from `database/migrations/*.js`;
  `db-baseline.js` requires the 3 new tables and allows exactly one
  `service_modules` row (with a specific assertion), keeping the
  "no functional data / exactly one admin" guarantees intact.
- Details: `docs/evidence/mvp-01/10-schema-migration-notes.md`.

## Tests
New focused suites (`tests/tow/mvp01/`): UNIT (domain 25, eligibility service 5),
API (14), AUTHZ (5), SEC/architecture (4), DB real-PG (6),
CONC real-PG (3) = **62 tests**, no `.only`/`test.skip`/relaxed expectations.

| Gate | Result |
| --- | --- |
| `npm run validate:openapi` | PASS |
| `npm run test:contract` | 5 suites / 62 tests PASS |
| `npm run verify:tow` | GREEN (5/5 stages incl. PostgreSQL) |
| `npx jest tests/tow --runInBand` | 21 passed / 5 skipped suites · 400 passed / 57 skipped · 0 failures |
| `npm run test:db-baseline` | GREEN (fresh volume; reset+migrate fprints identical) |
| `npx jest --runInBand` (full) | 54 passed / 5 skipped suites · **824 passed / 57 skipped / 0 failures** |
| MVP-01 real-PG suites | `towPersistence.e2e` 6/6 · `towVehicleConcurrency.e2e` 3/3 |
| T01 baseline e2e (real PG) | 33/33 |
| Legacy PG tow e2e | `towPostgres` 2/2 · `g3TowPostgres` 7/7 |

Evidence logs: `02-red-offline.txt` (RED), `06-openapi-contract.txt`,
`07-verify-tow.txt`, `08-full-jest.txt`.

## PostgreSQL Evidence
Real PostgreSQL 14 in the disposable T01/T00 container (always torn down):
- `03-db-baseline-gate.txt` / `.json` — empty DB → migrate 3 migrations → one
  admin → clean baseline (32 tables) → guarded reset → same fingerprint ×2 →
  teardown verified (no container/volume/network left);
- `04-postgres-mvp01.txt` — migration creates the tables; module key unique;
  **partial unique index rejects a second active vehicle**; FKs cascade;
  **two concurrent activations leave exactly one active vehicle**; repeated
  toggles keep one canonical row; parallel creates leave zero active;
- `05-postgres-t01-and-legacy.txt` — updated T01 baseline e2e 33/33 and the
  legacy PG tow suites unchanged.

## Regression
- Post-T01 baseline preserved: contract 62/62, safety suites green,
  OpenAPI PASS, `verify:tow` GREEN.
- Full Jest rose from 771 passed / 48 skipped / 0 failures to
  824 passed / 57 skipped / 0 failures (all added tests; no pre-existing test
  modified except the two T01 baseline expectations, by design).
- `tests/setup.js` isolates Tow document uploads to the OS temp dir.

## Muse Review
pending — the orchestrator runs Muse Sparks 1.3 Free on the frozen
implementation HEAD `cd509eaf283729426e5f83588fc6e07e16a3ecbf`.

## Scope
- MVP-02 touched: NO
- Phase 2/#33 touched: NO
- #31 touched: NO
- production/VPS touched: NO
- Google Routes / TowRequest / matching / proposals / assignment / tracking /
  cancellation / payments / debts / wallet / disputes / audit: NO
- no `git add -A`; explicit paths only; no push/PR/merge.

## Remaining Findings
- **Settings subset (intentional).** `001`–`003` declare only the MVP settings
  (`tow_initial_radius_km`, `tow_max_radius_km`,
  `tow_proposal_expiry_minutes`). The frozen `TowSettings` schema lists 14
  properties including counteroffer/no-show/payout/cancellation-financial
  values owned by #33 and later MVPs. MVP-01 implements the required subset and
  leaves the remaining typed keys to their owning deliveries.
- **Admin module drain counters** are `0` in MVP-01 because the TowRequest state
  machine does not exist yet (MVP-03+); the field is present to keep the DTO
  contract shape.
- **Operational eligibility** is exposed as a service (the seam later MVPs call)
  rather than a new HTTP path, because no MVP-01 contract operation exists for
  it; the public `/tow/partner/status` route belongs to a later delivery.
- `partner_type` and `updated_by` are returned by the admin module view in
  addition to the contract's required fields (the schema allows it).
- No lint/typecheck script exists in the backend package; the Jest suites and
  the architecture boundary test are the static guards.

## Final Verdict
MVP-01 READY FOR EXTERNAL REVIEW
