/**
 * T01 — SEED suite: the default administrator seed is configuration-driven,
 * idempotent and never creates functional data.
 *
 * The credential rules and the conflict/idempotency logic run offline against
 * the in-memory SQLite harness (the `users` table shape is the same); the
 * clean-database gate and `tests/tow/baseline/dbBaseline.e2e.test.js` prove the
 * same behaviour on real PostgreSQL.
 */
'use strict';

const bcrypt = require('bcryptjs');
const testDb = require('../../helpers/testDb');
const {
  BCRYPT_ROUNDS,
  MIN_PASSWORD_LENGTH,
  DEFAULT_ADMIN_NAME,
  AdminSeedConfigError,
  AdminSeedConflictError,
  resolveAdminCredentials,
  seedAdmin,
  seedDefaultAdmin,
  describeSeedResult,
} = require('../../../scripts/tow/admin-seed');

const VALID = {
  ADMIN_EMAIL: 'Admin@Example.test',
  ADMIN_PASSWORD: 'a-very-long-password-123',
  ADMIN_NAME: 'Administradora Teste',
};

describe('T01 SEED — administrator credentials come from the environment', () => {
  test('reads and normalizes ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_NAME', () => {
    const credentials = resolveAdminCredentials(VALID);
    expect(credentials).toEqual({
      email: 'admin@example.test',
      password: 'a-very-long-password-123',
      name: 'Administradora Teste',
    });
  });

  test('defaults the display name without defaulting the password', () => {
    const credentials = resolveAdminCredentials({ ...VALID, ADMIN_NAME: '' });
    expect(credentials.name).toBe(DEFAULT_ADMIN_NAME);
    expect(credentials.password).toBe(VALID.ADMIN_PASSWORD);
  });

  test('requires ADMIN_EMAIL', () => {
    expect(() => resolveAdminCredentials({ ...VALID, ADMIN_EMAIL: '' })).toThrow(AdminSeedConfigError);
    expect(() => resolveAdminCredentials({ ...VALID, ADMIN_EMAIL: undefined })).toThrow(/ADMIN_EMAIL is required/);
  });

  test('rejects a malformed ADMIN_EMAIL', () => {
    for (const email of ['admin', 'admin@', '@example.test', 'admin example@test.com']) {
      expect(() => resolveAdminCredentials({ ...VALID, ADMIN_EMAIL: email })).toThrow(AdminSeedConfigError);
    }
  });

  test('requires ADMIN_PASSWORD with no fallback value', () => {
    expect(() => resolveAdminCredentials({ ...VALID, ADMIN_PASSWORD: '' })).toThrow(/ADMIN_PASSWORD is required/);
    expect(() => resolveAdminCredentials({ ...VALID, ADMIN_PASSWORD: undefined })).toThrow(/ADMIN_PASSWORD is required/);
  });

  test(`requires at least ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(() => resolveAdminCredentials({ ...VALID, ADMIN_PASSWORD: 'short-pass' })).toThrow(/at least 12 characters/);
    expect(resolveAdminCredentials({ ...VALID, ADMIN_PASSWORD: 'x'.repeat(MIN_PASSWORD_LENGTH) }).password)
      .toHaveLength(MIN_PASSWORD_LENGTH);
  });

  test('rejects the well-known development passwords of the legacy seed', () => {
    for (const password of ['admin123', 'admin1234', 'password', 'changeme', '123456789012']) {
      expect(() => resolveAdminCredentials({ ...VALID, ADMIN_PASSWORD: password })).toThrow(AdminSeedConfigError);
    }
  });

  test('rejects a password equal to the e-mail local part', () => {
    expect(() => resolveAdminCredentials({
      ADMIN_EMAIL: 'repeated-password@example.test',
      ADMIN_PASSWORD: 'repeated-password',
    })).toThrow(/local part/);
  });
});

describe('T01 SEED — no secret in the source or in the logs', () => {
  const fs = require('fs');
  const path = require('path');

  const SOURCE_FILES = [
    'database/seeds/001_admin.js',
    'scripts/tow/admin-seed.js',
    'scripts/tow/db-seed.js',
    'scripts/tow/db-baseline.js',
  ];

  test('no seed source file contains a hardcoded credential', () => {
    const backendRoot = path.resolve(__dirname, '..', '..', '..');
    for (const relative of SOURCE_FILES) {
      // Comments (which document the removed legacy password) and the denylist
      // of rejected passwords are not credentials; strip them before scanning.
      const source = fs.readFileSync(path.join(backendRoot, relative), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/const FORBIDDEN_PASSWORDS = \[[\s\S]*?\];/, '');
      // A bcrypt hash literal or the old development password would be a leak.
      expect({ file: relative, hash: /\$2[aby]\$\d{2}\$/.test(source) }).toEqual({ file: relative, hash: false });
      expect({ file: relative, legacy: /admin123/.test(source) }).toEqual({ file: relative, legacy: false });
      expect({ file: relative, assignment: /password\s*[:=]\s*['"][^'"]+['"]/i.test(source) })
        .toEqual({ file: relative, assignment: false });
    }
  });

  test('describeSeedResult never contains the password or the hash', () => {
    const description = describeSeedResult({
      created: true,
      reason: 'created',
      userId: 7,
      email: 'admin@example.test',
      password: 'should-never-appear',
      hash: '$2a$12$should-never-appear',
    });
    expect(description).toContain('admin@example.test');
    expect(description).not.toContain('should-never-appear');
  });
});

describe('T01 SEED — idempotency and conflicts (SQLite harness)', () => {
  beforeEach(async () => {
    await testDb.reset();
  });

  test('creates exactly one administrator with a bcrypt hash at cost 12', async () => {
    const credentials = resolveAdminCredentials(VALID);
    const result = await seedAdmin(testDb.db, credentials);

    expect(result.created).toBe(true);
    expect(result.email).toBe('admin@example.test');

    const users = await testDb.db('users').select('*');
    expect(users).toHaveLength(1);
    const admin = users[0];
    expect(admin.role).toBe('admin');
    expect(admin.email).toBe('admin@example.test');
    expect(admin.name).toBe('Administradora Teste');
    expect(admin.password).not.toBe(credentials.password);
    expect(admin.password).toMatch(new RegExp(`^\\$2[aby]\\$${BCRYPT_ROUNDS}\\$`));
    await expect(bcrypt.compare(credentials.password, admin.password)).resolves.toBe(true);
  });

  test('a second run creates no duplicate and does not rotate the password', async () => {
    const credentials = resolveAdminCredentials(VALID);
    const first = await seedAdmin(testDb.db, credentials);
    const hashBefore = (await testDb.db('users').where({ id: first.userId }).first()).password;

    const second = await seedAdmin(testDb.db, resolveAdminCredentials({
      ...VALID,
      ADMIN_PASSWORD: 'a-completely-different-password',
    }));

    expect(second.created).toBe(false);
    expect(second.reason).toBe('admin-already-exists');
    expect(second.userId).toBe(first.userId);
    expect(await testDb.db('users').count({ count: '*' }).first()).toMatchObject({ count: 1 });
    const hashAfter = (await testDb.db('users').where({ id: first.userId }).first()).password;
    expect(hashAfter).toBe(hashBefore);
  });

  test('finds an existing administrator regardless of e-mail case', async () => {
    const first = await seedAdmin(testDb.db, {
      email: 'mixed@example.test',
      password: 'a-very-long-password-123',
      name: 'Mixed',
    });
    await testDb.db('users').where({ id: first.userId }).update({ email: 'MiXeD@Example.TEST' });

    const second = await seedDefaultAdmin(testDb.db, {
      ADMIN_EMAIL: 'mixed@example.test',
      ADMIN_PASSWORD: 'a-very-long-password-123',
    });

    expect(second.created).toBe(false);
    expect(second.userId).toBe(first.userId);
    expect(await testDb.db('users').count({ count: '*' }).first()).toMatchObject({ count: 1 });
  });

  test('refuses to promote an existing non-admin account', async () => {
    await testDb.createUser({ email: 'client@example.test', role: 'user' });

    await expect(seedDefaultAdmin(testDb.db, {
      ADMIN_EMAIL: 'client@example.test',
      ADMIN_PASSWORD: 'a-very-long-password-123',
    })).rejects.toThrow(AdminSeedConflictError);

    const user = await testDb.db('users').where({ email: 'client@example.test' }).first();
    expect(user.role).toBe('user');
    expect(await testDb.db('users').count({ count: '*' }).first()).toMatchObject({ count: 1 });
  });

  test('creates no functional data beyond the administrator', async () => {
    await seedDefaultAdmin(testDb.db, VALID);
    for (const table of testDb.TABLES) {
      if (table === 'users') continue;
      // eslint-disable-next-line no-await-in-loop
      const row = await testDb.db(table).count({ count: '*' }).first();
      expect({ table, count: row.count }).toEqual({ table, count: 0 });
    }
  });

  test('the knex seed entry point (database/seeds/001_admin.js) is the same idempotent seed', async () => {
    const seed = require('../../../database/seeds/001_admin');
    const envBefore = { ...process.env };
    process.env.ADMIN_EMAIL = 'knex-seed@example.test';
    process.env.ADMIN_PASSWORD = 'a-very-long-password-123';
    try {
      const first = await seed.seed(testDb.db);
      const second = await seed.seed(testDb.db);
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(await testDb.db('users').count({ count: '*' }).first()).toMatchObject({ count: 1 });
    } finally {
      process.env.ADMIN_EMAIL = envBefore.ADMIN_EMAIL;
      process.env.ADMIN_PASSWORD = envBefore.ADMIN_PASSWORD;
    }
  });
});
