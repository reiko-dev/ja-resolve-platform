# MVP-05 — 10 PostgreSQL Concurrency

> The six gates that can only be decided by a real PostgreSQL server:
> `tests/tow/mvp05/towMvp05Postgres.e2e.test.js` (E1–E6).
> Raw transcript: `17-postgres-mvp05.txt`. Full Tow directory with PostgreSQL
> enabled: `21-postgres-tow.txt`.

## Environment

| item | value |
| --- | --- |
| engine | PostgreSQL (disposable `docker-compose.test.yml` project) |
| port | **55434** (see the environment note below) |
| database / user | `socorre_ai_tow_test` / `tow_test` |
| suite | `DB_PORT=55434 TOW_POSTGRES_E2E=1 npx jest tests/tow/mvp05/towMvp05Postgres.e2e.test.js --runInBand` |
| result | **6 passed / 6** |

> **Environment note (pre-existing, not a regression).** `npm run verify:tow`
> defaults to port **55432**, which on this machine is permanently occupied by an
> unrelated long-running container (`akry-edge-pg`, up >20h). That container is
> not part of this repository and was **not** touched. All PostgreSQL work for
> MVP-05 was therefore run on **55434**, with its own compose project
> (`socorre-tow-test-55434-cb0d0933`), started and torn down by the repository's
> own harness (`DB_PORT=55434 npm run test:pg:up` / `test:pg:down`).

## Why these gates cannot be offline

The offline harness is SQLite, where `SELECT … FOR UPDATE` is a no-op. The
delivery's serialization on SQLite is the guarded CAS (`WHERE state = :from`), so
the *contention* questions — lost updates, deadlocks, a blocked writer reading a
stale row — are only answerable on an engine with real row locks. Each gate below
therefore uses **real concurrent HTTP requests** against the real app, with the
real migrations applied by `migrateFromScratch`.

## E1 — duplicate milestone contention

Four concurrent `POST /en-route` (same request, distinct `Idempotency-Key`s).

| assertion | why |
| --- | --- |
| all four answer **200**, all report `state = 'EN_ROUTE'` | no 500, no deadlock, no lost request |
| exactly **one** `en_route_at`, equal to the clock instant | one APPLY; the milestone is written once |
| a second contended round at a **later** instant (12:01) leaves `en_route_at` **and** `updated_at` at 12:00 | the three replays wrote nothing — a lost update or a re-stamping replay would move them |

The last assertion is the strong one: it distinguishes "the row happens to hold
the right value" from "only the winner wrote".

## E2 — a milestone racing a cancellation

`start_in_transit` and a customer `cancel` are issued concurrently.

| assertion | why |
| --- | --- |
| the cancellation is **never lost**: the row ends terminal and coherent | a cancel that vanishes would strand a job the customer dropped |
| the milestone ordering CHECKs hold on the final row | the schema refuses an incoherent chain, and the service never tries to write one |
| exactly **one** release, `release_reason = 'CANCELLED'` | a terminal transition releases once |

Whichever wins, the loser is a REPLAY (200) or a 409 — never a second write.

## E3 — two cancellations racing

Customer `cancel` and assigned-partner `cancel` concurrently.

| assertion | why |
| --- | --- |
| **one** attribution is persisted (`cancelled_by_actor_type`/`_id`) | the winner's, written once |
| **both** responses report the winner's `terminal_reason` | the loser is told who actually cancelled, never told its own attribution was applied |
| exactly one release | no double release |
| `financial_consequence` is the frozen zero (`fee_due_cents: 0`, `customer_debt_created: false`) on both responses | cancellation has no financial consequence in this delivery |

## E4 — tracking contention

Concurrent tracking points, including a strictly older one and an equal instant.

| assertion | why |
| --- | --- |
| exactly **one** row for the request at all times | `UNIQUE(tow_request_id)` + upsert |
| the **newer** point always wins, regardless of arrival order | monotonic guard is a predicate in the write |
| the older point gets **409 `stale_tracking_update`** | a delayed fix cannot rewind the customer's view |
| an **equal** instant is accepted and still leaves one row | deterministic, no duplicate |
| the read path agrees with the row | the winner is what the customer sees |

This is the gate that catches a "read-then-write" implementation: the offline
suite can pass such a version sequentially, and E4 cannot.

## E5 — schema guards and `down()` exactness

| assertion | why |
| --- | --- |
| the 11 named CHECK constraints exist with their real definitions | the schema, not the service, is the last line of defence |
| a raw `INSERT`/`UPDATE` that violates each invariant is **refused** (`SQLSTATE 23514`) | proven by executing the SQL, not by reading the DDL |
| a tracking row for a nonexistent request is refused (`23503`) | the FK is real |
| `down()` drops the table and exactly the 8 columns, keeping `id`/`state`/`terminal_reason`/`updated_at` and every other table | the migration is reversible |
| `up()` after `down()` restores the table and all 11 constraints | **this is the assertion that found a real defect**: the first version of `down()` left `tow_requests_terminal_reason_state_check` behind (it references columns that outlive the migration), so re-applying 006 collided. Fixed by dropping all 11 by name, in reverse order, from the same list `up()` installs (`05-persistence-decision.md`) |

## E6 — a blocked writer reads the committed state

An uncommitted transaction holds `SELECT … FOR UPDATE` on the request and sets
`state = 'CANCELLED'` with `PARTNER_CANCELLED`. A customer `cancel` arrives and
blocks on the row lock.

| assertion | why |
| --- | --- |
| the blocked request is really blocked (`pg_stat_activity` shows a `Lock` wait on `tow_requests`) | the gate is about contention, not timing |
| while blocked, another session still reads the **pre-writer** row (`ASSIGNED`) | READ COMMITTED: nothing uncommitted leaks |
| after the writer commits, the blocked call answers **200** and reports the **writer's** `PARTNER_CANCELLED` attribution | the loser resolves against the committed state instead of overwriting it |
| the final row keeps the writer's attribution and instant | no stale write ever lands |

## Inherited PostgreSQL gates

The same run (canonical env, port 55434) re-runs every inherited PostgreSQL gate:
MVP-04 C1–C9, the T01 foundation suite, the MVP-03 partner-opportunities suite,
the legacy `towPostgres.e2e.test.js` and `g3TowPostgres.e2e.test.js`, and the
db-baseline gate. Their results are recorded in `12-regression-summary.md`; the
MVP-05 migration is additive to all of them (no legacy suite was modified to
accommodate it).
