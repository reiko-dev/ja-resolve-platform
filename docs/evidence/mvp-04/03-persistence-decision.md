# MVP-04 — 03 Persistence Decision

> Delivery: MVP-04 Proposal Lifecycle & Atomic Assignment (Issue #16)
> Decision: create **two new canonical tables** — `tow_request_proposals` and
> `tow_assignments` — in migration `005_mvp04_proposals_assignments.js`.
> Rejected: reusing legacy `tow_proposals`; adding columns to `tow_requests`;
> deriving occupancy from `partners.is_available` / `tow_vehicles.active`.

---

## 1. Why a new table instead of the legacy `tow_proposals`

See `02-legacy-audit.md` §3. Summarised:

1. the legacy aggregate is `emergency_requests`, not `tow_requests`;
2. the legacy price is client-supplied `decimal(10,2)`, the canonical price is
   server-calculated integer cents;
3. the legacy distance is a haversine expression, the canonical distance is the
   Google Routes leg sum;
4. the legacy status vocabulary is disjoint from the canonical
   `TowProposalStatus` enum;
5. the legacy table has no vehicle/tariff/route snapshot, no idempotency
   contract and no module-gate interaction.

Altering the legacy table would break the legacy suite (a required regression
floor) while still not producing a canonical aggregate. **Two authorities, two
tables, zero coupling.**

## 2. Why occupancy is its own table

`partners.is_available` and `tow_vehicles.active` are **operator intent** — the
partner declares "I am willing to work" and "this is my working vehicle".
Occupancy is a **fact about a committed job**. Conflating them makes three things
impossible:

* telling "partner went offline" apart from "partner is on a job";
* releasing a vehicle without flipping the partner's declared availability;
* proving "exactly one assignment" with a database constraint.

`tow_assignments` is therefore the single occupancy authority, and occupancy is
defined as `released_at IS NULL`. MVP-04 never writes `is_available` or
`active` as a side effect of accepting a proposal; a later delivery may add a
derived projection, but the fact stays here.

---

## 3. Table 1 — `tow_request_proposals`

```text
id                                          increments PK
tow_request_id        integer  NOT NULL  → tow_requests(id)  ON DELETE CASCADE
partner_id            integer  NOT NULL  → partners(id)      ON DELETE CASCADE
tow_vehicle_id        integer  NOT NULL  → tow_vehicles(id)  ON DELETE CASCADE

status                string(20) NOT NULL DEFAULT 'ACTIVE'

-- price authority (integer cents; never decimal, never float)
price_amount_cents    integer  NOT NULL
price_currency        string(3) NOT NULL DEFAULT 'BRL'

-- frozen route snapshot (authoritative provider legs, exact integers)
route_provider_to_pickup_distance_meters        integer NOT NULL DEFAULT 0
route_provider_to_pickup_duration_seconds       integer NOT NULL DEFAULT 0
route_pickup_to_destination_distance_meters     integer NOT NULL DEFAULT 0
route_pickup_to_destination_duration_seconds    integer NOT NULL DEFAULT 0
route_total_distance_meters                     integer NOT NULL
route_total_duration_seconds                    integer NOT NULL
route_encoded_polyline                          text    NULL

-- frozen tariff snapshot
pricing_minimum_charge_cents            integer NOT NULL
pricing_included_km                     integer NOT NULL
pricing_included_meters                 integer NOT NULL
pricing_price_per_additional_km_cents   integer NOT NULL

-- frozen vehicle snapshot (survives vehicle edit/delete/re-activation).
-- The contract's TowProposal.tow_vehicle is a REQUIRED TowVehicleSummary, and
-- TOW-PROP-008/TOW-VEHICLE-010 forbid a later edit from changing a live
-- proposal — so the whole summary is snapshotted, not just the identity.
vehicle_plate                     string(20)  NOT NULL
vehicle_make                      string(100) NOT NULL
vehicle_model                     string(100) NOT NULL
vehicle_year                      integer     NOT NULL
vehicle_equipment_type            string(30)  NOT NULL
vehicle_supported_vehicle_classes text        NOT NULL   -- JSON array text (jsonb on PG)
vehicle_max_towed_weight_kg       integer     NOT NULL
vehicle_document_status           string(20)  NOT NULL   -- summarizeDocumentStatus() at proposal time
vehicle_active                    boolean     NOT NULL   -- true at proposal time (eligibility requires it)

expires_at            timestamp NOT NULL
decided_at            timestamp NULL      -- when the proposal left ACTIVE

idempotency_key       string(128) NOT NULL
idempotency_fingerprint string(64) NOT NULL

created_at / updated_at
```

### 3.1 Constraints

| Constraint | Kind | Invariant |
|---|---|---|
| `tow_request_proposals_status_check` | CHECK | `status IN ('ACTIVE','COUNTERED','ACCEPTED','REJECTED','WITHDRAWN','EXPIRED','CLOSED')` |
| `tow_request_proposals_active_per_partner_unique` | **partial UNIQUE** on `(tow_request_id, partner_id) WHERE status='ACTIVE'` | one live proposal per partner per request (`TOW-PROP-001`, duplicate policy) |
| `tow_request_proposals_price_check` | CHECK | `price_amount_cents > 0` |
| `tow_request_proposals_currency_check` | CHECK | `price_currency = 'BRL'` |
| `tow_request_proposals_route_check` | CHECK | `route_total_distance_meters >= 0 AND route_total_duration_seconds >= 0` |
| `tow_request_proposals_route_sum_check` | CHECK | `route_total_distance_meters = route_provider_to_pickup_distance_meters + route_pickup_to_destination_distance_meters` (the stored total can never diverge from its legs) |
| `tow_request_proposals_tariff_check` | CHECK | all four pricing columns `>= 0`; `pricing_included_meters = pricing_included_km * 1000` |
| `tow_request_proposals_vehicle_year_check` | CHECK | `vehicle_year BETWEEN 1900 AND 2200` |
| `tow_request_proposals_vehicle_doc_status_check` | CHECK | `vehicle_document_status IN ('pending','approved','rejected','expired')` |
| `tow_request_proposals_vehicle_weight_check` | CHECK | `vehicle_max_towed_weight_kg >= 1` |
| `tow_request_proposals_vehicle_classes_check` | CHECK | non-empty JSON array text (`LIKE '[%]'` offline; `jsonb_array_length(…) >= 1` on PG) |
| `tow_request_proposals_equipment_check` | CHECK | `vehicle_equipment_type IN ('flatbed','wheel_lift','heavy_wrecker')` |
| `tow_request_proposals_decided_check` | CHECK | `(status = 'ACTIVE') = (decided_at IS NULL)` |
| `tow_request_proposals_idempotency_unique` | UNIQUE on `(partner_id, idempotency_key)` | DB-level idempotency authority (same convention as `tow_requests`) |
| indexes | `(tow_request_id, status)`, `(partner_id, status, created_at)`, `(tow_request_id, created_at)` | list paths |

`COUNTERED` is in the CHECK because the canonical enum is frozen by the
contract, but **MVP-04 never writes it** (no counteroffer in scope). Including it
keeps migration 005 from having to be re-run when MVP-05+ arrives; a test asserts
that no code path can produce it.

### 3.2 Partial unique index portability

`CREATE UNIQUE INDEX … WHERE status = 'ACTIVE'` is emitted with
`knex.raw` under PostgreSQL — exactly the accepted MVP-01 pattern
(`tow_vehicles_one_active_per_partner`, migration 003 lines 83-85). Under SQLite
(the offline harness) the same statement is valid syntax and is emitted too, so
the offline suite exercises the same invariant; **certification still happens on
real PostgreSQL**, because only there can two concurrent inserts actually race.

---

## 4. Table 2 — `tow_assignments`

```text
id                    increments PK
tow_request_id        integer NOT NULL → tow_requests(id)            ON DELETE CASCADE
proposal_id           integer NOT NULL → tow_request_proposals(id)   ON DELETE RESTRICT
partner_id            integer NOT NULL → partners(id)                ON DELETE CASCADE
tow_vehicle_id        integer NOT NULL → tow_vehicles(id)            ON DELETE CASCADE

final_price_amount_cents  integer NOT NULL
final_price_currency      string(3) NOT NULL DEFAULT 'BRL'

-- frozen at assignment time, copied from the winning proposal
route_total_distance_meters   integer NOT NULL
route_total_duration_seconds  integer NOT NULL
pricing_minimum_charge_cents  integer NOT NULL
pricing_included_meters       integer NOT NULL
pricing_price_per_additional_km_cents integer NOT NULL
vehicle_plate                     string(20)  NOT NULL
vehicle_make                      string(100) NOT NULL
vehicle_model                     string(100) NOT NULL
vehicle_year                      integer     NOT NULL
vehicle_equipment_type            string(30)  NOT NULL
vehicle_supported_vehicle_classes text        NOT NULL
vehicle_max_towed_weight_kg       integer     NOT NULL
vehicle_document_status           string(20)  NOT NULL

assigned_at           timestamp NOT NULL
released_at           timestamp NULL      -- NULL = this assignment still occupies
release_reason        string(40) NULL
created_at / updated_at
```

### 4.1 Constraints — the atomicity authority

| Constraint | Kind | Invariant |
|---|---|---|
| `tow_assignments_request_unique` | **UNIQUE(`tow_request_id`)** | **exactly one assignment per request, ever** — the DB-level proof of `TOW-ASSIGN-005` |
| `tow_assignments_proposal_unique` | **UNIQUE(`proposal_id`)** | a proposal can win at most once (makes accept idempotent at the DB level) |
| `tow_assignments_active_partner_unique` | **partial UNIQUE(`partner_id`) WHERE `released_at IS NULL`** | a partner holds at most one live job |
| `tow_assignments_active_vehicle_unique` | **partial UNIQUE(`tow_vehicle_id`) WHERE `released_at IS NULL`** | a vehicle holds at most one live job |
| `tow_assignments_price_check` | CHECK | `final_price_amount_cents > 0` |
| `tow_assignments_currency_check` | CHECK | `final_price_currency = 'BRL'` |
| `tow_assignments_release_check` | CHECK | `(released_at IS NULL) = (release_reason IS NULL)` |
| indexes | `(partner_id, released_at)`, `(tow_vehicle_id, released_at)`, `(tow_request_id)` | occupancy lookup |

`tow_assignments_request_unique` is the reason a concurrent second accept cannot
create a second assignment: the loser's `INSERT` raises a unique violation, the
transaction rolls back, and the request state is untouched. This is a **database
constraint, not a read-then-write check** — the accepted MVP-03 idempotency
doctrine.

### 4.2 Why `proposal_id` is `ON DELETE RESTRICT`

An assignment is the historical record of a won proposal. Cascading the delete
would erase the record of a completed job; restricting it makes the intent
explicit. `tow_request_id` / `partner_id` / `tow_vehicle_id` keep `CASCADE`
(matching the accepted MVP-01/03 FK convention).

---

## 5. Assignment transaction (single PostgreSQL transaction)

```text
BEGIN
  SELECT … FROM tow_requests  WHERE id = :requestId  FOR UPDATE      -- serialize accepts per request
  SELECT … FROM tow_request_proposals WHERE id = :proposalId FOR UPDATE
  assert module enabled                       -> service_module_disabled
  assert proposal.tow_request_id = requestId  -> not_found
  assert proposal.status = 'ACTIVE'           -> proposal_not_actionable
  assert now < proposal.expires_at            -> proposal_expired
  INSERT INTO tow_assignments (…)             -- UNIQUE(tow_request_id) is the referee
  UPDATE tow_requests   SET state='ASSIGNED'
  UPDATE tow_request_proposals SET status='ACCEPTED', decided_at=now WHERE id=:proposalId
  UPDATE tow_request_proposals SET status='CLOSED',  decided_at=now
     WHERE tow_request_id=:requestId AND status='ACTIVE' AND id<>:proposalId
COMMIT
```

Two `accept`s for **different** proposals of the same request serialize on the
request row lock; the second one observes `state='ASSIGNED'` and fails with
`request_already_assigned` **before** touching the assignment table. Two
concurrent `accept`s of the **same** proposal serialize on the proposal lock; the
second observes `status='ACCEPTED'` and returns the existing assignment
(idempotent success, not an error). If the locks are ever bypassed, the unique
constraints still make a second assignment impossible.

Row locking uses `FOR UPDATE` only on PostgreSQL; the SQLite harness (single
connection) serializes naturally, and the concurrency proof runs on real
PostgreSQL (`DB_PORT=55434`).

---

## 6. Migration pinning

Migration 005 changes the schema fingerprint. The re-pin is intentional and
touches exactly four places, all reviewed:

| Place | Change |
|---|---|
| `scripts/tow/run-db-baseline-gate.js` → `PINNED_MIGRATIONS` | append `005_mvp04_proposals_assignments.js` |
| `tests/tow/baseline/dbBaselineSafety.test.js` | assert the new pinned list |
| `scripts/tow/db-baseline.js` → `REQUIRED_TABLES` | add `tow_request_proposals`, `tow_assignments` |
| `docs/tow/TOW-TASK-GRAPH.yaml` + `docs/evidence/t01/db-baseline-gate.json` | re-pin the fingerprint with a fresh, deterministic double run |

No `006_*` is created. `004` and earlier are untouched, so the accepted MVP-03
schema is byte-identical.

---

## 7. Offline harness mirror

`tests/helpers/testDb.js` gains `CREATE TABLE IF NOT EXISTS` mirrors of both
tables (plus the partial unique indexes) so the offline Jest suite can exercise
the invariants. The mirror is a **test convenience**, never a certification: the
concurrency evidence (`TOW-ASSIGN-005`, `TOW-ASSIGN-006`) is produced only by the
real-PostgreSQL run.
