# MVP-02 — Current-State Delta

> Issue: #14 — Google Routes & Authoritative Tow Pricing
> Execution base: `c03e2d06d6680eef1f3f961c877985033da0d89f` (MVP-01 accepted)
> Branch: `feature/mvp-02-routes-pricing`
> Scope of this document: what already exists, what is reused, what is adapted, what is missing.

This artifact was produced **before** any MVP-02 production code was written.

Paths are relative to `socorre_ai_backend/` unless the path starts with `docs/` or `scripts/`
(repository root).

---

## 1. Required capability → existing implementation → disposition

| # | Required MVP-02 capability | Existing implementation (file:line) | Disposition |
|---|---|---|---|
| 1 | Authoritative pricing formula (proportional per meter, `ROUND_HALF_UP`, no `ceil`) | `src/modules/tow/domain/pricing.js:13-37` — only `validatePricing`; no formula at all. Formula is documented in `docs/tow/TOW-PRICING-CONTRACT.md:48-74` | **ADAPT** (extend the same file with the pure policy; keep `validatePricing` untouched for MVP-01) |
| 2 | Decimal-safe `included_km` → integer meters | none. `src/modules/tow/domain/pricing.js:25-29` only checks `typeof included_km === 'number'` | **MISSING** |
| 3 | Integer/rational money arithmetic + overflow rejection | none. No money arithmetic anywhere in the Tow module | **MISSING** |
| 4 | `RouteProvider` application port | `src/modules/tow/application/ports.js:50-58` — `PORT_NAMES` lists 7 ports; no route port. `ports.js:1-47` is the JSDoc typedef home for every port | **ADAPT** (add the `RouteProvider` typedef + `PORT_NAMES` entry, same file/style) |
| 5 | Google Routes server-side adapter | none. `docs/evidence/t00/google-routes-audit.txt:3-7` proves no `maps.googleapis.com` / `@googlemaps` / `GOOGLE_ROUTES_API_KEY` usage in `src/` | **MISSING** |
| 6 | Deterministic, network-free route fake | `tests/helpers/tow/gateways/mapsGateway.js:22-91` — `FakeMapsGateway` with `computeRoute` / `computeDistanceMatrix`, `DEFAULT_ROUTE` = 8400 m / 1320 s, call recording, no pricing, no network | **ADAPT** (add a `FakeRouteProvider` implementing the new port in the same file; keep `FakeMapsGateway` byte-compatible for T00 tests) |
| 7 | Route/pricing quote application service | none. `src/modules/tow/application/index.js:6-18` exports 5 services; none quotes a route | **MISSING** |
| 8 | Snapshot-safe immutable quote for MVP-04 | none | **MISSING** |
| 9 | Geo coordinate validation before the provider call | none in the Tow module | **MISSING** |
| 10 | Canonical `external_dependency_unavailable` at the business boundary | code is frozen in the contract (`docs/tow/TOW-API-CONTRACT.md:1339`, `docs/tow/tow-api-contract.base.openapi.yaml:1808`) and known to the test contract helper (`tests/helpers/towContract.js:79`), but it is **not** in `src/modules/tow/domain/errors.js:12-24` `ERROR_STATUS` | **ADAPT** (add the code + factory to the existing domain error owner) |
| 11 | Composition wiring for the new port/service | `src/modules/tow/composition.js:25-58` — builds 6 repositories/adapters + 5 services from `options.*` overrides | **ADAPT** (same pattern: `options.routeProvider` override, otherwise the real adapter) |
| 12 | Dedicated server-side credential | `env.production.example` carries no Google key in that file; `env.example:41` only has `GOOGLE_MAPS_API_KEY` (unused by any backend code) | **ADAPT** (`GOOGLE_ROUTES_API_KEY` documented in `env.production.example`; the legacy unused name is left alone) |
| 13 | Reuse the existing HTTP stack | `package.json:35` declares `axios ^1.14.0`; `axios@1.15.2` is installed. Backend `src/` currently has **zero** `require('axios')` — the only axios usage in the repo tree is the unrelated TS admin client `src/services/api.ts:1-10` | **REUSE** (`axios` only inside the new adapter) |
| 14 | TowVehicle tariff source | `src/modules/tow/adapters/persistence/vehicle-repository.js:30-51` `mapVehicleRow` already returns `pricing: { minimum_charge_cents, included_km, price_per_additional_km_cents }` with `Number(...)`; `src/modules/tow/http/serialize.js:34-54` `serializeVehicle` exposes the same nested shape | **REUSE** (no DTO change; MVP-02 consumes the existing tariff shape as-is) |
| 15 | Vehicle resolution through a port | `src/modules/tow/application/ports.js:13-22` `VehicleRepository.findByPartnerAndId`; used by `src/modules/tow/application/vehicle-service.js:23-27` | **REUSE** (optional tariff resolution path in the quote service) |
| 16 | Clock port for `generated_at` | `src/modules/tow/application/ports.js:45-46` `Clock`; `src/modules/tow/adapters/clock/system-clock.js` | **REUSE** |
| 17 | TowRequest route endpoint `GET /tow/requests/{requestId}/route` | frozen only as a long-term contract: `docs/tow/tow-api-contract.openapi.yaml:83-102` + `TowRouteSnapshot` at `:449-465`; `TowRequest` itself is MVP-03 (#15) | **DEFERRED** — not implemented; see §4 |
| 18 | Road distance from Google (not Haversine) | legacy Haversine is widespread but must **not** be reused: `src/models/Partner.js:9,284,291`, `src/models/DeliveryOrder.js:204`, `src/models/TowProposal.js:67`, `src/models/Mechanic.js:59,69,128,138`, `src/models/Product.js:109,193,255`, `src/models/DeliveryOrderModel.js:196,442`, `src/models/EmergencyRequest.js:223,286,458,1023,1049`, `src/controllers/TowProposalController.js:348`, `src/controllers/ProductController.js:26,338`, `src/services/TowProposalService.js:103,364` (audit: `docs/evidence/t00/google-routes-audit.txt:13-39`) | **REPLACE / NOT REUSED** — the new port never calls `calculateDistance`; §3 proves it |
| 19 | Legacy Tow price rule | `src/models/TowProposal.js` / `src/services/TowProposalService.js` operate on partner-supplied `proposed_price` and partner-supplied `estimated_time_minutes` (`docs/evidence/t00/google-routes-audit.txt:41-54`), i.e. no server-authoritative formula to migrate | **NOT MIGRATED** — MVP-02 introduces the authoritative policy from the frozen contract instead of porting legacy behaviour |

---

## 2. Google configuration surfaces inspected (and why none is server-suitable)

| Surface | Finding | Consequence for MVP-02 |
|---|---|---|
| `env.production.example` | this file carries no Google key | must add `GOOGLE_ROUTES_API_KEY` |
| `env.example:41` | `GOOGLE_MAPS_API_KEY=sua_google_maps_api_key` — never read by any backend module (audit line 4-7) | do not reuse this name; a browser Maps key is not the same credential as a server Routes key |
| `ecosystem.config.js:12-18` (`env_production`) | lists `SERVICE_PHOTO_STORAGE_DIR` and `TOW_DOCUMENT_STORAGE_DIR` only | no Google secret injected through PM2 config |
| `docker-compose.yml:54-55` (backend service `environment:`) | same two storage dirs only | no Google secret in the Compose surface |
| `socorre_ai_admin/src/config/apiKeys.ts:3` | `GOOGLE_MAPS: process.env.REACT_APP_GOOGLE_MAPS_API_KEY \|\| 'AIzaSy…'` — a **browser-exposed** key with a hardcoded literal fallback | confirms the frontend key is referrer-restricted / public by design; **not** reusable server-side |
| `socorre_ai_admin/src/components/PartnerForm.tsx:148` | Geocoding API called directly from the browser with that key | same conclusion |

Decision: MVP-02 introduces a **dedicated** `GOOGLE_ROUTES_API_KEY`, read only by the adapter
factory, sent only in the `X-Goog-Api-Key` request header (never in a URL, never logged, never in an
error message), and documented in `env.production.example`.

Wording correction (EXT-MVP02-3): the per-file findings above say which **environment files** did
not carry a Google key before MVP-02; they are not a claim that the repository contains no key.
MVP-02 introduces no committed `GOOGLE_ROUTES_API_KEY` or server-side Routes credential. The
pre-existing browser/admin Maps-key fallback is outside MVP-02 and remains deferred to #31.

---

## 3. Explicit non-reuse proofs required by the task

| Rule | How MVP-02 guarantees it |
|---|---|
| Haversine must never become the authoritative road distance | the new adapter is the only implementation of the `RouteProvider` port; the port has no local-distance code path and the adapter has no fallback branch. A dedicated test asserts a provider failure produces `external_dependency_unavailable` and **no** price at all |
| Legacy Haversine pricing must not be migrated | MVP-02 adds a new pure domain policy; it does not import, wrap or call any `src/models/*` or `src/services/TowProposalService.js` code |
| `ceil(excess_km)` must not appear | the domain policy uses exact integer arithmetic with a single HALF_UP rounding step on the money value; a source-scan test asserts no `Math.ceil` / `ceil(` in the pricing path |
| Client input must not override distance/price | `quoteTow` accepts only coordinates + a tariff; it never accepts distance or price, and a test proves extra client-supplied distance/price fields are ignored |
| Fake must contain no pricing logic | the fake route provider returns route facts only; a source-scan test asserts no money/`ROUND_HALF_UP`/km conversion inside the gateway helper |

---

## 4. HTTP scope boundary decision (no hidden contract fork)

The frozen long-term OpenAPI declares `GET /tow/requests/{requestId}/route`
(`docs/tow/tow-api-contract.openapi.yaml:83-102`). That operation is keyed by a **`TowRequest`**,
whose lifecycle is MVP-03 (#15) and explicitly out of scope here.

Therefore:

- MVP-02 exposes **no public HTTP route and no public quote endpoint**;
- the capability is delivered as an application operation (`quoteTow`) that MVP-03/MVP-04 will call
  from their own controllers;
- the existing OpenAPI documents are **not modified**, so there is no second/parallel contract;
- when MVP-03 introduces `TowRequest`, `GET /tow/requests/{requestId}/route` can be served from the
  already-existing `TowRouteSnapshot` schema with no contract change.

No STOP condition was triggered: a public endpoint was not necessary to deliver MVP-02.

---

## 5. Architecture placement (inside the existing Tow module — no second subsystem)

```text
src/modules/tow/domain/pricing.js            authoritative pure pricing policy (extended)
src/modules/tow/domain/geo.js                pure coordinate validation (new)
src/modules/tow/domain/route.js              pure route-quote value object (new)
src/modules/tow/domain/errors.js             + external_dependency_unavailable (extended)
src/modules/tow/application/ports.js         + RouteProvider typedef (extended)
src/modules/tow/application/quote-service.js quoteTow application operation (new)
src/modules/tow/adapters/routes/google-routes-adapter.js   real server-side adapter (new)
src/modules/tow/composition.js               wiring (extended)
tests/helpers/tow/gateways/mapsGateway.js    + deterministic FakeRouteProvider (extended)
```

This mirrors the MVP-01 layering enforced by
`tests/tow/mvp01/towArchitectureBoundary.test.js:47-64` (Domain and Application may only require
sibling relative modules — no `axios`, no `http`, no `knex`, no `fs`).

---

## 6. Delta summary

```text
REUSE    4  (axios stack, vehicle tariff DTO, VehicleRepository port, Clock port)
ADAPT    6  (pricing.js, errors.js, ports.js, composition.js, mapsGateway.js, env docs)
REPLACE  1  (legacy Haversine as the distance source — replaced by the RouteProvider port)
MISSING  6  (route port, Google adapter, quote service, geo validation, exact money arithmetic,
             snapshot-safe quote)
DEFERRED 1  (GET /tow/requests/{requestId}/route — needs the MVP-03 TowRequest)
```
