/**
 * MVP-03 — canonical TowRequest aggregate + geographic primitives (pure domain).
 *
 * RED-first: written before `domain/tow-request.js`, before the operational
 * coordinate rule and before the geodesic primitive exist.
 */
'use strict';

const {
  TOW_REQUEST_STATES,
  INITIAL_TOW_REQUEST_STATE,
  TERMINAL_REASONS,
  MODULE_KEY,
  TowError,
  validateCreateTowRequestInput,
  buildTowRequestRecord,
  buildTowRequestDto,
  allowedActionsForRequest,
  validateIdempotencyKey,
  canonicalFingerprintSource,
  validateGeoPoint,
  isOperationalGeoPoint,
  assertOperationalGeoPoint,
  geodesicDistanceMeters,
  isWithinRadius,
  boundingBoxForRadius,
  isVehicleClass,
} = require('../../../src/modules/tow/domain');

const {
  PICKUP,
  DESTINATION,
  createTowRequestInput,
  clone,
} = require('../../helpers/tow/mvp03');

function expectValidationError(run, reason) {
  let caught = null;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(TowError);
  expect(caught.code).toBe('validation_error');
  expect(caught.httpStatus).toBe(422);
  if (reason) expect(caught.details).toMatchObject({ reason });
  return caught;
}

describe('MVP-03 domain — canonical TowRequest vocabulary', () => {
  test('the canonical state list matches the frozen contract', () => {
    expect(TOW_REQUEST_STATES).toEqual([
      'SEARCHING', 'NEGOTIATING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_TRANSIT',
      'COMPLETION_PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'DISPUTED',
    ]);
    expect(INITIAL_TOW_REQUEST_STATE).toBe('SEARCHING');
    expect(Object.isFrozen(TOW_REQUEST_STATES)).toBe(true);
  });

  test('the canonical terminal reasons match the frozen contract', () => {
    expect(TERMINAL_REASONS).toEqual([
      'NO_PROVIDER_AVAILABLE', 'SERVICE_DISABLED', 'CUSTOMER_CANCELLED', 'PARTNER_CANCELLED',
      'CUSTOMER_NO_SHOW', 'PARTNER_NO_SHOW', 'ADMIN_OVERRIDE',
    ]);
  });

  test('the module key is the canonical tow key', () => {
    expect(MODULE_KEY).toBe('tow');
  });
});

