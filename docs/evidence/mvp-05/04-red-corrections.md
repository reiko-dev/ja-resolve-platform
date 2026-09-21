# MVP-05 — RED-suite corrections found during implementation

The RED suites were written first (commit `331893f0`). Two of their assertions were
**internally inconsistent with the rest of the same file** and were corrected here,
before the suites were allowed to go green. Both corrections are recorded because
"the implementer edited a test" must always be auditable.

Neither correction weakens a behaviour: in both cases the corrected assertion is
*stronger* (it pins the arithmetic/viewer split the sibling tests already pin)
and the behaviour it protects is still certified by at least one other
independent assertion in the same file.

---

## Correction 1 — `towMvp05ExecutionApi.test.js`, ASSIGNED `allowed_actions`

**Was** `expect(fixture.assigned.allowed_actions).toEqual(['start_en_route', 'cancel'])`
**Now** `expect(fixture.assigned.allowed_actions).toEqual(['cancel'])`

`fixture.assigned` is the body of `POST /tow/proposals/{proposalId}/accept` — a
**customer** call (customer auth), so it carries the **customer's** view of the
request. `start_en_route` is a partner-only action. The test's own comment already
said what it meant ("the customer is told nothing it cannot do"), and the same
file pins the partner's ASSIGNED view through the partner-driven assertions and
`GET /tow/partner/jobs`.

Cross-references (all green, all independent of this assertion):

- `tests/tow/mvp05/towMvp05ExecutionApi.test.js` — the milestone calls are made
  with `partnerAuth` and assert `['mark_arrived', 'cancel']`, `['start_in_transit',
  'cancel']`, `['finish_service']`.
- `tests/tow/mvp04/towPartnerJobs.test.js` — the customer and the partner
  projections are compared field by field and the two `allowed_actions` arrays are
  asserted separately (`['cancel']` vs `['start_en_route', 'cancel']`).
- `tests/tow/mvp04/towAssignmentAccept.test.js` — the accept response is pinned to
  `['cancel']` (it was `[]` before MVP-05 existed).

This is the one **consumer-visible** change of the delivery, which is why the
contract revision is draft.7 → draft.8.

## Correction 2 — `towMvp05ExecutionApi.test.js`, finish-replay instants

**Was** `completed_at` / `released_at` = `'2026-01-15T12:41:00.000Z'`
**Now** `completed_at` / `released_at` = `'2026-01-15T12:01:00.000Z'`

The test drives the clock `advanceMinutes(1)` before the first `finish`, then
`advanceMinutes(9)` before the replay. The fake clock starts at
`2026-01-15T12:00:00.000Z`, so the first finish happens at **12:01** and the
replay at **12:10**. `12:41` is arithmetically unreachable in that test — it looks
like a copy of the 41-minute total of the lifecycle test above it.

The corrected assertion is exactly what the test name claims: the replay at 12:10
must NOT move `completed_at`, and `12:01 != 12:10` proves it. The sibling
lifecycle test independently pins the backend-clock arithmetic for all four
milestones (`12:02`, `12:12`, `12:17`, `12:42`), and
`tests/tow/mvp05/towMvp05Release.test.js` pins the release instant separately.

---

## Not corrections (behaviour deliberately re-pinned after MVP-05 landed)

| File | Change | Why it is truthful |
| --- | --- | --- |
| `tests/tow/mvp04/towPartnerJobs.test.js` | fabricated `COMPLETED` row now writes the full milestone chain; `release_reason` `CUSTOMER_CANCELLED` → `COMPLETED` | migration 006 adds the terminal-coherence CHECKs, so a state without its milestone is no longer a legal row; `COMPLETED` + `CUSTOMER_CANCELLED` was an incoherent pair |
| `tests/tow/mvp03/towPartnerOpportunities.test.js` | fabricated `CANCELLED` row now writes `cancelled_at` + `terminal_reason` | same CHECK (`(state = 'CANCELLED') = (cancelled_at IS NOT NULL)`) |
| `tests/tow/mvp03/towMvp03Architecture.test.js`, `tests/tow/mvp04/towMvp04Architecture.test.js` | the `/cancel`, `/tracking`, `/en-route`, `/arrived`, `/in-transit` bans were removed | MVP-05 owns those paths now; the positive assertion moved to `tests/tow/mvp05/towMvp05Architecture.test.js`, and every genuinely-unimplemented surface stays banned in all three files |
| `src/modules/tow/http/routes.js` | the header comment no longer spells the legacy `PUT /partner/location` path | the arch suites assert that token never appears in the file, comments included — the ban is kept, only the prose changed |
