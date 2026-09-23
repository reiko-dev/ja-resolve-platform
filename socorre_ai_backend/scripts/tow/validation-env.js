#!/usr/bin/env node
/**
 * Tow local validation environment — orchestrator CLI.
 *
 * Boots the disposable PostgreSQL container with a dedicated VALIDATION profile
 * (`.env.validation`, port 55433) and drives migrate/seed/reset, so the shared
 * test environment (`socorre_ai_tow_test` on port 55432) is never touched.
 *
 * Commands:
 *   node scripts/tow/validation-env.js up       # start the container (waits for health)
 *   node scripts/tow/validation-env.js down     # destroy container/volume/network
 *   node scripts/tow/validation-env.js status    # docker compose ps for the validation project
 *   node scripts/tow/validation-env.js migrate   # migrate the validation database
 *   node scripts/tow/validation-env.js seed      # seed the validation cast
 *   node scripts/tow/validation-env.js reset     # up -> drop public -> migrate -> seed (container stays UP)
 *
 * Defensive profile rule (this file): `DB_NAME_TEST` MUST end with
 * `_validation_test`. The executable refuses otherwise, so a stray shell
 * variable can never point a validation run at the shared test database. The
 * name is intentionally flexible inside that namespace; `.env.validation.example`
 * pins it to `socorre_tow_validation_test`.
 *
 * Everything reuses the T00/T01 harness (`pg-guard`, `test-env`, `db-reset`,
 * `db-baseline`): this CLI adds NO second migration path and NO second
 * destructive primitive. Failures are loud; the safe target description is
 * printed for every command and never contains a password.
 */
'use strict';

// Profile selection BEFORE any harness module is required. `pg-guard` and
// `test-env` read the env file during their module initialization, so these
// two lines are load-bearing and must stay at the top.
process.env.TOW_TEST_ENV_FILE = process.env.TOW_TEST_ENV_FILE || '.env.validation';
process.env.TOW_TEST_PG_PROJECT = process.env.TOW_TEST_PG_PROJECT || 'socorre-tow-validation';

const { describeEnvFile, loadTestEnvFile } = require('./test-env-file');

// Load the profile once for the whole process; every module below shares it.
const envFileInfo = loadTestEnvFile();

const {
  checkTestEnvironment,
  describeTarget,
  resolveTestTarget,
} = require('./pg-guard');
const {
  resolveComposeProject,
  up,
  down,
  status,
} = require('./test-env');
const { createConnection } = require('./db-connection');
const { resetDatabase } = require('./db-reset');
const { migrateBaseline } = require('./db-baseline');
const { RESET_CONFIRM_TOKEN } = require('./db-reset-guard');
const { seedValidation, printSeedResult } = require('./validation-seed');

/** The database namespace this executable is allowed to manage. */
const VALIDATION_DB_SUFFIX = '_validation_test';

const PROFILE_HINT =
  'Copy .env.validation.example to .env.validation inside socorre_ai_backend '
  + '(or set TOW_TEST_ENV_FILE to that profile) and retry.';

/**
 * Refuse anything that is not a validation-namespaced database.
 *
 * @param {object} [env]
 * @returns {string} the accepted `DB_NAME_TEST`
 */
function assertValidationDatabaseName(env = process.env) {
  const name = String(env.DB_NAME_TEST === undefined || env.DB_NAME_TEST === null ? '' : env.DB_NAME_TEST).trim();
  if (name === '') {
    const error = new Error(
      `DB_NAME_TEST is not set: refusing to run the validation profile. ${PROFILE_HINT}`
    );
    error.code = 'VALIDATION_DB_NOT_SET';
    throw error;
  }
  if (!name.endsWith(VALIDATION_DB_SUFFIX)) {
    const error = new Error(
      `DB_NAME_TEST "${name}" does not end with "${VALIDATION_DB_SUFFIX}": refusing to run the `
      + `validation profile against a shared or non-validation database. ${PROFILE_HINT}`
    );
    error.code = 'VALIDATION_DB_UNSAFE';
    throw error;
  }
  return name;
}

/**
 * Assert BOTH the validation namespace and every T00 harness rule (opt-in,
 * loopback host, no DATABASE_URL, non-privileged user).
 */
