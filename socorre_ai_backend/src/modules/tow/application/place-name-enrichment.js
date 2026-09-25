/**
 * SERVICE LOCATION — read-time place-name enrichment (pure application).
 *
 * A persisted `place_id` is durable identity; a place NAME is not (ADR §3:
 * never persisted). Detailed surfaces may therefore resolve the name at READ
 * time through the optional `PlaceDetails` port and attach it to the response
 * as EPHEMERAL presentation data.
 *
 * Guarantees, frozen by the ADR §8:
 *   - no provider wired (`placeDetails = null`) -> resolves
 *     `{ pickup: null, destination: null }` WITHOUT any call;
 *   - only points carrying a non-null `place_id` are looked up;
 *   - the two lookups run in PARALLEL and each is best-effort: ANY provider
 *     failure (missing place, denied key, timeout, malformed answer) becomes
 *     `null` and is never rethrown;
 *   - the input is never mutated, and enrichment never changes coordinates —
 *     `latitude`/`longitude` remain the operational authority (ADR §1);
 *   - this is a READ concern: it is called by the customer request detail and
 *     the tracking read only, never by create/list/opportunity paths (no N+1).
 */
'use strict';

/** The truthful empty answer: used with no provider and for absent points. */
function emptyPlaceNames() {
  return { pickup: null, destination: null };
}

/**
 * Reads the name from either spelling: the Tow port documents snake_case while
 * the Service Location provider speaks its own camelCase port vocabulary.
 * Anything that is not a non-empty string is `null`.
 */
function readPlaceName(details) {
  if (!details || typeof details !== 'object') return null;
  const candidate = details.place_name ?? details.placeName;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return trimmed === '' ? null : trimmed;
}

function createPlaceNameEnricher({ placeDetails = null } = {}) {
  const provider = placeDetails && typeof placeDetails.getPlace === 'function'
    ? placeDetails
    : null;

  async function enrichPoint(point) {
    if (provider === null) return null;
    if (!point || typeof point !== 'object') return null;
    const placeId = point.place_id;
    if (placeId === null || placeId === undefined || placeId === '') return null;

    try {
      return readPlaceName(await provider.getPlace({ placeId }));
    } catch (error) {
      // Best-effort by contract: the caller falls back to the persisted
      // address (or to no presentation text at all). No provider payload, key
      // or place id is ever logged.
      return null;
    }
  }

  /**
   * @param {{pickup?: object|null, destination?: object|null}} points
   * @returns {Promise<{pickup: string|null, destination: string|null}>} frozen
   */
  async function enrichPoints({ pickup = null, destination = null } = {}) {
    if (provider === null) return emptyPlaceNames();
    const [pickupName, destinationName] = await Promise.all([
      enrichPoint(pickup),
      enrichPoint(destination),
    ]);
    return { pickup: pickupName, destination: destinationName };
  }

  return { enrichPoints };
}

module.exports = { createPlaceNameEnricher, emptyPlaceNames };
