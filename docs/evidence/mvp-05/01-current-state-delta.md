# MVP-05 — 01. Current state and delivery delta

* Branch: `feature/mvp-05-service-execution-tracking`
* Authoritative base: `a3aa1d75aabd476182ef9b69ac5056b83e967ef2`
* Scope: MVP-05 — Service Execution, Live Tracking & Basic Cancellation (issue #17)
* Audited: whole repository at the base commit, offline harness + PostgreSQL gates.

This document records **what already exists at the base**, **what MVP-05 adds**, and —
most importantly — **what MVP-05 refuses to inherit**. Nothing here is aspirational:
every claim is anchored to a file, table or route that exists at the base commit.

---

## 1. Canonical authorities at the base (MVP-01 … MVP-04)

| authority | owner | what it is |
| --- | --- | --- |
| `tow_requests` | migration `004_mvp03_tow_requests.js` | the state aggregate. `state`, `terminal_reason`, pickup/destination, vehicle class, radius, price, `customer_id`, idempotency key. |
| `tow_request_proposals` | migration `005_mvp04_proposals_assignments.js` | partner offers, one live proposal per partner per request. |
| `tow_assignments` | migration `005_mvp04_proposals_assignments.js` | the assignment record. **Occupancy is defined as `released_at IS NULL`**, enforced by the partial unique indexes `tow_assignments_one_live_per_partner` and `tow_assignments_one_live_per_vehicle`. |
| `tow_vehicles`, `tow_vehicle_documents`, `partners`, `users` | migrations `001`, `003` | partner operational projection: active vehicle, approved documents, availability. |
| `service_modules` | migration `003` | the Tow module enable/disable switch that owns the graceful-drain contract. |

Frozen request states at the base (`src/modules/tow/domain/tow-request.js`):
`SEARCHING`, `NEGOTIATING`, `ASSIGNED`, `EN_ROUTE`, `ARRIVED`, `IN_TRANSIT`,
`COMPLETED`, `CANCELLED`. MVP-03 declared the full enum and the MVP-04 assignment
path only ever produced `ASSIGNED`; **the four execution states were declared but
unreachable**, and `CANCELLED` was declared but unreachable.

## 2. What the base cannot do (the MVP-05 gap)

At the base commit:

* no route exists for `en-route`, `arrived`, `in-transit`, `finish`, `cancel`,
  `cancel-partner` or `tracking` under `/api/tow` — the MVP-04 architecture suites
  actively **ban** those tokens from `src/modules/tow/http/routes.js`;
* no column records when a request reached a state: `tow_requests` has `state` and
  `updated_at` only, so a transition cannot be timestamped or replayed truthfully;
* no table stores a partner's current position for a canonical request;
* `buildAssignmentDto` has no release concept and no repository method writes
  `released_at`, so a completed or cancelled job keeps occupying the partner and the
  vehicle forever;
* `allowedActionsForRequest()` returns `['accept_proposal']` for an open request with
  a live proposal and `[]` otherwise — an `ASSIGNED` request therefore advertises
  *no* action to the partner who must drive it.

## 3. MVP-05 delta (the whole delivery, in one table)

| # | delta | kind |
| --- | --- | --- |
| D1 | `006_mvp05_service_execution_tracking.js`: five milestone columns + three cancellation columns on `tow_requests`, plus the `tow_request_tracking` table | schema |
| D2 | `domain/tow-request-state-machine.js`: the legal transition table, milestone mapping, cancellation eligibility, viewer-aware progress action | domain |
| D3 | `domain/errors.js`: `invalid_tow_state`, `invalid_tow_transition`, `not_assigned_partner`, `stale_tracking_update` | domain |
| D4 | `tow-request-repository`: guarded milestone/CAS transition writes + terminal release in one transaction | persistence |
| D5 | `assignment-repository.releaseByRequestId` (guarded `WHERE released_at IS NULL`) | persistence |
| D6 | `tracking-repository`: single-row-per-request upsert with a monotonic `observed_at` guard | persistence |
| D7 | `application/execution-service.js`, `tracking-service.js`, `cancellation-service.js` | application |
| D8 | seven operations on the canonical HTTP surface: `POST .../en-route`, `/arrived`, `/in-transit`, `/finish`, `/cancel`, `/cancel-partner`, `GET|POST .../tracking` | http |
| D9 | viewer-aware `allowed_actions` (customer vs partner) | contract-visible |
| D10 | `docs/tow/tow-api-contract.openapi.yaml` draft.7 → **draft.8** | contract |

## 4. What MVP-05 explicitly does NOT inherit (legacy is LIVE, not canonical)

The base repository still mounts the legacy rescue product. It is **live** and stays
live — MVP-05 neither extends nor deletes it — but none of it is an authority for the
canonical Tow module.

| legacy surface | where it lives | why it is NOT inherited |
| --- | --- | --- |
| `POST /api/emergency-requests/:id/start`, `/complete`, `/cancel` | `src/routes/emergency-requests.js:89-99` | different aggregate (`emergency_requests`), different state vocabulary, no assignment/release semantics, no milestone instants. |
| `real_time_tracking` table | `database/migrations/001_baseline_schema.js:550` | carries `location_history`, `estimated_arrival_minutes`, `estimated_distance_km`, `route_info`, `update_interval_seconds` — i.e. a tracking **trail** plus ETA and routing, all explicitly out of MVP-05 scope. MVP-05 stores one current point and nothing else. |
| `tow_proposals` | `001_baseline_schema.js:856` | a pre-MVP legacy proposal table; the canonical authority is `tow_request_proposals`. |
| `payments`, `wallets`, `wallet_transactions`, `commissions`, `disputes` | `001_baseline_schema.js:644-828` | money, debt, refund and dispute semantics are out of MVP-05 scope. The cancellation envelope reports a **zero** financial consequence instead of inventing a fee. |
| `PUT /tow/partner/location` | **not present in `src/modules/tow`** | see §5. |

Additional legacy tables deliberately untouched: `emergency_requests`,
`delivery_orders`, `purchase_orders`, `partner_services`, `notifications`,
`system_settings`, `subscriptions`.

## 5. `PUT /tow/partner/location` — audited and classified `PHASE2_ONLY`

The MVP-05 brief asked for this operation to be audited before any decision. Findings:

1. **It does not exist in the canonical module.** No file under `src/modules/tow`
   mentions `partner/location`; the only `/tow/partner/...` route is
   `GET /tow/partner/jobs` (`src/modules/tow/http/routes.js`).
2. **It is actively banned by the architecture suites.** Both
   `tests/tow/mvp03/towMvp03Architecture.test.js` and
   `tests/tow/mvp04/towMvp04Architecture.test.js` assert that the canonical router
   does not contain `/partner/location`. Those bans were written to keep a
   *pre-assignment availability broadcast* out of the canonical surface.
3. **It has different semantics.** A free-form partner position is an availability
   broadcast used for matching; MVP-05 tracking is per-request, written only by the
   **assigned** partner, readable only by the owning customer and that partner.

Decision: **`PUT /tow/partner/location` is NOT part of MVP-05.** It is recorded here
as `PHASE2_ONLY / NOT_THIS_DELIVERY`, and the existing architecture bans are kept
intact. The per-request tracking contract is served exclusively by
`GET|POST /tow/requests/{requestId}/tracking`.

## 6. Delivery boundaries (hard)

In scope: the five-state lifecycle, current-position tracking, cancellation before
`IN_TRANSIT`, assignment release on terminal state, graceful drain.

Out of scope, and verified absent from the delivery: completion confirmation,
customer no-show, disputes, reviews, payments, cash receipt, wallet/debt/refund,
rematch/reassignment, tracking history or trails, WebSocket/SSE push, schedulers,
geofencing, ETA computation, route geometry for tracking, any new state
(`COMPLETION_PENDING`, `NO_SHOW`, `DISPUTED`, `REMATCHING`), and any second migration
beyond `006`.

## 7. Test and gate baseline (captured before implementation)

| gate | base result |
| --- | --- |
| `npm run validate:openapi` | PASS |
| `npm run test:contract` | 79 / 79 |
| `npx jest tests/tow --runInBand` | 1045 passed, 75 skipped (51 suites + 5 skipped) |
| per-directory floors | mvp01 124/10 · mvp02 204/0 · mvp03 177/7 · mvp04 189/10 |
| full `npx jest --runInBand` | 1486 passed, 75 skipped (85 suites + 5 skipped) |
| PostgreSQL gates (`DB_PORT=55434`) | run for the first time in this delivery (see `09-postgres-concurrency.md`) |

All floors are **floors**: MVP-05 may only add passing tests, never remove or skip one.
