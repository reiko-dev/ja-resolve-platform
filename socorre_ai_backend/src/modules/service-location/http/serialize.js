/**
 * SERVICE LOCATION — HTTP serialization (wire vocabulary).
 *
 * Snake-case wire fields, exactly the frozen ADR §5 contract. `place_name` is
 * response-only and never durable; `place_id` is the only identity the client
 * may send back.
 */
'use strict';

function serializePrediction(prediction) {
  return {
    place_id: prediction.placeId,
    primary_text: prediction.primaryText,
    secondary_text: prediction.secondaryText ?? null,
  };
}

function serializePredictions(predictions) {
  return (predictions || []).map(serializePrediction);
}

/** Explicit-place projection for `GET /locations/places/{placeId}`. */
function serializePlaceDetails(location) {
  return {
    place_id: location.placeId,
    place_name: location.placeName ?? null,
    formatted_address: location.formattedAddress ?? null,
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

module.exports = { serializePrediction, serializePredictions, serializePlaceDetails };