describe('MVP-03 domain — frozen input shape', () => {
  test('a valid payload is normalized, frozen and carries only canonical keys', () => {
    const input = validateCreateTowRequestInput(createTowRequestInput());
    expect(Object.keys(input).sort()).toEqual([
      'destination', 'observations', 'pickup', 'problem_description', 'vehicle',
    ]);
    expect(input.pickup).toEqual({
      latitude: PICKUP.latitude,
      longitude: PICKUP.longitude,
      formatted_address: PICKUP.formatted_address,
    });
    expect(input.vehicle).toEqual({
      class: 'light_vehicle',
      make: 'Fiat',
      model: 'Argo',
      year: 2021,
      weight_kg: 1200,
      plate: 'ABC1D23',
    });
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.pickup)).toBe(true);
    expect(Object.isFrozen(input.vehicle)).toBe(true);
  });

  test('optional vehicle fields may be omitted and normalize to null', () => {
    const payload = createTowRequestInput();
    delete payload.vehicle.year;
    delete payload.vehicle.weight_kg;
    delete payload.vehicle.plate;
    delete payload.observations;
    const input = validateCreateTowRequestInput(payload);
    expect(input.vehicle.year).toBeNull();
    expect(input.vehicle.weight_kg).toBeNull();
    expect(input.vehicle.plate).toBeNull();
    expect(input.observations).toBeNull();
  });

  test.each(['pickup', 'destination', 'vehicle', 'problem_description'])(
    'missing required field %s is a validation error',
    (field) => {
      const payload = createTowRequestInput();
      delete payload[field];
      expectValidationError(() => validateCreateTowRequestInput(payload));
    }
  );

  test('an unknown top-level field is rejected (additionalProperties: false)', () => {
    expectValidationError(() => validateCreateTowRequestInput({
      ...createTowRequestInput(),
      estimated_price: 199,
    }));
  });

  test('client-supplied distance or price is rejected, never silently dropped', () => {
    expectValidationError(() => validateCreateTowRequestInput({
      ...createTowRequestInput(),
      distance_meters: 12345,
    }));
    expectValidationError(() => validateCreateTowRequestInput({
      ...createTowRequestInput(),
      estimated_price: 199,
    }));
  });

  test('an unknown vehicle field is rejected', () => {
    const payload = createTowRequestInput();
    payload.vehicle.color = 'prata';
    expectValidationError(() => validateCreateTowRequestInput(payload));
  });

  test('an unknown vehicle class is rejected', () => {
    const payload = createTowRequestInput();
    payload.vehicle.class = 'spaceship';
    expectValidationError(() => validateCreateTowRequestInput(payload));
  });

  test('a weight-required class without weight_kg is rejected', () => {
    const payload = createTowRequestInput();
    payload.vehicle.class = 'medium_truck';
    delete payload.vehicle.weight_kg;
    expectValidationError(() => validateCreateTowRequestInput(payload));
  });

  test('a weight-required class with a valid weight is accepted', () => {
    const payload = createTowRequestInput();
    payload.vehicle.class = 'heavy_truck';
    payload.vehicle.weight_kg = 12000;
    const input = validateCreateTowRequestInput(payload);
    expect(input.vehicle.class).toBe('heavy_truck');
    expect(input.vehicle.weight_kg).toBe(12000);
    expect(isVehicleClass('heavy_truck')).toBe(true);
  });

  test.each([0, -1, 1.5, '1200'])('invalid weight_kg %p is rejected', (weight) => {
    const payload = createTowRequestInput();
    payload.vehicle.weight_kg = weight;
    expectValidationError(() => validateCreateTowRequestInput(payload));
  });

  test.each([1899, 2201, '2021'])('invalid vehicle year %p is rejected', (year) => {
    const payload = createTowRequestInput();
    payload.vehicle.year = year;
    expectValidationError(() => validateCreateTowRequestInput(payload));
  });

  test('an empty or oversized problem_description is rejected', () => {
    expectValidationError(() => validateCreateTowRequestInput(
      createTowRequestInput({ problem_description: '' })
    ));
    expectValidationError(() => validateCreateTowRequestInput(
      createTowRequestInput({ problem_description: 'x'.repeat(2001) })
    ));
  });

  test('an oversized observations field is rejected', () => {
    expectValidationError(() => validateCreateTowRequestInput(
      createTowRequestInput({ observations: 'x'.repeat(4001) })
    ));
  });
});

describe('MVP-03 domain — operational coordinates', () => {
  test('validateGeoPoint keeps its MVP-02 range-only semantics (no (0,0) rule)', () => {
    expect(validateGeoPoint({ latitude: 0, longitude: 0 }, 'pickup')).toEqual({
      latitude: 0,
      longitude: 0,
    });
  });

  test('the operational rule rejects (0,0)', () => {
    expect(isOperationalGeoPoint({ latitude: 0, longitude: 0 })).toBe(false);
    const error = expectValidationError(
      () => assertOperationalGeoPoint({ latitude: 0, longitude: 0 }, 'pickup'),
      'zero_zero'
    );
    expect(error.message).toMatch(/pickup/);
  });

  test.each([
    [{ latitude: 91, longitude: 10 }],
    [{ latitude: -91, longitude: 10 }],
    [{ latitude: 10, longitude: 181 }],
    [{ latitude: 10, longitude: -181 }],
    [{ latitude: Number.NaN, longitude: 10 }],
    [{ latitude: 10, longitude: Number.POSITIVE_INFINITY }],
    [{ latitude: '10', longitude: 10 }],
  ])('the operational rule rejects %p', (point) => {
    expect(isOperationalGeoPoint(point)).toBe(false);
    expectValidationError(() => assertOperationalGeoPoint(point, 'pickup'));
  });

  test('the operational rule accepts a real coordinate pair', () => {
    expect(isOperationalGeoPoint(PICKUP)).toBe(true);
    expect(assertOperationalGeoPoint(PICKUP, 'pickup')).toEqual({
      latitude: PICKUP.latitude,
      longitude: PICKUP.longitude,
    });
  });

  test('pickup and destination both require operational coordinates', () => {
    expectValidationError(() => validateCreateTowRequestInput(
      createTowRequestInput({ pickup: { latitude: 0, longitude: 0 } })
    ), 'zero_zero');
    expectValidationError(() => validateCreateTowRequestInput(
      createTowRequestInput({ destination: { latitude: 0, longitude: 0 } })
    ), 'zero_zero');
  });
});

