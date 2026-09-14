jest.mock('../../src/config/database', () => require('./helpers/authTestDb').db);

const jwt = require('jsonwebtoken');
const { auth, requireRole } = require('../../src/middleware/auth');
const { getJwtSecret } = require('../../src/config/jwt');
const { initSchema, reset, createUser } = require('./helpers/authTestDb');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('middleware/auth requireRole (limites de papel)', () => {
  test('role permitido passa', () => {
    const req = { user: { role: 'admin' } };
    const res = mockRes();
    const next = jest.fn();

    requireRole(['admin'])(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('role não permitido retorna 403', () => {
    const req = { user: { role: 'user' } };
    const res = mockRes();
    const next = jest.fn();

    requireRole(['admin'])(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('sem usuário autenticado retorna 401', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    requireRole(['admin'])(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('lista vazia de roles não libera acesso', () => {
    const req = { user: { role: 'user' } };
    const res = mockRes();
    const next = jest.fn();

    requireRole([])(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('middleware/auth contexto da requisição', () => {
  beforeAll(async () => {
    await initSchema();
  });

  beforeEach(async () => {
    await reset();
  });

  test('token válido popula req.user, req.token e req.decodedToken', async () => {
    const user = await createUser({ role: 'partner' });
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      getJwtSecret(),
      { expiresIn: '7d' }
    );
    const req = {
      headers: {},
      header: (name) => (name === 'Authorization' ? `Bearer ${token}` : undefined),
    };
    const res = mockRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe(user.id);
    expect(req.user.role).toBe('partner');
    expect(req.token).toBe(token);
    expect(req.decodedToken.userId).toBe(user.id);
    expect(req.decodedToken.exp).toBeDefined();
  });
});
