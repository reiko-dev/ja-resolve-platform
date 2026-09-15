/**
 * G1 — HTTP transport real do ciclo de vida tow (start/complete).
 *
 * Sobe o app composto de produção (src/app.js: helmet, CORS, rate limit,
 * routers, auth middleware, controller, model, error handler) sobre um SQLite
 * em memória e dirige tudo por HTTP com supertest. Nada é chamado como
 * controller puro: status, corpo e efeitos persistidos são verificados ponta a
 * ponta.
 *
 * Cobre o aceite G1:
 *   - start/complete montados no caminho oficial /api/emergency-requests/:id/...;
 *   - matriz de autorização de docs/MOBILE-AUTH-TOW-CONTRACT-V1.md §4.4/§6;
 *   - transições accepted → in_progress → completed, 400 fora de estado;
 *   - repetição sequencial e concorrente sem duplicar mutação/notificação;
 *   - 500 genérico sem vazar SQL/constraint/stack.
 *
 * O último bloco sobe o entrypoint real (`node src/server.js`) em outro
 * processo e prova que start/complete respondem 401 (rota montada) e não 404,
 * que era o sintoma de produção (E2E-008).
 *
 * BUSINESS_RULE_AMBIGUITY: ver cabeçalho de towLifecycleController.test.js.
 */
process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../src/config/database', () => {
  const knex = require('knex');
  const instance = knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
  });

  let failures = [];

  const proxy = new Proxy(instance, {
    apply(target, thisArg, args) {
      const table = args[0];
      if (typeof table === 'string') {
        const rule = failures.find((entry) => entry.table === table && entry.remaining > 0);
        if (rule) {
          rule.remaining -= 1;
          const error = new Error('connect ECONNREFUSED 127.0.0.1:5432');
          error.code = 'ECONNREFUSED';
          throw error;
        }
      }
      return Reflect.apply(target, target, args);
    },
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });

  proxy.__failQueriesOn = (table, times = 1) => failures.push({ table, remaining: times });
  proxy.__clearFailures = () => { failures = []; };

  return proxy;
});
jest.mock('../../src/services/NotificationServiceNew', () => ({ sendNotification: jest.fn() }));
jest.mock('../../src/services/paymentService', () => ({
  createTowEmergencyPayment: jest.fn(),
  createTowCancellationFeePayment: jest.fn(),
  getEmergencyActiveServicePayment: jest.fn(),
  cancelPayment: jest.fn(),
  getEmergencyPaymentSummary: jest.fn(),
}));

const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const db = require('../../src/config/database');
const { createApp } = require('../../src/app');
const { getJwtSecret } = require('../../src/config/jwt');
const NotificationService = require('../../src/services/NotificationServiceNew');
const paymentService = require('../../src/services/paymentService');

const BACKEND_ROOT = path.resolve(__dirname, '../..');

async function initSchema() {
  await db.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable();
    table.string('email', 100).unique().notNullable();
    table.string('password', 255).notNullable();
    table.string('phone', 20);
    table.string('role', 20).defaultTo('user');
    table.integer('is_active').defaultTo(1);
    table.timestamp('created_at');
    table.timestamp('updated_at');
  });

  await db.schema.createTable('partners', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned();
    table.string('type', 50);
    table.string('business_name', 100);
    table.string('phone', 20);
    table.timestamp('created_at');
    table.timestamp('updated_at');
  });

  await db.schema.createTable('revoked_tokens', (table) => {
    table.string('token_hash', 64).primary();
    table.integer('user_id').unsigned().notNullable();
    table.timestamp('expires_at').notNullable();
  });

  await db.schema.createTable('emergency_requests', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned();
    table.integer('partner_id').unsigned();
    table.string('type', 30).defaultTo('other');
    table.string('request_type', 30).defaultTo('tow');
    table.string('status', 30).defaultTo('pending');
    table.string('proposal_status', 40);
    table.integer('selected_proposal_id').unsigned();
    table.text('description');
    table.string('location_type', 30);
    table.decimal('latitude', 10, 8);
    table.decimal('longitude', 11, 8);
    table.text('address');
    table.decimal('estimated_price', 10, 2);
    table.decimal('final_price', 10, 2);
    table.text('price_breakdown');
    table.text('solution_description');
    table.text('parts_used');
    table.text('notes');
    table.text('cancellation_reason');
    table.text('cancellation_by');
    table.integer('max_proposals').defaultTo(0);
    table.integer('proposals_received').defaultTo(0);
    table.timestamp('proposal_selection_deadline');
    table.datetime('accepted_at');
    table.datetime('started_at');
    table.datetime('completed_at');
    table.datetime('cancelled_at');
    table.timestamp('created_at');
    table.timestamp('updated_at');
  });

  await db.schema.createTable('tow_proposals', (table) => {
    table.increments('id').primary();
    table.integer('emergency_request_id').unsigned();
    table.integer('partner_id').unsigned();
    table.decimal('proposed_price', 10, 2);
    table.string('status', 30).defaultTo('pending');
    table.datetime('responded_at');
    table.timestamp('created_at');
    table.timestamp('updated_at');
  });
}

