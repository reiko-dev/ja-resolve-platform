# MVP-05 — 07 Tracking Policy

> Current partner position, who may write it, who may read it, and how two
> concurrent fixes resolve. Service: `src/modules/tow/application/tracking-service.js`.
> Adapter: `src/modules/tow/adapters/persistence/tracking-repository.js`.
> Contract: `GET|POST /tow/requests/{requestId}/tracking` (draft.8).

## What is stored: ONE current point, never a trail

`tow_request_tracking` holds **exactly one row per request** (`UNIQUE(tow_request_id)`),
replaced in place. The contract exposes `latest` and nothing else, and the table
shape makes a second row unrepresentable, so "no history" is a property of the
schema rather than a convention.

Two instants are stored and they are not interchangeable:

| column | source | role |
| --- | --- | --- |
| `observed_at` | the payload's `recorded_at` (the DEVICE's instant) | the **ordering authority** |
| `received_at` | the backend clock (`clock.now()`) | the only instant this module vouches for |

A device clock running **ahead** of the backend is accepted, not clamped: the
anomaly stays visible in the row (`received_at < observed_at`) instead of being
silently rewritten. Nothing in the delivery compares the two to decide anything.

## Who may write

The **assigned partner of that request** — `tow_assignments.partner_id` — exactly
like the milestone operations, and checked BEFORE the state is inspected so the
error code cannot be used as a state oracle:

| condition | answer |
| --- | --- |
| no token / expired | 401 |
| canonical id malformed | 404 `not_found` (before the database is asked) |
| request does not exist | 404 `not_found` |
| a valid tow partner, but not the assignee | 403 `not_assigned_partner` |
| assigned partner, request terminal | 409 `invalid_tow_state` |
| assigned partner, `Idempotency-Key` missing/invalid | 422 `validation_error` |
| assigned partner, malformed point | 422 `validation_error` |
| assigned partner, point strictly older than the stored one | 409 `stale_tracking_update` (`details.recorded_at`) |

Accepted writes answer **202** with the stored point
(`{latitude, longitude, recorded_at}` — the *device* instant, echoed back).

## Who may read

**The owning customer OR the assigned partner**, and the two are indistinguishable
from the outside: a customer who is not the owner gets 403 `not_request_owner`, a
partner who is not the assignee gets 403 `not_assigned_partner`. Neither can probe
a foreign job's existence beyond what the module already tells them, and request A
never exposes request B's point (a dedicated assertion pins this).

The read response is `{latest, route}`:

- `latest` is the stored point, or **`null` before the first write** — never an
  invented placeholder;
- `route` is composed from the canonical request's own `pickup`/`destination`
  columns. It is **not** recomputed: `GET` never calls a RouteProvider, so
  reading tracking costs no external call and cannot introduce a second route
  authority that disagrees with the quote the customer already accepted. The
  operation-contract suite asserts the route provider is not called by the read.

## Ordering: monotonic, and decided by the database

The write is an **upsert with a monotonic guard**, never a read-then-write:

```
UPDATE tow_request_tracking
   SET latitude, longitude, observed_at, received_at, updated_at
 WHERE tow_request_id = :id
   AND observed_at <= :observed_at      -- the guard
```

| case | result |
| --- | --- |
| no row yet | `INSERT`; a concurrent insert that loses the UNIQUE race falls through to the guarded `UPDATE` |
| strictly newer point | replaces the row |
| **equal** instant | accepted (a device may re-send the same fix); the write is deterministic and still leaves ONE row |
| strictly older point | 0 rows affected → re-read → 409 `stale_tracking_update`, stored row untouched |

The pre-read in the adapter is only a fast path for the sequential case; the
`.where('observed_at', '<=', ...)` predicate is the authority. That is what makes
two concurrent points resolve to the **newest** one instead of to whichever
request the scheduler ran last — proven on real PostgreSQL in
`10-postgres-concurrency.md` (E4) and offline in `towMvp05Tracking.test.js`.

## No module gate, no ETA, no geofence

Tracking is **drain work** for an already-assigned job: `moduleService
.assertNewBusinessAllowed()` is deliberately NOT called, so disabling the Tow
module never blinds a customer mid-job (see `09-graceful-drain.md`). The delivery
computes no ETA, no distance-to-destination, no geofence entry/exit and no route
snapshot; the contract has no field for any of them.
