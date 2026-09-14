jest.mock('../../src/config/database', () => require('./helpers/authTestDb').db);

const jwt = require('jsonwebtoken');
const authController = require('../../src/controllers/authController');
const { auth } = require('../../src/middleware/auth');
const { getJwtSecret } = require('../../src/config/jwt');
const { initSchema, reset, createUser } = require('./helpers/authTestDb');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function authHeader(token) {
  return (name) => (name === 'Authorization' ? `Bearer ${token}` : undefined);
}

describe('GET /api/auth/verify (middleware auth + authController.verifyToken)', () => {
  beforeAll(async () => {
    await initSchema();
  });

  beforeEach(async () => {
    await reset();
  });

  test('sem token retorna 401', async () => {
    const req = { headers: {}, header: () => undefined };
    const res = mockRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].message).toBe('Token de acesso não fornecido');
  });

  test('token malformado retorna 401', async () => {
    const req = { headers: {}, header: authHeader('not-a-jwt') };
    const res = mockRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].message).toBe('Token inválido');
  });

  test('token expirado retorna 401', async () => {
    const user = await createUser();
    const expired = jwt.sign(
      { userId: user.id, role: user.role },
      getJwtSecret(),
      { expiresIn: '-1s' }
    );

    const req = { headers: {}, header: authHeader(expired) };
    const res = mockRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].message).toBe('Token inválido');
  });

  test('token assinado com outro segredo retorna 401', async () => {
    const user = await createUser();
    const foreign = jwt.sign(
      { userId: user.id, role: user.role },
      'outro-segredo-completamente-diferente'
    );

    const req = { headers: {}, header: authHeader(foreign) };
    const res = mockRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('token válido de usuário inexistente retorna 401', async () => {
    const token = jwt.sign({ userId: 9999, role: 'user' }, getJwtSecret());

    const req = { headers: {}, header: authHeader(token) };
    const res = mockRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('token válido de usuário inativo retorna 401', async () => {
    const user = await createUser({ is_active: 0 });
    const token = jwt.sign({ userId: user.id, role: user.role }, getJwtSecret());

    const req = { headers: {}, header: authHeader(token) };
    const res = mockRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('verify retorna o usuário autenticado sem senha', async () => {
    const user = await createUser();
    const req = { user: { id: user.id } };
    const res = mockRes();

    await authController.verifyToken(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.user.id).toBe(user.id);
    expect(body.data.user.email).toBe(user.email);
    expect(body.data.user.password).toBeUndefined();
  });

  test('verify para usuário inexistente retorna 404', async () => {
    const req = { user: { id: 99999 } };
    const res = mockRes();

    await authController.verifyToken(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].message).toBe('Usuário não encontrado');
  });
});