async function resetDatabase() {
  db.__clearFailures();
  await db('tow_proposals').del();
  await db('emergency_requests').del();
  await db('revoked_tokens').del();
  await db('partners').del();
  await db('users').del();
}

async function createUser({ name, email, role, password = 'hash' }) {
  const [user] = await db('users')
    .insert({
      name,
      email,
      password: await bcrypt.hash(password, 4),
      phone: '+5511999999999',
      role,
      is_active: 1,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning('*');
  return user;
}

async function createPartner({ userId, type = 'tow', businessName = 'Guincho G1' }) {
  const [partner] = await db('partners')
    .insert({
      user_id: userId,
      type,
      business_name: businessName,
      phone: '+5511999999999',
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning('*');
  return partner;
}

function tokenFor(user) {
  return jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), { expiresIn: '1h' });
}

function authorize(user) {
  return { Authorization: `Bearer ${tokenFor(user)}` };
}

async function createEmergency(overrides = {}) {
  const now = new Date();
  const [emergency] = await db('emergency_requests')
    .insert({
      user_id: overrides.user_id,
      partner_id: overrides.partner_id ?? null,
      type: 'other',
      request_type: 'tow',
      status: 'accepted',
      proposal_status: 'proposal_selected',
      description: 'Veículo precisa de guincho',
      location_type: 'roadside',
      latitude: -9.97,
      longitude: -67.81,
      address: 'Acre',
      estimated_price: 120,
      price_breakdown: JSON.stringify({ total_estimated_price: 90 }),
      selected_proposal_id: overrides.selected_proposal_id ?? null,
      max_proposals: 5,
      proposals_received: 1,
      proposal_selection_deadline: new Date(Date.now() + 3600000),
      accepted_at: now,
      created_at: now,
      updated_at: now,
      ...overrides,
    })
    .returning('*');
  return emergency;
}

/**
 * No stack do app mais de um router expõe POST /:id/start (o de delivery
 * orders também). A seleção é pelo mount oficial: apenas os layers cujo
 * regexp casa exatamente com /api/emergency-requests entram na verificação.
 */
function findEmergencyRequestsRouters(app) {
  return app._router.stack.filter(
    (layer) => layer.name === 'router'
      && layer.regexp instanceof RegExp
      && layer.regexp.test('/api/emergency-requests')
      && !layer.regexp.test('/api/emergency-requests-fora-do-contrato')
  );
}

/**
 * Prova que o router oficial está no stack do app e ANTES do catch-all,
 * independentemente de qualquer mock de banco.
 */
function findLifecycleRoutes(app) {
  const [routerLayer] = findEmergencyRequestsRouters(app);
  if (!routerLayer || !routerLayer.handle?.stack) {
    return null;
  }

  return routerLayer.handle.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).map((method) => method.toUpperCase()),
    }));
}

