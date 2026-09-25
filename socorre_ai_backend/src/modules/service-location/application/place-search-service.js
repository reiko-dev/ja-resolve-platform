/**
 * SERVICE LOCATION — place search orchestration.
 *
 * Validates the frozen search input, asks the PlaceSearch port and returns
 * provider-neutral predictions. Provider failures never fabricate suggestions:
 * they become the canonical `upstream_*` domain errors.
 */
'use strict';

const { validationError, upstreamUnavailableError } = require('../domain');
const {
  isPlacesProviderError,
  translatePlacesProviderError,
} = require('./provider-error-translation');

const MAX_INPUT_LENGTH = 200;

function requireInput(value) {
  if (typeof value !== 'string') {
    throw validationError('input must be a string', { field: 'input' });
  }
  const input = value.trim();
  if (input.length < 1 || input.length > MAX_INPUT_LENGTH) {
    throw validationError(`input must be 1..${MAX_INPUT_LENGTH} characters after trim`, { field: 'input' });
  }
  return input;
}

function createPlaceSearchService({ placeSearch }) {
  /**
   * @param {{ input: string, sessionToken: string, locationBias?: object }} params
   * @returns {Promise<{ predictions: Array<{ placeId: string, primaryText: string, secondaryText: string|null }> }>}
   */
  async function search({ input, sessionToken, locationBias } = {}) {
    if (!placeSearch) {
      throw upstreamUnavailableError('A busca de locais não está configurada', {
        reason: 'configuration_missing',
      });
    }

    const normalizedInput = requireInput(input);

    try {
      const result = await placeSearch.searchPredictions({
        input: normalizedInput,
        sessionToken: sessionToken || undefined,
        locationBias: locationBias || undefined,
      });
      const predictions = Array.isArray(result && result.predictions) ? result.predictions : [];
      return {
        predictions: predictions.map((prediction) => ({
          placeId: prediction.placeId,
          primaryText: prediction.primaryText,
          secondaryText: prediction.secondaryText ?? null,
        })),
      };
    } catch (error) {
      if (isPlacesProviderError(error)) throw translatePlacesProviderError(error);
      throw upstreamUnavailableError('A busca de locais está indisponível. Tente novamente.', {
        reason: 'unexpected_provider_failure',
      });
    }
  }

  return { search };
}

module.exports = { createPlaceSearchService, MAX_INPUT_LENGTH };
