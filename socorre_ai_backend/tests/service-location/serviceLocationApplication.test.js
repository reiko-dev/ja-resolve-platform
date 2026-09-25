/**
 * SERVICE LOCATION — application services.
 *
 * Fakes only: zero network. The tests pin the failure semantics that protect
 * the identity rule:
 *   - an explicit selection without a successful Place Details call fails;
 *   - a reverse-geocoding failure on a valid coordinate never fails;
 *   - the geocoder port can only ever fill formattedAddress.
 */
'use strict';

const {
  createPlaceSearchService,
  createLocationResolutionService,
} = require('../../src/modules/service-location/application');
const {
  PlacesProviderError,
} = require('../../src/modules/service-location/adapters/places/places-provider-error');

const POINT = { latitude: -9.974, longitude: -67.807 };

function placeDetailsPort(result) {
  return { getPlace: jest.fn(async () => result) };
}

describe('SERVICE LOCATION — PlaceSearchService', () => {
  test('returns provider-neutral predictions and forwards token + bias', async () => {
    const searchPredictions = jest.fn(async () => ({
      predictions: [{
        placeId: 'ChIJabc',
        primaryText: 'Contax',
        secondaryText: 'Estrada Dias Martins, Rio Branco - AC',
      }],
    }));
    const service = createPlaceSearchService({ placeSearch: { searchPredictions } });

    const bias = { latitude: -9.97, longitude: -67.84, radius_meters: 5000 };
    const { predictions } = await service.search({
      input: 'contax',
      sessionToken: '44f7a0c9-1234-4abc-9def-0123456789ab',
      locationBias: bias,
    });

    expect(searchPredictions).toHaveBeenCalledWith({
      input: 'contax',
      sessionToken: '44f7a0c9-1234-4abc-9def-0123456789ab',
      locationBias: bias,
    });
    expect(predictions).toEqual([{
      placeId: 'ChIJabc',
      primaryText: 'Contax',
      secondaryText: 'Estrada Dias Martins, Rio Branco - AC',
    }]);
  });

  test('an empty input is a validation error, never a provider call', async () => {
    const searchPredictions = jest.fn();
    const service = createPlaceSearchService({ placeSearch: { searchPredictions } });

    await expect(service.search({ input: '   ', sessionToken: 'x'.repeat(36) }))
      .rejects.toMatchObject({ code: 'validation_error' });
    expect(searchPredictions).not.toHaveBeenCalled();
  });

  test('a missing provider fails controlled with upstream_unavailable', async () => {
    const service = createPlaceSearchService({ placeSearch: null });
    await expect(service.search({ input: 'contax', sessionToken: 'x'.repeat(36) }))
      .rejects.toMatchObject({ code: 'upstream_unavailable' });
  });

  test.each([
    ['timeout', 'upstream_unavailable'],
    ['provider_error', 'upstream_unavailable'],
    ['quota_exceeded', 'upstream_unavailable'],
    ['configuration_missing', 'upstream_unavailable'],
    ['request_denied', 'upstream_rejected'],
    ['malformed_response', 'upstream_rejected'],
  ])('translates provider reason %s into %s', async (reason, code) => {
    const service = createPlaceSearchService({
      placeSearch: {
        searchPredictions: jest.fn(async () => { throw new PlacesProviderError(reason, 'safe'); }),
      },
    });

    await expect(service.search({ input: 'contax', sessionToken: 'x'.repeat(36) }))
      .rejects.toMatchObject({ code });
  });

  test('never fabricates suggestions when the provider answers nothing', async () => {
    const service = createPlaceSearchService({
      placeSearch: { searchPredictions: jest.fn(async () => ({})) },
    });
    const { predictions } = await service.search({ input: 'contax', sessionToken: 'x'.repeat(36) });
    expect(predictions).toEqual([]);
  });
});

