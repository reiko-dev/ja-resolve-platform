/**
 * TOW ROUND — address resolver configuration guards and key hygiene.
 *
 * The resolver is OFF by default; `google` requires its OWN dedicated key
 * (`GOOGLE_GEOCODING_API_KEY`) at startup. The adapter must never read the
 * Routes key, the browser Maps key or any `REACT_APP_*` variable.
 *
 * RED-first: written before `src/config/towAddressResolver.js` existed.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const {
  TOW_ADDRESS_RESOLVER_VAR,
  TOW_ADDRESS_RESOLVER_KINDS,
  GOOGLE_GEOCODING_KEY_VAR,
  resolveTowAddressResolverKind,
  assertTowAddressResolverSafe,
} = require('../../../src/config/towAddressResolver');
const { buildTowServices, createConfiguredAddressResolver } = require('../../../src/modules/tow/composition');
const { missingProductionSecrets } = require('../../../src/config/requiredSecrets');
const { PORT_NAMES } = require('../../../src/modules/tow/application/ports');

const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const ADAPTER_SOURCE = path.join(
  BACKEND_ROOT,
  'src/modules/tow/adapters/address/google-geocoding-adapter.js'
);

function readCode(absolutePath) {
  return fs.readFileSync(absolutePath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

describe('TOW ROUND — address resolver configuration', () => {
  test('the port is registered and the kind vocabulary is frozen', () => {
    expect(PORT_NAMES).toContain('AddressResolver');
    expect(new Set(PORT_NAMES).size).toBe(PORT_NAMES.length);
    expect(TOW_ADDRESS_RESOLVER_VAR).toBe('TOW_ADDRESS_RESOLVER');
    expect(TOW_ADDRESS_RESOLVER_KINDS).toEqual(['google', 'none']);
    expect(GOOGLE_GEOCODING_KEY_VAR).toBe('GOOGLE_GEOCODING_API_KEY');
  });

  test('the default is none: an unset or empty value never enables the provider', () => {
    expect(resolveTowAddressResolverKind({})).toBe('none');
    expect(resolveTowAddressResolverKind({ [TOW_ADDRESS_RESOLVER_VAR]: '' })).toBe('none');
    expect(resolveTowAddressResolverKind({ [TOW_ADDRESS_RESOLVER_VAR]: '   ' })).toBe('none');
    expect(resolveTowAddressResolverKind({ [TOW_ADDRESS_RESOLVER_VAR]: 'none' })).toBe('none');
    expect(resolveTowAddressResolverKind({ [TOW_ADDRESS_RESOLVER_VAR]: 'google' })).toBe('google');
  });

  test('an unknown kind throws instead of silently disabling the resolver', () => {
    let error = null;
    try {
      resolveTowAddressResolverKind({ [TOW_ADDRESS_RESOLVER_VAR]: 'fixture' });
    } catch (caught) {
      error = caught;
    }
    expect(error).not.toBeNull();
    expect(error.code).toBe('TOW_ADDRESS_RESOLVER_INVALID');
  });

  test('google without its dedicated key is a fail-fast configuration error', () => {
    let error = null;
    try {
      assertTowAddressResolverSafe({ [TOW_ADDRESS_RESOLVER_VAR]: 'google' });
    } catch (caught) {
      error = caught;
    }
    expect(error).not.toBeNull();
    expect(error.code).toBe('TOW_ADDRESS_RESOLVER_KEY_MISSING');
  });

  test('google never falls back to the Routes key or the browser Maps key', () => {
    for (const env of [
      { [TOW_ADDRESS_RESOLVER_VAR]: 'google', GOOGLE_ROUTES_API_KEY: 'routes-key' },
      { [TOW_ADDRESS_RESOLVER_VAR]: 'google', GOOGLE_MAPS_API_KEY: 'browser-key' },
      { [TOW_ADDRESS_RESOLVER_VAR]: 'google', REACT_APP_GOOGLE_MAPS_API_KEY: 'react-key' },
    ]) {
      expect(() => assertTowAddressResolverSafe(env)).toThrow(/GOOGLE_GEOCODING_API_KEY/);
    }
  });

  test('google with the dedicated key is accepted', () => {
    expect(assertTowAddressResolverSafe({
      [TOW_ADDRESS_RESOLVER_VAR]: 'google',
      [GOOGLE_GEOCODING_KEY_VAR]: 'dedicated-key',
    })).toBe('google');
  });

  test('createConfiguredAddressResolver maps none to null and google to the adapter', () => {
    expect(createConfiguredAddressResolver({}, { [TOW_ADDRESS_RESOLVER_VAR]: 'none' })).toBeNull();
    const adapter = createConfiguredAddressResolver(
      { apiKey: 'dedicated-key' },
      { [TOW_ADDRESS_RESOLVER_VAR]: 'google', [GOOGLE_GEOCODING_KEY_VAR]: 'dedicated-key' }
    );
    expect(adapter).not.toBeNull();
    expect(typeof adapter.resolve).toBe('function');
    expect(adapter.name).toBe('google-geocoding');
  });

  test('buildTowServices wires no resolver by default and keeps the module constructible', () => {
    const services = buildTowServices({
      db: {},
      clock: { now: () => new Date('2026-06-01T12:00:00.000Z') },
      storage: { save: async () => ({ key: 'k' }), read: async () => Buffer.alloc(0), remove: async () => {} },
    });
    expect(services.addressResolver).toBeNull();
    expect(typeof services.towRequestService.create).toBe('function');
  });

  test('an injected resolver (or explicit null) overrides the configured kind', () => {
    const injected = { resolve: async () => null };
    const services = buildTowServices({
      db: {},
      clock: { now: () => new Date('2026-06-01T12:00:00.000Z') },
      storage: { save: async () => ({ key: 'k' }), read: async () => Buffer.alloc(0), remove: async () => {} },
      addressResolver: injected,
    });
    expect(services.addressResolver).toBe(injected);
  });

  test('production requires the dedicated key once the resolver is enabled', () => {
    const base = {
      NODE_ENV: 'production',
      JWT_SECRET: 'jwt',
      DB_PASSWORD: 'db',
      GOOGLE_ROUTES_API_KEY: 'routes',
    };
    expect(missingProductionSecrets(base)).toEqual([]);
    expect(missingProductionSecrets({ ...base, TOW_ADDRESS_RESOLVER: 'google' }))
      .toEqual(['GOOGLE_GEOCODING_API_KEY']);
    expect(missingProductionSecrets({
      ...base,
      TOW_ADDRESS_RESOLVER: 'google',
      GOOGLE_GEOCODING_API_KEY: 'geocoding',
    })).toEqual([]);
    expect(missingProductionSecrets({ ...base, TOW_ADDRESS_RESOLVER: 'none' })).toEqual([]);
  });

  test('the adapter reads only its dedicated key and never a browser or Routes variable', () => {
    const source = readCode(ADAPTER_SOURCE);
    expect(source).toMatch(/GOOGLE_GEOCODING_KEY_VAR/);
    expect(source).not.toMatch(/GOOGLE_ROUTES_API_KEY/);
    expect(source).not.toMatch(/GOOGLE_MAPS_API_KEY/);
    expect(source).not.toMatch(/REACT_APP_/);
    expect(source).not.toMatch(/maps\.googleapis\.com\/maps\/api\/place/);
  });

  test('the adapter does not import the Routes adapter nor share its endpoint', () => {
    const source = readCode(ADAPTER_SOURCE);
    expect(source).not.toMatch(/routes\.googleapis\.com/);
    expect(source).not.toMatch(/adapters\/routes/);
  });
});
