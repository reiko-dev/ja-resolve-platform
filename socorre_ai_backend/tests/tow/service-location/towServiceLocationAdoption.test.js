/**
 * SERVICE LOCATION — additive Tow adoption (ADR §2/§3/§8).
 *
 * Proves, over the REAL HTTP surface and the SQLite harness with a fake
 * `PlaceDetails` provider (ZERO network):
 *   - the legacy create payload is untouched: no new keys in the response, both
 *     place-id columns NULL;
 *   - `place_id`/`resolution_source` are validated as a pair, persisted ONLY as
 *     the bare place id, and `place_name` is rejected on input;
 *   - coordinates stay the operational authority even when a place is explicit;
 *   - the customer DETAIL and the tracking READ enrich `place_name` best-effort,
 *     while every list/opportunity feed never calls the provider (no N+1);
 *   - a provider failure degrades to the address-only response, never to a
 *     failed read;
 *   - migration 012 is additive and reversible on SQLite.
 *
 * RED-first: written before the domain rules, columns, enrichment and wiring.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const knexFactory = require('knex');
const request = require('supertest');
const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const {
  createTowCustomerAuth,
  createTowPartnerAuth,
} = require('../../helpers/tow/auth');
const {
  DEFAULT_INSTANT,
  PICKUP,
  DESTINATION,
  createTowRequestInput,
  createMvp03Services,
  createOperationalPartner,
} = require('../../helpers/tow/mvp03');
const {
  createMvp05Services,
  createAssignedScenario,
  postTracking,
} = require('../../helpers/tow/mvp05');
const { createPlaceNameEnricher } = require('../../../src/modules/tow/application/place-name-enrichment');
const migration012 = require('../../../database/migrations/012_tow_request_place_id');

const REQUESTS = '/api/tow/requests';
const PARTNER_JOBS = '/api/tow/partner/jobs';
const PARTNER_OPPORTUNITIES = '/api/tow/partner/opportunities';

const PLACE_ID = 'ChIJpw1ace1dentity00000000';
const DESTINATION_PLACE_ID = 'ChIJdes71nat1on000000000';
const PLACE_NAME = 'Contax';

function withPlace(point, placeId, extras = {}) {
  return { ...point, place_id: placeId, ...extras };
}

/** The default fake answer, in the Tow port's snake_case vocabulary. */
async function defaultPlaceDetails({ placeId }) {
  return {
    place_id: placeId,
    place_name: PLACE_NAME,
    formatted_address: 'Estrada Dias Martins, 123 - Rio Branco, AC',
    latitude: PICKUP.latitude,
    longitude: PICKUP.longitude,
  };
}

