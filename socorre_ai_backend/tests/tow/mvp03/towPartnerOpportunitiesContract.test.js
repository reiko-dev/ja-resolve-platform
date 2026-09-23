/**
 * MVP-03 — LIVE contract validation of `GET /api/tow/partner/opportunities`.
 *
 * Why this suite exists (EXT-MVP03-1, P1 blocking):
 *   `tests/contract/consumerSmoke.test.js` validates the canonical contract
 *   against GENERATED fixtures, and the fixture generator emits `items: []` for
 *   an array, so the opportunity ITEM schema was never exercised. The runtime
 *   therefore drifted from the frozen contract (`TowOpportunity` requires
 *   `active_tow_vehicle` and `compatibility`; the endpoint returned neither)
 *   without any gate turning red.
 *
 * This suite closes that hole: it drives the REAL app harness through the REAL
 * HTTP route with a REAL successful MVP-03 opportunity (real request creation,
 * real eligibility, real quote through the recording fake provider) and
 * validates the ACTUAL response body against the canonical composed
 * `TowOpportunityListResponse` schema, using the same Ajv build as the contract
 * suite (`tests/helpers/towContract.js`).
 *
 * Hermetic and offline: SQLite test harness, fake clock, fake route provider —
 * no network, no PostgreSQL, no Google call.
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const request = require('supertest');
const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { createTowCustomerAuth, createTowPartnerAuth } = require('../../helpers/tow/auth');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const {
  DEFAULT_INSTANT,
  PICKUP,
  createTowRequestInput,
  createMvp03Services,
  createOperationalPartner,
} = require('../../helpers/tow/mvp03');
const {
  loadRawDocuments,
  composeDocument,
  buildAjv,
  schemaUri,
} = require('../../helpers/towContract');

const ENDPOINT = '/api/tow/partner/opportunities';
const REQUESTS = '/api/tow/requests';

/** ~14.45 km south of the canonical pickup: inside the frozen 15 km radius. */
const NEAR_PARTNER = Object.freeze({ latitude: PICKUP.latitude - 0.13, longitude: PICKUP.longitude });

const OPPORTUNITY_LIST_SCHEMA = schemaUri('#/components/schemas/TowOpportunityListResponse');
const OPPORTUNITY_SCHEMA = schemaUri('#/components/schemas/TowOpportunity');

