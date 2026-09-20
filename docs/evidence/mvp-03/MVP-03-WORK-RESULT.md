# MVP-03 Work Result

## Status
READY_FOR_MUSE_REVIEW

## Base / Branch / Head
- Repository: `socorre-system`
- Execution base (frozen): `c0ae3c01774dbaaf162113cef574cb728ec8db61` — the actual MVP-03 dispatch base (post-bookkeeping main). Historical fact preserved in the task graph: MVP-02 accepted main = `1f589d60b8f8020cc6162ebf2c5200c0d2cfa632` (PR #36, receipt `#5749173315`).
- Branch: `feature/mvp-03-tow-request-matching`
- Implementation head (frozen): **`15f7f57a44986e94827be9749cadeee006dbbeff`** — 47 files, +7340/−40. This `MVP-03-WORK-RESULT.md` and `12-final-confirmation.txt` are a follow-up evidence commit that changes no source file (the MVP-02 precedent).
- Pre-Muse hardening head (frozen): **`1756742e104ec579c86e6f6e396276a8bb4f60cf`** — test-only transport hardening in `tests/tow/mvp03/towRequestIdempotency.test.js` (1 file, +44/−2; no production or source change). The hardening evidence below is a follow-up docs/evidence commit that changes no source or test file.
- Correction-2 head (frozen): **`1bbfd13a`** — base of this correction; two orchestrator-found issues fixed in this pass (T01 e2e pin + 401 flake diagnosis). See **Correction-2** below and evidence `19-e2e-pin-fix.txt` / `20-401-flake-diagnosis.txt`. Test-only: `tests/tow/baseline/dbBaseline.e2e.test.js` (pin) and `tests/tow/mvp03/towRequestCreate.test.js` (diagnostic guard). **No production file changed.**
- Issue: #15 (MVP-03 — Tow Request & Lean Geographic Matching)
- Push / PR / merge: **not performed.** No push, no PR, no merge, no MVP-04, no #31/#33, no production/VPS. This executor stops before Muse review by instruction.

## Current-State Delta
Delivered as its own artifact before any code:
`docs/evidence/mvp-03/01-current-state-delta.md` maps every MVP-03 capability →
existing implementation (`file:line`) → disposition, and audits the new Tow
module plus the legacy `EmergencyRequest` subsystem. Companion artifacts:
`02-legacy-audit.md` (legacy inventory + the four blockers it creates) and
`03-persistence-decision.md` (the persistence ruling).

Highlights that shaped the delivery:

- The Tow module already had `domain/identity.js`, `domain/vehicle-classes.js`,
  `domain/errors.js`, `domain/eligibility.js`, `domain/documents.js`,
  `domain/pricing.js`, `domain/route.js`, `domain/geo.js` (validation only),
  `application/ports.js`, `application/quote-service.js` and the HTTP layer for
  module status, vehicles, documents and admin. All of it is **REUSED**; nothing
  was rewritten.
- What was genuinely **MISSING**: the request aggregate, its persistence, the
  module request gate, the configurable matching radius, the geographic filter,
  partner opportunities, customer rehydration and the four new routes.
- The legacy `EmergencyRequest` subsystem was audited and **deliberately not
  reused** (see Persistence below). It is left byte-identical.

## Persistence Decision
`03-persistence-decision.md` — decision: **Option B, a canonical `tow_requests`
table**, not the legacy `emergency_requests`.

The audit produced four independent blockers to Option A:

1. `emergency_requests.type` has a CHECK constraint whose enum does **not**
   contain `'tow'`, so a tow request cannot even be stored.
2. `request_type` / `proposal_status` are unconstrained strings; the legacy table
   has no canonical state vocabulary, so the frozen contract enum could not be
   enforced by the database.
3. There is **no idempotency infrastructure anywhere in the platform** — no
   `idempotency_key` column, no uniqueness authority, no fingerprint. Concurrency
   safety (an MVP-03 hard stop) cannot be built on the legacy table without
   altering a table owned by another subsystem.
4. `models/Partner.js` already references columns that do not exist
   (`specialty`, `last_seen`); the legacy subsystem is not a trustworthy base to
   extend.

MVP-03 therefore adds `database/migrations/004_mvp03_tow_requests.js` and leaves
the legacy tables untouched (asserted by an architecture test that strips
comments and requires the migration's only `dropTableIfExists` argument to be
`['tow_requests']`, with no `alterTable`/`renameTable`/`dropColumn`).

## Architecture
Unchanged MVP-01/MVP-02 layering, extended by one aggregate:

- `domain/**` — pure. New: `tow-request.js` (aggregate vocabulary, frozen input
  shape, record/DTO builders), `idempotency.js` (key window + canonical
  fingerprint source), `matching.js` (match evaluation, exclusion codes,
  deterministic ordering). `geo.js` gained the geodesic primitive.
- `application/**` — ports + services only. New `tow-request-service.js`,
  `matching-service.js`, `list-query.js`; `ports.js` gained the
  `TowRequestRepository` port and `PartnerRepository` gained the operational
  location read.
- `adapters/persistence/**` — `tow-request-repository.js` (the only file that
  hashes with `node:crypto` and the only owner of the atomic upsert);
  `partner-repository.js` extended with the operational-location projection.
- `http/**` — `tow-request-controller.js`, the four routes, `requireCustomer`,
  `serializeOpportunity`.
- `composition.js` — the only place the pure layers meet Knex, HTTP and the
  system clock; it now also wires `towRequestService` and `matchingService`.

Enforced, not asserted, by `tests/tow/mvp03/towMvp03Architecture.test.js`:
Domain/Application import only relative siblings, contain no
`express`/`knex`/`fs`/`axios`/`process.env`/`Math.random`/`Date.now`, and no file
outside `adapters/` requires `node:crypto`.

## Canonical TowRequest Aggregate
`domain/tow-request.js`:

- `TOW_REQUEST_STATES` is the frozen contract enum (11 states);
  `INITIAL_TOW_REQUEST_STATE = 'SEARCHING'`. **Creation can only produce
  `SEARCHING`** — MVP-03 has no state machine, no scheduler and no proposal flow,
  so no other state is reachable.
- `TERMINAL_REASONS` is the frozen contract enum (7 reasons). MVP-03 produces
  **none** of them: zero matches never terminalizes a request.
- The input shape is frozen (`additionalProperties: false`): `pickup`,
  `destination`, `vehicle`, `problem_description` required; `observations`
  optional. Coordinate ranges, `year ∈ [1900, 2200]`, `weight_kg` a positive
  integer, and the class/weight coupling (`medium_truck`/`heavy_truck` require
  weight; the lighter classes may carry it) are all validated in the domain and
  re-stated in the contract; the coordinate, year, weight and radius bounds are
  additionally mirrored by DB CHECK constraints (Muse F1: earlier prose said the
  lighter classes must not carry weight — the code is correct, the sentence was
  wrong).
- `matching_radius_km` is **frozen at creation** from the
  `tow_initial_radius_km` setting. It is a snapshot, not a live reference:
  changing the setting afterwards cannot re-scope an existing request.

## Module Request Gate
`moduleService.assertNewBusinessAllowed()` is evaluated **first** in `create()`,
before payload validation, before the idempotency key check and before any replay
lookup. A disabled module fails identically for a new request and for a retry of
an existing one, with `service_module_disabled` (409), and **persists nothing**.
`NC-MVP03-1` proves the guard is load-bearing.

## Idempotency (concurrency-safe)
- `Idempotency-Key` is a **required** header on `POST /tow/requests`; the contract
  declares it `required: true`, string, 8–128 characters. Missing, short or long
  → 422 `validation_error`.
- The application builds a **canonical fingerprint source** through the domain
  (stable key ordering, no `crypto` in the application layer); the adapter is the
  only place that hashes (`node:crypto` sha256) and the only owner of the atomic
  upsert.
- Uniqueness authority is the database: `UNIQUE (customer_id, idempotency_key)`.
  The read-then-write path is an optimisation, not the authority — a lost race is
  caught as a unique violation and the winner's row is re-read. This is asserted
  against **real PostgreSQL under true concurrency** (five parallel identical
  requests collapse to exactly one row) and proven necessary by `NC-MVP03-4b`.
- Same key + same payload → the **same** request is returned (`201` on the first
  call, the replay returns the original record). Same key + different payload
  (including a change of pickup, vehicle or observations) → 409
  `idempotency_conflict`. The key is scoped **per customer**: another customer's
  identical key is a different request, never a conflict and never a leak.
- The persisted fingerprint is a **hash**, never the raw payload (asserted).

## Geographic Matching (geodesic only)
- `domain/geo.js` owns **exactly one** distance primitive:
  `geodesicDistanceMeters`, an `atan2` haversine on the IUGG mean radius
  `EARTH_MEAN_RADIUS_METERS = 6371008.8` (metres). It is imported by
  `domain/matching.js` and by nothing in the pricing/route path.
- `isWithinRadius` is inclusive at the boundary, and `boundingBoxForRadius` is
  provided as a pure helper. The opportunity query deliberately does **not**
  push a bounding box into SQL: the partner is fixed by authentication and the
  candidate scan is capped at 500 `SEARCHING` requests, documented rather than
  silently unbounded. A bbox pre-filter is deferred, not smuggled in.
- The filter is applied against the request's **frozen** `matching_radius_km`, so
  two requests at different radii behave differently for the same partner
  (asserted).
- **Pricing stays Google Routes.** No distance from `geo.js` ever reaches
  `domain/pricing.js`, `domain/route.js`, `application/quote-service.js` or
  `adapters/routes/**`. `tests/tow/mvp02/towRouteProviderBoundary.test.js` is
  **byte-identical** (sha256 `f564f9ed20512383c55a4b437c5ba943376a293514845756ffa886f9ba609e9f`),
  so the module-wide ban on `6371` / `haversine(` / `toRadians(` / `Math.acos(`
  is **not weakened by one character**. The new primitive is distinguished by
  naming (`degreesToRadiansValue`) and by using `Math.atan2`; ownership is
  asserted instead of the guard being relaxed.

## Eligibility Composition
MVP-03 **composes the MVP-01 policies** (`evaluateEligibility`,
`domain/eligibility.js` + `domain/documents.js`) rather than re-implementing
them. `evaluateTowMatch` applies, in order: module gate → partner exists →
`type === 'tow'` → `is_available` → `is_online` → operational coordinates →
eligibility → radius. `NC-MVP03-2` proves the composition is wired in (8 tests
turn RED when it is skipped), including the inclusion counter-example that a
partner with no vehicle sees an empty feed and never reaches the provider.
`is_online` is required because `PARTNER_OFFLINE` is a canonical operational
blocker in the frozen contract (`TOW-API-CONTRACT-DRAFT4-ADDENDUM.md` §2);
`is_verified` and `approval_status` remain proven not to exclude.

Two things are explicitly **not** required and are documented rather than
silently tightened: `is_verified` and `approval_status` (proved by inclusion
tests — an unverified, unapproved-but-eligible partner *does* see the
opportunity), and partner debt / active service (MVP-05/MVP-06 scope).

## Partner Opportunities
`GET /tow/partner/opportunities` (`requireTowPartner`):

- The authenticated partner is fixed by `req.user.partner_id`; a partner can
  never query another partner's feed.
- `SEARCHING` requests are the candidates. Exclusions are reported with the
  canonical codes `MODULE_DISABLED`, `PARTNER_MISSING`, `OUTSIDE_RADIUS`.
- Ordering is deterministic: geodesic distance ascending, tie-broken by request
  id ascending (`compareRequestIds`, BigInt-safe), with an explicit equidistant
  test.
- The authoritative MVP-02 quote is computed **live** for matched and paginated
  items only — never for an excluded item, and `routeProvider.callCount()` is
  asserted to be `0` on every exclusion path. A provider failure degrades the
  whole feed to 503 `external_dependency_unavailable` with **no partial feed and
  no `amount_cents`**.
- The response carries only the contract `RouteQuote` projection
  (`total_distance_meters`, `total_duration_seconds`). The internal per-leg
  breakdown and `encoded_polyline` stay internal — asserted.

## Zero-Match Behaviour
A request with no matching partner stays `SEARCHING` with `items: []`, is
**never** terminalized, and a retry with the same idempotency key returns the
same request. No `NO_PROVIDER_AVAILABLE` is written (that reason belongs to a
later delivery that owns expiry).

## Customer Rehydration
- `GET /tow/requests` — the documented recovery path: the customer's own
  requests, paginated (`PaginationMeta {page, limit, total}`, page default 1,
  limit default 20, max 100).
- `GET /tow/requests/:requestId` — **owner-only**. A mismatch is 403
  `not_request_owner`; an unknown or non-numeric id is 404. A partner or an admin
  calling the customer routes gets 403 from `requireCustomer`.
- `POST /tow/requests` requires `role === 'user'`; a partner or admin token is
  rejected with 403 before any business logic runs.
- No cross-customer read is reachable: the repository exposes
  `findByIdForCustomer`, and the controller always passes `req.user.id`.

## DTO Shapes
`buildTowRequestDto` emits the contract shape and nothing more:

- `state` / `terminal_reason` truthful (`SEARCHING` / `null`).
- `matching`: `{current_radius_km: <frozen>, max_radius_km: <tow_max_radius_km>,
  search_expires_at: null}` — the max radius surfaces only as information and
  never re-scopes the request; `search_expires_at` is `null` because MVP-03 has
  no expiry.
- `payment`: neutral — `{method: null, status: 'NOT_SELECTED',
  can_start_service: false}` (plus `request_id` and null amounts/currency/pix).
  No price is attached to a request by MVP-03.
- `assignment`: `null`.
- `allowed_actions`: `[]` — **truthful**, not a placeholder. The state machine is
  not implemented, so no action is executable; a test asserts the list advertises
  nothing MVP-03 cannot honour, and the contract enum allows the empty array.
- Timestamps are normalized to ISO instants via `toIsoInstant`, so the SQLite
  harness (TEXT timestamps) and PostgreSQL (`Date`) produce the same DTO.

## Migration
`database/migrations/004_mvp03_tow_requests.js` — 23 columns, `numeric` for the
coordinates and the radius, `CHECK` constraints mirroring the domain vocabulary
(state, terminal reason, vehicle class, coordinate ranges, year, weight, radius
`> 0`, non-empty problem description), `customer_id` FK to `users` with
`ON DELETE CASCADE`, the `UNIQUE (customer_id, idempotency_key)` authority, and
two indexes (`customer_id, created_at` and `state, created_at`). `down` drops
only `tow_requests`.

No PostGIS, no extension, no legacy table touched. The migration is
**deterministic**: the T01 clean-baseline gate applies it from zero twice and
reproduces an identical schema fingerprint
`f2771dcf6a253951c1d4a596e681c52a759ed0c4bcd70ecdcbe971505e8ed2bf` (33 tables,
32 rows, settings 25) on both runs.

## Tests
Eight new suites in `tests/tow/mvp03/` — **184 tests (177 passed, 7 opt-in
PostgreSQL skips)**, no `.only`, no hidden `.skip`, no real Google call. The
seventh row was added by the external contract correction (EXT-MVP03-1) below:

| Suite | Focus |
| --- | --- |
| `towRequestDomain.test.js` | canonical vocabulary, frozen input shape, every validation boundary (coordinates, year, weight, class/weight coupling, unknown fields, string limits), record/DTO builders, `allowed_actions` truthfulness, geodesic primitive (IUGG radius, symmetry, known distances, inclusive radius boundary, bbox helper) |
| `towRequestCreate.test.js` | `POST /tow/requests` end-to-end: 201 shape, module gate before validation and before replay, required/8–128-char key, radius frozen from settings and immune to later settings changes, DTO neutrality, 401/403 authz |
| `towRequestIdempotency.test.js` | same key + same payload returns the same request, changed payload → 409 `idempotency_conflict` (pickup, vehicle, observations), per-customer scoping, zero-match retry, hashed (never raw) fingerprint, concurrent retries collapse to one row |
| `towRequestRehydrate.test.js` | `GET /tow/requests` pagination defaults and bounds, `GET /tow/requests/:id` owner-only (403 `not_request_owner`, 404 unknown/non-numeric), customer isolation, ISO normalization |
| `towPartnerOpportunities.test.js` | the full exclusion matrix (module, partner missing, wrong type, unavailable, offline, invalid coordinates, class, capacity, five document states, radius) with `routeProvider.callCount() === 0`; the inclusion set (unverified/unapproved still included); frozen-radius scope; ordering + equidistant tie-break; live quote projection; provider failure → 503 with no partial feed; the truthful item shape (`request`, `active_tow_vehicle`, `route_quote`, `proposed_price`, `compatibility`, `opportunity_expires_at: null`) |
| `towPartnerOpportunitiesContract.test.js` | **(EXT-MVP03-1)** the REAL `GET /tow/partner/opportunities` HTTP 200 body validated by ajv against the COMPOSED canonical `TowOpportunityListResponse`; exact-member lock; nullable/optional `opportunity_expires_at`; in-suite negative controls (missing `active_tow_vehicle`, missing `compatibility`); base↔canonical convergence |
| `towMvp03Architecture.test.js` | layering and purity scans, single `node:crypto` owner, migration 004 does not touch the legacy tables, route registration and guards, contract/DTO vocabulary agreement, no `.only`/`.skip` |
| `towMvp03Postgres.e2e.test.js` | opt-in: migration 004 from an empty schema, uniqueness authority asserted by **constraint columns** (not by name), coordinate/radius round-trip, concurrent collapse to one row, the opportunity feed through the real production path, teardown of the pool |

## Gates

> These are the counts of the **frozen delivery** and of correction-2. The
> current HEAD additionally carries the correction-3 changes (EXT-MVP03-1), so
> the live counts are the ones in the *Correction-3 gate re-run* table below:
> `tests/tow/mvp03` **184**, `tests/tow` **921**, full Jest **1345**,
> `tests/tow/mvp01` **134**; `tests/tow/mvp02` and `tests/tow/contract` are
> unchanged.

| Gate | Result | Artifact |
| --- | --- | --- |
| `npm run validate:openapi` | **PASS** (0 errors; `/tow/requests` shadowing `base=[post] composed=[get,post] dropped=[]`) | `05-openapi.txt` |
| `npm run test:contract` | **PASS** 5 suites / 62 tests | `06-contract.txt` |
| `npx jest tests/tow/mvp03 --runInBand` | **170 passed / 7 skipped / 177** | `04-mvp03-green.txt` |
| `npx jest tests/tow --runInBand` | **848 passed / 65 skipped / 913 · 0 failures** | `09-tow.txt` |
| `npx jest --runInBand` (full) | **1272 passed / 65 skipped / 1337 · 0 failures** | `10-full-jest.txt` |
| `npm run verify:tow` (`DB_PORT=55434`) | **GREEN 5/5 stages**, teardown complete | `07-verify-tow.txt` |
| MVP-03 PostgreSQL proof | **GREEN** — migrate from zero · MVP-03 PG e2e + T00 foundation (13 passed) · T01 baseline gate | `08-postgres-proof.txt` |
| T01 clean-baseline gate | **GREEN** — 33 tables / 32 rows / settings 25, fingerprint `f2771dcf…` identical on both runs | `docs/evidence/t01/db-baseline-gate.json` |
| RED evidence | 151 failed / 18 passed / 176 before any production source | `10-red-evidence.md` |
| Negative controls | 5/5 detected and byte-identically restored | `11-negative-controls.md` |
| Frozen-tree confirmation | hashes, counts, teardown and hard-stop audit | `12-final-confirmation.txt` |

Disposable-environment teardown verified independently after every PostgreSQL
run: **0 containers, 0 volumes, 0 networks** for the tow test project. The only
containers left on the host belong to an unrelated pre-existing project
(`akry-*`) and were never touched.

## Pre-Muse Hardening (transport flake + `is_online` rationale)
The independent acceptance sweep found one transient failure in the new suite:
`towRequestIdempotency.test.js` → *concurrent retries of the same key create
exactly one request* → `socket hang up` (transport), while the combined run was
green (201/201/409 with exactly one row) and 10/10 dedicated re-runs passed. The
invariant was never in question; the transport was. Hardened **test-only**, at
`1756742e…`:

- **One shared listener.** The suite binds a single `http.Server` in `beforeAll`
  and drives it through `request.agent(server)`; `post()` no longer builds
  `request(app)` per call (each call spun its own ephemeral listener, and three
  concurrent listeners can surface as `socket hang up`). The server is bound
  *before* the agent is created so supertest never lazily starts (and then
  closes) it per Test, and it is closed in `afterAll`
  (`closeAllConnections()` then `close()`).
- **Transport-only single retry.** A request may be retried **once**, and only on
  an in-process transport error (`socket hang up`, `ECONNRESET`, `ECONNREFUSED`,
  `EPIPE`); every other error is rethrown. An HTTP status is never tolerated or
  retried: the concurrency test still asserts all responses `201`, one unique
  `data.id` and exactly one persisted row, and those row assertions run after the
  (possibly retried) responses and fail the test on any violation. No `.only`,
  no `.skip`, no assertion relaxed, no test removed; the PostgreSQL e2e
  concurrency proof (`towMvp03Postgres.e2e.test.js`) and the constraint
  authority are untouched.
- **`is_online` rationale (docs-only, no behavior change).** `evaluateTowMatch`
  requires `partner.is_online === true` because `PARTNER_OFFLINE` is a canonical
  operational blocker in the frozen contract
  (`TOW-API-CONTRACT-DRAFT4-ADDENDUM.md` §2); `is_verified`/`approval_status`
  remain proven not to exclude. Recorded in the Eligibility Composition section
  above and in `03-persistence-decision.md` §3.

Hardened-tree re-run evidence (raw logs under `docs/evidence/mvp-03/`):

| Gate | Result | Artifact |
| --- | --- | --- |
| `towRequestIdempotency` ×5 consecutive | **5/5 GREEN** — 9 passed / 9 each, exit 0 each | `13-idempotency-hardening-5x.txt` |
| `npx jest tests/tow/mvp03 --runInBand` | **170 passed / 7 skipped / 177 · 0 failures** | `14-mvp03-suite.txt` |
| `npx jest tests/tow --runInBand` | **848 passed / 65 skipped / 913 · 0 failures** | `15-tow-suite.txt` |
| `npx jest --runInBand` (full) | **1272 passed / 65 skipped / 1337 · 0 failures** | `16-full-jest.txt` |
| `npm run validate:openapi` | **PASS** (0 errors; `/tow/requests` `base=[post] composed=[get,post] dropped=[]`) | `17-openapi.txt` |
| `npm run test:contract` | **PASS** 5 suites / 62 tests | `18-contract.txt` |

Counts are identical to the frozen delivery (no test added or removed): the
hardening changes only how the suite reaches the in-process server.

## Correction-2 (pre-Muse): T01 e2e pin + 401 flake
Two issues found by the orchestrator after `1bbfd13a`. Both are test-infrastructure
issues; **no production file was touched** and no assertion was relaxed.

### C2-1 — T01 e2e pinned a stale MVP-01 baseline (hard failure, FIXED)
`tests/tow/baseline/dbBaseline.e2e.test.js` pinned `BASELINE_MIGRATIONS` to
`[001, 002, 003]` while this delivery ships `004_mvp03_tow_requests.js`, so every
PostgreSQL assertion comparing applied migrations against the pin failed:
`unexpected migration file(s) outside the pinned MVP-01 baseline:
004_mvp03_tow_requests.js` — **5 failed / 28 passed / 33** on the disposable
target (raw log `/tmp/e2e-before-55434.txt`, quoted in `19-e2e-pin-fix.txt`).

Fix (test-only): the pin is now `001..004`, mirroring the two other canonical
pins of the delivery (`scripts/tow/run-db-baseline-gate.js` → `PINNED_MIGRATIONS`
and the offline assertion in `tests/tow/baseline/dbBaselineSafety.test.js`), and
the comment in the file says so. Cross-check semantics were **kept loud, not
weakened**: the directory read is still a cross-check, the error message now
prints the whole pin (`outside the pinned baseline [001…, 004…]: 005_*.js`), the
`expect(files).toEqual(BASELINE_MIGRATIONS…)` assertion is unchanged, and the
smuggled-`005` negative control still exists. No fingerprint was hardcoded: the
suite still compares run1-vs-run2 schema fingerprints, so the old `37cee47e…`
value is not frozen into the test.

Proof (disposable PostgreSQL on `127.0.0.1:55434`, torn down after):
`dbBaseline.e2e.test.js` **33 passed / 33** (was 5 failed / 28 passed); legacy
`towPostgres.e2e.test.js` + `g3TowPostgres.e2e.test.js` **9 passed / 9**; the
offline pin guard stays green. Other MVP-01/002 expectations were swept with a
deterministic grep; the e2e pin was the only stale one.

### C2-2 — 401 flake in a combined full-suite run (root-caused, NOT claimed fixed)
`tests/tow/mvp03/towRequestCreate.test.js › a custom radius setting is frozen
into the new request` failed once with `Expected: 201 / Received: 401` while
passing in focused runs.

**Root cause: not the product.** Two independent server-side sources prove the
401 was never produced for the failing request: morgan logged
`POST /api/partners/onboarding/complete … 201 1422` (the only 401 in the window
is the preceding intentional anonymous upload), and an instrumented
`src/middleware/auth.js` (all five exits logged) recorded **zero** 401s for the
onboarding route in any run. The client therefore received a response the server
never produced for that request.

**Reproduced under load, not in focused runs.** 20 instrumented full-suite runs
under 6-core artificial load produced 4 failing runs (~20%): a stale 401 + `Parse
Error` (run 6), `socket hang up` ×2 on `deliveryOrders` (run 10), `Parse Error`
on `/motoboy/history` (run 16), `socket hang up` ×2 on `towRequestCreate` (run
19). Every symptom is transport-level.

**All product-side hypotheses were checked and excluded with direct evidence**
(JWT_SECRET leak across files, `revoked_tokens`, deleted user row, fake-timer vs
JWT `exp`/`iat`, email/sequence collision, auth fail-closed on a transient DB
error, global-agent socket reuse, shared `TestAgent`): see
`20-401-flake-diagnosis.txt` §3 for each exclusion. Notably, Node ≥ 19's
keep-alive `http.globalAgent` is **not** in the path — supertest sets
`agent: false`, so every request gets a fresh socket (`reused=false`), and a
forced port-reuse probe still reported `reused=false` and a fresh 201 body.

**Mechanism family demonstrated deterministically.** While instrumenting, an
exception inside a `'response'`/`'end'` listener aborted the emit, so superagent's
own listener never ran: the response was silently swallowed and the test died on
timeout (5 s default; 60 s in `g2PhotoContract.test.js`, matching the exact 60 s
cadence seen in stalled runs). The trigger was superagent's
`res.setEncoding('utf8')` making the chunks strings, so `Buffer.concat(chunks)`
threw. That is the same failure family as the observed `Parse Error` /
`socket hang up` / stale-status symptoms, and it documents why such failures are
invisible in this harness.

**Status: NOT claimed fixed.** The exact trigger inside supertest's per-request
ephemeral-server churn could not be pinned on demand within this correction's
budget, so no speculative harness change was made. Instead a **permanent
diagnostic guard** was added: `expectCreated(response, auth)` in
`tests/tow/mvp03/towRequestCreate.test.js` throws a single message carrying
`body`, `userId`, `userEmail`, decoded `tokenClaims`, `nowSeconds` and
`jwtSecret: 'env' | 'dev-fallback'` — exactly the state needed to tell the four
`auth.js` 401 branches apart from a transport artifact. The strict
`expect(response.status).toBe(201)` assertion is unchanged for the success path.
Recommended follow-up (out of scope here): move the tow/integration harness to a
single shared `http.createServer(app)` per test file and re-run the load loop.

Correction-2 gate re-run (instrumentation fully removed; raw logs in
`19-e2e-pin-fix.txt` / `20-401-flake-diagnosis.txt`):

| Gate | Result | Artifact |
| --- | --- | --- |
| `npm run validate:openapi` | **PASS** (0 errors) | `19-e2e-pin-fix.txt` |
| `npm run test:contract` | **PASS** 5 suites / 62 tests | `19-e2e-pin-fix.txt` |
| `npx jest tests/tow/mvp03 --runInBand` | **170 passed / 7 skipped / 177 · 0 failures** | `20-401-flake-diagnosis.txt` |
| `npx jest tests/tow --runInBand` | **848 passed / 65 skipped / 913 · 0 failures** | `19-e2e-pin-fix.txt` |
| `npx jest --runInBand` (full) ×2 | **1272 passed / 65 skipped / 1337 · 0 failures** (both runs) | `20-401-flake-diagnosis.txt` |
| PG `dbBaseline.e2e.test.js` (`DB_PORT=55434`) | **33 passed / 33** (was 5 failed / 28) | `19-e2e-pin-fix.txt` |
| PG legacy e2e ×2 | **9 passed / 9** | `19-e2e-pin-fix.txt` |
| PostgreSQL teardown | **done** — 0 containers/volumes/networks for the tow project | `19-e2e-pin-fix.txt` |

Counts are identical to the frozen delivery: no test was added, removed, skipped
or relaxed. The only test-behaviour change is the diagnostic guard, which is
inert on success (26/26 in `towRequestCreate.test.js`).

## External contract correction (EXT-MVP03-1 / EXT-MVP03-2)
External review of PR #37 (comment `#5752012874`, CHANGES_REQUIRED, P0=0, blocking
P1=1, P2=0) raised one blocking finding and one documentation finding. Both are
corrected here at `2edf0306…` (correction-3). **No behaviour was weakened and no
contract was edited to excuse the runtime.**

