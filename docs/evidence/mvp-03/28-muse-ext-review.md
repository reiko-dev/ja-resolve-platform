# MUSE — MVP-03 EXT-MVP03-1 adversarial re-review (fresh session)

Reviewer: MUSE (adversarial; prior MVP-03 review treated as STALE).
Executor under review: DeepSeek V4.1 Flash (correction commits below).
Reviewed SHA: `1818310a` (detached worktree, tree clean at review start).
Correction commits: `a7a4dbb8` (functional: runtime + OpenAPI + tests),
`1818310a` (docs/evidence only).
Scope: `feature/mvp-03-tow-request-matching` (PR #37), base `c0ae3c01`,
previous reviewed SHA `2edf0306`.
External trigger: PR #37 comment `#5752012874` (CHANGES_REQUIRED, P1
blocking=1): canonical `TowOpportunity` required
`[request, active_tow_vehicle, route_quote, proposed_price, compatibility,
opportunity_expires_at]` while the runtime returned only
`{request, route_quote, proposed_price}`, and the old test locked the
reduced shape.

Method: no trust in the work result. Every claim below was re-verified
against code at HEAD, the `a7a4dbb8` diff, and live runs executed by the
reviewer in this session.

## Findings (file:line + evidence)

- F1. The live contract suite is real, not tautological.
  `socorre_ai_backend/tests/tow/mvp03/towPartnerOpportunitiesContract.test.js:96-113`
  builds a REAL opportunity (real `POST /api/tow/requests` → 201, real
  operational partner via `createOperationalPartner`, real `GET
  /api/tow/partner/opportunities` through supertest against the real app
  harness with SQLite + fake clock + recording fake route provider) and
  `tests/tow/mvp03/towPartnerOpportunitiesContract.test.js:131-149`
  validates the ACTUAL HTTP 200 body with the canonical composed
  `TowOpportunityListResponse` validator built from
  `tests/helpers/towContract.js` (`loadRawDocuments` :98-105,
  `composeDocument` :258-345, `buildAjv` :390-402, `schemaUri` :409-412).
  Reviewer ran it: 7/7 GREEN; server-side morgan log shows the matching
  `201` + `200` pairs per case.
- F2. The failure mode the external review cited is closed for the right
  reason. The old reduced-shape lock
  (`expect(Object.keys(opportunity)…).toEqual(['proposed_price','request',
  'route_quote'])`) was replaced (see `git show a7a4dbb8 --
  socorre_ai_backend/tests/tow/mvp03/towPartnerOpportunities.test.js`)
  by the truthful six-member assertion
  (`active_tow_vehicle, compatibility, opportunity_expires_at,
  proposed_price, request, route_quote`) plus exact-value assertions on
  the vehicle projection, the compatibility verdict, and the null expiry.
  The runtime was fixed; the contract was NOT weakened to excuse the
  runtime (the required list kept all five members; only
  `opportunity_expires_at` left `required`, with nullable type retained).
- F3. `active_tow_vehicle` is the actual vehicle, loaded once.
  `socorre_ai_backend/src/modules/tow/application/matching-service.js:80`
  loads it once (`vehicleRepository.findActiveByPartner`); the SAME
  `vehicle` object is passed to `evaluateTowMatch` (:88-95), used as the
  quote tariff (:114-119, `tariff: vehicle.pricing`), and emitted into
  the item (:125, `active_tow_vehicle: vehicle`). No re-fetch, no second
  vehicle. Transport projects it via `serializeVehicleSummary`
  (`socorre_ai_backend/src/modules/tow/http/serialize.js:39-54`), which
  emits exactly the 10 `TowVehicleSummary` keys (reviewer executed it:
  `id, plate, make, model, year, equipment_type,
  supported_vehicle_classes, max_towed_weight_kg, document_status,
  active`) — no `pricing`, no `partner_id`, no `created_at`. The full
  `serializeVehicle` (:56-65) composes the summary plus `pricing`, so the
  two projections cannot drift. The contract confirms the shape:
  `docs/tow/tow-api-contract.base.openapi.yaml:1204-1221` (10 required)
  with `TowVehicle` = Summary + `pricing` (:1223-1229).
