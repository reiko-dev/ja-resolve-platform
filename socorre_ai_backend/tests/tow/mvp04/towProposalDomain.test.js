/**
 * MVP-04 — proposal + assignment domain vocabulary and invariants (pure unit).
 *
 * Proves the canonical status enum, the frozen server-priced input shape
 * (`additionalProperties: false`, no client price/distance/identity), the
 * action-time expiry rule and the assignment occupancy predicate.
 *
 * RED-first: written before `domain/tow-proposal.js` and `domain/assignment.js`
 * exist.
 */
'use strict';

const {
  TOW_PROPOSAL_STATUSES,
  INITIAL_TOW_PROPOSAL_STATUS,
  ACTIONABLE_PROPOSAL_STATUSES,
  FORBIDDEN_PROPOSAL_INPUT_KEYS,
  isTowProposalId,
  validateCreateTowProposalInput,
  isProposalExpired,
  assertProposalActionable,
  buildTowProposalRecord,
  buildTowProposalDto,
  canonicalProposalFingerprintSource,
} = require('../../../src/modules/tow/domain/tow-proposal');
const {
  isTowAssignmentId,
  isAssignmentOccupied,
  buildAssignmentRecord,
  buildAssignmentDto,
} = require('../../../src/modules/tow/domain/assignment');
const { isTowError } = require('../../../src/modules/tow/domain/errors');
const domain = require('../../../src/modules/tow/domain');

const NOW = new Date('2026-01-15T12:00:00.000Z');

function codeOf(fn) {
  try {
    fn();
  } catch (error) {
    return isTowError(error) ? error.code : `NOT_TOW_ERROR:${error.message}`;
  }
  return 'NO_THROW';
}

describe('MVP-04 DOMAIN — proposal vocabulary', () => {
  test('the canonical status enum matches the frozen contract', () => {
    expect(TOW_PROPOSAL_STATUSES).toEqual([
      'ACTIVE', 'COUNTERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'CLOSED',
    ]);
    expect(Object.isFrozen(TOW_PROPOSAL_STATUSES)).toBe(true);
  });

  test('a new proposal is ACTIVE and ACTIVE is the only actionable status', () => {
    expect(INITIAL_TOW_PROPOSAL_STATUS).toBe('ACTIVE');
    expect(ACTIONABLE_PROPOSAL_STATUSES).toEqual(['ACTIVE']);
  });

  test('the domain barrel exports the new proposal + assignment vocabulary', () => {
    expect(domain.TOW_PROPOSAL_STATUSES).toBe(TOW_PROPOSAL_STATUSES);
    expect(typeof domain.buildTowProposalDto).toBe('function');
    expect(typeof domain.buildAssignmentDto).toBe('function');
    expect(typeof domain.isAssignmentOccupied).toBe('function');
  });

  test('ids are accepted as integers or digit strings and rejected otherwise', () => {
    expect(isTowProposalId(1)).toBe(true);
    expect(isTowProposalId('42')).toBe(true);
    expect(isTowProposalId(' 7 ')).toBe(true);
    expect(isTowProposalId(0)).toBe(false);
    expect(isTowProposalId(-1)).toBe(false);
    expect(isTowProposalId(1.5)).toBe(false);
    expect(isTowProposalId('abc')).toBe(false);
    expect(isTowProposalId('1;DROP TABLE')).toBe(false);
    expect(isTowProposalId(null)).toBe(false);
    expect(isTowAssignmentId('3')).toBe(true);
    expect(isTowAssignmentId('x')).toBe(false);
  });
});

describe('MVP-04 DOMAIN — the create body is empty by contract', () => {
  test('an empty body is accepted and normalized to an empty object', () => {
    expect(validateCreateTowProposalInput({})).toEqual({});
    expect(validateCreateTowProposalInput(undefined)).toEqual({});
    expect(validateCreateTowProposalInput(null)).toEqual({});
  });

  test.each(FORBIDDEN_PROPOSAL_INPUT_KEYS)('client-supplied %s is rejected', (key) => {
    expect(codeOf(() => validateCreateTowProposalInput({ [key]: 1 }))).toBe('validation_error');
  });

  test('the forbidden key list covers every client price/distance/identity field', () => {
    expect(FORBIDDEN_PROPOSAL_INPUT_KEYS).toEqual(expect.arrayContaining([
      'proposed_price', 'price', 'amount', 'amount_cents', 'route_distance',
      'estimated_price', 'tariff', 'partner_id', 'tow_vehicle_id',
    ]));
  });

  test('an unknown key is rejected even when it looks harmless', () => {
    expect(codeOf(() => validateCreateTowProposalInput({ message: 'pick me' }))).toBe('validation_error');
    expect(codeOf(() => validateCreateTowProposalInput({ expires_at: '2030-01-01T00:00:00.000Z' })))
      .toBe('validation_error');
  });
});

