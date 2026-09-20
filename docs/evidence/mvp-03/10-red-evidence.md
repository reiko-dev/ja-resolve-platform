# MVP-03 — RED evidence (PHASE Q/R)

Captured **before** any MVP-03 production source existed, against the frozen
execution base `c0ae3c01774dbaaf162113cef574cb728ec8db61`, on branch
`feature/mvp-03-tow-request-matching`.

## 1. Command

```bash
npx jest tests/tow/mvp03 --runInBand
```

Raw output: `/tmp/mvp03-red.txt` (2792 lines, sha256
`41525119a4e71a11456aac437d4c5b766be16a53a67bc984e861203bd1047238`).

## 2. Result

```
Test Suites: 6 failed, 1 passed, 7 total
Tests:       151 failed, 7 skipped, 18 passed, 176 total
```

| Suite | Verdict at RED | Distinct failures |
| --- | --- | --- |
| `tests/tow/mvp03/towRequestDomain.test.js` | FAIL | 52 |
| `tests/tow/mvp03/towPartnerOpportunities.test.js` | FAIL | 31 |
| `tests/tow/mvp03/towRequestCreate.test.js` | FAIL | 26 |
| `tests/tow/mvp03/towRequestRehydrate.test.js` | FAIL | 20 |
| `tests/tow/mvp03/towMvp03Architecture.test.js` | FAIL | 13 |
| `tests/tow/mvp03/towRequestIdempotency.test.js` | FAIL | 9 |
| `tests/tow/mvp03/towMvp03Postgres.e2e.test.js` | PASS (7 skipped) | 0 |

The PostgreSQL suite is **opt-in** (`TOW_POSTGRES_E2E=1`): without the flag every
case is reported as skipped, which is why the suite itself reports PASS. That is
the intended default — the default test run never needs a database server.

## 3. Failure causes (grouped, deduplicated)

| Count | Cause | What it proves |
| --- | --- | --- |
| 86 | `delete from 'tow_requests' - SQLITE_ERROR: no such table: tow_requests` | the canonical persistence authority does not exist yet |
| 20 | `expect(received).toBeInstanceOf(expected)` | the domain/service factories are absent |
| 9 | `TypeError: isOperationalGeoPoint is not a function` | the geodesic guard does not exist |
| 6 | `TypeError: validateCreateTowRequestInput is not a function` | the frozen input contract does not exist |
| 5 | `TypeError: geodesicDistanceMeters is not a function` | the geodesic primitive does not exist |
| 5 | `TypeError: buildTowRequestDto is not a function` | the canonical DTO does not exist |
| 4 | `ENOENT ... database/migrations/004_mvp03_tow_requests.js` | migration 004 does not exist |
| 4 | `expect(received).toContain(expected)` | the four MVP-03 routes are not registered |
| 3 | `TypeError: canonicalFingerprintSource is not a function` | the idempotency fingerprint does not exist |
| 3 | `expect(received).toEqual(expected)` | the matching/ordering behaviour is absent |
| 2 | `expect(received).toBe(expected)` | HTTP status contract unmet (no route) |
| 1 | `TypeError: isWithinRadius is not a function` | the radius predicate does not exist |
| 1 | `TypeError: boundingBoxForRadius is not a function` | the bbox helper does not exist |
| 1 | `expect(received).toMatch(expected)` | migration content assertions unmet |
| 1 | `expect(received).toBeDefined()` | barrel export missing |

Representative raw sample:

```
● MVP-03 — partner opportunities › inclusion › an operational in-radius tow partner sees the request with the authoritative quote

    delete from `tow_requests` - SQLITE_ERROR: no such table: tow_requests

  ● MVP-03 domain — canonical TowRequest vocabulary › the canonical state list matches the frozen contract

    TypeError: validateCreateTowRequestInput is not a function
```

## 4. Why this is a genuine RED and not a tautology

- Every failing case fails for a **missing production artifact** (module, port,
  table, route, migration) or an **unmet behavioural assertion** — never for a
  missing test helper: `tests/helpers/tow/mvp03.js` and the five `*.test.js`
  files were written and committed to disk before the first `src/modules/tow/**`
  MVP-03 file.
- The 18 tests that passed at RED are the pre-existing MVP-01/MVP-02 assertions
  that the new suites re-state unchanged (module-status gate, canonical
  vocabulary constants that already lived in `domain/identity.js` /
  `domain/vehicle-classes.js`). They are re-run after GREEN as a regression net,
  not counted as MVP-03 evidence.
- No suite used `.only`, a hidden `.skip`, a `try/catch` around the assertion or
  a relaxed matcher to reach RED: the 7 skips are exactly the opt-in PostgreSQL
  cases guarded by `TOW_POSTGRES_E2E`.
- The default run makes **no real Google call**: the fake route provider is
  injected through `createApp({ tow: { routeProvider } })` /
  `buildTowServices({ routeProvider })`, and `routeProvider.callCount()` is
  asserted to be `0` on every exclusion path.

## 5. GREEN counterpart

After PHASE E–P the same command reports:

```
Test Suites: 7 passed, 7 total
Tests:       7 skipped, 170 passed, 177 total
```

(177 rather than 176 because GREEN added one explicit tie-break case to the
ordering suite; no RED case was removed or weakened.) The full gate matrix is
recorded in `MVP-03-WORK-RESULT.md`.
