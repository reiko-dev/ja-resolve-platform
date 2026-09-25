/**
 * TOW CLIENT DEMO — demo tooling safety gate.
 *
 * Pins the fail-closed rules that keep `demo-seed`, `demo-reset-session` and
 * `demo-status` away from any database that is not the explicit demo target:
 * mandatory `_demo` name, loopback host, non-privileged user, explicit
 * credentials, no connection URL, `TOW_DEMO_ENV=demo`, and the per-command
 * opt-in flags. Every assertion passes an explicit env object: `process.env` is
 * never mutated, so the suite stays order-independent and offline.
 */
'use strict';

const {
  DEMO_ENV_VAR,
  SEED_FLAG,
  RESET_FLAG,
  PASSWORD_VAR,
  DEMO_ACCOUNTS,
  DEMO_EMAILS,
  DEMO_DB_SUFFIX,
  isDemoDatabaseName,
  checkDemoAuthorization,
  assertDemoAuthorized,
  describeDemoTarget,
  resolveDemoPassword,
} = require('../../../scripts/tow/demo-config');

/** A complete, authorized demo target (the shape the VPS uses). */
function validEnv(overrides = {}) {
  return {
    DB_HOST: '127.0.0.1',
    DB_PORT: '5432',
    DB_NAME: 'socorre_ai_tow_demo',
    DB_USER: 'socorre_homolog',
    DB_PASSWORD: 'not-a-real-password',
    TOW_DEMO_ENV: 'demo',
    TOW_DEMO_SEED: '1',
    TOW_DEMO_RESET_SESSION: '1',
    ...overrides,
  };
}

function violationsFor(overrides, purpose = 'seed') {
  return checkDemoAuthorization(validEnv(overrides), { purpose }).violations;
}

describe('demo tooling — target guard', () => {
  test('accepts the explicit demo target', () => {
    const result = checkDemoAuthorization(validEnv(), { purpose: 'seed' });
    expect(result.safe).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.target.database).toBe('socorre_ai_tow_demo');
  });

  test('requires the per-command opt-in flag', () => {
    expect(violationsFor({ [SEED_FLAG]: '' })).toEqual(
      expect.arrayContaining([expect.stringContaining(SEED_FLAG)])
    );
    expect(checkDemoAuthorization(validEnv(), { purpose: 'reset-session' }).safe).toBe(true);
    expect(violationsFor({ [RESET_FLAG]: undefined }, 'reset-session')).toEqual(
      expect.arrayContaining([expect.stringContaining(RESET_FLAG)])
    );
  });

  test('requires TOW_DEMO_ENV=demo', () => {
    expect(violationsFor({ [DEMO_ENV_VAR]: undefined })).toEqual(
      expect.arrayContaining([expect.stringContaining(DEMO_ENV_VAR)])
    );
    expect(violationsFor({ [DEMO_ENV_VAR]: 'production' })).toEqual(
      expect.arrayContaining([expect.stringContaining(DEMO_ENV_VAR)])
    );
  });

  test('requires a database name ending in _demo', () => {
    expect(violationsFor({ DB_NAME: 'socorre_ai_homolog' })).toEqual(
      expect.arrayContaining([expect.stringContaining('forbidden hint "homolog"')])
    );
    expect(violationsFor({ DB_NAME: 'socorre_ai_production' })).toEqual(
      expect.arrayContaining([expect.stringContaining('forbidden hint "prod"')])
    );
    expect(violationsFor({ DB_NAME: 'socorre_ai_staging' })).toEqual(
      expect.arrayContaining([expect.stringContaining('forbidden hint "staging"')])
    );
    expect(violationsFor({ DB_NAME: 'socorre_ai_dev' })).toEqual(
      expect.arrayContaining([expect.stringContaining(DEMO_DB_SUFFIX)])
    );
  });

  test('requires a loopback, non-wildcard host', () => {
    expect(violationsFor({ DB_HOST: '10.0.0.5' })).toEqual(
      expect.arrayContaining([expect.stringContaining('loopback')])
    );
    expect(violationsFor({ DB_HOST: '0.0.0.0' })).toEqual(
      expect.arrayContaining([expect.stringContaining('wildcard')])
    );
  });

  test('refuses connection URLs and privileged roles', () => {
    expect(violationsFor({ DATABASE_URL: 'postgres://anywhere/db' })).toEqual(
      expect.arrayContaining([expect.stringContaining('DATABASE_URL')])
    );
    expect(violationsFor({ PostgreSQL: 'postgres://anywhere/db' })).toEqual(
      expect.arrayContaining([expect.stringContaining('DATABASE_URL')])
    );
    expect(violationsFor({ DB_USER: 'postgres' })).toEqual(
      expect.arrayContaining([expect.stringContaining('privileged')])
    );
    expect(violationsFor({ DB_USER: 'root' })).toEqual(
      expect.arrayContaining([expect.stringContaining('privileged')])
    );
  });

  test('requires an explicit, complete target', () => {
    for (const missing of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
      expect(violationsFor({ [missing]: '' })).toEqual(
        expect.arrayContaining([expect.stringContaining(missing)])
      );
    }
  });

  test('assertDemoAuthorized throws a structured error on refusal', () => {
    expect(() => assertDemoAuthorized(validEnv({ DB_NAME: 'socorre_ai_homolog' }), { purpose: 'seed' }))
      .toThrow(expect.objectContaining({ code: 'UNSAFE_DEMO_TARGET' }));
    const target = assertDemoAuthorized(validEnv(), { purpose: 'reset-session' });
    expect(target.user).toBe('socorre_homolog');
  });

  test('describeDemoTarget never carries the password', () => {
    const description = describeDemoTarget(checkDemoAuthorization(validEnv(), { purpose: 'seed' }).target);
    expect(description).toContain('socorre_ai_tow_demo');
    expect(description).not.toContain('not-a-real-password');
  });

  test('isDemoDatabaseName only accepts the _demo namespace', () => {
    expect(isDemoDatabaseName('socorre_ai_tow_demo')).toBe(true);
    expect(isDemoDatabaseName('Socorre_AI_Tow_DEMO')).toBe(true);
    expect(isDemoDatabaseName('socorre_ai_homolog')).toBe(false);
    expect(isDemoDatabaseName('')).toBe(false);
  });
});

