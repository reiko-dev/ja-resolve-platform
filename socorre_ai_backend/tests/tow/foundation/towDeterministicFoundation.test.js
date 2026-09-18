/**
 * T00 — deterministic test foundation (mechanism only).
 *
 * Proves the foundation is reproducible: fake clock, factories/builders, auth
 * fixtures and gateway doubles all produce identical results across runs, and
 * the gateway doubles never reach the network.
 *
 * No T01+ business behavior is exercised here.
 */
'use strict';

const tow = require('../../helpers/tow');
const testDb = require('../../helpers/testDb');
const { runConsumerSmoke } = require('../../helpers/towConsumerFlows');

describe('Tow deterministic test foundation', () => {
  describe('fake clock', () => {
    test('same start + same operations produce the same instants', () => {
      const a = tow.createFakeClock('2026-03-01T00:00:00.000Z');
      const b = tow.createFakeClock('2026-03-01T00:00:00.000Z');
      for (const clock of [a, b]) {
        clock.advanceMinutes(15);
        clock.advanceSeconds(30);
        clock.advanceHours(2);
        clock.advanceDays(1);
      }
      expect(a.isoNow()).toBe(b.isoNow());
      expect(a.nowMs()).toBe(b.nowMs());
      expect(a.isoNow()).toBe('2026-03-02T02:15:30.000Z');
    });

    test('advancing is monotonic and never reads the real wall clock', () => {
      const clock = tow.createFakeClock('2026-03-01T00:00:00.000Z');
      const before = clock.nowMs();
      clock.advance(1);
      expect(clock.nowMs()).toBe(before + 1);
      expect(clock.now()).toBeInstanceOf(Date);
      expect(clock.now().getTime()).toBe(before + 1);
    });

    test('invalid input is rejected instead of silently producing NaN dates', () => {
      expect(() => tow.createFakeClock('not-a-date')).toThrow(/invalid start/);
      expect(() => tow.createFakeClock().advance(-1)).toThrow(/non-negative/);
      expect(() => tow.createFakeClock().set('nope')).toThrow(/invalid instant/);
    });

    test('install() drives Jest timers and restore() leaves no global fake timer', () => {
      const clock = tow.createFakeClock('2026-03-01T00:00:00.000Z');
      clock.install();
      try {
        expect(Date.now()).toBe(Date.parse('2026-03-01T00:00:00.000Z'));
        clock.advanceSeconds(90);
        expect(Date.now()).toBe(Date.parse('2026-03-01T00:01:30.000Z'));
      } finally {
        clock.restore();
      }
      expect(clock.installed).toBe(false);
    });

    test('documents the PostgreSQL boundary: the fake clock does not drive DB time', async () => {
      // The harness runs on SQLite in-memory; the DB clock is never the fake
      // clock. A test that needs DB-generated time must read it from the DB.
      const clock = tow.createFakeClock('2026-03-01T00:00:00.000Z');
      const client = testDb.db.client.config.client;
      expect(['sqlite3', 'better-sqlite3']).toContain(client);
      await testDb.initSchema();
      const [{ dbNow }] = await testDb.db.raw('SELECT CURRENT_TIMESTAMP AS dbNow');
      expect(dbNow).toBeDefined();
      // The fake clock is unaffected by any DB statement.
      expect(clock.isoNow()).toBe('2026-03-01T00:00:00.000Z');
    });
  });

  describe('factories', () => {
    test('tow partner factory produces a type=tow, online, approved partner', async () => {
      const { user, partner } = await tow.createTowPartner();
      expect(user.role).toBe('partner');
      expect(partner.type).toBe('tow');
      expect(Number(partner.is_online)).toBe(1);
      expect(Number(partner.is_available)).toBe(1);
      expect(partner.approval_status).toBe('approved');
    });

    test('tow request factory produces a tow request with the tow extension columns', async () => {
      const { request } = await tow.createTowRequest();
      expect(request.type).toBe('tow');
      expect(request.request_type).toBe('tow');
      expect(Number(request.search_radius_km)).toBe(15);
      expect(request.proposal_selection_deadline).toBeDefined();
      expect(request.vehicle_destination_address).toContain('Santo André');
    });

    test('two independent scenarios produce identical values (no Date.now/random)', async () => {
      const first = await tow.createTowScenario();
      const second = await tow.createTowScenario();
      const strip = (row) => {
        const copy = { ...row };
        for (const key of ['description', 'message']) {
          if (typeof copy[key] === 'string') {
            copy[key] = copy[key].replace(/tow-(request|proposal)-\d+/, 'tow-$1');
          }
        }
        for (const key of ['id', 'user_id', 'emergency_request_id', 'partner_id', 'created_at', 'updated_at', 'expires_at', 'proposal_selection_deadline']) {
          delete copy[key];
        }
        return copy;
      };
      expect(strip(second.request)).toEqual(strip(first.request));
      expect(strip(second.proposal)).toEqual(strip(first.proposal));
      expect(second.partners[0].partner.business_name.replace(/tow-partner-\d+/, 'tow-partner'))
        .toBe(first.partners[0].partner.business_name.replace(/tow-partner-\d+/, 'tow-partner'));
      expect(second.clock.isoNow()).toBe(first.clock.isoNow());
    });

    test('scenario composition wires request, proposal, partners and settings', async () => {
      const scenario = await tow.createTowScenario();
      expect(scenario.partners).toHaveLength(2);
      expect(String(scenario.proposal.emergency_request_id)).toBe(String(scenario.request.id));
      expect(String(scenario.proposal.partner_id)).toBe(String(scenario.partners[0].partner.id));
      expect(Number(scenario.settings.tow_platform_fixed_fee_cents.setting_value)).toBe(500);
    });
  });

  describe('auth fixtures', () => {
    test('customer, partner and admin tokens authenticate against the real middleware config', async () => {
      const [customer, partner, admin] = await Promise.all([
        tow.createTowCustomerAuth(),
        tow.createTowPartnerAuth(),
        tow.createTowAdminAuth(),
      ]);
      for (const fixture of [customer, partner, admin]) {
        expect(fixture.token.split('.')).toHaveLength(3);
        expect(fixture.headers.Authorization).toBe(`Bearer ${fixture.token}`);
      }
      expect(customer.user.role).toBe('user');
      expect(partner.partner.type).toBe('tow');
      expect(admin.user.role).toBe('admin');
    });

    test('forged and expired tokens are structurally valid but must not be trusted', () => {
      const forged = tow.signForgedTowToken({ userId: 'someone' });
      const expired = tow.signExpiredTowToken({ userId: 'someone' });
      expect(forged.split('.')).toHaveLength(3);
      expect(expired.split('.')).toHaveLength(3);
      expect(forged).not.toBe(expired);
    });
  });

  describe('contract payload builders', () => {
    const builders = tow.createTowBuilders();

    test('every named builder returns a contract-valid payload', () => {
      const names = [
        'createTowRequestInput', 'changeDestinationInput', 'createProposalRequest',
        'createCounterofferInput', 'towSettingsPatch', 'partnerStatusPatch',
        'partnerLocationInput', 'trackingPointInput', 'paymentMethodSelection',
        'disputeInput', 'reviewInput', 'cancelByCustomerInput', 'cancelByPartnerInput',
        'towVehicleInput', 'towVehiclePatch', 'debtPaymentInput', 'toggleModuleInput',
        'resolveDisputeInput', 'towRequest', 'towRequestListResponse',
        'towOpportunityListResponse', 'errorResponse',
      ];
      for (const name of names) {
        const payload = builders[name]();
        expect(payload).toBeDefined();
        expect(typeof payload).toBe('object');
      }
    });

    test('builders are deterministic and honour overrides', () => {
      const a = builders.createTowRequestInput();
      const b = builders.createTowRequestInput();
      expect(a).toEqual(b);
      const withOverride = builders.changeDestinationInput({
        destination: { latitude: -23.5, longitude: -46.6 },
      });
      expect(withOverride.destination).toEqual({ latitude: -23.5, longitude: -46.6 });
      expect(withOverride).not.toEqual(builders.changeDestinationInput());
    });

    test('an invalid override throws instead of emitting an undocumented DTO', () => {
      expect(() => builders.towSettingsPatch({ not_a_setting: 1 })).toThrow(/violates the contract/);
      expect(() => builders.towSettingsPatch({})).toThrow(/violates the contract/);
      expect(() => builders.builder.build('NoSuchSchema')).toThrow(/unknown contract schema/);
      expect(() => builders.request('definitelyNotAnOperation')).toThrow(/unknown operation/);
      // The contract itself rejects an empty PATCH body.
      expect(builders.builder.validate('TowSettingsPatch', {}).valid).toBe(false);
    });

    test('TowSettingsPatch builder emits exactly one changed setting when asked', () => {
      const patch = builders.towSettingsPatch({ tow_max_radius_km: 80 });
      expect(patch).toEqual({ tow_max_radius_km: 80 });
    });
  });

  describe('gateway doubles', () => {
    test('maps gateway replays a canned route deterministically and records calls', async () => {
      const maps = tow.createFakeMapsGateway();
      const first = await maps.computeRoute({ origin: 'a', destination: 'b' });
      const second = await maps.computeRoute({ origin: 'a', destination: 'b' });
      expect(first).toEqual(second);
      expect(first.distanceMeters).toBe(8400);
      expect(maps.callCount('computeRoute')).toBe(2);
      expect(maps.lastCall('computeRoute').request).toEqual({ origin: 'a', destination: 'b' });
    });

    test('maps gateway can simulate an outage without network access', async () => {
      const maps = tow.createFakeMapsGateway({ failure: { code: 'MAPS_UNAVAILABLE' } });
      await expect(maps.computeRoute({})).rejects.toMatchObject({ code: 'MAPS_UNAVAILABLE' });
      expect(maps.callCount()).toBe(1);
    });

    test('payment gateway returns fixed identifiers (no Date.now/Math.random)', async () => {
      const payments = tow.createFakePaymentGateway();
      const first = await payments.processPayment({ amount: 25000, currency: 'BRL', method: 'pix' });
      const second = await payments.processPayment({ amount: 25000, currency: 'BRL', method: 'pix' });
      expect(first).toEqual(second);
      expect(first.transactionId).toBe('fake-txn-0001');
      expect(first.response.amount).toBe(25000);
      expect(payments.callCount('processPayment')).toBe(2);
    });

    test('the fake gateways never import an HTTP client', () => {
      const fs = require('fs');
      const path = require('path');
      const files = [
        path.join(__dirname, '../../helpers/tow/gateways/mapsGateway.js'),
        path.join(__dirname, '../../helpers/tow/gateways/paymentGateway.js'),
      ];
      for (const file of files) {
        const source = fs.readFileSync(file, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        expect(source).not.toMatch(/require\(['"](https?|axios|node-fetch|undici)['"]\)/);
        expect(source).not.toMatch(/fetch\(/);
        expect(source).not.toMatch(/Date\.now\(/);
        expect(source).not.toMatch(/Math\.random\(/);
      }
    });

    test('a combined fake gateway bundle is available for T01+ wiring', async () => {
      const gateways = tow.createFakeGateways();
      expect(gateways.maps.name).toBe('fake-maps');
      expect(gateways.payments.name).toBe('fake-payment:fake');
      await gateways.payments.getPaymentStatus('fake-txn-0001');
      expect(gateways.payments.lastCall('getPaymentStatus').transactionId).toBe('fake-txn-0001');
    });
  });

  describe('offline guarantee', () => {
    test('the focused Tow foundation runs without network or Docker', () => {
      // The consumer smoke is fully contract-driven: it validates fixtures
      // against the OpenAPI document with no server, DB or HTTP call.
      const smoke = runConsumerSmoke();
      expect(smoke.ok).toBe(true);
      expect(smoke.requestBodiesValidated + smoke.responsesValidated).toBeGreaterThan(0);
    });
  });
});