- F4. Exactly ONE compatibility policy, flags derived not recomputed.
  `grep 'function isCompatible'` over `socorre_ai_backend/src` finds a
  single definition
  (`src/modules/tow/domain/compatibility.js:38`). The published flags
  are derived from the same checks: `classSupported` (:52-54) feeds both
  the `class_not_supported` reason (:58-60) and
  `vehicle_class_supported` (:76-79); `weightMissing`/`weightExceeds`
  (:62-65) feed both the weight reasons (:67-72) and
  `weight_within_capacity = !weightMissing && !weightExceeds` (:74).
  Verdict flows untouched: `isCompatible` → `evaluateEligibility`
  (`src/modules/tow/domain/eligibility.js:53-64`, surfaces
  `compatibility` on both paths) → `evaluateTowMatch`
  (`src/modules/tow/domain/matching.js:91-101,117-127`, carries
  `eligibility.compatibility` onto the matched result only) →
  matching service (:96-104, `compatibility: evaluation.compatibility`)
  → serializer (:128-132, projects exactly the three contract
  properties). Nothing in the HTTP/application layer re-derives class or
  capacity. New unit coverage pins the derivation
  (`towFoundationDomain.test.js`, `+41` lines in `a7a4dbb8`: same-policy
  dimension matrix + surfacing through eligibility).
- F5. `opportunity_expires_at: null` is truthful, not fabricated.
  Emitted as the literal `null`
  (`matching-service.js:134`, passed through by `toIso` at
  `serialize.js:133`). `grep tow_proposal_expiry_minutes` over
  `socorre_ai_backend/src` hits ONLY the setting definition
  (`src/modules/tow/domain/settings.js:19`); no reader in the matching
  path. Contract marks the field `type: [string,'null']`,
  `format: date-time`, OPTIONAL (absent from `required`), with an
  explicit MVP-03 no-expiry-owner description in both documents. The
  live test pins all three facts (:190-204: null valid, absent valid,
  non-date-time string invalid).
- F6. Docs delta is exactly 5 hunks, all in the opportunity area
  (`git show a7a4dbb8 -- docs/tow/ | grep '^@@'` →
  base `@@ -1674,6 +1674,16 @@` = `OpportunityCompatibility` component;
  base `@@ -1687,11 +1697,26 @@` = inline item convergence;
  canonical `@@ -1,7 +1,7 @@` = draft.4→draft.5;
  canonical `@@ -10,6 +10,12 @@` = revision note;
  canonical `@@ -545,14 +551,25 @@` = required-list change + nullable
  optional expiry). No other consumer contract changed. The structure
  pin moved draft.4→draft.5
  (`tests/contract/openapi.structure.test.js`, one line), which is the
  pre-existing pin following the revision, not a weakening.
- F7. Haversine is matching-inapplicable to pricing. The tow matching
  path uses `geodesicDistanceMeters` (`matching.js:107`) for
  filter/order only; the serializer emits no geodesic field
  (`serialize.js:116-135` emits `route_quote` from the provider quote
  only). `grep haversine` over `src` hits only legacy files
  (`models/EmergencyRequest.js`, `models/Partner.js`,
  `controllers/ProductController.js`) — none in the tow MVP-03 path.
  The live item key assertion (:152-168) forbids any invented top-level
  member, and the live 200 body validated against the composed schema.
- F8. Fan-out stays bounded. Every exclusion case asserts
  `routeProvider.callCount() === 0` per case via the shared
  `expectExcluded` helper
  (`tests/tow/mvp03/towPartnerOpportunities.test.js:304-310`) covering
  out-of-radius, unavailable, offline, (0,0), null coordinates, inactive
  vehicle, missing/pending/rejected/expired documents, unsupported
  class, insufficient capacity, non-tow type (:405-411), non-SEARCHING
  (:415-423), empty feed (:294-300), no-vehicle (:283-292), and the 409
  module gate (:451-460); exactly-one-call-per-eligible is pinned at
  :425-437 (`callCount() === 1` with a mixed eligible/ineligible pair)
  and pagination slicing at :267-281. Module gate runs first in the
  service (:76) before any candidate/quote work. The live contract test
  independently asserts `callCount() === 1` for its single opportunity
  (:129).
