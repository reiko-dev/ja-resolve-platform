# MVP-05 — 09 Graceful Drain

> What "disable the Tow module" means for a job that is already assigned.
> Frozen policy: `GRACEFUL_DRAIN_CONTRACT` in
> `src/modules/tow/domain/availability.js` (MVP-01, unchanged by this delivery).
> Suite: `tests/tow/mvp05/towMvp05GracefulDrain.test.js`.

## The frozen contract

```js
const GRACEFUL_DRAIN_CONTRACT = Object.freeze({
  blocksNewBusiness: true,
  preservesAdministration: true,
  drainsAssignedWork: true,
  closesUnassignedRequests: false,
  phase: 'MVP',
});
```

`drainsAssignedWork: true` is the clause this delivery implements. Disabling the
module is an **admission** decision ("may new business start?"), never a
**completion** decision ("may the customer on the roadside be served?"). A job
that already has an assigned partner must be finishable, trackable and
cancellable with the module off.

## What stays blocked

`moduleService.assertNewBusinessAllowed()` still guards every *new business*
write, unchanged from MVP-01/03/04:

| operation | while disabled |
| --- | --- |
| `POST /tow/requests` (create) | 409 `service_module_disabled` |
| `POST /tow/requests/{id}/proposals` | 409 `service_module_disabled` |
| `POST /tow/proposals/{id}/accept` | 409 `service_module_disabled` |

## What keeps working (drain work)

| operation | while disabled |
| --- | --- |
| `POST .../en-route`, `.../arrived`, `.../in-transit`, `.../finish` | 200 — the milestone is written |
| `POST .../cancel` (either party) | 200 |
| `POST .../tracking` (assigned partner) | 202 |
| `GET .../tracking` (owner / assignee) | 200 |

The gate is not "forgotten" on these paths — it is **deliberately absent**, and
that absence is asserted, not assumed:

- `tests/tow/mvp05/towMvp05GracefulDrain.test.js` disables the module through the
  real admin endpoint and then drives a real assigned job through `EN_ROUTE` →
  `ARRIVED` → `IN_TRANSIT` → `COMPLETED`, plus a tracking write/read and a
  cancellation on a second job, all with the module off;
- the same suite asserts new business is still refused, and that re-enabling
  restores it — so the drain behaviour cannot be achieved by disabling the gate
  globally;
- `tests/tow/mvp05/towMvp05Architecture.test.js` pins that the execution,
  tracking and cancellation services do **not** call
  `assertNewBusinessAllowed`;
- negative control `NC-MVP05-6` reapplies the gate to the execution service on
  purpose and the drain suite goes RED (`11-negative-controls.md`), which proves
  the tests detect the regression rather than passing for another reason.

## Why this is not a hole in the gate

The gate's own unit of meaning is *new business*, and the frozen contract already
says so (`blocksNewBusiness`, not `blocksAllWrites`). A job in `ASSIGNED` or
later already passed the gate when it was created, proposed and accepted; the
money, the partner and the vehicle are committed. Refusing the milestone would
not "close" anything — it would leave a paid job permanently unfinished, with the
partner occupied and the customer unable to get a receipt for a service that was
actually performed. `closesUnassignedRequests: false` states the same thing from
the other side: unassigned requests are not force-closed either; they simply
cannot attract new proposals while the module is off.

## Restart / re-enable

There is no scheduler, no background job and no timer in this delivery, so
nothing has to be "resumed" after a disable/enable cycle: the state of every job
lives in `tow_requests`, and the next authenticated request continues from it.
Re-enabling only re-opens admission.
