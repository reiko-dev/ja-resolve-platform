/**
 * Real Socket.IO transport tests for the authentication surface.
 *
 * A real socket.io server (the production SocketService singleton, initialized
 * on a real HTTP listener) is driven by a real socket.io-client over a real
 * WebSocket connection. No fake `socket` objects and no mocked handshake.
 *
 * The database module is replaced by an in-memory SQLite schema with
 * deterministic failure injection (see helpers/authTransportDb.js), and the
 * global socket.io mock from tests/setup.js is disabled for this file.
 */
jest.mock('socket.io', () => jest.requireActual('socket.io'));
jest.mock('../../src/config/database', () => require('./helpers/authTransportDb').db);

const http = require('http');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { io: createClient } = require('socket.io-client');
const { createApp } = require('../../src/app');
const socketService = require('../../src/services/socketService');
const { getJwtSecret } = require('../../src/config/jwt');
const {
  initSchema,
  reset,
  createUser,
  failQueries,
} = require('./helpers/authTransportDb');

jest.setTimeout(20000);

const PASSWORD = 'SenhaSegura123';

function signToken(user, { expiresIn = '7d', secret = getJwtSecret() } = {}) {
  return jwt.sign({ userId: user.id, role: user.role }, secret, { expiresIn });
}

async function createActiveUser(overrides = {}) {
  const password = await bcrypt.hash(PASSWORD, 4);
  return createUser({ password, ...overrides });
}

describe('Socket.IO transport: autenticação de conexão', () => {
  let app;
  let httpServer;
  let baseUrl;
  let clients;

  function connect(token, extraAuth = {}) {
    return new Promise((resolve, reject) => {
      const client = createClient(baseUrl, {
        auth: token ? { token, ...extraAuth } : { ...extraAuth },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        timeout: 5000,
      });
      clients.push(client);

      const timer = setTimeout(() => {
        client.close();
        reject(new Error('timeout aguardando evento do Socket.IO'));
      }, 8000);

      client.on('connect', () => {
        clearTimeout(timer);
        resolve(client);
      });
      client.on('connect_error', (error) => {
        clearTimeout(timer);
        client.close();
        reject(error);
      });
    });
  }

  function serverSocketOf(client) {
    return socketService.io.sockets.sockets.get(client.id);
  }

  beforeAll(async () => {
    await initSchema();
    app = createApp();
    httpServer = http.createServer();
    socketService.initialize(httpServer);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => socketService.io.close(resolve));
    if (httpServer.listening) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
  });

  beforeEach(async () => {
    clients = [];
    await reset();
  });

  afterEach(() => {
    for (const client of clients) {
      client.removeAllListeners();
      client.close();
    }
    socketService.connectedUsers.clear();
    socketService.userSockets.clear();
  });

  test('token válido conecta e o servidor registra identidade e papel', async () => {
    const user = await createActiveUser({ role: 'partner' });
    const client = await connect(signToken(user));

    expect(client.connected).toBe(true);
    const serverSocket = serverSocketOf(client);
    expect(serverSocket).toBeDefined();
    expect(serverSocket.userId).toBe(user.id);
    expect(serverSocket.userRole).toBe('partner');
    expect(socketService.isUserOnline(user.id)).toBe(true);
  });

  test('sem token a conexão é rejeitada', async () => {
    await expect(connect(null)).rejects.toThrow('Token de autenticação não fornecido');
  });

  test('auth vazio (sem token) é rejeitado', async () => {
    await expect(connect(undefined, { userId: 1 })).rejects.toThrow(
      'Token de autenticação não fornecido'
    );
  });

  test('token malformado é rejeitado', async () => {
    await expect(connect('isto-nao-e-um-jwt')).rejects.toThrow('Token inválido');
  });

  test('token expirado é rejeitado', async () => {
    const user = await createActiveUser();

    await expect(connect(signToken(user, { expiresIn: '-1s' }))).rejects.toThrow(
      'Token inválido'
    );
  });

  test('token assinado com outro segredo é rejeitado', async () => {
    const user = await createActiveUser();

    await expect(
      connect(signToken(user, { secret: 'segredo-de-outro-emissor' }))
    ).rejects.toThrow('Token inválido');
  });

  test('token de usuário inexistente é rejeitado', async () => {
    const token = jwt.sign({ userId: 999999, role: 'user' }, getJwtSecret(), {
      expiresIn: '7d',
    });

    await expect(connect(token)).rejects.toThrow('Usuário não encontrado');
  });

  test('usuário inativo é rejeitado mesmo com token válido', async () => {
    const user = await createActiveUser({ is_active: 0 });

    await expect(connect(signToken(user))).rejects.toThrow('Token inválido');
  });

  test('falha de banco no handshake é rejeitada sem derrubar o servidor', async () => {
    const user = await createActiveUser();
    const token = signToken(user);
    failQueries('users');

    await expect(connect(token)).rejects.toThrow('Token inválido');

    // O servidor continua aceitando conexões válidas depois da falha.
    const recovered = await createUser({ email: 'recuperado@example.com' });
    const client = await connect(signToken(recovered));
    expect(client.connected).toBe(true);
  });

  test('claims enviados pelo cliente não sobrescrevem a identidade do token', async () => {
    const attacker = await createActiveUser({ email: 'atacante@example.com', role: 'user' });
    const victim = await createActiveUser({ email: 'vitima@example.com', role: 'admin' });

    const client = await connect(signToken(attacker), {
      userId: victim.id,
      role: 'admin',
      userRole: 'admin',
    });

    const serverSocket = serverSocketOf(client);
    expect(serverSocket.userId).toBe(attacker.id);
    expect(serverSocket.userRole).toBe('user');
    expect(socketService.isUserOnline(victim.id)).toBe(false);
  });
});

