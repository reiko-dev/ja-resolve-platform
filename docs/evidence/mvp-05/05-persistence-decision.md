# MVP-05 — 05 Persistence Decision

> Where the execution state, the milestones, the cancellation attribution and the
> live position are stored, and why the legacy tracking tables are NOT reused.
> Migration: `database/migrations/006_mvp05_service_execution_tracking.js`.

## The canonical authorities after MVP-05

| Fact | Authority | Shape |
| --- | --- | --- |
| execution state | `tow_requests.state` | the 4 non-terminal execution states + `COMPLETED`/`CANCELLED` |
| milestone instants | `tow_requests.{en_route_at,arrived_at,in_transit_at,completed_at,cancelled_at}` | 5 nullable timestamps, one per milestone |
| cancellation attribution | `tow_requests.{cancelled_by_actor_type,cancelled_by_actor_id,cancellation_reason}` | who asked, and why (optional) |
| terminal reason | `tow_requests.terminal_reason` | `COMPLETED` / `CUSTOMER_CANCELLED` / `PARTNER_CANCELLED` (MVP-04 column, reused) |
| occupancy | `tow_assignments.released_at IS NULL` | partial index from MVP-04, reused unchanged |
| release cause | `tow_assignments.release_reason` | `COMPLETED` / `CANCELLED` |
| current position | `tow_request_tracking` (**new**) | exactly ONE row per request |

No new table was needed for the state, the milestones or the attribution: all
three are facts about the request aggregate, and splitting them into a separate
"execution" table would create a second writer for the same lifecycle and a join
that can disagree with `state`. The milestone is written by the SAME guarded
statement that changes `state`, so "the state says ARRIVED" and "`arrived_at` is
set" cannot diverge.

## `tow_request_tracking` — the one new table

```
id             increments PK
tow_request_id integer NOT NULL  FK tow_requests(id)  ON DELETE CASCADE
partner_id     integer NOT NULL  FK partners(id)      ON DELETE RESTRICT
latitude       decimal(10,8) NOT NULL   CHECK [-90, 90]
longitude      decimal(11,8) NOT NULL   CHECK [-180, 180]
observed_at    timestamp NOT NULL       -- the DEVICE instant (`recorded_at`)
received_at    timestamp NOT NULL       -- the BACKEND instant
created_at / updated_at
UNIQUE (tow_request_id)  -- tow_request_tracking_tow_request_id_unique
```

Two decisions are encoded in that DDL:

1. **One row per request, enforced by the database.** The delivery is *current
   position only*: no trail, no history, no ETA. `UNIQUE(tow_request_id)` makes a
   second row for the same request **unrepresentable**, so "we do not keep
   history" is not a promise a future caller can break by inserting instead of
   updating. A history feature would need a new table and a new consent
   decision — it cannot grow out of this one by accident.
2. **Two instants, never interchangeable.** `observed_at` is the device's
   (`recorded_at` in the contract) and is the **ordering authority**;
   `received_at` is the backend clock's and is the only instant this module can
   vouch for. A device clock running ahead is accepted, not clamped, so the
   anomaly stays visible in the row instead of being silently rewritten.

