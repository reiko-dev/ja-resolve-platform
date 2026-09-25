/**
 * SERVICE LOCATION — HTTP controller.
 *
 * Strict input validation lives here (unknown keys are rejected), so the
 * application/adder layers never see a malformed body. The controller is thin:
 * validate -> service -> serialize.
 */
'use strict';

const { validationError } = require('../domain');
const { handle } = require('./error-mapper');
const { serializePredictions, serializePlaceDetails } = require('./serialize');

const MAX_INPUT_LENGTH = 200;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,36}$/;
const MAX_RADIUS_METERS = 50000;

const AUTOCOMPLETE_KEYS = Object.freeze(['input', 'session_token', 'location_bias']);
const LOCATION_BIAS_KEYS = Object.freeze(['latitude', 'longitude', 'radius_meters']);

function rejectUnknownKeys(value, allowed, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError(`${field} must be an object`, { field });
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw validationError(`${field}.${key} is not a recognized field`, { field: `${field}.${key}` });
    }
  }
}

function requireSessionToken(value) {
  if (typeof value !== 'string' || !SESSION_TOKEN_PATTERN.test(value)) {
    throw validationError(
      'session_token must be 8..36 URL/filename-safe base64 characters',
      { field: 'session_token' }
    );
  }
  return value;
}

function optionalSessionToken(value) {
  if (value === undefined || value === null || value === '') return null;
  return requireSessionToken(value);
}

/** Optional per-call language override; the adapter owns the provider default. */
function optionalLanguageCode(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw validationError('language_code must be a string', { field: 'language_code' });
  }
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 35) {
    throw validationError('language_code must be 2..35 characters', { field: 'language_code' });
  }
  return trimmed;
}

function requireCoordinate(value, field, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw validationError(`${field} must be a finite number between ${min} and ${max}`, { field });
  }
  return value;
}

function readLocationBias(value) {
  if (value === undefined || value === null) return null;
  rejectUnknownKeys(value, LOCATION_BIAS_KEYS, 'location_bias');

  const latitude = requireCoordinate(value.latitude, 'location_bias.latitude', -90, 90);
  const longitude = requireCoordinate(value.longitude, 'location_bias.longitude', -180, 180);

  let radiusMeters;
  if (value.radius_meters !== undefined && value.radius_meters !== null) {
    if (!Number.isSafeInteger(value.radius_meters)
      || value.radius_meters < 1
      || value.radius_meters > MAX_RADIUS_METERS) {
      throw validationError(
        `location_bias.radius_meters must be an integer between 1 and ${MAX_RADIUS_METERS}`,
        { field: 'location_bias.radius_meters' }
      );
    }
    radiusMeters = value.radius_meters;
  }

  return { latitude, longitude, radius_meters: radiusMeters };
}

function readInputValue(value) {
  if (typeof value !== 'string') {
    throw validationError('input must be a string', { field: 'input' });
  }
  const input = value.trim();
  if (input.length < 1 || input.length > MAX_INPUT_LENGTH) {
    throw validationError(`input must be 1..${MAX_INPUT_LENGTH} characters after trim`, { field: 'input' });
  }
  return input;
}

function createServiceLocationController({ placeSearchService, locationResolutionService }) {
  const autocomplete = handle(async (req, res) => {
    const body = req.body || {};
    rejectUnknownKeys(body, AUTOCOMPLETE_KEYS, 'body');

    const input = readInputValue(body.input);
    const sessionToken = requireSessionToken(body.session_token);
    const locationBias = readLocationBias(body.location_bias);

    const { predictions } = await placeSearchService.search({
      input,
      sessionToken,
      locationBias,
    });

    res.json({ success: true, data: { predictions: serializePredictions(predictions) } });
  });

  const getPlace = handle(async (req, res) => {
    const placeId = req.params.placeId;
    if (typeof placeId !== 'string' || placeId.trim() === '') {
      throw validationError('placeId is required', { field: 'placeId' });
    }
    const sessionToken = optionalSessionToken(req.query.session_token);
    const languageCode = optionalLanguageCode(req.query.language_code);

    const location = await locationResolutionService.resolveExplicitPlace({
      placeId,
      sessionToken,
      languageCode,
    });

    res.json({ success: true, data: serializePlaceDetails(location) });
  });

  return { autocomplete, getPlace };
}

module.exports = {
  createServiceLocationController,
  MAX_INPUT_LENGTH,
  SESSION_TOKEN_PATTERN,
  MAX_RADIUS_METERS,
};
