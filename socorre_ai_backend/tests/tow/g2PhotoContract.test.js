/**
 * G2 — contrato HTTP das fotos privadas de guincho + schema efetivo de complete.
 *
 * Sobe o app real (src/app.js) sobre SQLite em memória e dirige tudo por HTTP
 * com supertest, contra imagens JPEG/WebP reais geradas pelo sharp:
 *   - POST/GET /api/upload/emergency-requests/:id/photos[/:photo_type];
 *   - matriz de acesso (dono, parceiro atribuído, admin, terceiros, anônimo);
 *   - formato real (não MIME declarado), teto de 5 MB, resize <= 1920 px,
 *     EXIF normalizado, nome UUID, permissões privadas;
 *   - uma foto por tipo, retry 201 -> 200 e corrida concorrente com um vencedor;
 *   - falha de banco/filesystem sem órfão nem URL inválida;
 *   - `final_price` null/ausente/negativo/infinito inválido antes do UPDATE e
 *     piso de preço vindo exclusivamente de system_settings (sem teto inventado);
 *   - migration 045 idempotente e reversível.
 *
 * O armazenamento privado usa um diretório temporário real; nada é gravado em
 * uploads/ público nem em bucket externo.
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

  function maybeFail(table) {
    if (typeof table !== 'string') {
      return;
    }

    const rule = failures.find((entry) => entry.table === table && entry.remaining > 0);
    if (!rule) {
      return;
    }

    if (rule.skip > 0) {
      rule.skip -= 1;
      return;
    }

    rule.remaining -= 1;
    const error = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    error.code = 'ECONNREFUSED';
    throw error;
  }

  function wrapTrx(trx) {
    if (!trx || typeof trx !== 'function') {
      return trx;
    }

    return new Proxy(trx, {
      apply(target, thisArg, args) {
        maybeFail(args[0]);
        return Reflect.apply(target, target, args);
      },
      get(target, prop) {
        if (prop === 'then') {
          // impede absorção de thenable ao resolver a promise da transação
          return undefined;
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    });
  }

  const proxy = new Proxy(instance, {
    apply(target, thisArg, args) {
      maybeFail(args[0]);
      return Reflect.apply(target, target, args);
    },
    get(target, prop) {
      if (prop === 'transaction') {
        return (...args) => {
          const result = Reflect.apply(target.transaction, target, args);
          if (result && typeof result.then === 'function') {
            return result.then((trx) => wrapTrx(trx));
          }
          return wrapTrx(result);
        };
      }

      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });

  proxy.__failQueriesOn = (table, times = 1, options = {}) =>
    failures.push({ table, remaining: times, skip: options.skip || 0 });
  proxy.__clearFailures = () => {
    failures = [];
  };

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

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const knexFactory = require('knex');

const db = require('../../src/config/database');
const { createApp } = require('../../src/app');
const { getJwtSecret } = require('../../src/config/jwt');
const EmergencyRequest = require('../../src/models/EmergencyRequest');
const servicePhotoStorage = require('../../src/services/servicePhotoStorage');
const { emergencyRequestSchemas } = require('../../src/middleware/validation');
const NotificationService = require('../../src/services/NotificationServiceNew');
const paymentService = require('../../src/services/paymentService');

jest.setTimeout(60000);

const PHOTO_COLUMNS = [
  'pickup_photo_url',
  'delivery_photo_url',
  'pickup_photo_metadata',
  'delivery_photo_metadata',
];

let app;
let root;
let previousStorageRoot;
let fixtures = {};
let owner;
let ownerUser;
let assignedPartner;
let assignedPartnerUser;
let otherPartner;
let otherPartnerUser;
let strangerUser;
let adminUser;

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

  await db.schema.createTable('system_settings', (table) => {
    table.increments('id').primary();
    table.string('setting_key', 100).notNullable().unique();
    table.text('setting_value');
    table.string('data_type').defaultTo('string');
    table.text('description');
    table.string('category', 40).defaultTo('guincho');
    table.timestamp('created_at');
    table.timestamp('updated_at');
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
    table.text('photos'); // legado: não faz parte do contrato G2
    table.text('pickup_photo_url');
    table.text('delivery_photo_url');
    table.text('pickup_photo_metadata');
    table.text('delivery_photo_metadata');
    table.timestamp('accepted_at');
    table.datetime('started_at');
    table.datetime('completed_at');
    table.datetime('cancelled_at');
    table.timestamp('created_at');
    table.timestamp('updated_at');
  });
}

async function resetDatabase() {
  db.__clearFailures();
  for (const table of ['emergency_requests', 'revoked_tokens', 'partners', 'users', 'system_settings']) {
    // eslint-disable-next-line no-await-in-loop
    await db(table).del();
  }

  await fs.promises.rm(root, { recursive: true, force: true });
  await fs.promises.mkdir(root, { recursive: true, mode: 0o700 });
}

async function seedPricing(overrides = {}) {
  const values = {
    tow_price_per_km: '6',
    tow_platform_fixed_fee: '25',
    tow_minimum_charge: '90',
    tow_cancellation_fee: '40',
    ...overrides,
  };

  for (const [setting_key, setting_value] of Object.entries(values)) {
    // eslint-disable-next-line no-await-in-loop
    await db('system_settings').insert({
      setting_key,
      setting_value: String(setting_value),
      data_type: 'number',
      category: 'guincho',
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
}

async function createUser({ name, email, role }) {
  const [user] = await db('users')
    .insert({
      name,
      email,
      password: await bcrypt.hash('senha-forte', 4),
      phone: '+5511999999999',
      role,
      is_active: 1,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning('*');
  return user;
}

async function createPartner({ userId, type = 'tow', businessName = 'Guincho G2' }) {
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

async function createEmergency(overrides = {}) {
  const now = new Date();
  const [emergency] = await db('emergency_requests')
    .insert({
      user_id: overrides.user_id ?? owner.id,
      partner_id: overrides.partner_id ?? assignedPartner.id,
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
      price_breakdown: JSON.stringify({ total_estimated_price: 90, pricing_source: 'system_settings' }),
      accepted_at: now,
      created_at: now,
      updated_at: now,
      ...overrides,
    })
    .returning('*');
  return emergency;
}

function tokenFor(user) {
  return jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), { expiresIn: '1h' });
}

function authorize(user) {
  return { Authorization: `Bearer ${tokenFor(user)}` };
}

function uploadPayload(overrides = {}) {
  return {
    photo_type: 'pickup',
    image: fixtures.jpegSmall.toString('base64'),
    filename: 'foto.jpg',
    mimeType: 'image/jpeg',
    ...overrides,
  };
}

function uploadPhoto(emergencyId, user, overrides = {}) {
  return request(app)
    .post(`/api/upload/emergency-requests/${emergencyId}/photos`)
    .set(authorize(user))
    .send(uploadPayload(overrides));
}

function getPhoto(emergencyId, photoType, user, extra = {}) {
  return request(app)
    .get(`/api/upload/emergency-requests/${emergencyId}/photos/${photoType}`)
    .set(authorize(user))
    .set(extra.headers || {});
}

async function requestFiles(emergencyId) {
  try {
    return await fs.promises.readdir(path.join(root, String(emergencyId)));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function persistedRow(emergencyId) {
  return db('emergency_requests').where('id', emergencyId).first();
}

async function buildFixtures() {
  fixtures.jpegLarge = await sharp({
    create: { width: 3000, height: 1000, channels: 3, background: { r: 10, g: 120, b: 200 } },
  })
    .jpeg()
    .toBuffer();

  fixtures.jpegSmall = await sharp({
    create: { width: 100, height: 50, channels: 3, background: { r: 220, g: 30, b: 30 } },
  })
    .jpeg()
    .toBuffer();

  fixtures.webpLarge = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: { r: 20, g: 200, b: 120 } },
  })
    .webp()
    .toBuffer();

  fixtures.exifJpeg = await sharp({
    create: { width: 60, height: 120, channels: 3, background: { r: 90, g: 90, b: 20 } },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();

  fixtures.png = await sharp({
    create: { width: 40, height: 40, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .png()
    .toBuffer();

  fixtures.gif = await sharp({
    create: { width: 30, height: 30, channels: 3, background: { r: 5, g: 5, b: 5 } },
  })
    .gif()
    .toBuffer();

  fixtures.svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle r="10" cx="10" cy="10"/></svg>'
  );
  fixtures.pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
  fixtures.garbage = Buffer.from('conteudo que nao e imagem');
  fixtures.oversized = Buffer.alloc(5 * 1024 * 1024 + 4096, 3);
}

beforeAll(async () => {
  previousStorageRoot = process.env.SERVICE_PHOTO_STORAGE_DIR;
  root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'g2-photos-http-'));
  process.env.SERVICE_PHOTO_STORAGE_DIR = root;

  await buildFixtures();
  await initSchema();
  app = createApp();
});

afterAll(async () => {
  // O knex mockado é criado em nível de módulo (dentro de jest.mock) e mantém
  // um pool SQLite aberto: sem `destroy()` o event loop fica vivo e o Jest não
  // encerra sozinho. Fecha primeiro para garantir o cleanup mesmo se o rm falhar.
  await db.destroy();

  if (previousStorageRoot === undefined) {
    delete process.env.SERVICE_PHOTO_STORAGE_DIR;
  } else {
    process.env.SERVICE_PHOTO_STORAGE_DIR = previousStorageRoot;
  }
  await fs.promises.rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetDatabase();
  await seedPricing();

  ownerUser = await createUser({ name: 'Cliente', email: `cliente${Date.now()}@g2.test`, role: 'user' });
  owner = ownerUser;
  assignedPartnerUser = await createUser({
    name: 'Parceiro',
    email: `parceiro${Date.now()}@g2.test`,
    role: 'partner',
  });
  assignedPartner = await createPartner({ userId: assignedPartnerUser.id });
  otherPartnerUser = await createUser({
    name: 'Outro parceiro',
    email: `outro${Date.now()}@g2.test`,
    role: 'partner',
  });
  otherPartner = await createPartner({ userId: otherPartnerUser.id, businessName: 'Outro Guincho' });
  strangerUser = await createUser({ name: 'Terceiro', email: `terceiro${Date.now()}@g2.test`, role: 'user' });
  adminUser = await createUser({ name: 'Admin', email: `admin${Date.now()}@g2.test`, role: 'admin' });
});

describe('G2 fotos privadas — autenticação e autorização', () => {
  test('upload e leitura sem token retornam 401', async () => {
    const emergency = await createEmergency();

    const uploaded = await request(app)
      .post(`/api/upload/emergency-requests/${emergency.id}/photos`)
      .send(uploadPayload());
    const read = await request(app).get(
      `/api/upload/emergency-requests/${emergency.id}/photos/pickup`
    );

    expect(uploaded.status).toBe(401);
    expect(read.status).toBe(401);
    expect(await requestFiles(emergency.id)).toEqual([]);
  });

  test('cliente dono, parceiro atribuído e admin podem enviar e ler', async () => {
    for (const user of [owner, assignedPartnerUser, adminUser]) {
      const emergency = await createEmergency();

      const uploaded = await uploadPhoto(emergency.id, user);
      expect(uploaded.status).toBe(201);

      const read = await getPhoto(emergency.id, 'pickup', user);
      expect(read.status).toBe(200);
      expect(read.headers['content-type']).toMatch(/image\/jpeg/);
    }
  });

  test('terceiro e outro parceiro recebem 403 e nada é gravado', async () => {
    const emergency = await createEmergency();

    for (const user of [strangerUser, otherPartnerUser]) {
      const uploaded = await uploadPhoto(emergency.id, user);
      expect(uploaded.status).toBe(403);
    }

    expect(await requestFiles(emergency.id)).toEqual([]);
    expect((await persistedRow(emergency.id)).pickup_photo_url).toBeNull();
  });

  test('leitura por terceiro e por outro parceiro é 403 mesmo com foto existente', async () => {
    const emergency = await createEmergency();
    expect((await uploadPhoto(emergency.id, assignedPartnerUser)).status).toBe(201);

    for (const user of [strangerUser, otherPartnerUser]) {
      const read = await getPhoto(emergency.id, 'pickup', user);
      expect(read.status).toBe(403);
    }
  });

  test('pedido inexistente retorna 404 em upload e leitura', async () => {
    const uploaded = await uploadPhoto(999999, assignedPartnerUser);
    const read = await getPhoto(999999, 'pickup', assignedPartnerUser);

    expect(uploaded.status).toBe(404);
    expect(read.status).toBe(404);
  });

  test('photo_type inválido na leitura é 400', async () => {
    const emergency = await createEmergency();
    const read = await getPhoto(emergency.id, 'engine', assignedPartnerUser);

    expect(read.status).toBe(400);
  });

  test('foto não enviada retorna 404 (não 200 vazio)', async () => {
    const emergency = await createEmergency();
    const read = await getPhoto(emergency.id, 'delivery', assignedPartnerUser);

    expect(read.status).toBe(404);
  });
});

describe('G2 fotos privadas — formato real, limite e normalização por HTTP', () => {
  test('JPEG real é aceito com 201, URL do contrato e arquivo privado no disco', async () => {
    const emergency = await createEmergency();
    const response = await uploadPhoto(emergency.id, assignedPartnerUser, {
      image: fixtures.jpegLarge.toString('base64'),
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.photo_url).toBe(
      `/api/upload/emergency-requests/${emergency.id}/photos/pickup`
    );
    expect(response.body.data.mime_type).toBe('image/jpeg');
    expect(response.body.data.width).toBe(1920);
    expect(response.body.data.height).toBe(640);
    expect(response.body.data.size_bytes).toBeGreaterThan(0);
    expect(response.body.data.metadata.sha256).toMatch(/^[0-9a-f]{64}$/);

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain('storage_key');

    const files = await requestFiles(emergency.id);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^pickup-[0-9a-f-]{36}\.jpg$/);

    const fileStat = await fs.promises.lstat(path.join(root, String(emergency.id), files[0]));
    expect(fileStat.mode & 0o777).toBe(0o600);

    const row = await persistedRow(emergency.id);
    expect(row.pickup_photo_url).toBe(response.body.data.photo_url);
    const metadata = JSON.parse(row.pickup_photo_metadata);
    expect(metadata.storage_key).toBe(`${emergency.id}/${files[0]}`);
    expect(JSON.stringify(metadata)).not.toContain(root);

    const outputMetadata = await sharp(
      await fs.promises.readFile(path.join(root, String(emergency.id), files[0]))
    ).metadata();
    expect(outputMetadata.width).toBe(1920);
    expect(outputMetadata.height).toBe(640);
    expect(outputMetadata.exif).toBeUndefined();
  });

  test('WebP real é aceito como delivery', async () => {
    const emergency = await createEmergency();
    const response = await uploadPhoto(emergency.id, assignedPartnerUser, {
      photo_type: 'delivery',
      image: fixtures.webpLarge.toString('base64'),
      filename: 'traseira.webp',
      mimeType: 'image/webp',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.photo_type).toBe('delivery');
    expect(response.body.data.mime_type).toBe('image/webp');
    expect(response.body.data.width).toBe(1920);
    expect(response.body.data.height).toBe(960);
    expect((await requestFiles(emergency.id))[0]).toMatch(/^delivery-[0-9a-f-]{36}\.webp$/);
  });

  test('imagem pequena não é ampliada e orientação EXIF é normalizada', async () => {
    const emergency = await createEmergency();

    const small = await uploadPhoto(emergency.id, assignedPartnerUser);
    expect(small.status).toBe(201);
    expect(small.body.data.width).toBe(100);
    expect(small.body.data.height).toBe(50);

    const rotated = await uploadPhoto(emergency.id, assignedPartnerUser, {
      photo_type: 'delivery',
      image: fixtures.exifJpeg.toString('base64'),
      filename: 'girada.jpg',
    });
    expect(rotated.status).toBe(201);
    expect(rotated.body.data.width).toBe(120);
    expect(rotated.body.data.height).toBe(60);
  });

  test('formatos fora do contrato e conteúdo divergente são 400 sem gravar nada', async () => {
    const emergency = await createEmergency();

    const cases = [
      { image: fixtures.png.toString('base64'), filename: 'foto.png', mimeType: 'image/jpeg' },
      { image: fixtures.gif.toString('base64'), filename: 'foto.gif', mimeType: 'image/jpeg' },
      { image: fixtures.svg.toString('base64'), filename: 'foto.svg', mimeType: 'image/jpeg' },
      { image: fixtures.pdf.toString('base64'), filename: 'doc.pdf', mimeType: 'image/jpeg' },
      { image: fixtures.garbage.toString('base64'), filename: 'x.jpg', mimeType: 'image/jpeg' },
      { image: fixtures.png.toString('base64'), filename: 'foto.png', mimeType: 'image/png' },
      { image: fixtures.jpegSmall.toString('base64'), filename: 'foto.webp', mimeType: 'image/webp' },
      { image: 'nao-e-base64!!', filename: 'x.jpg', mimeType: 'image/jpeg' },
    ];

    for (const payload of cases) {
      // eslint-disable-next-line no-await-in-loop
      const response = await uploadPhoto(emergency.id, assignedPartnerUser, payload);
      expect([400]).toContain(response.status);
      expect(response.body.success).toBe(false);
    }

    expect(await requestFiles(emergency.id)).toEqual([]);
    expect((await persistedRow(emergency.id)).pickup_photo_url).toBeNull();
    expect((await persistedRow(emergency.id)).pickup_photo_metadata).toBeNull();
  });

  test('filename com traversal e mimeType divergente são 400', async () => {
    const emergency = await createEmergency();

    const traversal = await uploadPhoto(emergency.id, assignedPartnerUser, {
      filename: '../../etc/passwd',
    });
    expect(traversal.status).toBe(400);

    const divergent = await uploadPhoto(emergency.id, assignedPartnerUser, {
      image: fixtures.jpegSmall.toString('base64'),
      mimeType: 'image/webp',
    });
    expect(divergent.status).toBe(400);

    const missing = await uploadPhoto(emergency.id, assignedPartnerUser, { image: undefined });
    expect(missing.status).toBe(400);

    expect(await requestFiles(emergency.id)).toEqual([]);
  });

  test('payload acima de 5 MB é recusado sem gravar arquivo', async () => {
    const emergency = await createEmergency();
    const response = await uploadPhoto(emergency.id, assignedPartnerUser, {
      image: fixtures.oversized.toString('base64'),
      filename: 'gigante.jpg',
    });

    expect(response.status).toBe(400);
    expect(await requestFiles(emergency.id)).toEqual([]);
  });

  test('GET binário devolve a foto privada com Cache-Control no-store e sem metadados internos', async () => {
    const emergency = await createEmergency();
    const uploaded = await uploadPhoto(emergency.id, assignedPartnerUser);
    const photoUrl = uploaded.body.data.photo_url;

    const read = await request(app).get(photoUrl).set(authorize(owner));

    expect(read.status).toBe(200);
    expect(read.headers['content-type']).toMatch(/image\/jpeg/);
    expect(read.headers['cache-control']).toBe('private, no-store');
    expect(read.headers['pragma']).toBe('no-cache');
    expect(read.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.isBuffer(read.body)).toBe(true);
    expect(read.body.length).toBe(uploaded.body.data.size_bytes);
    expect(read.text || '').not.toContain(root);

    const files = await requestFiles(emergency.id);
    const disk = await fs.promises.readFile(path.join(root, String(emergency.id), files[0]));
    expect(read.body.equals(disk)).toBe(true);
  });

  test('GET ?format=json devolve base64 equivalente e sem chave de armazenamento', async () => {
    const emergency = await createEmergency();
    const uploaded = await uploadPhoto(emergency.id, assignedPartnerUser, {
      photo_type: 'delivery',
      image: fixtures.webpLarge.toString('base64'),
      filename: 'frente.webp',
      mimeType: 'image/webp',
    });

    const read = await getPhoto(emergency.id, 'delivery', owner, {
      headers: { Accept: 'application/json' },
    }).query({ format: 'json' });

    expect(read.status).toBe(200);
    expect(read.headers['cache-control']).toBe('private, no-store');
    expect(read.body.data.encoding).toBe('base64');
    expect(read.body.data.mime_type).toBe('image/webp');
    expect(read.body.data.photo_url).toBe(uploaded.body.data.photo_url);
    expect(read.body.data.metadata).toBeDefined();
    expect(JSON.stringify(read.body)).not.toContain(root);
    expect(JSON.stringify(read.body)).not.toContain('storage_key');

    const decoded = Buffer.from(read.body.data.base64, 'base64');
    expect(decoded.length).toBe(uploaded.body.data.size_bytes);
    expect((await sharp(decoded).metadata()).format).toBe('webp');
  });
});

describe('G2 fotos privadas — idempotência e concorrência', () => {
  test('retry do mesmo tipo responde 200 com o mesmo recurso e um único arquivo', async () => {
    const emergency = await createEmergency();

    const first = await uploadPhoto(emergency.id, assignedPartnerUser);
    expect(first.status).toBe(201);

    const filesAfterFirst = await requestFiles(emergency.id);
    const diskAfterFirst = await fs.promises.readFile(
      path.join(root, String(emergency.id), filesAfterFirst[0])
    );
    const rowAfterFirst = await persistedRow(emergency.id);

    const retry = await uploadPhoto(emergency.id, assignedPartnerUser, {
      image: fixtures.jpegLarge.toString('base64'),
    });

    expect(retry.status).toBe(200);
    expect(retry.body.data.photo_url).toBe(first.body.data.photo_url);
    expect(retry.body.data.metadata.sha256).toBe(first.body.data.metadata.sha256);

    const filesAfterRetry = await requestFiles(emergency.id);
    expect(filesAfterRetry).toEqual(filesAfterFirst);

    const diskAfterRetry = await fs.promises.readFile(
      path.join(root, String(emergency.id), filesAfterRetry[0])
    );
    expect(diskAfterRetry.equals(diskAfterFirst)).toBe(true);

    const rowAfterRetry = await persistedRow(emergency.id);
    expect(rowAfterRetry.pickup_photo_metadata).toBe(rowAfterFirst.pickup_photo_metadata);
  });

  test('pickup e delivery coexistem no mesmo pedido', async () => {
    const emergency = await createEmergency();

    const pickup = await uploadPhoto(emergency.id, assignedPartnerUser);
    const delivery = await uploadPhoto(emergency.id, assignedPartnerUser, {
      photo_type: 'delivery',
      image: fixtures.webpLarge.toString('base64'),
      filename: 'frente.webp',
      mimeType: 'image/webp',
    });

    expect(pickup.status).toBe(201);
    expect(delivery.status).toBe(201);
    expect((await requestFiles(emergency.id)).length).toBe(2);

    const row = await persistedRow(emergency.id);
    expect(row.pickup_photo_url).toContain('/pickup');
    expect(row.delivery_photo_url).toContain('/delivery');
  });

  test('dois uploads concorrentes do mesmo tipo: um 201, um 200 e um único arquivo', async () => {
    const emergency = await createEmergency();

    const [a, b] = await Promise.all([
      uploadPhoto(emergency.id, assignedPartnerUser),
      uploadPhoto(emergency.id, assignedPartnerUser, {
        image: fixtures.jpegLarge.toString('base64'),
      }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.data.photo_url).toBe(b.body.data.photo_url);
    expect(await requestFiles(emergency.id)).toHaveLength(1);

    const row = await persistedRow(emergency.id);
    expect(row.pickup_photo_url).toBe(a.body.data.photo_url);
  });

  test('uploads concorrentes de tipos diferentes geram dois arquivos', async () => {
    const emergency = await createEmergency();

    const [pickup, delivery] = await Promise.all([
      uploadPhoto(emergency.id, assignedPartnerUser),
      uploadPhoto(emergency.id, assignedPartnerUser, {
        photo_type: 'delivery',
        image: fixtures.webpLarge.toString('base64'),
        filename: 'frente.webp',
        mimeType: 'image/webp',
      }),
    ]);

    expect(pickup.status).toBe(201);
    expect(delivery.status).toBe(201);
    expect(await requestFiles(emergency.id)).toHaveLength(2);
  });
});

describe('G2 fotos privadas — falhas sem órfão nem URL inválida', () => {
  test('falha de banco depois da escrita do arquivo faz rollback e remove o órfão', async () => {
    const emergency = await createEmergency();

    // findById (1) e SELECT da transação (2) passam; o UPDATE (3) falha.
    db.__failQueriesOn('emergency_requests', 1, { skip: 2 });

    const failed = await uploadPhoto(emergency.id, assignedPartnerUser);

    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({ success: false, message: 'Erro interno do servidor' });
    expect(await requestFiles(emergency.id)).toEqual([]);

    const row = await persistedRow(emergency.id);
    expect(row.pickup_photo_url).toBeNull();
    expect(row.pickup_photo_metadata).toBeNull();

    db.__clearFailures();

    const retry = await uploadPhoto(emergency.id, assignedPartnerUser);
    expect(retry.status).toBe(201);
    expect(await requestFiles(emergency.id)).toHaveLength(1);
  });

  test('falha de filesystem (diretório do pedido é symlink) retorna 500 sem URL e sem órfão externo', async () => {
    const emergency = await createEmergency();
    const outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'g2-photos-escape-'));
    await fs.promises.symlink(outside, path.join(root, String(emergency.id)));

    try {
      const failed = await uploadPhoto(emergency.id, assignedPartnerUser);

      expect(failed.status).toBe(500);
      expect(failed.body).toEqual({ success: false, message: 'Erro interno do servidor' });
      expect(await fs.promises.readdir(outside)).toEqual([]);

      const row = await persistedRow(emergency.id);
      expect(row.pickup_photo_url).toBeNull();
    } finally {
      await fs.promises.rm(path.join(root, String(emergency.id)), { force: true });
      await fs.promises.rm(outside, { recursive: true, force: true });
    }
  });

  test('armazenamento não configurado responde 503 sem gravar nada', async () => {
    const emergency = await createEmergency();
    expect((await uploadPhoto(emergency.id, assignedPartnerUser)).status).toBe(201);

    const saved = process.env.SERVICE_PHOTO_STORAGE_DIR;
    delete process.env.SERVICE_PHOTO_STORAGE_DIR;

    try {
      const response = await uploadPhoto(emergency.id, assignedPartnerUser, {
        photo_type: 'delivery',
        image: fixtures.webpLarge.toString('base64'),
        filename: 'frente.webp',
        mimeType: 'image/webp',
      });

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);

      const read = await getPhoto(emergency.id, 'pickup', owner);
      expect(read.status).toBe(503);

      expect((await persistedRow(emergency.id)).delivery_photo_url).toBeNull();
    } finally {
      process.env.SERVICE_PHOTO_STORAGE_DIR = saved;
    }

    expect(await requestFiles(emergency.id)).toHaveLength(1);
  });

  test('arquivo ausente no disco vira 500 explícito e não 200 vazio', async () => {
    const emergency = await createEmergency();
    expect((await uploadPhoto(emergency.id, assignedPartnerUser)).status).toBe(201);

    const files = await requestFiles(emergency.id);
    await fs.promises.unlink(path.join(root, String(emergency.id), files[0]));

    const read = await getPhoto(emergency.id, 'pickup', owner);
    expect(read.status).toBe(500);
    expect(read.body.code).toBe('photo_unavailable');
    expect(JSON.stringify(read.body)).not.toContain(root);
  });

  test('erro de banco na leitura vira 500 genérico sem vazar detalhes internos', async () => {
    const emergency = await createEmergency();
    expect((await uploadPhoto(emergency.id, assignedPartnerUser)).status).toBe(201);

    db.__failQueriesOn('emergency_requests', 1);

    const read = await getPhoto(emergency.id, 'pickup', owner);
    expect(read.status).toBe(500);
    expect(read.body).toEqual({ success: false, message: 'Erro interno do servidor' });
  });
});

describe('G2 complete — schema efetivo de final_price e piso por system_settings', () => {
  function completeRequest(emergencyId, user, body) {
    return request(app)
      .post(`/api/emergency-requests/${emergencyId}/complete`)
      .set(authorize(user))
      .send(body);
  }

  test('guincho sem final_price retorna 400 sem UPDATE nem notificação', async () => {
    const emergency = await createEmergency({ status: 'in_progress', started_at: new Date() });

    const response = await completeRequest(emergency.id, assignedPartnerUser, {
      solution_description: 'sem preço',
    });

    expect(response.status).toBe(400);
    const row = await persistedRow(emergency.id);
    expect(row.status).toBe('in_progress');
    expect(row.final_price).toBeNull();
    expect(NotificationService.sendNotification).not.toHaveBeenCalled();
    expect(paymentService.createTowEmergencyPayment).not.toHaveBeenCalled();
  });

  test('final_price null é 400 antes de qualquer UPDATE', async () => {
    const emergency = await createEmergency({ status: 'in_progress', started_at: new Date() });

    const response = await completeRequest(emergency.id, assignedPartnerUser, {
      final_price: null,
      solution_description: 'preço nulo',
    });

    expect(response.status).toBe(400);
    const row = await persistedRow(emergency.id);
    expect(row.status).toBe('in_progress');
    expect(row.final_price).toBeNull();
  });

  test('final_price inválido, infinito ou negativo é 400 sem UPDATE', async () => {
    const emergency = await createEmergency({ status: 'in_progress', started_at: new Date() });

    for (const finalPrice of ['abc', 'Infinity', '-Infinity', -1, -0.01, '']) {
      // eslint-disable-next-line no-await-in-loop
      const response = await completeRequest(emergency.id, assignedPartnerUser, {
        final_price: finalPrice,
      });
      expect(response.status).toBe(400);
    }

    const row = await persistedRow(emergency.id);
    expect(row.status).toBe('in_progress');
    expect(row.final_price).toBeNull();
    expect(NotificationService.sendNotification).not.toHaveBeenCalled();
  });

  test('final_price abaixo do snapshot do pedido é 400 sem UPDATE', async () => {
    const emergency = await createEmergency({
      status: 'in_progress',
      started_at: new Date(),
      price_breakdown: JSON.stringify({ total_estimated_price: 200, minimum_charge: 200 }),
    });

    const response = await completeRequest(emergency.id, assignedPartnerUser, { final_price: 150 });

    expect(response.status).toBe(400);
    expect((await persistedRow(emergency.id)).status).toBe('in_progress');
    expect(paymentService.createTowEmergencyPayment).not.toHaveBeenCalled();
  });

  test('final_price válido conclui e persiste uma única vez', async () => {
    const emergency = await createEmergency({ status: 'in_progress', started_at: new Date() });

    const response = await completeRequest(emergency.id, assignedPartnerUser, {
      final_price: 120,
      solution_description: 'Atendimento concluído',
      parts_used: ['cabo'],
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const row = await persistedRow(emergency.id);
    expect(row.status).toBe('completed');
    expect(Number(row.final_price)).toBe(120);
    expect(row.solution_description).toBe('Atendimento concluído');
    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);

    const completedAt = row.completed_at;

    const retry = await completeRequest(emergency.id, assignedPartnerUser, {
      final_price: 150,
      solution_description: 'retry',
    });

    expect(retry.status).toBe(200);
    const retried = await persistedRow(emergency.id);
    expect(Number(retried.final_price)).toBe(120);
    expect(retried.completed_at).toBe(completedAt);
    expect(NotificationService.sendNotification).toHaveBeenCalledTimes(1);
  });

  test('pedido mechanic segue aceitando complete sem final_price', async () => {
    const emergency = await createEmergency({
      request_type: 'mechanic',
      status: 'in_progress',
      started_at: new Date(),
    });

    const response = await completeRequest(emergency.id, assignedPartnerUser, {
      solution_description: 'Serviço concluído',
    });

    expect(response.status).toBe(200);
    expect((await persistedRow(emergency.id)).status).toBe('completed');
  });

  test('piso de preço acompanha system_settings, sem teto inventado', async () => {
    await db('system_settings').where('setting_key', 'tow_minimum_charge').update({ setting_value: '200' });
    const pricing = await EmergencyRequest.getTowPricingSettings();
    expect(pricing.tow_minimum_charge).toBe(200);

    const emergency = await createEmergency({
      status: 'in_progress',
      started_at: new Date(),
      price_breakdown: JSON.stringify({
        minimum_charge: pricing.tow_minimum_charge,
        total_estimated_price: pricing.tow_minimum_charge,
        pricing_source: 'system_settings',
      }),
    });

    const belowMinimum = await completeRequest(emergency.id, assignedPartnerUser, { final_price: 150 });
    expect(belowMinimum.status).toBe(400);

    // Valor alto nunca é recusado: não existe teto de preço.
    const aboveMinimum = await completeRequest(emergency.id, assignedPartnerUser, { final_price: 999999 });
    expect(aboveMinimum.status).toBe(200);

    const persisted = await persistedRow(emergency.id);
    expect(Number(persisted.final_price)).toBe(999999);
  });

  test('pedido legado sem price_breakdown usa o system_settings vigente', async () => {
    await db('system_settings').where('setting_key', 'tow_minimum_charge').update({ setting_value: '120' });

    const emergency = await createEmergency({
      status: 'in_progress',
      started_at: new Date(),
      price_breakdown: null,
    });

    const belowMinimum = await completeRequest(emergency.id, assignedPartnerUser, { final_price: 100 });
    expect(belowMinimum.status).toBe(400);
    expect((await persistedRow(emergency.id)).status).toBe('in_progress');

    const valid = await completeRequest(emergency.id, assignedPartnerUser, { final_price: 150 });
    expect(valid.status).toBe(200);
    expect((await persistedRow(emergency.id)).status).toBe('completed');
  });

  test('validateTowProposalPrice não aceita preço não numérico', async () => {
    const emergency = await createEmergency();

    const validation = await EmergencyRequest.validateTowProposalPrice(emergency.id, 'abc');

    expect(validation.valid).toBe(false);
  });

  test('mechanic com final_price null continua inválido (schema do contrato)', async () => {
    const emergency = await createEmergency({
      request_type: 'mechanic',
      status: 'in_progress',
      started_at: new Date(),
    });

    const response = await completeRequest(emergency.id, assignedPartnerUser, { final_price: null });

    expect(response.status).toBe(400);
    expect((await persistedRow(emergency.id)).status).toBe('in_progress');
  });

  test('mechanic aceita corpo vazio e persiste sem preço (contrato G1 preservado)', async () => {
    const emergency = await createEmergency({
      request_type: 'mechanic',
      status: 'in_progress',
      started_at: new Date(),
    });

    const response = await completeRequest(emergency.id, assignedPartnerUser, {});

    expect(response.status).toBe(200);
    const row = await persistedRow(emergency.id);
    expect(row.status).toBe('completed');
    expect(row.final_price).toBeNull();
  });

  test('mechanic com final_price válido persiste o preço informado', async () => {
    const emergency = await createEmergency({
      request_type: 'mechanic',
      status: 'in_progress',
      started_at: new Date(),
    });

    const response = await completeRequest(emergency.id, assignedPartnerUser, { final_price: 180 });

    expect(response.status).toBe(200);
    expect(Number((await persistedRow(emergency.id)).final_price)).toBe(180);
  });
});

describe('G2 schema de complete — mechanic preservado, tow exige preço', () => {
  test('completeMechanic aceita corpo vazio e rejeita final_price inválido', () => {
    expect(emergencyRequestSchemas.completeMechanic.validate({}).error).toBeUndefined();
    expect(emergencyRequestSchemas.completeMechanic.validate({ final_price: 120 }).error).toBeUndefined();

    for (const finalPrice of [null, -1, 'abc', Infinity, NaN]) {
      expect(
        emergencyRequestSchemas.completeMechanic.validate({ final_price: finalPrice }).error
      ).toBeDefined();
    }
  });

  test('completeTow difere do mechanic apenas em final_price obrigatório', () => {
    expect(emergencyRequestSchemas.completeTow.validate({}).error).toBeDefined();
    expect(emergencyRequestSchemas.completeTow.validate({ final_price: 0 }).error).toBeUndefined();

    const mechanicFields = Object.keys(emergencyRequestSchemas.completeMechanic.describe().keys).sort();
    const towFields = Object.keys(emergencyRequestSchemas.completeTow.describe().keys).sort();
    expect(towFields).toEqual(mechanicFields);
  });
});

describe('G2 pricing — ausência de configuração nunca vira default', () => {
  function completeRequest(emergencyId, user, body) {
    return request(app)
      .post(`/api/emergency-requests/${emergencyId}/complete`)
      .set(authorize(user))
      .send(body);
  }

  test('getTowPricingSettings devolve null quando nada está configurado', async () => {
    await db('system_settings').whereIn('setting_key', EmergencyRequest.TOW_PRICING_KEYS).del();

    expect(await EmergencyRequest.getTowPricingSettings()).toBeNull();
  });

  test('valor ausente/inválido vira null sem cair no default hardcoded antigo', async () => {
    await db('system_settings').whereIn('setting_key', EmergencyRequest.TOW_PRICING_KEYS).del();
    await seedPricing({ tow_price_per_km: 'abc', tow_platform_fixed_fee: '-1', tow_cancellation_fee: '' });

    const pricing = await EmergencyRequest.getTowPricingSettings();

    expect(pricing).toMatchObject({
      tow_price_per_km: null,
      tow_platform_fixed_fee: null,
      tow_cancellation_fee: null,
      tow_minimum_charge: 90,
    });
    expect(pricing.tow_price_per_km).not.toBe(6);
    expect(pricing.tow_platform_fixed_fee).not.toBe(25);
    expect(pricing.tow_cancellation_fee).not.toBe(40);
  });

  test('calculateTowEstimate lança erro controlado listando as chaves ausentes', async () => {
    await db('system_settings')
      .whereIn('setting_key', ['tow_price_per_km', 'tow_platform_fixed_fee', 'tow_minimum_charge'])
      .del();

    await expect(
      EmergencyRequest.calculateTowEstimate({ latitude: -9.97, longitude: -67.81 })
    ).rejects.toMatchObject({
      name: 'TowPricingNotConfiguredError',
      code: 'tow_pricing_not_configured',
      status: 503,
      missingKeys: ['tow_price_per_km', 'tow_platform_fixed_fee', 'tow_minimum_charge'],
    });
  });

  test('createTowRequest não cria pedido quando o pricing está ausente', async () => {
    await db('system_settings').whereIn('setting_key', EmergencyRequest.TOW_PRICING_KEYS).del();
    const before = await db('emergency_requests').count({ total: '*' }).first();

    await expect(
      EmergencyRequest.createTowRequest({
        user_id: owner.id,
        type: 'other',
        description: 'Veículo precisa de guincho',
        location_type: 'roadside',
        latitude: -9.97,
        longitude: -67.81,
        address: 'Acre',
      })
    ).rejects.toMatchObject({ code: 'tow_pricing_not_configured', status: 503 });

    const after = await db('emergency_requests').count({ total: '*' }).first();
    expect(Number(after.total)).toBe(Number(before.total));
  });

  test('calculateTowEstimate usa apenas o pricing configurado (sem default silencioso)', async () => {
    await db('system_settings').whereIn('setting_key', EmergencyRequest.TOW_PRICING_KEYS).del();
    await seedPricing({ tow_price_per_km: '10', tow_platform_fixed_fee: '30', tow_minimum_charge: '0' });
    await db('system_settings').where('setting_key', 'tow_cancellation_fee').del();

    const breakdown = await EmergencyRequest.calculateTowEstimate({
      latitude: -9.97,
      longitude: -67.81,
    });

    expect(breakdown).toMatchObject({
      tow_price_per_km: 10,
      platform_fixed_fee: 30,
      minimum_charge: 0,
      pricing_source: 'system_settings',
    });
    // Sem `tow_cancellation_fee` configurado o breakdown traz null — nunca 40.
    expect(breakdown.cancellation_fee).toBeNull();
  });

  test('POST tow sem pricing responde 503 controlado e não persiste pedido', async () => {
    await db('system_settings').whereIn('setting_key', EmergencyRequest.TOW_PRICING_KEYS).del();
    const before = await db('emergency_requests').count({ total: '*' }).first();

    const response = await request(app)
      .post('/api/emergency-requests')
      .set(authorize(ownerUser))
      .send({
        type: 'other',
        request_type: 'tow',
        description: 'Veículo precisa de guincho na rodovia',
        vehicle_info: { brand: 'Fiat', model: 'Uno', year: 2015 },
        location_type: 'roadside',
        latitude: -9.97,
        longitude: -67.81,
        address: 'Acre',
      });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ success: false, code: 'tow_pricing_not_configured' });
    expect(response.body.missing_settings).toEqual(
      expect.arrayContaining(['tow_price_per_km', 'tow_platform_fixed_fee', 'tow_minimum_charge'])
    );

    const after = await db('emergency_requests').count({ total: '*' }).first();
    expect(Number(after.total)).toBe(Number(before.total));
  });

  test('legado sem breakdown e sem minimum configurado não inventa piso 90', async () => {
    await db('system_settings').where('setting_key', 'tow_minimum_charge').del();
    const emergency = await createEmergency({
      status: 'in_progress',
      started_at: new Date(),
      price_breakdown: null,
    });

    expect(await EmergencyRequest.resolveTowMinimumPrice(emergency.id)).toBeNull();

    const validation = await EmergencyRequest.validateTowProposalPrice(emergency.id, 10);
    expect(validation).toMatchObject({ valid: true, minimumAcceptedPrice: null });

    const response = await completeRequest(emergency.id, assignedPartnerUser, { final_price: 10 });
    expect(response.status).toBe(200);
    expect(Number((await persistedRow(emergency.id)).final_price)).toBe(10);
  });
});

describe('G2 fotos privadas — reconciliação de órfãos com referências do banco', () => {
  test('remove só arquivo válido sem referência e preserva referenciado e fora do padrão', async () => {
    const emergency = await createEmergency({ status: 'in_progress', started_at: new Date() });

    const uploaded = await uploadPhoto(emergency.id, assignedPartnerUser);
    expect(uploaded.status).toBe(201);

    const row = await persistedRow(emergency.id);
    const { storage_key: storageKey } = JSON.parse(row.pickup_photo_metadata);

    const orphanName = `delivery-${crypto.randomUUID()}.jpg`;
    const orphanPath = path.join(root, String(emergency.id), orphanName);
    await fs.promises.writeFile(orphanPath, fixtures.jpegSmall, { mode: 0o600 });

    // Prefixo arbitrário não é chave do contrato: nunca é listado nem removido.
    const prefixedName = `engine-${crypto.randomUUID()}.jpg`;
    const prefixedPath = path.join(root, String(emergency.id), prefixedName);
    await fs.promises.writeFile(prefixedPath, fixtures.jpegSmall, { mode: 0o600 });

    const references = await EmergencyRequest.listPhotoStorageReferences();
    expect(references.keys).toContain(storageKey);
    expect(references.prefixes).toContain(`${emergency.id}/pickup-`);

    const dryRun = await servicePhotoStorage.reconcileOrphanServicePhotos({ references, dryRun: true });
    expect(dryRun.orphan_keys).toContain(`${emergency.id}/${orphanName}`);
    expect(dryRun.orphan_keys).not.toContain(`${emergency.id}/${prefixedName}`);
    expect(dryRun.removed).toBe(0);
    expect(fs.existsSync(orphanPath)).toBe(true);

    const applied = await servicePhotoStorage.reconcileOrphanServicePhotos({ references, dryRun: false });
    expect(applied).toMatchObject({ scanned: 2, referenced: 1, orphaned: 1, removed: 1, failed: 0 });
    expect(fs.existsSync(orphanPath)).toBe(false);
    expect(fs.existsSync(prefixedPath)).toBe(true);

    const read = await getPhoto(emergency.id, 'pickup', ownerUser);
    expect(read.status).toBe(200);
    expect(read.headers['content-type']).toMatch(/^image\//);
  });

  test('prefixo por pedido/tipo protege foto com metadata ilegível', async () => {
    const emergency = await createEmergency({ status: 'in_progress', started_at: new Date() });

    const uploaded = await uploadPhoto(emergency.id, assignedPartnerUser);
    expect(uploaded.status).toBe(201);

    const row = await persistedRow(emergency.id);
    const { storage_key: storageKey } = JSON.parse(row.pickup_photo_metadata);

    // Linha com URL preenchida e metadata corrompida: a chave exata some, mas o
    // prefixo <id>/<tipo>- continua protegendo o arquivo.
    await db('emergency_requests').where('id', emergency.id).update({ pickup_photo_metadata: '{invalido' });

    const references = await EmergencyRequest.listPhotoStorageReferences();
    expect(references.keys).toEqual([]);
    expect(references.prefixes).toContain(`${emergency.id}/pickup-`);

    const applied = await servicePhotoStorage.reconcileOrphanServicePhotos({ references, dryRun: false });
    expect(applied).toMatchObject({ scanned: 1, referenced: 1, orphaned: 0, removed: 0, failed: 0 });
    expect(fs.existsSync(path.join(root, String(emergency.id), storageKey.split('/')[1]))).toBe(true);
  });
});

describe('G2 migration 045 — contrato de fotos idempotente e reversível', () => {
  let migrationDb;

  beforeEach(async () => {
    migrationDb = knexFactory({ client: 'sqlite3', connection: ':memory:', useNullAsDefault: true });

    await migrationDb.schema.createTable('emergency_requests', (table) => {
      table.increments('id').primary();
      table.string('status', 30).defaultTo('pending');
      table.text('photos');
      table.timestamp('created_at');
    });
  });

  afterEach(async () => {
    await migrationDb.destroy();
  });

  test('up adiciona as quatro colunas sem tocar em photos e é idempotente', async () => {
    const migration = require('../../database/migrations-legacy/045_add_emergency_request_photo_contract');

    await migration.up(migrationDb);
    await migration.up(migrationDb);

    for (const column of PHOTO_COLUMNS) {
      // eslint-disable-next-line no-await-in-loop
      expect(await migrationDb.schema.hasColumn('emergency_requests', column)).toBe(true);
    }
    expect(await migrationDb.schema.hasColumn('emergency_requests', 'photos')).toBe(true);
  });

  test('down remove apenas as colunas do contrato e é idempotente', async () => {
    const migration = require('../../database/migrations-legacy/045_add_emergency_request_photo_contract');

    await migration.up(migrationDb);
    await migration.down(migrationDb);
    await migration.down(migrationDb);

    for (const column of PHOTO_COLUMNS) {
      // eslint-disable-next-line no-await-in-loop
      expect(await migrationDb.schema.hasColumn('emergency_requests', column)).toBe(false);
    }
    expect(await migrationDb.schema.hasColumn('emergency_requests', 'photos')).toBe(true);
    expect(await migrationDb.schema.hasColumn('emergency_requests', 'status')).toBe(true);
  });

  test('up depois de down volta a criar o contrato e preserva dados existentes', async () => {
    const migration = require('../../database/migrations-legacy/045_add_emergency_request_photo_contract');

    await migrationDb('emergency_requests').insert({ status: 'accepted', photos: 'legado' });

    await migration.up(migrationDb);
    await migrationDb('emergency_requests').where('id', 1).update({
      pickup_photo_url: '/api/upload/emergency-requests/1/photos/pickup',
      pickup_photo_metadata: JSON.stringify({ storage_key: '1/pickup-x.jpg' }),
    });

    await migration.down(migrationDb);
    await migration.up(migrationDb);

    const row = await migrationDb('emergency_requests').where('id', 1).first();
    expect(row.status).toBe('accepted');
    expect(row.photos).toBe('legado');
    expect(row.pickup_photo_url).toBeNull();
    expect(row.pickup_photo_metadata).toBeNull();
  });
});