describe('G1 HTTP transport: start/complete do ciclo tow', () => {
  let app;
  let owner;
  let assignedPartnerUser;
  let assignedPartner;
  let otherPartnerUser;
  let otherPartner;
  let admin;

  beforeAll(async () => {
    await initSchema();
    app = createApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    NotificationService.sendNotification.mockReset();

    owner = await createUser({ name: 'Cliente G1', email: 'cliente-g1@example.com', role: 'user' });
    assignedPartnerUser = await createUser({ name: 'Parceiro G1', email: 'parceiro-g1@example.com', role: 'partner' });
    assignedPartner = await createPartner({ userId: assignedPartnerUser.id, businessName: 'Guincho Atribuído' });
    otherPartnerUser = await createUser({ name: 'Outro Parceiro', email: 'parceiro-outro@example.com', role: 'partner' });
    otherPartner = await createPartner({ userId: otherPartnerUser.id, businessName: 'Guincho Concorrente' });
    admin = await createUser({ name: 'Admin G1', email: 'admin-g1@example.com', role: 'admin' });
  });

  test('rotas start/complete estão registradas no router e antes do catch-all', () => {
    const emergencyRouters = findEmergencyRequestsRouters(app);

    expect(emergencyRouters).toHaveLength(1);

    const routes = findLifecycleRoutes(app);
    expect(routes).toEqual(
      expect.arrayContaining([
        { path: '/:id/start', methods: ['POST'] },
        { path: '/:id/complete', methods: ['POST'] },
      ])
    );
    expect(routes.filter((route) => route.path === '/:id/start')).toHaveLength(1);
    expect(routes.filter((route) => route.path === '/:id/complete')).toHaveLength(1);
  });

  test('sem Bearer retorna 401 em start e complete (rota montada, não 404)', async () => {
    const emergency = await createEmergency({ user_id: owner.id, partner_id: assignedPartner.id });

    const started = await request(app).post(`/api/emergency-requests/${emergency.id}/start`);
    const completed = await request(app).post(`/api/emergency-requests/${emergency.id}/complete`).send({ final_price: 120 });

    expect(started.status).toBe(401);
    expect(completed.status).toBe(401);
    expect(NotificationService.sendNotification).not.toHaveBeenCalled();
  });

  test('token inválido retorna 401', async () => {
    const emergency = await createEmergency({ user_id: owner.id, partner_id: assignedPartner.id });

    const started = await request(app)
      .post(`/api/emergency-requests/${emergency.id}/start`)
      .set('Authorization', 'Bearer token-invalido');

    expect(started.status).toBe(401);
  });

  test('cliente proprietário recebe 403 em start e complete', async () => {
    const emergency = await createEmergency({ user_id: owner.id, partner_id: assignedPartner.id });

    const started = await request(app)
      .post(`/api/emergency-requests/${emergency.id}/start`)
      .set(authorize(owner));
    const completed = await request(app)
      .post(`/api/emergency-requests/${emergency.id}/complete`)
      .set(authorize(owner))
      .send({ final_price: 120 });

    expect(started.status).toBe(403);
    expect(completed.status).toBe(403);
    expect((await db('emergency_requests').where('id', emergency.id).first()).status).toBe('accepted');
  });

  test('outro parceiro recebe 403 e não altera o pedido', async () => {
    const emergency = await createEmergency({ user_id: owner.id, partner_id: assignedPartner.id });

    const started = await request(app)
      .post(`/api/emergency-requests/${emergency.id}/start`)
      .set(authorize(otherPartnerUser));
    const completed = await request(app)
      .post(`/api/emergency-requests/${emergency.id}/complete`)
      .set(authorize(otherPartnerUser))
      .send({ final_price: 120 });

    expect(started.status).toBe(403);
    expect(completed.status).toBe(403);
    expect((await db('emergency_requests').where('id', emergency.id).first()).status).toBe('accepted');
    expect(NotificationService.sendNotification).not.toHaveBeenCalled();
    expect(paymentService.createTowEmergencyPayment).not.toHaveBeenCalled();
  });

  test('pedido inexistente retorna 404 para parceiro autenticado', async () => {
    const started = await request(app)
      .post('/api/emergency-requests/99999/start')
      .set(authorize(assignedPartnerUser));

    expect(started.status).toBe(404);
  });

  test('parceiro atribuído inicia pedido aceito e persiste in_progress', async () => {
    const emergency = await createEmergency({ user_id: owner.id, partner_id: assignedPartner.id });

    const started = await request(app)
      .post(`/api/emergency-requests/${emergency.id}/start`)
      .set(authorize(assignedPartnerUser));

    expect(started.status).toBe(200);
    expect(started.body.success).toBe(true);

    const persisted = await db('emergency_requests').where('id', emergency.id).first();
    expect(persisted.status).toBe('in_progress');
    expect(persisted.started_at).toBeTruthy();

    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
    expect(NotificationService.sendNotification).toHaveBeenCalledWith(
      owner.id,
      'Guincho a caminho',
      expect.any(String),
      expect.objectContaining({ type: 'tow_started', emergency_request_id: String(emergency.id) })
    );
  });

  test('repetir start é idempotente: mesmo started_at e uma única notificação', async () => {
    const emergency = await createEmergency({ user_id: owner.id, partner_id: assignedPartner.id });

    const first = await request(app)
      .post(`/api/emergency-requests/${emergency.id}/start`)
      .set(authorize(assignedPartnerUser));
    const firstStartedAt = (await db('emergency_requests').where('id', emergency.id).first()).started_at;

    const second = await request(app)
      .post(`/api/emergency-requests/${emergency.id}/start`)
      .set(authorize(assignedPartnerUser));
    const secondStartedAt = (await db('emergency_requests').where('id', emergency.id).first()).started_at;

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.message).toBe('Solicitação já foi iniciada');
    expect(secondStartedAt).toEqual(firstStartedAt);
    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
  });

  test('start fora de accepted retorna 400 com current_status e não muta', async () => {
    const emergency = await createEmergency({ user_id: owner.id, partner_id: assignedPartner.id, status: 'pending' });

    const started = await request(app)
      .post(`/api/emergency-requests/${emergency.id}/start`)
      .set(authorize(assignedPartnerUser));

    expect(started.status).toBe(400);
    expect(started.body.current_status).toBe('pending');
    expect((await db('emergency_requests').where('id', emergency.id).first()).status).toBe('pending');
    expect(NotificationService.sendNotification).not.toHaveBeenCalled();
  });

  test('admin inicia pedido de outro parceiro', async () => {
    const emergency = await createEmergency({ user_id: owner.id, partner_id: assignedPartner.id });

    const started = await request(app)
      .post(`/api/emergency-requests/${emergency.id}/start`)
      .set(authorize(admin));

    expect(started.status).toBe(200);
    expect((await db('emergency_requests').where('id', emergency.id).first()).status).toBe('in_progress');
    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
  });

  test('complete sem final_price em tow retorna 400 e não conclui', async () => {
    const emergency = await createEmergency({
      user_id: owner.id,
      partner_id: assignedPartner.id,
      status: 'in_progress',
      started_at: new Date(),
    });

    const completed = await request(app)
      .post(`/api/emergency-requests/${emergency.id}/complete`)
      .set(authorize(assignedPartnerUser))
      .send({ solution_description: 'sem preço' });

    expect(completed.status).toBe(400);
    expect((await db('emergency_requests').where('id', emergency.id).first()).status).toBe('in_progress');
    expect(NotificationService.sendNotification).not.toHaveBeenCalled();
  });

  test('complete abaixo do mínimo retorna 400 e não conclui', async () => {
    const emergency = await createEmergency({
      user_id: owner.id,
      partner_id: assignedPartner.id,
      status: 'in_progress',
      started_at: new Date(),
    });

    const completed = await request(app)
      .post(`/api/emergency-requests/${emergency.id}/complete`)
      .set(authorize(assignedPartnerUser))
      .send({ final_price: 50 });

    expect(completed.status).toBe(400);
    expect((await db('emergency_requests').where('id', emergency.id).first()).status).toBe('in_progress');
  });

  test('complete fora de in_progress retorna 400 com current_status', async () => {
    const emergency = await createEmergency({ user_id: owner.id, partner_id: assignedPartner.id, status: 'accepted' });

    const completed = await request(app)
      .post(`/api/emergency-requests/${emergency.id}/complete`)
      .set(authorize(assignedPartnerUser))
      .send({ final_price: 120 });

    expect(completed.status).toBe(400);
    expect(completed.body.current_status).toBe('accepted');
    expect(NotificationService.sendNotification).not.toHaveBeenCalled();
  });

  test('parceiro atribuído conclui e persiste preço, solução e peças', async () => {
    const emergency = await createEmergency({
      user_id: owner.id,
      partner_id: assignedPartner.id,
      status: 'in_progress',
      started_at: new Date(),
    });

    const completed = await request(app)
      .post(`/api/emergency-requests/${emergency.id}/complete`)
      .set(authorize(assignedPartnerUser))
      .send({ final_price: 120, solution_description: 'Atendimento concluído', parts_used: ['cabo'] });

    expect(completed.status).toBe(200);

    const persisted = await db('emergency_requests').where('id', emergency.id).first();
    expect(persisted.status).toBe('completed');
    expect(Number(persisted.final_price)).toBe(120);
    expect(persisted.solution_description).toBe('Atendimento concluído');
    expect(JSON.parse(persisted.parts_used)).toEqual(['cabo']);
    expect(persisted.completed_at).toBeTruthy();

    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
    expect(NotificationService.sendNotification).toHaveBeenCalledWith(
      owner.id,
      'Guincho concluído',
      expect.any(String),
      expect.objectContaining({ type: 'tow_completed', emergency_request_id: String(emergency.id) })
    );
  });

  test('repetir complete é idempotente: não reescreve preço nem repete notificação', async () => {
    const emergency = await createEmergency({
      user_id: owner.id,
      partner_id: assignedPartner.id,
      status: 'in_progress',
      started_at: new Date(),
    });

    const first = await request(app)
      .post(`/api/emergency-requests/${emergency.id}/complete`)
      .set(authorize(assignedPartnerUser))
      .send({ final_price: 120, solution_description: 'Concluído' });
    const firstRow = await db('emergency_requests').where('id', emergency.id).first();

    const second = await request(app)
      .post(`/api/emergency-requests/${emergency.id}/complete`)
      .set(authorize(assignedPartnerUser))
      .send({ final_price: 999, solution_description: 'Retry' });
    const secondRow = await db('emergency_requests').where('id', emergency.id).first();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.message).toBe('Solicitação já foi concluída');
    expect(Number(secondRow.final_price)).toBe(Number(firstRow.final_price));
    expect(secondRow.completed_at).toEqual(firstRow.completed_at);
    expect(secondRow.solution_description).toBe('Concluído');
    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
  });

  test('concorrência de start: todas as respostas 200, uma mutação e uma notificação', async () => {
    const emergency = await createEmergency({ user_id: owner.id, partner_id: assignedPartner.id });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post(`/api/emergency-requests/${emergency.id}/start`)
          .set(authorize(assignedPartnerUser))
      )
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
    const persisted = await db('emergency_requests').where('id', emergency.id).first();
    expect(persisted.status).toBe('in_progress');
    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
    expect(paymentService.createTowEmergencyPayment).not.toHaveBeenCalled();
  });

  test('concorrência de complete: todas as respostas 200, um preço vencedor e uma notificação', async () => {
    const emergency = await createEmergency({
      user_id: owner.id,
      partner_id: assignedPartner.id,
      status: 'in_progress',
      started_at: new Date(),
    });

    const responses = await Promise.all(
      [120, 130, 140, 150, 160].map((finalPrice) =>
        request(app)
          .post(`/api/emergency-requests/${emergency.id}/complete`)
          .set(authorize(assignedPartnerUser))
          .send({ final_price: finalPrice, solution_description: `preço ${finalPrice}` })
      )
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
    const persisted = await db('emergency_requests').where('id', emergency.id).first();
    expect(persisted.status).toBe('completed');
    expect([120, 130, 140, 150, 160]).toContain(Number(persisted.final_price));
    expect(persisted.completed_at).toBeTruthy();
    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
  });

  test('concorrência start x cancel: exatamente um vencedor e nenhum estado impossível', async () => {
    const emergency = await createEmergency({ user_id: owner.id, partner_id: assignedPartner.id });

    const [started, cancelled] = await Promise.all([
      request(app)
        .post(`/api/emergency-requests/${emergency.id}/start`)
        .set(authorize(assignedPartnerUser)),
      request(app)
        .post(`/api/emergency-requests/${emergency.id}/cancel`)
        .set(authorize(owner))
        .send({ reason: 'desistiu' }),
    ]);

    const successStatuses = [started.status, cancelled.status].filter((status) => status === 200);
    expect(successStatuses).toHaveLength(1);

    const persisted = await db('emergency_requests').where('id', emergency.id).first();
    if (started.status === 200) {
      expect(persisted.status).toBe('in_progress');
      expect(persisted.started_at).toBeTruthy();
      expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
    } else {
      expect(persisted.status).toBe('cancelled');
      expect(persisted.started_at).toBeFalsy();
      expect(NotificationService.sendNotification).not.toHaveBeenCalled();
    }
  });

  test('erro de banco no pedido vira 500 genérico sem vazar detalhes internos', async () => {
    const emergency = await createEmergency({ user_id: owner.id, partner_id: assignedPartner.id });
    db.__failQueriesOn('emergency_requests', 1);

    const started = await request(app)
      .post(`/api/emergency-requests/${emergency.id}/start`)
      .set(authorize(assignedPartnerUser));

    expect(started.status).toBe(500);
    const body = JSON.stringify(started.body);
    expect(body).not.toMatch(/ECONNREFUSED|select|constraint|at Object|stack/i);
    expect(started.body).toEqual({ success: false, message: 'Erro interno do servidor' });
  });
});

