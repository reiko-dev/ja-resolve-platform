/**
 * MVP-04 — a TowVehicle that a proposal or an assignment references is not
 * erasable.
 *
 * `tow_request_proposals.tow_vehicle_id` and `tow_assignments.tow_vehicle_id`
 * are `ON DELETE RESTRICT`. The vehicle is part of a price the customer already
 * saw and of the job that was actually assigned, so it may be deactivated but
 * never erased. Without this guard the constraint reaches the client as a 500
 * `internal_error`, although the frozen contract declares `409 DomainConflict`
 * for `deleteTowVehicle` ("deleted or deactivated according to policy").
 *
 * RED-first: written before the guard exists.
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
  createProposal,
  authFor,
  authsForPartners,
} = require('../../helpers/tow/mvp04');
const {
  loadRawDocuments,
  composeDocument,
  buildAjv,
  schemaUri,
} = require('../../helpers/towContract');

const REQUESTS = '/api/tow/requests';
const ERROR_RESPONSE_SCHEMA = schemaUri('#/components/schemas/ErrorResponse');

describe('MVP-04 — a referenced TowVehicle is not erasable', () => {
  const documents = loadRawDocuments();
  const { composed } = composeDocument(documents);
  const validateError = buildAjv(composed).getSchema(ERROR_RESPONSE_SCHEMA);

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
    const created = await createProposalScenario({ services, clock, ...options });
    return { ...created, auths: authsForPartners(created.partners) };
  }

  async function propose(auth, requestId, options = {}) {
    const response = await request(app)
      .post(`${REQUESTS}/${requestId}/proposals`)
      .set('Idempotency-Key', options.key || 'idem-mvp04-veh-000001')
      .set(auth.headers)
      .send({});
    expect(response.status).toBe(201);
    return response.body.data;
  }

  function removeVehicle(auth, vehicleId) {
    return request(app).delete(`/api/tow/vehicles/${vehicleId}`).set(auth.headers);
  }

  async function expectPinned(auth, vehicleId) {
    const response = await removeVehicle(auth, vehicleId);
    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('conflict');
    expect(validateError(response.body)).toBe(true);
    expect(validateError.errors).toBeNull();
    // RESTRICT, not CASCADE: the row is still there and still readable.
    const row = await testDb.db('tow_vehicles').where({ id: vehicleId }).first();
    expect(row).toBeDefined();
    return response;
  }

  test('an ACTIVE proposal pins the vehicle', async () => {
    const { request: towRequest, partners, auths } = await scenario({ partnerCount: 1 });
    await propose(auths[0], towRequest.id);

    await expectPinned(auths[0], partners[0].vehicle.id);
  });

  test('a live assignment pins the vehicle', async () => {
    const { request: towRequest, partners, auths, customer } = await scenario({ partnerCount: 1 });
    const created = await propose(auths[0], towRequest.id);
    const customerAuth = authFor({ user: customer });

    const accepted = await request(app)
      .post(`/api/tow/proposals/${created.id}/accept`)
      .set('Idempotency-Key', 'idem-mvp04-veh-acc-0001')
      .set(customerAuth.headers)
      .send({});
    expect(accepted.status).toBe(200);

    await expectPinned(auths[0], partners[0].vehicle.id);
  });

  test('a WITHDRAWN proposal is history, and history is not erasable either', async () => {
    const { request: towRequest, partners, auths } = await scenario({ partnerCount: 1 });
    const created = await propose(auths[0], towRequest.id);
    await services.proposalService.withdraw({
      partnerId: partners[0].partner.id,
      proposalId: created.id,
      // EXT-MVP04-2: the canonical Idempotency-Key header is required on
      // withdraw; the direct application call supplies it explicitly.
      idempotencyKey: 'idem-mvp04-veh-wdr-0001',
    });
    const row = await testDb.db('tow_request_proposals').where({ id: created.id }).first();
    expect(row.status).toBe('WITHDRAWN');

    // The FK is RESTRICT, not "RESTRICT while ACTIVE": a proposal that lost its
    // status is still the record of a price the customer saw.
    await expectPinned(auths[0], partners[0].vehicle.id);
  });

  test('a vehicle nobody referenced is still deletable', async () => {
    const { partners, auths } = await scenario({ partnerCount: 1 });

    const response = await removeVehicle(auths[0], partners[0].vehicle.id);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.deleted).toBe(true);

    const row = await testDb.db('tow_vehicles').where({ id: partners[0].vehicle.id }).first();
    expect(row).toBeUndefined();
  });

  test('the OTHER partner keeps deleting its own untouched vehicle', async () => {
    const { request: towRequest, partners, auths } = await scenario({ partnerCount: 2 });
    await propose(auths[0], towRequest.id);

    await expectPinned(auths[0], partners[0].vehicle.id);

    const response = await removeVehicle(auths[1], partners[1].vehicle.id);
    expect(response.status).toBe(200);
  });

  test('a foreign vehicle stays a 404, never a 409 (ownership is checked first)', async () => {
    const { request: towRequest, partners, auths } = await scenario({ partnerCount: 2 });
    await propose(auths[0], towRequest.id);

    const response = await removeVehicle(auths[1], partners[0].vehicle.id);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
  });
});
