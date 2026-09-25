/**
 * SERVICE LOCATION — composition root.
 *
 * The only place the pure layers meet the Google adapter and the environment.
 * `none` (the default) wires no provider: the HTTP endpoints answer a
 * controlled `upstream_unavailable` and the app still boots. Explicit `google`
 * without `GOOGLE_PLACES_API_KEY` fails fast (guarded config).
 *
 * `options.geocoding` is an injected `Geocoding` port used for best-effort
 * reverse-geocoding of generic coordinates. It defaults to `null`: the HTTP
 * proxy does not need it, and Tow injects its own resolver when adopting.
 */
'use strict';

const { createPlaceSearchService, createLocationResolutionService } = require('./application');
const { createGooglePlacesAdapter } = require('./adapters/places/google-places-adapter');
const { assertServiceLocationPlacesSafe } = require('../../config/serviceLocationPlaces');

/**
 * Maps the guarded `SERVICE_LOCATION_PLACES` kind to its provider. `none` is
 * the default and yields `null`; `google` demands `GOOGLE_PLACES_API_KEY` at
 * startup.
 */
function createConfiguredPlacesProvider(placesOptions = {}, env = process.env) {
  const kind = assertServiceLocationPlacesSafe(env);
  if (kind === 'none') return null;
  return createGooglePlacesAdapter(placesOptions);
}

function buildServiceLocationServices(options = {}) {
  const placesProvider = options.placesProvider === undefined
    ? createConfiguredPlacesProvider(options.places || {})
    : options.placesProvider;
  const geocoding = options.geocoding === undefined ? null : options.geocoding;

  const placeSearchService = createPlaceSearchService({ placeSearch: placesProvider });
  const locationResolutionService = createLocationResolutionService({
    placeDetails: placesProvider,
    geocoding,
  });

  return {
    placesProvider,
    geocoding,
    placeSearchService,
    locationResolutionService,
  };
}

module.exports = { buildServiceLocationServices, createConfiguredPlacesProvider };
