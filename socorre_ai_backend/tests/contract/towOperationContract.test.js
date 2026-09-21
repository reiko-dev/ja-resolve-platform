/**
 * MVP-04 EXT (EXT-MVP04-3) — OPERATION-LEVEL contract coverage.
 *
 * Why this suite exists: the Ajv suite (`tests/contract/consumerSmoke.test.js`)
 * validates response BODIES against the composed schemas, so an operation could
 * declare a required header it does not enforce, or omit a status it really
 * returns, and every test would stay green. This suite pins the OPERATION: the
 * composed document's requirements are read through `tests/helpers/towContract.js`
 * (no hand-copied YAML) and then checked against the REAL app harness over the
 * REAL HTTP routes.
 *
 * The two directions are both asserted:
 *   - contract -> runtime: every declared requirement is enforced (the required
 *     `Idempotency-Key` header on create/accept/withdraw, the partner jobs query
 *     subset, the `from`/`to` semantics);
 *   - runtime -> contract: every status the backend really produces is declared
 *     for that operation (an observed status missing from `responses` fails), and
 *     every error body the Tow error mapper produces validates against
 *     `ErrorResponse`.
 *
 * Hermetic and offline: SQLite test harness, fake clock, fake route provider.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../src/config/database', () => require('../helpers/testDb').db);

const request = require('supertest');
const testDb = require('../helpers/testDb');
const { createApp } = require('../../src/app');
const { createFakeClock } = require('../helpers/tow/clock');
const { createFakeRouteProvider } = require('../helpers/tow/gateways/mapsGateway');
const {
  createMvp04Services,
  createProposalScenario,
  authFor,
  authsForPartners,
} = require('../helpers/tow/mvp04');
const {
  loadRawDocuments,
  composeDocument,
  buildAjv,
  schemaUri,
  findOperation,
  getByPointer,
} = require('../helpers/towContract');

const documents = loadRawDocuments();
const { composed, canonical } = composeDocument(documents);
const ajv = buildAjv(composed);

const validateListResponse = ajv.getSchema(schemaUri('#/components/schemas/TowRequestListResponse'));
const validateRequestResponse = ajv.getSchema(schemaUri('#/components/schemas/TowRequestResponse'));
const validateProposalResponse = ajv.getSchema(schemaUri('#/components/schemas/TowProposalResponse'));
const validateError = ajv.getSchema(schemaUri('#/components/schemas/ErrorResponse'));

/** The MVP-04 operations this correction pass owns, with their canonical path. */
const OPERATIONS = Object.freeze({
  listTowRequestProposals: { method: 'get', path: '/tow/requests/{requestId}/proposals' },
  createTowProposal: { method: 'post', path: '/tow/requests/{requestId}/proposals' },
  listPartnerTowProposals: { method: 'get', path: '/tow/partner/proposals' },
  acceptTowProposal: { method: 'post', path: '/tow/proposals/{proposalId}/accept' },
  withdrawTowProposal: { method: 'post', path: '/tow/proposals/{proposalId}/withdraw' },
  listPartnerTowJobs: { method: 'get', path: '/tow/partner/jobs' },
});

/** The truthful status surface the backend really produces, per operation. */
const DECLARED_STATUSES = Object.freeze({
  listTowRequestProposals: [200, 401, 403, 404, 422],
  createTowProposal: [201, 401, 403, 404, 409, 422],
  listPartnerTowProposals: [200, 401, 403, 422],
  acceptTowProposal: [200, 401, 403, 404, 409, 422],
  withdrawTowProposal: [200, 401, 403, 404, 409, 422],
  listPartnerTowJobs: [200, 401, 403, 422],
});

/** Operations that REQUIRE the canonical `Idempotency-Key` header. */
const KEYED_OPERATIONS = ['createTowProposal', 'acceptTowProposal', 'withdrawTowProposal'];

function find(operationId) {
  const found = findOperation(composed, operationId);
  expect(found).not.toBeNull();
  return found;
}

