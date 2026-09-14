jest.mock('../../src/config/database', () => require('./helpers/authTestDb').db);

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const authController = require('../../src/controllers/authController');
const { getJwtSecret } = require('../../src/config/jwt');
const { db, initSchema, reset } = require('./helpers/authTestDb');

const VALID_PAYLOAD = {
  name: 'João Silva',
  email: 'joao@email.com',
  password: '123456',
  phone: '13999999999',
};

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('POST /api/auth/register (authController.register)', () => {
  beforeAll(async () => {
    await initSchema();
  });

  beforeEach(async () => {
    await reset();
  });

  test('cria usuário comum com role=user e token JWT válido', async () => {
    const req = { body: { ...VALID_PAYLOAD } };
    const res = mockRes();

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.user.role).toBe('user');
    expect(body.data.user.is_active).toBeTruthy();
    expect(body.data.user.email_verified).toBeFalsy();
    expect(body.data.user.password).toBeUndefined();
    expect(body.data.token).toBeTruthy();

    const decoded = jwt.verify(body.data.token, getJwtSecret());
    expect(decoded.userId).toBe(body.data.user.id);
    expect(decoded.role).toBe('user');

    const stored = await db('users').where('id', body.data.user.id).first();
    expect(stored.password).not.toBe('123456');
    expect(bcrypt.compareSync('123456', stored.password)).toBe(true);
  });

  test('cria parceiro com partnerType=mechanic persistindo onboarding', async () => {
    const req = {
      body: { ...VALID_PAYLOAD, email: 'carlos@email.com', partnerType: 'mechanic' },
    };
    const res = mockRes();

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.data.user.role).toBe('partner');
    expect(body.data.user.onboarding_partner_type).toBe('mechanic');
    expect(body.data.user.onboarding_stage).toBe('account_created');
  });

  test('não permite escalação: role=admin no payload é ignorado (backend resolve o papel)', async () => {
    const req = { body: { ...VALID_PAYLOAD, email: 'x@email.com', role: 'admin' } };
    const res = mockRes();

    await authController.register(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.data.user.role).toBe('user');

    const partnerReq = {
      body: { ...VALID_PAYLOAD, email: 'y@email.com', role: 'admin', partnerType: 'mechanic' },
    };
    const partnerRes = mockRes();

    await authController.register(partnerReq, partnerRes);

    const partnerBody = partnerRes.json.mock.calls[0][0];
    expect(partnerBody.data.user.role).toBe('partner');
  });

  test('rejeita email duplicado (case-insensitive)', async () => {
    const res1 = mockRes();
    await authController.register({ body: { ...VALID_PAYLOAD } }, res1);
    expect(res1.status).toHaveBeenCalledWith(201);

    const res2 = mockRes();
    await authController.register(
      { body: { ...VALID_PAYLOAD, email: 'JOAO@EMAIL.COM' } },
      res2
    );

    expect(res2.status).toHaveBeenCalledWith(400);
    expect(res2.json.mock.calls[0][0].message).toBe('Email já cadastrado');
  });

  test('normaliza o email para minúsculas antes de persistir', async () => {
    const res = mockRes();
    await authController.register(
      { body: { ...VALID_PAYLOAD, email: '  Joao@Email.COM  ' } },
      res
    );

    const body = res.json.mock.calls[0][0];
    expect(body.data.user.email).toBe('joao@email.com');
  });

  test('erro interno não vaza detalhes da exceção', async () => {
    const hashSpy = jest
      .spyOn(bcrypt, 'hash')
      .mockRejectedValueOnce(new Error('SENSITIVE: postgres://user:secret@host'));

    const req = { body: { ...VALID_PAYLOAD } };
    const res = mockRes();

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.message).toBe('Erro interno do servidor');
    expect(JSON.stringify(body)).not.toContain('SENSITIVE');
    expect(JSON.stringify(body)).not.toContain('postgres://');

    hashSpy.mockRestore();
  });
});