### EXT-MVP03-1 (P1, blocking) — the runtime opportunity item did not match the canonical contract
**What was actually wrong.** The canonical entrypoint
(`docs/tow/tow-api-contract.openapi.yaml`) declared
`TowOpportunity.required = [request, active_tow_vehicle, route_quote,
proposed_price, compatibility, opportunity_expires_at]`, but
`GET /api/tow/partner/opportunities` returned items of exactly
`{request, route_quote, proposed_price}`. The runtime was not conformant to its
own frozen contract, and `tests/tow/mvp03/towPartnerOpportunities.test.js:126`
**locked the reduced shape**, so the suite could not catch it.

**Root cause (disclosed).** The pre-existing consumer smoke test built its fixture
through the contract's own `generateFixture`, and arrays generate as `[]`
(`{"success":true,"data":{"items":[],"meta":{"page":1,"limit":2}}}`), so
`data.items[0]` never existed and the *item* schema was never exercised. The
reduced shape was an implementation gap, not a contract decision.

**The fix makes the RUNTIME truthful; the contract was not weakened.**
- `active_tow_vehicle` is the **actual** vehicle evaluated and quoted. The
  matching service already had it in hand (`vehicle`), so it is carried into the
  item and projected to `TowVehicleSummary` by a new `serializeVehicleSummary`
  — exactly the ten contract fields, **no `pricing`/tariff**. `serializeVehicle`
  now composes the same helper plus `pricing`, so the two projections cannot
  drift and `serializeVehicle`'s output is byte-identical.
