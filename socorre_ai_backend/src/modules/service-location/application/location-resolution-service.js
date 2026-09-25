/**
 * SERVICE LOCATION — LocationResolutionService.
 *
 * Responsibilities (ADR §6):
 *   - normalize and validate a coordinate (canonical operational rule);
 *   - preserve an explicit user selection (Place Details -> place identity +
 *     authoritative coordinates);
 *   - enrich a generic coordinate with a reverse-geocoded address, best-effort;
 *   - never let a provider failure mutate identity: a failed Details call IS a
 *     failed selection, while a failed geocode on a valid coordinate is not.
 */
'use strict';

const {
  buildExplicitPlaceLocation,
  buildCoordinateLocation,
  validationError,
  upstreamUnavailableError,
} = require('../domain');
const {
  isPlacesProviderError,
  translatePlacesProviderError,
} = require('./provider-error-translation');

function requirePlaceId(value) {
  if (typeof value !== 'string') {
    throw validationError('placeId must be a string', { field: 'placeId' });
  }
  const placeId = value.trim();
  if (placeId === '') {
    throw validationError('placeId must not be empty', { field: 'placeId' });
  }
  return placeId;
}

function createLocationResolutionService({ placeDetails, geocoding = null } = {}) {
  /**
   * Explicit place: the caller selected a suggestion (or a POI carrying a
   * placeId). Place Details is the ONLY source of the authoritative coordinate.
   * A provider failure here cannot be recovered from text: it fails the
   * selection with a domain error.
   *
   * @param {{ placeId: string, sessionToken?: string, languageCode?: string }} params
   * @returns {Promise<Readonly<object>>} ServiceLocation (USER_SELECTED_PLACE)
   */
  async function resolveExplicitPlace({ placeId, sessionToken, languageCode } = {}) {
    if (!placeDetails) {
      throw upstreamUnavailableError('A busca de locais não está configurada', {
        reason: 'configuration_missing',
      });
    }

    const normalizedPlaceId = requirePlaceId(placeId);

    let place;
    try {
      place = await placeDetails.getPlace({
        placeId: normalizedPlaceId,
        sessionToken: sessionToken || undefined,
        languageCode: languageCode || undefined,
      });
    } catch (error) {
      if (isPlacesProviderError(error)) throw translatePlacesProviderError(error);
      throw upstreamUnavailableError('Não foi possível confirmar o local selecionado. Tente novamente.', {
        reason: 'unexpected_provider_failure',
      });
    }

    return buildExplicitPlaceLocation({
      placeId: (place && place.placeId) || normalizedPlaceId,
      placeName: place && place.placeName,
      formattedAddress: place && place.formattedAddress,
      latitude: place && place.latitude,
      longitude: place && place.longitude,
    });
  }

  /**
   * Generic coordinate (map pin, GPS fix, future saved address).
   *
   * `formattedAddress`, when provided, is the caller's own snapshot (e.g. the
   * device geocoder). When absent, an optional Geocoding port may enrich it.
   * Every failure is swallowed into `formattedAddress = null`: a valid
   * coordinate is always a valid ServiceLocation.
   *
   * @param {{ latitude: number, longitude: number, formattedAddress?: string|null, resolutionSource?: string }} params
   * @returns {Promise<Readonly<object>>}
   */
  async function resolveCoordinate({
    latitude,
    longitude,
    formattedAddress = null,
    resolutionSource,
  } = {}) {
    // Validate the coordinate and the source BEFORE any provider call: a caller
    // bug must not be reported as a provider outage.
    const base = buildCoordinateLocation({
      latitude,
      longitude,
      formattedAddress,
      resolutionSource,
    });

    if (base.formattedAddress !== null || !geocoding) return base;

    let enriched = null;
    try {
      const result = await geocoding.reverse({ latitude: base.latitude, longitude: base.longitude });
      enriched = result && typeof result.formattedAddress === 'string' ? result.formattedAddress : null;
    } catch (error) {
      // Best-effort by contract: an enrichment failure never blocks or mutates.
      enriched = null;
    }

    return buildCoordinateLocation({
      latitude: base.latitude,
      longitude: base.longitude,
      formattedAddress: enriched,
      resolutionSource: base.resolutionSource,
    });
  }

  return { resolveExplicitPlace, resolveCoordinate };
}

module.exports = { createLocationResolutionService };
