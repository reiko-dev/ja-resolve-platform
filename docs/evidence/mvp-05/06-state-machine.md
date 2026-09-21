# MVP-05 — 06 State Machine

> The execution graph, and the single authority that decides it:
> `src/modules/tow/domain/tow-request-state-machine.js`.
> Contract: `docs/tow/tow-api-contract.openapi.yaml` (draft.8) + `docs/tow/TOW-API-CONTRACT.md` §13.

## The graph

```
                 start_en_route            mark_arrived            start_in_transit          finish_service
  ASSIGNED ─────────────────────▶ EN_ROUTE ────────────▶ ARRIVED ──────────────────▶ IN_TRANSIT ─────────────▶ COMPLETED
     │                                │                      │                                                    (terminal)
     │ cancel                         │ cancel               │ cancel
     ▼                                ▼                      ▼
  CANCELLED ◀────────────────────────────────────────────────┘                                                     (terminal)
```

| edge | action | milestone written | HTTP |
| --- | --- | --- | --- |
| `ASSIGNED → EN_ROUTE` | `start_en_route` | `en_route_at` | `POST /tow/requests/{id}/en-route` |
| `EN_ROUTE → ARRIVED` | `mark_arrived` | `arrived_at` | `POST /tow/requests/{id}/arrived` |
| `ARRIVED → IN_TRANSIT` | `start_in_transit` | `in_transit_at` | `POST /tow/requests/{id}/in-transit` |
| `IN_TRANSIT → COMPLETED` | `finish_service` | `completed_at` | `POST /tow/requests/{id}/finish` |
| `ASSIGNED \| EN_ROUTE \| ARRIVED → CANCELLED` | `cancel` | `cancelled_at` | `POST /tow/requests/{id}/cancel` |

Everything else is **ILLEGAL**, and the exclusions are the product decisions:

- **no skipping** (`ASSIGNED → ARRIVED`, `ASSIGNED → IN_TRANSIT`,
  `ASSIGNED → COMPLETED`, `EN_ROUTE → IN_TRANSIT`, `EN_ROUTE → COMPLETED`,
  `ARRIVED → COMPLETED`). A milestone is *evidence that the previous one
  happened*; writing `arrived_at` on a job that was never `EN_ROUTE` would
  fabricate a timeline. The `CHECK` constraints in migration 006 make the same
  statement at the schema level, so a raw SQL writer cannot skip either;
- **no cancellation after loading** (`IN_TRANSIT → CANCELLED` is illegal). The
  service is being performed; this delivery has no fee, refund, debt or rematch
  to settle that with, so allowing the cancel would strand a performed job in a
  state nothing can price. `IN_TRANSIT` and both terminals answer 409;
- **nothing leaves a terminal state.** `COMPLETED` and `CANCELLED` have no
  outgoing edge at all: a terminal job is history, not a state to reopen.

`SEARCHING` and `NEGOTIATING` are **not** in this graph. They belong to
MVP-03/MVP-04, where the only legal action is `accept_proposal`; a request enters
the execution graph exclusively through the MVP-04 assignment.

## One implementation, four endpoints

All four progress operations are the SAME service operation with a different edge
(`EXECUTION_TARGET_STATE_BY_OPERATION`), so no per-endpoint rule can drift from
the graph. The classification is a pure function:

| verdict | condition | result |
| --- | --- | --- |
| `REPLAY` | `from === to` | 200, the canonical row is returned, **nothing is written** |
| `APPLY` | the edge exists | guarded CAS + milestone, in one statement |
| `ILLEGAL` | anything else | 409 `invalid_tow_transition` with `details.from`/`details.to` |

**Idempotency is the canonical state, not a key table.** A repeated `POST`
— with the *same* key, a *different* valid key, or no prior record of the first
call — is answered by reading the row: if it is already in the target state, the
call is a replay. This is why the delivery needs no idempotency-key storage to be
correct, and why a retry after a lost response can never double-write a milestone.
The `Idempotency-Key` header is still required (8–128 chars, 422 before any
mutation) because the contract freezes it for the whole Tow surface; it is a
*precondition*, not the correctness mechanism.

## The write, in one statement

```
UPDATE tow_requests
   SET state = :to, :milestone_column = :now, updated_at = :now [, attribution]
 WHERE id = :id AND state = :from
```

Zero rows affected means a concurrent writer won the race. The loser does not
retry blindly: it re-reads the row and is either a **replay** (200) or a
**conflict** (409). That is the entire serialization story on SQLite, where row
locks do not exist, and it is the second line of defence on PostgreSQL behind
`SELECT ... FOR UPDATE` (see `10-postgres-concurrency.md`).

## `allowed_actions` — one authority for both halves

`allowedActionsForRequest({state, has_live_proposal, viewer})` is the single place
that answers "what may this viewer do now?", covering the MVP-03/04 states
(`SEARCHING`/`NEGOTIATING`) and the execution states without either half claiming
the other's vocabulary:

| state | customer view | partner view |
| --- | --- | --- |
| `SEARCHING` / `NEGOTIATING` | `accept_proposal` (when a live proposal exists) | `wait` |
| `ASSIGNED` / `EN_ROUTE` / `ARRIVED` | `cancel` | `start_en_route` / `mark_arrived` / `start_in_transit` + `cancel` |
| `IN_TRANSIT` | `track` | `finish_service`, `track` |
| `COMPLETED` / `CANCELLED` | — | — |

The ASSIGNED body returned to the **customer** therefore reports
`['cancel']`, while the same row returned to the **assigned partner** reports the
next progress action. This is a viewer-dependent projection of one state, not two
states — the RED correction that pinned it is recorded in
`04-red-corrections.md`.

## What is deliberately absent

No `COMPLETION_PENDING`, `NO_SHOW`, `DISPUTED` or `REMATCHING` state; no
"completion requires customer confirmation" edge; no timer/scheduler-driven
transition; no admin override edge. The state machine has exactly the seven edges
the product outcome names and no more.