describe('MVP-03 domain — geodesic primitive (radius filtering only)', () => {
  test('the same point is zero metres away', () => {
    expect(geodesicDistanceMeters(PICKUP, PICKUP)).toBe(0);
  });

  test('one degree of latitude on the equator is the mean-radius meridian arc', () => {
    const distance = geodesicDistanceMeters(
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 0 }
    );
    // pi/180 * 6371008.8 m == 111194.93 m
    expect(Math.abs(distance - 111194.93)).toBeLessThan(0.5);
  });

  test('the primitive is symmetric', () => {
    const forward = geodesicDistanceMeters(PICKUP, DESTINATION);
    const backward = geodesicDistanceMeters(DESTINATION, PICKUP);
    expect(Math.abs(forward - backward)).toBeLessThan(0.001);
  });

  test('the São Paulo → Santo André fixture is roughly 17 km', () => {
    const distance = geodesicDistanceMeters(PICKUP, DESTINATION);
    expect(distance).toBeGreaterThan(16000);
    expect(distance).toBeLessThan(18000);
  });

  test('the radius comparison is inclusive at the boundary', () => {
    const center = { latitude: -23.5, longitude: -46.6 };
    const inside = { latitude: -23.51, longitude: -46.6 };
    const distance = geodesicDistanceMeters(center, inside);
    expect(isWithinRadius(center, inside, distance / 1000)).toBe(true);
    expect(isWithinRadius(center, inside, (distance - 1) / 1000)).toBe(false);
  });

  test('the bounding box always contains every point inside the radius', () => {
    const center = { latitude: -23.561684, longitude: -46.655981 };
    const radiusKm = 15;
    const box = boundingBoxForRadius(center, radiusKm);
    expect(box.min_latitude).toBeLessThan(center.latitude);
    expect(box.max_latitude).toBeGreaterThan(center.latitude);
    expect(box.min_longitude).toBeLessThan(center.longitude);
    expect(box.max_longitude).toBeGreaterThan(center.longitude);

    const samples = [
      { latitude: center.latitude + 0.1, longitude: center.longitude },
      { latitude: center.latitude - 0.1, longitude: center.longitude },
      { latitude: center.latitude, longitude: center.longitude + 0.1 },
      { latitude: center.latitude, longitude: center.longitude - 0.1 },
      { latitude: center.latitude + 0.05, longitude: center.longitude - 0.08 },
    ];
    for (const sample of samples) {
      if (!isWithinRadius(center, sample, radiusKm)) continue;
      expect(sample.latitude).toBeGreaterThanOrEqual(box.min_latitude);
      expect(sample.latitude).toBeLessThanOrEqual(box.max_latitude);
      expect(sample.longitude).toBeGreaterThanOrEqual(box.min_longitude);
      expect(sample.longitude).toBeLessThanOrEqual(box.max_longitude);
    }
  });

  test('an invalid point can never be inside a radius', () => {
    expect(isWithinRadius(PICKUP, { latitude: 0, longitude: 0 }, 100)).toBe(false);
    expect(isWithinRadius(PICKUP, { latitude: Number.NaN, longitude: 0 }, 100)).toBe(false);
  });
});

