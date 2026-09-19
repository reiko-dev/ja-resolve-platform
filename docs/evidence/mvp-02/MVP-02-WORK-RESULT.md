# MVP-02 Work Result

## Status
READY_FOR_MUSE_REVIEW

## Base / Branch / Head
- Repository: `socorre-system`
- Base (execution): `c03e2d06d6680eef1f3f961c877985033da0d89f` (post-merge main of PR #35, Tow MVP-01 ACCEPTED, receipt `#5745811538`, Issue #13 CLOSED)
- Branch: `feature/mvp-02-routes-pricing`
- **Implementation head (frozen): `827cbaf0c8e1ee4deda160543def494c432fe5eb`** — 36 files, +5350/−19
- Issue: #14 (MVP-02 — Google Routes & Authoritative Tow Pricing)
- Push / PR / merge: **not performed** — the executor stops before PR creation; the orchestrator opens the PR after Muse's verdict. Issue #14 stays OPEN; MVP-03 (#15) was not released.

## Current-State Delta
Delivered as its own required artifact before any code:
`docs/evidence/mvp-02/01-current-state-delta.md` maps every MVP-02 capability →
existing implementation (`file:line`) → disposition. Summary:
**REUSE 4 / ADAPT 6 / REPLACE 1 / MISSING 6 / DEFERRED 1**.

- The pricing *formula* was already frozen in `docs/tow/TOW-PRICING-CONTRACT.md`,
  and the MVP-01 `TowVehicle` tariff columns
  (`minimum_charge_cents`, `included_km`, `price_per_additional_km_cents`) are
  reused verbatim — no migration.
- `domain/pricing.js` had only `validatePricing` (shape validation). It was
  **REPLACED** by a policy module that also computes the frozen formula exactly;
  `validatePricing` keeps its MVP-01 behaviour and callers.
- No route/distance capability existed in the backend at all: `MISSING` for the
  `RouteProvider` port, the Google adapter, geo validation, the route-quote value
  object, the `quoteTow` operation and the composition wiring.
- The T00 `FakeMapsGateway` is a Distance-Matrix-shaped **port double** whose
  boundary forbids pricing logic; it was not overloaded. MVP-02 adds a separate
  `createFakeRouteProvider` in the same helper file, keeping both shapes and the
  T00 determinism guarantees intact.
- **HTTP scope boundary (decision).** MVP-02 adds **no public endpoint** and
  therefore does not modify the frozen OpenAPI documents: the base contract
  already defines `RouteLeg`/`RouteQuote` (`tow-api-contract.base.openapi.yaml:1182-1195`)
  but no operation that returns a quote, and `TowRouteSnapshot`
  (`tow-api-contract.openapi.yaml:449-465`) is explicitly MVP-03 scope. The
  operation is exposed as an application service — the same seam MVP-01 used for
  operational eligibility — so the contract is extended when its owning delivery
  lands, never silently.

## Architecture
Unchanged MVP-01 layering, extended by one adapter family:

- `domain/**` — pure. New: `integers.js` (safe-integer guards + exact sums),
  `geo.js` (WGS84 coordinate validation), `route.js` (frozen route quote),
  and the pricing policy in `pricing.js`. No HTTP, no provider, no `process.env`.
- `application/**` — ports + services only. New `RouteProvider` port
  (`ports.js`, `PORT_NAMES`) and `quote-service.js`. Depends on the port, never
  on the adapter.
- `adapters/routes/**` — the **only** HTTP-aware code in the module:
  `google-routes-adapter.js` (axios) and `route-provider-error.js`.
- `composition.js` — the only place the pure layers meet Knex, HTTP and the
  system clock; it now also wires `routeProvider` + `quoteService`.

The boundary is enforced, not just asserted, by
`tests/tow/mvp02/towRouteProviderBoundary.test.js`:
- `adapters/routes/google-routes-adapter.js` is the **only** file in the module
  that requires `axios`;
- Domain/Application require only sibling relative paths and contain no
  `axios`/`http`/`node-fetch`/`undici`/`fetch(`/`knex`/`express`/`fs`/`process.env`;
- `quote-service.js` never names `adapters`, `axios` or `routes.googleapis.com`;
- the fake route provider contains no pricing field, no meter→km conversion and
  no `Date.now(`/`Math.random(`/`fetch(`/HTTP require.

## RouteProvider Port
```js
computeRoute({ origin, destination, pickup? })
  -> { provider_to_pickup: RouteLeg|null, pickup_to_destination: RouteLeg|null,
       encoded_polyline: string|null }
```
- Single-leg mode (no `pickup`): `provider_to_pickup` is `null` and
  `pickup_to_destination` carries origin→destination.
- `RouteLeg` is `{ distance_meters, duration_seconds }` — the canonical units of
  the frozen contract (integer meters, integer seconds).
- `RouteProviderError extends Error` with `name='RouteProviderError'`,
  `code='route_provider_error'` and
  `reason ∈ {configuration_missing, configuration_invalid, timeout,
  network_failure, provider_error, empty_route, malformed_response}`.
  `details` may only carry safe scalars (`{status}`, `{field}`).
- The port is verified as a real substitution boundary: the fake and the real
  adapter produce **identical** `quoteTow` output (R$184,80) for the same inputs,
  so a test can never pass on the fake while the adapter disagrees.

## Google Routes Adapter
Verified against the live Google documentation; full evidence in
`docs/evidence/mvp-02/02-google-routes-contract.md`.

- `POST https://routes.googleapis.com/directions/v2:computeRoutes`, headers
  `Content-Type`, `X-Goog-Api-Key`, and the **mandatory** `X-Goog-FieldMask`.
- Field mask: `routes.legs.distanceMeters,routes.legs.duration,routes.polyline.encodedPolyline`.
  Route-level `routes.distanceMeters`/`routes.duration` are deliberately **not**
  requested — the legs are the single authority and the total is their exact sum,
  so two sources can never disagree.
- **One call, pickup as a single non-`via` intermediate.** Google itself places
  the leg boundary at the pickup (`legs[0]` = provider→pickup,
  `legs[1]` = pickup→destination) and returns one continuous polyline for the
  whole trip. `via: true` was rejected because a pass-through waypoint does not
  split the route; two separate calls were rejected because they can route on
  different traffic snapshots and produce two disjoint polylines.
- `routes[].legs[]` **is** populated for `DRIVE` — Google's own
  intermediate-waypoints guide returns `{"distanceMeters":805,"legs":[{"distanceMeters":207},{"distanceMeters":598}]}`
  for exactly this request shape, and 207 + 598 = 805. Only
  `RouteLeg.stepsOverview` is TRANSIT-only.
- `duration` is a protobuf Duration **string** (`"165s"`, up to 9 fractional
  digits). It is parsed from its decimal digits with BigInt and rounded HALF_UP
  (`"900.5s"` → 901, `"900.4999s"` → 900). No float touches it.
- **Fail closed.** `routes: []` → `empty_route`. A leg count other than exactly
  2 (with pickup) or 1 (without) → `malformed_response`. There is no ratio split,
  no reuse of the route total for a leg, and no straight-line fallback. A missing
  or unusable polyline degrades to `null` rather than failing the quote — the
  polyline is decoration, the legs are the price.
- The key is resolved **per call**, so an unset `GOOGLE_ROUTES_API_KEY` never
  breaks module startup; it degrades one operation to
  `external_dependency_unavailable` (503). The constructor never throws.
- No key, request body, raw provider body or original stack is ever attached to
  an error.

## Authoritative Pricing
`domain/pricing.js` implements the frozen `TOW-PRICING-CONTRACT.md` formula with
exact integer arithmetic:

```
included_meters       = included_km * 1000              (decimal-exact)
excess_meters         = max(0, total_distance_meters - included_meters)
variable_charge_cents = ROUND_HALF_UP(excess_meters * price_per_additional_km_cents / 1000)
final_price_cents     = minimum_charge_cents + variable_charge_cents
```

- **No `ceil` of excess kilometres.** The required contract example holds:
  included 10 km, route 14.350 km, R$8,00/km → excess 4.350 km → variable
  **R$34,80** (not R$40,00) → total **R$184,80**.
- `ROUND_HALF_UP` is exact integer division, `(n*2n + d) / (d*2n)` on BigInt, and
  is HALF_UP for non-negative values: `1499 → 1`, `1500 → 2`, `1501 → 2`.
- `included_km` is `DECIMAL(10,3)`. It is converted by reading the decimal
  **digits as text** and assembling with BigInt, so `2.007` becomes exactly 2007
  meters. A binary-float multiply yields `2007.0000000000002`, and with a
  2008 m route at R$15,00/km that naive path bills **1 cent instead of 2** — this
  exact regression is a test (`NC-2` in `11-negative-controls.md` proves the test
  is load-bearing).
- A value with more than three significant decimal places is **rejected**
  (`validation_error`), never silently rounded into a different price — so
  `0.1 + 0.2` cannot enter the tariff.
- Money is BigInt through the multiply and is converted back to a Number only
  after an explicit safe-integer range check; overflow is a `validation_error`,
  never a silently approximate price.
- The policy is proven over a 0–30000-thousandths sweep and is frozen
  (`Object.freeze`) on every returned object.

## Route/Pricing Quote (snapshot-safe)
`application/quote-service.js` — `quoteTow({ provider, pickup, destination, tariff?, partnerId?, vehicleId? })`:

- validates **all three** coordinates and the tariff **before** the provider call
  (a malformed request must never be reported as a provider outage);
- calls the provider once and builds the route quote from the returned legs;
- freezes the tariff that produced the price into `pricing_snapshot`
  (`minimum_charge_cents`, `included_km`, `included_meters`,
  `price_per_additional_km_cents`), so the returned quote cannot drift when the
  vehicle row changes. Verified both ways: mutating the caller's tariff object
  after the call leaves the snapshot at R$184,80, and mutating the vehicle row to
  tariff B (0 km included, R$1,00/km, R$1,00 minimum) leaves the first quote at
  R$184,80 while a new quote correctly returns R$15,35. The object graph is
  deeply frozen;
- ignores any client-supplied distance or price field — the only distance that
  can be priced is the provider's, and the only tariff is the backend's;
- an explicit backend `tariff` takes precedence and **skips** the repository
  lookup entirely; otherwise the vehicle is resolved through the
  `VehicleRepository` port (`not_found` when absent);
- maps **both** a provider transport failure and a malformed provider payload to
  the canonical `external_dependency_unavailable` (503) with no price at all and
  no provider internals in the error;
- `generated_at` comes from the injected `Clock` port (no ambient time);
- construction throws `TypeError` without a `routeProvider` or a `clock`.

Output (deeply frozen):
```js
{ route_quote: { provider_to_pickup, pickup_to_destination,
                 total_distance_meters, total_duration_seconds, encoded_polyline },
  pricing_snapshot: { minimum_charge_cents, included_km, included_meters,
                      price_per_additional_km_cents },
  calculated_price: { amount_cents, currency: 'BRL' },
  generated_at }
```

`total_distance_meters` is the exact integer sum of the legs and is asserted to
equal that sum — never an independent figure.

## Key Hygiene
- New server-side variable `GOOGLE_ROUTES_API_KEY`, documented in
  `env.example` and `env.production.example` with the required restriction
  (application restriction by server IP/CIDR, API restriction including
  "Routes API") and an explicit note that an unset value yields
  `external_dependency_unavailable`, never an estimated price.
- The browser key is **not** reusable: `socorre_ai_admin/src/config/apiKeys.ts:3`
  exposes `REACT_APP_GOOGLE_MAPS_API_KEY` with a hardcoded fallback and
  `PartnerForm.tsx:148` uses it for Geocoding. A key shipped to a browser is
  public by construction and can only be referrer-restricted, which a server
  cannot present. An architecture test asserts the adapter never references
  `GOOGLE_MAPS_API_KEY` or any `REACT_APP_*` variable (`NC-5` proves it).
- `docs/evidence/t00/google-routes-audit.txt` recorded that the backend had no
  Google client and no Google key before this delivery; that remains true for
  every other key.
- No key literal matching `AIza[0-9A-Za-z_-]{35}` is committed anywhere; the
  examples only document the variable name.
- `env.example` keeps its unused `GOOGLE_MAPS_API_KEY` untouched (not
  repurposed, not deleted) to avoid silently changing another delivery's config.

## Migrations
- **None.** `003_mvp01_tow_foundation.js` remains the latest migration; the
  schema fingerprint is unchanged at
  `37cee47edc8dd1084786ab5fe3c32511c71b9a4a2788f67406391916c7cc0f59` (identical
  across the reset+migrate runs in the gate).
- No migration was needed because the MVP-01 `tow_vehicles` tariff columns are
  already the canonical units the pricing contract consumes.
- No OpenAPI file was modified (see the scope-boundary decision above).

## Tests
New focused suites in `tests/tow/mvp02/` — **179 tests, 5 suites**, no
`.only`/`.skip`, no socket, no `jest.mock('axios')`, no real Google call:

| Suite | Focus |
| --- | --- |
| `towPricingPolicy.test.js` | decimal-exact `included_km`, excess boundaries, the 14.350 km contract example, half-cent below/exact/above, the `2.007` float-drift regression, a 0–30000-thousandths sweep, overflow/unsafe-integer rejection, immutability, MVP-01 `validatePricing` preservation |
| `towRouteQuoteDomain.test.js` | leg sums, single-leg, null polyline, deep freeze, JSON round-trip, malformed legs, overflow, geo bounds → `validation_error`/422 |
| `towQuoteService.test.js` | output shape, summed-before-pricing, snapshot immutability vs tariff B, deep freeze, `generated_at` from the clock, repository resolution, `not_found`, validation-before-provider, client-override immunity, explicit-tariff precedence, provider failure → 503 with no leak, malformed payload → 503, constructor guards |
| `towGoogleRoutesAdapter.test.js` | one call, endpoint, body (`intermediates`, never `waypoints`, never `via`), DRIVE, exact field mask, headers, timeout, leg mapping, no distance rounding, duration `"900.5s"→901` / `"900.4999s"→900`, whole-route polyline, single-leg mode, leg-count failures, `empty_route`, 12 malformed payloads, timeout/network/provider_error (400/401/403/429/500/503/504), no key or body leakage, `RouteProviderError` shape, configuration failures with zero HTTP calls, adapter-side geo validation |
| `towRouteProviderBoundary.test.js` | port registration, fake↔adapter LSP equivalence, composition without a key, injected provider override, lazy env read, Domain/Application purity scans, single-axios-file scan, no Haversine / no estimation vocabulary, fake determinism, key hygiene, no `.only`/`.skip` |

| Gate | Result |
| --- | --- |
| `npm run validate:openapi` | PASS (`05-openapi.txt`) |
| `npm run test:contract` | 5 suites / 62 tests PASS (`06-contract.txt`) |
| `npm run verify:tow` | **GREEN 5/5 stages** incl. PostgreSQL foundation gate (`07-verify-tow.txt`) |
| `npx jest tests/tow/mvp02 --runInBand` | 5 suites · **179 passed / 179 · 0 failures** (`04-mvp02-green.txt`) |
| `TOW_POSTGRES_E2E=1 npx jest tests/tow/mvp02 --runInBand` | 179 passed / 179 — the new suites need no database |
| `npx jest tests/tow/mvp01 --runInBand` | 13 passed / 2 skipped suites · **123 passed / 10 skipped** — identical to the MVP-01 baseline |
| `npx jest tests/tow --runInBand` | 34 passed / 5 skipped suites · **653 passed / 58 skipped / 0 failures** (`09-tow.txt`) |
| `npm run test:db-baseline` | GREEN — fresh volume, reset+migrate fingerprint identical ×2 (`08-db-baseline.txt`) |
| `npx jest --runInBand` (full) | 67 passed / 5 skipped suites · **1077 passed / 58 skipped / 0 failures** (`10-full-jest.txt`) |

## Regression
- Every pre-existing gate is preserved: OpenAPI PASS · contract 62/62 ·
  `verify:tow` GREEN · `tests/tow/mvp01` 123 passed / 10 skipped (byte-identical
  counts) · db-baseline fingerprint `37cee47e…` ×2.
- `tests/tow` rose 474 → 653 passed (+179, exactly the new tests) with the same
  58 skipped and 0 failures.
- Full Jest rose 898 → 1077 passed (+179, again exactly the new tests) with the
  same 58 skipped and 0 failures.
- **No pre-existing test was modified.** The only two pre-existing test files
  touched are additive: `tests/helpers/tow/gateways/mapsGateway.js` keeps every
  T00 export (`FakeMapsGateway`, `createFakeMapsGateway`, `DEFAULT_ROUTE`)
  unchanged and adds `FakeRouteProvider` / `createFakeRouteProvider` /
  `DEFAULT_ROUTE_PROVIDER`, and `tests/helpers/tow/index.js` gains a `routes` key
  in `createFakeGateways`. No T00 suite changed behaviour; the T00 determinism
  and source-scan suites still pass.
- **Pre-existing flake, disclosed.** One full-suite run of this identical tree
  reported 2 failures in the **pre-existing** `tests/auth/authHttp.transport.test.js`
  ("falha de banco na revogação retorna 500 genérico") with
  `Parse Error: Expected HTTP/, RTSP/ or ICE/` — the same socket flake class
  already recorded for T00 in
  `docs/evidence/t00/flake-g3-proposals-parse-error.txt:172`. Characterization:
  that file passes **6/6 in isolation** and the full suite passed **3/3** on
  re-run. MVP-02 touches no auth file. Recorded in
  `10a-full-jest-flake-observed.txt`; the frozen-head result is the green run.

## Negative Controls
`11-negative-controls.md` — six mutations, each breaking exactly one MVP-02
guarantee, all **detected** (suite RED) and all restored byte-for-byte:

| # | Mutated guarantee | Result |
| --- | --- | --- |
| NC-1 | HALF_UP → float `Math.ceil` | RED (2 failed) |
| NC-2 | decimal-exact `included_km` → float multiply | RED (2 failed) — the `2.007` drift test is load-bearing |
| NC-3 | strict provider leg count → permissive | RED (3 failed) |
| NC-4 | provider failure → raw error rethrown | RED (8 failed) |
| NC-5 | server Routes key → browser `GOOGLE_MAPS_API_KEY` | RED (1 failed) |
| NC-6 | lazy env read → module-load constant | RED (1 failed) |

## Bookkeeping (disclosed)
- `docs/tow/TOW-MVP-DELIVERY-PLAN.md`: accepted baseline → `c03e2d06…`, MVP-01
  `ACCEPTED` (PR #35, receipt `#5745811538`), MVP-02 `READY / current delivery`
  with its execution base and branch. MVP-02 is **not** marked ACCEPTED and
  MVP-03 is **not** released — that is the orchestrator's call after review.
- `docs/tow/TOW-TASK-GRAPH.yaml`: `main_sha` → `c03e2d06…`, `MVP01.status:
  ACCEPTED`, `MVP02.status: READY`. **The `schema_fingerprint` field was also
  updated to `37cee47edc8dd1084786ab5fe3c32511c71b9a4a2788f67406391916c7cc0f59`**,
  which is the fingerprint MVP-01 actually produced and the one the DB gate
  reproduces. It previously held the pre-MVP-01 value, so the file was stale
  rather than the database having drifted. Flagged here rather than changed
  silently.
- `docs/evidence/t01/db-baseline-gate.json` is regenerated by every
  `npm run test:db-baseline` run. Its only delta was a randomized admin email
  (`gate-admin-48808865@…` → `gate-admin-58716960@…`), so the file was
  **reverted** to keep T01 historical evidence untouched; the fresh gate output
  is preserved in full under `docs/evidence/mvp-02/08-db-baseline.txt` (same
  tables, rows and fingerprint). Disclosed so the revert is not mistaken for a
  hidden change.

## Scope
- MVP-01 touched: only additively (`pricing.js` gained the policy while keeping
  `validatePricing`; `composition.js` gained two wirings; the T00 helper gained a
  second fake). All MVP-01 gates and counts are preserved.
- MVP-03 / #15 touched: **NO** — no lifecycle, no state machine, no
  `TowRouteSnapshot`, no request entity.
- #33 / Phase 2 touched: NO. #31 touched: NO.
- Google Directions legacy, Haversine, Distance Matrix: NO — the legacy
  `6371 * acos` copies listed in `docs/evidence/t00/google-routes-audit.txt` were
  **not** reused and are asserted absent from the module and the helpers.
- Matching / proposals / assignment / tracking / cancellation / payments / debts
  / wallet / disputes / audit: NO.
- No new public HTTP endpoint; no OpenAPI file changed; no migration.
- production/VPS touched: NO.
- No `git add -A`; explicit paths only; no push, no PR, no merge.

## Remaining Findings
- **No public endpoint yet (intentional).** `quoteTow` is an application service
  because the frozen contract has no operation that returns a quote and
  `TowRouteSnapshot` belongs to MVP-03. The service is the seam MVP-03 calls; the
  HTTP surface should be added together with its contract operation, not before.
- **`external_dependency_unavailable` (503)** is a canonical code frozen in
  `TOW-PRICING-CONTRACT.md` but it was absent from `domain/errors.js`; MVP-02
  added it to `ERROR_STATUS` with a generic factory. It is not in the frozen
  `ErrorResponse` enum (which only requires the canonical set to be present).
- **`RouteProviderError` lives in the adapter layer** on purpose: it is how the
  adapter says *why* Google could not answer, and the application collapses every
  reason into one canonical code. Nothing outside `adapters/routes/` may branch
  on `reason`.
- **Polyline is optional.** A malformed or absent `encodedPolyline` degrades to
  `null` instead of failing the quote: geometry is decoration, the legs are the
  price. If a later delivery needs geometry to be mandatory, that is a contract
  decision, not a silent adapter change.
- **`TRAFFIC_AWARE` without a departure time** uses live traffic. If a later
  delivery needs scheduled pricing, `departureTime` must be added deliberately —
  it changes the quoted distance, so it belongs to whoever owns scheduled
  booking.
- **No lint/typecheck script exists** in the backend package; the Jest suites and
  the architecture boundary tests are the static guards (unchanged from MVP-01).
- The pre-existing `authHttp.transport` socket flake described above is
  **not** fixed here: it is outside MVP-02 scope and predates this branch.

## Final Verdict
MVP-02 IMPLEMENTATION GREEN — READY FOR MUSE REVIEW
