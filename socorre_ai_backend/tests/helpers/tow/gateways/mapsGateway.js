/**
 * T00 — deterministic fake Maps / Routes gateway port.
 *
 * BOUNDARY (do not cross in T00)
 * ------------------------------
 * This is a **port double**, not a pricing engine and not a distance
 * calculator. It:
 *   - records every call (so tests can assert what was requested);
 *   - replays a caller-supplied, deterministic canned response;
 *   - NEVER computes price, never applies `ROUND_HALF_UP`, never converts
 *     meters to km, never expands radius, never falls back to Haversine.
 *
 * Pricing/distance rules belong to TOW-PRICING-CONTRACT.md and are implemented
 * by T01+; a fake that "helpfully" computed them would hide real defects.
 *
 * Interface mirrors the Google Routes / Distance Matrix shape the Tow contract
 * depends on: `{ distanceMeters, durationSeconds, geometry }` in meters and
 * seconds (see TOW-API-CONTRACT.md §3 — distance is integer meters).
 */
'use strict';

const DEFAULT_ROUTE = Object.freeze({
  distanceMeters: 8400,
  durationSeconds: 1320,
  geometry: Object.freeze({
    type: 'LineString',
    coordinates: Object.freeze([
      Object.freeze([-46.655981, -23.561684]),
      Object.freeze([-46.6388, -23.5475]),
    ]),
  }),
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class FakeMapsGateway {
  constructor(options = {}) {
    this.route = options.route ? clone(options.route) : clone(DEFAULT_ROUTE);
    this.failure = options.failure || null;
    this.calls = [];
    this.name = 'fake-maps';
  }

  /** Queue-free deterministic behaviour: every call replays the same payload. */
  async computeRoute(request) {
    this.calls.push({ method: 'computeRoute', request: clone(request) });
    if (this.failure) {
      const error = new Error(this.failure.message || 'fake maps failure');
      error.code = this.failure.code || 'MAPS_UNAVAILABLE';
      throw error;
    }
    return clone(this.route);
  }

  /** Alias used by some consumers of the Distance Matrix shape. */
  async computeDistanceMatrix(request) {
    this.calls.push({ method: 'computeDistanceMatrix', request: clone(request) });
    if (this.failure) {
      const error = new Error(this.failure.message || 'fake maps failure');
      error.code = this.failure.code || 'MAPS_UNAVAILABLE';
      throw error;
    }
    const { distanceMeters, durationSeconds } = this.route;
    return {
      rows: [{ elements: [{ distanceMeters, durationSeconds, status: 'OK' }] }],
    };
  }

  callCount(method) {
    if (!method) return this.calls.length;
    return this.calls.filter((call) => call.method === method).length;
  }

  lastCall(method) {
    const filtered = method ? this.calls.filter((call) => call.method === method) : this.calls;
    return filtered.length > 0 ? filtered[filtered.length - 1] : null;
  }

  reset() {
    this.calls = [];
    return this;
  }
}

function createFakeMapsGateway(options) {
  return new FakeMapsGateway(options);
}

/**
 * MVP-02 — deterministic fake `RouteProvider` port.
 *
 * Same boundary rule as `FakeMapsGateway`: it records what was requested and
 * replays a caller-supplied payload. It contains no pricing, no meter/kilometre
 * conversion and no straight-line fallback — a fake that "helpfully" priced the
 * route would hide exactly the defects the real adapter must be tested for.
 *
 * Default legs sum to 14,350 m, the frozen TOW-PRICING-CONTRACT example.
 */
const DEFAULT_ROUTE_PROVIDER = Object.freeze({
  providerToPickup: Object.freeze({ distance_meters: 7000, duration_seconds: 900 }),
  pickupToDestination: Object.freeze({ distance_meters: 7350, duration_seconds: 1200 }),
  encodedPolyline: 'fake-encoded-polyline',
});

class FakeRouteProvider {
  constructor(options = {}) {
    this.providerToPickup = options.providerToPickup === undefined
      ? clone(DEFAULT_ROUTE_PROVIDER.providerToPickup)
      : clone(options.providerToPickup);
    this.pickupToDestination = options.pickupToDestination === undefined
      ? clone(DEFAULT_ROUTE_PROVIDER.pickupToDestination)
      : clone(options.pickupToDestination);
    this.encodedPolyline = options.encodedPolyline === undefined
      ? DEFAULT_ROUTE_PROVIDER.encodedPolyline
      : clone(options.encodedPolyline);
    this.failure = options.failure || null;
    this.calls = [];
    this.name = 'fake-route-provider';
  }

  /** Queue-free deterministic behaviour: every call replays the same payload. */
  async computeRoute(request = {}) {
    this.calls.push({ method: 'computeRoute', request: clone(request) });
    if (this.failure) {
      const error = new Error(this.failure.message || 'fake route provider failure');
      error.code = this.failure.code || 'ROUTE_PROVIDER_UNAVAILABLE';
      throw error;
    }

    const hasPickup = request.pickup !== undefined && request.pickup !== null;
    return {
      provider_to_pickup: hasPickup ? clone(this.providerToPickup) : null,
      pickup_to_destination: clone(this.pickupToDestination),
      encoded_polyline: clone(this.encodedPolyline),
    };
  }

  callCount(method) {
    if (!method) return this.calls.length;
    return this.calls.filter((call) => call.method === method).length;
  }

  lastCall(method) {
    const filtered = method ? this.calls.filter((call) => call.method === method) : this.calls;
    return filtered.length > 0 ? filtered[filtered.length - 1] : null;
  }

  reset() {
    this.calls = [];
    return this;
  }
}

function createFakeRouteProvider(options) {
  return new FakeRouteProvider(options);
}

module.exports = {
  FakeMapsGateway,
  createFakeMapsGateway,
  DEFAULT_ROUTE,
  FakeRouteProvider,
  createFakeRouteProvider,
  DEFAULT_ROUTE_PROVIDER,
};
