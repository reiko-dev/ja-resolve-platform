# MVP-04 — PostgreSQL concurrency proof: defects it found

The atomicity hard stop is *"PostgreSQL atomically establishes exactly one
assignment"*. That claim cannot be proven on the offline harness: `better-sqlite3`
is synchronous, the pool is a single connection, and the harness never enables
`PRAGMA foreign_keys` — so a read-then-write race cannot even be expressed there.
The proof lives in `tests/tow/mvp04/towMvp04Postgres.e2e.test.js`, opt-in via
`TOW_POSTGRES_E2E=1`, against the disposable container on port `55434`.

Building that suite found **three product defects and one test defect** that every
offline suite had declared green. They are the reason the PostgreSQL leg is not
optional.

## P1 — the accept path observed a stale snapshot of the request (FIXED)

**Found by C1.** Two partners accept different proposals for the same request
concurrently. Expected: one `200`, one `409 request_already_assigned`. Observed:
the loser answered `409 proposal_not_actionable` — because it evaluated its guards
against the request row it had read **before** the serialization point, by which
time the winner had already closed that proposal and flipped the request.

**Fix.** `acceptWithin` now uses the row returned by `requests.lockById(...)`
(`SELECT … FOR UPDATE` on PostgreSQL) for every guard, for
`markAssigned`, for `closeActiveForRequestExcept` and for the response. The locked
row *is* the committed state; the pre-lock snapshot is not consulted again.
C2 additionally pinned that an idempotent replay reports the committed
`ASSIGNED` request rather than a stale `NEGOTIATING`.

**Detected by:** `NC-MVP04-3` — restoring the stale snapshot
(`const assignedRequest = towRequest;`) turns the accept suite RED (4 of 22 failed).

## P2 — a lost race on the sibling-idempotency path answered 500 (FIXED)

**Found by C6.** Three concurrent creates by the same partner for the same
request. Expected: one `201`, two `409 proposal_already_active`. Observed: two
`500`s.

**Root cause.** The loser's insert was rejected by the
`(tow_request_id, partner_id) WHERE status = 'ACTIVE'` partial index — a
**different idempotency key**, i.e. a *sibling* create, not a retry — but the
recovery path only looked for a row with the *same* key. Finding none, it
re-threw the raw driver error.

**Fix.** The insert rejection is disambiguated by constraint name
(`error.constraint` on PostgreSQL, `UNIQUE constraint failed: …` on SQLite) with a
row-existence fallback, and answered as the same `409 proposal_already_active` the
pre-read guard raises. A unique violation is never a 500.

## P3 — timestamp comparisons widened by one row (FIXED)

**Found by the MVP-03 regression** (`towRequestRehydrate`) once MVP-04 began
writing ISO instants. See `07-timestamp-binding.md` for the full analysis:
`'T' > ' '` made `'…T13:00:00.000Z' >= '… 13:00:00.000'` true for every row of
the same day. Both the window filter and the `expires_at` liveness probe now bind
`toIsoInstant(...)`.

## D1 — the C3 test asserted the wrong SQLSTATE (TEST DEFECT, FIXED)

C3 inserts a second assignment for the same request **raw**, to prove the
`UNIQUE(tow_request_id)` constraint is the authority rather than the service's
read-then-write check. The raw insert omitted the NOT NULL `vehicle_plate`, so the
engine raised **23502** (not-null violation) and the test's `23505` assertion
failed for a reason that had nothing to do with uniqueness. The insert now carries
the column, and the assertion proves what it claims.

## C9 — making the recovery branch deterministically reachable

C8 races two HTTP creates with the same key and different payloads and asserts one
`201` + one `409 idempotency_conflict`. That test is honest but **not
deterministic about which layer decides**: if the loser's pre-read runs after the
winner commits, it replays through `findReplay` and never touches the
unique-violation recovery branch. `NC-MVP04-6b` therefore detected the mutated
recovery branch in one run and missed it in the next.

C9 removes the race from the equation. It deletes a committed proposal, re-inserts
that exact row **uncommitted** on another connection, dispatches the create, and
only commits once `pg_stat_activity` proves the create's `INSERT` is blocked on
the unique index (`wait_event_type = 'Lock'`). At that moment the pre-read has
provably already passed, so the `409` can only come from the recovery branch.
Three consecutive `NC-MVP04-6b` runs then turned RED reliably (2, 2 and 1 of 10
tests failing) with byte-identical restores.

A mechanism note worth keeping: a **supertest chain is lazy until it is awaited**.
C9's first draft built the request but never dispatched it, so nothing blocked and
the test silently proved the opposite of what it claimed; the chain now ends in
`.then((response) => response)` to dispatch immediately. Any test that must observe
a request *in flight* has to do the same.

## The proof matrix (10/10 green)

| Case | Proves |
| --- | --- |
| migration 005 | applies from an empty schema; both tables and the atomicity indexes exist |
| **C1** | two concurrent accepts of different proposals → exactly one assignment; loser `409 request_already_assigned` |
| **C2** | N concurrent accepts of the *same* proposal → one assignment, N identical `assigned_at` |
| **C3** | `UNIQUE(tow_request_id)` rejects a raw second assignment (23505) |
| **C4** | one live job per partner is a partial unique index (`released_at IS NULL`) |
| **C5** | disable × accept is deterministically serialized |
| **C6** | concurrent creates by one partner for one request → one `201`, rest `409 proposal_already_active` |
| **C7** | a referenced vehicle is protected by `RESTRICT` (23503) and the delete answers 409 |
| **C8** | concurrent same-key different-payload creates → one `201`, one `409 idempotency_conflict`, one row |
| **C9** | the unique-violation recovery branch is reached deterministically and compares digests |

Transcript: `16-postgres-canonical.txt` (and `15-postgres-legacy.txt` for the
pre-existing PostgreSQL suites, which must run on a **pristine** container first:
their `migrate.latest()` uses knex's own ledger and collides with the canonical
baseline's `users` table otherwise).
