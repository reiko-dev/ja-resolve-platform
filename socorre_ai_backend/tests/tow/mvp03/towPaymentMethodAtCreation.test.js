/**
 * TOW ROUND — mandatory commercial payment choice at Tow creation.
 *
 * The customer chooses the payment method BEFORE the request exists:
 *   - `POST /tow/requests` without `payment_method` is a 422 and persists
 *     nothing, so a new Tow can never be born `NOT_SELECTED`;
 *   - only the `cash` member of the frozen `PaymentMethod` enum is implemented;
 *     every other member (`card`, `pix`) and every alias (`CASH`, `dinheiro`)
 *     is refused with `method_not_supported_in_mvp`;
 *   - the choice is persisted on `tow_requests.payment_method` in the module's
 *     persistence vocabulary (`CASH`) and recovered by every TowRequest read;
 *   - the Parceiro sees it through the opportunity item's `request`;
 *   - `TowRequest.payment` remains the financial execution projection and is
 *     still `NOT_SELECTED` after creation: no `tow_payments` row exists before
 *     assignment;
 *   - historical rows (created before this delivery) stay parseable as `null`.
 *
 * RED-first: written before the domain rule, the column, the migration and the
 * contract revision existed.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const request = require('supertest');
const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const {
  createTowCustomerAuth,
  createTowPartnerAuth,
} = require('../../helpers/tow/auth');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const {
  DEFAULT_INSTANT,
  IDEMPOTENCY_KEY,
  createTowRequestInput,
  createMvp03Services,
  createOperationalPartner,
} = require('../../helpers/tow/mvp03');
const {
  validateCreateTowRequestInput,
  buildTowRequestRecord,
  buildTowRequestDto,
  paymentMethodDto,
  PAYMENT_METHOD,
  PAYMENT_METHOD_DTO,
} = require('../../../src/modules/tow/domain');
const {
  loadRawDocuments,
  composeDocument,
  buildAjv,
  schemaUri,
} = require('../../helpers/towContract');

const ENDPOINT = '/api/tow/requests';
const OPPORTUNITIES = '/api/tow/partner/opportunities';

describe('TOW ROUND — payment_method is required and persisted at creation', () => {
  const documents = loadRawDocuments();
  const { composed } = composeDocument(documents);
  const ajv = buildAjv(composed);
  const validateTowRequest = ajv.getSchema(schemaUri('#/components/schemas/TowRequest'));
  const validateCreateInput = ajv.getSchema(schemaUri('#/components/schemas/CreateTowRequestInput'));

  let app;
  let services;
  let clock;
  let routeProvider;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock(DEFAULT_INSTANT);
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
    ({ services } = createMvp03Services({ clock, routeProvider }));
  });

  afterAll(async () => {
    await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
    await testDb.reset();
  });

  beforeEach(async () => {
    await testDb.db('tow_payments').del();
    await testDb.db('tow_request_tracking').del();
    await testDb.db('tow_assignments').del();
    await testDb.db('tow_request_proposals').del();
    await testDb.db('tow_requests').del();
    await testDb.db('service_modules').where({ module_key: 'tow' }).del();
    routeProvider.reset();
    clock.reset();
  });

  function post(payload, { key = IDEMPOTENCY_KEY, auth } = {}) {
    let pending = request(app).post(ENDPOINT);
    if (key !== null) pending = pending.set('Idempotency-Key', key);
    if (auth) pending = pending.set(auth.headers);
    return pending.send(payload);
  }

  async function rows() {
    return testDb.db('tow_requests').select('*');
  }

  describe('the composed contract requires the commercial choice', () => {
    test('CreateTowRequestInput REQUIRES payment_method and the live payload satisfies it', () => {
      const payload = createTowRequestInput();
      expect(validateCreateInput(payload)).toBe(true);

      delete payload.payment_method;
      expect(validateCreateInput(payload)).toBe(false);
      expect(validateCreateInput.errors.map((error) => error.params.missingProperty))
        .toContain('payment_method');
    });

    test('the schema refuses an unsupported method and accepts the single implemented member', () => {
      expect(validateCreateInput(createTowRequestInput({ payment_method: 'cash' }))).toBe(true);
      expect(validateCreateInput(createTowRequestInput({ payment_method: 'CASH' }))).toBe(false);
      expect(validateCreateInput(createTowRequestInput({ payment_method: 'dinheiro' }))).toBe(false);
      // `card`/`pix` stay schema-valid for Phase 2: the RUNTIME is the gate that
      // answers `422 method_not_supported_in_mvp` for them.
      expect(validateCreateInput(createTowRequestInput({ payment_method: 'card' }))).toBe(true);
      expect(validateCreateInput(createTowRequestInput({ payment_method: 'pix' }))).toBe(true);
    });
  });

  describe('domain — the frozen input shape', () => {
    test('payment_method is a required, normalized member of the create input', () => {
      const input = validateCreateTowRequestInput(createTowRequestInput());
      expect(input.payment_method).toBe(PAYMENT_METHOD);
      expect(Object.isFrozen(input)).toBe(true);
    });

    test('a payload without payment_method is refused with an explicit reason', () => {
      const payload = createTowRequestInput();
      delete payload.payment_method;
      expect(() => validateCreateTowRequestInput(payload)).toThrow(/payment_method is required/);
    });

    test.each([null, 0, 1, true, {}, []])('a non-string payment_method (%p) is refused', (value) => {
      expect(() => validateCreateTowRequestInput(createTowRequestInput({ payment_method: value })))
        .toThrow(/payment_method/);
    });

    test.each(['card', 'pix', 'CASH', 'Cash', 'dinheiro', 'app', ''])(
      'the unimplemented or aliased method "%s" is refused',
      (value) => {
        let error = null;
        try {
          validateCreateTowRequestInput(createTowRequestInput({ payment_method: value }));
        } catch (caught) {
          error = caught;
        }
        expect(error).not.toBeNull();
        expect(error.code).toBe('validation_error');
        expect(error.details).toMatchObject({
          field: 'payment_method',
          reason: 'method_not_supported_in_mvp',
          implemented: [PAYMENT_METHOD_DTO],
        });
      }
    );

    test('the persistence record carries the module vocabulary, never the consumer one', () => {
      const input = validateCreateTowRequestInput(createTowRequestInput());
      const record = buildTowRequestRecord({
        input,
        customerId: 1,
        radiusKm: 15,
        idempotencyKey: IDEMPOTENCY_KEY,
        now: DEFAULT_INSTANT,
      });
      expect(record.payment_method).toBe(PAYMENT_METHOD);
    });

    test('the DTO projects cash, and null only for a historical row', () => {
      expect(paymentMethodDto(PAYMENT_METHOD)).toBe(PAYMENT_METHOD_DTO);
      expect(paymentMethodDto(null)).toBeNull();
      expect(paymentMethodDto(undefined)).toBeNull();
      expect(() => paymentMethodDto('PIX')).toThrow(/payment vocabulary/);

      const historical = {
        id: 9,
        customer_id: 1,
        state: 'SEARCHING',
        pickup: { latitude: -23.5, longitude: -46.6, formatted_address: null },
        destination: { latitude: -23.6, longitude: -46.5, formatted_address: null },
        vehicle: { class: 'light_vehicle', make: 'Fiat', model: 'Argo', year: null, weight_kg: null, plate: null },
        problem_description: 'x',
        observations: null,
        payment_method: null,
        matching_radius_km: 15,
        created_at: DEFAULT_INSTANT,
        updated_at: DEFAULT_INSTANT,
      };
      expect(buildTowRequestDto(historical, { max_radius_km: 50 }).payment_method).toBeNull();
    });
  });

  describe('HTTP creation', () => {
    test('a request without payment_method is a 422 and persists nothing', async () => {
      const customer = await createTowCustomerAuth();
      const payload = createTowRequestInput();
      delete payload.payment_method;

      const response = await post(payload, { auth: customer });
      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('validation_error');
      expect(response.body.error.details).toMatchObject({ field: 'payment_method', reason: 'missing' });
      expect(await rows()).toHaveLength(0);
    });

    test.each(['card', 'pix', 'CASH', 'dinheiro'])(
      'an unsupported method "%s" is a 422 and persists nothing',
      async (method) => {
        const customer = await createTowCustomerAuth();
        const response = await post(createTowRequestInput({ payment_method: method }), { auth: customer });

        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe('validation_error');
        expect(response.body.error.details).toMatchObject({
          field: 'payment_method',
          reason: 'method_not_supported_in_mvp',
        });
        expect(await rows()).toHaveLength(0);
      }
    );

    test('cash is accepted, persisted as CASH and projected as cash', async () => {
      const customer = await createTowCustomerAuth();
      const response = await post(createTowRequestInput({ payment_method: 'cash' }), { auth: customer });

      expect(response.status).toBe(201);
      expect(response.body.data.payment_method).toBe('cash');

      const persisted = (await rows())[0];
      expect(persisted.payment_method).toBe('CASH');
    });

    test('a new request is never born NOT_SELECTED and owns no payment row', async () => {
      const customer = await createTowCustomerAuth();
      const response = await post(createTowRequestInput(), { auth: customer });

      expect(response.status).toBe(201);
      // The financial execution is untouched: no row exists before assignment.
      expect(response.body.data.payment).toEqual({
        request_id: response.body.data.id,
        method: null,
        status: 'NOT_SELECTED',
        amount_cents: null,
        currency: null,
        can_start_service: false,
        pix: null,
      });
      expect(await testDb.db('tow_payments').select('*')).toHaveLength(0);
    });

    test('the live 201 body validates against the canonical TowRequest schema', async () => {
      const customer = await createTowCustomerAuth();
      const response = await post(createTowRequestInput(), { auth: customer });

      expect(response.status).toBe(201);
      expect(validateTowRequest(response.body.data)).toBe(true);
      expect(validateTowRequest.errors).toBeNull();
    });

    test('the persisted method is recovered by the owner read and the history list', async () => {
      const customer = await createTowCustomerAuth();
      const created = await post(createTowRequestInput(), { auth: customer });
      const id = created.body.data.id;

      const read = await request(app).get(`${ENDPOINT}/${id}`).set(customer.headers);
      expect(read.status).toBe(200);
      expect(read.body.data.payment_method).toBe('cash');

      const list = await request(app).get(ENDPOINT).set(customer.headers);
      expect(list.status).toBe(200);
      expect(list.body.data.items).toHaveLength(1);
      expect(list.body.data.items[0].payment_method).toBe('cash');
    });

    test('a historical row without a method stays parseable as null', async () => {
      const customer = await createTowCustomerAuth();
      // Model a request created BEFORE this delivery: the column exists and is
      // NULL. The read must stay truthful, never invent CASH.
      await services.towRequestRepository.createIdempotent(
        {
          customer_id: customer.user.id,
          state: 'SEARCHING',
          pickup: createTowRequestInput().pickup,
          destination: createTowRequestInput().destination,
          vehicle: createTowRequestInput().vehicle,
          problem_description: 'Histórico',
          observations: null,
          payment_method: null,
          matching_radius_km: 15,
          idempotency_key: 'idem-historical-0001',
          created_at: clock.now(),
          updated_at: clock.now(),
        },
        { fingerprintSource: 'historical-row' }
      );

      const list = await request(app).get(ENDPOINT).set(customer.headers);
      expect(list.status).toBe(200);
      expect(list.body.data.items[0].payment_method).toBeNull();
      expect(validateTowRequest(list.body.data.items[0])).toBe(true);
    });
  });

  describe('the database pins the method vocabulary', () => {
    test('a method outside CASH is rejected by the schema, not only by the service', async () => {
      const customer = await createTowCustomerAuth();
      await post(createTowRequestInput(), { auth: customer });
      const persisted = (await rows())[0];

      await expect(
        testDb.db('tow_requests').where({ id: persisted.id }).update({ payment_method: 'PIX' })
      ).rejects.toThrow(/CHECK|constraint/i);
      expect((await rows())[0].payment_method).toBe('CASH');
    });
  });

  describe('partner opportunity', () => {
    test('the Parceiro receives the method on the opportunity request', async () => {
      const customer = await createTowCustomerAuth();
      const created = await post(createTowRequestInput(), { auth: customer });
      expect(created.status).toBe(201);

      const partner = await createTowPartnerAuth();
      await createOperationalPartner({
        services,
        partner: partner.partner,
        documents: [{ document_type: 'vehicle_license', status: 'approved' }],
        active: true,
      });

      const feed = await request(app).get(OPPORTUNITIES).set(partner.headers);
      expect(feed.status).toBe(200);
      expect(feed.body.data.items).toHaveLength(1);
      const item = feed.body.data.items[0];
      expect(item.request.payment_method).toBe('cash');
      // Origin, destination, vehicle, distance and the backend price are all
      // present on the SAME opportunity item.
      expect(item.request.pickup.latitude).toBeCloseTo(-23.561684, 6);
      expect(item.request.destination.latitude).toBeCloseTo(-23.6639, 6);
      expect(item.request.vehicle.class).toBe('light_vehicle');
      expect(item.route_quote.total_distance_meters).toBeGreaterThan(0);
      expect(item.proposed_price.amount_cents).toBeGreaterThan(0);
    });
  });
});
