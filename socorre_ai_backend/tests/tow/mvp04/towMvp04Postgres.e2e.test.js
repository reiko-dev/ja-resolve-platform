/**
 * MVP-04 — real PostgreSQL proof for the atomic assignment (OPT-IN,
 * `TOW_POSTGRES_E2E=1`).
 *
 * The default suite runs on the SQLite harness, which has a single connection
 * and therefore CANNOT certify a race. The properties proven here can only be
 * proven on the production engine:
 *
 *   C1  two concurrent accepts of DIFFERENT proposals  -> exactly one assignment
 *   C2  N concurrent accepts of the SAME proposal      -> exactly one assignment
 *   C3  the UNIQUE constraint, not a read-then-write, is the authority
 *   C4  occupancy (one live job per partner/vehicle) is a partial unique index
 *   C5  disable x accept is deterministically serialized (assignment XOR disabled)
 *   C6  migration 005 applies from an empty schema and pins the vocabulary
 *   C7  a referenced vehicle is protected by RESTRICT, and the delete is a 409
 *   C8  concurrent same-key different-payload creates: one proposal, one 409
 *   C9  a create that blocks behind an UNCOMMITTED winner recovers through the
 *       index (the unique-violation branch, forced deterministically)
 *
 * No Google call: the RouteProvider is the deterministic fake.
 */
'use strict';

const request = require('supertest');

const postgres = require('../../helpers/tow/postgres');

const enabled = postgres.isEnabled();
const describePostgres = enabled ? describe : describe.skip;

const CUSTOMER_INPUT = Object.freeze({
  pickup: { latitude: -23.561684, longitude: -46.655981, formatted_address: 'Av. Paulista, 1578 - São Paulo - SP' },
  destination: { latitude: -23.6639, longitude: -46.531, formatted_address: 'Rua das Figueiras, 100 - Santo André - SP' },
  vehicle: { class: 'light_vehicle', make: 'Fiat', model: 'Argo', year: 2021, weight_kg: 1200, plate: 'ABC1D23' },
  problem_description: 'Carro não liga na garagem do prédio',
  observations: null,
  payment_method: 'cash',
});

const TARIFF = Object.freeze({
  minimum_charge_cents: 15000,
  included_km: 10,
  price_per_additional_km_cents: 800,
});