`partner_id` is `ON DELETE RESTRICT`: the position of a job is evidence, and the
partner row it names cannot be erased while the point exists (same policy as
MVP-04's `tow_assignments`). The request FK is `CASCADE`: the point is a
subordinate fact of the request, and an erased request takes it with it.

## Why NOT the legacy `real_time_tracking`

`real_time_tracking` (migration 001) is LEGACY_LIVE — it stays in the schema and
keeps serving the legacy emergency/delivery flows — but it is the wrong authority
for this delivery on every axis:

| legacy column | why MVP-05 does not inherit it |
| --- | --- |
| `emergency_request_id`, `delivery_order_id`, `purchase_order_id` | three foreign aggregates; a canonical `tow_requests` row is none of them |
| `location_history`, `route_info` | a TRAIL and a route snapshot; this delivery is current-point-only and never spends a RouteProvider call on a read |
| `estimated_arrival_minutes`, `estimated_distance_km`, `update_interval_seconds` | ETA and polling policy, explicitly out of scope |
| `accuracy`, `speed`, `heading` | device telemetry the frozen contract does not accept |
| `status` (`waiting/en_route/arrived/working/completed`) | a SECOND state machine that would immediately disagree with `tow_requests.state` |
| `is_active`, `*_notifications_enabled`, `notes`, `metadata` | lifecycle flags and free-form payloads with no consumer here |

Inheriting it would have imported an ETA field, a trail and a competing state
vocabulary into a delivery whose contract exposes `latest` and nothing else. The
legacy table is left untouched: MVP-05 adds no column to it, reads it nowhere and
writes it nowhere (`tests/tow/mvp05/towMvp05Architecture.test.js` bans the
identifier from the module's own sources).

## Migration 006 — reversible, and proven so

`up()`:

1. `ALTER TABLE tow_requests` adds the 8 columns, all nullable, in a fixed order
   (`en_route_at, arrived_at, in_transit_at, completed_at, cancelled_at,
   cancelled_by_actor_type, cancelled_by_actor_id, cancellation_reason`);
2. on PostgreSQL only, adds 11 **named** CHECK constraints (see below);
3. creates `tow_request_tracking` with its UNIQUE, its FKs and its lat/lon
   CHECKs.

`down()` drops the table, drops the same 11 constraints **by name, in reverse
order**, then drops the 8 columns.

Both directions read the SAME exported list (`REQUEST_CHECK_CONSTRAINTS`), so the
rollback cannot drift from what was installed. The by-name drop is not
cosmetic: dropping a column removes the constraints that reference it, but
`tow_requests_terminal_reason_state_check` only references `state` and
`terminal_reason`, which OUTLIVE this migration. Without the explicit drop,
re-applying 006 collides with a leftover constraint. That defect was in the first
version of this migration and was caught by the PostgreSQL gate
(`tests/tow/mvp05/towMvp05Postgres.e2e.test.js`, E5) — not by review. E5 now
asserts `down()` and `up()` are exact inverses on a real database.

## The 11 PostgreSQL CHECK constraints

| constraint | invariant |
| --- | --- |
| `tow_requests_arrived_after_en_route_check` | `arrived_at >= en_route_at` |
| `tow_requests_in_transit_after_arrived_check` | `in_transit_at >= arrived_at` |
| `tow_requests_completed_after_in_transit_check` | `completed_at >= in_transit_at` |
| `tow_requests_cancelled_after_en_route_check` | `cancelled_at >= en_route_at` |
| `tow_requests_completed_state_check` | `state = 'COMPLETED'` **iff** `completed_at IS NOT NULL` |
| `tow_requests_cancelled_state_check` | `state = 'CANCELLED'` **iff** `cancelled_at IS NOT NULL` |
| `tow_requests_cancellation_actor_type_check` | actor type ∈ {`customer`, `partner`} |
| `tow_requests_cancellation_actor_pair_check` | actor type is set **iff** actor id is set |
| `tow_requests_cancellation_attribution_check` | `cancelled_at IS NOT NULL` **or** no attribution at all |
| `tow_requests_cancellation_reason_length_check` | `length(cancellation_reason) <= 2000` |
| `tow_requests_terminal_reason_state_check` | `terminal_reason` only on `CANCELLED`/`COMPLETED` |

They are PostgreSQL-only on purpose. SQLite (the offline harness) cannot add a
CHECK to an existing table, and the SQLite mirror in `tests/helpers/testDb.js`
therefore carries the equivalent table-level checks for fresh databases. The
application never relies on them for correctness — the guarded CAS write is the
runtime authority — but they make an incoherent row **impossible to persist**
even by a raw SQL client, which is what the E5 gate proves with real
`INSERT`/`UPDATE` refusals (SQLSTATE `23514`).

## What was NOT added

No fee, debt, refund, payment, rematch, dispute or rating column; no tracking
history table; no ETA/route/geofence column; no new state (`COMPLETION_PENDING`,
`NO_SHOW`, `DISPUTED`, `REMATCHING` are all absent). `state` keeps the MVP-03/04
vocabulary and gains only the two terminal values MVP-04 already declared.
