const { validate, authSchemas } = require('../../src/middleware/validation');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function runValidation(schema, body) {
  const req = { body };
  const res = mockRes();
  const next = jest.fn();
  validate(schema)(req, res, next);
  return { res, next };
}

const VALID_REGISTER = {
  name: 'João Silva',
  email: 'joao@email.com',
  password: '123456',
  phone: '13999999999',
};

describe('authSchemas.register (validação antes de tocar no banco)', () => {
  test('payload válido passa', () => {
    const { res, next } = runValidation(authSchemas.register, VALID_REGISTER);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('parceiro com partnerType válido passa', () => {
    const { res, next } = runValidation(authSchemas.register, {
      ...VALID_REGISTER,
      partnerType: 'mechanic',
    });
    expect(next).toHaveBeenCalled();
  });

  test.each(['name', 'email', 'password', 'phone'])('campo obrigatório %s ausente falha', (field) => {
    const body = { ...VALID_REGISTER };
    delete body[field];
    const { res, next } = runValidation(authSchemas.register, body);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toBe('Dados inválidos');
  });

  test('email malformado falha', () => {
    const { res, next } = runValidation(authSchemas.register, {
      ...VALID_REGISTER,
      email: 'nao-e-email',
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('senha menor que 6 caracteres falha', () => {
    const { res, next } = runValidation(authSchemas.register, {
      ...VALID_REGISTER,
      password: '12345',
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('authSchemas.login', () => {
  test('payload válido passa', () => {
    const { res, next } = runValidation(authSchemas.login, {
      email: 'joao@email.com',
      password: '123456',
    });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test.each(['email', 'password'])('campo obrigatório %s ausente falha', (field) => {
    const body = { email: 'joao@email.com', password: '123456' };
    delete body[field];
    const { res, next } = runValidation(authSchemas.login, body);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('email malformado falha', () => {
    const { res, next } = runValidation(authSchemas.login, {
      email: 'nao-e-email',
      password: '123456',
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
