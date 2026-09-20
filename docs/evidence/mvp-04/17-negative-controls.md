# MVP-04 — 17 Negative Controls

> Every safeguard MVP-04 claims was **broken on purpose** and the suite was
> required to fail (RED), then the file was restored byte-for-byte and the suite
> was required to pass (GREEN). A safeguard that no mutation can break is not
> proven by the tests that claim to protect it.

Driver: `/tmp/mvp04-negative-controls.py` (kept out of the repository on purpose —
it mutates tracked source files; the results below are the evidence).
Full transcript: `/tmp/mvp04-nc/transcript.txt`, machine summary
`/tmp/mvp04-nc/summary.json`, raw jest logs `/tmp/mvp04-nc/<ID>-{red,green}.log`.

Restoration is proven by SHA-256, not by `git status`: `before == after` for every
control, and the mutation hash differs from both.

| Control | Safeguard mutated | File | Suite | RED exit | RED | GREEN | restore byte-identical |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `NC-MVP04-1` | losers are CLOSED after the winner is accepted | `assignment-service.js` | towAssignmentAccept.test.js | 1 | 3F/19P/22 | 22P/22 | yes |
| `NC-MVP04-2` | the winning proposal becomes ACCEPTED | `assignment-service.js` | towAssignmentAccept.test.js | 1 | 4F/18P/22 | 22P/22 | yes |
| `NC-MVP04-3` | the request becomes ASSIGNED inside the transaction | `assignment-service.js` | towAssignmentAccept.test.js | 1 | 4F/18P/22 | 22P/22 | yes |
| `NC-MVP04-4` | module gate is the FIRST check of the accept path | `assignment-service.js` | towAssignmentAccept.test.js | 1 | 1F/21P/22 | 22P/22 | yes |
| `NC-MVP04-5` | MVP-03 eligibility verdict is enforced on the create path | `proposal-service.js` | towProposalCreate.test.js | 1 | 7F/40P/47 | 47P/47 | yes |
| `NC-MVP04-6` | idempotency digest comparison (same key, different payload) | `tow-proposal-repository.js` | towProposalCreate.test.js | 1 | 1F/46P/47 | 47P/47 | yes |
| `NC-MVP04-6b` | idempotency digest comparison on the unique-violation recovery path | `tow-proposal-repository.js` | towMvp04Postgres.e2e.test.js | 1 | 2F/8P/10 | 10P/10 | yes |
| `NC-MVP04-7` | a referenced vehicle cannot be erased (delete guard) | `vehicle-repository.js` | towVehicleReferenceGuard.test.js | 1 | 4F/2P/6 | 6P/6 | yes |
| `NC-MVP04-8` | `tow_assignments.tow_request_id` UNIQUE (one assignment per request) | `005_mvp04_proposals_assignments.js` | towMvp04Postgres.e2e.test.js | 1 | 2F/8P/10 | 10P/10 | yes |

`F` = failed, `P` = passed. Every control was RED on the first attempt and GREEN
on the first attempt (`green_attempts = 1` for all nine), so no result depends on
a retry loop.

## What each control proves

- **NC-1 / NC-2 / NC-3** are the three writes of the atomic accept, mutated one at
  a time: closing the losers, accepting the winner, assigning the request. Each
  mutation breaks between three and four assertions, so the three facts are
  independently pinned — the suite does not pass because one of them happened to
  imply another.
- **NC-4** removes the module gate from the accept path. The suite notices, which
  proves the gate is enforced *on this path* and not merely inherited from a
  helper exercised elsewhere.
- **NC-5** forces the MVP-03 eligibility verdict to `matched: true`, i.e. it
  disables the reuse of the accepted matching pipeline on the create path. Seven
  assertions fail, which is what "MVP-04 reuses MVP-03 eligibility" means in
  practice.
- **NC-6 / NC-6b** are the two idempotency digest comparisons: the ordinary replay
  (`findReplay`) and the recovery path taken when a concurrent insert wins the
  unique index. Both were mutated to "always the same payload"; each is caught by
  its own test, so the two paths cannot silently share a single check.
- **NC-7** removes the vehicle reference count, i.e. it re-opens the ability to
  erase a `TowVehicle` that proposals or assignments point at.
- **NC-8** deletes the `tow_assignments.tow_request_id` UNIQUE constraint from the
  migration and re-migrates a pristine database: two concurrent accepts then both
  succeed, and the PostgreSQL suite fails. This is the constraint the whole
  atomicity claim rests on, so it is the one mutation that must never be
  survivable.

## History (why NC-6b exists)

`NC-MVP04-6b` was **GREEN** in the first full batch: the recovery branch it mutates
was reachable only if a specific race was lost, and the losing connection could
answer from the pre-read replay instead, so the mutated line was never executed.
That is a test defect, not a product defect, and it was fixed by adding test C9 to
`towMvp04Postgres.e2e.test.js`: it holds an uncommitted insert of the same
`(partner_id, idempotency_key)` on a second connection, dispatches the create, waits
for the blocked insert, commits, and only then lets the create answer — which forces
the unique-violation recovery branch deterministically. NC-6b is RED on every run
since (2, 2 and 1 failing tests across runs), with byte-identical restores.
