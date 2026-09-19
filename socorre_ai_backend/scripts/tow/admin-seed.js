/**
 * T01 — default administrator seed.
 *
 * The ONLY functional row the clean baseline creates. Credentials come from the
 * environment, never from this file:
 *
 *   ADMIN_EMAIL     (required)  login of the default administrator
 *   ADMIN_PASSWORD  (required)  minimum 12 characters
 *   ADMIN_NAME      (optional)  display name, defaults to "Administrador"
 *
 * Guarantees:
 *   - idempotent: an existing administrator with the same e-mail is left
 *     untouched (no duplicate, no password rotation, no last-write-wins);
 *   - conflict-safe: if the e-mail already belongs to a non-admin account the
 *     seed throws instead of silently promoting it to administrator;
 *   - secret-safe: neither the password nor the hash is ever logged, returned
 *     or written to the database beyond the bcrypt hash itself;
 *   - no fallback credential: a missing/weak `ADMIN_PASSWORD` is a hard error,
 *     so a deployment can never boot with a known default password.
 *
 * The hash uses the same cost (12) as `src/controllers/authController.js`, so a
 * seeded administrator can log in through the normal `/auth/login` flow.
 */
'use strict';

const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 12;
const DEFAULT_ADMIN_NAME = 'Administrador';
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Values that must never become the administrator password. This is not a
 * password policy for users (that belongs to the application); it is a guard
 * against a deployment copying the old hardcoded development value
 * (`admin123`, removed from the baseline) into the environment.
 */
const FORBIDDEN_PASSWORDS = [
  'admin123',
  'admin1234',
  'password',
  'password123',
  'changeme',
  'change-me',
  'socorre',
  'socorre123',
  '123456789012',
  'qwertyuiop12',
];

class AdminSeedConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AdminSeedConfigError';
    this.code = 'ADMIN_SEED_CONFIG';
  }
}

class AdminSeedConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AdminSeedConflictError';
    this.code = 'ADMIN_SEED_CONFLICT';
  }
}

/**
 * Read and validate the administrator credentials from the environment.
 * Never returns a default password.
 */
function resolveAdminCredentials(env = process.env) {
  const email = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = env.ADMIN_PASSWORD === undefined ? '' : String(env.ADMIN_PASSWORD);
  const name = String(env.ADMIN_NAME || '').trim() || DEFAULT_ADMIN_NAME;

  if (!email) throw new AdminSeedConfigError('ADMIN_EMAIL is required to seed the default administrator');
  if (!EMAIL_PATTERN.test(email)) throw new AdminSeedConfigError(`ADMIN_EMAIL "${email}" is not a valid e-mail address`);
  if (!password) throw new AdminSeedConfigError('ADMIN_PASSWORD is required to seed the default administrator');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AdminSeedConfigError(
      `ADMIN_PASSWORD must have at least ${MIN_PASSWORD_LENGTH} characters (received ${password.length})`
    );
  }
  if (FORBIDDEN_PASSWORDS.includes(password.toLowerCase())) {
    throw new AdminSeedConfigError('ADMIN_PASSWORD is a well-known development password and must not be used');
  }
  const localPart = email.split('@')[0];
  if (localPart && password.toLowerCase() === localPart) {
    throw new AdminSeedConfigError('ADMIN_PASSWORD must not be the e-mail local part');
  }

  return { email, password, name };
}

/**
 * Create the administrator when it is missing; otherwise report what exists.
 *
 * @returns {Promise<{created: boolean, reason: string, userId: number|null, email: string}>}
 */
async function seedAdmin(db, credentials) {
  const { email, password, name } = credentials;
  const existing = await db('users').whereRaw('LOWER(email) = ?', [email]).first();

  if (existing) {
    if (existing.role !== 'admin') {
      throw new AdminSeedConflictError(
        `user "${email}" already exists with role "${existing.role}": refusing to promote it to administrator`
      );
    }
    // Idempotent by design: no update, so re-running the seed can never reset a
    // password an operator has already changed.
    return { created: false, reason: 'admin-already-exists', userId: existing.id, email };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const inserted = await db('users')
    .insert({
      name,
      email,
      password: passwordHash,
      role: 'admin',
      is_active: true,
      email_verified: true,
    })
    .returning('id');

  const row = Array.isArray(inserted) ? inserted[0] : inserted;
  const userId = row && typeof row === 'object' ? row.id : row;
  return { created: true, reason: 'created', userId: userId === undefined ? null : userId, email };
}

/** Convenience wrapper: resolve from `env`, then seed. */
async function seedDefaultAdmin(db, env = process.env) {
  return seedAdmin(db, resolveAdminCredentials(env));
}

/** Password-free description of a seed result, safe for logs and evidence. */
function describeSeedResult(result) {
  return result.created
    ? `default administrator created: ${result.email} (id=${result.userId})`
    : `default administrator already present: ${result.email} (id=${result.userId}) — nothing changed`;
}

if (require.main === module) {
  const { createConnection, resolvePurpose, loadPurposeEnv } = require('./db-connection');
  const purpose = resolvePurpose();
  loadPurposeEnv(purpose);
  const db = createConnection({ purpose });
  seedDefaultAdmin(db)
    .then((result) => {
      console.log(`[db:seed] ${describeSeedResult(result)}`);
    })
    .catch((error) => {
      // Only the message: it never contains the password or the hash.
      console.error(`[db:seed] ${error && error.message ? error.message : error}`);
      process.exitCode = 1;
    })
    .finally(() => db.destroy());
}

module.exports = {
  BCRYPT_ROUNDS,
  MIN_PASSWORD_LENGTH,
  DEFAULT_ADMIN_NAME,
  FORBIDDEN_PASSWORDS,
  AdminSeedConfigError,
  AdminSeedConflictError,
  resolveAdminCredentials,
  seedAdmin,
  seedDefaultAdmin,
  describeSeedResult,
};