- F9. Negative control is genuine (reviewer re-ran it, not copied).
  Removing the `active_tow_vehicle` line from `serializeOpportunity`
  turned the suite RED: 3 failed / 4 passed, with Ajv naming
  `must have required property 'active_tow_vehicle'` at
  `/data/items/0`. Restore via `git checkout --` returned sha256
  `648d0a0d316909d53c67d9380baed8e3dc0d0dfc5b0d692a7d702a7394301976`
  (identical to pre-mutation), `git status`/`git diff` empty, suite
  GREEN 7/7. No `/tmp` used; no backup file created.

## Checks 1–9 (result)

1. Runtime matches OpenAPI — PASS. Live suite drives the real endpoint
   with a real opportunity and validates the actual body against the
   composed canonical `TowOpportunityListResponse`; 7/7 GREEN in this
   session. Deltas coherent: canonical required-list change,
   nullable+optional `opportunity_expires_at`, draft.4→draft.5 with
   revision note, base inline-item convergence +
   `OpportunityCompatibility`; no other consumer contract changed
   (5 hunks, all opportunity-area).
2. `active_tow_vehicle` truthful — PASS. Same loaded-once object for
   eligibility AND quote tariff; `TowVehicleSummary` 10-field projection,
   no tariff/persistence leakage (executed + asserted in tests).
3. `compatibility` reuses MVP-01 authority — PASS. Single `isCompatible`;
   flags derived from the same checks; verdict flows
   isCompatible→evaluateEligibility→evaluateTowMatch→service→serializer
   unaltered; only `matched` results carry it (excluded results carry no
   `compatibility` key at all).
4. `opportunity_expires_at` semantics truthful — PASS. Literal `null`;
   zero derivation from `tow_proposal_expiry_minutes` (definition-only);
   nullable AND optional with explicit MVP-03 documentation; no fake
   expiry anywhere.
5. No MVP-04 leakage — PASS. `a7a4dbb8` touches only the matching path +
   contract + tests (11 files); the only "proposal/scheduler/expiry"
   strings in the diff are prose stating MVP-03 owns none. No proposal,
   counteroffer, assignment, state machine, tracking, payment, cash,
   scheduler, background matching, Phase 2, #31, VPS code.
6. Haversine not used for pricing — PASS. Wire exposes only the
   authoritative Google Routes `route_quote`; geodesic value is
   matching-internal, never serialized, never priced (code + live body).
7. Fan-out bounded — PASS. Excluded candidate → 0 provider calls
   asserted per case (list in F8); 1 call per eligible opportunity;
   pagination slices the ordered list; module gate first.
8. Regression gates — PASS with one environmental exception (see gates
   table: default-port PG startup blocked by an unrelated container;
   full PG battery GREEN on DB_PORT=55434; teardown 0/0/0).
9. Negative control — PASS (reviewer-executed RED→GREEN, byte-identical
   restore proven by sha256 + empty diff).

## Claims audited

- "The runtime is made truthful; the contract is not weakened to excuse
  it." VERIFIED (F2: runtime gained the members; contract kept all five
  required; expiry became nullable/optional with justification, which is
  a truthfulness correction, not an excuse).
- "Negative control: removing `active_tow_vehicle` turns RED …
  byte-identical restore turns GREEN." VERIFIED by re-execution (F9),
  not by trusting evidence file 24.
- "No other consumer contract changed in this revision." VERIFIED
  (F6: 5 hunks, opportunity-area only).
- "No behaviour was weakened; tests/tow/mvp02 unchanged; counts moved
  only upward." VERIFIED: mvp02 untouched by the diff (no mvp02 file in
  `a7a4dbb8 --stat`) and 204/204 GREEN; full-suite deltas are additions
  (new 7-test contract suite + dimension tests) with zero failures.
