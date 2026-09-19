/**
 * MVP-02 — architecture boundary, port substitutability and source-policy suite.
 *
 * These are the invariants a future refactor could silently break, so they are
 * asserted against the real sources rather than against a mock:
 *
 *   - the RouteProvider port is registered and the fake and the Google adapter
 *     are interchangeable at the application boundary (same quote out);
 *   - composition wires the port and stays constructible without a Google key;
 *   - Domain/Application never reach for HTTP, the environment or the network;
 *   - there is exactly one HTTP-aware place in the module (`adapters/routes`);
 *   - the pricing policy never uses `ceil` and the module never uses Haversine;
 *   - the deterministic fake carries no pricing logic and no non-determinism;
 *   - the server-side key is documented in the env examples, never committed.
 *
 * RED-first: written before the MVP-02 sources exist.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const { PORT_NAMES } = require('../../../src/modules/tow/application/ports');
const { buildTowServices } = require('../../../src/modules/tow/composition');
const {
  createFakeRouteProvider,
} = require('../../helpers/tow/gateways/mapsGateway');
const {
  createGoogleRoutesAdapter,
} = require('../../../src/modules/tow/adapters/routes/google-routes-adapter');

const TOW_SRC = path.resolve(__dirname, '../../../src/modules/tow');
const TOW_HELPERS = path.resolve(__dirname, '../../helpers/tow');
const BACKEND_ROOT = path.resolve(__dirname, '../../..');

const TARIFF = Object.freeze({
  minimum_charge_cents: 15000,
  included_km: 10,
  price_per_additional_km_cents: 800,
});
const PROVIDER = Object.freeze({ latitude: -23.561684, longitude: -46.655981 });
const PICKUP = Object.freeze({ latitude: -23.5475, longitude: -46.6388 });
const DESTINATION = Object.freeze({ latitude: -23.6, longitude: -46.7 });

/** Code-shaped Haversine detection: a bare earth-radius constant or an actual call. */
const HAVERSINE_PATTERN = /\b6371\b|\bhaversine\s*\(|\btoRadians\s*\(|Math\.acos\s*\(/i;

function listFiles(root, predicate) {
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(full, predicate));
    else if (predicate(full)) found.push(full);
  }
  return found;
}

function read(absolutePath) {
  return fs.readFileSync(absolutePath, 'utf8');
}

/**
 * Strips comments before a policy scan so documentation prose ("never falls back
 * to Haversine", "no jest.mock('axios')") can never be mistaken for code. The
 * `//` rule is guarded against `https://` inside string literals.
 */
function readCode(absolutePath) {
  return read(absolutePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

function relative(absolutePath) {
  return path.relative(BACKEND_ROOT, absolutePath);
}

const DOMAIN_AND_APPLICATION_FILES = listFiles(
  path.join(TOW_SRC, 'domain'),
  (file) => file.endsWith('.js'),
).concat(listFiles(path.join(TOW_SRC, 'application'), (file) => file.endsWith('.js')));

const ALL_TOW_SRC_FILES = listFiles(TOW_SRC, (file) => file.endsWith('.js'));
const ALL_TOW_HELPER_FILES = listFiles(TOW_HELPERS, (file) => file.endsWith('.js'));
const MVP02_TEST_FILES = listFiles(path.resolve(__dirname), (file) => file.endsWith('.js'));

describe('MVP-02 ARCH — RouteProvider port', () => {
  test('the port is registered alongside the MVP-01 ports', () => {
    expect(PORT_NAMES).toContain('RouteProvider');
    expect(new Set(PORT_NAMES).size).toBe(PORT_NAMES.length);
  });

  test('the port is documented as a typedef with the computeRoute operation', () => {
    const source = read(path.join(TOW_SRC, 'application/ports.js'));
    expect(source).toMatch(/@typedef \{Object\} RouteProvider/);
    expect(source).toMatch(/computeRoute/);
    expect(source).toMatch(/provider_to_pickup/);
    expect(source).toMatch(/pickup_to_destination/);
    expect(source).toMatch(/encoded_polyline/);
  });

  test('the fake and the real adapter are interchangeable at the application boundary', async () => {
    const { createQuoteService } = require('../../../src/modules/tow/application/quote-service');

    const clock = { now: () => new Date('2026-06-01T12:00:00.000Z') };
    const fake = createFakeRouteProvider({
      providerToPickup: { distance_meters: 7000, duration_seconds: 900 },
      pickupToDestination: { distance_meters: 7350, duration_seconds: 1200 },
      encodedPolyline: 'shared-polyline',
    });

    // The real adapter against a Google-shaped stub response, no network.
    const stubHttpClient = {
      post: async () => ({
        status: 200,
        data: {
          routes: [{
            legs: [
              { distanceMeters: 7000, duration: '900s' },
              { distanceMeters: 7350, duration: '1200s' },
            ],
            polyline: { encodedPolyline: 'shared-polyline' },
          }],
        },
      }),
    };
    const real = createGoogleRoutesAdapter({ apiKey: 'boundary-test-key', httpClient: stubHttpClient });

    const input = { provider: PROVIDER, pickup: PICKUP, destination: DESTINATION, tariff: TARIFF };
    const viaFake = await createQuoteService({ routeProvider: fake, clock }).quoteTow(input);
    const viaReal = await createQuoteService({ routeProvider: real, clock }).quoteTow(input);

    expect(viaReal).toEqual(viaFake);
    expect(viaReal.calculated_price.amount_cents).toBe(18480);
  });
});

describe('MVP-02 ARCH — composition root', () => {
  const originalKey = process.env.GOOGLE_ROUTES_API_KEY;
  let services;

  beforeAll(() => {
    delete process.env.GOOGLE_ROUTES_API_KEY;
    services = buildTowServices({
      db: {},
      clock: { now: () => new Date('2026-06-01T12:00:00.000Z') },
      storage: { save: async () => ({ key: 'k' }), read: async () => Buffer.alloc(0), remove: async () => {} },
    });
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.GOOGLE_ROUTES_API_KEY;
    else process.env.GOOGLE_ROUTES_API_KEY = originalKey;
  });

  test('builds without a Google key, so a missing secret never breaks the module', () => {
    expect(services.routeProvider).toBeDefined();
    expect(typeof services.routeProvider.computeRoute).toBe('function');
    expect(typeof services.quoteService.quoteTow).toBe('function');
  });

  test('an unconfigured key surfaces as external_dependency_unavailable, never as a crash or a price', async () => {
    await expect(services.quoteService.quoteTow({
      provider: PROVIDER, pickup: PICKUP, destination: DESTINATION, tariff: TARIFF,
    })).rejects.toMatchObject({ code: 'external_dependency_unavailable', httpStatus: 503 });
  });

  test('an injected route provider overrides the Google adapter', async () => {
    const fake = createFakeRouteProvider();
    const injected = buildTowServices({
      db: {},
      clock: { now: () => new Date('2026-06-01T12:00:00.000Z') },
      storage: { save: async () => ({ key: 'k' }), read: async () => Buffer.alloc(0), remove: async () => {} },
      routeProvider: fake,
    });

    const quote = await injected.quoteService.quoteTow({
      provider: PROVIDER, pickup: PICKUP, destination: DESTINATION, tariff: TARIFF,
    });
    expect(quote.calculated_price.amount_cents).toBe(18480);
    expect(fake.callCount('computeRoute')).toBe(1);
  });

  test('the composition root reads the key lazily, never at module load', () => {
    const source = read(path.join(TOW_SRC, 'composition.js'));
    // A top-level `process.env.X` read would freeze configuration at require time.
    expect(source).not.toMatch(/^(const|let|var)\s+\w+\s*=\s*process\.env\./m);
  });
});

describe('MVP-02 ARCH — Domain/Application purity', () => {
  test.each([
    ['a direct axios import', /require\(\s*['"]axios['"]\s*\)/],
    ['a direct http/https import', /require\(\s*['"](node:)?https?['"]\s*\)/],
    ['a direct node-fetch/undici import', /require\(\s*['"](node-fetch|undici)['"]\s*\)/],
    ['a global fetch call', /\bfetch\s*\(/],
    ['a direct knex import', /require\(\s*['"]knex['"]\s*\)/],
    ['a direct express import', /require\(\s*['"]express['"]\s*\)/],
    ['a direct fs import', /require\(\s*['"](node:)?fs['"]\s*\)/],
    ['an environment read', /process\.env/],
  ])('no %s in src/modules/tow/domain or src/modules/tow/application', (_label, pattern) => {
    const offenders = DOMAIN_AND_APPLICATION_FILES
      .filter((file) => pattern.test(read(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('Domain/Application only require sibling relative paths inside the module', () => {
    const offenders = [];
    for (const file of DOMAIN_AND_APPLICATION_FILES) {
      const source = read(file);
      const requires = source.match(/require\(\s*['"][^'"]+['"]\s*\)/g) || [];
      for (const statement of requires) {
        const target = /require\(\s*['"]([^'"]+)['"]\s*\)/.exec(statement)[1];
        if (!target.startsWith('.')) offenders.push(`${relative(file)} -> ${target}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('the Google adapter is the only HTTP-aware file in the module', () => {
    const httpAware = ALL_TOW_SRC_FILES
      .filter((file) => /require\(\s*['"]axios['"]\s*\)/.test(read(file)))
      .map(relative);
    expect(httpAware).toEqual(['src/modules/tow/adapters/routes/google-routes-adapter.js']);
  });

  test('the application service imports the port types, not the adapter', () => {
    const source = readCode(path.join(TOW_SRC, 'application/quote-service.js'));
    expect(source).not.toMatch(/adapters/);
    expect(source).not.toMatch(/axios|googleapis|routes\.googleapis\.com/);
  });
});

describe('MVP-02 ARCH — pricing and distance policies', () => {
  test('the pricing policy never uses ceil or whole-kilometre billing', () => {
    const source = readCode(path.join(TOW_SRC, 'domain/pricing.js'));
    expect(source).not.toMatch(/Math\.ceil/);
    expect(source).not.toMatch(/[^a-zA-Z_.]ceil\s*\(/);
    expect(source).not.toMatch(/excess_km|Math\.round\s*\(\s*excess/i);
  });

  test('no source file in the Tow module falls back to Haversine or an earth-radius constant', () => {
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => HAVERSINE_PATTERN.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('the deterministic test helpers contain no Haversine fallback either', () => {
    const offenders = ALL_TOW_HELPER_FILES
      .filter((file) => HAVERSINE_PATTERN.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('no distance, duration or price is ever derived by scaling or estimation', () => {
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => /\b(estimated_distance|fallback_distance|approx_distance|distance_factor|average_speed)\b/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });
});

describe('MVP-02 ARCH — deterministic fake route provider', () => {
  const FAKE_SOURCE = readCode(path.join(TOW_HELPERS, 'gateways/mapsGateway.js'));

  test('carries no pricing logic whatsoever', () => {
    expect(FAKE_SOURCE).not.toMatch(/minimum_charge_cents|price_per_additional_km_cents|final_price_cents|included_km|excess_meters|calculated_price|variable_charge_cents/);
  });

  test('is deterministic: no clock, no randomness, no network', () => {
    expect(FAKE_SOURCE).not.toMatch(/Date\.now\s*\(/);
    expect(FAKE_SOURCE).not.toMatch(/Math\.random\s*\(/);
    expect(FAKE_SOURCE).not.toMatch(/\bfetch\s*\(/);
    expect(FAKE_SOURCE).not.toMatch(/require\(\s*['"](https?|axios|node-fetch|undici)['"]\s*\)/);
  });

  test('the fake exposes the same operation contract as the real adapter', async () => {
    const fake = createFakeRouteProvider();
    const result = await fake.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP });
    expect(Object.keys(result).sort()).toEqual(['encoded_polyline', 'pickup_to_destination', 'provider_to_pickup']);
    expect(result.provider_to_pickup).toEqual({ distance_meters: 7000, duration_seconds: 900 });
    expect(result.pickup_to_destination).toEqual({ distance_meters: 7350, duration_seconds: 1200 });
  });

  test('the fake reports the same failures the adapter classifies', async () => {
    const fake = createFakeRouteProvider({ failure: { code: 'PROVIDER_DOWN', message: 'down' } });
    await expect(fake.computeRoute({ origin: PROVIDER, destination: DESTINATION, pickup: PICKUP })).rejects.toThrow('down');
  });

  test('the fake honours single-leg mode', async () => {
    const fake = createFakeRouteProvider();
    const result = await fake.computeRoute({ origin: PROVIDER, destination: DESTINATION });
    expect(result.provider_to_pickup).toBeNull();
    expect(result.pickup_to_destination).not.toBeNull();
  });
});

describe('MVP-02 ARCH — test hygiene', () => {
  test('no MVP-02 test is focused or skipped', () => {
    const offenders = MVP02_TEST_FILES
      .filter((file) => /(?:test|it|describe)\.(only|skip)\b/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('no MVP-02 test opens a socket or mocks axios', () => {
    const offenders = MVP02_TEST_FILES
      .filter((file) => {
        const source = readCode(file);
        return /require\(\s*['"]axios['"]\s*\)/.test(source)
          || /jest\.mock\(\s*['"]axios['"]\s*\)/.test(source)
          || /require\(\s*['"](node:)?https?['"]\s*\)/.test(source)
          || /\.listen\s*\(/.test(source);
      })
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('no Google API key literal is committed anywhere in the module or the examples', () => {
    const files = ALL_TOW_SRC_FILES.concat([
      path.join(BACKEND_ROOT, 'env.example'),
      path.join(BACKEND_ROOT, 'env.production.example'),
    ]);
    const offenders = files
      .filter((file) => /AIza[0-9A-Za-z_-]{35}/.test(read(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('the server-side Routes key is documented in both env examples', () => {
    for (const name of ['env.example', 'env.production.example']) {
      const source = read(path.join(BACKEND_ROOT, name));
      expect(source).toMatch(/^GOOGLE_ROUTES_API_KEY=/m);
      expect(source).toMatch(/GOOGLE_ROUTES_API_KEY=[^\n]*\n/);
      // It must never be pre-filled with a real-looking value.
      expect(source).not.toMatch(/GOOGLE_ROUTES_API_KEY=AIza/);
    }
  });

  test('the browser-exposed Maps key is never reused as the server-side Routes key', () => {
    const source = read(path.join(TOW_SRC, 'adapters/routes/google-routes-adapter.js'));
    expect(source).not.toMatch(/GOOGLE_MAPS_API_KEY/);
    expect(source).not.toMatch(/REACT_APP_/);
  });
});
