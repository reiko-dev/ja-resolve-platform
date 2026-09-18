#!/usr/bin/env node
/**
 * T00 — pure decision logic for recording PostgreSQL failures in `verify:tow`.
 *
 * Codex round-3 P2 (thread 4048484296): `verify.js` used to compute
 * `failedBefore = results.some((entry) => !entry.ok)` and skipped the
 * PostgreSQL entry whenever ANY earlier offline stage had failed. A startup or
 * health failure that happened before the inner PG stages ran was therefore
 * silently omitted from the summary (the comment claimed it kept its own stage
 * entry; it did not), misdiagnosing multi-failure CI runs.
 *
 * The decision is extracted here so it can be unit-tested without spawning
 * Docker, Jest or the whole gate:
 *
 *   - a failure that did NOT record a PostgreSQL stage entry (opt-in veto,
 *     startup, health wait) always yields a `PostgreSQL environment (startup)`
 *     entry, even when unrelated earlier stages failed;
 *   - a failure whose PostgreSQL stage already recorded an entry is not
 *     duplicated;
 *   - a teardown failure always keeps its own `teardown (docker compose down)`
 *     entry (Muse M4-2 / Codex thread 4048163642), never merged.
 */
'use strict';

/** Stage names `verify.js` pushes from inside the PostgreSQL workload. */
const POSTGRES_STAGE_NAMES = Object.freeze([
  'prepare database + migrations from zero',
  'PostgreSQL foundation gate',
]);

const STARTUP_STAGE_NAME = 'PostgreSQL environment (startup)';
const TEARDOWN_STAGE_NAME = 'teardown (docker compose down)';

/** The teardown failure carried by `error`, if any (Muse M4-2 contract). */
function teardownErrorOf(error) {
  if (!error) return null;
  return error.teardownError || (error.isTeardownFailure ? error : null);
}

function detailOf(error) {
  return error && error.message ? error.message : String(error);
}

/**
 * Summary entries a failed PostgreSQL stage must add.
 *
 * @param {{ recordedNames?: string[], error?: Error }} input
 *   `recordedNames` are the stage names already pushed into the summary.
 * @returns {Array<{name: string, ok: false, detail: string, ms: number}>}
 */
function planPostgresFailureEntries({ recordedNames = [], error } = {}) {
  const entries = [];
  if (!error) return entries;

  const postgresRecorded = POSTGRES_STAGE_NAMES.some((name) => recordedNames.includes(name));
  if (!postgresRecorded) {
    entries.push({ name: STARTUP_STAGE_NAME, ok: false, detail: detailOf(error), ms: 0 });
  }

  const teardownError = teardownErrorOf(error);
  if (teardownError) {
    entries.push({ name: TEARDOWN_STAGE_NAME, ok: false, detail: detailOf(teardownError), ms: 0 });
  }

  return entries;
}

module.exports = {
  POSTGRES_STAGE_NAMES,
  STARTUP_STAGE_NAME,
  TEARDOWN_STAGE_NAME,
  planPostgresFailureEntries,
};
