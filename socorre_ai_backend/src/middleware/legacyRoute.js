const legacyRouteRegistry = require('../services/legacyRouteRegistry');

function legacyRoute(officialRoute, legacyKey = null) {
  return (req, res, next) => {
    const resolvedLegacyKey = legacyKey || req.baseUrl || req.originalUrl;
    legacyRouteRegistry.record({
      legacyKey: resolvedLegacyKey,
      officialRoute,
      method: req.method,
      path: req.originalUrl,
    });

    res.set('Deprecation', 'true');
    res.set('X-Socorre-Legacy-Route', 'true');
    res.set('X-Socorre-Official-Route', officialRoute);
    res.set('X-Socorre-Legacy-Key', resolvedLegacyKey);
    next();
  };
}

module.exports = legacyRoute;