describe('MVP-03 — live partner opportunities conform to the canonical OpenAPI contract', () => {
  const documents = loadRawDocuments();
  const { composed } = composeDocument(documents);
  const ajv = buildAjv(composed);
  const validateOpportunityList = ajv.getSchema(OPPORTUNITY_LIST_SCHEMA);
  const validateOpportunity = ajv.getSchema(OPPORTUNITY_SCHEMA);

  let app;
  let services;
  let clock;
  let routeProvider;
  let customer;

  beforeAll(async () => {
    await testDb.reset();
    clock = createFakeClock(DEFAULT_INSTANT);
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
    ({ services } = createMvp03Services({ clock, routeProvider }));
    customer = await createTowCustomerAuth({ name: 'Customer MVP03 Contract' });
  });

  afterAll(async () => {
    await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
    await testDb.reset();
  });

  beforeEach(async () => {
    await testDb.db('tow_requests').del();
    await testDb.db('tow_vehicle_documents').del();
    await testDb.db('tow_vehicles').del();
    await testDb.db('partners').del();
    await testDb.db('users').where({ role: 'partner' }).del();
    await testDb.db('service_modules').where({ module_key: 'tow' }).del();
    routeProvider.reset();
    routeProvider.failure = null;
    clock.reset();
  });

  async function createLiveOpportunity() {
    const created = await request(app)
      .post(REQUESTS)
      .set('Idempotency-Key', 'idem-opportunity-contract-1')
      .set(customer.headers)
      .send(createTowRequestInput());
    expect(created.status).toBe(201);

    const auth = await createTowPartnerAuth(NEAR_PARTNER);
    const built = await createOperationalPartner({
      services,
      partner: auth.partner,
      documents: [{ document_type: 'vehicle_license', status: 'approved' }],
      active: true,
    });

    const response = await request(app).get(ENDPOINT).set(auth.headers);
    return { created: created.body.data, partner: built, response };
  }

  test('the canonical validators are compiled from the composed contract (not vacuously absent)', () => {
    expect(typeof validateOpportunityList).toBe('function');
    expect(typeof validateOpportunity).toBe('function');
    expect(composed.info.version).toBe('1.0.0-draft.12');
  });

  test('the ACTUAL HTTP 200 response of the live endpoint validates against TowOpportunityListResponse', async () => {
    const { created, partner, response } = await createLiveOpportunity();

    // A REAL successful MVP-03 opportunity, not an empty envelope.
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.meta).toMatchObject({ page: 1, limit: 20, total: 1 });
    expect(routeProvider.callCount()).toBe(1);

    // The contract gate comes FIRST: the actual wire body must be schema-valid.
    const valid = validateOpportunityList(response.body);
    expect(validateOpportunityList.errors).toBeNull();
    expect(valid).toBe(true);

    const opportunity = response.body.data.items[0];
    expect(opportunity.request.id).toBe(created.id);
    expect(opportunity.active_tow_vehicle.id).toBe(String(partner.vehicle.id));
    expect(opportunity.proposed_price.amount_cents).toBeGreaterThan(0);
    expect(opportunity.route_quote.total_distance_meters).toBeGreaterThan(0);
    expect(opportunity.compatibility).toEqual({
      compatible: true,
      vehicle_class_supported: true,
      weight_within_capacity: true,
    });

    // The item also validates standalone against the item schema.
    expect(validateOpportunity(opportunity)).toBe(true);
    expect(validateOpportunity.errors).toBeNull();
  });

  test('the live item carries exactly the contract members (no invented, no missing)', async () => {
    const { response } = await createLiveOpportunity();
    const opportunity = response.body.data.items[0];

    expect(Object.keys(opportunity).sort()).toEqual([
      'active_tow_vehicle',
      'compatibility',
      'opportunity_expires_at',
      'proposed_price',
      'request',
      'route_quote',
    ]);
    // No tariff and no persistence-only column leaks into the feed.
    expect(opportunity.active_tow_vehicle.pricing).toBeUndefined();
    expect(opportunity.active_tow_vehicle.partner_id).toBeUndefined();
    expect(opportunity.active_tow_vehicle.created_at).toBeUndefined();
  });

  test('the contract validator rejects a live payload missing active_tow_vehicle (in-suite negative control)', async () => {
    const { response } = await createLiveOpportunity();
    const mutated = JSON.parse(JSON.stringify(response.body));
    delete mutated.data.items[0].active_tow_vehicle;

    expect(validateOpportunityList(mutated)).toBe(false);
    expect(validateOpportunityList.errors.map((error) => error.message))
      .toContain("must have required property 'active_tow_vehicle'");
  });

  test('the contract validator rejects a live payload missing compatibility (in-suite negative control)', async () => {
    const { response } = await createLiveOpportunity();
    const mutated = JSON.parse(JSON.stringify(response.body));
    delete mutated.data.items[0].compatibility;

    expect(validateOpportunityList(mutated)).toBe(false);
    expect(validateOpportunityList.errors.map((error) => error.message))
      .toContain("must have required property 'compatibility'");
  });

  test('opportunity_expires_at is nullable and optional in the frozen contract', async () => {
    const { response } = await createLiveOpportunity();
    expect(response.body.data.items[0].opportunity_expires_at).toBeNull();

    // `null` is valid ...
    expect(validateOpportunity(response.body.data.items[0])).toBe(true);
    // ... and so is an ABSENT value (documented optionality).
    const absent = JSON.parse(JSON.stringify(response.body.data.items[0]));
    delete absent.opportunity_expires_at;
    expect(validateOpportunity(absent)).toBe(true);
    // ... while a non-date-time string is not.
    const malformed = JSON.parse(JSON.stringify(response.body.data.items[0]));
    malformed.opportunity_expires_at = 'not-an-instant';
    expect(validateOpportunity(malformed)).toBe(false);
  });

  test('base and canonical opportunity schemas do not diverge silently', () => {
    const canonicalOpportunity = documents.canonical.components.schemas.TowOpportunity;
    const baseItem = documents.base.components.schemas.TowOpportunityListResponse
      .properties.data.properties.items.items;

    expect(baseItem.required).toEqual(canonicalOpportunity.required);
    expect(baseItem.required).toEqual([
      'request',
      'active_tow_vehicle',
      'route_quote',
      'proposed_price',
      'compatibility',
    ]);
    expect(baseItem.properties.active_tow_vehicle.$ref)
      .toBe('#/components/schemas/TowVehicleSummary');
    expect(baseItem.properties.compatibility.$ref)
      .toBe('#/components/schemas/OpportunityCompatibility');
    expect(baseItem.properties.opportunity_expires_at.type)
      .toEqual(canonicalOpportunity.properties.opportunity_expires_at.type);
    expect(baseItem.properties.opportunity_expires_at.type).toEqual(['string', 'null']);
    expect(baseItem.properties.opportunity_expires_at.format).toBe('date-time');
    expect(documents.base.components.schemas.OpportunityCompatibility)
      .toEqual(documents.canonical.components.schemas.OpportunityCompatibility);
    // The expiry field is OPTIONAL in both documents.
    expect(canonicalOpportunity.required).not.toContain('opportunity_expires_at');
    expect(baseItem.required).not.toContain('opportunity_expires_at');
  });
});
