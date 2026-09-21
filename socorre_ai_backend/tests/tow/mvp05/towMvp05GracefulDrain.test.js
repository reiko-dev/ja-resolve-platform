/**
 * MVP-05 — graceful drain after the module is disabled.
 *
 * Disabling the Tow module blocks NEW business (request, proposal, assignment)
 * but must never strand an already-assigned job: execution, tracking and
 * cancellation keep working until the job reaches a terminal state.
 *
 * RED-first: written before the routes, services, columns and tables exist.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const request = require('supertest');
const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const { createTowRequestInput } = require('../../helpers/tow/mvp03');
const { GRACEFUL_DRAIN_CONTRACT } = require('../../../src/modules/tow/domain/availability');
const {
  createMvp05Services,
  createAssignedScenario,
  enRoute,
  arrived,
  inTransit,
  finish,
  cancelByCustomer,
  postTracking,
  getTracking,
  PROPOSAL_IDEMPOTENCY_KEY,
} = require('../../helpers/tow/mvp05');

describe('MVP-05 — graceful drain', () => {
  let app;
  let services;
  let clock;
  let routeProvider;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock();
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider } });
    ({ services } = createMvp05Services({ clock, routeProvider }));
  });

  afterAll(async () => {
    await testDb.reset();
  });

  beforeEach(async () => {
    if (await testDb.db.schema.hasTable('tow_request_tracking')) {
      await testDb.db('tow_request_tracking').del();
    }
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
    return createAssignedScenario({ app, services, clock, ...options });
  }

  function disableModule() {
    return services.moduleService.setEnabled({ enabled: false, reason: 'MVP-05 graceful drain' });
  }

  test('RED-MVP05-6 — an already-assigned job finishes after the module is disabled', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    await disableModule();

    expect((await enRoute(app, fixture.request.id, fixture.auths[0])).status).toBe(200);
    expect((await arrived(app, fixture.request.id, fixture.auths[0])).status).toBe(200);
    expect((await inTransit(app, fixture.request.id, fixture.auths[0])).status).toBe(200);
    const done = await finish(app, fixture.request.id, fixture.auths[0]);
    expect(done.status).toBe(200);
    expect(done.body.data.state).toBe('COMPLETED');

    const released = await testDb.db('tow_assignments').where({ tow_request_id: fixture.request.id }).first();
    expect(released.released_at).not.toBeNull();
    expect(released.release_reason).toBe('COMPLETED');
  });

  test('tracking keeps working for an assigned job while the module is disabled', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    await disableModule();

    const written = await postTracking(app, fixture.request.id, fixture.auths[0]);
    expect(written.status).toBe(202);
    const read = await getTracking(app, fixture.request.id, fixture.customerAuth);
    expect(read.status).toBe(200);
    expect(read.body.data.latest.latitude).toBe(written.body.data.latitude);
  });

  test('cancellation keeps working for an assigned job while the module is disabled', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    await disableModule();

    const response = await cancelByCustomer(app, fixture.request.id, fixture.customerAuth);
    expect(response.status).toBe(200);
    expect(response.body.data.request.state).toBe('CANCELLED');
    const released = await testDb.db('tow_assignments').where({ tow_request_id: fixture.request.id }).first();
    expect(released.release_reason).toBe('CANCELLED');
  });

  test('new business stays blocked while disabled', async () => {
    const fixture = await scenario({ partnerCount: 2 });
    await disableModule();
    const providerCalls = routeProvider.callCount();

    const created = await request(app)
      .post('/api/tow/requests')
      .set(fixture.customerAuth.headers)
      .set('Idempotency-Key', 'idem-mvp05-drain-req-001')
      .send(createTowRequestInput());
    expect(created.status).toBe(409);
    expect(created.body.error.code).toBe('service_module_disabled');

    const proposed = await request(app)
      .post(`/api/tow/requests/${fixture.request.id}/proposals`)
      .set(fixture.auths[1].headers)
      .set('Idempotency-Key', PROPOSAL_IDEMPOTENCY_KEY)
      .send({});
    expect(proposed.status).toBe(409);
    expect(proposed.body.error.code).toBe('service_module_disabled');

    // No provider work is attempted for blocked new business.
    expect(routeProvider.callCount()).toBe(providerCalls);
  });

  test('the frozen drain contract still describes exactly this behaviour', () => {
    expect(GRACEFUL_DRAIN_CONTRACT).toEqual({
      blocksNewBusiness: true,
      preservesAdministration: true,
      drainsAssignedWork: true,
      closesUnassignedRequests: false,
      phase: 'MVP',
    });
  });

  test('re-enabling the module restores new business', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    await disableModule();
    await services.moduleService.setEnabled({ enabled: true, reason: 'MVP-05 drain test restore' });

    const created = await request(app)
      .post('/api/tow/requests')
      .set(fixture.customerAuth.headers)
      .set('Idempotency-Key', 'idem-mvp05-drain-req-002')
      .send(createTowRequestInput());
    expect(created.status).toBe(201);
  });
});