- `compatibility` is the **MVP-01 verdict carried through**
  (`compatibility.js` → `eligibility.js` → `matching.js` →
  `matching-service.js`). `isCompatible` now also returns
  `vehicle_class_supported` / `weight_within_capacity`, derived from the *same*
  checks it already ran — there is no second policy and no recomputation in the
  HTTP layer; the serializer only narrows the object to the three contract
  members and coerces to boolean.
- `opportunity_expires_at` is emitted as **`null`** and declared
  **nullable/optional**. MVP-03 owns no expiry (no scheduler, no search timeout,
  no proposal lifecycle), so no truthful instant exists. It is **never derived
  from `tow_proposal_expiry_minutes`** — that setting belongs to MVP-04 and using
  it here would have fabricated a guarantee this delivery cannot honour.
- The Haversine distance used for radius filtering is still **not** serialized:
  the only distance on the wire remains the authoritative Google Routes
  `route_quote.total_distance_meters`.

**Exact OpenAPI delta** (full diff and rationale:
`25-openapi-delta.txt`; validation: `23-live-openapi-validation.txt`):

| # | File | Change |
| --- | --- | --- |
| 1 | canonical | `info.version` `1.0.0-draft.4` → `1.0.0-draft.5` |
| 2 | canonical | `info.description` gained a draft.5 revision note (EXT-MVP03-1) stating no other consumer contract changed |
| 3 | canonical | `TowOpportunity.required` drops `opportunity_expires_at` (it becomes **optional**) |
| 4 | canonical | `opportunity_expires_at` `{type: string}` → `{type: [string, 'null'], format: date-time, description: <why null / why optional / never derived from the proposal-expiry setting>}` |
| 5 | canonical | **nothing else** — other members, `OpportunityCompatibility` (`const: true` ×3) and `TowOpportunityListResponse` (item stays `$ref TowOpportunity`) unchanged |
| 6 | base | **+** `components.schemas.OpportunityCompatibility`, identical to the canonical component, so base and canonical cannot diverge silently |
| 7 | base | inline list item `required` `[request, proposed_price, route_quote]` → `[request, active_tow_vehicle, route_quote, proposed_price, compatibility]`, `request`/`proposed_price`/`route_quote` re-pointed to real `$ref`s, `active_tow_vehicle` → `$ref TowVehicleSummary`, `compatibility` → `$ref OpportunityCompatibility`, plus the nullable/optional `opportunity_expires_at` with the same description |

