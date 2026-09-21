/**
 * MVP-04 EXT (EXT-MVP04-2) — the canonical `Idempotency-Key` header is REQUIRED
 * on `POST /tow/proposals/{proposalId}/accept` and
 * `POST /tow/proposals/{proposalId}/withdraw`.
 *
 * The contract declares the header `required: true` with `minLength: 8` and
 * `maxLength: 128`. This suite proves the runtime enforces exactly that, through
 * the EXISTING domain validator (`validateIdempotencyKey`), BEFORE any mutation:
 * a missing or malformed header inserts no assignment row, marks no proposal
 * decided and moves no request out of `NEGOTIATING`.
 *
 * It also pins what the key is NOT: it is not the idempotency authority. The
 * authority stays `proposal_id` plus the PostgreSQL unique constraints, so a
 * replay with a different valid key still returns the SAME assignment / the SAME
 * withdrawn proposal. Withdraw replays are explicit (`WITHDRAWN` is history),
 * while `ACCEPTED` / `CLOSED` stay 409 `proposal_not_actionable` and an expired
 * ACTIVE stays 409 `proposal_expired`.
 *
 * RED-first: written before the controllers forwarded the header and before the
 * services validated it (see `docs/evidence/mvp-04/22-ext04-red.txt`).
 */
'use strict';

process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const request = require('supertest');
const testDb = require('../../helpers/testDb');
const { createApp } = require('../../../src/app');
const { createFakeClock } = require('../../helpers/tow/clock');
const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');
const {
  createMvp04Services,
  createProposalScenario,
  authFor,
  authsForPartners,
} = require('../../helpers/tow/mvp04');
const {
  loadRawDocuments,
  composeDocument,
  buildAjv,
  schemaUri,
} = require('../../helpers/towContract');

const ACCEPT = (proposalId) => `/api/tow/proposals/${proposalId}/accept`;
const WITHDRAW = (proposalId) => `/api/tow/proposals/${proposalId}/withdraw`;
const VALID_ACCEPT_KEY = 'idem-mvp04-accept-0001';
const VALID_WITHDRAW_KEY = 'idem-mvp04-withdraw-0001';

