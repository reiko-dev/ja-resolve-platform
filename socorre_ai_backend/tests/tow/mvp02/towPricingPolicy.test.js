/**
 * MVP-02 — UNIT suite for the authoritative Tow pricing policy.
 *
 * Frozen contract: `docs/tow/TOW-PRICING-CONTRACT.md`.
 *
 *   total_distance_meters = provider_to_pickup + pickup_to_destination
 *   included_meters       = included_km * 1000        (decimal-safe)
 *   excess_meters         = max(0, total - included_meters)
 *   variable_charge_cents = ROUND_HALF_UP(excess_meters * price_per_additional_km_cents / 1000)
 *   final_price_cents     = minimum_charge_cents + variable_charge_cents
 *
 * The forbidden rule is `ceil(excess_km)` / whole-kilometre billing: an extra
 * meter must never cost the same as an extra kilometre.
 *
 * RED-first: written before `computeTowPrice` / `toIncludedMeters` exist.
 */
'use strict';

const {
  computeTowPrice,
  toIncludedMeters,
  validatePricing,
} = require('../../../src/modules/tow/domain/pricing');
const { TowError } = require('../../../src/modules/tow/domain/errors');

/** Tariff of the frozen contract example: R$150,00 minimum, 10 km included, R$8,00/km. */
function contractTariff(overrides = {}) {
  return {
    minimum_charge_cents: 15000,
    included_km: 10,
    price_per_additional_km_cents: 800,
    ...overrides,
  };
}

function priceFor(totalDistanceMeters, tariff = contractTariff()) {
  return computeTowPrice({ total_distance_meters: totalDistanceMeters, ...tariff });
}

