/**
 * Real HTTP transport tests for the authentication surface.
 *
 * These tests boot the composed Express application (src/app.js: helmet, CORS,
 * rate limit, routers, controllers, error handler) and drive it through real
 * HTTP requests with supertest. Nothing is called as a bare controller/mock
 * req/res: status codes, headers and JSON bodies are asserted end to end.
 *
 * The database module is replaced by an in-memory SQLite schema with
 * deterministic failure injection (see helpers/authTransportDb.js).
 */
jest.mock('../../src/config/database', () => require('./helpers/authTransportDb').db);

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { getJwtSecret } = require('../../src/config/jwt');
const {
  initSchema,
  reset,
  createUser,
  failQueries,
} = require('./helpers/authTransportDb');

const PASSWORD = 'SenhaSegura123';
const GENERIC_LOGIN_ERROR = 'Email ou senha inválidos';
const GENERIC_SERVER_ERROR = 'Erro interno do servidor';

function signToken(user, { expiresIn = '7d', secret = getJwtSecret() } = {}) {
  return jwt.sign({ userId: user.id, role: user.role }, secret, { expiresIn });
}

async function createActiveUser(overrides = {}) {
  const password = await bcrypt.hash(PASSWORD, 4);
  return createUser({ password, ...overrides });
}

describe('HTTP transport: POST /api/auth/login', () => {
  let app;

  beforeAll(async () => {
    await initSchema();
    app = createApp();
  });

  beforeEach(async () => {
    await reset();
  });

  test('login válido retorna 200 com token e usuário sem senha', async () => {
    const user = await createActiveUser({ email: 'cliente@example.com', role: 'user' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cliente@example.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user.id).toBe(user.id);
    expect(res.body.data.user.email).toBe('cliente@example.com');
    expect(res.body.data.user.password).toBeUndefined();

    const decoded = jwt.verify(res.body.data.token, getJwtSecret());
    expect(decoded.userId).toBe(user.id);
  });

  test('login aceita email com caixa diferente (case-insensitive)', async () => {
    await createActiveUser({ email: 'cliente@example.com' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'CLIENTE@Example.COM', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('cliente@example.com');
  });

  test('email com espaços nas pontas é rejeitado pela validação antes do controller', async () => {
    await createActiveUser({ email: 'cliente@example.com' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: '  cliente@example.com  ', password: PASSWORD });

    // Comportamento atual: Joi valida antes do normalizeEmail/trim do controller.
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Dados inválidos');
  });

  test('senha incorreta retorna 401 genérico (sem enumerar usuários)', async () => {
    await createActiveUser({ email: 'cliente@example.com' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cliente@example.com', password: 'senha-errada' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: GENERIC_LOGIN_ERROR });
  });

  test('email inexistente retorna o mesmo 401 genérico', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ninguem@example.com', password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: GENERIC_LOGIN_ERROR });
  });

  test('usuário inativo retorna 401 e não emite token', async () => {
    await createActiveUser({ email: 'inativo@example.com', is_active: 0 });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inativo@example.com', password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe(GENERIC_LOGIN_ERROR);
    expect(res.body.data).toBeUndefined();
  });

  test('payload inválido retorna 400 do validador antes do controller', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nao-e-email' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Dados inválidos');
  });

  test('falha de banco retorna 500 genérico sem vazar detalhes internos', async () => {
    await createActiveUser({ email: 'cliente@example.com' });
    failQueries('users');

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cliente@example.com', password: PASSWORD });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: GENERIC_SERVER_ERROR });
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|5432|stack/i);
  });
});

describe('HTTP transport: GET /api/auth/verify', () => {
  let app;

  beforeAll(async () => {
    await initSchema();
    app = createApp();
  });

  beforeEach(async () => {
    await reset();
  });

  test('token válido retorna 200 com o usuário autenticado', async () => {
    const user = await createActiveUser({ role: 'partner' });
    const token = signToken(user);

    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.id).toBe(user.id);
    expect(res.body.data.user.role).toBe('partner');
    expect(res.body.data.user.password).toBeUndefined();
  });

  test('sem header Authorization retorna 401', async () => {
    const res = await request(app).get('/api/auth/verify');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Token de acesso não fornecido' });
  });

  test('token malformado retorna 401', async () => {
    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', 'Bearer isto-nao-e-um-jwt');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Token inválido' });
  });

  test('token expirado retorna 401', async () => {
    const user = await createActiveUser();
    const token = signToken(user, { expiresIn: '-1s' });

    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Token inválido' });
  });

  test('token assinado com outro segredo retorna 401', async () => {
    const user = await createActiveUser();
    const token = signToken(user, { secret: 'segredo-de-outro-emissor' });

    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Token inválido' });
  });

  test('token de usuário inexistente retorna 401', async () => {
    const token = jwt.sign({ userId: 999999, role: 'user' }, getJwtSecret(), { expiresIn: '7d' });

    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Usuário não encontrado' });
  });

  test('token válido de usuário inativo retorna 401', async () => {
    const user = await createActiveUser({ is_active: 0 });
    const token = signToken(user);

    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Token inválido' });
  });

  test('token sem claim userId retorna 401', async () => {
    const token = jwt.sign({ role: 'user' }, getJwtSecret(), { expiresIn: '7d' });

    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  test('falha de banco no middleware retorna 401 sem 500 nem stack trace', async () => {
    const user = await createActiveUser();
    const token = signToken(user);
    failQueries('users');

    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${token}`);

    // Middleware treats any unexpected error as an authentication failure.
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Token inválido' });
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|5432|stack/i);
  });

  test('falha de banco no controller retorna 500 genérico', async () => {
    const user = await createActiveUser();
    const token = signToken(user);
    // 1ª query de users = middleware; 2ª = getAuthUserById no controller.
    failQueries('users', { skip: 1 });

    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: GENERIC_SERVER_ERROR });
  });
});

describe('HTTP transport: POST /api/auth/logout e reuso de token', () => {
  let app;

  beforeAll(async () => {
    await initSchema();
    app = createApp();
  });

  beforeEach(async () => {
    await reset();
  });

  test('logout válido retorna 200', async () => {
    const user = await createActiveUser();
    const token = signToken(user);

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Logout realizado com sucesso' });
  });

  test('token reutilizado após logout é rejeitado no verify (401)', async () => {
    const user = await createActiveUser();
    const token = signToken(user);

    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const reuse = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${token}`);

    expect(reuse.status).toBe(401);
    expect(reuse.body).toEqual({ success: false, message: 'Token revogado' });
  });

  test('token reutilizado após logout também é rejeitado no próprio logout', async () => {
    const user = await createActiveUser();
    const token = signToken(user);

    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const reuse = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(reuse.status).toBe(401);
    expect(reuse.body).toEqual({ success: false, message: 'Token revogado' });
  });

  test('logout revoga apenas o token apresentado', async () => {
    const user = await createActiveUser();
    const tokenA = signToken(user, { expiresIn: '1h' });
    const tokenB = signToken(user, { expiresIn: '2h' });

    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const stillValid = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(stillValid.status).toBe(200);
    expect(stillValid.body.data.user.id).toBe(user.id);
  });

  test('logout sem token retorna 401', async () => {
    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Token de acesso não fornecido' });
  });

  test('falha de banco na revogação retorna 500 genérico', async () => {
    const user = await createActiveUser();
    const token = signToken(user);
    // 1ª query em revoked_tokens = isTokenRevoked no middleware; a 2ª = insert do logout.
    failQueries('revoked_tokens', { skip: 1 });

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: GENERIC_SERVER_ERROR });
  });

  test('usuário inativo com token válido não consegue fazer logout (401)', async () => {
    const user = await createActiveUser({ is_active: 0 });
    const token = signToken(user);

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Token inválido' });
  });
});