describePostgres('MVP-04 PostgreSQL — atomic assignment and concurrency', () => {
  let db;
  let appDb;
  let services;
  let app;
  let routeProvider;
  let clock;
  let sequence = 0;

  const nextSequence = () => {
    sequence += 1;
    return sequence;
  };

  beforeAll(async () => {
    db = postgres.createConnection();
    await postgres.resetSchema(db);
    await postgres.migrateFromScratch(db);

    // Required AFTER the target env is resolved by the helper above.
    const { buildTowServices } = require('../../../src/modules/tow/composition');
    const { createApp } = require('../../../src/app');
    const { createFakeClock } = require('../../helpers/tow/clock');
    const { createFakeRouteProvider } = require('../../helpers/tow/gateways/mapsGateway');

    clock = createFakeClock('2026-01-15T12:00:00.000Z');
    routeProvider = createFakeRouteProvider();
    services = buildTowServices({ db, clock, routeProvider });
    app = createApp({ tow: { clock, routeProvider } }).listen(0);
    appDb = require('../../../src/config/database');
  });

  afterAll(async () => {
    if (app) await new Promise((resolve) => { app.closeAllConnections?.(); app.close(resolve); });
    if (appDb) await appDb.destroy();
    if (db) await db.destroy();
  });

  beforeEach(async () => {
    await db('tow_assignments').del();
    await db('tow_request_proposals').del();
    await db('tow_requests').del();
    await db('tow_vehicle_documents').del();
    await db('tow_vehicles').del();
    await db('partners').del();
    await db('users').del();
    await db('service_modules').del();
    routeProvider.reset();
    routeProvider.failure = null;
    clock.reset();
  });

  async function createUser({ role, name }) {
    const id = nextSequence();
    const [row] = await db('users').insert({
      name,
      email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id}@mvp04.pg.test`,
      password: 'not-a-real-hash',
      phone: '11990000000',
      role,
    }).returning('*');
    return row;
  }

  function signFor(user) {
    const jwt = require('jsonwebtoken');
    const { getJwtSecret } = require('../../../src/config/jwt');
    return { Authorization: `Bearer ${jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), { expiresIn: '1h' })}` };
  }

  async function createCustomer(name = 'PG Customer') {
    const user = await createUser({ role: 'user', name });
    return { user, headers: signFor(user) };
  }

  async function createTowPartner(name = 'PG Tow Partner') {
    const user = await createUser({ role: 'partner', name });
    const [partner] = await db('partners').insert({
      user_id: user.id,
      type: 'tow',
      business_name: 'Guincho PG',
      address: 'Av. Paulista, 1578 - São Paulo - SP',
      phone: '11990000001',
      latitude: CUSTOMER_INPUT.pickup.latitude,
      longitude: CUSTOMER_INPUT.pickup.longitude,
      is_verified: true,
      is_available: true,
      is_online: true,
      approval_status: 'approved',
    }).returning('*');

    const vehicle = await services.vehicleRepository.insert({
      partner_id: partner.id,
      plate: `PG${String(partner.id).padStart(5, '0')}`,
      make: 'Ford',
      model: 'F-4000',
      year: 2020,
      equipment_type: 'flatbed',
      supported_vehicle_classes: ['light_vehicle', 'motorcycle'],
      max_towed_weight_kg: 4000,
      active: true,
      pricing: TARIFF,
    });
    await services.documentRepository.insert({
      tow_vehicle_id: vehicle.id,
      partner_id: partner.id,
      document_type: 'vehicle_license',
      filename: `pg-${partner.id}`,
      original_name: 'crlv.jpg',
      file_path: `pg-${partner.id}`,
      file_url: `pg-${partner.id}`,
      mime_type: 'image/jpeg',
      file_size: 1,
      status: 'approved',
    });

    return { user, partner, vehicle, headers: signFor(user) };
  }

  async function createRequest(customer, key) {
    const response = await request(app)
      .post('/api/tow/requests')
      .set(customer.headers)
      .set('Idempotency-Key', key)
      .send(CUSTOMER_INPUT);
    expect(response.status).toBe(201);
    return response.body.data;
  }

  async function propose(partner, requestId, key) {
    const response = await request(app)
      .post(`/api/tow/requests/${requestId}/proposals`)
      .set(partner.headers)
      .set('Idempotency-Key', key)
      .send({});
    expect(response.status).toBe(201);
    return response.body.data;
  }

  function accept(customer, proposalId, key) {
    return request(app)
      .post(`/api/tow/proposals/${proposalId}/accept`)
      .set(customer.headers)
      .set('Idempotency-Key', key)
      .send({});
  }

  /**
   * True once some OTHER session is waiting on a lock while running the proposal
   * INSERT. That is the exact moment the create has passed its pre-read and is
   * blocked behind the uncommitted row C9 holds: committing then is deterministic
   * instead of a sleep-and-hope.
   */
  async function waitForBlockedProposalInsert(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await db.raw(
        "SELECT count(*)::int AS blocked FROM pg_stat_activity "
        + "WHERE wait_event_type = 'Lock' AND query ILIKE '%insert into \"tow_request_proposals\"%'"
      );
      if (result.rows[0].blocked > 0) return true;
      await new Promise((resolve) => { setTimeout(resolve, 20); });
    }
    return false;
  }

  async function assignmentRows() {
    return db('tow_assignments').select('*');
  }

  async function proposalStatuses() {
    const rows = await db('tow_request_proposals').select('id', 'status').orderBy('id');
    return Object.fromEntries(rows.map((row) => [String(row.id), row.status]));
  }

  test('migration 005 applies from an empty schema and pins the atomicity authority', async () => {
    const tables = await postgres.listTables(db);
    expect(tables).toContain('tow_request_proposals');
    expect(tables).toContain('tow_assignments');

    // Assert the CONSTRAINT COLUMNS, not the names: the covered column set is
    // the invariant.
    const constraints = await db.raw(`
      SELECT c.conname, string_agg(a.attname, ',' ORDER BY k.ord) AS columns
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE t.relname IN ('tow_request_proposals', 'tow_assignments') AND c.contype = 'u'
      GROUP BY c.conname
    `);
    const uniqueColumnSets = constraints.rows.map((row) => row.columns);
    expect(uniqueColumnSets).toContain('tow_request_id');
    expect(uniqueColumnSets).toContain('proposal_id');
    expect(uniqueColumnSets).toContain('partner_id,idempotency_key');

    // The occupancy indexes must be PARTIAL: a released assignment stops
    // occupying without deleting history.
    const indexes = await db.raw(`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'tow_assignments' AND indexdef ILIKE '%released_at IS NULL%'
    `);
    const definitions = indexes.rows.map((row) => row.indexdef).join('\n');
    expect(definitions).toMatch(/partner_id/);
    expect(definitions).toMatch(/tow_vehicle_id/);

    // The status vocabulary is pinned by a CHECK constraint, not by convention.
    const check = await db.raw(`
      SELECT pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'tow_request_proposals' AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE '%status%'
    `);
    const checkDefinition = check.rows.map((row) => row.definition).join('\n');
    for (const status of ['ACTIVE', 'ACCEPTED', 'CLOSED', 'WITHDRAWN', 'EXPIRED', 'REJECTED']) {
      expect(checkDefinition).toContain(status);
    }
  });

  test('C1 — two concurrent accepts of different proposals yield exactly one assignment', async () => {
    const customer = await createCustomer('C1 Customer');
    const first = await createTowPartner('C1 Partner A');
    const second = await createTowPartner('C1 Partner B');
    const towRequest = await createRequest(customer, 'pg-c1-request-000001');
    const proposalA = await propose(first, towRequest.id, 'pg-c1-prop-a-000001');
    const proposalB = await propose(second, towRequest.id, 'pg-c1-prop-b-000001');

    // Both accepts start while the request is still ASSIGNED-less.
    const responses = await Promise.all([
      accept(customer, proposalA.id, 'pg-c1-accept-a-0001'),
      accept(customer, proposalB.id, 'pg-c1-accept-b-0001'),
    ]);

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 409]);

    const winner = responses.find((response) => response.status === 200);
    const loser = responses.find((response) => response.status === 409);
    expect(winner.body.data.state).toBe('ASSIGNED');
    expect(loser.body.error.code).toBe('request_already_assigned');

    // Exactly ONE assignment row, ever.
    const assignments = await assignmentRows();
    expect(assignments).toHaveLength(1);
    expect(assignments[0].released_at).toBeNull();
    expect([String(proposalA.id), String(proposalB.id)])
      .toContain(String(assignments[0].proposal_id));
    // The winning proposal is the one the request was assigned to.
    expect(String(assignments[0].tow_request_id)).toBe(String(towRequest.id));

    // Winner ACCEPTED, loser CLOSED, and nothing else touched.
    const byId = await proposalStatuses();
    expect(byId[String(assignments[0].proposal_id)]).toBe('ACCEPTED');
    const loserProposalId = String(assignments[0].proposal_id) === String(proposalA.id)
      ? String(proposalB.id)
      : String(proposalA.id);
    expect(byId[loserProposalId]).toBe('CLOSED');

    const [requestRow] = await db('tow_requests').where({ id: towRequest.id }).select('*');
    expect(requestRow.state).toBe('ASSIGNED');
  });

  test('C2 — N concurrent accepts of the SAME proposal collapse to one assignment', async () => {
    const customer = await createCustomer('C2 Customer');
    const partner = await createTowPartner('C2 Partner');
    const towRequest = await createRequest(customer, 'pg-c2-request-000001');
    const proposal = await propose(partner, towRequest.id, 'pg-c2-prop-000001');

    const responses = await Promise.all([1, 2, 3, 4, 5].map(
      (index) => accept(customer, proposal.id, `pg-c2-accept-00000${index}`)
    ));

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.body.data.state).toBe('ASSIGNED');
    }
    // Same assignment every time: the accept is idempotent, not duplicated.
    const assignmentIds = new Set(responses.map((response) => response.body.data.assignment.assigned_at));
    expect(assignmentIds.size).toBe(1);

    const assignments = await assignmentRows();
    expect(assignments).toHaveLength(1);
    expect((await proposalStatuses())[String(proposal.id)]).toBe('ACCEPTED');
  });

  test('C3 — the UNIQUE constraint rejects a second assignment for the same request', async () => {
    const customer = await createCustomer('C3 Customer');
    const first = await createTowPartner('C3 Partner A');
    const second = await createTowPartner('C3 Partner B');
    const towRequest = await createRequest(customer, 'pg-c3-request-000001');
    const proposalA = await propose(first, towRequest.id, 'pg-c3-prop-a-000001');
    const proposalB = await propose(second, towRequest.id, 'pg-c3-prop-b-000001');

    const response = await accept(customer, proposalA.id, 'pg-c3-accept-000001');
    expect(response.status).toBe(200);

    // A direct INSERT bypasses every application guard: only the constraint can
    // stop it. This is what makes the guarantee structural instead of advisory.
    let error = null;
    try {
      await db('tow_assignments').insert({
        tow_request_id: towRequest.id,
        proposal_id: proposalB.id,
        partner_id: second.partner.id,
        tow_vehicle_id: second.vehicle.id,
        vehicle_plate: second.vehicle.plate,
        final_price_amount_cents: 18480,
        final_price_currency: 'BRL',
        assigned_at: new Date('2026-01-15T12:00:00.000Z'),
        created_at: new Date('2026-01-15T12:00:00.000Z'),
        updated_at: new Date('2026-01-15T12:00:00.000Z'),
      });
    } catch (raised) {
      error = raised;
    }
    expect(error).not.toBeNull();
    expect(error.code).toBe('23505');
    expect(await assignmentRows()).toHaveLength(1);
  });

  test('C4 — one live job per partner is a partial unique index (occupancy)', async () => {
    const customer = await createCustomer('C4 Customer');
    const partner = await createTowPartner('C4 Partner');
    const firstRequest = await createRequest(customer, 'pg-c4-request-000001');
    const firstProposal = await propose(partner, firstRequest.id, 'pg-c4-prop-000001');
    expect((await accept(customer, firstProposal.id, 'pg-c4-accept-000001')).status).toBe(200);

    const secondRequest = await createRequest(customer, 'pg-c4-request-000002');
    const secondProposal = await propose(partner, secondRequest.id, 'pg-c4-prop-000002');

    const response = await accept(customer, secondProposal.id, 'pg-c4-accept-000002');
    expect(response.status).toBe(409);
    expect(await assignmentRows()).toHaveLength(1);

    // The partner becomes assignable again only once the live job is released.
    await db('tow_assignments')
      .where({ tow_request_id: firstRequest.id })
      .update({ released_at: new Date('2026-01-15T13:00:00.000Z'), release_reason: 'COMPLETED' });

    const retry = await accept(customer, secondProposal.id, 'pg-c4-accept-000003');
    expect(retry.status).toBe(200);
    expect(await assignmentRows()).toHaveLength(2);
  });

  test('C5 — disabling the service never blocks an existing accept', async () => {
    // SERVICE CATALOG — the catalog status gates NEW requests only. A
    // negotiation opened while ACTIVE must reach ASSIGNED even when the service
    // is disabled concurrently: there is no module gate on the accept path.
    const customer = await createCustomer('C5 Customer');
    const partner = await createTowPartner('C5 Partner');
    const towRequest = await createRequest(customer, 'pg-c5-request-000001');
    const proposal = await propose(partner, towRequest.id, 'pg-c5-prop-000001');

    const [acceptResponse] = await Promise.all([
      accept(customer, proposal.id, 'pg-c5-accept-000001'),
      services.moduleService.setEnabled({ enabled: false, reason: 'MVP-04 PG lifecycle' }),
    ]);

    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.data.state).toBe('ASSIGNED');
    expect(await assignmentRows()).toHaveLength(1);
    const [row] = await db('tow_requests').where({ id: towRequest.id }).select('state');
    expect(row.state).toBe('ASSIGNED');
  });

  test('C6 — concurrent creation by one partner for one request yields one proposal', async () => {
    const customer = await createCustomer('C6 Customer');
    const partner = await createTowPartner('C6 Partner');
    const towRequest = await createRequest(customer, 'pg-c6-request-000001');

    const responses = await Promise.all([1, 2, 3].map(
      (index) => request(app)
        .post(`/api/tow/requests/${towRequest.id}/proposals`)
        .set(partner.headers)
        .set('Idempotency-Key', `pg-c6-prop-00000${index}`)
        .send({})
    ));

    const created = responses.filter((response) => response.status === 201);
    expect(created.length).toBeGreaterThanOrEqual(1);
    expect(responses.filter((response) => response.status === 409).length)
      .toBe(responses.length - created.length);
    expect(await db('tow_request_proposals').select('*')).toHaveLength(1);
  });

  test('C7 — a referenced vehicle is protected by RESTRICT, and the delete answers 409', async () => {
    const customer = await createCustomer('C7 Customer');
    const partner = await createTowPartner('C7 Partner');
    const towRequest = await createRequest(customer, 'pg-c7-request-000001');
    const proposal = await propose(partner, towRequest.id, 'pg-c7-prop-000001');

    // The constraint, not the application, is the authority: a raw DELETE that
    // bypasses every guard must still be refused by the engine.
    let error = null;
    try {
      await db('tow_vehicles').where({ id: partner.vehicle.id }).del();
    } catch (raised) {
      error = raised;
    }
    expect(error).not.toBeNull();
    expect(error.code).toBe('23503');

    // ... and the API turns that refusal into the contract's 409, never a 500.
    const refused = await request(app)
      .delete(`/api/tow/vehicles/${partner.vehicle.id}`)
      .set(partner.headers);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('conflict');

    // Withdrawing the proposal does not free the vehicle: the FK is RESTRICT, not
    // "RESTRICT while ACTIVE", because the price the customer saw is history.
    // EXT-MVP04-2: the canonical `Idempotency-Key` header is required on withdraw,
    // so this direct service call supplies one exactly like the HTTP route does.
    const withdrawn = await services.proposalService.withdraw({
      partnerId: partner.partner.id,
      proposalId: proposal.id,
      idempotencyKey: 'idem-mvp04-pg-c7-withdraw-0001',
    });
    expect(withdrawn.status).toBe('WITHDRAWN');

    const stillPinned = await request(app)
      .delete(`/api/tow/vehicles/${partner.vehicle.id}`)
      .set(partner.headers);
    expect(stillPinned.status).toBe(409);
    expect(stillPinned.body.error.code).toBe('conflict');
    expect(await db('tow_vehicles').where({ id: partner.vehicle.id }).first()).toBeDefined();
  });

  test('C9 — a create blocked behind an uncommitted winner recovers through the index', async () => {
    const customer = await createCustomer('C9 Customer');
    const partner = await createTowPartner('C9 Partner');
    const firstRequest = await createRequest(customer, 'pg-c9-request-000001');
    const secondRequest = await createRequest(customer, 'pg-c9-request-000002');
    const key = 'pg-c9-prop-shared-0001';

    // A real proposal, only to copy a valid column set from: it is deleted
    // (committed) so the create below cannot replay it from a pre-read.
    const committed = await propose(partner, firstRequest.id, key);
    const template = await db('tow_request_proposals').where({ id: committed.id }).first();
    await db('tow_request_proposals').where({ id: committed.id }).del();

    // An UNCOMMITTED winner the pre-read of the create cannot see either. It is
    // the deleted row itself, so it carries the FIRST payload's digest (a replay
    // would be a lie) and lives on the FIRST request (so the one-active-per
    // (request, partner) partial index is not the rule at stake): the plain
    // (partner_id, idempotency_key) unique index is.
    const trx = await db.transaction();
    try {
      const { id, ...columns } = template;
      await trx('tow_request_proposals').insert({
        ...columns,
        // `jsonb` read back as a JS array: re-bind it as JSON text, never as a
        // PostgreSQL array literal.
        vehicle_supported_vehicle_classes: JSON.stringify(columns.vehicle_supported_vehicle_classes),
      });

      const pending = request(app)
        .post(`/api/tow/requests/${secondRequest.id}/proposals`)
        .set(partner.headers)
        .set('Idempotency-Key', key)
        .send({})
        // `.then` dispatches immediately: a supertest chain is lazy until awaited.
        .then((response) => response);

      expect(await waitForBlockedProposalInsert()).toBe(true);
      await trx.commit();

      const response = await pending;
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('idempotency_conflict');
      expect(await db('tow_request_proposals').select('*')).toHaveLength(1);
    } finally {
      if (!trx.isCompleted()) await trx.rollback();
    }
  });

  test('C8 — concurrent same-key different-payload creates: one proposal, one 409', async () => {
    const customer = await createCustomer('C8 Customer');
    const partner = await createTowPartner('C8 Partner');
    const firstRequest = await createRequest(customer, 'pg-c8-request-000001');
    const secondRequest = await createRequest(customer, 'pg-c8-request-000002');

    // Same partner, same key, two DIFFERENT requests. Both creates pass the
    // pre-read before either inserts, so the loser can only be decided by the
    // UNIQUE(partner_id, idempotency_key) index — and must then compare digests
    // and refuse instead of returning the winner's proposal as a replay.
    const responses = await Promise.all([firstRequest, secondRequest].map(
      (towRequest) => request(app)
        .post(`/api/tow/requests/${towRequest.id}/proposals`)
        .set(partner.headers)
        .set('Idempotency-Key', 'pg-c8-prop-shared-0001')
        .send({})
    ));

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const loser = responses.find((response) => response.status === 409);
    expect(loser.body.error.code).toBe('idempotency_conflict');
    expect(await db('tow_request_proposals').select('*')).toHaveLength(1);
  });
});

if (!enabled) {
  describe('MVP-04 PostgreSQL suite (skipped)', () => {
    test('enable with TOW_POSTGRES_E2E=1 and the disposable compose harness', () => {
      expect(postgres.isEnabled()).toBe(false);
    });
  });
}