describe('MVP-04 DOMAIN — action-time expiry', () => {
  test('a proposal is expired exactly when now is not before expires_at', () => {
    const expiresAt = new Date('2026-01-15T12:10:00.000Z');
    expect(isProposalExpired({ expires_at: expiresAt }, NOW)).toBe(false);
    expect(isProposalExpired({ expires_at: expiresAt }, new Date('2026-01-15T12:09:59.999Z'))).toBe(false);
    expect(isProposalExpired({ expires_at: expiresAt }, expiresAt)).toBe(true);
    expect(isProposalExpired({ expires_at: expiresAt }, new Date('2026-01-15T12:00:01.000Z'.replace('12:00', '12:11')))).toBe(true);
  });

  test('expiry is evaluated at action time, never from a cached status', () => {
    const proposal = { status: 'ACTIVE', expires_at: new Date('2026-01-15T12:10:00.000Z') };
    expect(codeOf(() => assertProposalActionable(proposal, NOW))).toBe('NO_THROW');
    expect(codeOf(() => assertProposalActionable(proposal, new Date('2026-01-15T12:10:00.000Z'))))
      .toBe('proposal_expired');
  });

  test('a non-ACTIVE proposal is not actionable and reports the stable code', () => {
    for (const status of ['ACCEPTED', 'CLOSED', 'WITHDRAWN', 'EXPIRED', 'REJECTED', 'COUNTERED']) {
      expect(codeOf(() => assertProposalActionable(
        { status, expires_at: new Date('2026-01-15T12:10:00.000Z') },
        NOW,
      ))).toBe('proposal_not_actionable');
    }
  });

  test('a missing proposal is not actionable (never a 500)', () => {
    expect(codeOf(() => assertProposalActionable(null, NOW))).toBe('proposal_not_actionable');
  });
});

