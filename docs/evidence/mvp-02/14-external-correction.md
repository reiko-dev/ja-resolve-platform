# MVP-02 — External Correction Pass (EXT-MVP02-1 / EXT-MVP02-2 / EXT-MVP02-3)

```text
delivery:        MVP-02 — Google Routes & Authoritative Tow Pricing (Issue #14)
branch:          feature/mvp-02-routes-pricing
reviewed head:   fd55ffd70a5608316fd4de36de30d179eb56165b
implementation:  827cbaf0c8e1ee4deda160543def494c432fe5eb
correction head: e04e9b94d2ca5f8534ce3d42644621dc2799bf88
external review: CHANGES_REQUIRED — P0 = 0, P1 = 0, P2 blocking = 1, P3 = 2 (comment #5747856417)
scope:           EXT-MVP02-1 (P2 blocking), EXT-MVP02-2 (P3), EXT-MVP02-3 (P3, docs only)
```

No MVP-02 guarantee was relaxed: Routes v2 shape/mask, non-`via` pickup, the two observable
legs, the absence of Haversine/line-of-sight/estimate fallbacks, the absence of `ceil`, BigInt
pricing, and snapshot immutability all remain in force and were re-verified by the full gates.

## 1. Findings and disposition

| ID | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| EXT-MVP02-1 | P2 blocking | `quoteTow()` validated the tariff with the coarse MVP-01 `validatePricing`, then called the provider, and only `computeTowPrice` rejected values the coarse validator accepted (`included_km = 1.0001`, `minimum_charge_cents = 2 ** 53`, `price_per_additional_km_cents = 2 ** 53`). An invalid **local** tariff could therefore consume a billable Google call before the local `validation_error`. | **FIXED** — one shared strict normalization primitive; tariff fully validated/normalized before `computeRoute`; provider-call-count tests added |
| EXT-MVP02-2 | P3 | The duration regex `^(\d+(?:\.\d+)?)s$` accepted `900.1234567890s` (10 fractional digits); the protobuf Duration contract allows at most 9. | **FIXED** — parser accepts whole seconds or 1..9 fractional digits, for the string and the numeric form |
| EXT-MVP02-3 | P3 | Documentation wording equivalent to "No key in the repo" understated the pre-existing browser/admin Maps-key fallback. | **CORRECTED** — exact mandated wording in `01-current-state-delta.md`, `02-google-routes-contract.md` and `MVP-02-WORK-RESULT.md`; no key was fixed, rotated or touched; #31 untouched |

## 2. EXT-MVP02-1 — fix design

### 2.1 One shared primitive

`src/modules/tow/domain/pricing.js` gains the pure, frozen
`normalizeTowPricingForQuote(pricing)`, which validates **everything the price computation
consumes** and returns the normalized shape:

```js
{
  minimum_charge_cents,            // non-negative SAFE integer
  included_km,                     // original DECIMAL(10,3) value (number|string), validated
  included_meters,                 // exact safe integer, via the existing toIncludedMeters
  price_per_additional_km_cents,   // non-negative SAFE integer
}
```

- `minimum_charge_cents` / `price_per_additional_km_cents` go through
  `requireSafeNonNegativeInteger`, so `2 ** 53` (and `2 ** 53 - 1 + 0.5`, floats, negatives,
  strings) are rejected.
- `included_km` goes through the existing exact `toIncludedMeters`, which rejects more than
  three significant decimals (`1.0001`), negatives, non-finite values and meter overflow — the
  same DECIMAL(10,3) gate the persisted column requires. **No fake route distance is used to
  validate the tariff.**
- The result is `Object.freeze`d, so the snapshot cannot drift.

`computeTowPrice` now consumes the **same** primitive (`normalizeTowPricingForQuote(pricing)`)
instead of validating the fields itself, so the pre-provider rules and the pricing rules are one
implementation and cannot drift. MVP-01 `validatePricing` is byte-unchanged in behaviour and
keeps its existing callers (`tow-vehicle.js`, MVP-01 tests).

### 2.2 Ordering in `quoteTow`

`application/quote-service.js`:

```text
validateGeoPoint(provider) -> validateGeoPoint(pickup) -> validateGeoPoint(destination)
  -> resolveTariff()  [explicit tariff OR repository-resolved vehicle pricing]
       -> normalizeTowPricingForQuote(...)   <-- strict, shared
  -> routeProvider.computeRoute(...)         <-- only after the tariff is fully valid
  -> createRouteQuote(...) -> computeTowPrice(...)   [same primitive again]
```

Both tariff sources (explicit `tariff` and `vehicleRepository.findByPartnerAndId(...).pricing`)
use the strict primitive; `included_meters` in the frozen `pricing_snapshot` now comes from the
pre-provider normalization.

## 3. EXT-MVP02-1 — RED tests (application level, provider call count)

Added to `tests/tow/mvp02/towQuoteService.test.js` (describe
`EXT-MVP02-1 — strict tariff normalization happens before the provider is called`):

| Test | Assertion |
| --- | --- |
| `included_km = 1.0001` | `validation_error` **and** `routeProvider.callCount('computeRoute') === 0` |
| `minimum_charge_cents = 2 ** 53` | `validation_error` **and** call count `0` |
| `price_per_additional_km_cents = 2 ** 53` | `validation_error` **and** call count `0` |
| valid tariff | provider called **exactly once**, price R$184,80 |
| `included_km = '2.007'` (DECIMAL string) | one provider call; snapshot `included_meters = 2007` exactly |
| repository vehicle pricing `included_km = 1.0001` | `validation_error`, call count `0` |
| repository vehicle pricing `minimum_charge_cents = 2 ** 53` | `validation_error`, call count `0` |

RED before the fix — `14a-ext-red-before-fix.txt`:

```text
Test Suites: 2 failed, 2 total
Tests:       10 failed, 104 passed, 114 total
```

The three required provider-call-count tests failed with `Expected: 0 / Received: 1`, i.e. the
provider had already been called for a tariff the computation rejects. All 25 new tests (7
application + 18 adapter) are GREEN after the fix; every pre-existing pricing test is retained
and unchanged.

## 4. EXT-MVP02-2 — fix design and tests

`adapters/routes/google-routes-adapter.js` now parses duration with
`^(\d+)(?:\.(\d{1,9}))?s$` (string form) and the same 1..9-fraction bound on the decimal text
of the numeric form. Whole seconds and 1..9 fractional digits are accepted; ten fractional
digits, negative values, missing units and unparseable values are `malformed_response`. The
half-up rounding rule is unchanged (`900.123456789s -> 900`, `900.523456789s -> 901`).

Focused tests were added to `tests/tow/mvp02/towGoogleRoutesAdapter.test.js` (describe
`EXT-MVP02-2 — duration accepts at most nine fractional digits`): `900s`, `900.1s`,
`900.123456789s`, `900.523456789s`, `900.999999999s` accepted; `900.1234567890s`,
`900.5999999999s`, `-5s`, `soon`, `.5s`, `900` rejected; numeric `900`, `900.1`,
`900.123456789`, `900.523456789` accepted; numeric `900.1234567891`, `0.1 + 0.2` and `-5`
rejected. Before the fix 4 of these were RED (`14a-ext-red-before-fix.txt`). Price depends on
meters, not duration — no pricing change.

## 5. EXT-MVP02-3 — documentation wording correction

The mandated wording is now present verbatim in:

- `docs/evidence/mvp-02/01-current-state-delta.md` (§2, after the credential decision)
- `docs/evidence/mvp-02/02-google-routes-contract.md` (§6 Key hygiene)
- `docs/evidence/mvp-02/MVP-02-WORK-RESULT.md` (Key Hygiene)

> MVP-02 introduces no committed `GOOGLE_ROUTES_API_KEY` or server-side Routes credential. The
> pre-existing browser/admin Maps-key fallback is outside MVP-02 and remains deferred to #31.

The per-file env findings were re-scoped to say what they actually measured (a specific env
file carried no Google key before MVP-02), and the claims "no Google key of any kind" / "no key
literal is committed anywhere" were removed. No key was fixed, rotated, deleted or otherwise
touched; #31 was not touched.

## 6. Mandatory negative control — bypass the strict normalization (NC-7)

Mutation: in `src/modules/tow/application/quote-service.js`, `resolveTariff` was temporarily
changed to call the coarse MVP-01 `validatePricing` (the exact pre-fix ordering defect) while
`computeTowPrice` kept the strict primitive:

