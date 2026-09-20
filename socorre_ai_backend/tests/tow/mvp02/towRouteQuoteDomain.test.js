/**
 * MVP-02 — UNIT suite for the pure route-quote value object and geo validation.
 *
 * The route quote is the immutable, serializable snapshot MVP-04 will freeze
 * into a proposal, so:
 *   - the total distance is the EXACT sum of the two legs (never re-derived);
 *   - legs are validated as non-negative safe integers in meters/seconds;
 *   - the value object is deeply frozen and JSON-serializable;
 *   - coordinates are validated before any provider call is attempted.
 *
 * RED-first: written before `domain/route.js` and `domain/geo.js` exist.
 */
'use strict';

const { createRouteQuote } = require('../../../src/modules/tow/domain/route');
const { validateGeoPoint } = require('../../../src/modules/tow/domain/geo');
const { TowError } = require('../../../src/modules/tow/domain/errors');

function leg(distanceMeters, durationSeconds) {
  return { distance_meters: distanceMeters, duration_seconds: durationSeconds };
}

describe('MVP-02 UNIT — route quote value object', () => {
  test('sums the two legs exactly', () => {
    const quote = createRouteQuote({
      provider_to_pickup: leg(7000, 900),
      pickup_to_destination: leg(7350, 1200),
      encoded_polyline: 'abc123',
    });
    expect(quote).toEqual({
      provider_to_pickup: { distance_meters: 7000, duration_seconds: 900 },
      pickup_to_destination: { distance_meters: 7350, duration_seconds: 1200 },
      total_distance_meters: 14350,
      total_duration_seconds: 2100,
      encoded_polyline: 'abc123',
    });
  });

  test('the total is the exact sum, never a re-derived or rounded value', () => {
    const quote = createRouteQuote({
      provider_to_pickup: leg(1, 1),
      pickup_to_destination: leg(999999, 3),
    });
    expect(quote.total_distance_meters).toBe(1000000);
    expect(quote.total_duration_seconds).toBe(4);
  });

  test('accepts a single destination leg (no pickup leg) and reports a null provider leg', () => {
    const quote = createRouteQuote({ pickup_to_destination: leg(8400, 1320) });
    expect(quote.provider_to_pickup).toBeNull();
    expect(quote.pickup_to_destination).toEqual({ distance_meters: 8400, duration_seconds: 1320 });
    expect(quote.total_distance_meters).toBe(8400);
  });

  test('preserves a null polyline when Google returns no geometry', () => {
    const quote = createRouteQuote({ pickup_to_destination: leg(8400, 1320), encoded_polyline: null });
    expect(quote.encoded_polyline).toBeNull();
  });

  test('the quote and both legs are deeply frozen', () => {
    const quote = createRouteQuote({
      provider_to_pickup: leg(7000, 900),
      pickup_to_destination: leg(7350, 1200),
      encoded_polyline: 'abc',
    });
    expect(Object.isFrozen(quote)).toBe(true);
    expect(Object.isFrozen(quote.provider_to_pickup)).toBe(true);
    expect(Object.isFrozen(quote.pickup_to_destination)).toBe(true);
  });

  test('is JSON-serializable and survives a round trip unchanged', () => {
    const quote = createRouteQuote({
      provider_to_pickup: leg(7000, 900),
      pickup_to_destination: leg(7350, 1200),
      encoded_polyline: 'abc',
    });
    expect(JSON.parse(JSON.stringify(quote))).toEqual({ ...quote });
  });

  test('rejects a quote with no leg at all', () => {
    expect(() => createRouteQuote({})).toThrow(TowError);
    expect(() => createRouteQuote({ encoded_polyline: 'abc' })).toThrow(/at least one leg/);
  });

  test('rejects malformed, negative, fractional or unsafe leg values', () => {
    const invalid = [
      leg(-1, 10),
      leg(10, -1),
      leg(1.5, 10),
      leg(10, 1.5),
      leg(Number.MAX_SAFE_INTEGER + 1, 10),
      leg(10, Number.MAX_SAFE_INTEGER + 1),
      leg(Number.NaN, 10),
      leg(10, Infinity),
      { distance_meters: '10', duration_seconds: 10 },
      { duration_seconds: 10 },
      null,
      'not-a-leg',
      [],
    ];
    for (const value of invalid) {
      expect(() => createRouteQuote({ pickup_to_destination: value })).toThrow(TowError);
    }
  });

  test('rejects an overflowing total even when each leg is individually safe', () => {
    expect(() => createRouteQuote({
      provider_to_pickup: leg(Number.MAX_SAFE_INTEGER, 0),
      pickup_to_destination: leg(Number.MAX_SAFE_INTEGER, 0),
    })).toThrow(/overflow|safe/i);
  });

  test('rejects a non-string, non-null polyline', () => {
    for (const value of [42, {}, [], true]) {
      expect(() => createRouteQuote({ pickup_to_destination: leg(10, 10), encoded_polyline: value })).toThrow(TowError);
    }
  });
});

