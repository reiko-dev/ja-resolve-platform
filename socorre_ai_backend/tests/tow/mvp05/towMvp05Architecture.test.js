/**
 * MVP-05 — architecture boundaries, schema authority and scope discipline.
 *
 * MVP-05 landed three new application services, three thin controllers, one
 * migration and eight routes. This suite asserts the invariants a later
 * refactor could silently break:
 *   - exactly the eight execution/tracking/cancellation routes are registered,
 *     and every still-unimplemented surface stays unrouted (the narrowed bans
 *     that used to live in the MVP-03/MVP-04 architecture suites moved HERE,
 *     to the delivery that now owns those paths);
 *   - Domain stays pure, Application never touches Knex/HTTP, HTTP stays thin;
 *   - the new services never consult the module gate, which is exactly why a
 *     disabled module can still drain the jobs already in flight;
 *   - migration 006 is the only authority for milestones, cancellation
 *     attribution and the single current tracking point;
 *   - the legacy tracking/payment/request subsystems stay isolated;
 *   - the eight MVP-05 operation ids exist in the canonical contract overlay.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const application = require('../../../src/modules/tow/application');
const domain = require('../../../src/modules/tow/domain');
const { loadRawDocuments, composeDocument, getByPointer } = require('../../helpers/towContract');

const TOW_SRC = path.resolve(__dirname, '../../../src/modules/tow');
const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');
const OVERLAY_CONTRACT = path.join(REPO_ROOT, 'docs/tow/tow-api-contract.openapi.yaml');
const BASE_CONTRACT = path.join(REPO_ROOT, 'docs/tow/tow-api-contract.base.openapi.yaml');
const MIGRATION_PATH = path.join(BACKEND_ROOT, 'database/migrations/006_mvp05_service_execution_tracking.js');

function listFiles(root, predicate) {
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(full, predicate));
    else if (predicate(full)) found.push(full);
  }
  return found;
}

function read(absolutePath) {
  return fs.readFileSync(absolutePath, 'utf8');
}

/** Comments stripped: naming a legacy surface in prose is not using it. */
function readCode(absolutePath) {
  return read(absolutePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

function relative(absolutePath) {
  return path.relative(BACKEND_ROOT, absolutePath);
}

const ALL_TOW_SRC_FILES = listFiles(TOW_SRC, (file) => file.endsWith('.js'));
const DOMAIN_FILES = listFiles(path.join(TOW_SRC, 'domain'), (file) => file.endsWith('.js'));
const APPLICATION_FILES = listFiles(path.join(TOW_SRC, 'application'), (file) => file.endsWith('.js'));
const HTTP_FILES = listFiles(path.join(TOW_SRC, 'http'), (file) => file.endsWith('.js'));

const MVP05_SERVICE_FILES = [
  'application/execution-service.js',
  'application/tracking-service.js',
  'application/cancellation-service.js',
].map((name) => path.join(TOW_SRC, name));

const ROUTES = read(path.join(TOW_SRC, 'http/routes.js'));

describe('MVP-05 ARCH — the eight MVP-05 routes, and nothing else', () => {
  test('the four partner milestones are registered as POSTs, partner-only', () => {
    expect(ROUTES).toContain("router.post('/requests/:requestId/en-route', auth, requireTowPartner, executionController.startEnRoute);");
    expect(ROUTES).toContain("router.post('/requests/:requestId/arrived', auth, requireTowPartner, executionController.markArrived);");
    expect(ROUTES).toContain("router.post('/requests/:requestId/in-transit', auth, requireTowPartner, executionController.startInTransit);");
    expect(ROUTES).toContain("router.post('/requests/:requestId/finish', auth, requireTowPartner, executionController.finishService);");
  });

  test('both cancellations are registered with their own role', () => {
    expect(ROUTES).toContain("router.post('/requests/:requestId/cancel', auth, requireCustomer, cancellationController.cancelByCustomer);");
    expect(ROUTES).toContain("router.post('/requests/:requestId/cancel-partner', auth, requireTowPartner, cancellationController.cancelByPartner);");
  });

  test('tracking is a write (partner) and a read (customer OR assigned partner)', () => {
    expect(ROUTES).toContain("router.get('/requests/:requestId/tracking', auth, requireCustomerOrTowPartner, trackingController.read);");
    expect(ROUTES).toContain("router.post('/requests/:requestId/tracking', auth, requireTowPartner, trackingController.write);");
  });

  test('no still-unimplemented surface leaked in', () => {
    // These bans were narrowed out of the MVP-03/MVP-04 architecture suites when
    // MVP-05 landed (those deliveries no longer own the paths). Everything here
    // is unimplemented in EVERY delivery: counteroffer, destination change,
    // completion/dispute/review, payments, partner presence, tracking history,
    // ETA and the legacy global partner-location push endpoint.
    for (const forbidden of [
      '/counteroffer', '/destination', '/completion', '/dispute', '/review',
      '/payments', '/partner/status', '/partner/location', '/history', '/eta',
    ]) {
      expect(ROUTES).not.toContain(forbidden);
    }
    // The legacy endpoint was a PUT; MVP-05 tracks per request instead.
    expect(ROUTES).not.toMatch(/router\.(put|patch)\(\s*['"][^'"]*location/);
  });

  test('no WebSocket or scheduler surface exists anywhere in the module', () => {
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => /\b(WebSocket|socket\.io|setInterval|setTimeout|cron|schedule)\b/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });
});

describe('MVP-05 ARCH — layering', () => {
  test('Domain is pure: no Knex, no Express, no infrastructure require', () => {
    const offenders = DOMAIN_FILES
      .filter((file) => /require\(['"][^'"]*(knex|express|config\/database|adapters)[^'"]*['"]\)/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('Application owns the rules and never touches Knex, Express or adapters', () => {
    const offenders = APPLICATION_FILES
      .filter((file) => /require\(['"][^'"]*(knex|express|adapters\/)[^'"]*['"]\)/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('HTTP is thin: controllers never query the database directly', () => {
    const offenders = HTTP_FILES
      .filter((file) => /connection\(|knex\(/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('the new services are wired through composition, not required by HTTP', () => {
    const composition = read(path.join(TOW_SRC, 'composition.js'));
    for (const factory of ['createExecutionService', 'createTrackingService', 'createCancellationService']) {
      expect(composition).toContain(factory);
    }
    const offenders = HTTP_FILES
      .filter((file) => /require\(['"][^'"]*application\/(execution|tracking|cancellation)-service/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });
});

describe('MVP-05 ARCH — graceful drain is structural, not incidental', () => {
  test('no execution/tracking/cancellation service consults the module gate', () => {
    // `assertNewBusinessAllowed` is what makes a disabled module refuse NEW
    // business. In-flight jobs must still be executable, so these three
    // services must never call it — a later "consistency" refactor that adds
    // the gate here would silently break the graceful-drain contract.
    const offenders = MVP05_SERVICE_FILES
      .filter((file) => /assertNewBusinessAllowed/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('the request/proposal write paths still DO consult the gate', () => {
    // The other half of the same contract: disable must still refuse new work.
    const requestService = readCode(path.join(TOW_SRC, 'application/tow-request-service.js'));
    const proposalService = readCode(path.join(TOW_SRC, 'application/proposal-service.js'));
    expect(requestService).toContain('assertNewBusinessAllowed');
    expect(proposalService).toContain('assertNewBusinessAllowed');
  });

  test('the module gate exposes the drain contract the tests pin', () => {
    const moduleService = application.createModuleService
      ? read(path.join(TOW_SRC, 'application/module-service.js'))
      : null;
    expect(moduleService).not.toBeNull();
    expect(moduleService).toContain('GRACEFUL_DRAIN_CONTRACT');
  });
});

describe('MVP-05 ARCH — the state machine graph is the only transition authority', () => {
  test('the execution graph is exported and covers exactly the four milestones', () => {
    // One edge per milestone, plus the cancellation edge from every state where
    // cancelling is still legal — and none from IN_TRANSIT or a terminal state.
    const forward = Object.fromEntries(
      Object.entries(domain.TOW_EXECUTION_TRANSITIONS)
        .map(([from, edges]) => [from, Object.entries(edges).find(([to]) => to !== 'CANCELLED')])
        .filter(([, edge]) => Boolean(edge)),
    );
    expect(Object.fromEntries(Object.entries(forward).map(([from, edge]) => [from, edge[0]]))).toEqual({
      ASSIGNED: 'EN_ROUTE',
      EN_ROUTE: 'ARRIVED',
      ARRIVED: 'IN_TRANSIT',
      IN_TRANSIT: 'COMPLETED',
    });
    expect(Object.fromEntries(Object.entries(forward).map(([from, edge]) => [from, edge[1]]))).toEqual({
      ASSIGNED: 'start_en_route',
      EN_ROUTE: 'mark_arrived',
      ARRIVED: 'start_in_transit',
      IN_TRANSIT: 'finish_service',
    });
    for (const from of ['ASSIGNED', 'EN_ROUTE', 'ARRIVED']) {
      expect(domain.TOW_EXECUTION_TRANSITIONS[from].CANCELLED).toBe('cancel');
    }
    expect(domain.TOW_EXECUTION_TRANSITIONS.IN_TRANSIT.CANCELLED).toBeUndefined();
    expect(domain.TOW_EXECUTION_TRANSITIONS.COMPLETED).toEqual({});
    expect(domain.TOW_EXECUTION_TRANSITIONS.CANCELLED).toEqual({});
  });

  test('the milestone column map is derived from the graph, not hand-written', () => {
    const source = readCode(path.join(TOW_SRC, 'domain/tow-request-state-machine.js'));
    // Every state of the graph has a milestone column, and the map is built by
    // reducing over the graph rather than listing states twice.
    expect(domain.MILESTONE_COLUMN_BY_STATE).toEqual({
      EN_ROUTE: 'en_route_at',
      ARRIVED: 'arrived_at',
      IN_TRANSIT: 'in_transit_at',
      COMPLETED: 'completed_at',
      CANCELLED: 'cancelled_at',
    });
    expect(source).toMatch(/Object\.(entries|keys|values)\(TOW_EXECUTION_TRANSITIONS\)/);
  });

  test('the cancellation graph refuses IN_TRANSIT and every terminal state', () => {
    expect(domain.CANCELLABLE_TOW_REQUEST_STATES).toEqual(['ASSIGNED', 'EN_ROUTE', 'ARRIVED']);
    for (const state of ['IN_TRANSIT', 'COMPLETED']) {
      expect(domain.classifyTransition(state, 'CANCELLED')).toBe(domain.TRANSITION_OUTCOMES.ILLEGAL);
    }
    for (const state of ['ASSIGNED', 'EN_ROUTE', 'ARRIVED']) {
      expect(domain.classifyTransition(state, 'CANCELLED')).toBe(domain.TRANSITION_OUTCOMES.APPLY);
    }
    expect(domain.classifyTransition('CANCELLED', 'CANCELLED')).toBe(domain.TRANSITION_OUTCOMES.REPLAY);
    expect(domain.classifyTransition('COMPLETED', 'COMPLETED')).toBe(domain.TRANSITION_OUTCOMES.REPLAY);
    expect(domain.classifyTransition('COMPLETED', 'CANCELLED')).toBe(domain.TRANSITION_OUTCOMES.ILLEGAL);
  });

  test('the two cancellation reasons are distinct terminal reasons', () => {
    expect(domain.terminalReasonForCancellation('customer')).toBe('CUSTOMER_CANCELLED');
    expect(domain.terminalReasonForCancellation('partner')).toBe('PARTNER_CANCELLED');
    expect(domain.RELEASE_REASON_BY_TERMINAL_STATE.COMPLETED).toBe('COMPLETED');
    expect(domain.RELEASE_REASON_BY_TERMINAL_STATE.CANCELLED).toBe('CANCELLED');
  });
});

describe('MVP-05 ARCH — migration 006 is the schema authority', () => {
  test('it adds exactly the eight milestone/cancellation columns', () => {
    const code = read(MIGRATION_PATH);
    const declared = [...code.matchAll(/table\.\w+\(\s*'([a-z_]+)'/g)].map((match) => match[1]);
    // The ALTER comes first: exactly the eight new `tow_requests` columns.
    expect(declared.slice(0, 8)).toEqual([
      'en_route_at', 'arrived_at', 'in_transit_at', 'completed_at', 'cancelled_at',
      'cancelled_by_actor_type', 'cancelled_by_actor_id', 'cancellation_reason',
    ]);
    // ... and `down()` removes exactly the same eight.
    expect(declared.slice(-8)).toEqual(declared.slice(0, 8));
    // The tracking table owns its own six columns.
    expect(new Set(declared.slice(8, 15))).toEqual(new Set([
      'id', 'tow_request_id', 'partner_id', 'latitude', 'longitude', 'observed_at', 'received_at',
    ]));
  });

  test('it creates the single current tracking point and drops only it', () => {
    const code = read(MIGRATION_PATH);
    expect(code).toMatch(/createTable\(\s*'tow_request_tracking'/);
    expect(code).toMatch(/unique\(\s*\[[^\]]*'tow_request_id'[^\]]*\]\s*,\s*'tow_request_tracking_tow_request_id_unique'\s*\)/);
    const dropped = [...code.matchAll(/dropTableIfExists\(\s*'([^']+)'/g)].map((match) => match[1]);
    expect(dropped).toEqual(['tow_request_tracking']);
  });

  test('the milestone/terminal coherence CHECKs are PostgreSQL-only and cover both terminals', () => {
    const code = read(MIGRATION_PATH);
    expect(code).toMatch(/isPostgres\(knex\)/);
    // `up()` and `down()` read the SAME exported list, so a rollback can never
    // drop a different set of constraints than the one that was installed.
    expect(code).toMatch(/const REQUEST_CHECK_CONSTRAINTS = \[/);
    expect(code).toContain('for (const [name, condition] of REQUEST_CHECK_CONSTRAINTS)');
    expect(code).toContain('for (const [name] of [...REQUEST_CHECK_CONSTRAINTS].reverse())');
    expect(code).toMatch(/ADD CONSTRAINT \$\{name\} CHECK \(\$\{condition\}\)/);
    expect(code).toMatch(/DROP CONSTRAINT IF EXISTS \$\{name\}/);
    // Both terminals are pinned by a real EQUIVALENCE, in both directions.
    expect(code).toContain("(state = 'COMPLETED') = (completed_at IS NOT NULL)");
    expect(code).toContain("(state = 'CANCELLED') = (cancelled_at IS NOT NULL)");
    // Ordering is enforced, not assumed: a milestone can never precede its cause.
    for (const pair of [
      ['arrived_at', 'en_route_at'],
      ['in_transit_at', 'arrived_at'],
      ['completed_at', 'in_transit_at'],
    ]) {
      expect(code).toContain(`${pair[0]} IS NULL OR (${pair[1]} IS NOT NULL AND ${pair[0]} >= ${pair[1]})`);
    }
  });

  test('the actor vocabulary is a single exported constant', () => {
    const migration = require('../../../database/migrations/006_mvp05_service_execution_tracking');
    expect(migration.CANCELLATION_ACTOR_TYPES).toEqual(['customer', 'partner']);
    expect(domain.isCancellationActorType('customer')).toBe(true);
    expect(domain.isCancellationActorType('partner')).toBe(true);
    expect(domain.isCancellationActorType('admin')).toBe(false);
    expect(domain.isCancellationActorType(null)).toBe(false);
  });

  test('the migration is registered everywhere the schema is pinned', () => {
    const pins = [
      'scripts/tow/run-db-baseline-gate.js',
      'tests/tow/baseline/dbBaseline.e2e.test.js',
      'tests/tow/baseline/dbBaselineSafety.test.js',
    ];
    for (const pin of pins) {
      expect(read(path.join(BACKEND_ROOT, pin))).toContain('006_mvp05_service_execution_tracking.js');
    }
  });

  test('the offline harness mirrors the new columns and table', () => {
    const harness = read(path.join(BACKEND_ROOT, 'tests/helpers/testDb.js'));
    for (const column of [
      'en_route_at', 'arrived_at', 'in_transit_at', 'completed_at', 'cancelled_at',
      'cancelled_by_actor_type', 'cancelled_by_actor_id', 'cancellation_reason',
    ]) {
      expect(harness).toContain(column);
    }
    expect(harness).toContain('tow_request_tracking');
  });
});

describe('MVP-05 ARCH — legacy isolation', () => {
  test('no legacy tracking/payment/request table is referenced by the module', () => {
    // `real_time_tracking` is the LEGACY_LIVE tracking table; MVP-05 tracks in
    // `tow_request_tracking` and must never inherit the legacy one.
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => /['"](real_time_tracking|tow_tracking|emergency_requests|tow_proposals|payments|wallets|disputes)['"]/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('the tracking read never calls a route/ETA provider', () => {
    // The route is read from the canonical request columns; the provider is a
    // matching-time dependency only, so reading tracking must not consume it.
    const source = readCode(path.join(TOW_SRC, 'application/tracking-service.js'));
    expect(source).not.toMatch(/routeProvider/);
  });

  test('the tracking repository is the only writer of the current point', () => {
    const writers = ALL_TOW_SRC_FILES
      .filter((file) => /['"]tow_request_tracking['"]/.test(readCode(file)))
      .map(relative);
    expect(writers).toEqual(['src/modules/tow/adapters/persistence/tracking-repository.js']);
  });
});

describe('MVP-05 ARCH — the canonical contract owns the surface', () => {
  const overlay = read(OVERLAY_CONTRACT);
  const base = read(BASE_CONTRACT);
  // Parsed, not pattern-matched: the error vocabulary is a flow sequence, and
  // the suites must read the composed document the runtime is measured against.
  const documents = loadRawDocuments();
  const { composed } = composeDocument(documents);

  test('the overlay composes the base by $ref and stays a composition, not a copy', () => {
    expect(overlay).toContain("$ref: './tow-api-contract.base.openapi.yaml#/paths/~1tow~1module-status'");
    expect(overlay).toContain("$ref: './tow-api-contract.base.openapi.yaml#/components/schemas/TowRequestState'");
    expect(base).toContain('openapi: 3.1.0');
    expect(base).toContain('version: 1.0.0-draft.2');
  });

  test('all eight MVP-05 operation ids are re-declared in the overlay', () => {
    for (const operationId of [
      'startTowEnRoute', 'markTowArrived', 'startTowInTransit', 'finishTowService',
      'cancelTowRequestByCustomer', 'cancelTowRequestByPartner',
      'getTowTracking', 'postTowTrackingPoint',
    ]) {
      expect(overlay).toContain(`operationId: ${operationId}`);
    }
  });

  test('the overlay declares the MVP-05 error code the runtime actually emits', () => {
    // `stale_tracking_update` is the consumer-visible error code MVP-05 adds;
    // draft.8 also declares `partner_not_operational`, an inherited code the
    // runtime has returned since MVP-04 without the contract declaring it.
    expect(overlay).toContain('stale_tracking_update');
    for (const code of ['invalid_tow_state', 'invalid_tow_transition', 'not_assigned_partner']) {
      expect(overlay).toContain(code);
    }
  });

  test('every error code the runtime can emit is declared by the contract', () => {
    const { found, value } = getByPointer(
      composed,
      '/components/schemas/ErrorResponse/properties/error/properties/code',
    );
    expect(found).toBe(true);
    const declared = new Set(value.enum);
    for (const code of Object.keys(domain.ERROR_STATUS)) {
      expect({ code, declared: declared.has(code) }).toEqual({ code, declared: true });
    }
  });
});