No other OpenAPI file, path, operation, security scheme, error response or enum
was touched. `npm run validate:openapi` → **PASS**, contract version
`1.0.0-draft.5`, composed paths 56, composed operations 66, unresolved refs 0,
JSON Schema definition errors 0, canonical enum mismatches 0, unallowlisted
dropped methods 0.

**Live OpenAPI validation (new, and it can fail).** The gap above is closed by
`tests/tow/mvp03/towPartnerOpportunitiesContract.test.js`, which drives the real
HTTP endpoint and validates the real 200 body with ajv against the **composed**
canonical `TowOpportunityListResponse` (`COMPOSED_SCHEMA_ID`), asserting a
non-empty item and exactly one RouteProvider call. It also contains in-suite
negative controls (a live payload with `active_tow_vehicle` or `compatibility`
removed is rejected) and base↔canonical convergence assertions.

**Negative control (mandatory, proven).** Removing the single
`active_tow_vehicle` line from `serializeOpportunity` turns the suite **RED
(3 failed / 4 passed)** with the *schema validator itself* naming the drift:

```
Received: [{"instancePath": "/data/items/0", "keyword": "required",
            "message": "must have required property 'active_tow_vehicle'",
            "params": {"missingProperty": "active_tow_vehicle"},
            "schemaPath": "#/required"}]
```