describe('demo tooling — credentials', () => {
  test('resolveDemoPassword never defaults', () => {
    expect(() => resolveDemoPassword({})).toThrow(
      expect.objectContaining({ code: 'DEMO_PASSWORD_MISSING' })
    );
    expect(() => resolveDemoPassword({ [PASSWORD_VAR]: 'short' })).toThrow(
      expect.objectContaining({ code: 'DEMO_PASSWORD_MISSING' })
    );
    expect(resolveDemoPassword({ [PASSWORD_VAR]: 'DemoPassword123!' })).toBe('DemoPassword123!');
  });

  test('the demo cast is the fixed, lowercase pair', () => {
    expect(DEMO_EMAILS).toEqual([
      DEMO_ACCOUNTS.CUSTOMER.email.toLowerCase(),
      DEMO_ACCOUNTS.PARTNER.email.toLowerCase(),
    ]);
    expect(DEMO_ACCOUNTS.CUSTOMER.role).toBe('user');
    expect(DEMO_ACCOUNTS.PARTNER.role).toBe('partner');
    expect(DEMO_ACCOUNTS.PARTNER.onboardingPartnerType).toBe('tow');
    expect(DEMO_EMAILS).toEqual([
      'cliente.demo@jaresolve.com.br',
      'parceiro.demo@jaresolve.com.br',
    ]);
  });
});

describe('demo tooling — seed/reset modules', () => {
  test('expose the operational entry points', () => {
    const seed = require('../../../scripts/tow/demo-seed');
    const reset = require('../../../scripts/tow/demo-reset-session');
    const status = require('../../../scripts/tow/demo-status');
    expect(typeof seed.seedDemo).toBe('function');
    expect(typeof seed.deleteDemoTowData).toBe('function');
    expect(typeof seed.restoreDemoPartnerOperational).toBe('function');
    expect(typeof reset.resetDemoSession).toBe('function');
    expect(typeof status.collectDemoStatus).toBe('function');
  });

  test('seedDemo refuses a non-Knex handle before touching anything', async () => {
    const { seedDemo } = require('../../../scripts/tow/demo-seed');
    await expect(seedDemo(null)).rejects.toThrow(/requires a Knex connection/);
  });
});
