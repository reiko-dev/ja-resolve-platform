# MVP-02 — Muse adversarial review (Google Routes & Authoritative Tow Pricing)

```text
verdict: APPROVE
reviewed_head: 2062953c
implementation_head: 827cbaf0
reviewer: Muse Sparks 1.3 Free
scope: MVP-02 / Issue #14
findings: none
```

## Summary

All 19 adversarial checks pass against the frozen head. Pricing is BigInt-exact with proven `ROUND_HALF_UP`
(half-cent below/exact/above probed live), decimal-exact `included_km`, frozen snapshots, and fail-closed
provider mapping. The adapter matches the official Routes v2 contract with a non-wildcard mask, non-`via`
pickup, hard `malformed_response` on leg-count mismatch, bounded timeout, and sanitized errors. All regression
gates re-run GREEN with the DB fingerprint unchanged.

## Pricing checks

- **no_ceil**: PASS — `rg ceil` over pricing/route/quote/adapter sources returns NO MATCH. The sole
  `Math.ceil` in the tow module is pre-existing MVP-01 pagination (`http/document-controller.js:13`), unrelated
  to money/distance.
- **leg_sum**: PASS — `createRouteQuote` sums via `addSafeIntegers`; live probe 7000+7350=14350 exactly.
- **half_up_exact**: PASS — `roundHalfUpDivide(n,d)=(2n+d)/2d`, money-only rounding. Live: 5m@100c/km=0.5c→1,
  4m→0, 6m→1, 15m→2, 25m→3, 1m@800c/km=0.8c→1. Distance never rounded.
- **float_drift_and_included_km**: PASS — `toIncludedMeters` parses decimal text with BigInt; `2.007`→2007
  exact; `0.1`→100, `1.001`→1001, `9.999`→9999, `10.000`→10000; >3dp rejected; 1e21 overflow rejected.
  Contract case 14350m/10km/800c → variable 3480 / final 18480 (R$34.80); 4.350 km excess → R$34.80, not R$40.00.
- **snapshot_immutability**: PASS — quote freezes primitive copies; live: quote with tariff A, then tariff B →
  first quote still A, frozen objects.
- **no_estimate_on_provider_failure**: PASS — provider error discarded, generic
  `external_dependency_unavailable`/503 with no details and no price; client-supplied distance/price ignored.

## Adapter checks

- **routes_api_shape_and_field_mask**: PASS — POST `https://routes.googleapis.com/directions/v2:computeRoutes`,
  mask `routes.legs.distanceMeters,routes.legs.duration,routes.polyline.encodedPolyline` (no wildcard),
  `X-Goog-Api-Key` header.
- **two_legs_and_malformed**: PASS — pickup as single non-`via` intermediate; expected legs = pickup?2:1;
  mismatch → `malformed_response`; empty routes → `empty_route`. No ratio split, no straight-line fallback.
- **duration_polyline**: PASS — protobuf Duration parsed digit-exact, half-up via first fraction digit, no
  float (`165s`→165, `900.5s`→901, `0.4s`→0, `0.5s`→1); missing/unusable polyline → null, quote succeeds.
- **timeout**: PASS — `DEFAULT_TIMEOUT_MS=8000`, validated, passed to the injected httpClient;
  `ECONNABORTED/ETIMEDOUT/ERR_CANCELED` → `timeout`; no sleeps in tests.
- **error_sanitization_and_key**: PASS — generic messages, details only safe scalars (`{status:400}`); no key,
  raw payload or stack; key resolved per call, sent only as a header, never logged.
- **no_haversine**: PASS — `rg 6371|haversine\(|toRadians|Math.acos` finds only prohibitive comments; boundary
  test enforces the pattern.

## Architecture / scope checks

- **purity_and_port**: PASS — domain/application import no axios/google/express/knex/fs; axios only in the
  adapter; `composition.js` wires adapter + quote service.
- **substitutability**: PASS — provider-neutral port typedef; fake replays payload/records calls with no
  pricing; boundary suite proves fake↔real interchangeability with identical quote output.
- **no_http_endpoint_no_migration_no_openapi_change**: PASS — no quote route; migrations end at
  `003_mvp01_tow_foundation.js`; zero openapi/contract/spec source changes.
- **scope**: PASS — no TowRequest/proposal/assignment/tracking/payment strings in new production files; env
  examples document only the server-side `GOOGLE_ROUTES_API_KEY`. No MVP-03/#33/#31/production scope.

## Regression (live)

- `tests/tow/mvp02` → 5 suites, **179/179**.
- `tests/tow/mvp01` → 13 passed/2 skipped suites; **123 passed / 10 skipped**.
- `tests/tow` → 34 passed/5 skipped suites; **653 passed / 58 skipped**.
- `npx jest --runInBand` → 67 passed/5 skipped suites; **1077 passed / 58 skipped / 0 failures**.
- `validate:openapi` PASS · contract 5 suites/62 PASS · `verify:tow` GREEN (incl. PG foundation).
- `test:db-baseline` GREEN, fingerprint `37cee47edc8dd1084786ab5fe3c32511c71b9a4a2788f67406391916c7cc0f59`
  on both runs (UNCHANGED). Worktree clean.
- No `.only`/`.skip`/sleeps in mvp02 tests; adapter tests use an injected fake httpClient (no network).

## Findings

None — no P0/P1/P2/P3 defects found. (The single `Math.ceil` in `document-controller.js:13` is pre-existing
MVP-01 pagination, out of pricing scope.)

## Unverified or risky (non-blocking)

- Real-network behavior against Google (key validity, `TRAFFIC_AWARE` variance, quota/4xx mapping beyond status
  passthrough) was not exercised — the suite is hermetic by design; an explicit opt-in smoke test is
  recommended pre-production.
- Duration strings with >9 fractional digits or negative durations are rejected as malformed (matches the
  documented Google protobuf Duration range but unexercised against live traffic).

## Verdict

**APPROVE** — P0 = 0, P1 = 0, P2 = 0, P3 = 0; `findings: none`.
