/**
 * PLATFORM SERVICE CATALOG — routers.
 *
 * Mounted by `src/app.js` at `/api/service-catalog` (public) and
 * `/api/admin/service-catalog` (admin). The public route is deliberately
 * unauthenticated, exactly like the released `/tow/services` projection it
 * replaces as the canonical catalog.
 */
'use strict';

const express = require('express');
const { auth } = require('../../../middleware/auth');
const { requireAdmin } = require('../../../middleware/requireAdmin');
const { createCatalogController } = require('./controller');

function createServiceCatalogRouter({ services }) {
  const router = express.Router();
  const controller = createCatalogController({ catalogService: services.catalogService });

  router.get('/', controller.listPublic);

  return router;
}

function createAdminServiceCatalogRouter({ services }) {
  const router = express.Router();
  const controller = createCatalogController({ catalogService: services.catalogService });

  router.get('/', auth, requireAdmin, controller.adminList);
  router.get('/:key', auth, requireAdmin, controller.adminGet);
  router.patch('/:key', auth, requireAdmin, controller.adminPatch);

  return router;
}

module.exports = { createServiceCatalogRouter, createAdminServiceCatalogRouter };