describe('SERVICE LOCATION — LocationResolutionService', () => {
  test('an explicit selection yields an explicit ServiceLocation from Details', async () => {
    const service = createLocationResolutionService({
      placeDetails: placeDetailsPort({
        placeId: 'ChIJabc',
        placeName: 'Contax',
        formattedAddress: 'Estrada Dias Martins, Rio Branco - AC',
        ...POINT,
      }),
    });

    const location = await service.resolveExplicitPlace({ placeId: 'ChIJabc', sessionToken: 't'.repeat(36) });

    expect(location).toMatchObject({
      placeId: 'ChIJabc',
      placeName: 'Contax',
      resolutionSource: 'USER_SELECTED_PLACE',
      latitude: POINT.latitude,
      longitude: POINT.longitude,
    });
  });

  test('a failed Details call fails the selection (no authoritative coordinate)', async () => {
    const service = createLocationResolutionService({
      placeDetails: {
        getPlace: jest.fn(async () => { throw new PlacesProviderError('timeout', 'safe'); }),
      },
    });

    await expect(service.resolveExplicitPlace({ placeId: 'ChIJabc' }))
      .rejects.toMatchObject({ code: 'upstream_unavailable' });
  });

  test('an obsolete place is a 404-domain not_found', async () => {
    const service = createLocationResolutionService({
      placeDetails: {
        getPlace: jest.fn(async () => { throw new PlacesProviderError('place_not_found', 'safe'); }),
      },
    });

    await expect(service.resolveExplicitPlace({ placeId: 'ChIJgone' }))
      .rejects.toMatchObject({ code: 'not_found' });
  });

  test('a coordinate with no address is enriched best-effort by the Geocoding port', async () => {
    const geocoding = { reverse: jest.fn(async () => ({ formattedAddress: 'Rua X, 10 - Rio Branco, AC' })) };
    const service = createLocationResolutionService({ placeDetails: null, geocoding });

    const location = await service.resolveCoordinate({ ...POINT, resolutionSource: 'USER_PIN' });

    expect(geocoding.reverse).toHaveBeenCalledWith(POINT);
    expect(location).toMatchObject({
      formattedAddress: 'Rua X, 10 - Rio Branco, AC',
      placeId: null,
      placeName: null,
      resolutionSource: 'USER_PIN',
    });
  });

  test('a geocoding failure leaves a valid coordinate with a null address', async () => {
    const service = createLocationResolutionService({
      placeDetails: null,
      geocoding: { reverse: jest.fn(async () => { throw new Error('provider down'); }) },
    });

    const location = await service.resolveCoordinate({ ...POINT, resolutionSource: 'CURRENT_LOCATION' });

    expect(location).toMatchObject({
      formattedAddress: null,
      placeId: null,
      placeName: null,
      resolutionSource: 'CURRENT_LOCATION',
    });
  });

  test('a caller-provided address is preserved and skips the geocoder', async () => {
    const geocoding = { reverse: jest.fn() };
    const service = createLocationResolutionService({ placeDetails: null, geocoding });

    const location = await service.resolveCoordinate({
      ...POINT,
      formattedAddress: 'Endereço do dispositivo',
      resolutionSource: 'CURRENT_LOCATION',
    });

    expect(location.formattedAddress).toBe('Endereço do dispositivo');
    expect(geocoding.reverse).not.toHaveBeenCalled();
  });

  test('an invalid coordinate is a validation error before any provider call', async () => {
    const geocoding = { reverse: jest.fn() };
    const service = createLocationResolutionService({ placeDetails: null, geocoding });

    await expect(service.resolveCoordinate({ latitude: 0, longitude: 0, resolutionSource: 'USER_PIN' }))
      .rejects.toMatchObject({ code: 'validation_error' });
    expect(geocoding.reverse).not.toHaveBeenCalled();
  });

  test('the geocoder can never mint place identity', async () => {
    const geocoding = {
      reverse: jest.fn(async () => ({
        formattedAddress: 'Contax, Estrada Dias Martins',
        placeId: 'ChIJabc',
        placeName: 'Contax',
      })),
    };
    const service = createLocationResolutionService({ placeDetails: null, geocoding });

    const location = await service.resolveCoordinate({ ...POINT, resolutionSource: 'USER_PIN' });

    expect(location.placeId).toBeNull();
    expect(location.placeName).toBeNull();
  });
});