describe('G1 processo real (node src/server.js): start/complete não retornam 404', () => {
  let child;
  let baseUrl;
  let output = '';

  function freePort() {
    return new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.on('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
      });
    });
  }

  function httpProbe(method, pathname, body) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: Number(new URL(baseUrl).port),
          path: pathname,
          method,
          headers: payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {},
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        }
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  async function waitForHttp(timeoutMs = 25000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const response = await httpProbe('GET', '/');
        if (response.status) return;
      } catch (error) {
        // processo ainda subindo
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`processo real não respondeu em ${baseUrl}\n${output}`);
  }

  beforeAll(async () => {
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['src/server.js'], {
      cwd: BACKEND_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        JWT_SECRET: 'g1-real-process-smoke-secret',
        DB_HOST: '127.0.0.1',
        DB_PORT: '1',
        DB_NAME: 'g1_smoke',
        DB_USER: 'g1_smoke',
        DB_PASSWORD: 'g1_smoke',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    await waitForHttp();
  }, 40000);

  afterAll(async () => {
    if (child && !child.killed) {
      await new Promise((resolve) => {
        // Fallback mantido para o caso de o SIGTERM não encerrar o processo,
        // mas o timer é cancelado no exit para não deixar handle aberto.
        const killFallback = setTimeout(resolve, 3000);
        child.once('exit', () => {
          clearTimeout(killFallback);
          resolve();
        });
        child.kill('SIGTERM');
      });
    }
  }, 10000);

  test('start e complete respondem 401 (montados) e não 404', async () => {
    const started = await httpProbe('POST', '/api/emergency-requests/1/start');
    const completed = await httpProbe('POST', '/api/emergency-requests/1/complete');

    expect(started.status).toBe(401);
    expect(completed.status).toBe(401);
    expect(started.body).not.toMatch(/Rota não encontrada/);
    expect(completed.body).not.toMatch(/Rota não encontrada/);
  }, 15000);

  test('rota inexistente no mesmo processo continua 404 (controle)', async () => {
    const missing = await httpProbe('POST', '/api/emergency-requests/1/nao-existe');
    expect(missing.status).toBe(404);
  }, 15000);
});