function assertValidationTarget(env = process.env) {
  assertValidationDatabaseName(env);
  const check = checkTestEnvironment(env);
  if (!check.safe) {
    const error = new Error(
      `validation profile is not a safe disposable target:\n  - ${check.violations.join('\n  - ')}`
    );
    error.code = 'UNSAFE_VALIDATION_TARGET';
    error.violations = check.violations;
    throw error;
  }
  return check.target;
}

/** Password-free, log-safe description of the resolved target. */
function safeTargetDescription(env = process.env) {
  return describeTarget(resolveTestTarget(env));
}

function printBanner() {
  const target = resolveTestTarget(process.env);
  console.log(`[validation] ${describeEnvFile(envFileInfo)}`);
  console.log(`[validation] target: ${safeTargetDescription()}`);
  console.log(`[validation] compose project: ${resolveComposeProject()}`);
  if (String(target.port) === '55432') {
    console.warn(
      '[validation] WARNING: DB_PORT=55432 belongs to an unrelated local project; '
      + 'the validation profile pins 55433 in .env.validation.example.'
    );
  }
}

function runUp() {
  assertValidationTarget();
  up();
  console.log(`VALIDATION_DB=UP target=${safeTargetDescription()}`);
}

function runDown() {
  assertValidationTarget();
  down();
  console.log(`VALIDATION_DB=DOWN target=${safeTargetDescription()}`);
}

function runStatus() {
  assertValidationTarget();
  status();
  console.log(`VALIDATION_DB=STATUS target=${safeTargetDescription()}`);
}

/** Migrate the validation database. Returns `{ batch, applied }`. */
async function runMigrate() {
  assertValidationTarget();
  const db = createConnection({ purpose: 'test' });
  try {
    const { batch, applied } = await migrateBaseline(db);
    console.log(`[validation] migrations applied: ${applied.length} (batch ${batch})`);
    for (const name of applied) console.log(`[validation]   + ${name}`);
    console.log(`VALIDATION_MIGRATIONS=${applied.length} target=${safeTargetDescription()}`);
    return { batch, applied };
  } finally {
    await db.destroy();
  }
}

/** Seed the validation cast. Returns the seed result. */
async function runSeed() {
  assertValidationTarget();
  const db = createConnection({ purpose: 'test' });
  try {
    const result = await seedValidation(db);
    printSeedResult(result);
    console.log(`VALIDATION_SEED=OK target=${safeTargetDescription()}`);
    return result;
  } finally {
    await db.destroy();
  }
}

/**
 * THE validation reset — the exact sequence a human needs before testing:
 *
 *   up (container stays UP) -> drop public -> migrate -> seed.
 *
 * Exported so `scripts/tow/validation-smoke.js` performs the SAME deterministic
 * cleanup instead of duplicating it.
 *
 * @returns {Promise<{ reset: object, migration: object, seed: object }>}
 */
async function runReset() {
  assertValidationTarget();
  up();
  const reset = await resetDatabase({ purpose: 'test', confirm: RESET_CONFIRM_TOKEN });
  console.log(
    `[validation] schema "public" recreated empty (dropped ${reset.dropped.length} table(s))`
  );

  const db = createConnection({ purpose: 'test' });
  let migration;
  let seed;
  try {
    migration = await migrateBaseline(db);
    console.log(`[validation] migrations applied: ${migration.applied.length} (batch ${migration.batch})`);
    for (const name of migration.applied) console.log(`[validation]   + ${name}`);
    seed = await seedValidation(db);
    printSeedResult(seed);
  } finally {
    await db.destroy();
  }

  // The container MUST stay UP: the human runs the backend against it next.
  console.log(`VALIDATION_DB=READY target=${safeTargetDescription()}`);
  return { reset, migration, seed };
}

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'status';
  printBanner();

  switch (command) {
    case 'up':
      runUp();
      return;
    case 'down':
      runDown();
      return;
    case 'status':
      runStatus();
      return;
    case 'migrate':
      await runMigrate();
      return;
    case 'seed':
      await runSeed();
      return;
    case 'reset':
      await runReset();
      return;
    default:
      console.error(
        `[validation] unknown command "${command}" (expected: up, down, status, migrate, seed, reset)`
      );
      process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[validation] ${error && error.message ? error.message : error}`);
    process.exitCode = 1;
  });
}

module.exports = {
  VALIDATION_DB_SUFFIX,
  PROFILE_HINT,
  assertValidationDatabaseName,
  assertValidationTarget,
  safeTargetDescription,
  runUp,
  runDown,
  runStatus,
  runMigrate,
  runSeed,
  runReset,
  main,
};