describe('MVP-04 EXT — required Idempotency-Key on accept and withdraw (EXT-MVP04-2)', () => {
  let app;
  let services;
  let clock;
  let routeProvider;
  let validateError;

  beforeAll(async () => {
    await testDb.reset();
    const { composed } = composeDocument(loadRawDocuments());
    const ajv = buildAjv(composed);
    validateError = ajv.getSchema(schemaUri('#/components/schemas/ErrorResponse'));
    expect(typeof validateError).toBe('function');
    clock = createFakeClock();
    routeProvider = createFakeRouteProvider();
    app = createApp({ tow: { clock, routeProvider } });
    ({ services } = createMvp04Services({ clock, routeProvider }));
  });

  afterAll(async () => {
    await testDb.reset();
  });

  beforeEach(async () => {
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
    const created = await createProposalScenario({ services, clock, partnerCount: 2, ...options });
    return { ...created, auths: authsForPartners(created.partners) };
  }

  async function propose(auth, requestId, key) {
    const response = await request(app)
      .post(`/api/tow/requests/${requestId}/proposals`)
      .set('Idempotency-Key', key)
      .set(auth.headers)
      .send({});
    expect(response.status).toBe(201);
    return response.body.data;
  }

  function accept(customerAuth, proposalId, options = {}) {
    let pending = request(app).post(ACCEPT(proposalId));
    if (options.key !== null) pending = pending.set('Idempotency-Key', options.key || VALID_ACCEPT_KEY);
    return pending.set(customerAuth.headers).send({});
  }

  function withdraw(auth, proposalId, options = {}) {
    let pending = request(app).post(WITHDRAW(proposalId));
    if (options.key !== null) pending = pending.set('Idempotency-Key', options.key || VALID_WITHDRAW_KEY);
    return pending.set(auth.headers).send({});
  }

  async function acceptFixture() {
    const created = await scenario();
    const customerAuth = authFor({ user: created.customer });
    const winner = await propose(created.auths[0], created.request.id, 'idem-mvp04-idem-prop-0001');
    return { ...created, customerAuth, winner };
  }

  async function rawState(requestId, proposalId) {
    return {
      assignments: await testDb.db('tow_assignments').where({ tow_request_id: requestId }),
      proposal: await testDb.db('tow_request_proposals').where({ id: proposalId }).first(),
      towRequest: await testDb.db('tow_requests').where({ id: requestId }).first(),
    };
  }

  function expectKeyValidationError(response, reason) {
    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('validation_error');
    expect(response.body.error.details.field).toBe('Idempotency-Key');
    if (reason) expect(response.body.error.details.reason).toBe(reason);
    expect(validateError(response.body)).toBe(true);
    expect(validateError.errors).toBeNull();
  }

  describe('accept', () => {
    test('a missing Idempotency-Key is a 422 and assigns nothing', async () => {
      const { request: towRequest, customerAuth, winner } = await acceptFixture();

      const response = await accept(customerAuth, winner.id, { key: null });
      expectKeyValidationError(response, 'missing');

      const state = await rawState(towRequest.id, winner.id);
      expect(state.assignments).toHaveLength(0);
      expect(state.proposal.status).toBe('ACTIVE');
      expect(state.proposal.decided_at).toBeNull();
      expect(state.towRequest.state).toBe('NEGOTIATING');
    });

    test('a too-short key is a 422 and assigns nothing', async () => {
      const { request: towRequest, customerAuth, winner } = await acceptFixture();

      const response = await accept(customerAuth, winner.id, { key: '1234567' });
      expectKeyValidationError(response, 'too_short');

      const state = await rawState(towRequest.id, winner.id);
      expect(state.assignments).toHaveLength(0);
      expect(state.towRequest.state).toBe('NEGOTIATING');
    });

    test('a too-long key is a 422 and assigns nothing', async () => {
      const { request: towRequest, customerAuth, winner } = await acceptFixture();

      const response = await accept(customerAuth, winner.id, { key: 'k'.repeat(129) });
      expectKeyValidationError(response, 'too_long');

      const state = await rawState(towRequest.id, winner.id);
      expect(state.assignments).toHaveLength(0);
      expect(state.towRequest.state).toBe('NEGOTIATING');
    });

    test('the 8 and 128 character boundaries are accepted', async () => {
      const first = await acceptFixture();
      const accepted = await accept(first.customerAuth, first.winner.id, { key: 'k'.repeat(8) });
      expect(accepted.status).toBe(200);
      expect(accepted.body.data.state).toBe('ASSIGNED');

      const second = await acceptFixture();
      const acceptedMax = await accept(second.customerAuth, second.winner.id, { key: 'k'.repeat(128) });
      expect(acceptedMax.status).toBe(200);
      expect(acceptedMax.body.data.state).toBe('ASSIGNED');
    });

    test('the key is validated before the proposal is even read', async () => {
      const { customerAuth } = await acceptFixture();

      // Unknown id + missing key: validation wins over 404.
      const missing = await accept(customerAuth, 999999, { key: null });
      expectKeyValidationError(missing, 'missing');

      // ... and with a valid key the same id is the honest 404.
      const notFound = await accept(customerAuth, 999999);
      expect(notFound.status).toBe(404);
    });

    test('a replay with the same key returns the same assignment', async () => {
      const { request: towRequest, customerAuth, winner } = await acceptFixture();

      const first = await accept(customerAuth, winner.id);
      expect(first.status).toBe(200);
      const replay = await accept(customerAuth, winner.id);
      expect(replay.status).toBe(200);
      expect(replay.body.data).toEqual(first.body.data);

      const assignments = await testDb.db('tow_assignments').where({ tow_request_id: towRequest.id });
      expect(assignments).toHaveLength(1);
      expect(assignments[0].proposal_id).toBe(Number(winner.id));
    });

    test('a replay with a DIFFERENT valid key returns the same assignment', async () => {
      const { request: towRequest, customerAuth, winner } = await acceptFixture();

      const first = await accept(customerAuth, winner.id, { key: 'idem-mvp04-accept-aaaa' });
      const replay = await accept(customerAuth, winner.id, { key: 'idem-mvp04-accept-bbbb' });

      expect(replay.status).toBe(200);
      // `proposal_id` + the unique constraints are the authority, not the header.
      expect(replay.body.data).toEqual(first.body.data);
      const assignments = await testDb.db('tow_assignments').where({ tow_request_id: towRequest.id });
      expect(assignments).toHaveLength(1);
    });

    test('a missing key on an already assigned request is still a 422', async () => {
      const { request: towRequest, customerAuth, winner } = await acceptFixture();
      await accept(customerAuth, winner.id);

      const response = await accept(customerAuth, winner.id, { key: null });
      expectKeyValidationError(response, 'missing');

      const assignments = await testDb.db('tow_assignments').where({ tow_request_id: towRequest.id });
      expect(assignments).toHaveLength(1);
    });
  });

  describe('withdraw', () => {
    test('a missing Idempotency-Key is a 422 and the proposal stays ACTIVE', async () => {
      const { request: towRequest, auths } = await scenario();
      const created = await propose(auths[0], towRequest.id, 'idem-mvp04-idem-wdr-0001');

      const response = await withdraw(auths[0], created.id, { key: null });
      expectKeyValidationError(response, 'missing');

      const state = await rawState(towRequest.id, created.id);
      expect(state.proposal.status).toBe('ACTIVE');
      expect(state.proposal.decided_at).toBeNull();
      expect(state.towRequest.state).toBe('NEGOTIATING');
    });

    test('a too-short or too-long key is a 422 and the proposal stays ACTIVE', async () => {
      const { request: towRequest, auths } = await scenario();
      const created = await propose(auths[0], towRequest.id, 'idem-mvp04-idem-wdr-0002');

      expectKeyValidationError(await withdraw(auths[0], created.id, { key: '1234567' }), 'too_short');
      expectKeyValidationError(await withdraw(auths[0], created.id, { key: 'k'.repeat(129) }), 'too_long');

      const state = await rawState(towRequest.id, created.id);
      expect(state.proposal.status).toBe('ACTIVE');
      expect(state.proposal.decided_at).toBeNull();
    });

    test('the owning partner withdraws an ACTIVE proposal with a valid key', async () => {
      const { request: towRequest, auths } = await scenario();
      const created = await propose(auths[0], towRequest.id, 'idem-mvp04-idem-wdr-0003');

      const response = await withdraw(auths[0], created.id);
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('WITHDRAWN');

      const state = await rawState(towRequest.id, created.id);
      expect(state.proposal.status).toBe('WITHDRAWN');
      expect(state.proposal.decided_at).toBe('2026-01-15T12:00:00.000Z');
    });

    test('a retry with the same key returns the same withdrawn proposal', async () => {
      const { request: towRequest, auths } = await scenario();
      const created = await propose(auths[0], towRequest.id, 'idem-mvp04-idem-wdr-0004');

      const first = await withdraw(auths[0], created.id, { key: 'idem-mvp04-withdraw-same' });
      const afterFirst = await rawState(towRequest.id, created.id);
      const replay = await withdraw(auths[0], created.id, { key: 'idem-mvp04-withdraw-same' });
      const afterReplay = await rawState(towRequest.id, created.id);

      expect(first.status).toBe(200);
      expect(replay.status).toBe(200);
      expect(replay.body.data).toEqual(first.body.data);
      // The retry is a read: `decided_at` is the FIRST decision, not a new one.
      expect(afterReplay.proposal.decided_at).toBe(afterFirst.proposal.decided_at);
      expect(afterReplay.proposal.decided_at).toBe('2026-01-15T12:00:00.000Z');
    });

    test('a retry with a DIFFERENT valid key returns the same withdrawn proposal', async () => {
      const { request: towRequest, auths } = await scenario();
      const created = await propose(auths[0], towRequest.id, 'idem-mvp04-idem-wdr-0005');

      const first = await withdraw(auths[0], created.id, { key: 'idem-mvp04-withdraw-aaaa' });
      const replay = await withdraw(auths[0], created.id, { key: 'idem-mvp04-withdraw-bbbb' });

      expect(replay.status).toBe(200);
      expect(replay.body.data).toEqual(first.body.data);
      const rows = await testDb.db('tow_request_proposals').where({ id: created.id });
      expect(rows).toHaveLength(1);
    });

    test('a foreign partner is 403 with a valid key and 422 without one', async () => {
      const { request: towRequest, auths } = await scenario();
      const created = await propose(auths[0], towRequest.id, 'idem-mvp04-idem-wdr-0006');

      const foreign = await withdraw(auths[1], created.id, { key: 'idem-mvp04-withdraw-foreign' });
      expect(foreign.status).toBe(403);
      expect(foreign.body.error.code).toBe('forbidden');

      // The required header validates before ownership: nothing is revealed by
      // omitting it, and the proposal is still ACTIVE for its owner.
      expectKeyValidationError(await withdraw(auths[1], created.id, { key: null }), 'missing');
      const state = await rawState(towRequest.id, created.id);
      expect(state.proposal.status).toBe('ACTIVE');
    });

    test('an ACCEPTED proposal is 409 proposal_not_actionable', async () => {
      const { request: towRequest, auths, customerAuth, winner } = await acceptFixture();
      const accepted = await accept(customerAuth, winner.id);
      expect(accepted.status).toBe(200);

      const response = await withdraw(auths[0], winner.id, { key: 'idem-mvp04-withdraw-accepted' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('proposal_not_actionable');
      expect(validateError(response.body)).toBe(true);
    });

    test('a CLOSED proposal is 409 proposal_not_actionable', async () => {
      const { request: towRequest, auths, customer } = await scenario();
      const customerAuth = authFor({ user: customer });
      const winnerProposal = await propose(auths[0], towRequest.id, 'idem-mvp04-idem-wdr-0007');
      const loserProposal = await propose(auths[1], towRequest.id, 'idem-mvp04-idem-wdr-0008');
      await accept(customerAuth, winnerProposal.id);

      const closed = await testDb.db('tow_request_proposals').where({ id: loserProposal.id }).first();
      expect(closed.status).toBe('CLOSED');

      const response = await withdraw(auths[1], loserProposal.id, { key: 'idem-mvp04-withdraw-closed' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('proposal_not_actionable');
    });

    test('an expired ACTIVE proposal is 409 proposal_expired', async () => {
      const { request: towRequest, auths } = await scenario();
      const created = await propose(auths[0], towRequest.id, 'idem-mvp04-idem-wdr-0009');
      clock.set('2026-01-15T12:10:00.000Z');

      const response = await withdraw(auths[0], created.id, { key: 'idem-mvp04-withdraw-expired' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('proposal_expired');

      const state = await rawState(towRequest.id, created.id);
      expect(state.proposal.status).toBe('ACTIVE');
    });

    test('an unknown proposal is 404 with a key and 422 without one', async () => {
      const { auths } = await scenario();

      expectKeyValidationError(await withdraw(auths[0], 999999, { key: null }), 'missing');

      const notFound = await withdraw(auths[0], 999999, { key: 'idem-mvp04-withdraw-unknown' });
      expect(notFound.status).toBe(404);
      expect(notFound.body.error.code).toBe('not_found');
    });
  });
});
