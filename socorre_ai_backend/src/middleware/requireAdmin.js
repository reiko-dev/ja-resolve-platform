/**
 * Platform admin authorization middleware.
 *
 * Extracted from the Tow module so PLATFORM-level routers (the service catalog)
 * can guard admin surfaces without depending on a feature module. The response
 * envelope is the canonical one already used by the Tow admin routes.
 */
'use strict';

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Acesso negado. Apenas administradores podem acessar esta rota.',
      error: { code: 'forbidden' },
    });
  }
  return next();
}

module.exports = { requireAdmin };