describe('MVP-04 DOMAIN — record and DTO shapes', () => {
  const ROUTE_QUOTE = Object.freeze({
    provider_to_pickup: Object.freeze({ distance_meters: 3000, duration_seconds: 600 }),
    pickup_to_destination: Object.freeze({ distance_meters: 5400, duration_seconds: 720 }),
    total_distance_meters: 8400,
    total_duration_seconds: 1320,
    encoded_polyline: 'abc',
  });
  const TARIFF = Object.freeze({
    minimum_charge_cents: 15000,
    included_km: 10,
    included_meters: 10000,
    price_per_additional_km_cents: 800,
  });
  const VEHICLE = Object.freeze({
    id: 9,
    plate: 'PLT0001',
    make: 'Ford',
    model: 'F-4000',
    year: 2020,
    equipment_type: 'flatbed',
    supported_vehicle_classes: ['light_vehicle'],
    max_towed_weight_kg: 4000,
    document_status: 'approved',
    active: true,
  });

  function record() {
    return buildTowProposalRecord({
      tow_request_id: 1,
      partner_id: 2,
      tow_vehicle_id: 9,
      route_quote: ROUTE_QUOTE,
      pricing_snapshot: TARIFF,
      price: { amount_cents: 15000, currency: 'BRL' },
      vehicle_snapshot: VEHICLE,
      expires_at: new Date('2026-01-15T12:10:00.000Z'),
      idempotency_key: 'idem-mvp04-prop-000001',
      created_at: NOW,
      updated_at: NOW,
    });
  }

  test('the record freezes the whole snapshot and defaults to ACTIVE', () => {
    const row = record();
    expect(row.status).toBe('ACTIVE');
    expect(row.price_amount_cents).toBe(15000);
    expect(row.price_currency).toBe('BRL');
    expect(row.route_total_distance_meters).toBe(8400);
    expect(row.route_provider_to_pickup_distance_meters).toBe(3000);
    expect(row.route_pickup_to_destination_distance_meters).toBe(5400);
    expect(row.pricing_included_meters).toBe(10000);
    expect(row.vehicle_plate).toBe('PLT0001');
    expect(row.vehicle_max_towed_weight_kg).toBe(4000);
    expect(row.vehicle_document_status).toBe('approved');
    expect(row.vehicle_active).toBe(true);
    expect(row.decided_at).toBeNull();
    // The DIGEST is the adapter's: `node:crypto` must never enter Domain, so the
    // record carries only the transient idempotency key. The adapter hashes
    // `canonicalProposalFingerprintSource` and persists the 64-hex digest.
    expect(row.idempotency_key).toBe('idem-mvp04-prop-000001');
    expect(row).not.toHaveProperty('idempotency_fingerprint');
  });

  test('the fingerprint source is the (partner, request, vehicle) triple', () => {
    // The create body is always empty, so the price is not a client input and
    // cannot be part of the source. The only degree of freedom a partner has is
    // WHICH vehicle it offers: a retry with another vehicle is a different
    // attempt (the frozen contract then requires `idempotency_conflict`).
    const a = canonicalProposalFingerprintSource({ tow_request_id: 1, partner_id: 2, tow_vehicle_id: 9 });
    const b = canonicalProposalFingerprintSource({ tow_request_id: '1', partner_id: '2', tow_vehicle_id: '9' });
    const c = canonicalProposalFingerprintSource({ tow_request_id: 1, partner_id: 2, tow_vehicle_id: 10 });
    const d = canonicalProposalFingerprintSource({ tow_request_id: 1, partner_id: 3, tow_vehicle_id: 9 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
    // It is a SOURCE, not a digest: no hashing happens in Domain.
    expect(a).toContain('tow_vehicle_id');
  });

  test('the DTO is contract-shaped: string ids, Money, RouteQuote, TowVehicleSummary', () => {
    const dto = buildTowProposalDto({
      ...record(),
      id: 77,
      created_at: NOW,
      expires_at: new Date('2026-01-15T12:10:00.000Z'),
      partner_business_name: 'Guincho Paulista',
    });

    expect(dto.id).toBe('77');
    expect(dto.request_id).toBe('1');
    expect(dto.partner_id).toBe('2');
    expect(dto.status).toBe('ACTIVE');
    expect(dto.price).toEqual({ amount_cents: 15000, currency: 'BRL' });
    expect(dto.route_quote).toEqual({
      provider_to_pickup: { distance_meters: 3000, duration_seconds: 600 },
      pickup_to_destination: { distance_meters: 5400, duration_seconds: 720 },
      total_distance_meters: 8400,
      total_duration_seconds: 1320,
    });
    expect(dto.tow_vehicle).toEqual({
      id: '9',
      plate: 'PLT0001',
      make: 'Ford',
      model: 'F-4000',
      year: 2020,
      equipment_type: 'flatbed',
      supported_vehicle_classes: ['light_vehicle'],
      max_towed_weight_kg: 4000,
      document_status: 'approved',
      active: true,
    });
    expect(dto.partner).toEqual({ display_name: 'Guincho Paulista' });
    expect(dto.counteroffer).toBeNull();
    expect(dto.expires_at).toBe('2026-01-15T12:10:00.000Z');
    expect(dto.created_at).toBe('2026-01-15T12:00:00.000Z');
    // No persistence-only column leaks into the contract DTO.
    for (const forbidden of [
      'idempotency_key', 'idempotency_fingerprint', 'tow_request_id', 'tow_vehicle_id',
      'price_amount_cents', 'route_total_distance_meters', 'pricing_included_meters',
      'decided_at', 'vehicle_plate', 'vehicle_active',
    ]) {
      expect(dto).not.toHaveProperty(forbidden);
    }
  });

  test('a proposal without a stored partner name omits the optional partner member', () => {
    const dto = buildTowProposalDto({ ...record(), id: 1 });
    expect(dto.partner).toBeUndefined();
  });

  test('a stored total that disagrees with its legs is refused, never emitted', () => {
    expect(codeOf(() => buildTowProposalDto({
      ...record(),
      id: 1,
      route_total_distance_meters: 9999,
    }))).toBe('validation_error');
  });
});

describe('MVP-04 DOMAIN — assignment record and occupancy', () => {
  function assignmentRecord() {
    return buildAssignmentRecord({
      tow_request_id: 1,
      proposal_id: 77,
      partner_id: 2,
      tow_vehicle_id: 9,
      final_price: { amount_cents: 15000, currency: 'BRL' },
      vehicle_snapshot: { plate: 'PLT0001' },
      assigned_at: NOW,
      created_at: NOW,
      updated_at: NOW,
    });
  }

  test('the assignment freezes the winning snapshot and starts unreleased', () => {
    const row = assignmentRecord();
    expect(row.final_price_amount_cents).toBe(15000);
    expect(row.final_price_currency).toBe('BRL');
    expect(row.released_at).toBeNull();
    expect(row.release_reason).toBeNull();
    expect(row.vehicle_plate).toBe('PLT0001');
    expect(isAssignmentOccupied(row)).toBe(true);
  });

  test('the assignment never duplicates the proposal snapshot it points at', () => {
    // `proposal_id` is the provenance link (and the UNIQUE idempotency key of
    // the accept). The route, the tariff and the vehicle description stay on the
    // proposal row: one snapshot, one authority, no chance of divergence.
    const row = assignmentRecord();
    expect(row.proposal_id).toBe(77);
    for (const forbidden of [
      'route_total_distance_meters', 'route_total_duration_seconds',
      'route_quote', 'pricing_snapshot', 'pricing_minimum_charge_cents',
      'pricing_included_meters', 'vehicle_make', 'vehicle_equipment_type',
    ]) {
      expect(row).not.toHaveProperty(forbidden);
    }
  });

  test('a released assignment no longer occupies', () => {
    const row = { ...assignmentRecord(), released_at: new Date('2026-01-16T00:00:00.000Z'), release_reason: 'COMPLETED' };
    expect(isAssignmentOccupied(row)).toBe(false);
  });

  test('the DTO is the contract Assignment: partner, vehicle, final price, assigned_at', () => {
    const dto = buildAssignmentDto({ ...assignmentRecord(), id: 5 });
    expect(dto).toEqual({
      partner_id: '2',
      tow_vehicle_id: '9',
      final_price: { amount_cents: 15000, currency: 'BRL' },
      assigned_at: '2026-01-15T12:00:00.000Z',
    });
  });
});
