#!/usr/bin/env node
/**
 * T00 — explicit loader for the disposable PostgreSQL test configuration.
 *
 * Single loading strategy for the whole Tow harness (Codex finding C1):
 *
 *   1. the ONLY file the harness ever reads is `socorre_ai_backend/.env.test`;
 *   2. it is OPTIONAL — when it is absent the safe defaults resolved by
 *      `scripts/tow/pg-guard.js` apply unchanged, so a fresh clone needs no
 *      `.env.test` to run the offline gates;
 *   3. values already present in the process environment (shell / CI) always
 *      win. The file is never loaded with `override: true` and an explicit
 *      environment is never replaced;
 *   4. `socorre_ai_backend/.env` (development/production secrets) is NEVER read
 *      here. `dotenv.config()` without a path loads `.env`, which is exactly
 *      the bug this module removes from the harness path;
 *   5. the path is overridable for regression tests through
 *      `TOW_TEST_ENV_FILE` (absolute, or relative to `socorre_ai_backend/`).
 *
 * The loaded values are ordinary environment variables, so every child process
 * spawned by the harness (docker compose, migrations, Jest) inherits the same
 * effective configuration.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const DEFAULT_ENV_FILE = path.join(BACKEND_DIR, '.env.test');

/** Result cache for the real `process.env` (idempotent, single read per run). */
const processEnvCache = new Map();

/**
 * Resolve which env file the harness reads.
 * `TOW_TEST_ENV_FILE` wins (test seam); otherwise `<backend>/.env.test`.
 */
function resolveEnvFilePath(env = process.env) {
  const override = env.TOW_TEST_ENV_FILE;
  if (override && String(override).trim()) {
    const candidate = String(override).trim();
    return path.isAbsolute(candidate) ? candidate : path.resolve(BACKEND_DIR, candidate);
  }
  return DEFAULT_ENV_FILE;
}

/**
 * A variable counts as "explicitly provided" only when it is present and
 * non-empty: the guard resolves empty values to its defaults, so treating an
 * empty string as an override would make Compose and Knex diverge.
 */
function hasEffectiveValue(env, key) {
  return Object.prototype.hasOwnProperty.call(env, key)
    && String(env[key] === undefined || env[key] === null ? '' : env[key]).trim() !== '';
}

/**
 * Load the harness env file into `env` (defaults to `process.env`).
 *
 * @param {{ env?: object, path?: string }} [options]
 * @returns {{ path: string, exists: boolean, applied: string[], keptFromEnvironment: string[], note: string }}
 */
function loadTestEnvFile(options = {}) {
  const useProcessEnv = options.env === undefined;
  const env = useProcessEnv ? process.env : options.env;
  const filePath = options.path
    ? path.resolve(String(options.path))
    : resolveEnvFilePath(env);

  if (useProcessEnv && processEnvCache.has(filePath)) {
    return processEnvCache.get(filePath);
  }

  const result = {
    path: filePath,
    exists: false,
    applied: [],
    keptFromEnvironment: [],
    note: '',
  };

  if (!fs.existsSync(filePath)) {
    result.note = 'not present (optional: safe defaults apply)';
    if (useProcessEnv) processEnvCache.set(filePath, result);
    return result;
  }

  const parsed = dotenv.parse(fs.readFileSync(filePath));
  for (const [key, value] of Object.entries(parsed)) {
    if (hasEffectiveValue(env, key)) {
      result.keptFromEnvironment.push(key);
    } else {
      env[key] = value;
      result.applied.push(key);
    }
  }
  result.exists = true;
  result.note = `${result.applied.length} value(s) applied, ${result.keptFromEnvironment.length} kept from the environment`;

  if (useProcessEnv) processEnvCache.set(filePath, result);
  return result;
}

/** Last result produced for the real `process.env` (for CLI/log output). */
function lastLoadedEnvFileInfo() {
  const filePath = resolveEnvFilePath(process.env);
  return processEnvCache.get(filePath) || null;
}

/** Human-readable, secret-free description of the loading outcome. */
function describeEnvFile(info) {
  if (!info) return 'env file: not inspected yet';
  if (!info.exists) return `env file: ${info.path} ${info.note}`;
  return `env file: ${info.path} loaded (${info.note})`;
}

module.exports = {
  BACKEND_DIR,
  DEFAULT_ENV_FILE,
  hasEffectiveValue,
  resolveEnvFilePath,
  loadTestEnvFile,
  lastLoadedEnvFileInfo,
  describeEnvFile,
};
