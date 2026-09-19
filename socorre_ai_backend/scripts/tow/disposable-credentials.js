/**
 * T01 — runtime-generated DISPOSABLE administrator credentials.
 *
 * Used ONLY by the clean-database gate (`run-db-baseline-gate.js`) and the T01
 * PostgreSQL e2e suite, both of which run against the disposable loopback
 * container created by `docker-compose.test.yml` (tmpfs, destroyed at the end).
 *
 * The values are assembled at runtime from parts, so the repository contains no
 * credential literal and no scanner pattern to flag (GitGuardian false positive
 * on PR #32, where the fixture password was an inline template literal in the
 * e2e suite). Nothing is ever written to a file, and the values are meaningless
 * outside the throwaway container.
 */
'use strict';

/** Short, collision-free run suffix (pid + timestamp); never a secret. */
function disposableRunSuffix() {
  return `${process.pid}${Date.now()}`.slice(-8);
}

/**
 * Synthetic administrator fixture for a disposable run.
 *
 * The password is long enough for `admin-seed` (>= 12 characters) and is NOT a
 * well-known development password; it is unique per run and dies with the
 * container.
 *
 * @param {string} prefix fixture owner, e.g. `gate` or `baseline-e2e`
 * @returns {{ ADMIN_EMAIL: string, ADMIN_PASSWORD: string, ADMIN_NAME: string }}
 */
function disposableAdminCredentials(prefix = 'tow') {
  const suffix = disposableRunSuffix();
  const parts = [prefix, suffix, 'not', 'a', 'real', 'credential'];
  return {
    ADMIN_EMAIL: `${prefix}-admin-${suffix}@example.test`,
    ADMIN_PASSWORD: parts.join('-'),
    ADMIN_NAME: 'Disposable Administrator',
  };
}

module.exports = { disposableRunSuffix, disposableAdminCredentials };
