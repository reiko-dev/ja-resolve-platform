# JaResolve Tow — Pricing Contract

> Status: **normative / frozen for implementation**  
> Scope: Tow initial proposal pricing  
> Applies to: T03, T05, T07, T18 and all consumer representations of Tow price

## Decision

Tow pricing uses the **exact Google Routes road distance** represented by the authoritative route snapshot. The service **does not round an additional fractional kilometre up to the next whole kilometre**.

The former `ceil(excess_km)` rule is superseded by this document.

The reason for this contract is to keep price continuous and deterministic: an extra meter must not create the same price increase as an extra full kilometre, while the server remains the only authority for route and price.

## Authoritative route basis

```text
total_distance_meters =
  provider_to_pickup.distance_meters
  + pickup_to_destination.distance_meters
```

Both legs come from the backend `RouteProvider`/Google Routes adapter. Haversine or client-side route distance must not be used for pricing.

## Tariff snapshot

Each active TowVehicle has:

```text
minimum_charge_cents
included_km
price_per_additional_km_cents
```

`included_km` is a decimal configuration value and must be handled with decimal-safe arithmetic, never binary floating-point as a financial source of truth.

At proposal creation, the backend freezes:

- TowVehicle/tariff identity;
- `minimum_charge_cents`;
- `included_km`;
- `price_per_additional_km_cents`;
- route legs and `total_distance_meters`;
- calculated proposal price.

Later tariff edits or actual distance travelled do not mutate an existing proposal/agreement.

## Formula

Conceptually:

```text
included_meters = included_km * 1000

excess_meters = max(
  0,
  total_distance_meters - included_meters
)

variable_charge_cents =
  ROUND_HALF_UP(
    excess_meters
    * price_per_additional_km_cents
    / 1000
  )

calculated_price_cents =
  minimum_charge_cents
  + variable_charge_cents
```

Only the **monetary result** is rounded, to the nearest cent using `HALF_UP` semantics. Distance itself is not rounded to whole kilometres.

Implementation may use integer/rational arithmetic instead of decimal division. For positive values, an equivalent integer form is acceptable when its result is identical to `ROUND_HALF_UP`.

## Examples

### Inside included distance

```text
minimum_charge = R$ 150.00
included_km = 10
price_per_additional_km = R$ 8.00
route = 9.850 km

excess = 0
price = R$ 150.00
```

### Fractional excess

```text
minimum_charge = R$ 150.00
included_km = 10
price_per_additional_km = R$ 8.00
route = 14.350 km

excess = 4.350 km
variable = 4.350 * R$ 8.00 = R$ 34.80
price = R$ 184.80
```

The price is **not** R$ 190.00; there is no `ceil(4.350) = 5 km` billing rule.

### Cent rounding boundary

If the proportional variable calculation yields a fraction of one cent, the backend applies `ROUND_HALF_UP` once, at the monetary result boundary. Consumers never reproduce this calculation.

## Consumer contract

Mobile Cliente, Mobile Parceiro and Dashboard receive already-calculated integer-cent values from the backend/OpenAPI contract.

Consumers:

- may display route distance and the server price;
- must not calculate/recalculate Tow price;
- must not round route distance to infer price;
- must treat the accepted/counteroffered final price as immutable after agreement.

## Required TDD coverage

At minimum:

- route below `included_km` → minimum charge only;
- route exactly at included boundary;
- 1 meter above included boundary;
- fractional excess such as 4.350 km is charged proportionally;
- cent rounding below/at/above half-cent boundary;
- two route legs are summed before pricing;
- no binary floating-point drift in money;
- tariff snapshot remains immutable after vehicle pricing changes;
- client-supplied distance/price cannot override the backend calculation.

## Superseded wording

Any pre-freeze reference to:

```text
ceil(total_distance_km - included_km)
```

or to "quilômetro iniciado" being rounded upward is obsolete and must not be implemented.

This file is the authoritative pricing decision until an explicit contract revision changes it together with tests and affected documentation.