/**
 * SERVICE LOCATION — architecture boundaries.
 *
 * Pins the ADR §6 promises a later refactor could silently break:
 *   - the domain and application layers stay pure (no HTTP, DB, filesystem,
 *     environment or network access);
 *   - only the Places adapter knows the Google endpoint, the headers and the
 *     dedicated key variable;
 *   - the module never imports the Tow module, with the single deliberate
 *     exception of the canonical geo primitive re-export (`domain/geo.js`),
 *     which is the "never duplicate assertOperationalGeoPoint" rule.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const MODULE_ROOT = path.resolve(__dirname, '../../src/modules/service-location');

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

const ALL_FILES = listFiles(MODULE_ROOT, (file) => file.endsWith('.js'));
const DOMAIN_AND_APPLICATION_FILES = listFiles(path.join(MODULE_ROOT, 'domain'), (file) => file.endsWith('.js'))
  .concat(listFiles(path.join(MODULE_ROOT, 'application'), (file) => file.endsWith('.js')));
const GEO_REEXPORT = path.join(MODULE_ROOT, 'domain/geo.js');

describe('SERVICE LOCATION ARCH — layer purity', () => {
  test.each([
    ['an express import', /require\(\s*['"]express['"]\s*\)/],
    ['an axios import', /require\(\s*['"]axios['"]\s*\)/],
    ['a knex import', /require\(\s*['"]knex['"]\s*\)/],
    ['an fs import', /require\(\s*['"](node:)?fs['"]\s*\)/],
    ['a crypto import', /require\(\s*['"](node:)?crypto['"]\s*\)/],
    ['an environment read', /process\.env/],
    ['a network call', /\bfetch\s*\(/],
    ['a Google URL', /places\.googleapis\.com|maps\.googleapis\.com/],
    ['a Google header', /X-Goog-/],
  ])('Domain/Application contain no %s', (_label, pattern) => {
    const offenders = DOMAIN_AND_APPLICATION_FILES
      .filter((file) => pattern.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('Domain/Application only require relative paths', () => {
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

  test('the places endpoint, headers and key variable live ONLY in the adapter', () => {
    const owners = ALL_FILES
      .filter((file) => /places\.googleapis\.com|X-Goog-|GOOGLE_PLACES_API_KEY/.test(readCode(file)))
      .map(relative);
    expect(owners).toEqual(['src/modules/service-location/adapters/places/google-places-adapter.js']);
  });

  test('the module never imports Tow, except the deliberate geo re-export', () => {
    const offenders = ALL_FILES
      .filter((file) => file !== GEO_REEXPORT)
      .filter((file) => /require\([^)]*['"][^'"]*tow[^'"]*['"]/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('the geo re-export is the single documented Tow edge', () => {
    expect(readCode(GEO_REEXPORT)).toMatch(/module\.exports\s*=\s*require\(['"]\.\.\/\.\.\/tow\/domain\/geo['"]\)/);
  });
});