The file was then restored **byte-identically** (`sha256
648d0a0d316909d53c67d9380baed8e3dc0d0dfc5b0d692a7d702a7394301976` before and
after; `diff -q` clean; `shasum -a 256 -c` OK) and the same suite returned
**GREEN 7/7**. Raw transcript: `24-negative-control-live-contract.txt`.

### EXT-MVP03-2 (documentation) — the PR claim "Contract: OpenAPI updated and validated" was not true as written
At `2edf0306…` the document was updated and validated **statically**, but the
runtime returned a reduced item, so "OpenAPI updated and validated" read as if
the endpoint conformed. It did not. The corrected statement (also in
`25-openapi-delta.txt` §4):

> The canonical `TowOpportunity` already required `active_tow_vehicle`,
> `compatibility` and `opportunity_expires_at`; the MVP-03 runtime returned only
> `{request, route_quote, proposed_price}`. This correction makes the **runtime**
> truthful instead of weakening the contract: `GET
> /api/tow/partner/opportunities` now returns the active vehicle used for
> eligibility/quoting (projected to `TowVehicleSummary`, no tariff), the MVP-01
> compatibility verdict carried through unchanged, and `opportunity_expires_at:
> null` because MVP-03 owns no expiry semantics. The document changed only to
> make `opportunity_expires_at` nullable/optional (draft.4 → draft.5) and to add
> the base `OpportunityCompatibility` component plus the missing members to the
> base inline list item so base and canonical converge. Validated by
> `npm run validate:openapi` (PASS, draft.5, 0 unresolved refs) **and** by a new
> live-endpoint contract test that validates the real HTTP 200 body against the
> composed canonical `TowOpportunityListResponse` (7/7), with a negative control
> proving the test goes RED when `active_tow_vehicle` is removed from the
> runtime serializer.

