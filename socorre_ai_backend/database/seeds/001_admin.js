/**
 * T01 — `knex seed:run` entry point.
 *
 * Thin wrapper: the logic lives in `scripts/tow/admin-seed.js` so the same code
 * is used by the CLI (`npm run db:seed`), by the clean-database gate and by the
 * automated tests. This file only adapts the Knex seed signature.
 *
 * Credentials come from the environment (`ADMIN_EMAIL`, `ADMIN_PASSWORD`,
 * `ADMIN_NAME`); there is no fallback value. Running this seed twice is a no-op
 * the second time.
 */
'use strict';

const { seedDefaultAdmin, describeSeedResult } = require('../../scripts/tow/admin-seed');

exports.seed = async function seed(knex) {
  const result = await seedDefaultAdmin(knex);
  // eslint-disable-next-line no-console
  console.log(`[seed] ${describeSeedResult(result)}`);
  return result;
};