describe('SERVICE LOCATION — Tow adoption', () => {
  let app;
  let services;
  let clock;
  let routeProvider;
  let places;
  let customer;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock(DEFAULT_INSTANT);
    routeProvider = createFakeRouteProvider();
    places = { getPlace: jest.fn(defaultPlaceDetails) };
    // `placeDetails` is an explicit injection: the fake wins over whatever the
    // app-level Service Location module would wire from the environment.
    app = createApp({
      tow: { clock, routeProvider, addressResolver: null, placeDetails: places },
    }).listen(0);
    ({ services } = createMvp03Services({ clock, routeProvider }));
    customer = await createTowCustomerAuth({ name: 'Customer ServiceLocation' });
  });

  afterAll(async () => {
    await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
    await testDb.reset();
  });

  beforeEach(async () => {
    await testDb.db('tow_request_tracking').del();
    await testDb.db('tow_assignments').del();
    await testDb.db('tow_request_proposals').del();
    await testDb.db('tow_requests').del();
    await testDb.db('tow_vehicle_documents').del();
    await testDb.db('tow_vehicles').del();
    await testDb.db('partners').del();
    await testDb.db('users').where({ role: 'partner' }).del();
    await testDb.db('service_modules').where({ module_key: 'tow' }).del();
    // Reset BOTH the recorded calls and any per-test implementation override.
    places.getPlace.mockReset();
    places.getPlace.mockImplementation(defaultPlaceDetails);
    routeProvider.reset();
    clock.reset();
  });

  function post(payload, { key = 'idem-svcloc-create-0001', auth = customer } = {}) {
    return request(app)
      .post(REQUESTS)
      .set('Idempotency-Key', key)
      .set(auth.headers)
      .send(payload);
  }

  function detail(requestId, auth = customer) {
    return request(app).get(`${REQUESTS}/${requestId}`).set(auth.headers);
  }

  function requestRow(requestId) {
    return testDb.db('tow_requests').where({ id: requestId }).first();
  }

  describe('legacy compatibility (additive only)', () => {
    test('a payload without any new field is accepted and persists NULL place ids', async () => {
      const expectedPickup = {
        latitude: PICKUP.latitude,
        longitude: PICKUP.longitude,
        formatted_address: PICKUP.formatted_address,
      };

      const response = await post(createTowRequestInput(), { key: 'idem-svcloc-legacy-01' });
      expect(response.status).toBe(201);
      // The legacy response shape is untouched: no `place_id`, no `place_name`.
      expect(response.body.data.pickup).toEqual(expectedPickup);
      expect(response.body.data.destination).toEqual({
        latitude: DESTINATION.latitude,
        longitude: DESTINATION.longitude,
        formatted_address: DESTINATION.formatted_address,
      });

      const row = await requestRow(response.body.data.id);
      expect(row.pickup_place_id).toBeNull();
      expect(row.destination_place_id).toBeNull();

      places.getPlace.mockClear();
      const read = await detail(response.body.data.id);
      expect(read.status).toBe(200);
      expect(read.body.data.pickup).toEqual(expectedPickup);
      expect(places.getPlace).not.toHaveBeenCalled();
    });
  });

  describe('explicit place identity', () => {
    test('place_id + USER_SELECTED_PLACE is accepted, persisted and projected', async () => {
      const response = await post(createTowRequestInput({
        pickup: withPlace(PICKUP, PLACE_ID, { resolution_source: 'USER_SELECTED_PLACE' }),
      }), { key: 'idem-svcloc-explicit1' });

      expect(response.status).toBe(201);
      expect(response.body.data.pickup).toMatchObject({
        latitude: PICKUP.latitude,
        longitude: PICKUP.longitude,
        formatted_address: PICKUP.formatted_address,
        place_id: PLACE_ID,
      });

      const row = await requestRow(response.body.data.id);
      expect(row.pickup_place_id).toBe(PLACE_ID);
      expect(row.destination_place_id).toBeNull();
    });

    test('place_id with the source omitted is accepted (normalized to USER_SELECTED_PLACE)', async () => {
      const response = await post(createTowRequestInput({
        pickup: withPlace(PICKUP, PLACE_ID),
      }), { key: 'idem-svcloc-omitted1' });

      expect(response.status).toBe(201);
      expect(response.body.data.pickup.place_id).toBe(PLACE_ID);
      expect(await requestRow(response.body.data.id)).toMatchObject({ pickup_place_id: PLACE_ID });
    });

    test('a places/ resource prefix is stripped before persistence', async () => {
      const response = await post(createTowRequestInput({
        pickup: withPlace(PICKUP, `places/${PLACE_ID}`),
      }), { key: 'idem-svcloc-prefix11' });

      expect(response.status).toBe(201);
      expect(response.body.data.pickup.place_id).toBe(PLACE_ID);
      expect(await requestRow(response.body.data.id)).toMatchObject({ pickup_place_id: PLACE_ID });
    });

    test('coordinates remain the operational authority even with a place_id', async () => {
      const coordinates = { latitude: -9.9749, longitude: -67.8076 };
      const response = await post(createTowRequestInput({
        pickup: withPlace({ ...coordinates, formatted_address: 'Rio Branco - AC' }, PLACE_ID),
      }), { key: 'idem-svcloc-authority' });

      expect(response.status).toBe(201);
      expect(response.body.data.pickup).toEqual({
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        formatted_address: 'Rio Branco - AC',
        place_id: PLACE_ID,
      });

      const row = await requestRow(response.body.data.id);
      expect(Number(row.pickup_latitude)).toBeCloseTo(coordinates.latitude, 6);
      expect(Number(row.pickup_longitude)).toBeCloseTo(coordinates.longitude, 6);
    });

    test('pickup_place_id is persisted and no place_name column/value ever exists', async () => {
      const response = await post(createTowRequestInput({
        pickup: withPlace(PICKUP, PLACE_ID, { resolution_source: 'USER_SELECTED_PLACE' }),
      }), { key: 'idem-svcloc-nonamp-01' });

      const columns = Object.keys(await testDb.db('tow_requests').columnInfo());
      expect(columns).toContain('pickup_place_id');
      expect(columns).toContain('destination_place_id');
      expect(columns.filter((column) => column.includes('place_name'))).toEqual([]);
      expect(columns).not.toContain('resolution_source');

      const row = await requestRow(response.body.data.id);
      expect(row.pickup_place_id).toBe(PLACE_ID);
      expect(Object.keys(row)).not.toContain('resolution_source');
      expect(JSON.stringify(row)).not.toContain(PLACE_NAME);
    });
  });

  describe('pair validation (422, nothing persisted)', () => {
    test.each([
      ['place_id + USER_PIN', (payload) => {
        payload.pickup = withPlace(PICKUP, PLACE_ID, { resolution_source: 'USER_PIN' });
      }],
      ['place_id + CURRENT_LOCATION', (payload) => {
        payload.pickup = withPlace(PICKUP, PLACE_ID, { resolution_source: 'CURRENT_LOCATION' });
      }],
      ['USER_SELECTED_PLACE without place_id', (payload) => {
        payload.pickup = { ...PICKUP, resolution_source: 'USER_SELECTED_PLACE' };
      }],
      ['SAVED_ADDRESS (reserved, rejected in Phase 5)', (payload) => {
        payload.pickup = { ...PICKUP, resolution_source: 'SAVED_ADDRESS' };
      }],
      ['an unknown resolution_source', (payload) => {
        payload.pickup = { ...PICKUP, resolution_source: 'GEOCODER' };
      }],
      ['place_name on a request point', (payload) => {
        payload.pickup = withPlace(PICKUP, PLACE_ID, { place_name: PLACE_NAME });
      }],
    ])('%s is a 422 validation_error and persists nothing', async (_label, mutate) => {
      const payload = createTowRequestInput();
      mutate(payload);

      const response = await post(payload, { key: 'idem-svcloc-invalid1' });
      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('validation_error');
      expect(await testDb.db('tow_requests')).toHaveLength(0);
    });

    test('USER_PIN / CURRENT_LOCATION without place_id stay valid generic coordinates', async () => {
      const response = await post(createTowRequestInput({
        pickup: { ...PICKUP, resolution_source: 'USER_PIN' },
        destination: { ...DESTINATION, resolution_source: 'CURRENT_LOCATION' },
      }), { key: 'idem-svcloc-generic1' });

      expect(response.status).toBe(201);
      expect(response.body.data.pickup).toEqual({
        latitude: PICKUP.latitude,
        longitude: PICKUP.longitude,
        formatted_address: PICKUP.formatted_address,
      });
      const row = await requestRow(response.body.data.id);
      expect(row.pickup_place_id).toBeNull();
      expect(row.destination_place_id).toBeNull();
    });
  });

  describe('read-time place_name enrichment (detailed surfaces only)', () => {
    test('the customer detail attaches an ephemeral place_name, never persisted', async () => {
      const created = await post(createTowRequestInput({
        pickup: withPlace(PICKUP, PLACE_ID, { resolution_source: 'USER_SELECTED_PLACE' }),
      }), { key: 'idem-svcloc-detail1' });
      // Create does not enrich: the provider is only a READ concern.
      expect(created.body.data.pickup).not.toHaveProperty('place_name');
      expect(places.getPlace).not.toHaveBeenCalled();

      const response = await detail(created.body.data.id);
      expect(response.status).toBe(200);
      expect(response.body.data.pickup.place_name).toBe(PLACE_NAME);
      expect(response.body.data.pickup.place_id).toBe(PLACE_ID);
      expect(places.getPlace).toHaveBeenCalledTimes(1);
      expect(places.getPlace).toHaveBeenCalledWith({ placeId: PLACE_ID });

      // The enrichment is response-only: the row never gains a name.
      const row = await requestRow(created.body.data.id);
      expect(JSON.stringify(row)).not.toContain(PLACE_NAME);
    });

    test('the enricher accepts the Service Location camelCase provider vocabulary', async () => {
      places.getPlace.mockResolvedValueOnce({
        placeId: PLACE_ID,
        placeName: 'Contax (camelCase)',
        formattedAddress: null,
        latitude: PICKUP.latitude,
        longitude: PICKUP.longitude,
      });

      const created = await post(createTowRequestInput({
        pickup: withPlace(PICKUP, PLACE_ID),
      }), { key: 'idem-svcloc-camelc1' });

      const response = await detail(created.body.data.id);
      expect(response.status).toBe(200);
      expect(response.body.data.pickup.place_name).toBe('Contax (camelCase)');
    });

    test('a provider failure returns the request without place_name and still 200', async () => {
      const created = await post(createTowRequestInput({
        pickup: withPlace(PICKUP, PLACE_ID),
      }), { key: 'idem-svcloc-failed1' });

      places.getPlace.mockRejectedValueOnce(new Error('places provider is down'));
      const response = await detail(created.body.data.id);

      expect(response.status).toBe(200);
      expect(response.body.data.pickup.place_id).toBe(PLACE_ID);
      expect(response.body.data.pickup).not.toHaveProperty('place_name');
      expect(response.body.data.pickup.formatted_address).toBe(PICKUP.formatted_address);
    });

    test('the tracking read enriches best-effort and never on write', async () => {
      const mvp05 = createMvp05Services({ clock, routeProvider });
      const fixture = await createAssignedScenario({
        app,
        services: mvp05.services,
        clock,
        partnerCount: 1,
        requestInput: createTowRequestInput({
          pickup: withPlace(PICKUP, PLACE_ID),
          destination: withPlace(DESTINATION, DESTINATION_PLACE_ID),
        }),
      });

      places.getPlace.mockClear();
      places.getPlace.mockImplementation(async ({ placeId }) => ({
        placeName: `Name ${placeId}`,
        formattedAddress: null,
        latitude: 0,
        longitude: 0,
      }));

      // WRITE never enriches.
      const written = await postTracking(app, fixture.request.id, fixture.auths[0]);
      expect(written.status).toBe(202);
      expect(places.getPlace).not.toHaveBeenCalled();

      const asCustomer = await request(app)
        .get(`${REQUESTS}/${fixture.request.id}/tracking`)
        .set(fixture.customerAuth.headers);
      expect(asCustomer.status).toBe(200);
      expect(asCustomer.body.data.route.pickup.place_name).toBe(`Name ${PLACE_ID}`);
      expect(asCustomer.body.data.route.destination.place_name).toBe(`Name ${DESTINATION_PLACE_ID}`);
      // Coordinates stay the authority; the route is not recomputed.
      expect(asCustomer.body.data.route.pickup.latitude).toBe(PICKUP.latitude);
      expect(asCustomer.body.data.route.pickup.longitude).toBe(PICKUP.longitude);

      // A provider outage degrades the READ to address-only, never to an error.
      places.getPlace.mockRejectedValue(new Error('places provider is down'));
      const degraded = await request(app)
        .get(`${REQUESTS}/${fixture.request.id}/tracking`)
        .set(fixture.customerAuth.headers);
      expect(degraded.status).toBe(200);
      expect(degraded.body.data.route.pickup.place_id).toBeUndefined();
      expect(degraded.body.data.route.pickup).not.toHaveProperty('place_name');
    });

    test('list endpoints never call the provider (no N+1)', async () => {
      const created = await post(createTowRequestInput({
        pickup: withPlace(PICKUP, PLACE_ID),
      }), { key: 'idem-svcloc-list11' });
      places.getPlace.mockClear();

      const response = await request(app).get(REQUESTS).set(customer.headers);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toHaveLength(1);
      // The persisted identity is projected; the ephemeral name is not resolved.
      expect(response.body.data.items[0].pickup.place_id).toBe(PLACE_ID);
      expect(response.body.data.items[0].pickup).not.toHaveProperty('place_name');
      expect(places.getPlace).not.toHaveBeenCalled();

      // The detail of the SAME row proves the provider is wired and reachable —
      // the list simply must not use it.
      const read = await detail(created.body.data.id);
      expect(read.status).toBe(200);
      expect(read.body.data.pickup.place_name).toBe(PLACE_NAME);
      expect(places.getPlace).toHaveBeenCalledTimes(1);
    });

    test('partner opportunities never call the provider', async () => {
      await post(createTowRequestInput({
        pickup: withPlace(PICKUP, PLACE_ID),
      }), { key: 'idem-svcloc-opps11' });

      const partnerAuth = await createTowPartnerAuth({
        latitude: PICKUP.latitude,
        longitude: PICKUP.longitude,
      });
      await createOperationalPartner({ services, partner: partnerAuth.partner });
      places.getPlace.mockClear();

      const response = await request(app)
        .get(PARTNER_OPPORTUNITIES)
        .set(partnerAuth.headers);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0].request.pickup.place_id).toBe(PLACE_ID);
      expect(response.body.data.items[0].request.pickup).not.toHaveProperty('place_name');
      expect(places.getPlace).not.toHaveBeenCalled();
    });

    test('the partner job list never calls the provider', async () => {
      const mvp05 = createMvp05Services({ clock, routeProvider });
      const fixture = await createAssignedScenario({
        app,
        services: mvp05.services,
        clock,
        partnerCount: 1,
        requestInput: createTowRequestInput({ pickup: withPlace(PICKUP, PLACE_ID) }),
      });
      places.getPlace.mockClear();

      const response = await request(app)
        .get(PARTNER_JOBS)
        .set(fixture.auths[0].headers);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0].pickup.place_id).toBe(PLACE_ID);
      expect(places.getPlace).not.toHaveBeenCalled();
    });
  });

  describe('createPlaceNameEnricher (pure application)', () => {
    test('without a provider it resolves nulls without any call', async () => {
      const enricher = createPlaceNameEnricher({ placeDetails: null });
      const points = { pickup: { place_id: PLACE_ID }, destination: { place_id: DESTINATION_PLACE_ID } };
      const snapshot = JSON.stringify(points);
      await expect(enricher.enrichPoints(points)).resolves.toEqual({ pickup: null, destination: null });
      expect(JSON.stringify(points)).toBe(snapshot);
    });

    test('points without a place_id are not looked up and the input is never mutated', async () => {
      const getPlace = jest.fn();
      const enricher = createPlaceNameEnricher({ placeDetails: { getPlace } });
      await expect(enricher.enrichPoints({
        pickup: { latitude: PICKUP.latitude, longitude: PICKUP.longitude, place_id: null },
        destination: { latitude: DESTINATION.latitude, longitude: DESTINATION.longitude },
      })).resolves.toEqual({ pickup: null, destination: null });
      expect(getPlace).not.toHaveBeenCalled();
    });

    test('the two lookups run in parallel and any error resolves to null', async () => {
      const pending = [];
      const getPlace = jest.fn(({ placeId }) => new Promise((resolve, reject) => {
        pending.push(() => {
          if (placeId === PLACE_ID) resolve({ place_name: PLACE_NAME });
          else reject(new Error('boom'));
        });
      }));
      const enricher = createPlaceNameEnricher({ placeDetails: { getPlace } });

      const result = enricher.enrichPoints({
        pickup: { place_id: PLACE_ID },
        destination: { place_id: DESTINATION_PLACE_ID },
      });
      expect(getPlace).toHaveBeenCalledTimes(2);
      pending.forEach((release) => release());

      await expect(result).resolves.toEqual({ pickup: PLACE_NAME, destination: null });
    });
  });

  describe('migration 012 — additive and reversible on SQLite', () => {
    let scratch;

    beforeAll(async () => {
      scratch = knexFactory({
        client: 'sqlite3',
        connection: { filename: ':memory:' },
        useNullAsDefault: true,
        pool: { min: 1, max: 1 },
      });
      await scratch.schema.createTable('tow_requests', (table) => {
        table.increments('id');
        table.string('pickup_formatted_address', 500);
      });
    });

    afterAll(async () => {
      if (scratch) await scratch.destroy();
    });

    test('the SQLite harness mirrors the two columns', async () => {
      const columns = await testDb.db('tow_requests').columnInfo();
      expect(columns).toHaveProperty('pickup_place_id');
      expect(columns).toHaveProperty('destination_place_id');
      expect(columns.pickup_place_id.nullable).toBe(true);
      expect(columns.destination_place_id.nullable).toBe(true);
    });

    test('up() adds nullable columns and leaves historical rows untouched', async () => {
      await scratch('tow_requests').insert({ pickup_formatted_address: 'legacy row' });
      await migration012.up(scratch);

      const columns = await scratch('tow_requests').columnInfo();
      expect(columns).toHaveProperty('pickup_place_id');
      expect(columns).toHaveProperty('destination_place_id');
      expect(columns.pickup_place_id.nullable).toBe(true);
      expect(columns.destination_place_id.nullable).toBe(true);

      const legacy = await scratch('tow_requests').where({ pickup_formatted_address: 'legacy row' }).first();
      expect(legacy.pickup_place_id).toBeNull();
      expect(legacy.destination_place_id).toBeNull();

      await scratch('tow_requests').insert({
        pickup_formatted_address: 'explicit row',
        pickup_place_id: PLACE_ID,
        destination_place_id: DESTINATION_PLACE_ID,
      });
      const explicit = await scratch('tow_requests').where({ pickup_place_id: PLACE_ID }).first();
      expect(explicit.destination_place_id).toBe(DESTINATION_PLACE_ID);
    });

    test('down() drops exactly the two columns', async () => {
      await migration012.down(scratch);

      const columns = await scratch('tow_requests').columnInfo();
      expect(columns).not.toHaveProperty('pickup_place_id');
      expect(columns).not.toHaveProperty('destination_place_id');
      expect(columns).toHaveProperty('pickup_formatted_address');
    });
  });
});
