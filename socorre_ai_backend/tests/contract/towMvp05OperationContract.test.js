/**
 * MVP-05 — OPERATION-LEVEL contract coverage for service execution, tracking and
 * basic cancellation.
 *
 * Same rationale as `tests/contract/towOperationContract.test.js` (EXT-MVP04-3),
 * extended to the eight MVP-05 operations: the Ajv smoke suite validates response
 * BODIES, so an operation could declare a header it does not enforce, or omit a
 * status it really returns, and every test would stay green. This suite pins the
 * OPERATION in both directions:
 *
 *   - contract -> runtime: every declared requirement is enforced (the required
 *     `Idempotency-Key` header, the mandatory `LocationInput` bodies, the
 *     mandatory partner cancellation reason);
 *   - runtime -> contract: every status the backend really produces is declared
 *     for that operation, and every error body validates against `ErrorResponse`.
 *
 * The composed document is read through `tests/helpers/towContract.js` (no
 * hand-copied YAML) and the runtime is the REAL app over the REAL HTTP routes,
 * offline (SQLite harness, fake clock, fake route provider).
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
  createMvp05Services,
  createAssignedScenario,
  enRoute,
  arrived,
  inTransit,
  finish,
  cancelByCustomer,
  cancelByPartner,
  getTracking,
  postTracking,
  driveTo,
  TRACKING_POINT,
  TRACKING_POINT_LATER,
  TRACKING_POINT_STALE,
  ARRIVAL_LOCATION,
} = require('../helpers/tow/mvp05');
const { authFor, authsForPartners } = require('../helpers/tow/mvp04');
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

const validateError = ajv.getSchema(schemaUri('#/components/schemas/ErrorResponse'));
const validateTrackingResponse = ajv.getSchema(schemaUri('#/components/schemas/TrackingResponse'));
const validateTrackingPointResponse = ajv.getSchema(schemaUri('#/components/schemas/TrackingPointResponse'));
const validateCancellationResponse = ajv.getSchema(schemaUri('#/components/schemas/CancellationResponse'));
const validateRequestResponse = ajv.getSchema(schemaUri('#/components/schemas/TowRequestResponse'));

/** The eight MVP-05 operations, at their canonical path and method. */
const OPERATIONS = Object.freeze({
  startTowEnRoute: { method: 'post', path: '/tow/requests/{requestId}/en-route' },
  markTowArrived: { method: 'post', path: '/tow/requests/{requestId}/arrived' },
  startTowInTransit: { method: 'post', path: '/tow/requests/{requestId}/in-transit' },
  finishTowService: { method: 'post', path: '/tow/requests/{requestId}/finish' },
  cancelTowRequestByCustomer: { method: 'post', path: '/tow/requests/{requestId}/cancel' },
  cancelTowRequestByPartner: { method: 'post', path: '/tow/requests/{requestId}/cancel-partner' },
  getTowTracking: { method: 'get', path: '/tow/requests/{requestId}/tracking' },
  postTowTrackingPoint: { method: 'post', path: '/tow/requests/{requestId}/tracking' },
});

/** The truthful status surface the backend really produces, per operation. */
const DECLARED_STATUSES = Object.freeze({
  startTowEnRoute: [200, 401, 403, 404, 409, 422],
  markTowArrived: [200, 401, 403, 404, 409, 422],
  startTowInTransit: [200, 401, 403, 404, 409, 422],
  finishTowService: [200, 401, 403, 404, 409, 422],
  cancelTowRequestByCustomer: [200, 401, 403, 404, 409, 422],
  cancelTowRequestByPartner: [200, 401, 403, 404, 409, 422],
  getTowTracking: [200, 401, 403, 404],
  postTowTrackingPoint: [202, 401, 403, 404, 409, 422],
});

/** Every MVP-05 operation except the tracking read requires the canonical header. */
const KEYED_OPERATIONS = [
  'startTowEnRoute', 'markTowArrived', 'startTowInTransit', 'finishTowService',
  'cancelTowRequestByCustomer', 'cancelTowRequestByPartner', 'postTowTrackingPoint',
];

function find(operationId) {
  const found = findOperation(composed, operationId);
  expect(found).not.toBeNull();
  return found;
}

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

/**
 * The `application/json` schema a response declares. A response may be a `$ref`
 * to a shared component (the milestones) or inline (the tracking pair), so both
 * shapes are resolved and the resulting schema `$ref` is normalised against the
 * composed document.
 */
