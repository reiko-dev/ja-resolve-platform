/**
 * SERVICE LOCATION — domain invariants.
 *
 * The coordinate rule is the canonical operational one (finite, WGS84 range,
 * not the (0,0) sentinel) and the identity rule protects the whole phase:
 * only an explicit user selection may carry a placeId, and a placeName never
 * exists without one.
 */
'use strict';

const {
  RESOLUTION_SOURCES,
  buildServiceLocation,
  buildExplicitPlaceLocation,
  buildCoordinateLocation,
} = require('../../src/modules/service-location/domain');

const POINT = { latitude: -9.974, longitude: -67.807 };

describe('SERVICE LOCATION — resolution source vocabulary', () => {
  test('is exactly the frozen four values', () => {
    expect(RESOLUTION_SOURCES).toEqual([
      'USER_SELECTED_PLACE',
      'USER_PIN',
      'CURRENT_LOCATION',
      'SAVED_ADDRESS',
    ]);
  });

  test('has no REVERSE_GEOCODE source', () => {
    expect(RESOLUTION_SOURCES).not.toContain('REVERSE_GEOCODE');
  });
});

describe('SERVICE LOCATION — coordinate validation', () => {
  test.each([
    ['NaN latitude', { latitude: Number.NaN, longitude: 10 }],
    ['infinite longitude', { latitude: 10, longitude: Number.POSITIVE_INFINITY }],
    ['latitude out of range', { latitude: 90.1, longitude: 10 }],
    ['longitude out of range', { latitude: 10, longitude: 180.1 }],
    ['string coordinate', { latitude: '10', longitude: 10 }],
    ['the (0,0) sentinel', { latitude: 0, longitude: 0 }],
  ])('rejects %s', (_label, point) => {
    expect(() => buildCoordinateLocation({ ...point, resolutionSource: 'USER_PIN' }))
      .toThrow(expect.objectContaining({ code: 'validation_error' }));
  });

  test('accepts a valid operational coordinate and freezes it', () => {
    const location = buildCoordinateLocation({ ...POINT, resolutionSource: 'USER_PIN' });
    expect(location).toMatchObject({ latitude: POINT.latitude, longitude: POINT.longitude });
    expect(Object.isFrozen(location)).toBe(true);
  });
});

describe('SERVICE LOCATION — identity invariants', () => {
  test('an explicit place carries placeId, placeName and USER_SELECTED_PLACE', () => {
    const location = buildExplicitPlaceLocation({
      placeId: 'ChIJabc',
      placeName: 'Contax',
      formattedAddress: 'Estrada Dias Martins, Rio Branco - AC',
      ...POINT,
    });
    expect(location).toMatchObject({
      placeId: 'ChIJabc',
      placeName: 'Contax',
      resolutionSource: 'USER_SELECTED_PLACE',
      formattedAddress: 'Estrada Dias Martins, Rio Branco - AC',
    });
  });

  test('a generic coordinate can never carry a placeId', () => {
    expect(() => buildServiceLocation({
      ...POINT,
      placeId: 'ChIJabc',
      resolutionSource: 'USER_PIN',
    })).toThrow(expect.objectContaining({ code: 'validation_error' }));
  });

  test('USER_SELECTED_PLACE requires a placeId', () => {
    expect(() => buildServiceLocation({
      ...POINT,
      resolutionSource: 'USER_SELECTED_PLACE',
    })).toThrow(expect.objectContaining({ code: 'validation_error' }));
  });

  test('a placeName without a placeId is rejected (geocoder cannot mint identity)', () => {
    expect(() => buildServiceLocation({
      ...POINT,
      placeName: 'Contax',
      resolutionSource: 'USER_PIN',
    })).toThrow(expect.objectContaining({ code: 'validation_error' }));
  });

  test('buildCoordinateLocation refuses USER_SELECTED_PLACE', () => {
    expect(() => buildCoordinateLocation({
      ...POINT,
      resolutionSource: 'USER_SELECTED_PLACE',
    })).toThrow(expect.objectContaining({ code: 'validation_error' }));
  });

  test('GPS and map pin never accept identity fields', () => {
    for (const source of ['USER_PIN', 'CURRENT_LOCATION']) {
      const location = buildCoordinateLocation({
        ...POINT,
        resolutionSource: source,
        formattedAddress: 'Rua X, 10',
      });
      expect(location.placeId).toBeNull();
      expect(location.placeName).toBeNull();
      expect(location.resolutionSource).toBe(source);
      expect(location.formattedAddress).toBe('Rua X, 10');
    }
  });

  test('a places/ resource prefix in a placeId is normalized to the bare id', () => {
    const location = buildExplicitPlaceLocation({
      placeId: 'places/ChIJabc',
      placeName: 'Contax',
      ...POINT,
    });
    expect(location.placeId).toBe('ChIJabc');
  });

  test('an unknown resolution source is rejected', () => {
    expect(() => buildServiceLocation({
      ...POINT,
      resolutionSource: 'REVERSE_GEOCODE',
    })).toThrow(expect.objectContaining({ code: 'validation_error' }));
  });
});
