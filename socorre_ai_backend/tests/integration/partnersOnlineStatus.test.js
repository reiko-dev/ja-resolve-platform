/**
 * Legacy partner presence — `PUT /api/partners/:id/online-status`.
 *
 * Contract exercised exactly as the partner app sends it: partner JWT in the
 * `Authorization` header and `{ is_online: boolean }` in the body. The matching
 * path reads `partners.is_online`, so the endpoint must persist the flag.
 *
 * Regression guard: `Partner.updateOnlineStatus` used to write a `last_seen`
 * column that does not exist in the baseline schema. On PostgreSQL that is
 * error 42703 and on the SQLite harness "no such column", both surfacing as a
 * 500 — every presence update from the partner app failed.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../src/config/database', () => require('../helpers/testDb').db);

const request = require('supertest');
const testDb = require('../helpers/testDb');
const { createApp } = require('../../src/app');
const { createTowPartnerAuth } = require('../helpers/tow/auth');

function onlineStatusPath(partnerId) {
  return `/api/partners/${partnerId}/online-status`;
}

async function persistedIsOnline(partnerId) {
  const row = await testDb.db('partners').where({ id: partnerId }).first();
  return Boolean(row && row.is_online);
}

describe('PUT /api/partners/:id/online-status (legacy presence)', () => {
  let app;

  beforeAll(async () => {
    await testDb.reset();
    app = createApp().listen(0);
  });

  afterAll(async () => {
    await new Promise((resolve) => {
      app.closeAllConnections?.();
      app.close(resolve);
    });
    await testDb.reset();
  });

  beforeEach(async () => {
    await testDb.reset();
  });

  test('is_online:true responds 200 and persists partners.is_online = true', async () => {
    const { partner, headers } = await createTowPartnerAuth({ is_online: 0 });
    expect(await persistedIsOnline(partner.id)).toBe(false);

    const response = await request(app)
      .put(onlineStatusPath(partner.id))
      .set(headers)
      .send({ is_online: true });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true });
    expect(await persistedIsOnline(partner.id)).toBe(true);
  });

  test('is_online:false responds 200 and persists partners.is_online = false', async () => {
    const { partner, headers } = await createTowPartnerAuth({ is_online: 1 });
    expect(await persistedIsOnline(partner.id)).toBe(true);

    const response = await request(app)
      .put(onlineStatusPath(partner.id))
      .set(headers)
      .send({ is_online: false });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true });
    expect(await persistedIsOnline(partner.id)).toBe(false);
  });
});
