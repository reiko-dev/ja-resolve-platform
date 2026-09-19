/**
 * MVP-01 — TowVehicle pricing value object (canonical units).
 * MVP-02 — authoritative pricing policy (TOW-PRICING-CONTRACT).
 *
 * Money is always integer cents; distance configuration uses `included_km` as
 * a decimal configuration value, never binary floating point as a financial
 * source of truth.
 *
 * The frozen formula, applied to the summed provider route:
 *
 *   included_meters       = included_km * 1000          (decimal-exact)
 *   excess_meters         = max(0, total_distance_meters - included_meters)
 *   variable_charge_cents = ROUND_HALF_UP(excess_meters * price_per_additional_km_cents / 1000)
 *   final_price_cents     = minimum_charge_cents + variable_charge_cents
 *
 * Billing is proportional to the exact excess distance. There is deliberately
 * no whole-kilometre rounding: a 4.350 km excess at R$8,00/km costs R$34,80,
 * never R$40,00.
 */
'use strict';

const { validationError } = require('./errors');
const { MAX_SAFE_INTEGER, requireSafeNonNegativeInteger } = require('./integers');

const METERS_PER_INCLUDED_KM = 1000n;
const MAX_SAFE_BIGINT = BigInt(MAX_SAFE_INTEGER);

function validatePricing(pricing) {
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) {
    throw validationError('pricing is required');
  }

  const { minimum_charge_cents, included_km, price_per_additional_km_cents } = pricing;

  if (!Number.isInteger(minimum_charge_cents) || minimum_charge_cents < 0) {
    throw validationError('minimum_charge_cents must be a non-negative integer', {
      field: 'pricing.minimum_charge_cents',
    });
  }
  if (typeof included_km !== 'number' || !Number.isFinite(included_km) || included_km < 0) {
    throw validationError('included_km must be a non-negative number', {
      field: 'pricing.included_km',
    });
  }
  if (!Number.isInteger(price_per_additional_km_cents) || price_per_additional_km_cents < 0) {
    throw validationError('price_per_additional_km_cents must be a non-negative integer', {
      field: 'pricing.price_per_additional_km_cents',
    });
  }

  return { minimum_charge_cents, included_km, price_per_additional_km_cents };
}

/**
 * Expands a JavaScript exponential notation string into plain decimal notation
 * without ever going through a float. `1e-7` -> `0.0000001`, `1.5e3` -> `1500`.
 */
function expandExponential(text, field) {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(text);
  if (!match) {
    throw validationError(`${field} must be a non-negative decimal value`, { field });
  }

  const [, sign, intPart, fracPart = '', exponentText] = match;
  const digits = intPart + fracPart;
  const pointIndex = intPart.length + Number(exponentText);

  let expanded;
  if (pointIndex <= 0) {
    expanded = `0.${'0'.repeat(-pointIndex)}${digits}`;
  } else if (pointIndex >= digits.length) {
    expanded = `${digits}${'0'.repeat(pointIndex - digits.length)}`;
  } else {
    expanded = `${digits.slice(0, pointIndex)}.${digits.slice(pointIndex)}`;
  }

  return sign === '-' ? `-${expanded}` : expanded;
}

/**
 * Converts a configuration value into its exact plain-decimal string form.
 * Rejects anything that is not a finite, non-negative decimal literal.
 */
function toPlainDecimalString(value, field) {
  let text;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw validationError(`${field} must be a finite number`, { field });
    }
    text = String(value);
    if (/[eE]/.test(text)) text = expandExponential(text, field);
  } else if (typeof value === 'string') {
    text = value;
  } else {
    throw validationError(`${field} must be a decimal number`, { field });
  }

  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw validationError(`${field} must be a non-negative decimal value`, { field });
  }

  return text;
}

/**
 * Converts `included_km` (DECIMAL(10,3) configuration) into whole meters.
 *
 * The conversion is exact: the decimal digits are read as text and assembled
 * with BigInt, so `2.007` becomes exactly 2007 meters instead of the 2007.0000000000002
 * a binary float multiply produces. A value with more than three significant
 * decimal places is not representable in the persisted column, so it is
 * rejected rather than silently rounded into a different price.
 *
 * @param {number|string} includedKm
 * @returns {number} whole meters
 */
function toIncludedMeters(includedKm) {
  const text = toPlainDecimalString(includedKm, 'included_km');
  const [intPart, fracPart = ''] = text.split('.');

  if (fracPart.replace(/0+$/, '').length > 3) {
    throw validationError('included_km must not have more than three decimal places', {
      field: 'included_km',
    });
  }

  const thousandths = (fracPart.slice(0, 3) + '000').slice(0, 3);
  const meters = BigInt(intPart) * METERS_PER_INCLUDED_KM + BigInt(thousandths);

  if (meters > MAX_SAFE_BIGINT) {
    throw validationError('included_km is too large to convert exactly', { field: 'included_km' });
  }

  return Number(meters);
}

/**
 * Exact ROUND_HALF_UP division of two non-negative BigInts.
 * `floor((2n + d) / 2d)` is HALF_UP for non-negative values and never touches a float.
 */
function roundHalfUpDivide(numerator, denominator) {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/**
 * Authoritative tow price for a route distance.
 *
 * @param {object} input
 * @param {number} input.total_distance_meters exact sum of the provider legs
 * @param {number} input.minimum_charge_cents
 * @param {number|string} input.included_km
 * @param {number} input.price_per_additional_km_cents
 * @returns {Readonly<object>} frozen price breakdown in integer cents
 */
function computeTowPrice({
  total_distance_meters: totalDistanceMeters,
  minimum_charge_cents: minimumChargeCents,
  included_km: includedKm,
  price_per_additional_km_cents: pricePerAdditionalKmCents,
} = {}) {
  const totalDistance = requireSafeNonNegativeInteger(totalDistanceMeters, 'total_distance_meters');
  const minimumCharge = requireSafeNonNegativeInteger(minimumChargeCents, 'minimum_charge_cents');
  const pricePerKm = requireSafeNonNegativeInteger(pricePerAdditionalKmCents, 'price_per_additional_km_cents');
  const includedMeters = toIncludedMeters(includedKm);

  const excessMeters = Math.max(0, totalDistance - includedMeters);

  // Both operands are safe integers but their product is not, so the money is
  // computed with BigInt and only converted back after the range check.
  const variableCharge = roundHalfUpDivide(BigInt(excessMeters) * BigInt(pricePerKm), METERS_PER_INCLUDED_KM);
  const finalPrice = BigInt(minimumCharge) + variableCharge;

  if (variableCharge > MAX_SAFE_BIGINT) {
    throw validationError('variable_charge_cents overflowed the safe integer range', {
      field: 'variable_charge_cents',
    });
  }
  if (finalPrice > MAX_SAFE_BIGINT) {
    throw validationError('final_price_cents overflowed the safe integer range', {
      field: 'final_price_cents',
    });
  }

  return Object.freeze({
    total_distance_meters: totalDistance,
    included_meters: includedMeters,
    excess_meters: excessMeters,
    variable_charge_cents: Number(variableCharge),
    final_price_cents: Number(finalPrice),
    currency: 'BRL',
  });
}

module.exports = { validatePricing, toIncludedMeters, computeTowPrice };