- "One provider call per eligible opportunity; excluded candidates cost
  zero calls." VERIFIED (F8, executed suites GREEN).
- Executor evidence files 22–27 (runtime delta, live validation,
  negative control, OpenAPI delta, invariants, gates) were spot-checked
  against primary sources and found consistent with what this review
  independently observed. One usage note, not a defect: PG suites
  require `DB_PORT=55434` (or full `DB_*`) in THIS environment because
  the default 55432 is held by an unrelated container (see flake note).

## Live gates (reviewer-executed, HEAD `1818310a`)

- `npx jest tests/tow/mvp03/towPartnerOpportunitiesContract.test.js
  --runInBand` → 7/7 PASS.
- `npm run validate:openapi` → PASS (exit 0).
- `npm run test:contract` → 5 suites / 62 tests PASS.
- `npm run verify:tow` → offline stages PASS (contract suite; focused
  Tow offline); PostgreSQL startup stage RED ONLY because default port
  55432 is held by unrelated `akry-edge-pg` (docker ps proven; not our
  `socorre-tow-test-*` project). Environmental, pre-existing, also
  recorded in evidence 27.
- `npx jest tests/tow/mvp01 --runInBand` → 13 passed suites (2 skipped),
  124 passed tests (10 skipped), 0 failed.
- `npx jest tests/tow/mvp02 --runInBand` → 5/5 suites, 204/204 PASS.
- `npx jest tests/tow/mvp03 --runInBand` → 8/8 suites, 177 passed
  (7 skipped), 0 failed.
- `npx jest tests/tow --runInBand` → 42 passed suites (5 skipped),
  856 passed tests (65 skipped), 0 failed.
- `npm run test:db-baseline` → RED at the docker-startup step on
  default port 55432 (same unrelated-container cause); NOT a baseline
  assertion failure. Real baseline e2e below is GREEN.
- `npx jest --runInBand` (full) → 75 passed suites (5 skipped),
  1280 passed tests (65 skipped), 0 failed.
- `DB_PORT=55434 npm run test:pg:up && DB_PORT=55434 npm run
  test:pg:wait` → container healthy.
- `DB_PORT=55434 TOW_POSTGRES_E2E=1 npx jest
  tests/tow/baseline/dbBaseline.e2e.test.js --runInBand` → 33/33 PASS.
  (First attempt WITHOUT `DB_PORT` failed auth against the unrelated
  55432 container — reviewer usage error, documented here to prevent
  misattribution; with the correct port it is GREEN.)
- `DB_PORT=55434 TOW_POSTGRES_E2E=1 npx jest
  tests/tow/mvp03/towMvp03Postgres.e2e.test.js --runInBand` → 7/7 PASS.
- `DB_HOST=127.0.0.1 DB_PORT=55434 … TOW_POSTGRES_E2E=1 npx jest
  tests/tow/towPostgres.e2e.test.js
  tests/tow/g3TowPostgres.e2e.test.js --runInBand` → 9/9 PASS.
- `DB_PORT=55434 npm run test:pg:down` → teardown verified:
  0 containers / 0 volumes / 0 networks for `socorre-tow-test-*`.
  (Note: bare `npm run test:pg:down` targets the default-port project;
  the 55434 project required `DB_PORT=55434` for teardown.)

## Flake note

No transport flake observed in this session: no stale 401, no
`Parse Error: Expected HTTP/, RTSP/ or ICE/`, no `socket hang up`
across the full battery (including the HTTP-heavy mvp03 and full
suites); server-side morgan logs showed the expected 2xx throughout.
The only RED seen was (a) the intentional negative-control mutation
and (b) default-port PostgreSQL startup collisions with the unrelated
`akry-edge-pg` container holding host port 55432 plus one reviewer
mis-invocation without `DB_PORT` — all environmental, none
attributable to the correction. Re-runs were not needed for any
functional suite.
