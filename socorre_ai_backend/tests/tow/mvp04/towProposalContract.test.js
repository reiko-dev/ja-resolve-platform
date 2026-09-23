/**
 * MVP-04 — LIVE contract validation of the five proposal operations.
 *
 * Why this suite exists: `tests/contract/consumerSmoke.test.js` validates the
 * canonical contract against GENERATED fixtures, and the generator emits empty
 * arrays / minimal objects, so the `TowProposal` ITEM schema and the
 * `TowProposalResponse` envelope were never exercised by a real response. This
 * suite drives the REAL app harness through the REAL HTTP routes and validates
 * the ACTUAL wire bodies against the canonical composed schemas, using the same
 * Ajv build as the contract suite (`tests/helpers/towContract.js`).
 *
 * It also proves the CONTRACT_CONFLICT-2 revision is real: the new
 * `proposal_already_active` code is in the enum the runtime emits and in
 * `CANONICAL_ERROR_CODES`. The version pin tracks the current canonical revision
 * (re-declared in draft.8, the MVP-05 operation-level pass; the MVP-04
 * declarations were introduced in draft.7).
 *
 * Hermetic and offline: SQLite test harness, fake clock, fake route provider.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const request = require('supertest');
const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const {
  createMvp04Services,
  createProposalScenario,
  authFor,
  authsForPartners,
} = require('../../helpers/tow/mvp04');
const {
  loadRawDocuments,
  composeDocument,
  buildAjv,
  schemaUri,
  CANONICAL_ENUMS,
  CANONICAL_ERROR_CODES,
} = require('../../helpers/towContract');

const REQUESTS = '/api/tow/requests';
const PARTNER_PROPOSALS = '/api/tow/partner/proposals';

const PROPOSAL_SCHEMA = schemaUri('#/components/schemas/TowProposal');
const PROPOSAL_RESPONSE_SCHEMA = schemaUri('#/components/schemas/TowProposalResponse');
const PROPOSAL_LIST_SCHEMA = schemaUri('#/components/schemas/TowProposalListResponse');
const REQUEST_RESPONSE_SCHEMA = schemaUri('#/components/schemas/TowRequestResponse');
const ERROR_RESPONSE_SCHEMA = schemaUri('#/components/schemas/ErrorResponse');

describe('MVP-04 — live proposal lifecycle conforms to the canonical OpenAPI contract', () => {
  const documents = loadRawDocuments();
  const { composed } = composeDocument(documents);
  const ajv = buildAjv(composed);

  const validateProposal = ajv.getSchema(PROPOSAL_SCHEMA);
  const validateProposalResponse = ajv.getSchema(PROPOSAL_RESPONSE_SCHEMA);
  const validateProposalList = ajv.getSchema(PROPOSAL_LIST_SCHEMA);
  const validateRequestResponse = ajv.getSchema(REQUEST_RESPONSE_SCHEMA);
  const validateError = ajv.getSchema(ERROR_RESPONSE_SCHEMA);

  let app;
  let services;
  let clock;
  let routeProvider;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock();
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
    ({ services } = createMvp04Services({ clock, routeProvider }));
  });

  afterAll(async () => {
    await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
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
    const created = await createProposalScenario({ services, clock, ...options });
    return { ...created, auths: authsForPartners(created.partners) };
  }

  async function propose(auth, requestId, key) {
    const response = await request(app)
      .post(`${REQUESTS}/${requestId}/proposals`)
      .set('Idempotency-Key', key)
      .set(auth.headers)
      .send({});
    return response;
  }

  test('the canonical validators are compiled from the composed contract (not vacuously absent)', () => {
    expect(typeof validateProposal).toBe('function');
    expect(typeof validateProposalResponse).toBe('function');
    expect(typeof validateProposalList).toBe('function');
    expect(typeof validateRequestResponse).toBe('function');
    expect(typeof validateError).toBe('function');
    expect(composed.info.version).toBe('1.0.0-draft.13');
  });

  test('the ACTUAL 201 create body validates against TowProposalResponse', async () => {
    const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
    const response = await propose(auths[0], towRequest.id, 'idem-mvp04-ct-000001');

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(validateProposalResponse(response.body)).toBe(true);
    expect(validateProposalResponse.errors).toBeNull();
    expect(validateProposal(response.body.data)).toBe(true);
    expect(validateProposal.errors).toBeNull();
  });

  test('the live proposal carries exactly the contract members (no invented, no missing)', async () => {
    const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
    const response = await propose(auths[0], towRequest.id, 'idem-mvp04-ct-000002');
    const proposal = response.body.data;

    // `counteroffer` and `partner` are OPTIONAL; MVP-04 emits `counteroffer:null`
    // and a truthful `partner.display_name`.
    expect(Object.keys(proposal).sort()).toEqual([
      'counteroffer', 'created_at', 'expires_at', 'id', 'partner', 'partner_id',
      'price', 'request_id', 'route_quote', 'status', 'tow_vehicle',
    ]);
    for (const forbidden of [
      'idempotency_key', 'idempotency_fingerprint', 'tow_request_id', 'tow_vehicle_id',
      'price_amount_cents', 'route_total_distance_meters', 'pricing_included_meters',
      'decided_at', 'vehicle_plate', 'vehicle_active', 'pricing',
    ]) {
      expect(proposal).not.toHaveProperty(forbidden);
    }
    // The tariff is frozen in the database but never published.
    expect(proposal.tow_vehicle.pricing).toBeUndefined();
  });

  test('the ACTUAL 200 customer list validates against TowProposalListResponse', async () => {
    const { request: towRequest, auths, customer } = await scenario({ partnerCount: 2 });
    const customerAuth = authFor({ user: customer });
    await propose(auths[0], towRequest.id, 'idem-mvp04-ct-000003');
    await propose(auths[1], towRequest.id, 'idem-mvp04-ct-000004');

    const response = await request(app)
      .get(`${REQUESTS}/${towRequest.id}/proposals`)
      .set(customerAuth.headers);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(2);
    expect(validateProposalList(response.body)).toBe(true);
    expect(validateProposalList.errors).toBeNull();
    for (const item of response.body.data.items) {
      expect(validateProposal(item)).toBe(true);
    }
  });

  test('the ACTUAL 200 partner list validates against TowProposalListResponse', async () => {
    const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
    await propose(auths[0], towRequest.id, 'idem-mvp04-ct-000005');

    const response = await request(app).get(PARTNER_PROPOSALS).set(auths[0].headers);
    expect(response.status).toBe(200);
    expect(validateProposalList(response.body)).toBe(true);
    expect(validateProposalList.errors).toBeNull();
  });

  test('the ACTUAL 200 withdraw body validates against TowProposalResponse', async () => {
    const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
    const created = await propose(auths[0], towRequest.id, 'idem-mvp04-ct-000006');

    const response = await request(app)
      .post(`/api/tow/proposals/${created.body.data.id}/withdraw`)
      .set('Idempotency-Key', 'idem-mvp04-ct-000007')
      .set(auths[0].headers);

    expect(response.status).toBe(200);
    expect(validateProposalResponse(response.body)).toBe(true);
    expect(response.body.data.status).toBe('WITHDRAWN');
  });

  test('the ACTUAL 200 accept body validates against TowRequestResponse with a real Assignment', async () => {
    const { request: towRequest, auths, customer } = await scenario({ partnerCount: 2 });
    const customerAuth = authFor({ user: customer });
    const winner = await propose(auths[0], towRequest.id, 'idem-mvp04-ct-000008');
    await propose(auths[1], towRequest.id, 'idem-mvp04-ct-000009');

    const response = await request(app)
      .post(`/api/tow/proposals/${winner.body.data.id}/accept`)
      .set('Idempotency-Key', 'idem-mvp04-ct-000010')
      .set(customerAuth.headers)
      .send({});

    expect(response.status).toBe(200);
    expect(validateRequestResponse(response.body)).toBe(true);
    expect(validateRequestResponse.errors).toBeNull();
    expect(response.body.data.state).toBe('ASSIGNED');
    expect(response.body.data.assignment).not.toBeNull();
    // The frozen `Assignment` carries no tariff and no persistence column.
    expect(Object.keys(response.body.data.assignment).sort())
      .toEqual(['assigned_at', 'final_price', 'partner_id', 'tow_vehicle_id']);
  });

  test('the ACTUAL error bodies validate against ErrorResponse', async () => {
    const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
    await propose(auths[0], towRequest.id, 'idem-mvp04-ct-000011');

    const duplicate = await propose(auths[0], towRequest.id, 'idem-mvp04-ct-000012');
    expect(duplicate.status).toBe(409);
    expect(validateError(duplicate.body)).toBe(true);
    expect(validateError.errors).toBeNull();
    expect(duplicate.body.error.code).toBe('proposal_already_active');

    const missing = await request(app)
      .post(`${REQUESTS}/999999/proposals`)
      .set('Idempotency-Key', 'idem-mvp04-ct-000013')
      .set(auths[0].headers)
      .send({});
    expect(missing.status).toBe(404);
    expect(validateError(missing.body)).toBe(true);
  });

  test('proposal_already_active is part of the canonical error vocabulary (draft.6, still frozen in draft.8)', () => {
    expect(CANONICAL_ERROR_CODES).toContain('proposal_already_active');
    const enumValues = documents.canonical.components.schemas.ErrorResponse
      .properties.error.properties.code.enum;
    expect(enumValues).toContain('proposal_already_active');
    // The base document stays the frozen composition source for MVP-04 operations.
    const baseCodes = documents.base.components.schemas.ErrorResponse
      .properties.error.properties.code.enum;
    expect(baseCodes).toContain('proposal_already_active');
  });

  test('the contract validator rejects a live proposal missing a required member (in-suite negative control)', async () => {
    const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
    const response = await propose(auths[0], towRequest.id, 'idem-mvp04-ct-000014');
    const mutated = JSON.parse(JSON.stringify(response.body));
    delete mutated.data.route_quote;

    expect(validateProposalResponse(mutated)).toBe(false);
    expect(validateProposalResponse.errors.map((error) => error.message))
      .toContain("must have required property 'route_quote'");
  });

  test('the contract validator rejects a client-priced proposal (in-suite negative control)', async () => {
    const { request: towRequest, auths } = await scenario({ partnerCount: 1 });
    const response = await propose(auths[0], towRequest.id, 'idem-mvp04-ct-000015');
    const mutated = JSON.parse(JSON.stringify(response.body));
    mutated.data.price = { amount_cents: '18480', currency: 'BRL' };

    expect(validateProposal(mutated.data)).toBe(false);
  });

  test('base and canonical proposal schemas do not diverge silently', () => {
    const canonicalProposal = documents.canonical.components.schemas.TowProposal;
    const baseProposal = documents.base.components.schemas.TowProposal;
    const baseItem = documents.base.components.schemas.TowProposalListResponse
      .properties.data.properties.items.items;

    expect(baseItem.$ref).toBe('#/components/schemas/TowProposal');
    // The canonical entrypoint re-declares the proposal item so the MVP-04
    // operations are self-describing. It must not diverge from the frozen
    // composition source: same required set, same referenced members.
    expect(canonicalProposal.required).toEqual(baseProposal.required);
    expect(canonicalProposal.required).toEqual([
      'id', 'request_id', 'partner_id', 'tow_vehicle', 'route_quote', 'price',
      'status', 'expires_at', 'created_at',
    ]);
    // `$ref` targets are compared by fragment: the canonical points at the base
    // file for members it does not own, and both forms name the same schema.
    const refTarget = (ref) => `#${String(ref).split('#')[1]}`;
    for (const member of ['tow_vehicle', 'route_quote', 'price', 'status']) {
      expect(refTarget(canonicalProposal.properties[member].$ref))
        .toBe(refTarget(baseProposal.properties[member].$ref));
    }
    expect(refTarget(canonicalProposal.properties.tow_vehicle.$ref))
      .toBe('#/components/schemas/TowVehicleSummary');
    expect(refTarget(canonicalProposal.properties.route_quote.$ref))
      .toBe('#/components/schemas/RouteQuote');
    expect(refTarget(canonicalProposal.properties.price.$ref))
      .toBe('#/components/schemas/Money');
    expect(refTarget(canonicalProposal.properties.status.$ref))
      .toBe('#/components/schemas/TowProposalStatus');
    // The proposal status vocabulary is declared by the canonical entrypoint
    // and still matches the frozen enum — including COUNTERED, which MVP-04
    // declares but never emits.
    expect(documents.canonical.components.schemas.TowProposalStatus.enum)
      .toEqual(CANONICAL_ENUMS.TowProposalStatus);
    // `counteroffer` is declared but MUST stay unused in MVP-04.
    expect(canonicalProposal.required).not.toContain('counteroffer');
    expect(baseProposal.required).not.toContain('counteroffer');
  });

  test('the create operation body stays empty by contract (additionalProperties: false)', () => {
    const create = documents.canonical.paths['/tow/requests/{requestId}/proposals'].post;
    const schema = create.requestBody.content['application/json'].schema;
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties).toBeUndefined();
    // Parameters are `$ref`s in the canonical entrypoint, so the name comes
    // from the referenced component when the item is not inlined.
    const parameterNames = create.parameters.map(
      (parameter) => parameter.name || String(parameter.$ref).split('/').pop()
    );
    expect(parameterNames).toEqual(expect.arrayContaining(['RequestId', 'IdempotencyKey']));
  });
});
