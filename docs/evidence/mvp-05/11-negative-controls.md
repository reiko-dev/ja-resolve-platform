# MVP-05 — 11 Negative Controls

> Every safeguard MVP-05 claims was **broken on purpose** and the suite that
> claims to protect it was required to fail (RED), then the file was restored
> **byte-for-byte** (SHA-256 proven) and the same suite was required to pass
> (GREEN). A safeguard no mutation can break is not proven by the tests that
> claim to protect it.

Driver: `/tmp/mvp05-negative-controls.py` (kept out of the repository on purpose —
it mutates source files in place). Machine summary `/tmp/mvp05-nc/summary.json`,
transcript `/tmp/mvp05-nc/transcript.txt`, raw jest logs
`/tmp/mvp05-nc/<ID>-{red,green}-<suite>.log`.

**Restoration is proven by SHA-256, not by `git status`**: the work tree carries
uncommitted MVP-05 sources, so the driver copies the pristine file aside and
restores from that copy — `git checkout` would have destroyed the delivery. For
every control `before == after` and the mutated hash differs from both.

| Control | Safeguard mutated | File | Suite (RED → GREEN) | RED | GREEN |
| --- | --- | --- | --- | --- | --- |
| `NC-MVP05-1` | the assigned partner is verified BEFORE the state is inspected | `application/job-lock.js` | `towMvp05ExecutionApi.test.js` | 1F/14P | 15P |
| `NC-MVP05-2` | no milestone can be SKIPPED (`ASSIGNED → COMPLETED` is illegal) | `domain/tow-request-state-machine.js` | `towMvp05ExecutionApi.test.js` | 1F/14P | 15P |
| `NC-MVP05-3` | a terminal transition releases the assignment in the SAME transaction | `application/execution-service.js` | `towMvp05Release.test.js` | 1F/4P | 5P |
| `NC-MVP05-4` | the tracking READ authority is ownership OR assignment | `application/tracking-service.js` | `towMvp05Tracking.test.js` | 2F/12P | 14P |
| `NC-MVP05-5` | tracking is monotonic (an older point can never overwrite a newer one) | `adapters/persistence/tracking-repository.js` | `towMvp05Tracking.test.js` **and** `towMvp05Postgres.e2e.test.js` (E4) | 1F/13P **and** 1F/5S | 14P **and** 1P/5S |
| `NC-MVP05-6` | execution is DRAIN work: the new-business gate is NOT reapplied | `composition.js` | `towMvp05GracefulDrain.test.js` | 1F/5P | 6P |

`F` = failed, `P` = passed, `S` = skipped (the 5 PostgreSQL-gated tests other than
E4). Every control was RED on the first attempt.

| Control | SHA-256 before | SHA-256 mutated | SHA-256 after | restored |
| --- | --- | --- | --- | --- |
| 1 | `840aa736728118ee…` | `52bc8628bae9d000…` | `840aa736728118ee…` | ✅ byte-identical |
| 2 | `9e1aea34455299aa…` | `3209c55e667f3886…` | `9e1aea34455299aa…` | ✅ byte-identical |
| 3 | `b31911c5a5d1f276…` | `5984ba25c884bbab…` | `b31911c5a5d1f276…` | ✅ byte-identical |
| 4 | `77cb90add373374a…` | `0cae2a19ae1c6dfe…` | `77cb90add373374a…` | ✅ byte-identical |
| 5 | `c711735bdcbcc4d2…` | `e41c8eab06151d61…` | `c711735bdcbcc4d2…` | ✅ byte-identical |
| 6 | `b23a9c9716ae6fa3…` | `d216d1371d19e6e8…` | `b23a9c9716ae6fa3…` | ✅ byte-identical |

Full hashes are in `/tmp/mvp05-nc/summary.json` and reproduced in
`12-regression-summary.md`.

## What each control proves, and which assertion caught it

- **NC-MVP05-1** removes the `assertAssignedPartner` call from the shared
  `lockJobForPartner` preamble. Caught by
  *“a foreign tow partner is 403 `not_assigned_partner` on every transition”*
  (expected 403, got 200). This proves the ownership check is enforced on the
  execution path itself, not inherited from a helper exercised elsewhere — and
  that it runs before the state inspection.
- **NC-MVP05-2** adds `ASSIGNED → COMPLETED` to the frozen graph. Caught by
  *“ASSIGNED cannot jump to ARRIVED, IN_TRANSIT or COMPLETED”* (expected 409, got
  200). The graph is the only authority: no service hard-codes a second copy of
  the edge list, so one mutation is enough to make the endpoint skip a milestone.
- **NC-MVP05-3** disables the terminal release. Caught by
  *“completing the service releases the assignment and frees the partner”*
  (expected the release instant, got `null`). Proves the release is part of the
  terminal transition and not a later, optional step.
- **NC-MVP05-4** removes the tracking read authority. Caught by
  *“the owning customer recovers tracking; nobody else does”* **and**
  *“a foreign customer cannot read another customer tracking (403
  `not_request_owner`)”*. Two independent assertions fail, so the read authority
  is pinned by both the positive and the negative path.
- **NC-MVP05-5** removes BOTH halves of the monotonic guard (the pre-read fast
  path and the `.where('observed_at', '<=', …)` CAS). Caught twice, by two
  different mechanisms:
  - offline, sequentially: *“an older recorded_at is rejected with 409
    `stale_tracking_update`”* (expected 409, got 202) — the stored point is
    rewound by a delayed device fix;
  - on real PostgreSQL, concurrently: **E4** (expected 409, got 202) — the
    concurrent loser overwrites the newer point.
  This control is why the guard is a *predicate in the write* and not a
  read-then-write: removing only the pre-read is NOT enough to break the
  sequential case (the CAS still refuses), which is exactly the property E4
  pins under contention.
- **NC-MVP05-6** reapplies `moduleService.assertNewBusinessAllowed()` to the four
  execution operations in `composition.js` — the faithful reproduction of "the
  gate was added back to a drain path". Caught by *“an already-assigned job
  finishes after the module is disabled”* (expected 200, got 409
  `service_module_disabled`). This is what makes the graceful-drain claim
  testable: the suite detects the regression instead of passing because nothing
  ever tried to drain.

## One honest anomaly: NC-MVP05-5 GREEN, first attempt

The first GREEN attempt of the **offline** tracking suite after restoring
`tracking-repository.js` failed one test with **`socket hang up`** — not an
assertion, and not related to the mutated file (the SHA-256 already matched the
pristine copy, and the PostgreSQL E4 GREEN passed on its first attempt in the same
batch). `socket hang up` is the documented pre-existing Supertest transport
artifact of this repository (see `18-flake-census.md`, which reproduces it on the
untouched base commit as well). Per the transport policy it was rerun with
server-side proof rather than waived:

| rerun | result |
| --- | --- |
| `tests/tow/mvp05/towMvp05Tracking.test.js` × 3 (restored file) | 14/14, 14/14, 14/14 |
| `tests/tow` × 3 (restored file) | 1134 passed / 81 skipped, 0 failed — 3 / 3 |
| PG E4 (restored file) | GREEN, first attempt |

No MVP-05 assertion was waived: the failing test in that one run was the write →
read happy path, and its assertions pass in every clean run recorded in
`18-flake-census.md` and in the full gates of `12-regression-summary.md`.