describe('Socket.IO transport: logout, reconexão e ciclo completo HTTP+Socket', () => {
  let app;
  let httpServer;
  let baseUrl;
  let clients;

  function connect(token) {
    return new Promise((resolve, reject) => {
      const client = createClient(baseUrl, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        timeout: 5000,
      });
      clients.push(client);

      const timer = setTimeout(() => {
        client.close();
        reject(new Error('timeout aguardando evento do Socket.IO'));
      }, 8000);

      client.on('connect', () => {
        clearTimeout(timer);
        resolve(client);
      });
      client.on('connect_error', (error) => {
        clearTimeout(timer);
        client.close();
        reject(error);
      });
    });
  }

  beforeAll(async () => {
    await initSchema();
    app = createApp();
    httpServer = http.createServer();
    socketService.initialize(httpServer);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => socketService.io.close(resolve));
    if (httpServer.listening) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
  });

  beforeEach(async () => {
    clients = [];
    await reset();
  });

  afterEach(() => {
    for (const client of clients) {
      client.removeAllListeners();
      client.close();
    }
    socketService.connectedUsers.clear();
    socketService.userSockets.clear();
  });

  async function logoutOverHttp(token) {
    return request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
  }

  test('reconexão após logout HTTP é rejeitada (estado compartilhado entre transportes)', async () => {
    const user = await createActiveUser();

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(200);
    const token = login.body.data.token;

    const firstConnection = await connect(token);
    expect(firstConnection.connected).toBe(true);
    firstConnection.disconnect();

    const logout = await logoutOverHttp(token);
    expect(logout.status).toBe(200);

    await expect(connect(token)).rejects.toThrow('Token revogado');
    expect(socketService.isUserOnline(user.id)).toBe(false);
  });

  test('logout HTTP desconecta socket já conectado e bloqueia reconexão', async () => {
    const user = await createActiveUser();
    const token = signToken(user);

    const client = await connect(token);
    expect(client.connected).toBe(true);

    const disconnectPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('socket não desconectou após logout')), 2000);
      client.once('disconnect', (reason) => {
        clearTimeout(timer);
        expect(reason).toBe('io server disconnect');
        resolve();
      });
    });

    const logout = await logoutOverHttp(token);
    expect(logout.status).toBe(200);
    await disconnectPromise;

    await expect(connect(token)).rejects.toThrow('Token revogado');
  });

  test('outro token do mesmo usuário continua podendo conectar após logout', async () => {
    const user = await createActiveUser();
    const tokenA = signToken(user, { expiresIn: '1h' });
    const tokenB = signToken(user, { expiresIn: '2h' });

    const logout = await logoutOverHttp(tokenA);
    expect(logout.status).toBe(200);

    const client = await connect(tokenB);
    expect(client.connected).toBe(true);
    expect(socketService.isUserOnline(user.id)).toBe(true);
  });

  test('ciclo completo: login HTTP -> verify HTTP -> socket -> logout -> reconnect bloqueado', async () => {
    const user = await createActiveUser({ email: 'ciclo@example.com' });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ciclo@example.com', password: PASSWORD });
    expect(login.status).toBe(200);
    const token = login.body.data.token;

    const verifyOk = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${token}`);
    expect(verifyOk.status).toBe(200);
    expect(verifyOk.body.data.user.id).toBe(user.id);

    const client = await connect(token);
    expect(client.connected).toBe(true);
    expect(socketService.io.sockets.sockets.get(client.id).userId).toBe(user.id);
    client.disconnect();

    const logout = await logoutOverHttp(token);
    expect(logout.status).toBe(200);

    await expect(connect(token)).rejects.toThrow('Token revogado');

    const verifyAfterLogout = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${token}`);
    expect(verifyAfterLogout.status).toBe(401);
    expect(verifyAfterLogout.body.message).toBe('Token revogado');
  });
});
