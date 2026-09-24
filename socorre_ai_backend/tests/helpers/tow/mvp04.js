/**
 * MVP-04 — fixtures for the proposal lifecycle + atomic assignment suites.
 *
 * Deterministic by construction: fixed instants, fixed coordinates, fixed
 * tariff, no `Date.now()`, no randomness. Everything is persisted through the
 * REAL composition root (`buildTowServices`) so the suites exercise the same
 * repositories, policies and adapters as production — on the SQLite harness and
 * on the opt-in PostgreSQL harness alike.
 *
 * The proposal body is EMPTY by contract (`additionalProperties: false`): the
 * price, the route, the tariff and the vehicle are all server-derived, so there
 * is no "valid proposal payload" to clone. The only client inputs are the path
 * (`requestId`), the identity (`partnerId`) and the `Idempotency-Key` header.
 */
'use strict';

const testDb = require('../testDb');
const { signFor } = require('../auth');
const { createFakeClock } = require('./clock');
const { createTowCustomer } = require('./factories');
const { createFakeRouteProvider } = require('./gateways/mapsGateway');
const { buildTowServices } = require('../../../src/modules/tow/composition');
const {
  DEFAULT_INSTANT,
  PICKUP,
  DESTINATION,
  TARIFF,
  IDEMPOTENCY_KEY,
  createTowRequestInput,
  createOperationalPartner,
  createCanonicalRequest,
} = require('./mvp03');

/** The proposal create/list idempotency keys (>= 8 chars, contract minLength). */
const PROPOSAL_IDEMPOTENCY_KEY = 'idem-mvp04-prop-000001';
const ACCEPT_IDEMPOTENCY_KEY = 'idem-mvp04-accept-0001';

/** The canonical `tow_proposal_expiry_minutes` default (settings definition). */
const PROPOSAL_EXPIRY_MINUTES = 10;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** Build the module services against the SQLite harness (fake clock + fake routes). */
function createMvp04Services(options = {}) {
  const clock = options.clock || createFakeClock(options.start || DEFAULT_INSTANT);
  const routeProvider = options.routeProvider || createFakeRouteProvider(options.route);
  const services = buildTowServices({ db: testDb.db, clock, routeProvider });
  return { services, clock, routeProvider };
}

/**
 * Create an open canonical request plus `partnerCount` operational tow partners,
 * each with its own active compatible vehicle and approved required document.
 *
 * Partners are placed at the canonical pickup coordinates by default, so the
 * frozen 15 km radius always matches; pass `partnerOverrides` (array) to move
 * them or to break a specific eligibility input per index.
 */
async function createProposalScenario(options = {}) {
  const {
    services,
    clock = createFakeClock(DEFAULT_INSTANT),
    partnerCount = 1,
    customer = null,
    radiusKm = 40,
    requestInput = createTowRequestInput(),
    requestIdempotencyKey = IDEMPOTENCY_KEY,
    requestState = 'SEARCHING',
    partnerOverrides = [],
    documentsFor = null,
  } = options;

  const owner = customer || (await createTowCustomer());
  const { request } = await createCanonicalRequest({
    services,
    customer: owner,
    clock,
    radiusKm,
    input: requestInput,
    idempotencyKey: requestIdempotencyKey,
    state: requestState,
  });

  const partners = [];
  for (let index = 0; index < partnerCount; index += 1) {
    const overrides = partnerOverrides[index] || {};
    const { partnerOverrides: partnerRowOverrides = {}, ...rest } = overrides;
    const created = await createOperationalPartner({
      services,
      partnerOverrides: { latitude: PICKUP.latitude, longitude: PICKUP.longitude, ...partnerRowOverrides },
      ...rest,
    });
    // Distinct plates are required by `UNIQUE(partner_id, plate)` only per
    // partner, but a distinct default keeps failure output readable.
    partners.push({ ...created, index });
  }

  if (typeof documentsFor === 'function') {
    for (const entry of partners) {
      // eslint-disable-next-line no-await-in-loop
      await documentsFor(entry, services);
    }
  }

  return { request, customer: owner, partners, clock, services };
}

/** Create a proposal through the real application service. */
async function createProposal(options = {}) {
  const {
    services,
    partner,
    request,
    idempotencyKey = PROPOSAL_IDEMPOTENCY_KEY,
  } = options;
  return services.proposalService.createForPartner({
    partnerId: partner.id,
    requestId: request.id,
    idempotencyKey,
    body: options.body === undefined ? {} : options.body,
  });
}

/** Raw proposal row, for invariant assertions that must bypass the DTO. */
async function proposalRow(db, proposalId) {
  return db('tow_request_proposals').where({ id: proposalId }).first();
}

/** Raw assignment row. */
async function assignmentRow(db, requestId) {
  return db('tow_assignments').where({ tow_request_id: requestId }).first();
}

/** Raw request row. */
async function requestRow(db, requestId) {
  return db('tow_requests').where({ id: requestId }).first();
}

/**
 * Sign a REAL token for an ALREADY-PERSISTED identity.
 *
 * `createTowPartnerAuth` / `createTowCustomerAuth` create their own user+partner
 * rows, which would attribute a proposal to a second, unrelated partner. The
 * suites need the token to point at the operational row created by
 * `createProposalScenario`, so the token is signed directly and the auth
 * middleware loads the partner context from the database (it joins `partners` on
 * `user_id`), exactly as it does in production.
 */
function authFor(identity) {
  const token = signFor(identity.user);
  return {
    user: identity.user,
    partner: identity.partner || null,
    vehicle: identity.vehicle || null,
    token,
    headers: { Authorization: `Bearer ${token}` },
  };
}

/** Attach auth headers to every partner of a scenario. */
function authsForPartners(partners) {
  return partners.map((entry) => authFor(entry));
}

module.exports = {
  PROPOSAL_IDEMPOTENCY_KEY,
  ACCEPT_IDEMPOTENCY_KEY,
  PROPOSAL_EXPIRY_MINUTES,
  DEFAULT_INSTANT,
  PICKUP,
  DESTINATION,
  TARIFF,
  clone,
  createMvp04Services,
  createProposalScenario,
  createProposal,
  authFor,
  authsForPartners,
  proposalRow,
  assignmentRow,
  requestRow,
};
