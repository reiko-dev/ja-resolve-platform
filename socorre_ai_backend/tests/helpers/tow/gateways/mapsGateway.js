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

module.exports = { FakeMapsGateway, createFakeMapsGateway, DEFAULT_ROUTE };
