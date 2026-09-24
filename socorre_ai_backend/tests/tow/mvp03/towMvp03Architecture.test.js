/**
 * MVP-03 — architecture boundaries, ports, migration registration and scope.
 *
 * Asserts the invariants a later refactor could silently break:
 *   - the geodesic primitive is owned by exactly one file and is never used by
 *     the pricing/route authority;
 *   - the legacy earth-radius formula stays banned module-wide;
 *   - Domain/Application stay pure and never import the legacy subsystem;
 *   - the new ports, error codes and barrels are wired;
 *   - migration 004 is registered everywhere the schema is pinned;
 *   - no later (MVP-05+) route, table or vocabulary leaked into this delivery.
 *     The MVP-04 subset of these assertions moved to the MVP-04 suite when that
 *     delivery landed; see `tests/tow/mvp04/towMvp04Architecture.test.js`.
 *
 * RED-first: written before the MVP-03 sources exist.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const { PORT_NAMES } = require('../../../src/modules/tow/application/ports');
const domain = require('../../../src/modules/tow/domain');
const application = require('../../../src/modules/tow/application');
const { ERROR_STATUS } = require('../../../src/modules/tow/domain/errors');

const TOW_SRC = path.resolve(__dirname, '../../../src/modules/tow');
const BACKEND_ROOT = path.resolve(__dirname, '../../..');

/** The legacy formula shape: a bare 6371 km radius, `haversine(`, `toRadians(`, `Math.acos(`. */
const LEGACY_FORMULA_PATTERN = /\b6371\b|\bhaversine\s*\(|\btoRadians\s*\(|Math\.acos\s*\(/i;

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

/** Strips comments so prose can never be mistaken for code. */
function readCode(absolutePath) {
  return read(absolutePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

function relative(absolutePath) {
  return path.relative(BACKEND_ROOT, absolutePath);
}

const ALL_TOW_SRC_FILES = listFiles(TOW_SRC, (file) => file.endsWith('.js'));
const DOMAIN_AND_APPLICATION_FILES = listFiles(path.join(TOW_SRC, 'domain'), (file) => file.endsWith('.js'))
  .concat(listFiles(path.join(TOW_SRC, 'application'), (file) => file.endsWith('.js')));
const AUTHORITY_FILES = [
  path.join(TOW_SRC, 'domain/pricing.js'),
  path.join(TOW_SRC, 'domain/route.js'),
  path.join(TOW_SRC, 'application/quote-service.js'),
].concat(
  // The validation-only fixture is NOT a pricing/route authority: it is a
  // deterministic stand-in selected by explicit env and rejected in production
  // (`tests/tow/validation` asserts both). Its whole purpose is to derive
  // stable numbers from the geodesic primitive, so it is the one adapter
  // allowed to import `geo`. The real authority — the Google adapter — stays
  // covered by the assertions below.
  listFiles(path.join(TOW_SRC, 'adapters/routes'), (file) => file.endsWith('.js'))
    .filter((file) => path.basename(file) !== 'validation-routes-adapter.js')
);

describe('MVP-03 ARCH — geodesic ownership', () => {
  test('exactly one file owns the geodesic primitive', () => {
    const owners = ALL_TOW_SRC_FILES
      .filter((file) => /function\s+geodesicDistanceMeters\b/.test(readCode(file)))
      .map(relative);
    expect(owners).toEqual(['src/modules/tow/domain/geo.js']);
  });

  test('the primitive is a numerically stable atan2 formulation in metres', () => {
    const source = readCode(path.join(TOW_SRC, 'domain/geo.js'));
    expect(source).toMatch(/Math\.atan2/);
    expect(source).toMatch(/EARTH_MEAN_RADIUS_METERS/);
    // IUGG mean Earth radius expressed in metres, never the legacy 6371 km.
    expect(source).toMatch(/6371008\.8/);
  });

  test('the legacy earth-radius formula stays banned in every Tow source file', () => {
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => LEGACY_FORMULA_PATTERN.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('the pricing and route authority never import the matching primitive', () => {
    const offenders = AUTHORITY_FILES
      .filter((file) => /geodesicDistanceMeters|isWithinRadius|boundingBoxForRadius|require\([^)]*['"]\.\.?\/geo['"]/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('the price is never derived from a local distance', () => {
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => /\b(estimated_distance|fallback_distance|approx_distance|distance_factor|average_speed)\b/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });
});

describe('MVP-03 ARCH — module purity and legacy isolation', () => {
  test.each([
    ['an express import', /require\(\s*['"]express['"]\s*\)/],
    ['a knex import', /require\(\s*['"]knex['"]\s*\)/],
    ['an fs import', /require\(\s*['"](node:)?fs['"]\s*\)/],
    ['a crypto import', /require\(\s*['"](node:)?crypto['"]\s*\)/],
    ['an environment read', /process\.env/],
    ['a network call', /\bfetch\s*\(/],
  ])('Domain/Application contain no %s', (_label, pattern) => {
    const offenders = DOMAIN_AND_APPLICATION_FILES
      .filter((file) => pattern.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('Domain/Application only require sibling relative paths', () => {
    const offenders = [];
    for (const file of DOMAIN_AND_APPLICATION_FILES) {
      const requires = read(file).match(/require\(\s*['"][^'"]+['"]\s*\)/g) || [];
      for (const statement of requires) {
        const target = /require\(\s*['"]([^'"]+)['"]\s*\)/.exec(statement)[1];
        if (!target.startsWith('.')) offenders.push(`${relative(file)} -> ${target}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('the Tow module never imports the legacy EmergencyRequest subsystem', () => {
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => /require\([^)]*(EmergencyRequest|models\/Partner|TowProposal|emergencyRequestController|emergency-requests)/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('the canonical flow never reads the legacy tables', () => {
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => /['"](emergency_requests|tow_proposals)['"]/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });
});

describe('MVP-03 ARCH — ports, barrels and error vocabulary', () => {
  test('the new ports are registered', () => {
    expect(PORT_NAMES).toContain('TowRequestRepository');
    expect(PORT_NAMES).toContain('PartnerRepository');
    expect(PORT_NAMES).toContain('RouteProvider');
  });

  test('the domain barrel exports the MVP-03 vocabulary', () => {
    for (const symbol of [
      'TOW_REQUEST_STATES', 'INITIAL_TOW_REQUEST_STATE', 'TERMINAL_REASONS',
      'validateCreateTowRequestInput', 'buildTowRequestRecord', 'buildTowRequestDto',
      'validateIdempotencyKey', 'canonicalFingerprintSource',
      'geodesicDistanceMeters', 'isWithinRadius', 'boundingBoxForRadius',
      'isOperationalGeoPoint', 'assertOperationalGeoPoint',
      'evaluateTowMatch', 'selectMatches',
    ]) {
      expect(domain[symbol]).toBeDefined();
    }
  });

  test('the application barrel exports the new services', () => {
    expect(typeof application.createTowRequestService).toBe('function');
    expect(typeof application.createMatchingService).toBe('function');
  });

  test('the MVP-03 error codes map to their frozen HTTP statuses', () => {
    expect(ERROR_STATUS.not_request_owner).toBe(403);
    expect(ERROR_STATUS.idempotency_conflict).toBe(409);
    expect(ERROR_STATUS.service_module_disabled).toBe(409);
    expect(ERROR_STATUS.validation_error).toBe(422);
    expect(ERROR_STATUS.external_dependency_unavailable).toBe(503);
  });
});

describe('MVP-03 ARCH — migration registration', () => {
  const MIGRATION = path.join(BACKEND_ROOT, 'database/migrations/004_mvp03_tow_requests.js');

  test('migration 004 exists and creates the canonical tow_requests table', () => {
    const source = read(MIGRATION);
    expect(source).toMatch(/createTable\(\s*['"]tow_requests['"]/);
    expect(source).toMatch(/dropTableIfExists\(\s*['"]tow_requests['"]/);
  });

  test('migration 004 enforces the canonical state vocabulary', () => {
    const source = read(MIGRATION);
    for (const state of domain.TOW_REQUEST_STATES) {
      expect(source).toContain(`'${state}'`);
    }
    expect(source).toMatch(/SEARCHING/);
  });

  test('migration 004 owns the idempotency uniqueness authority', () => {
    const source = read(MIGRATION);
    expect(source).toMatch(/unique\(\s*\[\s*['"]customer_id['"]\s*,\s*['"]idempotency_key['"]\s*\]/);
    expect(source).toMatch(/idempotency_fingerprint/);
  });

  test('migration 004 never touches the legacy tables', () => {
    // Comments are stripped first: the migration DOCUMENTS why the legacy
    // subsystem is not reused, and naming it in prose must not be confused with
    // mutating it. Only executable code is scanned.
    const code = read(MIGRATION)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    expect(code).not.toMatch(/emergency_requests/);
    expect(code).not.toMatch(/dropColumn|renameTable|alterTable/);
    // The only table the down migration may drop is the one it created.
    const dropped = [...code.matchAll(/dropTableIfExists\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
    expect(dropped).toEqual(['tow_requests']);
  });

  test('the T01 baseline gate pins migration 004 and requires tow_requests', () => {
    expect(read(path.join(BACKEND_ROOT, 'scripts/tow/run-db-baseline-gate.js')))
      .toContain('004_mvp03_tow_requests.js');
    expect(read(path.join(BACKEND_ROOT, 'scripts/tow/db-baseline.js')))
      .toContain("'tow_requests'");
  });

  test('the SQLite harness knows the canonical table', () => {
    const source = read(path.join(BACKEND_ROOT, 'tests/helpers/testDb.js'));
    expect(source).toContain("'tow_requests'");
  });
});

describe('MVP-03 ARCH — scope discipline', () => {
  const ROUTES = read(path.join(TOW_SRC, 'http/routes.js'));

  test('the four MVP-03 routes are registered', () => {
    expect(ROUTES).toContain("router.post('/requests'");
    expect(ROUTES).toContain("router.get('/requests'");
    expect(ROUTES).toContain("router.get('/requests/:requestId'");
    expect(ROUTES).toContain("router.get('/partner/opportunities'");
  });

  test('no MVP-05 route leaked into this delivery', () => {
    // MVP-04 (proposals/assignment) is a LATER delivery and owns
    // `/proposals` and `/accept`; the assertions for those moved to
    // `tests/tow/mvp04/towMvp04Architecture.test.js` when MVP-04 landed, so this
    // list was narrowed instead of deleted. MVP-05 (service execution,
    // tracking, cancellation) has now landed too and owns `/cancel`; that
    // surface is asserted positively in
    // `tests/tow/mvp05/towMvp05Architecture.test.js`. Everything still banned
    // here is a genuinely later surface (counteroffer, destination change,
    // completion/dispute/review, payments, partner presence).
    for (const forbidden of [
      '/counteroffer', '/assignment', '/destination',
      '/completion', '/dispute', '/review', '/payments', '/partner/status', '/partner/location',
    ]) {
      expect(ROUTES).not.toContain(forbidden);
    }
  });

  test('no legacy or later table is referenced by the Tow module', () => {
    // `tow_assignments` was removed from this list when MVP-04 landed: it is now
    // a canonical table of this module. `tow_proposals` (the LEGACY table, keyed
    // by `emergency_requests`) stays banned, and the pattern is anchored on the
    // quotes so the canonical `tow_request_proposals` does not match it.
    // `tow_payments` was removed when MVP-06 landed: it is now a canonical table
    // of this module, asserted positively in
    // `tests/tow/mvp06/towMvp06Architecture.test.js`, which carries the bans for
    // everything still unimplemented.
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => /['"](tow_proposals|tow_audit_events|tow_request_snapshots)['"]/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('the module exposes no scheduler, expiry or radius-progression code', () => {
    // TOW ROUND: the ONLY tolerated one-shot timer is the bounded retry delay of
    // the address resolver adapter (`maxAttempts <= 2`, `retryDelayMs` short).
    // It is not a scheduler: no recurring work, no expiry, no radius
    // progression. Every other file must not own a timer, and `setInterval` /
    // `cron` / `schedule` stay banned everywhere.
    const ONE_SHOT_TIMER_ALLOWLIST = ['src/modules/tow/adapters/address/google-geocoding-adapter.js'];
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => {
        const source = readCode(file);
        if (/\b(setInterval|cron|schedule)\b/.test(source)) return true;
        return /\bsetTimeout\b/.test(source) && !ONE_SHOT_TIMER_ALLOWLIST.includes(relative(file));
      })
      .map(relative);
    expect(offenders).toEqual([]);
  });
});