```diff
-  normalizeTowPricingForQuote,
+  validatePricing, // NC-7 mutation: coarse MVP-01 validator bypasses strict normalization
@@ resolveTariff
-      return normalizeTowPricingForQuote(input.tariff);
+      return validatePricing(input.tariff); // NC-7 mutation
@@ resolveTariff
-    return normalizeTowPricingForQuote(vehicle.pricing);
+    return validatePricing(vehicle.pricing); // NC-7 mutation
```

| State | sha256 of `quote-service.js` | `npx jest tests/tow/mvp02/towQuoteService.test.js --runInBand -t "EXT-MVP02-1"` | Evidence |
| --- | --- | --- | --- |
| 1. strict normalization (fixed) | `d05c27418e8b1e4ecca67636864ef785bfc98ab040a99c5c887978fcb9fec1c9` | **GREEN** — 7 passed / 31 skipped | `14c-negative-control-green.txt` |
| 2. mutation (bypass) | `941caf756184b486b146f9e29cc26087101ad192067875a927c6e07f7d797742` | **RED** — 6 failed / 1 passed / 31 skipped; all three required provider-call-count tests among the failures | `14b-negative-control-red.txt` |
| 3. restored (byte-identical) | `d05c27418e8b1e4ecca67636864ef785bfc98ab040a99c5c887978fcb9fec1c9` | **GREEN** — 7 passed / 31 skipped | `14c-negative-control-green.txt` |

State 3's sha256 is identical to state 1's (`diff` of the two hash captures exits 0), so the
restore is byte-identical, not merely behaviourally equivalent. The mutation diff is recorded in
`14b-negative-control-red.txt` (header) and in this section.

## 7. Gates (post-fix)

| Command | Exit | Summary | Evidence |
| --- | --- | --- | --- |
| `npm run validate:openapi` | 0 | PASS | `14-openapi.txt` |
| `npm run test:contract` | 0 | 5 suites / 62 tests PASS | `14-contract.txt` |
| `npm run verify:tow` | 0 | GREEN, all stages incl. disposable PostgreSQL; teardown performed | `14-verify-tow.txt` |
| `npx jest tests/tow/mvp01 --runInBand` | 0 | 13 passed / 2 skipped suites · 123 passed / 10 skipped (unchanged) | `14-mvp01.txt` |
| `npx jest tests/tow/mvp02 --runInBand` | 0 | 5 suites · 204 passed / 204 (was 179; +25 new tests) | `14-mvp02.txt` |
| `npx jest tests/tow --runInBand` | 0 | 34 passed / 5 skipped suites · 678 passed / 58 skipped / 0 failures (was 653) | `14-tow.txt` |
| `npm run test:db-baseline` | 0 | GREEN, fingerprint `37cee47edc8dd1084786ab5fe3c32511c71b9a4a2788f67406391916c7cc0f59` unchanged | `14-db-baseline.txt` |
| `npx jest --runInBand` (full) | 0 | 67 passed / 5 skipped suites · 1102 passed / 58 skipped / 0 failures (was 1077) | `14-full-jest.txt` |

- Schema fingerprint: `37cee47edc8dd1084786ab5fe3c32511c71b9a4a2788f67406391916c7cc0f59` (unchanged).
- No new migration (`003_mvp01_tow_foundation.js` remains the latest).
- No OpenAPI/contract source change; no public HTTP endpoint.
- Default suites make no real Google call (stub `httpClient` only); no `.only` / hidden `.skip`
  / relaxed assertions were added.

## 8. Preservation checklist

- Routes v2 `POST /directions/v2:computeRoutes`, explicit non-wildcard field mask,
  non-`via` intermediate pickup, `legs[0]`/`legs[1]`, road meters as the only distance authority,
  no Haversine/line-of-sight/estimate fallback — untouched.
- Frozen pricing formula with BigInt/rational arithmetic, safe-integer guards, no `ceil` /
  whole-km billing; client-supplied distance/total/price/polyline still ignored; quote snapshot
  still deeply immutable and serializable.
- MVP-01 `validatePricing` behaviour and all MVP-01 gates unchanged.
- No migration, no OpenAPI change, no HTTP endpoint, no TowRequest/matching/proposal/assignment/
  tracking/payment/MVP-03/#33/#31/production scope.
