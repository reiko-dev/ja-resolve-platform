/**
 * MVP-03 — fixtures for the canonical TowRequest + geographic matching suites.
 *
 * Everything here is deterministic: fixed instants, fixed coordinates, fixed
 * tariffs, no `Date.now()` and no randomness. The helpers persist through the
 * REAL composition root (`buildTowServices`) so the suites exercise the same
 * repositories, policies and adapters as production, on the SQLite harness and
 * on the opt-in PostgreSQL harness alike.
 *
 * No Haversine/earth-radius token lives here: distance policy is owned by
 * `src/modules/tow/domain/geo.js` only.
 */
'use strict';

const testDb = require('../testDb');
const { createFakeClock } = require('./clock');
const { createTowPartner, createTowCustomer } = require('./factories');
const { createFakeRouteProvider } = require('./gateways/mapsGateway');
const { buildTowServices } = require('../../../src/modules/tow/composition');
const { canonicalFingerprintSource, normalizeTowRequestPaymentMethod } = require('../../../src/modules/tow/domain');

const DEFAULT_INSTANT = '2026-01-15T12:00:00.000Z';

/** Av. Paulista, São Paulo — the canonical pickup used across the suites. */
const PICKUP = Object.freeze({
  latitude: -23.561684,
  longitude: -46.655981,
  formatted_address: 'Av. Paulista, 1578 - São Paulo - SP',
});

/** Santo André — the canonical destination used across the suites. */
const DESTINATION = Object.freeze({
  latitude: -23.6639,
  longitude: -46.531,
  formatted_address: 'Rua das Figueiras, 100 - Santo André - SP',
});

/** The canonical frozen input shape (matches `CreateTowRequestInput`). */
const VALID_CREATE_INPUT = Object.freeze({
  pickup: PICKUP,
  destination: DESTINATION,
  vehicle: Object.freeze({
    class: 'light_vehicle',
    make: 'Fiat',
    model: 'Argo',
    year: 2021,
    weight_kg: 1200,
    plate: 'ABC1D23',
  }),
  problem_description: 'Carro não liga na garagem do prédio',
  observations: 'Portão B, avisar na portaria',
  // The commercial choice is part of the frozen create payload since the Tow
  // round: a request cannot be born without it.
  payment_method: 'cash',
});

/** Tariff that reproduces the MVP-02 quote fixture (18480 cents for the fake legs). */
const TARIFF = Object.freeze({
  minimum_charge_cents: 15000,
  included_km: 10,
  price_per_additional_km_cents: 800,
});

const IDEMPOTENCY_KEY = 'idem-mvp03-00000001';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** Deep-merge the canonical input with per-test overrides (one level per branch). */
function createTowRequestInput(overrides = {}) {
  const input = clone(VALID_CREATE_INPUT);
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && input[key] && typeof input[key] === 'object') {
      input[key] = { ...input[key], ...clone(value) };
    } else {
      input[key] = clone(value);
    }
  }
  return input;
}

/**
 * Build the module services against the SQLite harness with a deterministic
 * clock and a recording fake route provider (never a real Google call).
 */
function createMvp03Services(options = {}) {
  const clock = options.clock || createFakeClock(options.start || DEFAULT_INSTANT);
  const routeProvider = options.routeProvider || createFakeRouteProvider(options.route);
  const services = buildTowServices({ db: testDb.db, clock, routeProvider });
  return { services, clock, routeProvider };
}

/**
 * A tow partner whose operational projection is fully valid.
 *
 * Pass `partner` to attach a vehicle to an already-authenticated partner
 * (avoids creating a second partner row for the same identity).
 */
async function createOperationalPartner(options = {}) {
  const {
    services,
    partner: existingPartner,
    partnerOverrides = {},
    vehicleOverrides = {},
    documents = [{ document_type: 'vehicle_license', status: 'approved' }],
    active = true,
  } = options;

  let user = null;
  let partner = existingPartner || null;
  if (!partner) {
    ({ user, partner } = await createTowPartner(partnerOverrides));
  }

  const vehicle = await services.vehicleRepository.insert({
    partner_id: partner.id,
    plate: vehicleOverrides.plate || `PLT${String(partner.id).padStart(4, '0')}`,
    make: 'Ford',
    model: 'F-4000',
    year: 2020,
    equipment_type: 'flatbed',
    supported_vehicle_classes: ['light_vehicle', 'motorcycle'],
    max_towed_weight_kg: 4000,
    active,
    pricing: TARIFF,
    ...vehicleOverrides,
  });

  const persisted = [];
  for (const document of documents) {
    persisted.push(await services.documentRepository.insert({
      tow_vehicle_id: vehicle.id,
      partner_id: partner.id,
      document_type: 'vehicle_license',
      filename: `stored-${partner.id}`,
      original_name: 'crlv.jpg',
      file_path: `stored-${partner.id}`,
      file_url: `stored-${partner.id}`,
      mime_type: 'image/jpeg',
      file_size: 1,
      status: 'approved',
      ...document,
    }));
  }

  return { user, partner, vehicle, documents: persisted };
}

/**
 * Persist a canonical TowRequest through the real repository port.
 *
 * Used by suites that need a SEARCHING request without going through HTTP
 * (matching/rehydration fixtures). The HTTP creation path has its own suite.
 */
async function createCanonicalRequest(options = {}) {
  const {
    services,
    customer,
    clock = createFakeClock(DEFAULT_INSTANT),
    radiusKm = 40,
    input = createTowRequestInput(),
    idempotencyKey = IDEMPOTENCY_KEY,
    state = 'SEARCHING',
  } = options;

  const owner = customer || (await createTowCustomer());
  const result = await services.towRequestRepository.createIdempotent(
    {
      customer_id: owner.id,
      state,
      pickup: input.pickup,
      destination: input.destination,
      vehicle: input.vehicle,
      problem_description: input.problem_description,
      observations: input.observations ?? null,
      // The helper writes the aggregate directly, so the consumer vocabulary of
      // the payload is normalized here exactly as `validateCreateTowRequestInput`
      // would (`cash` -> `CASH`). `null` stays null: it models a historical row.
      payment_method: input.payment_method === undefined || input.payment_method === null
        ? null
        : normalizeTowRequestPaymentMethod(input.payment_method),
      matching_radius_km: radiusKm,
      idempotency_key: idempotencyKey,
      created_at: clock.now(),
      updated_at: clock.now(),
    },
    { fingerprintSource: canonicalFingerprintSource(input) }
  );

  return { request: result.row, customer: owner, created: result.created };
}

module.exports = {
  DEFAULT_INSTANT,
  PICKUP,
  DESTINATION,
  VALID_CREATE_INPUT,
  TARIFF,
  IDEMPOTENCY_KEY,
  clone,
  createTowRequestInput,
  createMvp03Services,
  createOperationalPartner,
  createCanonicalRequest,
};