describe('MVP-03 domain — idempotency contract', () => {
  test('the header is required', () => {
    expectValidationError(() => validateIdempotencyKey(undefined));
    expectValidationError(() => validateIdempotencyKey(null));
    expectValidationError(() => validateIdempotencyKey(''));
  });

  test('the key must respect the frozen 8..128 length window', () => {
    expectValidationError(() => validateIdempotencyKey('short'));
    expectValidationError(() => validateIdempotencyKey('x'.repeat(129)));
    expect(validateIdempotencyKey('  idem-12345678  ')).toBe('idem-12345678');
    expect(validateIdempotencyKey('x'.repeat(128))).toBe('x'.repeat(128));
  });

  test('the fingerprint source is stable regardless of key order', () => {
    const first = canonicalFingerprintSource(createTowRequestInput());
    const reordered = {
      observations: createTowRequestInput().observations,
      vehicle: createTowRequestInput().vehicle,
      problem_description: createTowRequestInput().problem_description,
      destination: createTowRequestInput().destination,
      pickup: createTowRequestInput().pickup,
    };
    expect(canonicalFingerprintSource(reordered)).toBe(first);
  });

  test('the fingerprint source changes when the payload changes', () => {
    const base = canonicalFingerprintSource(createTowRequestInput());
    expect(canonicalFingerprintSource(createTowRequestInput({
      problem_description: 'Bateria descarregada',
    }))).not.toBe(base);
    expect(canonicalFingerprintSource(createTowRequestInput({
      pickup: { latitude: -23.6, longitude: -46.65 },
    }))).not.toBe(base);
  });

  test('the fingerprint source is canonical and covers every meaningful field', () => {
    const source = canonicalFingerprintSource(createTowRequestInput());
    expect(typeof source).toBe('string');
    expect(source.length).toBeGreaterThan(0);
    expect(source).toContain('light_vehicle');
    expect(source).toContain('Carro não liga na garagem do prédio');
    expect(source).toContain('-23.561684');
  });
});

describe('MVP-03 domain — persistence record', () => {
  test('the record carries the frozen radius and starts in SEARCHING', () => {
    const clock = { now: () => new Date('2026-01-15T12:00:00.000Z') };
    const record = buildTowRequestRecord({
      input: validateCreateTowRequestInput(createTowRequestInput()),
      customerId: 42,
      radiusKm: 15,
      idempotencyKey: 'idem-12345678',
      now: clock.now(),
    });
    expect(record).toMatchObject({
      customer_id: 42,
      state: 'SEARCHING',
      terminal_reason: null,
      matching_radius_km: 15,
      idempotency_key: 'idem-12345678',
    });
    expect(record.pickup).toEqual({
      latitude: PICKUP.latitude,
      longitude: PICKUP.longitude,
      formatted_address: PICKUP.formatted_address,
    });
    expect(record.created_at).toEqual(new Date('2026-01-15T12:00:00.000Z'));
    expect(record).not.toHaveProperty('estimated_price');
    expect(record).not.toHaveProperty('route_quote');
    expect(record).not.toHaveProperty('assignment');
  });

  test('a non-positive or non-finite radius is rejected', () => {
    const input = validateCreateTowRequestInput(createTowRequestInput());
    expectValidationError(() => buildTowRequestRecord({
      input, customerId: 1, radiusKm: 0, idempotencyKey: 'idem-12345678', now: new Date(),
    }));
    expectValidationError(() => buildTowRequestRecord({
      input, customerId: 1, radiusKm: Number.NaN, idempotencyKey: 'idem-12345678', now: new Date(),
    }));
  });
});

