# MVP-02 — Targeted Muse re-review (external findings EXT-MVP02-1/2/3)

```text
verdict: APPROVE
reviewed_head: c94ea702
implementation_head: e04e9b94
reviewer: Muse Sparks 1.3 Free
prior: external review CHANGES_REQUIRED (P0=0, P1=0, P2 blocking=1, P3=2) on head fd55ffd7
scope: MVP-02 / Issue #14 — external correction pass
```

## Summary

All three external findings verify as fixed by live falsification, not by summary trust. The shared strict
primitive, duration bound, and mandated wording each hold, and every preservation guarantee plus every live
gate (mvp02 204, mvp01 green, tow 678, full jest 1102, openapi/contract/db-baseline/verify:tow GREEN,
fingerprint intact) confirms no regression.

## External finding checks

| id | status | evidence |
|---|---|---|
| EXT-MVP02-1 | **FIXED** | Single pure `normalizeTowPricingForQuote` (`domain/pricing.js:165`) validates safe-integer cents, reuses the exact `toIncludedMeters` DECIMAL(10,3) gate and returns a frozen normalized tariff; both `computeTowPrice` and `quote-service.resolveTariff` (explicit + repository paths) call it (zero `validatePricing` refs left in quote-service). `quoteTow` order: coords → `resolveTariff` → `computeRoute`. Live counting provider: `included_km=1.0001`, `minimum_charge_cents=2**53`, `price_per_additional_km_cents=2**53` → `validation_error` with **0 calls**; valid tariff → exactly 1 call. `validatePricing` body byte-unchanged and still coarse (live proof the pre-fix hole was real). Negative control: bypass → 6 failed RED; restore sha256 `d05c2741…` identical → 7 passed GREEN. |
| EXT-MVP02-2 | **FIXED** | `SECONDS_STRING_PATTERN`/`SECONDS_DECIMAL_PATTERN` (`\d{1,9}`) gate both forms; live: `900s`/`900.1s`/`900.123456789s` OK; `900.1234567890s`/`-5s`/`soon`/numeric over-9-digits → `malformed_response`; price unaffected (meters-only formula). Focused `test.each` blocks exist. |
| EXT-MVP02-3 | **FIXED** | Mandated sentence verbatim in `01-current-state-delta.md:58`, `02-google-routes-contract.md:131`, `MVP-02-WORK-RESULT.md:202`; absolute whole-repo "no key" claims removed/scoped; the pre-existing browser/admin Maps-key fallback is explicitly out-of-scope and deferred to #31; #31 untouched. |

## Preservation checks

- **pricing_formula_and_no_ceil**: decimal-exact included meters via BigInt, `ROUND_HALF_UP`, `final = minimum + variable`, safe-integer guards; zero `ceil`/whole-km billing in the pricing path.
- **adapter_shape_and_no_haversine**: `POST …/directions/v2:computeRoutes`, explicit mask, single non-`via` intermediate, `legs[0]`/`legs[1]`, road-meters-only parsing, no Haversine/line-of-sight/estimate in `src/modules/tow/`.
- **snapshot_immutability_and_quote_authority**: frozen quote/tariff/price/legs; client distance/price ignored; provider failure → `external_dependency_unavailable` with the original error discarded.
- **scope_no_migration_no_openapi**: non-docs diff = 3 src + 2 test files; `database/` untouched; no OpenAPI change; no `.only`/`.skip`; default suite uses a stub `httpClient` (no real Google call).

## Findings

| id | severity | location | evidence | required_fix |
|---|---|---|---|---|
| MP2X-1 | P3 | harness only (`scripts/tow/pg-guard.js:53` default port 55432) | On this shared host, `verify:tow`/`test:db-baseline` went RED on the default port because an unrelated container already binds `0.0.0.0:55432`; both GREEN with `DB_PORT=55433` (fingerprint identical). | None for this review (informational); optionally document the `DB_PORT` override for shared hosts. |

## Regression (live)

- `tests/tow/mvp02` → 5 suites, **204 passed**
- `tests/tow/mvp01` → 13 passed/2 skipped suites, **123 passed / 10 skipped** (untouched)
- `tests/tow` → 34 passed suites, **678 passed / 58 skipped**
- `npx jest --runInBand` → 67 passed suites, **1102 passed / 58 skipped**
- `validate:openapi` exit 0 · contract 5 suites/62 · `DB_PORT=55433 test:db-baseline` GREEN with fingerprint
  `37cee47edc8dd1084786ab5fe3c32511c71b9a4a2788f67406391916c7cc0f59` identical ×2 · `verify:tow` GREEN
- Negative control: bypass → 6 failed RED; restore sha256 identical → 7 passed GREEN; tree clean.

## Verified claims

- shared primitive backs `computeTowPrice` + `resolveTariff` (explicit + repo) → CONFIRMED
- ordering coords → full tariff normalization → `computeRoute`, 0 provider calls on invalid tariff → CONFIRMED
- duration bound 9 digits both forms, price unaffected → CONFIRMED
- mandated sentence present, no whole-repo no-key claim, #31 untouched → CONFIRMED
- fingerprint intact, no migration, no OpenAPI change, no `.only`/hidden `.skip`, no real Google call → CONFIRMED

## Unverified or risky

None material; only the harness-only shared-host port-collision note (MP2X-1, P3).

## Verdict

**APPROVE** — P0 = 0, P1 = 0, P2 = 0, P3 = 1 (`MP2X-1`, harness-only, accepted).
