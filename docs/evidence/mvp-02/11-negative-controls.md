# MVP-02 — negative controls (mutation test)

Baseline: `npx jest tests/tow/mvp02 --runInBand` is **179 passed / 179, 0 failed**.
Each row mutates one guarantee, re-runs the same command, and restores the file.
A row is a valid control only if the suite goes RED and names the tests that own the rule.

## NC-1 — money is rounded HALF_UP on exact integers, never by float ceil

- file: `src/modules/tow/domain/pricing.js`
- mutation: `return BigInt(Math.ceil(Number(numerator) / Number(denominator)));`
- suite after mutation: **2 failed, 177 passed, 179 total** (2 failed, 3 passed, 5 total)
- detected: **YES — RED**
- restored byte-for-byte: **YES**
- tests that caught it:
  - MVP-02 UNIT — authoritative pricing policy › ROUND_HALF_UP at the monetary boundary › below the half cent rounds down
  - MVP-02 ARCH — pricing and distance policies › the pricing policy never uses ceil or whole-kilometre billing

## NC-2 — included_km is converted to meters without binary float drift

- file: `src/modules/tow/domain/pricing.js`
- mutation: `const excessMeters = Math.max(0, totalDistance - Number(includedKm) * 1000);`
- suite after mutation: **2 failed, 177 passed, 179 total** (1 failed, 4 passed, 5 total)
- detected: **YES — RED**
- restored byte-for-byte: **YES**
- tests that caught it:
  - MVP-02 UNIT — authoritative pricing policy › binary floating-point must never be the monetary source of truth › included_km = 2.007 with a 1 meter excess at R$15,00/km is exactly 2 cents
  - MVP-02 UNIT — authoritative pricing policy › binary floating-point must never be the monetary source of truth › the same 2.007 km tariff stays exact across a range of excesses

## NC-3 — an unexpected provider leg count fails closed

- file: `src/modules/tow/adapters/routes/google-routes-adapter.js`
- mutation: `if (!Array.isArray(route.legs) || route.legs.length === 0) {`
- suite after mutation: **3 failed, 176 passed, 179 total** (1 failed, 4 passed, 5 total)
- detected: **YES — RED**
- restored byte-for-byte: **YES**
- tests that caught it:
  - MVP-02 UNIT — Google Routes adapter › single-leg mode (no pickup supplied) › an unexpected extra leg in single-leg mode is a malformed_response failure
  - MVP-02 UNIT — Google Routes adapter › leg boundaries are never guessed › only one leg for a pickup route is a malformed_response failure
  - MVP-02 UNIT — Google Routes adapter › leg boundaries are never guessed › three legs for a pickup route is a malformed_response failure

## NC-4 — a provider failure never leaks transport detail to the caller

- file: `src/modules/tow/application/quote-service.js`
- mutation: `} catch (error) {`
- suite after mutation: **8 failed, 171 passed, 179 total** (2 failed, 3 passed, 5 total)
- detected: **YES — RED**
- restored byte-for-byte: **YES**
- tests that caught it:
  - MVP-02 ARCH — composition root › an unconfigured key surfaces as external_dependency_unavailable, never as a crash or a price
  - MVP-02 UNIT — quoteTow application operation › no Haversine, no estimate, no fallback › a provider failure becomes external_dependency_unavailable with no price
  - MVP-02 UNIT — quoteTow application operation › no Haversine, no estimate, no fallback › the canonical error carries the contract http status and leaks no provider internals
  - MVP-02 UNIT — quoteTow application operation › no Haversine, no estimate, no fallback › a failing provider never produces an estimated or Haversine-derived price
  - MVP-02 UNIT — quoteTow application operation › no Haversine, no estimate, no fallback › a provider returning a malformed route (negative distance) is external_dependency_unavailable
  - MVP-02 UNIT — quoteTow application operation › no Haversine, no estimate, no fallback › a provider returning a malformed route (fractional distance) is external_dependency_unavailable
  - MVP-02 UNIT — quoteTow application operation › no Haversine, no estimate, no fallback › a provider returning a malformed route (missing leg) is external_dependency_unavailable
  - MVP-02 UNIT — quoteTow application operation › no Haversine, no estimate, no fallback › a provider returning a malformed route (non-object payload) is external_dependency_unavailable

## NC-5 — the adapter uses the server-side Routes key, never the browser Maps key

- file: `src/modules/tow/adapters/routes/google-routes-adapter.js`
- mutation: `const apiKey = options.apiKey !== undefined ? options.apiKey : process.env.GOOGLE_MAPS_API_KEY;`
- suite after mutation: **1 failed, 178 passed, 179 total** (1 failed, 4 passed, 5 total)
- detected: **YES — RED**
- restored byte-for-byte: **YES**
- tests that caught it:
  - MVP-02 ARCH — test hygiene › the browser-exposed Maps key is never reused as the server-side Routes key

## NC-6 — configuration is read lazily, never frozen at module load

- file: `src/modules/tow/composition.js`
- mutation: `const GOOGLE_ROUTES_KEY = process.env.GOOGLE_ROUTES_API_KEY;`
- suite after mutation: **1 failed, 178 passed, 179 total** (1 failed, 4 passed, 5 total)
- detected: **YES — RED**
- restored byte-for-byte: **YES**
- tests that caught it:
  - MVP-02 ARCH — composition root › the composition root reads the key lazily, never at module load

## Verdict

ALL NEGATIVE CONTROLS DETECTED — every mutated guarantee is owned by a test that fails without it.
