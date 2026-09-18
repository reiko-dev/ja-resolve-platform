/**
 * T00 — regression: the harness loads `socorre_ai_backend/.env.test` explicitly.
 *
 * Codex finding C1: `src/config/database.js` calls `dotenv.config()` with no
 * path, which loads `.env` — NOT `.env.test`. The harness therefore never saw
 * the documented test configuration (and a developer `.env` could silently
 * drive a test run). The fix is `scripts/tow/test-env-file.js`, wired into the
 * harness entrypoints.
 *
 * This suite proves, without Docker:
 *   1. the loader's contract (optional file, shell precedence, empty = unset);
 *   2. `.env` is NEVER read, even when it sits in the working directory;
 *   3. the REAL entrypoints (`pg-guard.js` CLI and the Knex helper) observe the
 *      file's values in a child process.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const envFile = require('../../../scripts/tow/test-env-file');

const BACKEND_DIR = path.resolve(__dirname, '..', '..', '..');
const GUARD_CLI = path.join(BACKEND_DIR, 'scripts', 'tow', 'pg-guard.js');
const POSTGRES_HELPER = path.join(BACKEND_DIR, 'tests', 'helpers', 'tow', 'postgres.js');

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tow-env-file-'));
  tempDirs.push(dir);
  return dir;
}

/** A decoy `.env` (development file) that must never influence the harness. */
function writeDecoyDotEnv(dir) {
  const decoy = path.join(dir, '.env');
  fs.writeFileSync(decoy, [
    'TOW_DECOY_FROM_DOT_ENV=loaded',
    'DB_PORT=59999',
    'DB_NAME_TEST=decoy_production',
    'DATABASE_URL=postgresql://prod:prod@db.production.internal:5432/prod',
    '',
  ].join('\n'));
  return decoy;
}

function writeTestEnvFile(dir, contents) {
  const file = path.join(dir, '.env.test');
  fs.writeFileSync(file, contents);
  return file;
}

const TEST_ENV_BODY = [
  'TOW_POSTGRES_E2E=1',
  'DB_HOST=127.0.0.1',
  'DB_PORT=55432',
  'DB_NAME_TEST=socorre_ai_tow_test',
  'DB_USER=tow_test',
  'DB_PASSWORD=tow_test_password',
  'DB_SSL=false',
  'TOW_MARKER_FROM_TEST_ENV=yes',
  '',
].join('\n');

/**
 * Child environment with every harness-relevant variable stripped: a child must
 * observe only what the test itself provides, never the caller's shell (the
 * gates run this suite with `TOW_POSTGRES_E2E=0` on purpose).
 */
const HARNESS_KEYS = [
  'TOW_POSTGRES_E2E', 'TOW_TEST_ENV_FILE', 'TOW_TEST_PG_PORT', 'TOW_TEST_PG_HEALTH_TIMEOUT_MS',
  'DB_HOST', 'DB_PORT', 'DB_NAME_TEST', 'DB_USER', 'DB_PASSWORD', 'DB_SSL',
  'DATABASE_URL', 'PostgreSQL', 'NODE_ENV',
];