### Preserved invariants, re-proven at the correction HEAD
Raw transcript: `26-preserved-invariants.txt`.

| Invariant | Proof |
| --- | --- |
| client cannot provide a **price** | domain probe rejects `estimated_price` / `proposed_price` / `final_price` (`validation_error`); `towRequestDomain.test.js › client-supplied distance or price is rejected, never silently dropped`; HTTP `422` for an unknown top-level field; `no price, route or assignment is ever persisted` |
| client cannot provide a **route distance** | same probe rejects `route_quote` / `distance_meters` / `duration_seconds`; same domain + HTTP tests |
| a partner cannot see an **incompatible** request | `towPartnerOpportunities.test.js › a vehicle that does not support the requested class is excluded` and `› a vehicle without enough capacity is excluded` (200, `items: []`, `meta.total: 0`) |
| an **excluded** candidate triggers **0 Google calls** | the same suite's `expectExcluded` helper asserts `routeProvider.callCount() === 0` on all 12 exclusion cases |
| published `compatibility` is the MVP-01 verdict, not a second policy | `towFoundationDomain.test.js › exposes the per-dimension verdicts from the SAME policy (EXT-MVP03-1)` + `result.compatibility` asserted on the eligible and incompatible eligibility paths |
| the matching geodesic distance is still not exposed | `the live item carries exactly the contract members (no invented, no missing)` — the only distance is `route_quote.total_distance_meters` |

### Correction-3 gate re-run
Raw transcript: `27-regression-gates.txt`. The host's default harness port 55432
is occupied by an unrelated running container (`akry-edge-pg`), so every
PostgreSQL stage used `DB_PORT=55434` as instructed; the default-port attempts
failed **only** at container startup and are recorded in the appendix of that
file.

| Gate | Result |
| --- | --- |
| `npm run validate:openapi` | **PASS** — draft.5, 0 unresolved refs, 0 schema errors |
| `npm run test:contract` | **PASS** 5 suites / 62 tests |
| `npm run verify:tow` (`DB_PORT=55434`) | **GREEN 5/5 stages**, teardown complete |
| `npx jest tests/tow/mvp01 --runInBand` | **124 passed / 10 skipped / 134** |
| `npx jest tests/tow/mvp02 --runInBand` | **204 passed / 204** |
| `npx jest tests/tow/mvp03 --runInBand` | **177 passed / 7 skipped / 184** |
| `npx jest tests/tow --runInBand` | **856 passed / 65 skipped / 921 · 0 failures** |
| `npm run test:db-baseline` (`DB_PORT=55434`) | **GREEN** — 33 tables / 32 rows / settings 25, fingerprint `f2771dcf…` identical on both runs |
| `npx jest --runInBand` (full) | **1280 passed / 65 skipped / 1345 · 0 failures**, 75 PASS / 0 FAIL suites |
| PG `dbBaseline.e2e.test.js` | **33 passed / 33** |
| PG `towMvp03Postgres.e2e.test.js` | **7 passed / 7** |
| PG legacy e2e ×2 | **9 passed / 9** |
| `npm run test:pg:down` | **done** — 0 containers, 0 volumes, 0 networks for the tow project |

Counts moved **only upward**, by exactly the new tests: `tests/tow` +8
(7 live-contract + 1 MVP-01 policy-derivation), full Jest +8, `tests/tow/mvp03`
+7. `tests/tow/mvp02` is unchanged at 204/204, and no previously passing test
regressed. No `.only`, no `.skip`, no relaxed assertion.

### Disclosures for correction-3
- **Three pre-existing test files were changed**, all strengthening:
  1. `tests/tow/mvp03/towPartnerOpportunities.test.js` — the assertion that
     *locked the reduced shape* is replaced by the truthful six-member shape
     (keys, the exact `TowVehicleSummary` projection, the three compatibility
     flags, `opportunity_expires_at: null`). This is the file the review named;
     it now locks the correct shape rather than the gap.
  2. `tests/contract/openapi.structure.test.js` — the pre-existing
     `info.version` pin moved `1.0.0-draft.4` → `1.0.0-draft.5`. The pin is kept
     (not deleted) so a future version bump still fails loudly.
  3. `tests/tow/mvp01/towFoundationDomain.test.js` — one new test plus two
     extended assertions for the per-dimension verdicts; no assertion removed.
