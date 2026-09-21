# MVP-05 — RED evidence (pre-implementation)

Captured on branch `feature/mvp-05-service-execution-tracking` at the authoritative
base `a3aa1d75aabd476182ef9b69ac5056b83e967ef2`, **before** any MVP-05 route,
service, migration, repository or domain file existed. The only tracked changes at
capture time were the new test files themselves (plus their fixture helper), so the
failures below cannot be caused by a half-written implementation.

```
command : npx jest tests/tow/mvp05 --runInBand      (workdir: socorre_ai_backend)
result  : Test Suites: 6 failed, 6 total
          Tests:       56 failed, 4 passed, 60 total
```

| artifact | content |
| --- | --- |
| `red-run.txt` | cleaned console output of the RED run (access-log noise stripped) |
| `red-index.txt` | per-test status index extracted from the Jest JSON report |

## Why the suites fail at the base

Every MVP-05 mutation is answered `404` because no MVP-05 route is mounted, and
every MVP-05 column/table is absent from the harness schema. The failure text is
therefore uniform (`Expected: 200, Received: 404`, or a missing-column error), which
is the expected shape of a contract-first RED for a new vertical slice.

## The six named anchors

| anchor | suite | proves |
| --- | --- | --- |
| `RED-MVP05-1` | `towMvp05ExecutionApi.test.js` | the assigned partner drives `ASSIGNED → EN_ROUTE → ARRIVED → IN_TRANSIT → COMPLETED`, milestones come from the backend clock, `allowed_actions` are truthful per state |
| `RED-MVP05-2` | `towMvp05Tracking.test.js` | `POST /tracking` persists exactly one current point and both the owning customer and the assigned partner read it |
| `RED-MVP05-3` | `towMvp05Tracking.test.js` | the owning customer recovers tracking; anonymous/foreign customer/foreign partner are refused |
| `RED-MVP05-4` | `towMvp05Release.test.js` | a terminal transition releases the assignment and frees partner + vehicle occupancy without mutating assignment identity |
| `RED-MVP05-5` | `towMvp05Cancellation.test.js` | the owning customer cancels before `IN_TRANSIT` with the truthful zero-fee envelope, actor attribution and release |
| `RED-MVP05-6` | `towMvp05GracefulDrain.test.js` | after the module is disabled an already-assigned job still executes, tracks and cancels, while new business stays blocked |

## The four tests that pass at the base (vacuous or inherited)

Four assertions pass before MVP-05 exists. None of them exercises MVP-05 behaviour;
they are listed explicitly so the RED evidence is not overstated:

1. `graceful drain › new business stays blocked while disabled` — inherited MVP-03/04
   behaviour (`service_module_disabled`), unchanged by this delivery.
2. `graceful drain › the frozen drain contract still describes exactly this behaviour`
   — a pure unit assertion on the pre-existing `GRACEFUL_DRAIN_CONTRACT` constant.
3. `graceful drain › re-enabling the module restores new business` — inherited MVP-03
   behaviour.
4. `assignment release and job history › release never flips the vehicle or the partner
   availability flags` — passes **vacuously**: the lifecycle calls it makes are `404`,
   so the flags are trivially unchanged. It becomes a real assertion once
   `RED-MVP05-1` turns green.

## Non-negotiable suite properties

* No test in `tests/tow/mvp05/` inserts `tow_assignments` rows directly to build its
  fixture: the canonical `ASSIGNED` request is always produced by the real MVP-04
  HTTP path (propose → accept), so an MVP-05 suite cannot pass against an assignment
  shape the running backend could not produce.
* Concurrency (two writers on one request) is deliberately **not** asserted on SQLite,
  which serialises writers on a single connection. It is certified on PostgreSQL in
  `tests/tow/mvp05/towMvp05Postgres.e2e.test.js` (E1–E6).
* Live tracking never calls the routing provider; the suites assert the provider call
  count is unchanged by tracking writes and reads.
