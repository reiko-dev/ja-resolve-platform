/**
 * B4 — legacy Tow HTTP surface: deprecation signals.
 *
 * Decision: the canonical Tow API is `/api/tow/*`. The legacy surface
 * (`/api/tow-proposals*` and the Tow branches of `/api/emergency-requests*`)
 * is DEPRECATED NOW and removed later, after external consumers are confirmed
 * (`docs/evidence/tow-zero-debt/B4-legacy-removal-issue.md`).
 *
 * These tests pin the header-only signal and, equally important, that the
 * mechanical branches of `/api/emergency-requests` and the canonical `/tow`
 * surface stay untouched. Behavior (status codes/bodies/side effects) must not
 * change; the existing tow/contract suites remain the behavior authority.
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

const request = require('supertest');
const db = require('../../src/config/database');
const { createApp } = require('../../src/app');
const harness = require('./helpers/g3TestHarness');

const EMERGENCIES = '/api/emergency-requests';
const PROPOSALS = '/api/tow-proposals';

let app;
let actors;

beforeAll(async () => {
  await harness.initSchema(db);
  app = createApp();
});

beforeEach(async () => {
  await harness.resetDatabase(db);
  await harness.seedSetting(db, 'tow_price_per_km', 5);
  await harness.seedSetting(db, 'tow_platform_fixed_fee', 10);
  await harness.seedSetting(db, 'tow_minimum_charge', 50);

  const requester = await harness.seedUser(db, { role: 'user' });
  const admin = await harness.seedUser(db, { role: 'admin' });
  const towUser = await harness.seedUser(db, { role: 'partner' });
  const towPartner = await harness.seedPartner(db, towUser.id);
  const mechanicUser = await harness.seedUser(db, { role: 'partner' });
  const mechanicPartner = await harness.seedPartner(db, mechanicUser.id, {
    type: 'mechanic',
    business_name: 'Mecânica B4',
  });

  actors = { requester, admin, towUser, towPartner, mechanicUser, mechanicPartner };
});

afterAll(async () => {
  await db.destroy();
});

function expectDeprecated(response) {
  expect(response.headers.deprecation).toBe('true');
  expect(response.headers.warning).toContain('299');
  expect(response.headers.warning).toContain('/api/tow');
  expect(response.headers.link).toBe('</api/tow/module-status>; rel="successor-version"');
}

function expectNotDeprecated(response) {
  expect(response.headers.deprecation).toBeUndefined();
  expect(response.headers.warning).toBeUndefined();
  expect(response.headers.link).toBeUndefined();
}

function towCreatePayload() {
  return {
    type: 'other',
    request_type: 'tow',
    description: 'Veículo quebrado na rodovia precisa de guincho',
    vehicle_info: { brand: 'Fiat', model: 'Uno', year: 2020 },
    location_type: 'roadside',
    latitude: -23.5505,
    longitude: -46.6333,
    address: 'Av. Paulista, 1000',
  };
}

function mechanicCreatePayload() {
  return {
    type: 'other',
    request_type: 'mechanic',
    description: 'Carro não liga, precisa de mecânico',
    vehicle_info: { brand: 'VW', model: 'Gol', year: 2019 },
    location_type: 'roadside',
    latitude: -23.5505,
    longitude: -46.6333,
    address: 'Av. Paulista, 1000',
  };
}

describe('legacy /api/tow-proposals is deprecated', () => {
  test('signals on every response, including before authorization', async () => {
    const unauthorized = await request(app).get(`${PROPOSALS}/stats`);
    expect(unauthorized.status).toBe(401);
    expectDeprecated(unauthorized);

    const stats = await request(app)
      .get(`${PROPOSALS}/stats`)
      .set(harness.authorize(actors.admin));
    expect(stats.status).toBe(200);
    expectDeprecated(stats);
  });
});

describe('Tow branches of /api/emergency-requests are deprecated', () => {
  test('tow create carries the signal; mechanic create does not', async () => {
    const tow = await request(app)
      .post(EMERGENCIES)
      .set(harness.authorize(actors.requester))
      .send(towCreatePayload());
    expect(tow.status).toBe(201);
    expect(tow.body.success).toBe(true);
    expectDeprecated(tow);

    const mechanic = await request(app)
      .post(EMERGENCIES)
      .set(harness.authorize(actors.requester))
      .send(mechanicCreatePayload());
    expect(mechanic.status).toBe(201);
    expect(mechanic.body.success).toBe(true);
    expectNotDeprecated(mechanic);
  });

  test('nearby?type=tow carries the signal; unfiltered nearby does not', async () => {
    await harness.seedEmergency(db, { user_id: actors.requester.id });

    const towNearby = await request(app)
      .get(`${EMERGENCIES}/nearby?type=tow`)
      .set(harness.authorize(actors.towUser));
    expect(towNearby.status).toBe(200);
    expectDeprecated(towNearby);

    const nearby = await request(app)
      .get(`${EMERGENCIES}/nearby`)
      .set(harness.authorize(actors.towUser));
    expect(nearby.status).toBe(200);
    expectNotDeprecated(nearby);
  });

  test('tow resource reads and lifecycle carry the signal; mechanic does not', async () => {
    const towEmergency = await harness.seedEmergency(db, {
      user_id: actors.requester.id,
      partner_id: actors.towPartner.id,
      status: 'accepted',
    });

    const towRead = await request(app)
      .get(`${EMERGENCIES}/${towEmergency.id}`)
      .set(harness.authorize(actors.requester));
    expect(towRead.status).toBe(200);
    expectDeprecated(towRead);

    const start = await request(app)
      .post(`${EMERGENCIES}/${towEmergency.id}/start`)
      .set(harness.authorize(actors.towUser));
    expect(start.status).toBe(200);
    expectDeprecated(start);

    const mechanicEmergency = await harness.seedEmergency(db, {
      user_id: actors.requester.id,
      partner_id: actors.mechanicPartner.id,
      request_type: 'mechanic',
      proposal_status: null,
      status: 'accepted',
    });

    const mechanicRead = await request(app)
      .get(`${EMERGENCIES}/${mechanicEmergency.id}`)
      .set(harness.authorize(actors.requester));
    expect(mechanicRead.status).toBe(200);
    expectNotDeprecated(mechanicRead);
  });

  test('legacy tow completion with manual final_price is deprecated and unchanged', async () => {
    const towEmergency = await harness.seedEmergency(db, {
      user_id: actors.requester.id,
      partner_id: actors.towPartner.id,
      status: 'in_progress',
    });

    const completed = await request(app)
      .post(`${EMERGENCIES}/${towEmergency.id}/complete`)
      .set(harness.authorize(actors.towUser))
      .send({ final_price: 150 });

    expect(completed.status).toBe(200);
    expect(completed.body.success).toBe(true);
    expect(completed.body.data.status).toBe('completed');
    expect(completed.body.data.final_price).toBe(150);
    expectDeprecated(completed);
  });

  test('mixed/mechanical list reads stay unannotated', async () => {
    await harness.seedEmergency(db, { user_id: actors.requester.id });

    const userList = await request(app)
      .get(`${EMERGENCIES}/user`)
      .set(harness.authorize(actors.requester));
    expect(userList.status).toBe(200);
    expectNotDeprecated(userList);

    const adminList = await request(app)
      .get(EMERGENCIES)
      .set(harness.authorize(actors.admin));
    expect(adminList.status).toBe(200);
    expectNotDeprecated(adminList);
  });
});

describe('canonical /api/tow surface stays clean', () => {
  // This harness has no tow-module tables, so the assertion uses the auth
  // boundary of the canonical router: a 401 is produced before any tow query,
  // which is enough to prove the legacy deprecation middleware is not mounted
  // on `/api/tow/*`.
  test('the canonical namespace carries no deprecation signal', async () => {
    const unauthorized = await request(app).post('/api/tow/requests');
    expect(unauthorized.status).toBe(401);
    expectNotDeprecated(unauthorized);
  });
});