function childEnv(overrides = {}) {
  const env = { ...process.env };
  for (const key of HARNESS_KEYS) delete env[key];
  return { ...env, ...overrides };
}

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: options.cwd || BACKEND_DIR,
    encoding: 'utf8',
    env: childEnv(options.env),
  });
}

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('T00 harness env file (Codex finding C1)', () => {
  describe('loader contract', () => {
    test('applies the file values into the provided environment', () => {
      const dir = makeTempDir();
      const file = writeTestEnvFile(dir, TEST_ENV_BODY);
      const env = {};

      const info = envFile.loadTestEnvFile({ env, path: file });

      expect(info.exists).toBe(true);
      expect(info.applied).toEqual(expect.arrayContaining(['DB_PORT', 'DB_NAME_TEST', 'TOW_POSTGRES_E2E']));
      expect(env.DB_PORT).toBe('55432');
      expect(env.DB_NAME_TEST).toBe('socorre_ai_tow_test');
      expect(env.TOW_MARKER_FROM_TEST_ENV).toBe('yes');
    });

    test('shell/CI values always win (never override:true)', () => {
      const dir = makeTempDir();
      const file = writeTestEnvFile(dir, TEST_ENV_BODY);
      const env = { DB_PORT: '55999', DB_USER: 'from_shell_test' };

      const info = envFile.loadTestEnvFile({ env, path: file });

      expect(env.DB_PORT).toBe('55999');
      expect(env.DB_USER).toBe('from_shell_test');
      expect(env.DB_NAME_TEST).toBe('socorre_ai_tow_test');
      expect(info.keptFromEnvironment).toEqual(expect.arrayContaining(['DB_PORT', 'DB_USER']));
    });

    test('an empty value counts as unset (it cannot silently configure the target)', () => {
      const dir = makeTempDir();
      const file = writeTestEnvFile(dir, TEST_ENV_BODY);
      const env = { DB_PORT: '', DB_NAME_TEST: '   ' };

      envFile.loadTestEnvFile({ env, path: file });

      expect(env.DB_PORT).toBe('55432');
      expect(env.DB_NAME_TEST).toBe('socorre_ai_tow_test');
    });

    test('a missing file is not an error: the guard defaults apply', () => {
      const dir = makeTempDir();
      const env = { KEEP_ME: '1' };

      const info = envFile.loadTestEnvFile({ env, path: path.join(dir, '.env.test') });

      expect(info.exists).toBe(false);
      expect(info.applied).toEqual([]);
      expect(info.note).toMatch(/not present/);
      expect(env).toEqual({ KEEP_ME: '1' });
    });

    test('resolves the canonical path and honours TOW_TEST_ENV_FILE', () => {
      expect(envFile.resolveEnvFilePath({})).toBe(path.join(BACKEND_DIR, '.env.test'));
      expect(envFile.resolveEnvFilePath({ TOW_TEST_ENV_FILE: '/tmp/absolute.env.test' }))
        .toBe('/tmp/absolute.env.test');
      expect(envFile.resolveEnvFilePath({ TOW_TEST_ENV_FILE: 'tmp/relative.env.test' }))
        .toBe(path.join(BACKEND_DIR, 'tmp', 'relative.env.test'));
      // Blank override falls back to the canonical path.
      expect(envFile.resolveEnvFilePath({ TOW_TEST_ENV_FILE: '  ' }))
        .toBe(path.join(BACKEND_DIR, '.env.test'));
    });

    test('describeEnvFile never prints values', () => {
      const dir = makeTempDir();
      const file = writeTestEnvFile(dir, TEST_ENV_BODY);
      const info = envFile.loadTestEnvFile({ env: {}, path: file });
      const description = envFile.describeEnvFile(info);
      expect(description).toContain(file);
      expect(description).not.toContain('tow_test_password');
      expect(description).not.toContain('55432');
    });
  });

  describe('the real entrypoints observe .env.test (child processes)', () => {
    test('pg-guard CLI loads .env.test and reports the resolved target', () => {
      const dir = makeTempDir();
      const file = writeTestEnvFile(dir, TEST_ENV_BODY);
      writeDecoyDotEnv(dir);

      const result = runNode([GUARD_CLI], { cwd: dir, env: { TOW_TEST_ENV_FILE: file } });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(file);
      expect(result.stdout).toContain('postgresql://tow_test@127.0.0.1:55432/socorre_ai_tow_test');
      expect(result.stdout).toContain('SAFE');
      // The decoy `.env` in the working directory was never read.
      expect(result.stdout).not.toContain('59999');
      expect(result.stdout).not.toContain('decoy_production');
    });

    test('the Knex helper resolves the file target and exports it to the app', () => {
      const dir = makeTempDir();
      const file = writeTestEnvFile(dir, TEST_ENV_BODY);
      writeDecoyDotEnv(dir);

      const script = [
        `const postgres = require(${JSON.stringify(POSTGRES_HELPER)});`,
        'const target = postgres.safeTarget();',
        'console.log(JSON.stringify({',
        '  target,',
        '  env: {',
        '    DB_HOST: process.env.DB_HOST,',
        '    DB_PORT: process.env.DB_PORT,',
        '    DB_NAME_TEST: process.env.DB_NAME_TEST,',
        '    DB_USER: process.env.DB_USER,',
        '    DB_SSL: process.env.DB_SSL,',
        '    NODE_ENV: process.env.NODE_ENV,',
        '  },',
        '  decoy: process.env.TOW_DECOY_FROM_DOT_ENV,',
        '}));',
      ].join('\n');

      const result = runNode(['-e', script], {
        cwd: dir,
        env: { TOW_TEST_ENV_FILE: file, TOW_POSTGRES_E2E: '1' },
      });

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout.trim().split('\n').pop());
      expect(payload.target.host).toBe('127.0.0.1');
      expect(payload.target.port).toBe(55432);
      expect(payload.target.database).toBe('socorre_ai_tow_test');
      expect(payload.target.user).toBe('tow_test');
      // The canonical target is made explicit for `src/config/database.js`.
      expect(payload.env.DB_PORT).toBe('55432');
      expect(payload.env.DB_NAME_TEST).toBe('socorre_ai_tow_test');
      expect(payload.env.DB_HOST).toBe('127.0.0.1');
      expect(payload.env.DB_USER).toBe('tow_test');
      expect(payload.env.DB_SSL).toBe('false');
      // `.env` was not loaded even though it exists in the working directory.
      expect(payload.decoy).toBeUndefined();
    });

    test('shell DB_PORT beats the file, end to end', () => {
      const dir = makeTempDir();
      const file = writeTestEnvFile(dir, TEST_ENV_BODY);

      const result = runNode([GUARD_CLI], {
        cwd: dir,
        env: { TOW_TEST_ENV_FILE: file, DB_PORT: '55999' },
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('postgresql://tow_test@127.0.0.1:55999/socorre_ai_tow_test');
    });

    test('a shell TOW_POSTGRES_E2E=0 vetoes the file opt-in', () => {
      const dir = makeTempDir();
      const file = writeTestEnvFile(dir, TEST_ENV_BODY);

      const result = runNode([GUARD_CLI], {
        cwd: dir,
        env: { TOW_TEST_ENV_FILE: file, TOW_POSTGRES_E2E: '0' },
      });

      expect(result.stdout).toContain('opt-in (TOW_POSTGRES_E2E=1): no');
      expect(result.stderr).toContain('UNSAFE');
    });

    test('without a file the documented defaults still apply (no Docker needed)', () => {
      const dir = makeTempDir();
      const missing = path.join(dir, '.env.test');

      const result = runNode([GUARD_CLI], {
        cwd: dir,
        env: { TOW_TEST_ENV_FILE: missing, TOW_POSTGRES_E2E: '1' },
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('not present');
      expect(result.stdout).toContain('postgresql://tow_test@127.0.0.1:55432/socorre_ai_tow_test');
      expect(result.stdout).toContain('SAFE');
    });
  });
});
