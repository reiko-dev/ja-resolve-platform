jest.mock('../../src/config/database', () => require('./helpers/authTestDb').db);

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const authController = require('../../src/controllers/authController');
const { getJwtSecret } = require('../../src/config/jwt');
const { db, initSchema, reset, createUser } = require('./helpers/authTestDb');

const PASSWORD = '123456';

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

async function seedUser(email = 'joao@email.com', overrides = {}) {
  const hashedPassword = await bcrypt.hash(PASSWORD, 12);
  return createUser({ email, password: hashedPassword, ...overrides });
}

describe('POST /api/auth/login (authController.login)', () => {
  beforeAll(async () => {
    await initSchema();
  });

  beforeEach(async () => {
    await reset();
  });

  test('faz login com credenciais válidas e não devolve senha', async () => {
    const user = await seedUser();
    const req = { body: { email: 'joao@email.com', password: PASSWORD } };
    const res = mockRes();

    await authController.login(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.user.id).toBe(user.id);
    expect(body.data.user.password).toBeUndefined();
    expect(body.data.token).toBeTruthy();

    const decoded = jwt.verify(body.data.token, getJwtSecret());
    expect(decoded.userId).toBe(user.id);
    expect(decoded.role).toBe('user');
  });

  test('login é case-insensitive no email', async () => {
    await seedUser('Joao@Email.com');
    const req = { body: { email: 'joao@email.com', password: PASSWORD } };
    const res = mockRes();

    await authController.login(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
  });

  test('senha inválida retorna erro genérico 401', async () => {
    await seedUser();
    const req = { body: { email: 'joao@email.com', password: 'wrong-password' } };
    const res = mockRes();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].message).toBe('Email ou senha inválidos');
  });

  test('email inexistente retorna o mesmo erro genérico 401 da senha inválida', async () => {
    const req = { body: { email: 'nao-existe@email.com', password: PASSWORD } };
    const res = mockRes();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].message).toBe('Email ou senha inválidos');
  });

  test('usuário inativo não consegue logar sem revelar estado da conta', async () => {
    await seedUser('inativo@email.com', { is_active: 0 });
    const req = { body: { email: 'inativo@email.com', password: PASSWORD } };
    const res = mockRes();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });

  test('usuário inativo não vaza qual credencial estava errada', async () => {
    await seedUser('inativo@email.com', { is_active: 0 });
    const req = { body: { email: 'inativo@email.com', password: 'senha-errada' } };
    const res = mockRes();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].message).toBe('Email ou senha inválidos');
  });

  test('erro interno não vaza detalhes da exceção', async () => {
    await seedUser();
    const compareSpy = jest
      .spyOn(bcrypt, 'compare')
      .mockRejectedValueOnce(new Error('SENSITIVE: stacktrace com dados internos'));

    const req = { body: { email: 'joao@email.com', password: PASSWORD } };
    const res = mockRes();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Erro interno do servidor');
    expect(JSON.stringify(body)).not.toContain('SENSITIVE');

    compareSpy.mockRestore();
  });

  test('busca de usuário por email ignora diferenças de caixa existentes no banco', async () => {
    const user = await seedUser('Legacy@Email.com');
    const req = { body: { email: 'legacy@email.com', password: PASSWORD } };
    const res = mockRes();

    await authController.login(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.user.id).toBe(user.id);
  });
});
