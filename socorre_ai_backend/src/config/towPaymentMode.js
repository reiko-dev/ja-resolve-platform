/**
 * Tow payment mode — a declared, guarded operational fact, NOT a payment
 * architecture.
 *
 * MVP-06 is CASH-only: there is no PSP and no gateway call anywhere in
 * `src/modules/tow`, and this module does not add one. The mode exists so the
 * validation environment can state explicitly that it is simulating the cash
 * handover, while production can refuse to boot when someone tries to turn that
 * simulation on there. It is a switch over an operational fact, not a fake PSP:
 * no card/pix/wallet/refund surface reads it, and the canonical payment domain
 * (`domain/tow-payment.js`) never branches on it.
 *
 * `mock` is validation-only and impossible in production: `NODE_ENV` or
 * `APP_ENV` set to `production` turns it into a startup failure.
 */
'use strict';

const TOW_PAYMENT_MODE_VAR = 'TOW_PAYMENT_MODE';
const TOW_PAYMENT_MODES = Object.freeze(['cash', 'mock']);

const DEFAULT_MODE = 'cash';

function readConfiguredMode(env) {
  const raw = env ? env[TOW_PAYMENT_MODE_VAR] : undefined;
  if (raw === undefined || raw === null) return DEFAULT_MODE;
  const value = String(raw).trim();
  return value === '' ? DEFAULT_MODE : value;
}

function isProduction(env) {
  return Boolean(env) && (env.NODE_ENV === 'production' || env.APP_ENV === 'production');
}

/**
 * Resolves `TOW_PAYMENT_MODE` from the environment.
 *
 * Allowed values are exactly `cash` (the default when unset or empty) and
 * `mock`. Any other value throws: an unrecognized mode must never be silently
 * coerced into a mode the caller did not ask for.
 *
 * @param {object} [env] environment map, defaults to `process.env`
 * @returns {{ mode: 'cash'|'mock', simulated: boolean }} frozen resolution
 */
function resolveTowPaymentMode(env = process.env) {
  const mode = readConfiguredMode(env);
  if (!TOW_PAYMENT_MODES.includes(mode)) {
    const error = new Error(
      `${TOW_PAYMENT_MODE_VAR}="${mode}" is not a Tow payment mode; allowed values are ${TOW_PAYMENT_MODES.join(', ')}`
    );
    error.code = 'TOW_PAYMENT_MODE_INVALID';
    throw error;
  }
  return Object.freeze({ mode, simulated: mode === 'mock' });
}

/**
 * Resolves the mode and refuses `mock` in production.
 *
 * Mock is a validation-only simulation of the cash handover; a production
 * process that claims to be simulating payments is a misconfiguration, so this
 * throws a startup error with code `TOW_PAYMENT_MODE_UNSAFE` instead of
 * degrading.
 *
 * @param {object} [env] environment map, defaults to `process.env`
 * @returns {{ mode: 'cash'|'mock', simulated: boolean }} frozen resolution
 */
function assertTowPaymentModeSafe(env = process.env) {
  const resolved = resolveTowPaymentMode(env);
  if (resolved.simulated && isProduction(env)) {
    const error = new Error(
      `${TOW_PAYMENT_MODE_VAR}=mock is validation-only (no PSP, no real money) `
        + 'and cannot be enabled in production (NODE_ENV/APP_ENV=production)'
    );
    error.code = 'TOW_PAYMENT_MODE_UNSAFE';
    throw error;
  }
  return resolved;
}

/**
 * Safe human-readable description of a resolved mode. Never carries secrets or
 * configuration values other than the mode itself.
 *
 * @param {{ mode: string, simulated: boolean }} resolved
 * @returns {string}
 */
function describeTowPaymentMode(resolved) {
  if (resolved && resolved.simulated === true) {
    return 'MOCK (validation only — no PSP, no real money)';
  }
  return 'CASH (no PSP; cash is settled in hand)';
}

module.exports = {
  TOW_PAYMENT_MODE_VAR,
  TOW_PAYMENT_MODES,
  resolveTowPaymentMode,
  assertTowPaymentModeSafe,
  describeTowPaymentMode,
};
