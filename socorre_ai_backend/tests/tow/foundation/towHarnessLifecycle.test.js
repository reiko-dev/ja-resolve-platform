/**
 * T00 — regression: the disposable environment is always torn down.
 *
 * Codex finding C3: `runWithEnvironment()` used to call `up()` OUTSIDE the
 * `try/finally` that runs `down()`. A startup that failed part-way (image pull
 * error, port already in use, health timeout) therefore left the container,
 * its tmpfs volume and the network behind, and the next run reused a dirty
 * environment.
 *
 * This suite proves the lifecycle deterministically and WITHOUT Docker, through
 * the `runWithEnvironment(fn, { up, waitForHealth, down, env })` seam:
 *   1. happy path order: up -> wait -> workload -> down;
 *   2. `up()` throwing still runs `down()`;
 *   3. `waitForHealth()` throwing still runs `down()`;
 *   4. the workload throwing still runs `down()` and the original error wins;
 *   5. the safety guard runs BEFORE any startup (fail closed);
 *   6. a teardown failure fails the gate when no earlier error exists, and is
 *      attached as `error.teardownError` when an earlier error exists (M4-2);
 *   7. the real `down()` is idempotent with nothing to remove but propagates a
 *      genuine docker failure (M4-2 / Codex thread 4048163642).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const testEnv = require('../../../scripts/tow/test-env.js');

const BACKEND_DIR = path.resolve(__dirname, '..', '..', '..');
const SAFE_ENV = {
  TOW_POSTGRES_E2E: '1',
  DB_HOST: '127.0.0.1',
  DB_PORT: '55432',
  DB_NAME_TEST: 'socorre_ai_tow_test',
  DB_USER: 'tow_test',
  DB_PASSWORD: 'tow_test_password',
};

function recorder() {
  const calls = [];
  return {
    calls,
    up: () => calls.push('up'),
    waitForHealth: () => calls.push('wait'),
    down: () => calls.push('down'),
  };
}

const tempDirs = [];
function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tow-lifecycle-'));
  tempDirs.push(dir);
  return dir;
}

/**
 * Fake `docker` on PATH: `compose down` exits `downStatus`, every other
 * command exits 0. No mocking framework, no Docker daemon.
 */
