/**
 * Tow route provider kind — production always uses the real Google Routes API.
 *
 * The frozen `RouteProvider` port (`src/modules/tow/application/ports.js`) is
 * the external boundary; this module only selects which adapter implements it.
 * `validation-fixture` is a deterministic, network-free stand-in for the local
 * validation environment, where no Google Routes server key exists. It is
 * selected ONLY by explicit env var and is never a fallback: if the real
 * adapter cannot answer, the operation fails — the fixture does not step in.
 *
 * `validation-fixture` is impossible in production: `NODE_ENV` or `APP_ENV` set
 * to `production` turns it into a startup failure.
 */
'use strict';

const TOW_ROUTE_PROVIDER_VAR = 'TOW_ROUTE_PROVIDER';
const TOW_ROUTE_PROVIDER_KINDS = Object.freeze(['google', 'validation-fixture']);

const DEFAULT_KIND = 'google';

function readConfiguredKind(env) {
  const raw = env ? env[TOW_ROUTE_PROVIDER_VAR] : undefined;
  if (raw === undefined || raw === null) return DEFAULT_KIND;
  const value = String(raw).trim();
  return value === '' ? DEFAULT_KIND : value;
}

function isProduction(env) {
  return Boolean(env) && (env.NODE_ENV === 'production' || env.APP_ENV === 'production');
}

/**
 * Resolves `TOW_ROUTE_PROVIDER` from the environment.
 *
 * Allowed values are exactly `google` (the default when unset or empty) and
 * `validation-fixture`. Any other value throws.
 *
 * @param {object} [env] environment map, defaults to `process.env`
 * @returns {'google'|'validation-fixture'}
 */
function resolveTowRouteProviderKind(env = process.env) {
  const kind = readConfiguredKind(env);
  if (!TOW_ROUTE_PROVIDER_KINDS.includes(kind)) {
    const error = new Error(
      `${TOW_ROUTE_PROVIDER_VAR}="${kind}" is not a Tow route provider; allowed values are ${TOW_ROUTE_PROVIDER_KINDS.join(', ')}`
    );
    error.code = 'TOW_ROUTE_PROVIDER_INVALID';
    throw error;
  }
  return kind;
}

/**
 * Resolves the kind and refuses the validation fixture in production.
 *
 * The fixture fabricates distances and exists only for local validation; a
 * production process must always reach the real Google Routes API, so this
 * throws a startup error with code `TOW_ROUTE_PROVIDER_UNSAFE` instead of
 * degrading.
 *
 * @param {object} [env] environment map, defaults to `process.env`
 * @returns {'google'|'validation-fixture'}
 */
function assertTowRouteProviderSafe(env = process.env) {
  const kind = resolveTowRouteProviderKind(env);
  if (kind === 'validation-fixture' && isProduction(env)) {
    const error = new Error(
      `${TOW_ROUTE_PROVIDER_VAR}=validation-fixture is validation-only `
        + 'and cannot be enabled in production (NODE_ENV/APP_ENV=production); '
        + 'production requires the real Google Routes API'
    );
    error.code = 'TOW_ROUTE_PROVIDER_UNSAFE';
    throw error;
  }
  return kind;
}

module.exports = {
  TOW_ROUTE_PROVIDER_VAR,
  TOW_ROUTE_PROVIDER_KINDS,
  resolveTowRouteProviderKind,
  assertTowRouteProviderSafe,
};
