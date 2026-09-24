/**
 * MVP-01 — Tow module controller (thin).
 */
'use strict';

const { handle } = require('./error-mapper');
const {
  serializeModule,
  serializeAdminModule,
  serializeServiceCatalogItem,
} = require('./serialize');

function createModuleController({ moduleService }) {
  return {
    getPublicStatus: handle(async (req, res) => {
      const status = await moduleService.getStatus();
      res.json({ success: true, data: serializeModule(status) });
    }),

    /**
     * SERVICE CATALOG — the public catalog consumed by the apps. Unauthenticated
     * on purpose: the Cliente/Parceiro must know which services exist and their
     * lifecycle status BEFORE logging in. DELETED services are hidden.
     */
    listServices: handle(async (req, res) => {
      const items = await moduleService.listCatalog();
      res.json({ success: true, data: { items: items.map(serializeServiceCatalogItem) } });
    }),

    adminGet: handle(async (req, res) => {
      const status = await moduleService.getStatus();
      res.json({ success: true, data: serializeAdminModule(status) });
    }),

    /**
     * Accepts the released `{ enabled, reason }` toggle AND the canonical
     * `{ status, reason }` lifecycle input. Exactly one is required; `enabled`
     * keeps mapping to ACTIVE/INACTIVE for the frozen operation.
     */
    adminToggle: handle(async (req, res) => {
      const { enabled, status: nextStatus, reason } = req.body || {};
      const status = nextStatus !== undefined
        ? await moduleService.setStatus({
          status: nextStatus,
          reason,
          adminUserId: req.user ? req.user.id : null,
        })
        : await moduleService.setEnabled({
          enabled,
          reason,
          adminUserId: req.user ? req.user.id : null,
        });
      res.json({ success: true, data: serializeAdminModule(status) });
    }),
  };
}

module.exports = { createModuleController };
