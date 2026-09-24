/**
 * PLATFORM SERVICE CATALOG — thin HTTP controller.
 *
 * Public:  GET  /api/service-catalog
 * Admin:   GET  /api/admin/service-catalog
 *          GET  /api/admin/service-catalog/{key}
 *          PATCH /api/admin/service-catalog/{key}
 */
'use strict';

const { handle } = require('./error-mapper');
const { serializeCatalogItem, serializeAdminItem } = require('./serialize');
const { notFoundError } = require('../domain');

function createCatalogController({ catalogService }) {
  return {
    /**
     * The canonical public catalog, unauthenticated on purpose: the apps must
     * know which services exist and their lifecycle BEFORE logging in. A
     * successful response is the authoritative complete catalog; DELETED
     * services are omitted.
     */
    listPublic: handle(async (req, res) => {
      const items = await catalogService.listCatalog();
      res.json({ success: true, data: { items: items.map(serializeCatalogItem) } });
    }),

    adminList: handle(async (req, res) => {
      const items = await catalogService.listAdmin();
      res.json({ success: true, data: { items: items.map(serializeAdminItem) } });
    }),

    adminGet: handle(async (req, res) => {
      const row = await catalogService.getService(req.params.key);
      if (!row) throw notFoundError(`Unknown service key "${req.params.key}"`, { field: 'key' });
      res.json({ success: true, data: serializeAdminItem(row) });
    }),

    /**
     * The canonical lifecycle transition for one service key. Accepts
     * `{ status, reason }` (canonical) and `{ enabled, reason }` (the released
     * boolean, mapped to ACTIVE/INACTIVE); `status` takes precedence.
     */
    adminPatch: handle(async (req, res) => {
      const { enabled, status: nextStatus, reason } = req.body || {};
      const updatedBy = req.user ? req.user.id : null;
      const row = nextStatus !== undefined
        ? await catalogService.setStatus({ key: req.params.key, status: nextStatus, reason, updatedBy })
        : await catalogService.setEnabled({ key: req.params.key, enabled, reason, updatedBy });
      res.json({ success: true, data: serializeAdminItem(row) });
    }),
  };
}

module.exports = { createCatalogController };
