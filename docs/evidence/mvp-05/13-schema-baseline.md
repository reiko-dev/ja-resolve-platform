# MVP-05 — 13 Schema Baseline

> What MVP-05 adds to the physical schema, and the proof that it adds nothing
> else. The snapshot/guard tooling is the repository's own
> (`scripts/tow/schema-snapshot.js`, `scripts/tow/db-reset-guard.js`,
> `scripts/tow/run-db-baseline-gate.js`); the gate result is in
> `23-baseline-gate.txt`.

## The migration

`database/migrations/006_mvp05_service_execution_tracking.js`

### `tow_requests` — 8 nullable columns, appended in this order

| column | type | meaning |
| --- | --- | --- |
| `en_route_at` | timestamptz NULL | partner started moving to the pickup |
| `arrived_at` | timestamptz NULL | partner reached the pickup |
| `in_transit_at` | timestamptz NULL | vehicle picked up, transit started |
| `completed_at` | timestamptz NULL | service finished |
| `cancelled_at` | timestamptz NULL | request dropped before transit |
| `cancelled_by_actor_type` | text NULL | `customer` \| `partner` |
| `cancelled_by_actor_id` | uuid NULL | the actor that dropped it |
| `cancellation_reason` | text NULL | optional customer text / required partner text |

Every column is nullable and no default is set, so the migration is safe on a
populated table: existing rows keep `NULL` and no backfill is required. No column
is dropped, renamed or retyped, and no index is added to `tow_requests` (the
existing primary key and the `state` index already serve every MVP-05 query).

### 11 named CHECK constraints (PostgreSQL only)

The constraints are the schema-level enforcement of the same invariants the state
machine enforces in the domain — the point is that a raw SQL writer cannot produce
an incoherent row even if it bypasses the service. They are declared **once**, in
a single exported list, and both directions of the migration are driven from it:

```js
const REQUEST_CHECK_CONSTRAINTS = [
  ['tow_requests_state_milestone_coherence_check', `...`],
  ...
];
// up():   for (const [name, condition] of REQUEST_CHECK_CONSTRAINTS)
//           ALTER TABLE tow_requests ADD CONSTRAINT ${name} CHECK (${condition})
// down(): for (const [name] of [...REQUEST_CHECK_CONSTRAINTS].reverse())
//           ALTER TABLE tow_requests DROP CONSTRAINT IF EXISTS ${name}
```

The list is what makes E5's `down()` → `up()` round-trip exact: the first version
of `down()` dropped the table and the 8 columns but left the constraints behind
(they reference `state`/`terminal_reason`/milestone columns that outlive the
migration), so re-applying 006 collided on an existing constraint name. The
shared list is the fix and the architecture suite now pins its shape.

The constraints cover: the terminal-state/milestone equivalence
(`(state = 'COMPLETED') = (completed_at IS NOT NULL)`,
`(state = 'CANCELLED') = (cancelled_at IS NOT NULL)`, and the same for
`terminal_reason`), the milestone ordering chain
(`arrived_at >= en_route_at`, `in_transit_at >= arrived_at`,
`completed_at >= in_transit_at`), the cancellation attribution being all-or-none,
the actor type enum, the reason bound (≤ 2000) and the tracking monotonicity
support. On SQLite the equivalent guarantees are enforced by the offline DDL in
`tests/helpers/testDb.js` plus the guarded CAS.

### `tow_request_tracking` — new table, ONE current point per request

| column | notes |
| --- | --- |
| `id` | PK |
| `tow_request_id` | FK → `tow_requests(id)`, **`UNIQUE`** — this is what makes "one current point" structural rather than a convention |
| `latitude`, `longitude` | the accepted point |
| `observed_at` | the device instant; the monotonic key |
| `created_at`, `updated_at` | bookkeeping |

No history table is created: a new point **replaces** the stored one (upsert on
the unique request id). `UNIQUE(tow_request_id)` is the only new index; the FK is
the only new reference.

## What is NOT in the schema

- no new column on `tow_assignments` (`released_at`/`release_reason` already
  existed from MVP-03/04);
- no fee, debt, refund, payment, dispute or rematch table;
- no tracking-history table;
- no `eta`, `distance` or route-geometry column (the route is read from the
  request's existing pickup/destination fields);
- no idempotency-key table: MVP-05 replays are resolved from the canonical state
  plus the guarded CAS, so nothing new is persisted for them;
- no change to any legacy table (`emergency_requests`, `real_time_tracking`,
  `tow_tracking`, `tow_proposals`, `payments`, `wallets`, `disputes`).

## Baseline gate

`DB_PORT=55434 npm run test:db-baseline` (transcript `23-baseline-gate.txt`) runs
the repository's own 9-stage clean-database gate against a **fresh disposable
volume**: guard → container up → assert the database is EMPTY (0 tables) →
migrate from zero → seed the default administrator → assert the clean-baseline
rules → schema snapshot → **guarded destructive reset, then migrate + seed +
assert again** → compare the two fingerprints → destroy container, volume and
network and verify nothing is left behind. Result: **GREEN**, with

```
[db-gate] migrations applied: 001…, 002…, 003…, 004…, 005…, 006_mvp05_service_execution_tracking.js (batch 1)
[db-gate] baseline OK: 36 tables, 34 row(s), settings=25
[db-gate] run 1 fingerprint: 2d51315075542832bbc4d5effa78ae83be05fc51f342cc0b0a7cc9ba78b35834
[db-gate] run 2 fingerprint: 2d51315075542832bbc4d5effa78ae83be05fc51f342cc0b0a7cc9ba78b35834
[db-gate] fingerprints identical: reset+migrate+seed reproduces the same schema
```

Two things are proven by that output: migration **006 is part of the baseline**
(it is applied when migrating from zero, and `tow_request_tracking` is now one of
the 36 required tables), and the schema is **reproducible** — a destructive reset
followed by a fresh migrate + seed yields the identical fingerprint, so the
delivery did not introduce order-dependent DDL. The gate's own evidence file is
`docs/evidence/t01/db-baseline-gate.json` (updated by the run and committed with
this delivery).
