/**
 * MVP-04 — architecture boundaries, atomicity authority, migration registration
 * and scope discipline.
 *
 * Asserts the invariants a later refactor could silently break:
 *   - the UNIQUE constraints of migration 005 are the only atomicity authority
 *     (no read-then-write, no application-level "check then insert");
 *   - Domain/Application still own every rule and never touch Knex/HTTP;
 *   - the legacy `tow_proposals` / `emergency_requests` subsystem stays isolated;
 *   - exactly the five MVP-04 lifecycle operations plus the canonical partner job
 *     rehydration route (EXT-MVP04-1) are routed, and no counteroffer / MVP-05 /
 *     scheduler surface leaked in;
 *   - the migration is registered everywhere the schema is pinned.
 *
 * RED-first: written before the MVP-04 sources exist.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const { PORT_NAMES } = require('../../../src/modules/tow/application/ports');
const domain = require('../../../src/modules/tow/domain');
const application = require('../../../src/modules/tow/application');
const { ERROR_STATUS } = require('../../../src/modules/tow/domain/errors');

const TOW_SRC = path.resolve(__dirname, '../../../src/modules/tow');
const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');
const CANONICAL_CONTRACT = path.join(REPO_ROOT, 'docs/tow/tow-api-contract.openapi.yaml');

const MIGRATION_PATH = path.join(BACKEND_ROOT, 'database/migrations/005_mvp04_proposals_assignments.js');

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

function readCode(absolutePath) {
  return read(absolutePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

function relative(absolutePath) {
  return path.relative(BACKEND_ROOT, absolutePath);
}

/** Comments stripped: naming a legacy table in prose is not mutating it. */
function readMigrationCode() {
  return read(MIGRATION_PATH)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const ALL_TOW_SRC_FILES = listFiles(TOW_SRC, (file) => file.endsWith('.js'));
const DOMAIN_AND_APPLICATION_FILES = listFiles(path.join(TOW_SRC, 'domain'), (file) => file.endsWith('.js'))
  .concat(listFiles(path.join(TOW_SRC, 'application'), (file) => file.endsWith('.js')));

describe('MVP-04 ARCH — the database is the atomicity authority', () => {
  test('migration 005 creates both canonical tables and drops only them', () => {
    const code = readMigrationCode();
    expect(code).toMatch(/createTable\(\s*['"]tow_request_proposals['"]/);
    expect(code).toMatch(/createTable\(\s*['"]tow_assignments['"]/);
    const dropped = [...code.matchAll(/dropTableIfExists\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
    expect(dropped.sort()).toEqual(['tow_assignments', 'tow_request_proposals']);
  });

  test('exactly one assignment per request is a UNIQUE constraint, not a code path', () => {
    const code = readMigrationCode();
    // `tow_assignments.tow_request_id` must be UNIQUE: it is the single
    // structural guarantee of "exactly one assignment ever".
    expect(code).toMatch(/table\.unique\(\s*\[\s*['"]tow_request_id['"]\s*\]/);
    // ... and one assignment per winning proposal (idempotent accept).
    expect(code).toMatch(/table\.unique\(\s*\[\s*['"]proposal_id['"]\s*\]/);
  });

  test('occupancy is enforced by partial unique indexes, never by a status column', () => {
    const code = readMigrationCode();
    // One live job per partner and per vehicle; released rows stop occupying.
    expect(code).toMatch(/partner_id[\s\S]{0,200}WHERE\s+released_at\s+IS\s+NULL/i);
    expect(code).toMatch(/tow_vehicle_id[\s\S]{0,200}WHERE\s+released_at\s+IS\s+NULL/i);
    // A partner holds at most one ACTIVE proposal per request.
    expect(code).toMatch(/status\s*=\s*'ACTIVE'/);
  });

  test('the proposal idempotency key is unique per partner', () => {
    const code = readMigrationCode();
    expect(code).toMatch(/table\.unique\(\s*\[\s*['"]partner_id['"]\s*,\s*['"]idempotency_key['"]\s*\]/);
    expect(code).toMatch(/idempotency_fingerprint/);
  });

  test('the proposal status vocabulary is pinned by a CHECK constraint', () => {
    const code = readMigrationCode();
    for (const status of domain.TOW_PROPOSAL_STATUSES) {
      expect(code).toContain(`'${status}'`);
    }
    expect(code).toMatch(/status_check/);
  });

  test('migration 005 never mutates the legacy subsystem nor an earlier table', () => {
    const code = readMigrationCode();
    expect(code).not.toMatch(/emergency_requests/);
    expect(code).not.toMatch(/\btow_proposals\b/);
    // The ban is on MUTATING an earlier table, not on the keyword: the SQLite
    // fallback legitimately uses `alterTable` on the table this migration just
    // created. Every table the migration touches must be one it owns.
    const owned = ['tow_request_proposals', 'tow_assignments'];
    const touched = [
      ...[...code.matchAll(/alterTable\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]),
      ...[...code.matchAll(/ALTER\s+TABLE\s+([a-z_]+)/gi)].map((match) => match[1]),
    ];
    expect(touched.length).toBeGreaterThan(0);
    expect(touched.every((table) => owned.includes(table))).toBe(true);
    expect(code).not.toMatch(/dropColumn|renameTable/);
  });

  test('the migrations are registered everywhere the schema is pinned', () => {
    const gate = read(path.join(BACKEND_ROOT, 'scripts/tow/run-db-baseline-gate.js'));
    expect(gate).toContain('005_mvp04_proposals_assignments.js');
    const baseline = read(path.join(BACKEND_ROOT, 'scripts/tow/db-baseline.js'));
    expect(baseline).toContain("'tow_request_proposals'");
    expect(baseline).toContain("'tow_assignments'");
    const safety = read(path.join(BACKEND_ROOT, 'tests/tow/baseline/dbBaselineSafety.test.js'));
    expect(safety).toContain('005_mvp04_proposals_assignments.js');
  });

  test('the SQLite harness mirrors both canonical tables', () => {
    const source = read(path.join(BACKEND_ROOT, 'tests/helpers/testDb.js'));
    expect(source).toContain("'tow_request_proposals'");
    expect(source).toContain("'tow_assignments'");
  });
});

describe('MVP-04 ARCH — purity and legacy isolation of the new files', () => {
  test.each([
    ['an express import', /require\(\s*['"]express['"]\s*\)/],
    ['a knex import', /require\(\s*['"]knex['"]\s*\)/],
    ['a crypto import', /require\(\s*['"](node:)?crypto['"]\s*\)/],
    ['an environment read', /process\.env/],
    ['a network call', /\bfetch\s*\(/],
  ])('Domain/Application contain no %s', (_label, pattern) => {
    const offenders = DOMAIN_AND_APPLICATION_FILES
      .filter((file) => pattern.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('the canonical flow never reads the legacy tables', () => {
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => /['"](emergency_requests|tow_proposals)['"]/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('occupancy is never derived from TowVehicle.active or partner availability', () => {
    // `active` describes the vehicle's operational configuration; `is_available`
    // describes a partner's willingness to receive NEW work. Neither may be used
    // to decide whether a partner is already on a job — that is `tow_assignments`.
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => {
        const code = readCode(file);
        return /is_available/.test(code) && /tow_assignments/.test(code);
      })
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('no scheduler, timer or cron is introduced', () => {
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => /\b(setInterval|setTimeout|cron|schedule)\b/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('the proposal never re-derives a price from a local distance', () => {
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => /\b(estimated_distance|fallback_distance|approx_distance|distance_factor|average_speed)\b/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('no lock primitive leaks outside the persistence adapters', () => {
    // `FOR UPDATE` is a PostgreSQL detail; Domain and Application must ask for a
    // lock through a port, never by emitting SQL.
    const offenders = DOMAIN_AND_APPLICATION_FILES
      .filter((file) => /forUpdate|for\s+update/i.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });
});

describe('MVP-04 ARCH — ports, barrels and error vocabulary', () => {
  test('the new ports are registered', () => {
    expect(PORT_NAMES).toContain('TowProposalRepository');
    expect(PORT_NAMES).toContain('AssignmentRepository');
  });

  test('the domain barrel exports the MVP-04 vocabulary', () => {
    for (const symbol of [
      'TOW_PROPOSAL_STATUSES', 'INITIAL_TOW_PROPOSAL_STATUS', 'ACTIONABLE_PROPOSAL_STATUSES',
      'FORBIDDEN_PROPOSAL_INPUT_KEYS', 'isTowProposalId', 'validateCreateTowProposalInput',
      'buildTowProposalRecord', 'buildTowProposalDto', 'isProposalExpired',
      'assertProposalActionable', 'canonicalProposalFingerprintSource',
      'isTowAssignmentId', 'isAssignmentOccupied', 'buildAssignmentRecord', 'buildAssignmentDto',
    ]) {
      expect(domain[symbol]).toBeDefined();
    }
  });

  test('the application barrel exports the new services', () => {
    expect(typeof application.createProposalService).toBe('function');
    expect(typeof application.createAssignmentService).toBe('function');
  });

  test('the MVP-04 error codes map to their frozen HTTP statuses', () => {
    expect(ERROR_STATUS.proposal_expired).toBe(409);
    expect(ERROR_STATUS.proposal_not_actionable).toBe(409);
    expect(ERROR_STATUS.request_already_assigned).toBe(409);
    expect(ERROR_STATUS.proposal_already_active).toBe(409);
    expect(ERROR_STATUS.not_request_owner).toBe(403);
    expect(ERROR_STATUS.service_module_disabled).toBe(409);
  });

  test('the module gate is still the FIRST check of every write path', () => {
    const proposalService = readCode(path.join(TOW_SRC, 'application/proposal-service.js'));
    const assignmentService = readCode(path.join(TOW_SRC, 'application/assignment-service.js'));
    expect(proposalService).toMatch(/assertNewBusinessAllowed/);
    expect(assignmentService).toMatch(/assertNewBusinessAllowed/);
    // Before any provider/pricing work in the create path.
    expect(proposalService.indexOf('assertNewBusinessAllowed'))
      .toBeLessThan(proposalService.indexOf('quoteTow'));
    // The accept path delegates its transactional body to `acceptWithin`, which is
    // declared first, so the whole-file offsets say nothing: the gate must run
    // inside `accept` BEFORE the unit of work is opened (a disabled module must
    // not even start a transaction).
    const acceptBody = assignmentService.slice(assignmentService.indexOf('async function accept('));
    expect(acceptBody.indexOf('assertNewBusinessAllowed')).toBeGreaterThanOrEqual(0);
    expect(acceptBody.indexOf('assertNewBusinessAllowed'))
      .toBeLessThan(acceptBody.indexOf('unitOfWork.run'));
    // ... and the transactional body is reachable only through `accept`.
    expect(assignmentService.match(/acceptWithin\(/g)).toHaveLength(2);
  });
});

describe('MVP-04 ARCH — scope discipline', () => {
  const ROUTES = read(path.join(TOW_SRC, 'http/routes.js'));

  test('exactly the five MVP-04 lifecycle operations plus partner job rehydration are routed', () => {
    expect(ROUTES).toContain("router.post('/requests/:requestId/proposals'");
    expect(ROUTES).toContain("router.get('/requests/:requestId/proposals'");
    expect(ROUTES).toContain("router.get('/partner/proposals'");
    expect(ROUTES).toContain("router.post('/proposals/:proposalId/accept'");
    expect(ROUTES).toContain("router.post('/proposals/:proposalId/withdraw'");
    // EXT-MVP04-1: the canonical `listPartnerTowJobs` operation
    // (`GET /tow/partner/jobs`) is now routed, partner-only.
    expect(ROUTES).toContain("router.get('/partner/jobs', auth, requireTowPartner");
  });

  test('no counteroffer, tracking, payment or MVP-05 route leaked in', () => {
    for (const forbidden of [
      '/counteroffer', '/assignment', '/cancel', '/destination', '/completion', '/dispute',
      '/review', '/payments', '/partner/status', '/partner/location', '/tracking',
      '/en-route', '/arrived', '/in-transit',
    ]) {
      expect(ROUTES).not.toContain(forbidden);
    }
  });

  test('no MVP-05 table is referenced by the Tow module', () => {
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => /['"](tow_payments|tow_audit_events|tow_request_snapshots|tow_tracking)['"]/.test(readCode(file)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  test('the counteroffer status is never written by the runtime', () => {
    // `COUNTERED` stays in the frozen enum (the contract is authoritative), but
    // MVP-04 has no counteroffer flow and must never reach that state.
    const offenders = ALL_TOW_SRC_FILES
      .filter((file) => /['"]COUNTERED['"]/.test(readCode(file)))
      .map(relative);
    // Only the enum owner may name it.
    expect(offenders).toEqual(['src/modules/tow/domain/tow-proposal.js']);
  });

  test('the five MVP-04 operation ids exist in the canonical contract', () => {
    const contract = read(CANONICAL_CONTRACT);
    for (const operationId of [
      'listTowRequestProposals', 'createTowProposal', 'acceptTowProposal',
      'withdrawTowProposal', 'listPartnerTowProposals',
    ]) {
      expect(contract).toContain(`operationId: ${operationId}`);
    }
  });

  test('the contract revision that adds proposal_already_active is recorded', () => {
    const contract = read(CANONICAL_CONTRACT);
    expect(contract).toContain('proposal_already_active');
    expect(contract).toContain('1.0.0-draft.7');
    const helper = read(path.join(BACKEND_ROOT, 'tests/helpers/towContract.js'));
    expect(helper).toContain("'proposal_already_active'");
  });
});