describe('MVP-03 domain — canonical DTO', () => {
  const record = {
    id: 7,
    customer_id: 42,
    state: 'SEARCHING',
    terminal_reason: null,
    module_key: 'tow',
    pickup: clone(PICKUP),
    destination: clone(DESTINATION),
    vehicle: {
      class: 'light_vehicle', make: 'Fiat', model: 'Argo', year: 2021, weight_kg: 1200, plate: 'ABC1D23',
    },
    problem_description: 'Carro não liga na garagem do prédio',
    observations: 'Portão B, avisar na portaria',
    matching_radius_km: 15,
    created_at: new Date('2026-01-15T12:00:00.000Z'),
    updated_at: new Date('2026-01-15T12:00:00.000Z'),
  };

  test('the DTO exposes the frozen TowRequest shape with string ids', () => {
    const dto = buildTowRequestDto(record, { max_radius_km: 50 });
    expect(dto).toEqual({
      id: '7',
      state: 'SEARCHING',
      terminal_reason: null,
      module_key: 'tow',
      customer_id: '42',
      pickup: {
        latitude: PICKUP.latitude,
        longitude: PICKUP.longitude,
        formatted_address: PICKUP.formatted_address,
      },
      destination: {
        latitude: DESTINATION.latitude,
        longitude: DESTINATION.longitude,
        formatted_address: DESTINATION.formatted_address,
      },
      vehicle: {
        class: 'light_vehicle', make: 'Fiat', model: 'Argo', year: 2021, weight_kg: 1200, plate: 'ABC1D23',
      },
      problem_description: 'Carro não liga na garagem do prédio',
      observations: 'Portão B, avisar na portaria',
      matching: { current_radius_km: 15, max_radius_km: 50, search_expires_at: null },
      assignment: null,
      payment: {
        request_id: '7',
        method: null,
        status: 'NOT_SELECTED',
        amount_cents: null,
        currency: null,
        can_start_service: false,
        pix: null,
      },
      allowed_actions: [],
      created_at: '2026-01-15T12:00:00.000Z',
      updated_at: '2026-01-15T12:00:00.000Z',
    });
  });

  test('allowed_actions is injected; ISSUE #6 makes cancel truthful in SEARCHING', () => {
    // The raw DTO never guesses a viewer: with no injection it stays empty.
    const dto = buildTowRequestDto(record, { max_radius_km: 50 });
    expect(dto.allowed_actions).toEqual([]);
    // ... while the domain authority advertises the owning customer's real
    // action for this state. Unimplemented actions stay out either way.
    expect(allowedActionsForRequest({ state: 'SEARCHING', viewer: 'customer' })).toEqual(['cancel']);
    for (const action of ['change_destination', 'accept_proposal', 'counteroffer']) {
      expect(dto.allowed_actions).not.toContain(action);
    }
  });

  test('payment is neutral and never claims the service can start', () => {
    const dto = buildTowRequestDto(record, { max_radius_km: 50 });
    expect(dto.payment.status).toBe('NOT_SELECTED');
    expect(dto.payment.method).toBeNull();
    expect(dto.payment.amount_cents).toBeNull();
    expect(dto.payment.can_start_service).toBe(false);
  });

  test('assignment is null and the search never claims an expiry in MVP-03', () => {
    const dto = buildTowRequestDto(record, { max_radius_km: 50 });
    expect(dto.assignment).toBeNull();
    expect(dto.matching.search_expires_at).toBeNull();
    expect(dto.matching.current_radius_km).toBe(15);
  });

  test('the vehicle projection carries exactly the six frozen keys', () => {
    const dto = buildTowRequestDto(record, { max_radius_km: 50 });
    expect(Object.keys(dto.vehicle).sort()).toEqual(['class', 'make', 'model', 'plate', 'weight_kg', 'year']);
    expect(Object.keys(dto.pickup).sort()).toEqual(['formatted_address', 'latitude', 'longitude']);
  });
});
