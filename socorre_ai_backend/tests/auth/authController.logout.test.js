jest.mock('../../src/config/database', () => require('./helpers/authTestDb').db);

const jwt = require('jsonwebtoken');
const authController = require('../../src/controllers/authController');
const { auth } = require('../../src/middleware/auth');
const { getJwtSecret } = require('../../src/config/jwt');
const { db, initSchema, reset, createUser } = require('./helpers/authTestDb');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function signToken(user, options = {}) {
  return jwt.sign(
    { userId: user.id, role: user.role },
    getJwtSecret(),
    { expiresIn: options.expiresIn || '7d' }
  );
}

describe('POST /api/auth/logout (authController.logout) com revogação de JWT', () => {
  beforeAll(async () => {
    await initSchema();
  });

  beforeEach(async () => {
    await reset();
  });

  test('logout responde 200 com contrato padrão', async () => {
    const user = await createUser();
    const token = signToken(user);
    const req = { user, token, decodedToken: jwt.verify(token, getJwtSecret()) };
    const res = mockRes();

    await authController.logout(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.message).toBe('Logout realizado com sucesso');
  });

  test('logout permanece seguro para token válido sem claim exp', async () => {
    const user = await createUser();
    const token = jwt.sign({ userId: user.id, role: user.role }, getJwtSecret());
    const req = { user, token, decodedToken: { userId: user.id, role: user.role } };
    const res = mockRes();

    await authController.logout(req, res);

    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  test('token usado após logout é rejeitado (reuse bloqueado)', async () => {
    const user = await createUser();
    const token = signToken(user);

    const firstReq = {
      headers: {},
      header: (name) => (name === 'Authorization' ? `Bearer ${token}` : undefined),
    };
    const firstNext = jest.fn();
    await auth(firstReq, mockRes(), firstNext);
    expect(firstNext).toHaveBeenCalled();
    expect(firstReq.user.id).toBe(user.id);
    expect(firstReq.token).toBe(token);

    await authController.logout(
      { user: firstReq.user, token: firstReq.token, decodedToken: firstReq.decodedToken },
      mockRes()
    );

    const reuseReq = {
      headers: {},
      header: (name) => (name === 'Authorization' ? `Bearer ${token}` : undefined),
    };
    const reuseRes = mockRes();
    const reuseNext = jest.fn();
    await auth(reuseReq, reuseRes, reuseNext);

    expect(reuseNext).not.toHaveBeenCalled();
    expect(reuseRes.status).toHaveBeenCalledWith(401);
    expect(reuseRes.json.mock.calls[0][0].message).toBe('Token revogado');
  });

  test('logout revoga apenas o token apresentado, não outros tokens do usuário', async () => {
    const user = await createUser();
    const tokenA = signToken(user);
    const tokenB = signToken(user, { expiresIn: '6d' });

    await authController.logout(
      { user, token: tokenA, decodedToken: jwt.verify(tokenA, getJwtSecret()) },
      mockRes()
    );

    const reqB = {
      headers: {},
      header: (name) => (name === 'Authorization' ? `Bearer ${tokenB}` : undefined),
    };
    const nextB = jest.fn();
    await auth(reqB, mockRes(), nextB);
    expect(nextB).toHaveBeenCalled();
  });

  test('revogação é idempotente (revogar duas vezes não gera erro)', async () => {
    const user = await createUser();
    const token = signToken(user);
    const decoded = jwt.verify(token, getJwtSecret());

    await expect(
      authController.logout({ user, token, decodedToken: decoded }, mockRes())
    ).resolves.not.toThrow();
    await expect(
      authController.logout({ user, token, decodedToken: decoded }, mockRes())
    ).resolves.not.toThrow();

    const count = await db('revoked_tokens').count('* as total').first();
    expect(Number(count.total)).toBe(1);
  });

  test('registros revogados expirados são removidos no logout', async () => {
    const user = await createUser();
    const token = signToken(user);
    const decoded = jwt.verify(token, getJwtSecret());

    await db('revoked_tokens').insert({
      token_hash: 'hash-antigo-expirado',
      user_id: user.id,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    await authController.logout({ user, token, decodedToken: decoded }, mockRes());

    const remaining = await db('revoked_tokens').select('token_hash');
    const hashes = remaining.map((row) => row.token_hash);
    expect(hashes).not.toContain('hash-antigo-expirado');
  });

  test('token revogado com registro expirado volta a ser aceito', async () => {
    const user = await createUser();
    const token = signToken(user);

    const { hashToken } = require('../../src/services/tokenRevocationService');
    await db('revoked_tokens').insert({
      token_hash: hashToken(token),
      user_id: user.id,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const req = {
      headers: {},
      header: (name) => (name === 'Authorization' ? `Bearer ${token}` : undefined),
    };
    const next = jest.fn();
    await auth(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });
});
