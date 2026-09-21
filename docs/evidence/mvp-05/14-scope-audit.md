# MVP-05 — 14 Scope Audit

> What this delivery does, and the mechanical evidence that it does **not** do
> the things the scope froze out. The bans are enforced by
> `tests/tow/mvp05/towMvp05Architecture.test.js` (29 assertions) and by the
> census below, not by good intentions.

## In scope — delivered

| # | outcome | where |
| --- | --- | --- |
| 1 | `ASSIGNED → EN_ROUTE → ARRIVED → IN_TRANSIT → COMPLETED`, terminal `CANCELLED` | `domain/tow-request-state-machine.js` |
| 2 | current partner tracking (assigned partner writes, owning customer reads) | `application/tracking-service.js`, `tow_request_tracking` |
| 3 | basic cancellation before `IN_TRANSIT`, by customer or assigned partner | `application/cancellation-service.js` |
| 4 | assignment release on a terminal state | `execution-service.js` / `cancellation-service.js` → `assignment-repository.releaseByRequestId` |
| 5 | graceful drain after the module is disabled | no module gate on execution/tracking/cancellation |

## Out of scope — the census

Command (from `socorre_ai_backend/`), counting **code** lines only (comment lines
excluded), over the MVP-05 module surface
`src/modules/tow/{domain,application,http,adapters/persistence,adapters/routes}`:

| banned term | code hits | verdict |
| --- | --- | --- |
| `refund` | 0 | absent (the only mention is prose in `cancellation.js`) |
| `rematch` / `REMATCHING` | 0 | absent |
| `dispute` | 0 | absent |
| `geofence` | 0 | absent |
| `websocket` / `socket.io` | 0 | absent (also asserted across the whole module, comments included) |
| `scheduler` / `cron` / `setInterval` / `setTimeout` | 0 | absent — nothing in this delivery runs on a timer |
| `tracking_history` / `location_history` | 0 | absent — one current point, no trail |
| `no_show` | 0 | absent |
| `COMPLETION_PENDING` | 1 | **inherited vocabulary only**: a member of the contract's full lifecycle enum in `domain/tow-request.js`. The execution graph has exactly six states and no edge produces it |
| `fee` | 2 | **zero declaration only**: `CANCELLATION_FINANCIAL_CONSEQUENCE = {fee_due_cents: 0, currency: 'BRL', customer_debt_created: false}` |
| `payment` | 1 | **inherited DTO field only**: `buildTowRequestDto` emits the MVP-03/04 `payment` block (`status: 'NOT_SELECTED'`, all amounts `null`) because `TowRequest` requires it. No payment is read, written or priced by this delivery |
| `eta` | 0 (8 regex hits are all `meta`/`pageMeta`) | absent — no ETA field, no ETA computation |

### The two hits that are deliberate

1. **`fee_due_cents: 0` is not a fee feature.** A cancellation in this delivery is
   free, and the frozen `CancellationResponse` requires the module to *say so*
   (`required: [fee_due_cents, currency, customer_debt_created]`). The value is a
   constant `0` with `customer_debt_created: false`; there is no fee table, no fee
   calculation, no debt row and no refund lifecycle. `refund_status` is
   deliberately **omitted** (the schema makes it optional) rather than emitted as
   `null`: a null refund would advertise a lifecycle that does not exist.
2. **`payment` is an inherited DTO block, not a payment path.** `TowRequest` has
   required it since MVP-03; MVP-05 neither extends nor consumes it.

## Forbidden implementations — mechanically banned

`tests/tow/mvp05/towMvp05Architecture.test.js` fails the build if any of these
reappear:

- any of the legacy tables `real_time_tracking`, `tow_tracking`,
  `emergency_requests`, `tow_proposals`, `payments`, `wallets`, `disputes`
  referenced from the module's own sources;
- any still-unimplemented surface leaking into `routes.js`
  (`/partner/location`, completion confirmation, disputes, reviews, no-show,
  payment routes) — the ban is on the token, including inside comments;
- WebSocket / `socket.io` / `setInterval` / `setTimeout` / `cron` / `schedule`
  anywhere in the module;
- a second writer of `tow_request_tracking` outside
  `adapters/persistence/tracking-repository.js`;
- any RouteProvider call from the tracking read;
- the module gate reappearing on execution/tracking/cancellation, or
  disappearing from the request/proposal paths;
- Domain importing Knex/Express/adapters, Application importing Knex/adapters,
  HTTP querying the database, or HTTP requiring an application service directly
  instead of going through `composition.js`.

## Inherited surfaces deliberately NOT touched

MVP-05 adds no column to, reads nowhere and writes nowhere: `emergency_requests`,
`real_time_tracking`, `tow_tracking`, `tow_proposals`, `payments`, `wallets`,
`disputes`. The MVP-03/04 surfaces (create, list, cancel-preview, proposals,
accept, partner jobs, documents, admin settings, module toggle) keep their
behaviour and their contract declarations; the only MVP-03/04 changes in this
delivery are the additive ones recorded in `04-red-corrections.md` and the two
error-code declarations in `15-contract-revision-addendum.md`.