describe('HTTP transport: autorização por papel em rota real (GET /api/users)', () => {
  let app;

  beforeAll(async () => {
    await initSchema();
    app = createApp();
  });

  beforeEach(async () => {
    await reset();
  });

  test('sem token retorna 401', async () => {
    const res = await request(app).get('/api/users');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('token de usuário comum retorna 403 (requireRole admin)', async () => {
    const user = await createActiveUser({ role: 'user' });
    const token = signToken(user);

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      success: false,
      message: 'Acesso negado. Permissão insuficiente.',
    });
  });

  test('token de admin passa pela autorização e lista usuários sem senha', async () => {
    const admin = await createActiveUser({ role: 'admin', email: 'admin@example.com' });
    const token = signToken(admin);

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.users)).toBe(true);
    expect(res.body.data.users.some((u) => u.id === admin.id)).toBe(true);
    for (const listed of res.body.data.users) {
      expect(listed.password).toBeUndefined();
    }
  });

  test('token de admin revogado perde a autorização (401)', async () => {
    const admin = await createActiveUser({ role: 'admin' });
    const token = signToken(admin);

    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Token revogado' });
  });
});

describe('HTTP transport: composição real do app', () => {
  let app;

  beforeAll(async () => {
    await initSchema();
    app = createApp();
  });

  test('rota inexistente retorna o 404 JSON do catch-all do app real', async () => {
    const res = await request(app).get('/api/rota-que-nao-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: 'Rota não encontrada no backend da API',
    });
  });

  test('app real responde com cabeçalhos do helmet', async () => {
    const res = await request(app).get('/api/rota-que-nao-existe');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-dns-prefetch-control']).toBeDefined();
  });
});
