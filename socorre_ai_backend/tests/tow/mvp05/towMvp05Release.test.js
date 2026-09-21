/**
 * MVP-05 — assignment release on terminal state + partner job history.
 *
 * A terminal transition (COMPLETED or CANCELLED) releases the live assignment
 * (`released_at` + `release_reason`) WITHOUT deleting or mutating its identity,
 * frees partner and vehicle occupancy, and never touches `tow_vehicles.active`
 * or `partners.is_available`. The partner job list is history: a released job is
 * still returned.
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
const {
  createMvp05Services,
  createAssignedScenario,
  enRoute,
  arrived,
  inTransit,
  finish,
  cancelByCustomer,
  listPartnerJobs,
} = require('../../helpers/tow/mvp05');

describe('MVP-05 — assignment release and job history', () => {
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

  /** A second open request for the same customer, over the real HTTP surface. */
  async function secondRequest(fixture, key) {
    const response = await request(app)
      .post('/api/tow/requests')
      .set(fixture.customerAuth.headers)
      .set('Idempotency-Key', key)
      .send(createTowRequestInput());
    expect(response.status).toBe(201);
    return response.body.data;
  }

  async function assign(fixture, towRequest, keys) {
    const proposed = await request(app)
      .post(`/api/tow/requests/${towRequest.id}/proposals`)
      .set(fixture.auths[0].headers)
      .set('Idempotency-Key', keys.proposal)
      .send({});
    expect(proposed.status).toBe(201);
    const accepted = await request(app)
      .post(`/api/tow/proposals/${proposed.body.data.id}/accept`)
      .set(fixture.customerAuth.headers)
      .set('Idempotency-Key', keys.accept)
      .send({});
    return accepted;
  }

  test('RED-MVP05-4 — completing the service releases the assignment and frees the partner', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    const before = await testDb.db('tow_assignments').where({ tow_request_id: fixture.request.id }).first();
    expect(before.released_at).toBeNull();

    await enRoute(app, fixture.request.id, fixture.auths[0]);
    await arrived(app, fixture.request.id, fixture.auths[0]);
    await inTransit(app, fixture.request.id, fixture.auths[0]);
    clock.advanceMinutes(30);
    expect((await finish(app, fixture.request.id, fixture.auths[0])).status).toBe(200);

    const released = await testDb.db('tow_assignments').where({ tow_request_id: fixture.request.id }).first();
    expect(released.released_at).toBe('2026-01-15T12:30:00.000Z');
    expect(released.release_reason).toBe('COMPLETED');

    // Identity is preserved: release is a timestamp, not a deletion.
    expect(String(released.partner_id)).toBe(String(before.partner_id));
    expect(String(released.tow_vehicle_id)).toBe(String(before.tow_vehicle_id));
    expect(released.final_price_amount_cents).toBe(before.final_price_amount_cents);
    expect(released.assigned_at).toBe(before.assigned_at);
    expect(released.id).toBe(before.id);

    // Occupancy is freed: the same partner and vehicle can be assigned again.
    const second = await secondRequest(fixture, 'idem-mvp05-occ-req-0002');
    const accepted = await assign(fixture, second, {
      proposal: 'idem-mvp05-occ-prop-0002',
      accept: 'idem-mvp05-occ-accept-02',
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.state).toBe('ASSIGNED');

    const all = await testDb.db('tow_assignments').where({ partner_id: before.partner_id }).orderBy('id');
    expect(all).toHaveLength(2);
    expect(all[0].released_at).not.toBeNull();
    expect(all[1].released_at).toBeNull();
  });

  test('release never flips the vehicle or the partner availability flags', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    const vehicleId = fixture.partners[0].vehicle.id;
    const partnerId = fixture.partners[0].partner.id;

    await enRoute(app, fixture.request.id, fixture.auths[0]);
    await arrived(app, fixture.request.id, fixture.auths[0]);
    await inTransit(app, fixture.request.id, fixture.auths[0]);
    await finish(app, fixture.request.id, fixture.auths[0]);

    const vehicle = await testDb.db('tow_vehicles').where({ id: vehicleId }).first();
    const partner = await testDb.db('partners').where({ id: partnerId }).first();
    expect(vehicle.active).toBe(1);
    expect(partner.is_available).toBe(1);
  });

  test('cancelling releases with the CANCELLED reason', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    clock.advanceMinutes(4);
    expect((await cancelByCustomer(app, fixture.request.id, fixture.customerAuth)).status).toBe(200);
    const released = await testDb.db('tow_assignments').where({ tow_request_id: fixture.request.id }).first();
    expect(released.released_at).toBe('2026-01-15T12:04:00.000Z');
    expect(released.release_reason).toBe('CANCELLED');
  });

  test('the partner job list is history: a completed job is still returned', async () => {
    const fixture = await scenario({ partnerCount: 2 });
    await enRoute(app, fixture.request.id, fixture.auths[0]);
    await arrived(app, fixture.request.id, fixture.auths[0]);
    await inTransit(app, fixture.request.id, fixture.auths[0]);
    await finish(app, fixture.request.id, fixture.auths[0]);

    const all = await listPartnerJobs(app, fixture.auths[0]);
    expect(all.status).toBe(200);
    expect(all.body.data.meta.total).toBe(1);
    expect(all.body.data.items[0].id).toBe(String(fixture.request.id));
    expect(all.body.data.items[0].state).toBe('COMPLETED');
    // The released assignment is still the canonical job record.
    expect(all.body.data.items[0].assignment.partner_id).toBe(String(fixture.partners[0].partner.id));

    const completed = await listPartnerJobs(app, fixture.auths[0], { state: 'COMPLETED' });
    expect(completed.body.data.meta.total).toBe(1);
    expect(completed.body.data.items[0].state).toBe('COMPLETED');

    // ... and the losing partner still sees nothing.
    const loser = await listPartnerJobs(app, fixture.auths[1]);
    expect(loser.body.data.meta.total).toBe(0);
  });

  test('a cancelled job is still returned, and the customer recovery agrees', async () => {
    const fixture = await scenario({ partnerCount: 1 });
    await enRoute(app, fixture.request.id, fixture.auths[0]);
    await cancelByCustomer(app, fixture.request.id, fixture.customerAuth);

    const jobs = await listPartnerJobs(app, fixture.auths[0], { state: 'CANCELLED' });
    expect(jobs.body.data.meta.total).toBe(1);
    expect(jobs.body.data.items[0].state).toBe('CANCELLED');
    expect(jobs.body.data.items[0].terminal_reason).toBe('CUSTOMER_CANCELLED');

    const recovered = await request(app)
      .get(`/api/tow/requests/${fixture.request.id}`)
      .set(fixture.customerAuth.headers);
    expect(recovered.body.data.state).toBe('CANCELLED');
    expect(recovered.body.data.assignment).toEqual(jobs.body.data.items[0].assignment);
  });
});
