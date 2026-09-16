/**
 * Fixtures de autenticação para as suítes de endpoint/integração.
 *
 * O token é assinado com a claim `userId` — a mesma consumida por
 * `src/middleware/auth.js` — e com o segredo de `src/config/jwt.js`, de modo que
 * `Authorization: Bearer <token>` autentica de verdade (sem mock de middleware).
 */
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../../src/config/jwt');
const {
  initSchema,
  createUser,
  createPartner: createPartnerRow,
} = require('./testDb');

function signFor(user, overrides = {}) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      email: user.email,
      ...overrides,
    },
    getJwtSecret(),
    { expiresIn: '1h' }
  );
}

async function createAuthedUser({ tokenClaims = {}, ...overrides } = {}) {
  await initSchema();
  const user = await createUser(overrides);
  const token = signFor(user, tokenClaims);
  return {
    user,
    token,
    headers: { Authorization: `Bearer ${token}` },
  };
}

async function createPartner({ userOverrides = {}, partnerOverrides = {}, tokenClaims = {} } = {}) {
  await initSchema();
  const user = await createUser({ role: 'partner', ...userOverrides });
  const partner = await createPartnerRow({ user_id: user.id, ...partnerOverrides });
  const token = signFor(user, tokenClaims);
  return {
    user,
    partner,
    token,
    headers: { Authorization: `Bearer ${token}` },
  };
}

module.exports = { createAuthedUser, createPartner, signFor };
