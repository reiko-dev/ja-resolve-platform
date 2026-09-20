# MVP-04 — RED evidence and RED-suite defect log

## The RED commit

`9eb32a69` — *test(mvp-04): RED suite for the proposal lifecycle and atomic
assignment* — adds **seven test files and no production source**: six suites plus
the shared fixtures.

| File | Pins |
| --- | --- |
| `tests/tow/mvp04/towProposalDomain.test.js` | proposal/assignment vocabulary, the frozen server-priced input, action-time expiry, DTO conformance, the occupancy predicate |
| `tests/tow/mvp04/towProposalCreate.test.js` | `POST /tow/requests/:id/proposals`: module gate first, empty body by contract, eligibility revalidated before any provider call, duplicate policy, idempotency, `SEARCHING → NEGOTIATING` |
| `tests/tow/mvp04/towAssignmentAccept.test.js` | accept/withdraw: exactly one assignment, winner `ACCEPTED`, losers `CLOSED`, request `ASSIGNED`, idempotent replay, occupancy, module gate |
| `tests/tow/mvp04/towProposalContract.test.js` | live HTTP 200/201 bodies validated by ajv against the composed canonical contract, plus in-suite negative controls |
| `tests/tow/mvp04/towMvp04Architecture.test.js` | DB constraints as the atomicity authority, migration registration, purity, scope discipline |
| `tests/tow/mvp04/towMvp04Postgres.e2e.test.js` | opt-in real-PostgreSQL concurrency proof C1–C6 (skipped offline) |
| `tests/helpers/tow/mvp04.js` | the fixtures the six suites share |

**97 of 117 assertions were RED on that commit.** The 13 that passed were
deliberately the *absence* invariants that already hold — layering purity, legacy
isolation, "no scheduler", "no counteroffer / MVP-05 surface" — so the RED state
itself proved the scope boundary, not just the missing feature. The opt-in
PostgreSQL suite is skipped offline; its RED state is only observable in
`TOW_POSTGRES_E2E=1`, which is why the concurrency proof is a separate artifact
(`09-postgres-concurrency.md`).

## RED-suite defects (found and corrected before GREEN)

A RED suite is a claim about the product. Five of its claims were wrong — they
encoded a defect of the *suite*, and they were corrected on their own commit
(`f1f96751`, `5d0e05bc`) rather than bent to fit the implementation that followed.
Two of the five contradicted invariants the platform already enforces hard.

| # | Suite | The wrong claim | Why it was wrong | Correction |
| --- | --- | --- | --- | --- |
| RS-1 | `towProposalDomain` | the proposal *record* must own a 64-hex SHA-256 digest | `node:crypto` is banned in Domain/Application by the architecture suite. The domain owns the deterministic fingerprint **source**; only the adapter may hash it. | the domain test pins the transient key only; the 64-hex assertion moved to the create HTTP suite, where it proves the *adapter* hashed it (`f1f96751`) |
| RS-2 | `towProposalDomain` | the assignment record must freeze a route/tariff snapshot | migration 005 stores no such column, and duplicating the proposal snapshot would create a second pricing authority | a new assertion pins that the assignment carries `proposal_id` and **none** of the proposal's snapshot columns (`f1f96751`) |
| RS-3 | `towProposalCreate` | the disabled-module gate test wrote `service_modules` with a raw `update` | the row is created lazily on the first gated call, so the update matched zero rows and the test asserted nothing at all | the test drives the module service instead (`5d0e05bc`) |
| RS-4 | `towProposalContract` | path items and parameters must match the canonical document literally | the canonical is allowed to reference the base (`$ref`) and to name parameters differently; comparing raw objects asserted document style, not contract agreement | refs and parameter names are normalized before comparing (`5d0e05bc`) |
| RS-5 | `towMvp04Architecture` | the keyword `alterTable` is banned outright, and the module gate must appear before the unit of work by whole-file offset | the SQLite fallback legitimately uses `alterTable` on the table this very migration creates, and `accept` delegates to `acceptWithin`, declared earlier in the file | both now assert the real invariant: only owned tables are touched, and the gate runs inside `accept` **before** the unit of work is opened (`5d0e05bc`) |

RS-1 and RS-2 are the important ones: had they been "fixed" by satisfying them,
the delivery would have put `node:crypto` inside the domain or created a second
copy of the price snapshot — both regressions the accepted MVP-01/02/03 baseline
explicitly forbids.

## What the RED suite does *not* claim

- No counteroffer, no tracking, no payments, no scheduler, no Phase-2 surface:
  asserted as absent, not implemented.
- No maximum-proposals-per-request rule: not mandated by the frozen contract, so
  it is out of scope rather than invented (see `MVP-04-WORK-RESULT.md`, Scope).
- The create path never checks partner occupancy — occupancy is an *accept*-time
  rule, and the create suite pins that a busy partner may still propose.