function writeFakeDocker(dir, downStatus) {
  const fake = path.join(dir, 'docker');
  fs.writeFileSync(fake, [
    '#!/bin/sh',
    'for arg in "$@"; do',
    '  if [ "$arg" = "down" ]; then',
    '    echo "fake docker: refusing to tear down" >&2',
    `    exit ${downStatus}`,
    '  fi',
    'done',
    'echo "fake docker: $@"',
    'exit 0',
    '',
  ].join('\n'));
  fs.chmodSync(fake, 0o755);
  return fake;
}

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('T00 harness lifecycle (Codex finding C3)', () => {
  test('happy path: up -> wait -> workload -> down, in that order', async () => {
    const spy = recorder();
    const seen = [];

    const result = await testEnv.runWithEnvironment(async (target) => {
      seen.push('workload');
      return target.database;
    }, { env: { ...SAFE_ENV }, ...spy });

    expect(result).toBe('socorre_ai_tow_test');
    expect(seen).toEqual(['workload']);
    expect(spy.calls).toEqual(['up', 'wait', 'down']);
  });

  test('down() runs even when up() fails part-way (the regression)', async () => {
    const spy = recorder();
    spy.up = () => {
      spy.calls.push('up');
      throw new Error('port is already allocated');
    };

    await expect(testEnv.runWithEnvironment(async () => 'never', { env: { ...SAFE_ENV }, ...spy }))
      .rejects.toThrow(/port is already allocated/);

    expect(spy.calls).toEqual(['up', 'down']);
  });

  test('down() runs even when the healthcheck times out', async () => {
    const spy = recorder();
    spy.waitForHealth = () => {
      spy.calls.push('wait');
      throw new Error('did not become healthy');
    };

    await expect(testEnv.runWithEnvironment(async () => 'never', { env: { ...SAFE_ENV }, ...spy }))
      .rejects.toThrow(/did not become healthy/);

    expect(spy.calls).toEqual(['up', 'wait', 'down']);
  });

  test('down() runs when the workload fails, and the workload error wins', async () => {
    const spy = recorder();

    await expect(testEnv.runWithEnvironment(async () => {
      throw new Error('migration failed');
    }, { env: { ...SAFE_ENV }, ...spy })).rejects.toThrow(/migration failed/);

    expect(spy.calls).toEqual(['up', 'wait', 'down']);
  });

  test('a teardown failure with no earlier error rejects with the teardown error', async () => {
    const spy = recorder();
    const teardown = new Error('docker compose down failed (exit status 1)');
    spy.down = () => {
      spy.calls.push('down');
      throw teardown;
    };

    let caught;
    try {
      await testEnv.runWithEnvironment(async () => 'green stages', { env: { ...SAFE_ENV }, ...spy });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(teardown);
    expect(spy.calls).toEqual(['up', 'wait', 'down']);
  });

  test('a workload error stays the rejection and carries the teardown failure', async () => {
    const spy = recorder();
    const teardown = new Error('docker compose down failed (exit status 1)');
    const workload = new Error('migration failed');
    spy.down = () => {
      spy.calls.push('down');
      throw teardown;
    };

    let caught;
    try {
      await testEnv.runWithEnvironment(async () => {
        throw workload;
      }, { env: { ...SAFE_ENV }, ...spy });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(workload);
    expect(caught.message).toMatch(/migration failed/);
    expect(caught.teardownError).toBe(teardown);
    expect(spy.calls).toEqual(['up', 'wait', 'down']);
  });

  test('a startup error also carries the teardown failure', async () => {
    const spy = recorder();
    const teardown = new Error('docker compose down failed (exit status 1)');
    const startup = new Error('port is already allocated');
    spy.up = () => {
      spy.calls.push('up');
      throw startup;
    };
    spy.down = () => {
      spy.calls.push('down');
      throw teardown;
    };

    let caught;
    try {
      await testEnv.runWithEnvironment(async () => 'never', { env: { ...SAFE_ENV }, ...spy });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(startup);
    expect(caught.teardownError).toBe(teardown);
    expect(spy.calls).toEqual(['up', 'down']);
  });

  test('the guard fails closed BEFORE any startup or teardown', async () => {
    const spy = recorder();

    await expect(testEnv.runWithEnvironment(async () => 'never', {
      env: { ...SAFE_ENV, DB_HOST: 'db.production.internal' },
      ...spy,
    })).rejects.toThrow(/refusing to start test environment/);

    expect(spy.calls).toEqual([]);
  });

  test('the canonical target is exported to the workload and to children', async () => {
    const env = { TOW_POSTGRES_E2E: '1' };
    const spy = recorder();
    let exported;

    await testEnv.runWithEnvironment(async () => {
      exported = { ...env };
    }, { env, ...spy });

    expect(exported.DB_HOST).toBe('127.0.0.1');
    expect(exported.DB_PORT).toBe('55432');
    expect(exported.DB_NAME_TEST).toBe('socorre_ai_tow_test');
    expect(exported.DB_USER).toBe('tow_test');
    expect(exported.DB_PASSWORD).toBe('tow_test_password');
    expect(exported.DB_SSL).toBe('false');
    expect(exported.NODE_ENV).toBe('test');
    expect(testEnv.targetEnv(env).DB_PORT).toBe('55432');
  });

  test('the real down() propagates a docker spawn failure (never swallowed)', () => {
    const dir = makeTempDir(); // empty PATH: `docker` does not exist
    const originalPath = process.env.PATH;
    try {
      process.env.PATH = dir;
      expect(() => testEnv.down()).toThrow(/docker compose down could not run/);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  test('the real down() is idempotent when there is nothing to remove', () => {
    // Fake docker that accepts every command and exits 0: `compose down` with
    // no resources returns 0, so teardown must resolve and report destroyed.
    const dir = makeTempDir();
    writeFakeDocker(dir, 0);

    const result = spawnSync(process.execPath, [path.join(BACKEND_DIR, 'scripts', 'tow', 'test-env.js'), 'down'], {
      cwd: BACKEND_DIR,
      encoding: 'utf8',
      env: { ...process.env, PATH: dir },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('destroyed');
  });

  test('the down CLI exits nonzero when docker refuses the teardown', () => {
    // A fake `docker` on PATH: `compose version` succeeds (so the CLI accepts
    // the command) while `compose down` fails, exactly like a Docker daemon
    // that went away mid-run. The failure must propagate to the exit code
    // (Muse M4-2 / Codex thread 4048163642).
    const dir = makeTempDir();
    writeFakeDocker(dir, 1);

    const result = spawnSync(process.execPath, [path.join(BACKEND_DIR, 'scripts', 'tow', 'test-env.js'), 'down'], {
      cwd: BACKEND_DIR,
      encoding: 'utf8',
      env: { ...process.env, PATH: dir },
    });

    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('destroyed');
    expect(result.stderr).toContain('refusing to tear down');
    expect(result.stderr).toContain('docker compose down failed (exit status 1)');
  });

  test('the guard CLI needs no Docker, while docker commands fail loudly without it', () => {
    const dir = makeTempDir(); // empty PATH: `docker` does not exist

    const guardRun = spawnSync(process.execPath, [path.join(BACKEND_DIR, 'scripts', 'tow', 'test-env.js'), 'guard'], {
      cwd: BACKEND_DIR,
      encoding: 'utf8',
      env: { ...process.env, PATH: dir, ...SAFE_ENV },
    });
    expect(guardRun.status).toBe(0);
    expect(guardRun.stdout).toContain('SAFE');
    expect(guardRun.stdout).not.toContain('docker compose is not available');

    const upRun = spawnSync(process.execPath, [path.join(BACKEND_DIR, 'scripts', 'tow', 'test-env.js'), 'up'], {
      cwd: BACKEND_DIR,
      encoding: 'utf8',
      env: { ...process.env, PATH: dir, ...SAFE_ENV },
    });
    expect(upRun.status).toBe(1);
    expect(upRun.stderr).toContain('docker compose is not available');
  });
});
