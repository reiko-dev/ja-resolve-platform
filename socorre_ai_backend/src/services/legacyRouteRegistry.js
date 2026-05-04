class LegacyRouteRegistry {
  constructor() {
    this.routes = new Map();
  }

  record({ legacyKey, officialRoute, method, path }) {
    const key = legacyKey || path;
    const now = new Date().toISOString();
    const existing = this.routes.get(key) || {
      legacy_key: key,
      official_route: officialRoute,
      total_hits: 0,
      methods: {},
      first_seen_at: now,
      last_seen_at: now,
      last_path: path,
    };

    existing.total_hits += 1;
    existing.official_route = officialRoute;
    existing.last_seen_at = now;
    existing.last_path = path;
    existing.methods[method] = (existing.methods[method] || 0) + 1;

    this.routes.set(key, existing);
    return existing;
  }

  getSnapshot() {
    return Array.from(this.routes.values()).sort((a, b) => b.total_hits - a.total_hits);
  }

  reset() {
    this.routes.clear();
  }
}

module.exports = new LegacyRouteRegistry();
