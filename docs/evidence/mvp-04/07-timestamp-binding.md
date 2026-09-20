# MVP-04 — finding: one instant representation on both sides of every comparison

## Symptom

A green MVP-03 suite went RED after MVP-04 introduced its timestamp writes:

```
tests/tow/mvp03/towRequestRehydrate.test.js
  › the from/to window filters by created_at
    expect(received).toHaveLength(expected)   // both rows returned, one expected
```

and, separately, the `expires_at` liveness probe started treating expired
proposals as live on the SQLite harness.

## Root cause

Two representations of the same instant were being compared as **text**:

| Side | Value |
| --- | --- |
| stored / bound filter | `'2026-01-15T13:00:00.000Z'` (ISO-8601 instant) |
| stored row (SQLite `TEXT` column) | `'2026-01-15 13:00:00.000'` (knex `Date` binding) |

In ASCII, `'T'` (0x54) sorts **after** `' '` (0x20), so
`'2026-01-15T13:00:00.000Z' >= '2026-01-15 13:00:00.000'` is `true` for every
row of the same day: the window silently widened by exactly one boundary row.
PostgreSQL was never wrong — `timestamptz` compares instants, not strings — which
is why only the SQLite harness caught it.

A second, related trap sat underneath it: the SQLite harness patches `Date`
bindings to `'YYYY-MM-DD HH:MM:SS.mmm'`, but **that normalization does not reach a
query issued inside a transaction**, where a bound `Date` becomes a REAL epoch
double (`'1768…0.0'`) or `'[object Object]'`. The accept flow writes inside a
transaction — exactly the place where a bound `Date` is least safe.

## Fix

One rule: **`toIsoInstant(...)` on both sides of every comparison, and on every
write.**

| Site | Change |
| --- | --- |
| all three tow adapters | timestamps are written as `toIsoInstant(...)`, never as `Date` objects (`timestamptz` accepts the ISO string unchanged, so one representation is correct on both engines) |
| `tow-request-repository.applyFilters` | the `from`/`to` window binds `toIsoInstant(from)` / `toIsoInstant(to)`, with an inline comment naming the `'T' > ' '` trap |
| `tow-request-repository.findLiveRequestIds` | the `expires_at` liveness probe binds `toIsoInstant(now)` |
| proposal/assignment adapters | the same rule, so a proposal's `expires_at` cannot be read as live because of a lexical accident |

`toIsoInstant` itself was not re-implemented: it moved verbatim into
`domain/instants.js` and is re-exported from `tow-request.js`, so the accepted
MVP-03 surface is unchanged (asserted by the architecture suite).

## Why this is recorded as a finding, not a footnote

The MVP-04 acceptance path is *time-sensitive by construction*: a proposal expires
(`expires_at`), an assignment is released (`released_at`), and the accept flow
compares the two inside a transaction. A lexicographic widening of one boundary
row is exactly the class of defect that a "green suite" would hide on PostgreSQL
and expose in production on a different driver. The rule is now pinned on both sides of the boundary: the window filter by the
MVP-03 test that caught it (`towRequestRehydrate.test.js` › *the from/to window
filters by created_at*, which returned two rows before the fix and one after),
and the proposal liveness by the accept suite (an expired proposal answers
`409 proposal_expired` rather than being accepted). The domain rule itself is
pinned separately in `towProposalDomain.test.js`.
