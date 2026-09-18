/**
 * T00 — Tow authentication fixtures.
 *
 * Real JWTs signed with the same secret/claims consumed by
 * `src/middleware/auth.js` (claim `userId`), so no auth middleware is mocked.
 * Built on `tests/helpers/auth.js` and the Tow factories so the identity
 * (customer / tow partner / admin) is deterministic.
 */
'use strict';

const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../../../src/config/jwt');
const { signFor } = require('../auth');
const {
  createTowCustomer,
  createTowPartner,
  createTowAdmin,
} = require('./factories');

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createTowCustomerAuth(overrides = {}) {
  const { tokenClaims = {}, ...userOverrides } = overrides;
  const user = await createTowCustomer(userOverrides);
  const token = signFor(user, tokenClaims);
  return { user, token, headers: bearer(token) };
}

async function createTowPartnerAuth(overrides = {}) {
  const { tokenClaims = {}, userOverrides = {}, ...partnerOverrides } = overrides;
  const { user, partner } = await createTowPartner({ userOverrides, ...partnerOverrides });
  const token = signFor(user, tokenClaims);
  return { user, partner, token, headers: bearer(token) };
}

async function createTowAdminAuth(overrides = {}) {
  const { tokenClaims = {}, ...userOverrides } = overrides;
  const user = await createTowAdmin(userOverrides);
  const token = signFor(user, tokenClaims);
  return { user, token, headers: bearer(token) };
}

/**
 * Sign a token for an arbitrary user id/role without persisting anything.
 * Useful for negative auth tests (unknown user, wrong role, revoked jti).
 */
function signTowToken({ userId, role = 'user', email = 'tow@example.test', ...claims }, options = {}) {
  return jwt.sign(
    { userId, role, email, ...claims },
    getJwtSecret(),
    { expiresIn: options.expiresIn || '1h' }
  );
}

/** Deterministically expired token (no reliance on the fake clock). */
function signExpiredTowToken({ userId, role = 'user', email = 'tow@example.test' }, options = {}) {
  return jwt.sign(
    { userId, role, email },
    getJwtSecret(),
    { expiresIn: options.expiresIn || '-1h' }
  );
}

/** Token signed with the wrong secret: must never authenticate. */
function signForgedTowToken({ userId, role = 'user', email = 'tow@example.test' }) {
  return jwt.sign(
    { userId, role, email },
    'definitely-not-the-configured-jwt-secret',
    { expiresIn: '1h' }
  );
}

module.exports = {
  bearer,
  createTowCustomerAuth,
  createTowPartnerAuth,
  createTowAdminAuth,
  signTowToken,
  signExpiredTowToken,
  signForgedTowToken,
};
