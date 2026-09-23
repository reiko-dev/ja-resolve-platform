/**
 * MVP-03 — `POST /api/tow/requests` (canonical creation path).
 *
 * Proves the frozen input shape, the module gate ordering, the required
 * `Idempotency-Key` contract, the frozen matching radius and the absence of any
 * client-supplied or provider-derived price/route/assignment in the persisted
 * aggregate.
 *
 * RED-first: written before the route, the service, the repository and the
 * `tow_requests` table exist.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const request = require('supertest');
const jwt = require('jsonwebtoken');
const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { buildTowServices } = require('../../../src/modules/tow/composition');
const {
  createTowCustomerAuth,
  createTowPartnerAuth,
  createTowAdminAuth,
} = require('../../helpers/tow/auth');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const {
  DEFAULT_INSTANT,
  IDEMPOTENCY_KEY,
  createTowRequestInput,
} = require('../../helpers/tow/mvp03');

const ENDPOINT = '/api/tow/requests';

describe('MVP-03 — Tow request creation', () => {
  let app;
  let services;
  let clock;
  let routeProvider;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock(DEFAULT_INSTANT);
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
    services = buildTowServices({ db: testDb.db, clock, routeProvider });
  });

  afterAll(async () => {
    await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
    await testDb.reset();
  });

  beforeEach(async () => {
    await testDb.db('tow_requests').del();
    await testDb.db('service_modules').where({ module_key: 'tow' }).del();
    routeProvider.reset();
  });

  function post(payload, { key = IDEMPOTENCY_KEY, headers = {}, auth } = {}) {
    let pending = request(app).post(ENDPOINT);
    if (key !== null) pending = pending.set('Idempotency-Key', key);
    if (auth) pending = pending.set(auth.headers);
    return pending.send(payload);
  }

  async function rows() {
    return testDb.db('tow_requests').select('*');
  }

  /**
   * CORRECTION-2 (flake diagnosis) — a 201 assertion that reports the exact
   * auth state when creation is refused.
   *
   * `src/middleware/auth.js` answers four DIFFERENT 401s and none of them
   * carries an `error.code`: 'Token de acesso não fornecido' (header missing),
   * 'Token revogado' (revoked_tokens hit), 'Usuário não encontrado' (the token
   * verified but the row is gone) and 'Token inválido' (verify threw / DB
   * error). A bare `expect(response.status).toBe(201)` hides which one fired,
   * so a flake is undiagnosable after the fact.
   */
  function expectCreated(response, auth) {
    if (response.status !== 201) {
      let claims = null;
      try {
        claims = jwt.decode(auth.token);
      } catch (error) {
        claims = { decodeError: error.message };
      }
      throw new Error(
        `expected 201 Created, got ${response.status}: ${JSON.stringify({
          body: response.body,
          userId: auth.user ? auth.user.id : null,
          userEmail: auth.user ? auth.user.email : null,
          tokenClaims: claims,
          nowSeconds: Math.floor(Date.now() / 1000),
          jwtSecret: process.env.JWT_SECRET ? 'env' : 'dev-fallback',
        })}`
      );
    }
    expect(response.status).toBe(201);
  }

  describe('successful creation', () => {
    test('a valid payload returns 201 with the canonical TowRequest DTO', async () => {
      const customer = await createTowCustomerAuth();
      const response = await post(createTowRequestInput(), { auth: customer });

      expectCreated(response, customer);
      expect(response.body.success).toBe(true);
      const dto = response.body.data;
      expect(dto).toMatchObject({
        state: 'SEARCHING',
        terminal_reason: null,
        module_key: 'tow',
        customer_id: String(customer.user.id),
        assignment: null,
        // ISSUE #6 — a fresh SEARCHING request is cancellable by its owner, and
        // the creation projection must agree with the recovery read.
        allowed_actions: ['cancel'],
        problem_description: 'Carro não liga na garagem do prédio',
      });
      expect(dto.matching).toEqual({ current_radius_km: 15, max_radius_km: 50, search_expires_at: null });
      expect(dto.payment).toEqual({
        request_id: dto.id,
        method: null,
        status: 'NOT_SELECTED',
        amount_cents: null,
        currency: null,
        can_start_service: false,
        pix: null,
      });
      expect(dto.pickup).toEqual({
        latitude: -23.561684,
        longitude: -46.655981,
        formatted_address: 'Av. Paulista, 1578 - São Paulo - SP',
      });
      expect(dto.created_at).toBe(DEFAULT_INSTANT);
      expect(dto.updated_at).toBe(DEFAULT_INSTANT);
    });

    test('exactly one SEARCHING row is persisted with the frozen radius', async () => {
      const customer = await createTowCustomerAuth();
      await post(createTowRequestInput(), { auth: customer });

      const persisted = await rows();
      expect(persisted).toHaveLength(1);
      expect(persisted[0]).toMatchObject({
        customer_id: customer.user.id,
        state: 'SEARCHING',
        matching_radius_km: 15,
        idempotency_key: IDEMPOTENCY_KEY,
        vehicle_class: 'light_vehicle',
        vehicle_make: 'Fiat',
        vehicle_model: 'Argo',
      });
      expect(Number(persisted[0].pickup_latitude)).toBeCloseTo(-23.561684, 6);
      expect(Number(persisted[0].destination_longitude)).toBeCloseTo(-46.531, 6);
    });

    test('no price, route or assignment is ever persisted', async () => {
      const customer = await createTowCustomerAuth();
      await post(createTowRequestInput(), { auth: customer });

      const persisted = (await rows())[0];
      for (const forbidden of [
        'estimated_price', 'final_price', 'price_breakdown', 'route_quote',
        'distance_meters', 'duration_seconds', 'partner_id', 'assigned_partner_id',
        'selected_proposal_id', 'payment_status', 'search_expires_at',
      ]) {
        expect(Object.keys(persisted)).not.toContain(forbidden);
      }
      // The commercial choice is NOT a price: it is the persisted method the
      // customer selected, in the module's own persistence vocabulary.
      expect(persisted.payment_method).toBe('CASH');
    });

    test('creation never calls the route provider', async () => {
      const customer = await createTowCustomerAuth();
      await post(createTowRequestInput(), { auth: customer });
      expect(routeProvider.callCount()).toBe(0);
    });

    test('a custom radius setting is frozen into the new request', async () => {
      await services.settingsService.patch({ tow_initial_radius_km: 30 });
      const customer = await createTowCustomerAuth();
      const response = await post(createTowRequestInput(), { auth: customer });
      expectCreated(response, customer);
      expect(response.body.data.matching.current_radius_km).toBe(30);
      expect((await rows())[0].matching_radius_km).toBe(30);
      await services.settingsService.patch({ tow_initial_radius_km: 15 });
    });

    test('an optional year, weight and plate may be omitted', async () => {
      const customer = await createTowCustomerAuth();
      const payload = createTowRequestInput();
      delete payload.vehicle.year;
      delete payload.vehicle.weight_kg;
      delete payload.vehicle.plate;
      delete payload.observations;

      const response = await post(payload, { auth: customer });
      expectCreated(response, customer);
      expect(response.body.data.vehicle).toEqual({
        class: 'light_vehicle', make: 'Fiat', model: 'Argo', year: null, weight_kg: null, plate: null,
      });
      expect(response.body.data.observations).toBeNull();
    });
  });

  describe('module gate', () => {
    test('a disabled module refuses creation with 409 service_module_disabled', async () => {
      await services.moduleService.setEnabled({ enabled: false, reason: 'MVP-03 gate test' });
      const customer = await createTowCustomerAuth();

      const response = await post(createTowRequestInput(), { auth: customer });
      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('service_module_disabled');
      expect(await rows()).toHaveLength(0);
    });

    test('the module gate runs before payload validation', async () => {
      await services.moduleService.setEnabled({ enabled: false, reason: 'MVP-03 gate ordering' });
      const customer = await createTowCustomerAuth();

      const response = await post({ nonsense: true }, { auth: customer });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('service_module_disabled');
      expect(await rows()).toHaveLength(0);
    });

    test('a disabled module never reaches the route provider', async () => {
      await services.moduleService.setEnabled({ enabled: false, reason: 'MVP-03 provider guard' });
      const customer = await createTowCustomerAuth();
      await post(createTowRequestInput(), { auth: customer });
      expect(routeProvider.callCount()).toBe(0);
    });
  });

  describe('idempotency key contract', () => {
    test('a missing Idempotency-Key is a 422 validation error and persists nothing', async () => {
      const customer = await createTowCustomerAuth();
      const response = await post(createTowRequestInput(), { key: null, auth: customer });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('validation_error');
      expect(await rows()).toHaveLength(0);
    });

    test('a key shorter than 8 characters is rejected', async () => {
      const customer = await createTowCustomerAuth();
      const response = await post(createTowRequestInput(), { key: 'short', auth: customer });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('validation_error');
      expect(await rows()).toHaveLength(0);
    });

    test('a key longer than 128 characters is rejected', async () => {
      const customer = await createTowCustomerAuth();
      const response = await post(createTowRequestInput(), { key: 'x'.repeat(129), auth: customer });
      expect(response.status).toBe(422);
      expect(await rows()).toHaveLength(0);
    });
  });

  describe('payload validation', () => {
    test.each([
      ['missing pickup', (payload) => { delete payload.pickup; }],
      ['missing destination', (payload) => { delete payload.destination; }],
      ['missing vehicle', (payload) => { delete payload.vehicle; }],
      ['missing problem_description', (payload) => { delete payload.problem_description; }],
      ['unknown top-level field', (payload) => { payload.estimated_price = 199; }],
      ['unknown vehicle class', (payload) => { payload.vehicle.class = 'spaceship'; }],
      ['weight-required class without weight', (payload) => {
        payload.vehicle.class = 'medium_truck';
        delete payload.vehicle.weight_kg;
      }],
      ['pickup at (0,0)', (payload) => { payload.pickup = { latitude: 0, longitude: 0 }; }],
      ['destination at (0,0)', (payload) => { payload.destination = { latitude: 0, longitude: 0 }; }],
      ['out-of-range latitude', (payload) => { payload.pickup.latitude = 91; }],
      ['empty problem_description', (payload) => { payload.problem_description = ''; }],
    ])('%s is a 422 validation error and persists nothing', async (_label, mutate) => {
      const customer = await createTowCustomerAuth();
      const payload = createTowRequestInput();
      mutate(payload);

      const response = await post(payload, { auth: customer });
      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('validation_error');
      expect(await rows()).toHaveLength(0);
    });
  });

  describe('authorization', () => {
    test('an anonymous caller is rejected with 401', async () => {
      const response = await request(app).post(ENDPOINT).set('Idempotency-Key', IDEMPOTENCY_KEY).send(createTowRequestInput());
      expect(response.status).toBe(401);
      expect(await rows()).toHaveLength(0);
    });

    test('a tow partner cannot create a customer request', async () => {
      const partner = await createTowPartnerAuth();
      const response = await post(createTowRequestInput(), { auth: partner });
      expect(response.status).toBe(403);
      expect(await rows()).toHaveLength(0);
    });

    test('an admin cannot create a customer request', async () => {
      const admin = await createTowAdminAuth();
      const response = await post(createTowRequestInput(), { auth: admin });
      expect(response.status).toBe(403);
      expect(await rows()).toHaveLength(0);
    });
  });
});