describe('MVP-02 UNIT — geo coordinate validation', () => {
  test('normalizes a valid coordinate pair', () => {
    expect(validateGeoPoint({ latitude: -23.561684, longitude: -46.655981 }, 'provider')).toEqual({
      latitude: -23.561684,
      longitude: -46.655981,
    });
  });

  test('accepts the extreme legal bounds', () => {
    expect(validateGeoPoint({ latitude: 90, longitude: 180 })).toEqual({ latitude: 90, longitude: 180 });
    expect(validateGeoPoint({ latitude: -90, longitude: -180 })).toEqual({ latitude: -90, longitude: -180 });
    expect(validateGeoPoint({ latitude: 0, longitude: 0 })).toEqual({ latitude: 0, longitude: 0 });
  });

  test('returns a frozen value so the caller cannot mutate a validated point', () => {
    expect(Object.isFrozen(validateGeoPoint({ latitude: 1, longitude: 2 }))).toBe(true);
  });

  test('rejects out-of-range latitudes and longitudes as validation_error', () => {
    for (const point of [
      { latitude: 90.0001, longitude: 0 },
      { latitude: -90.0001, longitude: 0 },
      { latitude: 0, longitude: 180.0001 },
      { latitude: 0, longitude: -180.0001 },
    ]) {
      expect(() => validateGeoPoint(point, 'pickup')).toThrow(TowError);
      try {
        validateGeoPoint(point, 'pickup');
      } catch (error) {
        expect(error.code).toBe('validation_error');
        expect(error.details).toMatchObject({ field: expect.stringContaining('pickup') });
      }
    }
  });

  test('rejects non-finite and non-numeric coordinates', () => {
    for (const point of [
      { latitude: Number.NaN, longitude: 0 },
      { latitude: 0, longitude: Number.NaN },
      { latitude: Infinity, longitude: 0 },
      { latitude: 0, longitude: -Infinity },
      { latitude: '10', longitude: 20 },
      { latitude: 10, longitude: '20' },
      { latitude: null, longitude: 0 },
      { longitude: 0 },
      { latitude: 0 },
    ]) {
      expect(() => validateGeoPoint(point)).toThrow(TowError);
    }
  });

  test('rejects a missing or non-object point', () => {
    for (const value of [null, undefined, 'x', 42, [], true]) {
      expect(() => validateGeoPoint(value, 'destination')).toThrow(TowError);
    }
  });

  test('a malformed coordinate is a validation_error, never an external dependency error', () => {
    try {
      validateGeoPoint({ latitude: 999, longitude: 0 });
      throw new Error('expected validateGeoPoint to throw');
    } catch (error) {
      expect(error.code).toBe('validation_error');
      expect(error.httpStatus).toBe(422);
    }
  });
});
