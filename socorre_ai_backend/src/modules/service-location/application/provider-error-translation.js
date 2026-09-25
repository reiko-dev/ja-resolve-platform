/**
 * SERVICE LOCATION — provider failure -> domain error translation.
 *
 * The application knows the adapter only structurally (`code` + `reason`), never
 * by import: the domain/application layers must stay free of infrastructure.
 *
 * Mapping (frozen, ADR §5.3):
 *   invalid_request           -> validation_error (422)  caller bug, never a provider outage
 *   place_not_found           -> not_found (404)
 *   configuration_missing     -> upstream_unavailable (503)
 *   timeout/network_failure/
 *   provider_error/quota      -> upstream_unavailable (503)
 *   request_denied/
 *   invalid_provider_request/
 *   malformed_response        -> upstream_rejected (502)
 */
'use strict';

const {
  validationError,
  notFoundError,
  upstreamUnavailableError,
  upstreamRejectedError,
} = require('../domain');

const PLACES_PROVIDER_ERROR_CODE = 'places_provider_error';

function isPlacesProviderError(value) {
  return Boolean(value)
    && value.code === PLACES_PROVIDER_ERROR_CODE
    && typeof value.reason === 'string';
}

function translatePlacesProviderError(error) {
  const reason = error && error.reason;

  switch (reason) {
    case 'invalid_request':
      return validationError('A busca de locais recebeu uma entrada inválida', { reason });
    case 'place_not_found':
      return notFoundError('Local não encontrado', { reason });
    case 'configuration_missing':
      return upstreamUnavailableError('A busca de locais não está configurada', { reason });
    case 'timeout':
    case 'network_failure':
    case 'provider_error':
    case 'quota_exceeded':
      return upstreamUnavailableError('A busca de locais está indisponível. Tente novamente.', { reason });
    case 'request_denied':
    case 'invalid_provider_request':
    case 'malformed_response':
      return upstreamRejectedError('A busca de locais está indisponível. Tente novamente.', { reason });
    default:
      return upstreamUnavailableError('A busca de locais está indisponível. Tente novamente.', {
        reason: reason || 'unknown',
      });
  }
}

module.exports = {
  PLACES_PROVIDER_ERROR_CODE,
  isPlacesProviderError,
  translatePlacesProviderError,
};