describe('MVP-02 UNIT — authoritative pricing policy', () => {
  describe('included distance is converted decimal-safely', () => {
    test.each([
      [0, 0],
      [0.001, 1],
      [0.1, 100],
      [0.2, 200],
      [0.3, 300],
      [1.001, 1001],
      [2.007, 2007],
      [9.999, 9999],
      [10, 10000],
      [10.0, 10000],
      [123.456, 123456],
      [9999999.999, 9999999999],
    ])('included_km %p -> %p meters exactly', (includedKm, expectedMeters) => {
      expect(toIncludedMeters(includedKm)).toBe(expectedMeters);
    });

    test('accepts the DECIMAL(10,3) string form without drift', () => {
      expect(toIncludedMeters('0.100')).toBe(100);
      expect(toIncludedMeters('1.001')).toBe(1001);
      expect(toIncludedMeters('9.999')).toBe(9999);
      expect(toIncludedMeters('10.000')).toBe(10000);
    });

    test('rejects a value that is not representable in DECIMAL(10,3) instead of guessing', () => {
      // 0.1 + 0.2 === 0.30000000000000004 in binary floating point.
      expect(() => toIncludedMeters(0.1 + 0.2)).toThrow(TowError);
      expect(() => toIncludedMeters(0.1 + 0.2)).toThrow(/included_km/);
      expect(() => toIncludedMeters(1.0000001)).toThrow(TowError);
    });

    test('rejects negative, non-finite and non-numeric configuration', () => {
      for (const value of [-1, -0.001, Number.NaN, Infinity, -Infinity, 'abc', '', null, undefined, {}, []]) {
        expect(() => toIncludedMeters(value)).toThrow(TowError);
      }
    });
  });

  describe('excess distance boundaries', () => {
    test('below the included distance charges the minimum only', () => {
      const result = priceFor(9850);
      expect(result).toMatchObject({
        total_distance_meters: 9850,
        included_meters: 10000,
        excess_meters: 0,
        variable_charge_cents: 0,
        final_price_cents: 15000,
        currency: 'BRL',
      });
    });

    test('exactly at the included distance charges the minimum only', () => {
      expect(priceFor(10000)).toMatchObject({ excess_meters: 0, variable_charge_cents: 0, final_price_cents: 15000 });
    });

    test('one meter above the included distance is billed proportionally, not as a whole kilometre', () => {
      const result = priceFor(10001);
      expect(result).toMatchObject({ excess_meters: 1, variable_charge_cents: 1, final_price_cents: 15001 });
      // A whole-kilometre rule would have charged 15000 + 800 = 15800.
      expect(result.final_price_cents).not.toBe(15800);
    });

    test('one meter above a zero included distance is billed proportionally', () => {
      const result = priceFor(1, contractTariff({ included_km: 0 }));
      expect(result).toMatchObject({ included_meters: 0, excess_meters: 1, variable_charge_cents: 1 });
    });
  });

  describe('the frozen fractional-excess example', () => {
    test('14.350 km with 10 km included and R$8,00/km yields R$34,80 variable and R$184,80 total', () => {
      const result = priceFor(14350);
      expect(result).toMatchObject({
        included_meters: 10000,
        excess_meters: 4350,
        variable_charge_cents: 3480,
        final_price_cents: 18480,
      });
      // ceil(4.350) = 5 km would have produced 4000 + 15000 = 19000.
      expect(result.variable_charge_cents).not.toBe(4000);
      expect(result.final_price_cents).not.toBe(19000);
    });
  });

  describe('ROUND_HALF_UP at the monetary boundary', () => {
    // 1 excess meter at R$14,99/km -> 1.499 cents; R$15,00/km -> exactly 1.5; R$15,01/km -> 1.501.
    test('below the half cent rounds down', () => {
      expect(priceFor(10001, contractTariff({ price_per_additional_km_cents: 1499 })).variable_charge_cents).toBe(1);
    });

    test('exactly at the half cent rounds up', () => {
      expect(priceFor(10001, contractTariff({ price_per_additional_km_cents: 1500 })).variable_charge_cents).toBe(2);
    });

    test('above the half cent rounds up', () => {
      expect(priceFor(10001, contractTariff({ price_per_additional_km_cents: 1501 })).variable_charge_cents).toBe(2);
    });

    test('rounding is applied once, to the money value only — never to the distance', () => {
      const result = priceFor(10001, contractTariff({ price_per_additional_km_cents: 1499 }));
      expect(result.excess_meters).toBe(1);
      expect(result.included_meters).toBe(10000);
      expect(result.total_distance_meters).toBe(10001);
    });
  });

  describe('binary floating-point must never be the monetary source of truth', () => {
    test('included_km = 2.007 with a 1 meter excess at R$15,00/km is exactly 2 cents', () => {
      // Naive float arithmetic: 2.007 * 1000 === 2007.0000000000002, so
      // excess becomes 0.9999999999998 and the money rounds DOWN to 1 cent.
      const result = priceFor(2008, contractTariff({ included_km: 2.007, price_per_additional_km_cents: 1500 }));
      expect(result.included_meters).toBe(2007);
      expect(result.excess_meters).toBe(1);
      expect(result.variable_charge_cents).toBe(2);
    });

    test('the same 2.007 km tariff stays exact across a range of excesses', () => {
      const tariff = contractTariff({ included_km: 2.007, price_per_additional_km_cents: 1500 });
      expect(priceFor(2010, tariff).variable_charge_cents).toBe(5); // 3 m -> 4.5 c
      expect(priceFor(2012, tariff).variable_charge_cents).toBe(8); // 5 m -> 7.5 c
      expect(priceFor(2022, tariff).variable_charge_cents).toBe(23); // 15 m -> 22.5 c
    });

    test('every DECIMAL(10,3) boundary value converts to an exact integer meter count', () => {
      for (let thousandths = 0; thousandths <= 30000; thousandths += 1) {
        const includedKm = Number((thousandths / 1000).toFixed(3));
        expect(toIncludedMeters(includedKm)).toBe(thousandths);
      }
    });

    test('all returned money and distance values are integers', () => {
      const result = priceFor(14350);
      for (const key of ['total_distance_meters', 'included_meters', 'excess_meters', 'variable_charge_cents', 'final_price_cents']) {
        expect(Number.isInteger(result[key])).toBe(true);
      }
    });
  });

  describe('zero and large tariff values', () => {
    test('a zero tariff is valid and produces zero', () => {
      const result = priceFor(50000, {
        minimum_charge_cents: 0,
        included_km: 0,
        price_per_additional_km_cents: 0,
      });
      expect(result).toMatchObject({ excess_meters: 50000, variable_charge_cents: 0, final_price_cents: 0 });
    });

    test('a zero excess with a non-zero minimum is valid', () => {
      expect(priceFor(0, contractTariff({ minimum_charge_cents: 25000 })).final_price_cents).toBe(25000);
    });

    test('the largest valid DECIMAL(10,3) included distance is accepted', () => {
      const result = priceFor(9999999999, contractTariff({ included_km: 9999999.999 }));
      expect(result).toMatchObject({ included_meters: 9999999999, excess_meters: 0, final_price_cents: 15000 });
    });

    test('large but safe money values stay exact', () => {
      const result = priceFor(2000000, {
        minimum_charge_cents: 1000000,
        included_km: 1000,
        price_per_additional_km_cents: 1000000,
      });
      // excess 1,000,000 m at 1,000,000 cents/km = 1,000,000,000 cents.
      expect(result).toMatchObject({
        excess_meters: 1000000,
        variable_charge_cents: 1000000000,
        final_price_cents: 1001000000,
      });
    });
  });

  describe('overflow and unsafe integers are rejected, never silently truncated', () => {
    test('rejects an unsafe total distance', () => {
      expect(() => priceFor(Number.MAX_SAFE_INTEGER + 1)).toThrow(TowError);
      expect(() => priceFor(Number.MAX_SAFE_INTEGER + 1)).toThrow(/total_distance_meters/);
    });

    test('rejects a non-integer or negative total distance', () => {
      for (const value of [1.5, -1, Number.NaN, Infinity, '1000', null, undefined]) {
        expect(() => priceFor(value)).toThrow(TowError);
      }
    });

    test('rejects unsafe or invalid money configuration', () => {
      expect(() => priceFor(10001, contractTariff({ minimum_charge_cents: 2 ** 53 }))).toThrow(TowError);
      expect(() => priceFor(10001, contractTariff({ price_per_additional_km_cents: 2 ** 53 }))).toThrow(TowError);
      expect(() => priceFor(10001, contractTariff({ minimum_charge_cents: -1 }))).toThrow(TowError);
      expect(() => priceFor(10001, contractTariff({ price_per_additional_km_cents: 1.5 }))).toThrow(TowError);
    });

    test('rejects a variable charge that would exceed the safe integer range', () => {
      const overflow = () => priceFor(9999999999, {
        minimum_charge_cents: 0,
        included_km: 0,
        price_per_additional_km_cents: 9999999999,
      });
      expect(overflow).toThrow(TowError);
      expect(overflow).toThrow(/overflow|safe/i);
    });

    test('rejects a final price that would exceed the safe integer range', () => {
      expect(() => priceFor(2000, {
        minimum_charge_cents: Number.MAX_SAFE_INTEGER,
        included_km: 0,
        price_per_additional_km_cents: 1000,
      })).toThrow(TowError);
    });
  });

  describe('the result is an immutable value object', () => {
    test('the returned price is frozen and serializable', () => {
      const result = priceFor(14350);
      expect(Object.isFrozen(result)).toBe(true);
      expect(JSON.parse(JSON.stringify(result))).toEqual({ ...result });
    });

    test('mutating the caller tariff after the call does not change the result', () => {
      const tariff = contractTariff();
      const result = priceFor(14350, tariff);
      tariff.minimum_charge_cents = 1;
      tariff.included_km = 0;
      tariff.price_per_additional_km_cents = 1;
      expect(result.final_price_cents).toBe(18480);
    });
  });

  describe('MVP-01 tariff validation is preserved', () => {
    test('validatePricing still normalizes a valid tariff', () => {
      expect(validatePricing(contractTariff())).toEqual({
        minimum_charge_cents: 15000,
        included_km: 10,
        price_per_additional_km_cents: 800,
      });
    });

    test('validatePricing still rejects malformed tariffs', () => {
      expect(() => validatePricing(null)).toThrow(TowError);
      expect(() => validatePricing({ minimum_charge_cents: 1.5, included_km: 1, price_per_additional_km_cents: 1 })).toThrow(TowError);
      expect(() => validatePricing({ minimum_charge_cents: 1, included_km: -1, price_per_additional_km_cents: 1 })).toThrow(TowError);
      expect(() => validatePricing({ minimum_charge_cents: 1, included_km: 1, price_per_additional_km_cents: 'x' })).toThrow(TowError);
    });
  });
});
