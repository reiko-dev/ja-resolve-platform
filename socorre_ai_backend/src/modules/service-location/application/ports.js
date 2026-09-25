/**
 * SERVICE LOCATION — application ports (provider-neutral contracts).
 *
 * JSDoc-only typedefs, mirroring `modules/tow/application/ports.js` style. The
 * adapters must never leak Google payloads through these shapes.
 *
 * @typedef {Object} PlaceSearch
 * @property {(params: { input: string, sessionToken?: string, locationBias?: { latitude: number, longitude: number, radius_meters?: number } }) => Promise<{ predictions: Array<{ placeId: string, primaryText: string, secondaryText: string|null }> }>} searchPredictions
 *
 * @typedef {Object} PlaceDetails
 * @property {(params: { placeId: string, sessionToken?: string }) => Promise<{ placeId: string, placeName: string|null, formattedAddress: string|null, latitude: number, longitude: number }>} getPlace
 *
 * @typedef {Object} Geocoding
 * @property {(point: { latitude: number, longitude: number }) => Promise<{ formattedAddress: string|null }>} reverse
 *
 * Adapters report failures with an error carrying `code='places_provider_error'`
 * and a safe `reason` string (see `adapters/places/places-provider-error.js`).
 * The application translates that vocabulary into the domain error envelope; it
 * never imports the adapter.
 */
'use strict';

const PORT_NAMES = Object.freeze(['PlaceSearch', 'PlaceDetails', 'Geocoding']);

module.exports = { PORT_NAMES };
