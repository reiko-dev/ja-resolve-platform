jest.mock('../../src/config/database', () => require('./helpers/authTestDb').db);

const jwt = require('jsonwebtoken');
const socketService = require('../../src/services/socketService');
const { getJwtSecret } = require('../../src/config/jwt');
const { initSchema, reset, createUser } = require('./helpers/authTestDb');

function fakeSocket(token) {
  return {
    handshake: {
      auth: token ? { token } : {},
      headers: {},
    },
  };
}

describe('Socket.IO authenticateSocket (consistência com HTTP)', () => {
  beforeAll(async () => {
    await initSchema();
  });

  beforeEach(async () => {
    await reset();
  });

  test('token válido autentica o socket e define userId/userRole', async () => {
    const user = await createUser({ role: 'partner' });
    const token = jwt.sign({ userId: user.id, role: user.role }, getJwtSecret());
    const socket = fakeSocket(token);
    const next = jest.fn();

    await socketService.authenticateSocket(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.userId).toBe(user.id);
    expect(socket.userRole).toBe('partner');
  });

  test('sem token rejeita o socket', async () => {
    const socket = fakeSocket(null);
    const next = jest.fn();

    await socketService.authenticateSocket(socket, next);

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  test('token malformado rejeita o socket', async () => {
    const socket = fakeSocket('token-invalido');
    const next = jest.fn();

    await socketService.authenticateSocket(socket, next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  test('token expirado rejeita o socket', async () => {
    const user = await createUser();
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      getJwtSecret(),
      { expiresIn: '-1s' }
    );
    const next = jest.fn();

    await socketService.authenticateSocket(fakeSocket(token), next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  test('token assinado com outro segredo rejeita o socket (mesma config JWT)', async () => {
    const user = await createUser();
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      'outro-segredo-diferente'
    );
    const next = jest.fn();

    await socketService.authenticateSocket(fakeSocket(token), next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  test('token revogado via logout rejeita o socket', async () => {
    const user = await createUser();
    const token = jwt.sign({ userId: user.id, role: user.role }, getJwtSecret());
    const next = jest.fn();

    const { revokeToken } = require('../../src/services/tokenRevocationService');
    await revokeToken(token, user.id, new Date(Date.now() + 60_000));

    await socketService.authenticateSocket(fakeSocket(token), next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  test('usuário inativo rejeita o socket', async () => {
    const user = await createUser({ is_active: 0 });
    const token = jwt.sign({ userId: user.id, role: user.role }, getJwtSecret());
    const next = jest.fn();

    await socketService.authenticateSocket(fakeSocket(token), next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
