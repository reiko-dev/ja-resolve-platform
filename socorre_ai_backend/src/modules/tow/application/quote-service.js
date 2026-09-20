/**
 * MVP-02 — `quoteTow` application operation.
 *
 * Composes the two authorities the customer-facing price depends on:
 *
 *   RouteProvider (infrastructure)  ->  route_quote (exact legs + total)
 *   domain pricing policy (pure)    ->  calculated_price (integer cents)
 *
 * and freezes the tariff that produced the price, so the returned quote is a
 * snapshot rather than a live reference to a row that can change underneath it.
 *
 * Guarantees enforced here:
 *   - coordinates are validated, then the tariff is FULLY normalized with the
 *     same strict primitive the price computation uses (`normalizeTowPricingForQuote`),
 *     and only then is the provider called — an invalid local tariff can never
 *     consume a provider call and fail afterwards (EXT-MVP02-1);
 *   - the distance is whatever the provider returned, summed leg by leg;
 *   - client-supplied distance/price fields are ignored outright;
 *   - a provider failure becomes `external_dependency_unavailable` with no price
 *     at all — never an estimate and never a straight-line fallback.
 */
'use strict';

const {
  TowError,
  validationError,
  externalDependencyError,
  validateGeoPoint,
  createRouteQuote,
  computeTowPrice,
  normalizeTowPricingForQuote,
} = require('../domain');

const CURRENCY = 'BRL';

function createQuoteService({ routeProvider, vehicleRepository = null, clock } = {}) {
  if (!routeProvider || typeof routeProvider.computeRoute !== 'function') {
    throw new TypeError('createQuoteService requires a RouteProvider port');
  }
  if (!clock || typeof clock.now !== 'function') {
    throw new TypeError('createQuoteService requires a Clock port');
  }

  /**
   * Resolves the tariff that will be frozen into the quote. An explicitly
   * supplied backend tariff wins; otherwise the vehicle is resolved through the
   * VehicleRepository port. Both paths run the SAME strict normalization used by
   * `computeTowPrice`, so everything the price needs is validated here — before
   * `quoteTow` reaches the route provider.
   */
  async function resolveTariff(input) {
    if (input.tariff !== undefined && input.tariff !== null) {
      return normalizeTowPricingForQuote(input.tariff);
    }
    if (!vehicleRepository || input.partnerId === undefined || input.vehicleId === undefined) {
      throw validationError('tariff is required');
    }

    const vehicle = await vehicleRepository.findByPartnerAndId(input.partnerId, input.vehicleId);
    if (!vehicle) {
      throw new TowError('not_found', 'TowVehicle not found');
    }

    return normalizeTowPricingForQuote(vehicle.pricing);
  }

  async function quoteTow(input = {}) {
    const providerPoint = validateGeoPoint(input.provider, 'provider');
    const pickupPoint = validateGeoPoint(input.pickup, 'pickup');
    const destinationPoint = validateGeoPoint(input.destination, 'destination');
    const tariff = await resolveTariff(input);

    let routeQuote;
    try {
      const route = await routeProvider.computeRoute({
        origin: providerPoint,
        destination: destinationPoint,
        pickup: pickupPoint,
      });
      routeQuote = createRouteQuote(route);
    } catch {
      // A transport failure and a malformed provider payload are the same thing
      // from the caller's perspective: the authoritative distance could not be
      // established, so there is no price. The original error is deliberately
      // discarded rather than attached — it can carry a key, a raw payload or a
      // stack, and `external_dependency_unavailable` must leak none of them.
      throw externalDependencyError('Route provider is unavailable');
    }

    const price = computeTowPrice({
      total_distance_meters: routeQuote.total_distance_meters,
      minimum_charge_cents: tariff.minimum_charge_cents,
      included_km: tariff.included_km,
      price_per_additional_km_cents: tariff.price_per_additional_km_cents,
    });

    return Object.freeze({
      route_quote: routeQuote,
      pricing_snapshot: Object.freeze({
        minimum_charge_cents: tariff.minimum_charge_cents,
        included_km: tariff.included_km,
        included_meters: tariff.included_meters,
        price_per_additional_km_cents: tariff.price_per_additional_km_cents,
      }),
      calculated_price: Object.freeze({
        amount_cents: price.final_price_cents,
        currency: CURRENCY,
      }),
      generated_at: clock.now().toISOString(),
    });
  }

  return { quoteTow };
}

module.exports = { createQuoteService };