- **One new suite**: `tests/tow/mvp03/towPartnerOpportunitiesContract.test.js`
  (7 tests, hermetic/offline — sqlite harness + fake clock + recording fake route
  provider; **no real Google call**).
- **`active_tow_vehicle.document_status` is `'pending'` in the live body.** The
  SQLite harness's `mapVehicleRow` does not select `document_status`, so the
  serializer's `row.document_status || 'pending'` fallback applies. `'pending'`
  is a valid `VehicleDocumentStatus` enum value and the opportunity is only
  emitted for a vehicle whose document eligibility already passed, so the field
  is truthful for the harness. The assertion pins the current value; if the
  repository starts projecting the real column, the test must be updated with it.
- **`docs/evidence/t01/db-baseline-gate.json` was reverted, not committed.** The
  gate regenerates it on every run and the only delta this time was the
  randomized seeded-admin email (`gate-admin-20137632@…` →
  `gate-admin-32560844@…`); fingerprint, counts and migration list were
  unchanged. Committing it would have added noise, so it was restored to the
  committed value. The correction-3 gate output itself is preserved verbatim in
  `27-regression-gates.txt`.
- **Muse P3 follow-ups F2 (SQLite `CHECK` fidelity), F4 (antimeridian bbox
  helper), F5 (cap-bounded `meta.total`) and the transport harness flake are
  accepted non-blocking and were deliberately NOT expanded here.** F3 (haversine
  `[0,1]` clamp) and F6 (`toIsoInstant` corrupt text) were reviewed and left
  untouched: neither is reached by this correction, and touching them would add
  risk without addressing a blocking finding.

## Regression
Baselines and the observed post-delivery counts:

| Scope | Baseline (MVP-02 accepted) | MVP-03 | Delta |
| --- | --- | --- | --- |
| `tests/tow/mvp01` | 123 passed / 10 skipped | **123 passed / 10 skipped** | 0 — byte-identical counts |
| `tests/tow/mvp02` | 204 passed / 204 | **204 passed / 204** | 0 |
| `tests/tow` | 678 passed / 58 skipped | **848 passed / 65 skipped** | **+170 = exactly the new MVP-03 tests**; +7 skips = the opt-in PG cases |
| full Jest | 1102 passed / 58 skipped / 0 failed | **1272 passed / 65 skipped / 0 failed** | **+170**, same skips, 0 failures |
| contract | 62/62 | **62/62** | 0 |
| `verify:tow` | GREEN | **GREEN** | 0 |

No existing pass regressed; the count increases are exactly the new tests. No
real Google call is made in any default test (the route provider is the
deterministic fake, and the Google adapter suite is offline).

Correction-3 moved these counts only upward, by exactly the new tests:

| Scope | MVP-03 | Correction-3 | Delta |
| --- | --- | --- | --- |
| `tests/tow/mvp01` | 123 passed / 10 skipped | **124 passed / 10 skipped** | +1 (policy-derivation test) |
| `tests/tow/mvp02` | 204 passed / 204 | **204 passed / 204** | 0 |
| `tests/tow/mvp03` | 170 passed / 7 skipped / 177 | **177 passed / 7 skipped / 184** | +7 (live contract suite) |
| `tests/tow` | 848 passed / 65 skipped / 913 | **856 passed / 65 skipped / 921** | +8 |
| full Jest | 1272 passed / 65 skipped / 1337 | **1280 passed / 65 skipped / 1345** | +8 |
| contract | 62/62 | **62/62** | 0 |
| `verify:tow` | GREEN | **GREEN** | 0 |

## Negative Controls
`11-negative-controls.md` — five mutations, each breaking exactly one MVP-03
guarantee, all detected (suite RED) and all restored byte-for-byte:

| # | Safeguard removed | Mutated run | Restored run | Restore |
| --- | --- | --- | --- | --- |
| NC-MVP03-1 | module gate (`assertNewBusinessAllowed`) | RED 2 failed / 58 | GREEN 58/58 | byte-identical |
| NC-MVP03-2 | MVP-01 eligibility composition | RED 8 failed / 86 | GREEN 86/86 | byte-identical |
| NC-MVP03-3 | geodesic radius filter | RED 2 failed / 86 | GREEN 86/86 | byte-identical |
| NC-MVP03-4 | idempotency: replay pre-read **and** unique-violation recovery | RED 5 failed / 9 | GREEN 9/9 | byte-identical |
| NC-MVP03-4b | idempotency: unique-violation recovery only, **real PostgreSQL** | RED 1 failed / 7 | GREEN 7/7 | byte-identical |

`NC-MVP03-4b` is the one that matters for the concurrency hard stop: removing
**only** the constraint-recovery branch leaves the offline suite GREEN, because
`better-sqlite3` is synchronous and the pre-read always wins the race there. The
PostgreSQL leg — five parallel identical requests — is what proves the
constraint, not the read-then-write, is the authority. That gap is recorded
rather than papered over.

