/**
 * T00 — regression: `verify:tow` records PostgreSQL startup failures
 * independently of earlier offline failures.
 *
 * Codex round-3 P2 (thread 4048484296): `verify.js` suppressed the PostgreSQL
 * entry whenever any earlier stage had failed (`failedBefore`), so a Docker
 * startup/health failure that never reached the inner PG stages disappeared
 * from the summary of a multi-failure run.
 *
 * The decision is a pure helper (`scripts/tow/verify-stage-recording.js`), so
 * these tests need no Docker, no Jest child and no gate side effects.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const {
  POSTGRES_STAGE_NAMES,
  STARTUP_STAGE_NAME,
  TEARDOWN_STAGE_NAME,
  planPostgresFailureEntries,
} = require('../../scripts/tow/verify-stage-recording');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');

function startupError() {
  return new Error('command failed (1): docker compose -p socorre-tow-test-55432-1a2b3c4d up -d --wait');
}

function teardownError() {
  return Object.assign(
    new Error('docker compose down failed (exit status 1): docker compose -p socorre-tow-test-55432-1a2b3c4d down'),
    { isTeardownFailure: true }
  );
}

function withTeardown(error, teardown) {
  error.teardownError = teardown;
  return error;
}

/** Mirrors how verify.js applies the plan to the summary. */
function apply(results, error) {
  results.push(...planPostgresFailureEntries({
    recordedNames: results.map((entry) => entry.name),
    error,
  }));
  return results;
}

describe('verify:tow PostgreSQL stage recording (Codex round-3 M5-3 / thread 4048484296)', () => {
  test('earlier offline failure + PG startup failure => both entries', () => {
    const results = [{ name: 'OpenAPI 3.1 structure gate', ok: false, detail: 'boom', ms: 3 }];
    const error = startupError();

    apply(results, error);

    expect(results.map((entry) => entry.name))
      .toEqual(['OpenAPI 3.1 structure gate', STARTUP_STAGE_NAME]);
    expect(results.filter((entry) => !entry.ok)).toHaveLength(2);
    expect(results[1]).toEqual({ name: STARTUP_STAGE_NAME, ok: false, detail: error.message, ms: 0 });
  });

  test('PG stage already recorded => no duplicate startup entry', () => {
    const results = [
      { name: 'OpenAPI 3.1 structure gate', ok: false, detail: 'boom', ms: 3 },
      { name: POSTGRES_STAGE_NAMES[0], ok: true, detail: '', ms: 10 },
      { name: POSTGRES_STAGE_NAMES[1], ok: false, detail: 'jest exited with 1', ms: 20 },
    ];

    const added = planPostgresFailureEntries({
      recordedNames: results.map((entry) => entry.name),
      error: startupError(),
    });

    expect(added).toEqual([]);
  });

  test('teardown-only failure => teardown entry only', () => {
    const results = [
      { name: 'OpenAPI 3.1 structure gate', ok: true, detail: '', ms: 3 },
      { name: POSTGRES_STAGE_NAMES[0], ok: true, detail: '', ms: 10 },
      { name: POSTGRES_STAGE_NAMES[1], ok: true, detail: '', ms: 20 },
    ];

    apply(results, teardownError());

    expect(results.map((entry) => entry.name)).toEqual([
      'OpenAPI 3.1 structure gate',
      POSTGRES_STAGE_NAMES[0],
      POSTGRES_STAGE_NAMES[1],
      TEARDOWN_STAGE_NAME,
    ]);
    expect(results[results.length - 1].detail).toMatch(/docker compose down failed/);
  });

  test('PG startup failure + teardown failure => startup and teardown entries', () => {
    const results = [{ name: 'contract suite', ok: false, detail: 'offline failure', ms: 1 }];
    const error = withTeardown(startupError(), teardownError());

    apply(results, error);

    expect(results.map((entry) => entry.name))
      .toEqual(['contract suite', STARTUP_STAGE_NAME, TEARDOWN_STAGE_NAME]);
    expect(results[1].detail).toMatch(/docker compose -p/);
    expect(results[2].detail).toMatch(/down failed/);
  });

  test('PG stage recorded + teardown failure => teardown entry only, never a duplicate', () => {
    const results = [
      { name: POSTGRES_STAGE_NAMES[0], ok: false, detail: 'migration exited with 1', ms: 10 },
    ];
    const error = withTeardown(new Error('migration stage exited with 1'), teardownError());

    apply(results, error);

    expect(results.map((entry) => entry.name)).toEqual([POSTGRES_STAGE_NAMES[0], TEARDOWN_STAGE_NAME]);
  });

  test('no error => no extra entries', () => {
    expect(planPostgresFailureEntries({ recordedNames: [], error: null })).toEqual([]);
    expect(planPostgresFailureEntries()).toEqual([]);
  });

  test('verify.js delegates the decision to the helper (no failedBefore predicate)', () => {
    const source = fs.readFileSync(path.join(BACKEND_DIR, 'scripts', 'tow', 'verify.js'), 'utf8');
    expect(source).toContain("require('./verify-stage-recording')");
    expect(source).toContain('planPostgresFailureEntries');
    expect(source).not.toContain('failedBefore');
  });
});