function bodySchemaRef(operationId, status) {
  const response = find(operationId).operation.responses[String(status)];
  let value = response;
  if (typeof response.$ref === 'string') {
    const pointer = response.$ref.replace(/^#/, '');
    ({ value } = getByPointer(composed, pointer));
  }
  const schema = value.content['application/json'].schema;
  if (typeof schema.$ref === 'string' && schema.$ref.startsWith('./')) {
    return `#${schema.$ref.slice(schema.$ref.indexOf('#'))}`;
  }
  return schema.$ref;
}

describe('MVP-05 — operation-level OpenAPI contract == runtime', () => {
  let app;
  let services;
  let clock;
  let routeProvider;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock();
    routeProvider = createFakeRouteProvider();
    // A real listening server, not the bare app: supertest would otherwise open and
    // close an ephemeral server per request, and that churn is what produces this
    // repository's documented stale-401 / `socket hang up` transport artifacts in a
    // full-suite run. The assertions are unchanged.
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
    ({ services } = createMvp05Services({ clock, routeProvider }));
  });

  afterAll(async () => {
    await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
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
    const created = await createAssignedScenario({ app, services, clock, partnerCount: 2, ...options });
    // A foreign reader/writer must be a REAL authenticated principal: an
    // unknown user id never reaches the ownership rule (the transport auth
    // middleware answers 401 first), so the foreign customer is a second,
    // fully created customer with a valid token.
    const other = await createAssignedScenario({ app, services, clock, partnerCount: 1 });
    return {
      ...created,
      foreignPartnerAuth: authsForPartners(created.partners)[1],
      foreignCustomerAuth: authFor({ user: other.customer }),
    };
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
    test('the eight MVP-05 operations are declared at the canonical paths and methods', () => {
      for (const [operationId, expected] of Object.entries(OPERATIONS)) {
        const { method, path } = find(operationId);
        expect({ operationId, method, path }).toEqual({ operationId, ...expected });
      }
    });

    test('the declared status surface of every MVP-05 operation is the frozen truthful one', () => {
      for (const [operationId, expected] of Object.entries(DECLARED_STATUSES)) {
        expect({ operationId, statuses: declaredStatuses(operationId) }).toEqual({ operationId, statuses: expected });
      }
    });

    test('the seven keyed operations declare the canonical required Idempotency-Key header', () => {
      for (const operationId of KEYED_OPERATIONS) {
        expect({ operationId, header: parameter(operationId, 'Idempotency-Key', 'header') }).toEqual({
          operationId,
          header: {
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: { type: 'string', minLength: 8, maxLength: 128 },
          },
        });
      }
      // The tracking read takes no body and no key.
      expect(parametersOf('getTowTracking').map((entry) => entry.name)).toEqual(['requestId']);
    });

    test('the four milestones and both cancellations declare the 422 their key/body produces', () => {
      for (const operationId of [
        'startTowEnRoute', 'markTowArrived', 'startTowInTransit', 'finishTowService',
        'cancelTowRequestByCustomer', 'cancelTowRequestByPartner', 'postTowTrackingPoint',
      ]) {
        expect(declaredStatuses(operationId)).toContain(422);
      }
      for (const operationId of ['startTowEnRoute', 'markTowArrived', 'startTowInTransit', 'finishTowService']) {
        expect(bodySchemaRef(operationId, 422)).toBe('#/components/schemas/ErrorResponse');
        expect(bodySchemaRef(operationId, 409)).toBe('#/components/schemas/ErrorResponse');
      }
    });

    test('the milestone bodies are declared exactly as the runtime requires them', () => {
      // `arrived` and `finish` REQUIRE a LocationInput; `en-route` and
      // `in-transit` require nothing.
      for (const operationId of ['markTowArrived', 'finishTowService']) {
        const body = find(operationId).operation.requestBody;
        expect(body.required).toBe(true);
        expect(body.content['application/json'].schema.$ref)
          .toBe('#/components/schemas/LocationInput');
      }
      for (const operationId of ['startTowEnRoute', 'startTowInTransit']) {
        expect(find(operationId).operation.requestBody).toBeUndefined();
      }
      // The partner cancellation REQUIRES a reason; the customer one does not.
      expect(find('cancelTowRequestByPartner').operation.requestBody.content['application/json'].schema.$ref)
        .toBe('#/components/schemas/RequiredReasonInput');
      expect(find('cancelTowRequestByCustomer').operation.requestBody.required).toBe(false);
    });

    test('the tracking pair declares the 202 write and the canonical snapshot read', () => {
      expect(bodySchemaRef('postTowTrackingPoint', 202)).toBe('#/components/schemas/TrackingPointResponse');
      expect(bodySchemaRef('getTowTracking', 200)).toBe('#/components/schemas/TrackingResponse');
    });

    test('stale_tracking_update is part of the canonical error vocabulary (draft.8)', () => {
      const code = getByPointer(composed, '/components/schemas/ErrorResponse/properties/error/properties/code');
      expect(code.found).toBe(true);
      expect(code.value.enum).toContain('stale_tracking_update');
      // Inherited gap closed by draft.8: MVP-04 already returned this code from
      // `POST /tow/requests/{requestId}/proposals` (403) without declaring it.
      expect(code.value.enum).toContain('partner_not_operational');
      expect(code.value.enum).toContain('invalid_tow_state');
      expect(code.value.enum).toContain('invalid_tow_transition');
      expect(code.value.enum).toContain('not_assigned_partner');
      // ... and the base contract keeps its own frozen vocabulary untouched.
      const baseCode = documents.base.components.schemas.ErrorResponse.properties.error.properties.code;
      expect(baseCode.enum).not.toContain('stale_tracking_update');
      expect(baseCode.enum).not.toContain('partner_not_operational');
    });

    test('the canonical revision records the MVP-05 revision notes (draft.15 current)', () => {
      expect(composed.info.version).toBe('1.0.0-draft.15');
      expect(canonical.info.version).toBe('1.0.0-draft.15');
      expect(canonical.info.description).toContain('draft.8');
      expect(canonical.info.description).toContain('draft.12');
      expect(canonical.info.description).toContain('draft.13');
      expect(canonical.info.description).toContain('draft.14');
      expect(canonical.info.description).toContain('draft.15');
      expect(canonical.info.description).toContain('MVP-05');
      expect(canonical.info.description).toContain('stale_tracking_update');
      // The frozen base is not rewritten by this revision.
      expect(documents.base.info.version).toBe('1.0.0-draft.2');
    });
  });

  describe('runtime -> contract: the real HTTP surface', () => {
    test('startTowEnRoute: 422 without the header, 403/404/409/401, then 200', async () => {
      const fixture = await scenario();
      const { request: towRequest, auths } = fixture;
      const partnerAuth = auths[0];

      const anonymous = await enRoute(app, towRequest.id, partnerAuth, { auth: null });
      expectDeclared('startTowEnRoute', anonymous);
      expect(anonymous.status).toBe(401);

      const missing = await enRoute(app, towRequest.id, partnerAuth, { key: null });
      expectDeclared('startTowEnRoute', missing);
      expect(missing.status).toBe(422);
      expect(missing.body.error.details.field).toBe('Idempotency-Key');

      const foreign = await enRoute(app, towRequest.id, fixture.foreignPartnerAuth);
      expectDeclared('startTowEnRoute', foreign);
      expect(foreign.status).toBe(403);
      expect(foreign.body.error.code).toBe('not_assigned_partner');

      const unknown = await enRoute(app, 999999, partnerAuth);
      expectDeclared('startTowEnRoute', unknown);
      expect(unknown.status).toBe(404);

      const started = await enRoute(app, towRequest.id, partnerAuth);
      expectDeclared('startTowEnRoute', started);
      expect(started.status).toBe(200);
      expect(validateRequestResponse(started.body)).toBe(true);

      // Replaying the SAME transition is a 200, not a 409 ...
      const replay = await enRoute(app, towRequest.id, partnerAuth);
      expectDeclared('startTowEnRoute', replay);
      expect(replay.status).toBe(200);
      expect(replay.body.data.state).toBe('EN_ROUTE');

      // ... but a LATER milestone is out of order.
      const illegal = await inTransit(app, towRequest.id, partnerAuth);
      expectDeclared('startTowInTransit', illegal);
      expect(illegal.status).toBe(409);
      expect(illegal.body.error.code).toBe('invalid_tow_transition');
      expect(illegal.body.error.details).toEqual({ from: 'EN_ROUTE', to: 'IN_TRANSIT' });
    });

    test('markTowArrived and finishTowService: the LocationInput body is enforced', async () => {
      const fixture = await scenario();
      const { request: towRequest, auths } = fixture;
      const partnerAuth = auths[0];
      await enRoute(app, towRequest.id, partnerAuth);

      for (const invalid of [undefined, {}, { location: { latitude: -23.5 } }, { location: { latitude: -23.5, longitude: -46.6, extra: 1 } }]) {
        const response = await arrived(app, towRequest.id, partnerAuth, {
          body: invalid === undefined ? null : invalid,
          key: 'idem-mvp05-oc-arrived-bad1',
        });
        expectDeclared('markTowArrived', response);
        expect(response.status).toBe(422);
      }

      const atPickup = await arrived(app, towRequest.id, partnerAuth);
      expectDeclared('markTowArrived', atPickup);
      expect(atPickup.status).toBe(200);
      await inTransit(app, towRequest.id, partnerAuth);

      const badFinish = await finish(app, towRequest.id, partnerAuth, {
        body: { location: { latitude: 91, longitude: 0 } },
        key: 'idem-mvp05-oc-finish-bad1',
      });
      expectDeclared('finishTowService', badFinish);
      expect(badFinish.status).toBe(422);

      const done = await finish(app, towRequest.id, partnerAuth, { body: ARRIVAL_LOCATION });
      expectDeclared('finishTowService', done);
      expect(done.status).toBe(200);
      expect(done.body.data.state).toBe('COMPLETED');

      // Terminal replay is accepted for the matching operation only.
      const replay = await finish(app, towRequest.id, partnerAuth);
      expectDeclared('finishTowService', replay);
      expect(replay.status).toBe(200);
      const terminalIllegal = await inTransit(app, towRequest.id, partnerAuth);
      expectDeclared('startTowInTransit', terminalIllegal);
      expect(terminalIllegal.status).toBe(409);
      expect(terminalIllegal.body.error.code).toBe('invalid_tow_transition');
    });

    test('startTowInTransit: 200 on the legal edge, 409 after IN_TRANSIT', async () => {
      const fixture = await scenario();
      const { request: towRequest, auths } = fixture;
      const partnerAuth = auths[0];
      await driveTo(app, fixture, 'ARRIVED');

      const moving = await inTransit(app, towRequest.id, partnerAuth);
      expectDeclared('startTowInTransit', moving);
      expect(moving.status).toBe(200);
      expect(moving.body.data.state).toBe('IN_TRANSIT');
      expect(moving.body.data.allowed_actions).toEqual(['finish_service']);

      // Replaying the SAME transition is a 200 replay ...
      const replay = await inTransit(app, towRequest.id, partnerAuth);
      expectDeclared('startTowInTransit', replay);
      expect(replay.status).toBe(200);
      expect(replay.body.data.state).toBe('IN_TRANSIT');

      // ... while a DIFFERENT milestone is out of order.
      const illegal = await arrived(app, towRequest.id, partnerAuth);
      expectDeclared('markTowArrived', illegal);
      expect(illegal.status).toBe(409);
      expect(illegal.body.error.code).toBe('invalid_tow_transition');
      expect(illegal.body.error.details).toEqual({ from: 'IN_TRANSIT', to: 'ARRIVED' });
    });

    test('cancelTowRequestByCustomer: 403/404/409/422 and the 200 with its envelope', async () => {
      const fixture = await scenario();
      const { request: towRequest, customerAuth } = fixture;

      const anonymous = await cancelByCustomer(app, towRequest.id, customerAuth, { auth: null });
      expectDeclared('cancelTowRequestByCustomer', anonymous);
      expect(anonymous.status).toBe(401);

      const missing = await cancelByCustomer(app, towRequest.id, customerAuth, { key: null });
      expectDeclared('cancelTowRequestByCustomer', missing);
      expect(missing.status).toBe(422);

      const foreign = await cancelByCustomer(app, towRequest.id, fixture.foreignCustomerAuth);
      expectDeclared('cancelTowRequestByCustomer', foreign);
      expect(foreign.status).toBe(403);
      expect(foreign.body.error.code).toBe('not_request_owner');

      const unknown = await cancelByCustomer(app, 999999, customerAuth);
      expectDeclared('cancelTowRequestByCustomer', unknown);
      expect(unknown.status).toBe(404);

      const tooLong = await cancelByCustomer(app, towRequest.id, customerAuth, {
        body: { reason: 'x'.repeat(1001) },
        key: 'idem-mvp05-oc-cancel-long',
      });
      expectDeclared('cancelTowRequestByCustomer', tooLong);
      expect(tooLong.status).toBe(422);

      const cancelled = await cancelByCustomer(app, towRequest.id, customerAuth, { body: null });
      expectDeclared('cancelTowRequestByCustomer', cancelled);
      expect(cancelled.status).toBe(200);
      expect(validateCancellationResponse(cancelled.body)).toBe(true);
      expect(cancelled.body.data.request.state).toBe('CANCELLED');
      expect(cancelled.body.data.request.terminal_reason).toBe('CUSTOMER_CANCELLED');

      // A terminal cancellation replays; the milestones stay refused.
      const replay = await cancelByCustomer(app, towRequest.id, customerAuth);
      expectDeclared('cancelTowRequestByCustomer', replay);
      expect(replay.status).toBe(200);
      const illegal = await enRoute(app, towRequest.id, fixture.auths[0]);
      expectDeclared('startTowEnRoute', illegal);
      expect(illegal.status).toBe(409);
    });

    test('cancelTowRequestByPartner: the reason is mandatory and IN_TRANSIT is refused (customer is not)', async () => {
      const fixture = await scenario();
      const { request: towRequest, auths } = fixture;
      const partnerAuth = auths[0];

      for (const body of [{}, { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(2001) }, { reason: 'ok', extra: 1 }]) {
        const response = await cancelByPartner(app, towRequest.id, partnerAuth, {
          body,
          key: 'idem-mvp05-oc-cancelp-bad1',
        });
        expectDeclared('cancelTowRequestByPartner', response);
        expect(response.status).toBe(422);
      }

      const foreign = await cancelByPartner(app, towRequest.id, fixture.foreignPartnerAuth);
      expectDeclared('cancelTowRequestByPartner', foreign);
      expect(foreign.status).toBe(403);

      const cancelled = await cancelByPartner(app, towRequest.id, partnerAuth);
      expectDeclared('cancelTowRequestByPartner', cancelled);
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.request.terminal_reason).toBe('PARTNER_CANCELLED');
      expect(cancelled.body.data.financial_consequence).toEqual({
        fee_due_cents: 0, currency: 'BRL', customer_debt_created: false,
      });

      // Once transit started, the PARTNER route is refused while the owning
      // customer may still cancel (ISSUE #6).
      const moving = await scenario();
      await driveTo(app, moving, 'IN_TRANSIT');
      const latePartner = await cancelByPartner(app, moving.request.id, moving.auths[0]);
      expectDeclared('cancelTowRequestByPartner', latePartner);
      expect(latePartner.status).toBe(409);
      expect(latePartner.body.error.code).toBe('invalid_tow_transition');

      const lateCustomer = await cancelByCustomer(app, moving.request.id, moving.customerAuth);
      expectDeclared('cancelTowRequestByCustomer', lateCustomer);
      expect(lateCustomer.status).toBe(200);
      expect(validateCancellationResponse(lateCustomer.body)).toBe(true);
      expect(lateCustomer.body.data.request.state).toBe('CANCELLED');
      expect(lateCustomer.body.data.request.terminal_reason).toBe('CUSTOMER_CANCELLED');
    });

    test('getTowTracking: 200 for both readers, 401/403/404 otherwise', async () => {
      const fixture = await scenario();
      const { request: towRequest, customerAuth, auths } = fixture;

      const anonymous = await getTracking(app, towRequest.id, customerAuth, { auth: null });
      expectDeclared('getTowTracking', anonymous);
      expect(anonymous.status).toBe(401);

      const foreignCustomer = await getTracking(app, towRequest.id, fixture.foreignCustomerAuth);
      expectDeclared('getTowTracking', foreignCustomer);
      expect(foreignCustomer.status).toBe(403);
      expect(foreignCustomer.body.error.code).toBe('not_request_owner');

      const foreignPartner = await getTracking(app, towRequest.id, fixture.foreignPartnerAuth);
      expectDeclared('getTowTracking', foreignPartner);
      expect(foreignPartner.status).toBe(403);
      expect(foreignPartner.body.error.code).toBe('not_assigned_partner');

      const unknown = await getTracking(app, 999999, customerAuth);
      expectDeclared('getTowTracking', unknown);
      expect(unknown.status).toBe(404);

      const empty = await getTracking(app, towRequest.id, customerAuth);
      expectDeclared('getTowTracking', empty);
      expect(empty.status).toBe(200);
      expect(validateTrackingResponse(empty.body)).toBe(true);
      expect(empty.body.data.latest).toBeNull();
      expect(empty.body.data.route.pickup.latitude).toBeDefined();

      await postTracking(app, towRequest.id, auths[0]);
      const partnerRead = await getTracking(app, towRequest.id, auths[0]);
      expectDeclared('getTowTracking', partnerRead);
      expect(partnerRead.status).toBe(200);
      expect(partnerRead.body.data.latest.recorded_at).toBe(TRACKING_POINT.recorded_at);
    });

    test('postTowTrackingPoint: 202, 422, 403, 404, 409 (stale and terminal)', async () => {
      const fixture = await scenario();
      const { request: towRequest, auths } = fixture;
      const partnerAuth = auths[0];

      const anonymous = await postTracking(app, towRequest.id, partnerAuth, { auth: null });
      expectDeclared('postTowTrackingPoint', anonymous);
      expect(anonymous.status).toBe(401);

      const missing = await postTracking(app, towRequest.id, partnerAuth, { key: null });
      expectDeclared('postTowTrackingPoint', missing);
      expect(missing.status).toBe(422);

      const foreign = await postTracking(app, towRequest.id, fixture.foreignPartnerAuth);
      expectDeclared('postTowTrackingPoint', foreign);
      expect(foreign.status).toBe(403);

      const unknown = await postTracking(app, 999999, partnerAuth);
      expectDeclared('postTowTrackingPoint', unknown);
      expect(unknown.status).toBe(404);

      for (const body of [
        {}, { latitude: -23.5 }, { latitude: -23.5, longitude: -46.6 },
        { latitude: 91, longitude: -46.6, recorded_at: TRACKING_POINT.recorded_at },
        { latitude: -23.5, longitude: 181, recorded_at: TRACKING_POINT.recorded_at },
        { latitude: -23.5, longitude: -46.6, recorded_at: 'yesterday' },
      ]) {
        const response = await postTracking(app, towRequest.id, partnerAuth, {
          body,
          key: 'idem-mvp05-oc-track-bad1',
        });
        expectDeclared('postTowTrackingPoint', response);
        expect(response.status).toBe(422);
      }

      const accepted = await postTracking(app, towRequest.id, partnerAuth);
      expectDeclared('postTowTrackingPoint', accepted);
      expect(accepted.status).toBe(202);
      expect(validateTrackingPointResponse(accepted.body)).toBe(true);

      const stale = await postTracking(app, towRequest.id, partnerAuth, {
        body: TRACKING_POINT_STALE,
        key: 'idem-mvp05-oc-track-stale',
      });
      expectDeclared('postTowTrackingPoint', stale);
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('stale_tracking_update');
      expect(stale.body.error.details).toEqual({ recorded_at: TRACKING_POINT_STALE.recorded_at });

      const newer = await postTracking(app, towRequest.id, partnerAuth, {
        body: TRACKING_POINT_LATER,
        key: 'idem-mvp05-oc-track-later',
      });
      expectDeclared('postTowTrackingPoint', newer);
      expect(newer.status).toBe(202);

      await driveTo(app, fixture, 'COMPLETED', { enRoute: 'idem-mvp05-oc-enr-00001' });
      const terminal = await postTracking(app, towRequest.id, partnerAuth, {
        body: { ...TRACKING_POINT_LATER, recorded_at: '2026-01-15T12:20:00.000Z' },
        key: 'idem-mvp05-oc-track-term1',
      });
      expectDeclared('postTowTrackingPoint', terminal);
      expect(terminal.status).toBe(409);
      expect(terminal.body.error.code).toBe('invalid_tow_state');
    });

    test('the route provider is never consumed by a tracking read or write', async () => {
      const fixture = await scenario();
      const callsAfterAssignment = routeProvider.callCount();
      await postTracking(app, fixture.request.id, fixture.auths[0]);
      await getTracking(app, fixture.request.id, fixture.customerAuth);
      expect(routeProvider.callCount()).toBe(callsAfterAssignment);
    });
  });
});