## Bookkeeping (disclosed)
- `docs/tow/TOW-TASK-GRAPH.yaml` — **two** changes, both disclosed:
  1. `MVP03.execution_base` corrected to `c0ae3c01774dbaaf162113cef574cb728ec8db61`
     (the actual dispatch base) with an inline comment preserving the historical
     fact that MVP-02 accepted main = `1f589d60…` (PR #36, receipt `#5749173315`).
     `implementation_baseline.main_sha` still reads `1f589d60…` and was **not**
     rewritten. `MVP03.status` stays `READY`, `delivery_state: CURRENT`; MVP-03 is
     **not** marked ACCEPTED and MVP-04 stays `BLOCKED` — that is the
     orchestrator's call after review.
  2. `implementation_baseline.schema_fingerprint` updated
     `37cee47e…` → `f2771dcf6a253951c1d4a596e681c52a759ed0c4bcd70ecdcbe971505e8ed2bf`,
     with an inline comment giving the old value and the reason (33 tables: MVP-03
     adds `tow_requests` via migration 004). The field is a *current* baseline
     pointer and was stale the moment migration 004 landed; the MVP-01 historical
     fingerprint is left untouched in `TOW-MVP-DELIVERY-PLAN.md:168` and in
     `docs/evidence/mvp-01/**`. Flagged rather than changed silently.
- `docs/evidence/t01/db-baseline-gate.json` is regenerated by every
  `npm run test:db-baseline` run and is **committed as changed** this time, unlike
  MVP-02 where it was reverted. Three deltas, all explained: the fingerprint and
  counts (`37cee47e…`/32 tables/31 rows → `f2771dcf…`/33 tables/32 rows, because
  migration 004 adds `tow_requests`), the migration list gaining
  `004_mvp03_tow_requests.js`, and the harness target port `55432 → 55434`
  (the shared host has 55432/55433 occupied, so MVP-03's runs used 55434). The
  seeded admin email is randomized per run. Reverting this file would have
  asserted a baseline the gate no longer produces.
- **Two pre-existing test files were updated** — reviewed, additive/strengthening,
  disclosed in full:
  1. `tests/tow/baseline/dbBaselineSafety.test.js` — the pinned migration list is
     now `001–004` (it asserted exactly three), and the "missing file" case now
     removes `003_mvp01_tow_foundation.js`. Required by the new baseline; no
     assertion was deleted or relaxed.
  2. `tests/tow/mvp01/towPartnerRepository.test.js` — the `findById` test now
     asserts the MVP-01 identity fields **plus** the MVP-03 operational-location
     extension (`is_available`, `is_online`, `is_verified`, `latitude`,
     `longitude`). The original `toMatchObject({id, type})` identity assertion is
     preserved; the test was extended, not weakened.
  `tests/tow/mvp02/**` is **untouched** — `towRouteProviderBoundary.test.js` is
  byte-identical, which is the point of the ownership-based resolution above.
- The T01 baseline-safety gate also gained the new table in
  `scripts/tow/db-baseline.js` (`REQUIRED_TABLES`) and the new migration in
  `scripts/tow/run-db-baseline-gate.js` (`PINNED_MIGRATIONS`), and
  `tests/helpers/testDb.js` gained the `tow_requests` DDL for the SQLite harness.
  These are harness mirrors of the migration, asserted to agree with it.

## Scope
- MVP-01 / MVP-02 touched: only additively (`geo.js` gained the geodesic
  primitive, `ports.js` gained a port, `partner-repository.js` gained a
  projection, `composition.js` gained two wirings, `routes.js` gained four
  routes). All MVP-01/MVP-02 gates and counts are preserved.
- MVP-04 / #16 touched: **NO** — no proposal, no counteroffer, no assignment, no
  state machine, no scheduler, no expiry.
- MVP-05/06 touched: NO — no tracking, no cancellation, no payment execution, no
  debt/wallet/dispute logic.
- #31 / #33 touched: NO. production/VPS touched: NO.
- Legacy `EmergencyRequest` subsystem touched: NO (audited and left
  byte-identical).
- Haversine/Distance-Matrix reuse in the pricing path: NO. Pricing remains Google
  Routes only.
- No `git add -A`; explicit paths only; no push, no PR, no merge.

## Remaining Findings
- **Bounding-box pre-filter deferred (documented).** `GET
  /tow/partner/opportunities` scans up to 500 `SEARCHING` requests and filters in
  the domain. A bbox push-down into SQL is the obvious next optimisation but it
  is a performance change with correctness risk (numeric vs float comparison in
  PostgreSQL), so it is deliberately not in MVP-03. The cap is explicit, not
  silent.
- **`is_verified` / `approval_status` are not part of the matching gate.** The
  audit showed the eligibility policy does not require them and the contract does
  not say they block opportunities; MVP-03 therefore proves by test that they do
  **not** exclude a partner. If a later delivery wants them to, that is a policy
  change with its own RED test, not a silent tightening here.
- **`allowed_actions` is always `[]`.** Truthful for MVP-03 because no transition
  is implemented. MVP-04 owns the first non-empty value.
- **`search_expires_at` is always `null`.** MVP-03 has no scheduler; a non-null
  value requires the expiry owner.
- **`opportunity_expires_at` is always `null` too, and is now optional in the
  contract.** Same reason as `search_expires_at`: MVP-03 owns no expiry. It is
  **not** derived from `tow_proposal_expiry_minutes` (MVP-04's setting); a
  non-null value requires the delivery that owns expiry semantics, which must
  also revisit the contract's `format: date-time` branch.
- **The OpenAPI version pin is a pre-existing test, kept and moved.**
  `tests/contract/openapi.structure.test.js` pinned `1.0.0-draft.4` before this
  correction; the correction-3 contract revision required `1.0.0-draft.5`, so the
  pin was updated (not deleted), and it still fails loudly on an un-revisited
  version bump. Disclosed because the correction brief did not anticipate that a
  pin existed.
- **`payment.request_id` is emitted** in addition to the neutral fields required
  by the contract; it is the request's own id and carries no payment state.
- **`tow_max_radius_km` is informational.** It is surfaced in
  `matching.max_radius_km` and never re-scopes an existing request — a request
  keeps the radius frozen at creation.
- **Legacy `models/Partner.js` references non-existent columns** (`specialty`,
  `last_seen`). Pre-existing, outside MVP-03, and recorded in
  `02-legacy-audit.md` rather than fixed here.
- **No lint/typecheck script exists** in the backend package (unchanged from
  MVP-01/MVP-02); the Jest suites and the architecture boundary tests are the
  static guards.
- **One transient flake observed, disclosed.** A single `npx jest tests/tow/mvp01`
  run reported 1 failure while the same command in the full `tests/tow` and full
  Jest runs was green; the failure output was consumed by a pipeline before it
  could be named. The suite was then re-run **18 consecutive times** at
  **123 passed / 10 skipped / 133** with 0 failures, i.e. the exact MVP-01
  baseline. MVP-03 touches no MVP-01 test target. Recorded here rather than
  omitted; the frozen-head result is the green run.
- **Shared-host port collision.** 55432 and 55433 are occupied on this host, so
  every PostgreSQL stage used `DB_PORT=55434`. This is a harness detail with no
  code impact, and it is the reason the committed T01 gate JSON records 55434.
- **401 flake (correction-2) — disclosed, not claimed fixed.** Reproduced in
  4/20 loaded full-suite runs (~20%), never in focused runs; the product was
  excluded as the cause by two independent server-side sources (morgan + an
  instrumented `auth.js` show the failing request was answered 201 and that no
  401 was ever emitted for that route). The exact transport trigger inside
  supertest's per-request ephemeral-server churn was not pinned, so no
  speculative fix was made; a permanent diagnostic guard was added instead and a
  harness rework is recommended as follow-up. Full analysis and every excluded
  hypothesis: `20-401-flake-diagnosis.txt`.

## Final Verdict
MVP-03 READY FOR MUSE REVIEW (correction-2: T01 e2e pin fixed and proven on
PostgreSQL; 401 flake root-caused to the test-harness transport layer, product
excluded, guard added — disclosed as not fixed).

Correction-3 (external review EXT-MVP03-1 P1 / EXT-MVP03-2): the runtime
opportunity item now matches the canonical `TowOpportunity` contract
(`active_tow_vehicle` as the real `TowVehicleSummary` projection,
`compatibility` as the carried-through MVP-01 verdict, `opportunity_expires_at:
null` because MVP-03 owns no expiry), the contract was moved draft.4 → draft.5
only to make the expiry nullable/optional and to converge the base inline item,
the old reduced-shape lock was replaced, a live-endpoint contract regression test
was added and proven RED-then-byte-identically-restored-then-GREEN, all gates are
green with counts only increasing and no regression, and the PR contract claim
was corrected in writing. Ready for a fresh Muse review.
