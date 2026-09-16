/**
 * TOW — fluxo completo de documentos obrigatórios (rg_cpf, cnh, crlv, address_proof).
 *
 * Aceite coberto (pedido Mobile/E2E):
 *   - onboarding tow conclui com coordenadas e cai em documents_pending;
 *   - upload autenticado dos 4 documentos obrigatórios (multipart);
 *   - status do onboarding reflete faltantes/pendentes/aprovados/rejeitados;
 *   - submit só libera quando não falta documento obrigatório;
 *   - admin aprova documento a documento; o parceiro só vira `approved`
 *     (canAccessDashboard=true) quando todos estiverem aprovados;
 *   - rejeição marca o documento e o parceiro, exige motivo e permite reenvio;
 *   - reenvio substitui o documento rejeitado (sem duplicar tipo) e devolve o
 *     parceiro para análise.
 *
 * Mesmo padrão dos gates anteriores: SQLite em memória substituindo
 * `src/config/database`, schema criado à mão e app real via supertest.
 */
process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../src/config/database', () => require('./helpers/g3TestHarness').createDatabase());
jest.mock('../../src/services/NotificationServiceNew', () => ({ sendNotification: jest.fn() }));
jest.mock('../../src/services/paymentService', () => ({
  createTowEmergencyPayment: jest.fn(),
  createTowCancellationFeePayment: jest.fn(),
  getEmergencyActiveServicePayment: jest.fn(),
  cancelPayment: jest.fn(),
  getEmergencyPaymentSummary: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const db = require('../../src/config/database');
const { createApp } = require('../../src/app');
const harness = require('./helpers/g3TestHarness');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/documents');
const REQUIRED_TOW_DOCUMENTS = ['rg_cpf', 'cnh', 'crlv', 'address_proof'];
const ONBOARDING_COMPLETE = '/api/partners/onboarding/complete';
const ONBOARDING_STATUS = '/api/partners/me/onboarding-status';
const DOCUMENTS_UPLOAD = '/api/partners/documents/upload';
const DOCUMENTS_SUBMIT = '/api/partners/documents/submit';
const DOCUMENTS_LIST = '/api/partners/documents';

let app;
let filesBefore = new Set();

async function extendSchema() {
  await db.schema.alterTable('users', (table) => {
    table.string('onboarding_stage', 30);
    table.string('onboarding_partner_type', 30);
  });

  await db.schema.alterTable('partners', (table) => {
    // Colunas usadas pelo payload de onboarding (o harness G3 só traz o
    // subconjunto necessário para nearby/propostas).
    table.text('description');
    table.text('specialties');
    table.text('address');
    table.text('working_hours');
    table.text('payment_methods');
    table.text('service_areas');
    table.text('certifications');
    table.text('store_categories');
    table.string('whatsapp', 30);
    table.string('website', 255);
    table.string('instagram', 255);
    table.string('facebook', 255);
    table.string('vehicle_type', 100);
    table.string('cnh_category', 10);
    table.boolean('emergency_service').defaultTo(false);
    table.boolean('workshop_service').defaultTo(false);
    table.boolean('delivery_service').defaultTo(false);
    table.boolean('home_service').defaultTo(false);
    table.text('rejection_reason');
    table.timestamp('approved_at');
    table.integer('approved_by').unsigned();
  });

  await db.schema.createTable('partner_documents', (table) => {
    table.increments('id').primary();
    table.integer('partner_id').unsigned().notNullable();
    table.string('document_type', 50).notNullable();
    table.string('filename', 255);
    table.string('original_name', 255);
    table.string('file_path', 500);
    table.string('mime_type', 100);
    table.integer('file_size');
    table.string('status', 30).defaultTo('pending');
    table.text('rejection_reason');
    table.integer('verified_by').unsigned();
    table.timestamp('verified_at');
    table.text('verification_metadata');
    table.timestamp('uploaded_at').defaultTo(db.fn.now());
    table.timestamp('created_at').defaultTo(db.fn.now());
    table.timestamp('updated_at').defaultTo(db.fn.now());
  });
}

async function resetAll() {
  await db('partner_documents').del();
  await harness.resetDatabase(db);
}

async function seedTowUser(overrides = {}) {
  return harness.seedUser(db, { role: 'partner', ...overrides });
}

async function completeOnboarding(user, overrides = {}) {
  return request(app)
    .post(ONBOARDING_COMPLETE)
    .set(harness.authorize(user))
    .send({
      partner_type: 'tow',
      company_name: 'Guincho Documentos',
      phone: '+5511999999999',
      address: 'Av. Paulista, 1000',
      latitude: -23.5505,
      longitude: -46.6333,
      ...overrides,
    });
}

function uploadDocument(user, documentType, { filename, contentType = 'image/jpeg', body } = {}) {
  const extension = path.extname(filename || `${documentType}.jpg`) || '.jpg';
  return request(app)
    .post(DOCUMENTS_UPLOAD)
    .set(harness.authorize(user))
    .field('document_type', documentType)
    .attach('file', body || Buffer.from(`conteudo-${documentType}`), {
      filename: filename || `${documentType}${extension}`,
      contentType,
    });
}

async function uploadAllRequired(user) {
  const responses = [];
  for (const documentType of REQUIRED_TOW_DOCUMENTS) {
    responses.push(await uploadDocument(user, documentType));
  }
  return responses;
}

function verifyDocument(admin, documentId, body) {
  return request(app)
    .put(`/api/partners/documents/admin/${documentId}/verify`)
    .set(harness.authorize(admin))
    .send(body);
}

function getStatus(user) {
  return request(app).get(ONBOARDING_STATUS).set(harness.authorize(user));
}

async function listDocuments(user) {
  const response = await request(app).get(DOCUMENTS_LIST).set(harness.authorize(user));
  return response.body.data.documents;
}

function documentsByType(documents) {
  return documents.reduce((acc, document) => {
    acc[document.document_type] = document;
    return acc;
  }, {});
}

function expectStableDocumentShape(document) {
  expect(document).toEqual(
    expect.objectContaining({
      id: expect.any(Number),
      partner_id: expect.any(Number),
      document_type: expect.any(String),
      filename: expect.any(String),
      original_name: expect.any(String),
      mime_type: expect.any(String),
      status: expect.any(String),
    }),
  );
}

beforeAll(async () => {
  await harness.initSchema(db);
  await extendSchema();
  app = createApp();
  if (fs.existsSync(UPLOAD_DIR)) {
    filesBefore = new Set(fs.readdirSync(UPLOAD_DIR));
  } else {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
});

beforeEach(async () => {
  await resetAll();
});

afterAll(async () => {
  if (fs.existsSync(UPLOAD_DIR)) {
    for (const entry of fs.readdirSync(UPLOAD_DIR)) {
      if (!filesBefore.has(entry)) {
        try {
          fs.unlinkSync(path.join(UPLOAD_DIR, entry));
        } catch (_) {
          // melhor esforço: o teste não deve falhar na limpeza
        }
      }
    }
  }
  await db.destroy();
});

describe('tow — upload autenticado dos documentos obrigatórios', () => {
  test('sem Bearer não grava documento e responde 401', async () => {
    const user = await seedTowUser();
    await completeOnboarding(user);

    const response = await request(app)
      .post(DOCUMENTS_UPLOAD)
      .field('document_type', 'rg_cpf')
      .attach('file', Buffer.from('rg'), { filename: 'rg.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(401);
    expect(await db('partner_documents').count({ total: '*' }).first()).toEqual({ total: 0 });
  });

  test('onboarding tow salva coordenadas e cai em documents_pending', async () => {
    const user = await seedTowUser();
    const response = await completeOnboarding(user);

    expect(response.status).toBe(201);
    expect(response.body.data.onboarding).toEqual(
      expect.objectContaining({
        hasPartner: true,
        partnerType: 'tow',
        onboardingStage: 'documents_pending',
        canAccessDashboard: false,
        documentsRequired: true,
        documentsSubmitted: false,
        nextStep: 'document_upload',
      }),
    );
    expect(response.body.data.onboarding.missingDocuments).toEqual(REQUIRED_TOW_DOCUMENTS);

    const partner = await db('partners').where('user_id', user.id).first();
    expect(Number(partner.latitude)).toBeCloseTo(-23.5505, 6);
    expect(Number(partner.longitude)).toBeCloseTo(-46.6333, 6);
    expect(partner.approval_status).toBe('documents_required');
  });

  test('falha ao gravar o usuário desfaz o parceiro (sem cadastro parcial)', async () => {
    const user = await seedTowUser();

    await db.raw(
      "CREATE TRIGGER falha_onboarding_user_update BEFORE UPDATE ON users BEGIN SELECT RAISE(ABORT, 'falha simulada'); END",
    );
    try {
      const response = await completeOnboarding(user);
      expect(response.status).toBe(500);
    } finally {
      await db.raw('DROP TRIGGER IF EXISTS falha_onboarding_user_update');
    }

    expect(await db('partners').where('user_id', user.id).count({ total: '*' }).first()).toEqual({
      total: 0,
    });
    const persistedUser = await db('users').where('id', user.id).first();
    expect(persistedUser.onboarding_stage).toBeNull();
  });

  test('estágio do onboarding segue o parceiro: sem aprovação inventada e sem travar aprovado', async () => {
    const user = await seedTowUser();
    await completeOnboarding(user);
    const partner = await db('partners').where('user_id', user.id).first();

    // onboarding_stage antigo/otimista não pode liberar dashboard sem approval.
    await db('users').where('id', user.id).update({ onboarding_stage: 'approved' });
    let status = await getStatus(user);
    expect(status.body.data.onboardingStage).toBe('documents_pending');
    expect(status.body.data.canAccessDashboard).toBe(false);

    // approval real do parceiro libera dashboard mesmo com stage defasado.
    await db('partners').where('id', partner.id).update({ approval_status: 'approved', is_verified: 1 });
    await db('users').where('id', user.id).update({ onboarding_stage: 'account_created' });
    status = await getStatus(user);
    expect(status.body.data.onboardingStage).toBe('approved');
    expect(status.body.data.approvalStatus).toBe('approved');
    expect(status.body.data.canAccessDashboard).toBe(true);
    expect(status.body.data.nextStep).toBe('dashboard');
  });

  test('os 4 documentos obrigatórios são aceitos um a um e o status some dos faltantes', async () => {
    const user = await seedTowUser();
    await completeOnboarding(user);

    const responses = await uploadAllRequired(user);
    for (const response of responses) {
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expectStableDocumentShape(response.body.data);
      expect(response.body.data.status).toBe('pending');
    }

    const documents = await listDocuments(user);
    expect(documents).toHaveLength(4);
    expect(documents.map((document) => document.document_type).sort()).toEqual(
      [...REQUIRED_TOW_DOCUMENTS].sort(),
    );
    expect(documents.every((document) => document.status === 'pending')).toBe(true);

    const status = await getStatus(user);
    expect(status.status).toBe(200);
    expect(status.body.data.missingDocuments).toEqual([]);
    expect(status.body.data.onboardingStage).toBe('documents_pending');
    expect(status.body.data.canAccessDashboard).toBe(false);
  });

  test('tipo não obrigatório e mime inválido são recusados sem gravar', async () => {
    const user = await seedTowUser();
    await completeOnboarding(user);

    const notRequired = await uploadDocument(user, 'cnpj', { filename: 'cnpj.jpg' });
    expect(notRequired.status).toBe(400);

    const invalidMime = await uploadDocument(user, 'rg_cpf', {
      filename: 'rg.txt',
      contentType: 'text/plain',
    });
    expect(invalidMime.status).toBe(400);

    expect(await db('partner_documents').count({ total: '*' }).first()).toEqual({ total: 0 });
  });

  test('submit antes de completar os 4 documentos é 400 e mantém documents_pending', async () => {
    const user = await seedTowUser();
    await completeOnboarding(user);
    await uploadDocument(user, 'rg_cpf');

    const response = await request(app)
      .post(DOCUMENTS_SUBMIT)
      .set(harness.authorize(user));

    expect(response.status).toBe(400);
    expect(response.body.data.missingDocuments).toEqual(['cnh', 'crlv', 'address_proof']);

    const partner = await db('partners').where('user_id', user.id).first();
    expect(partner.approval_status).toBe('documents_required');

    const status = await getStatus(user);
    expect(status.body.data.onboardingStage).toBe('documents_pending');
    expect(status.body.data.nextStep).toBe('document_upload');
  });
});

describe('tow — aprovação, rejeição e reenvio', () => {
  test('submit com os 4 documentos vai para under_review/pending', async () => {
    const user = await seedTowUser();
    await completeOnboarding(user);
    await uploadAllRequired(user);

    const response = await request(app)
      .post(DOCUMENTS_SUBMIT)
      .set(harness.authorize(user));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        onboardingStage: 'under_review',
        approvalStatus: 'pending',
        documentsSubmitted: true,
        canAccessDashboard: false,
        nextStep: 'pending_review',
      }),
    );

    const partner = await db('partners').where('user_id', user.id).first();
    expect(partner.approval_status).toBe('pending');
  });

  test('aprovação parcial não libera dashboard; a última aprovação libera em approved', async () => {
    const user = await seedTowUser();
    const admin = await harness.seedUser(db, { role: 'admin' });
    await completeOnboarding(user);
    await uploadAllRequired(user);
    await request(app).post(DOCUMENTS_SUBMIT).set(harness.authorize(user));

    const documents = documentsByType(await listDocuments(user));

    for (const documentType of REQUIRED_TOW_DOCUMENTS.slice(0, -1)) {
      const response = await verifyDocument(admin, documents[documentType].id, { status: 'approved' });
      expect(response.status).toBe(200);

      const status = await getStatus(user);
      expect(status.body.data.canAccessDashboard).toBe(false);
    }

    const last = await verifyDocument(admin, documents[REQUIRED_TOW_DOCUMENTS.at(-1)].id, {
      status: 'approved',
    });
    expect(last.status).toBe(200);

    const status = await getStatus(user);
    expect(status.status).toBe(200);
    expect(status.body.data).toEqual(
      expect.objectContaining({
        onboardingStage: 'approved',
        approvalStatus: 'approved',
        canAccessDashboard: true,
        nextStep: 'dashboard',
        documentsSubmitted: true,
      }),
    );
    expect(status.body.data.missingDocuments).toEqual([]);

    const partner = await db('partners').where('user_id', user.id).first();
    expect(partner.approval_status).toBe('approved');
    expect(partner.is_verified).toBe(1);
  });

  test('rejeição exige motivo, marca documento e parceiro e libera reenvio', async () => {
    const user = await seedTowUser();
    const admin = await harness.seedUser(db, { role: 'admin' });
    await completeOnboarding(user);
    await uploadAllRequired(user);
    await request(app).post(DOCUMENTS_SUBMIT).set(harness.authorize(user));

    const before = documentsByType(await listDocuments(user));
    const cnh = before.cnh;

    const withoutReason = await verifyDocument(admin, cnh.id, { status: 'rejected' });
    expect(withoutReason.status).toBe(400);
    expect(await db('partner_documents').where('id', cnh.id).first()).toMatchObject({
      status: 'pending',
    });

    const rejected = await verifyDocument(admin, cnh.id, {
      status: 'rejected',
      rejection_reason: 'CNH ilegível',
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.document).toMatchObject({
      id: cnh.id,
      status: 'rejected',
      rejection_reason: 'CNH ilegível',
    });

    const partnerAfterRejection = await db('partners').where('user_id', user.id).first();
    expect(partnerAfterRejection.approval_status).toBe('rejected');
    expect(partnerAfterRejection.rejection_reason).toBe('CNH ilegível');

    const statusAfterRejection = await getStatus(user);
    expect(statusAfterRejection.body.data.onboardingStage).toBe('documents_pending');
    expect(statusAfterRejection.body.data.canAccessDashboard).toBe(false);
    expect(statusAfterRejection.body.data.rejectionReason).toBe('CNH ilegível');
    expect(statusAfterRejection.body.data.pendingDocuments).toContain('cnh');
    expect(statusAfterRejection.body.data.missingDocuments).toEqual([]);

    const detail = await request(app)
      .get(`/api/partners/${partnerAfterRejection.id}/documents/status`)
      .set(harness.authorize(user));
    expect(detail.status).toBe(200);
    expect(detail.body.data.documents.cnh).toEqual({
      required: true,
      uploaded: true,
      status: 'rejected',
      approved: false,
    });
    expect(detail.body.data.allUploaded).toBe(true);
    expect(detail.body.data.allVerified).toBe(false);

    // Reenvio: substitui o documento rejeitado e volta para análise com 4 tipos únicos.
    const resubmission = await uploadDocument(user, 'cnh', { filename: 'cnh-corrigida.jpg' });
    expect(resubmission.status).toBe(201);
    expect(resubmission.body.data.status).toBe('pending');

    const afterResubmission = await listDocuments(user);
    expect(afterResubmission).toHaveLength(4);
    expect(afterResubmission.filter((document) => document.document_type === 'cnh')).toHaveLength(1);
    expect(documentsByType(afterResubmission).cnh.status).toBe('pending');

    const resubmitResponse = await request(app)
      .post(DOCUMENTS_SUBMIT)
      .set(harness.authorize(user));
    expect(resubmitResponse.status).toBe(200);
    expect(resubmitResponse.body.data.onboardingStage).toBe('under_review');
    expect(resubmitResponse.body.data.approvalStatus).toBe('pending');

    const partnerAfterResubmit = await db('partners').where('user_id', user.id).first();
    expect(partnerAfterResubmit.approval_status).toBe('pending');
    expect(partnerAfterResubmit.rejection_reason).toBeNull();

    // Aprovação final depois do reenvio.
    const current = documentsByType(await listDocuments(user));
    for (const documentType of REQUIRED_TOW_DOCUMENTS) {
      const response = await verifyDocument(admin, current[documentType].id, { status: 'approved' });
      expect(response.status).toBe(200);
    }

    const finalStatus = await getStatus(user);
    expect(finalStatus.body.data).toEqual(
      expect.objectContaining({
        onboardingStage: 'approved',
        approvalStatus: 'approved',
        canAccessDashboard: true,
      }),
    );
  });

  test('parceiro não enxerga documentos de outro parceiro na listagem atual', async () => {
    const owner = await seedTowUser();
    const other = await seedTowUser();
    await completeOnboarding(owner, { company_name: 'Dono' });
    await completeOnboarding(other, { company_name: 'Outro' });
    await uploadAllRequired(owner);
    await uploadDocument(other, 'rg_cpf');

    const ownerDocuments = await listDocuments(owner);
    const otherDocuments = await listDocuments(other);

    expect(ownerDocuments).toHaveLength(4);
    expect(otherDocuments).toHaveLength(1);
    expect(new Set(ownerDocuments.map((document) => document.partner_id)).size).toBe(1);
    expect(new Set(otherDocuments.map((document) => document.partner_id)).size).toBe(1);
    expect(ownerDocuments[0].partner_id).not.toBe(otherDocuments[0].partner_id);
  });
});