/** Parameters of an operation, with `$ref`s resolved against the composed doc. */
function parametersOf(operationId) {
  const { operation } = find(operationId);
  return (operation.parameters || []).map((parameter) => {
    if (!parameter || typeof parameter.$ref !== 'string') return parameter;
    const pointer = parameter.$ref.replace(/^#/, '');
    const { found, value } = getByPointer(composed, pointer);
    expect(found).toBe(true);
    return value;
  });
}

function parameter(operationId, name, location) {
  return parametersOf(operationId).find((entry) => entry.name === name && entry.in === location);
}

function declaredStatuses(operationId) {
  return Object.keys(find(operationId).operation.responses).map(Number).sort((a, b) => a - b);
}

describe('MVP-04 EXT — operation-level OpenAPI contract == runtime (EXT-MVP04-3)', () => {
  let app;
  let services;
  let clock;
  let routeProvider;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock();
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider } });
    ({ services } = createMvp04Services({ clock, routeProvider }));
  });

  afterAll(async () => {
    await testDb.reset();
  });

  beforeEach(async () => {
    await testDb.db('tow_assignments').del();
    await testDb.db('tow_request_proposals').del();
    await testDb.db('tow_requests').del();
    await testDb.db('tow_vehicle_documents').del();
    await testDb.db('tow_vehicles').del();
    await testDb.db('partners').del();
    await testDb.db('users').where({ role: 'partner' }).del();
    await testDb.db('service_modules').where({ module_key: 'tow' }).del();
    routeProvider.reset();
    clock.reset();
  });

  async function scenario(options = {}) {
    const created = await createProposalScenario({ services, clock, partnerCount: 2, ...options });
    return {
      ...created,
      auths: authsForPartners(created.partners),
      customerAuth: authFor({ user: created.customer }),
    };
  }

  async function propose(auth, requestId, key) {
    const response = await request(app)
      .post(`/api/tow/requests/${requestId}/proposals`)
      .set('Idempotency-Key', key)
      .set(auth.headers)
      .send({});
    return response;
  }

  async function assignedFixture() {
    const created = await scenario({ partnerCount: 2 });
    const customerAuth = authFor({ user: created.customer });
    const created201 = await propose(created.auths[0], created.request.id, 'idem-mvp04-oc-prop-0001');
    expect(created201.status).toBe(201);
    const accepted = await request(app)
      .post(`/api/tow/proposals/${created201.body.data.id}/accept`)
      .set('Idempotency-Key', 'idem-mvp04-oc-accept-0001')
      .set(customerAuth.headers)
      .send({});
    expect(accepted.status).toBe(200);
    return { ...created, customerAuth, proposal: created201.body.data };
  }

  /**
   * Runtime -> contract: record the status and refuse it if the operation does
   * not declare it. Error statuses produced by the Tow error mapper must also be
   * `ErrorResponse`-shaped; 401 comes from the transport auth middleware, whose
   * envelope predates the Tow error vocabulary.
   */
  function expectDeclared(operationId, response) {
    const status = response.status;
    expect(declaredStatuses(operationId)).toContain(status);
    if (status === 401) {
      expect(response.body.success).toBe(false);
      expect(typeof response.body.message).toBe('string');
    } else if (status >= 400) {
      expect(validateError(response.body)).toBe(true);
      expect(validateError.errors).toBeNull();
    }
    return response;
  }

  describe('contract -> runtime: declared requirements are real', () => {
    test('the six MVP-04 operations are declared at the canonical paths and methods', () => {
      for (const [operationId, expected] of Object.entries(OPERATIONS)) {
        const { method, path } = find(operationId);
        expect({ operationId, method, path }).toEqual({ operationId, ...expected });
      }
    });

    test('the declared status surface of every MVP-04 operation is the frozen truthful one', () => {
      for (const [operationId, expected] of Object.entries(DECLARED_STATUSES)) {
        expect({ operationId, statuses: declaredStatuses(operationId) }).toEqual({ operationId, statuses: expected });
      }
    });

    test('create, accept and withdraw declare the canonical required Idempotency-Key header', () => {
      for (const operationId of KEYED_OPERATIONS) {
        const header = parameter(operationId, 'Idempotency-Key', 'header');
        expect({ operationId, header }).toEqual({
          operationId,
          header: {
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: { type: 'string', minLength: 8, maxLength: 128 },
          },
        });
      }
    });

    test('accept and withdraw declare the 422 that the enforced header produces', () => {
      for (const operationId of ['acceptTowProposal', 'withdrawTowProposal']) {
        expect(declaredStatuses(operationId)).toContain(422);
      }
      // ... and the declared 422 is the canonical validation error envelope.
      const validationError = find('acceptTowProposal').operation.responses['422'];
      const pointer = validationError.$ref.replace(/^#/, '');
      const { found, value } = getByPointer(composed, pointer);
      expect(found).toBe(true);
      expect(value.content['application/json'].schema.$ref)
        .toBe('#/components/schemas/ErrorResponse');
    });

    test('partner jobs declares exactly the query subset validateListQuery implements', () => {
      const query = parametersOf('listPartnerTowJobs')
        .filter((entry) => entry.in === 'query')
        .map((entry) => entry.name)
        .sort();
      expect(query).toEqual(['from', 'limit', 'page', 'state', 'to']);
      // Pagination and window filters are optional; the server owns the defaults.
      for (const entry of parametersOf('listPartnerTowJobs')) {
        expect(entry.required).toBeUndefined();
      }
    });

    test('partner jobs documents from/to as INCLUSIVE bounds on assignment.assigned_at', () => {
      const { operation } = find('listPartnerTowJobs');
      expect(operation.description).toContain('INCLUSIVE');
      expect(operation.description).toContain('assigned_at');
      // The window parameters are instants, not opaque strings.
      expect(parameter('listPartnerTowJobs', 'from', 'query').schema.format).toBe('date-time');
      expect(parameter('listPartnerTowJobs', 'to', 'query').schema.format).toBe('date-time');
    });

    test('the canonical revision is draft.7 and records the EXT-MVP04 corrections', () => {
      expect(composed.info.version).toBe('1.0.0-draft.7');
      expect(canonical.info.version).toBe('1.0.0-draft.7');
      expect(canonical.info.description).toContain('draft.7');
      expect(canonical.info.description).toContain('EXT-MVP04-1/2/3');
    });

    test('the base contract was not rewritten by this revision', () => {
      // The corrections live in the canonical entrypoint only: the frozen base
      // keeps its own IdempotencyKey definition untouched.
      const baseKey = documents.base.components.parameters.IdempotencyKey;
      expect(baseKey).toEqual({
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        schema: { type: 'string', minLength: 8, maxLength: 128 },
      });
      expect(documents.base.paths['/tow/partner/jobs']).toBeUndefined();
    });
  });

  describe('runtime -> contract: the real HTTP surface', () => {
    test('createTowProposal: 422 without the header, 201 with it', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });

      const missing = await request(app)
        .post(`/api/tow/requests/${towRequest.id}/proposals`)
        .set(auths[0].headers)
        .send({});
      expectDeclared('createTowProposal', missing);
      expect(missing.status).toBe(422);
      expect(missing.body.error.details.field).toBe('Idempotency-Key');

      const created = await propose(auths[0], towRequest.id, 'idem-mvp04-oc-create-0001');
      expectDeclared('createTowProposal', created);
      expect(created.status).toBe(201);
      expect(validateProposalResponse(created.body)).toBe(true);
    });

    test('acceptTowProposal: 422 without the header, 200 with it', async () => {
      const { request: towRequest, auths, customerAuth } = await scenario({ partnerCount: 1 });
      const created = await propose(auths[0], towRequest.id, 'idem-mvp04-oc-accept-0002');
      expect(created.status).toBe(201);
      const proposalId = created.body.data.id;

      const missing = await request(app)
        .post(`/api/tow/proposals/${proposalId}/accept`)
        .set(customerAuth.headers)
        .send({});
      expectDeclared('acceptTowProposal', missing);
      expect(missing.status).toBe(422);

      const accepted = await request(app)
        .post(`/api/tow/proposals/${proposalId}/accept`)
        .set('Idempotency-Key', 'idem-mvp04-oc-accept-0003')
        .set(customerAuth.headers)
        .send({});
      expectDeclared('acceptTowProposal', accepted);
      expect(accepted.status).toBe(200);
      expect(validateRequestResponse(accepted.body)).toBe(true);
    });

    test('withdrawTowProposal: 422 without the header, 200 with it', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      const created = await propose(auths[0], towRequest.id, 'idem-mvp04-oc-withdraw-0001');
      expect(created.status).toBe(201);
      const proposalId = created.body.data.id;

      const missing = await request(app)
        .post(`/api/tow/proposals/${proposalId}/withdraw`)
        .set(auths[0].headers)
        .send({});
      expectDeclared('withdrawTowProposal', missing);
      expect(missing.status).toBe(422);

      const withdrawn = await request(app)
        .post(`/api/tow/proposals/${proposalId}/withdraw`)
        .set('Idempotency-Key', 'idem-mvp04-oc-withdraw-0002')
        .set(auths[0].headers)
        .send({});
      expectDeclared('withdrawTowProposal', withdrawn);
      expect(withdrawn.status).toBe(200);
      expect(validateProposalResponse(withdrawn.body)).toBe(true);
    });

    test('the declared 409 of withdraw is the real domain conflict', async () => {
      const { request: towRequest, auths, customerAuth } = await scenario({ partnerCount: 1 });
      const created = await propose(auths[0], towRequest.id, 'idem-mvp04-oc-conflict-0001');
      const proposalId = created.body.data.id;
      await request(app)
        .post(`/api/tow/proposals/${proposalId}/accept`)
        .set('Idempotency-Key', 'idem-mvp04-oc-conflict-0002')
        .set(customerAuth.headers)
        .send({});

      const conflict = await request(app)
        .post(`/api/tow/proposals/${proposalId}/withdraw`)
        .set('Idempotency-Key', 'idem-mvp04-oc-conflict-0003')
        .set(auths[0].headers)
        .send({});
      expectDeclared('withdrawTowProposal', conflict);
      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe('proposal_not_actionable');
    });

    test('the declared 403 of withdraw is the real foreign-partner refusal', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 2 });
      const created = await propose(auths[0], towRequest.id, 'idem-mvp04-oc-foreign-0001');

      const forbidden = await request(app)
        .post(`/api/tow/proposals/${created.body.data.id}/withdraw`)
        .set('Idempotency-Key', 'idem-mvp04-oc-foreign-0002')
        .set(auths[1].headers)
        .send({});
      expectDeclared('withdrawTowProposal', forbidden);
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.error.code).toBe('forbidden');
    });

    test('the declared 404 of accept is the real unknown proposal', async () => {
      const { customerAuth } = await scenario({ partnerCount: 1 });
      const notFound = await request(app)
        .post('/api/tow/proposals/999999/accept')
        .set('Idempotency-Key', 'idem-mvp04-oc-notfound-0001')
        .set(customerAuth.headers)
        .send({});
      expectDeclared('acceptTowProposal', notFound);
      expect(notFound.status).toBe(404);
      expect(notFound.body.error.code).toBe('not_found');
    });

    test('listPartnerTowJobs: 401 anonymous, 403 customer, 200 partner, 422 bad query', async () => {
      const { auths, customerAuth } = await assignedFixture();

      const anonymous = await request(app).get('/api/tow/partner/jobs');
      expectDeclared('listPartnerTowJobs', anonymous);
      expect(anonymous.status).toBe(401);

      const customer = await request(app).get('/api/tow/partner/jobs').set(customerAuth.headers);
      expectDeclared('listPartnerTowJobs', customer);
      expect(customer.status).toBe(403);

      const badQuery = await request(app)
        .get('/api/tow/partner/jobs')
        .query({ limit: 101 })
        .set(auths[0].headers);
      expectDeclared('listPartnerTowJobs', badQuery);
      expect(badQuery.status).toBe(422);
      expect(badQuery.body.error.code).toBe('validation_error');

      const jobs = await request(app).get('/api/tow/partner/jobs').set(auths[0].headers);
      expectDeclared('listPartnerTowJobs', jobs);
      expect(jobs.status).toBe(200);
      expect(validateListResponse(jobs.body)).toBe(true);
      expect(jobs.body.data.items).toHaveLength(1);
      expect(jobs.body.data.items[0].assignment).not.toBeNull();
    });

    test('the declared 200 of the proposal lists is the real partner/customer view', async () => {
      const { request: towRequest, auths, customerAuth } = await scenario({ partnerCount: 2 });
      const created = await propose(auths[0], towRequest.id, 'idem-mvp04-oc-list-0001');
      expect(created.status).toBe(201);

      const partnerList = await request(app)
        .get('/api/tow/partner/proposals')
        .set(auths[0].headers);
      expectDeclared('listPartnerTowProposals', partnerList);
      expect(partnerList.status).toBe(200);

      const customerList = await request(app)
        .get(`/api/tow/requests/${towRequest.id}/proposals`)
        .set(customerAuth.headers);
      expectDeclared('listTowRequestProposals', customerList);
      expect(customerList.status).toBe(200);
      expect(customerList.body.data.items).toHaveLength(1);

      const badQuery = await request(app)
        .get(`/api/tow/requests/${towRequest.id}/proposals`)
        .query({ page: 0 })
        .set(customerAuth.headers);
      expectDeclared('listTowRequestProposals', badQuery);
      expect(badQuery.status).toBe(422);
    });

    test('every MVP-04 operation declares a 401 for the anonymous caller', async () => {
      const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
      const created = await propose(auths[0], towRequest.id, 'idem-mvp04-oc-anon-0001');
      const proposalId = created.body.data.id;

      const calls = [
        ['listTowRequestProposals', () => request(app).get(`/api/tow/requests/${towRequest.id}/proposals`)],
        ['createTowProposal', () => request(app).post(`/api/tow/requests/${towRequest.id}/proposals`).set('Idempotency-Key', 'idem-mvp04-oc-anon-0002').send({})],
        ['listPartnerTowProposals', () => request(app).get('/api/tow/partner/proposals')],
        ['acceptTowProposal', () => request(app).post(`/api/tow/proposals/${proposalId}/accept`).set('Idempotency-Key', 'idem-mvp04-oc-anon-0003').send({})],
        ['withdrawTowProposal', () => request(app).post(`/api/tow/proposals/${proposalId}/withdraw`).set('Idempotency-Key', 'idem-mvp04-oc-anon-0004').send({})],
        ['listPartnerTowJobs', () => request(app).get('/api/tow/partner/jobs')],
      ];

      for (const [operationId, call] of calls) {
        // eslint-disable-next-line no-await-in-loop
        const response = await call();
        expectDeclared(operationId, response);
        expect(response.status).toBe(401);
      }
    });
  });
});
