/**
 * MVP-01 — HTTP middleware helpers (thin).
 */
'use strict';

const { PARTNER_TYPE } = require('../domain');

function forbidden(res, message) {
  return res.status(403).json({ success: false, message, error: { code: 'forbidden' } });
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return forbidden(res, 'Acesso negado. Apenas administradores podem acessar esta rota.');
  }
  return next();
}

function requireTowPartner(req, res, next) {
  if (!req.user || req.user.role !== 'partner'
    || req.user.partner_type !== PARTNER_TYPE
    || req.user.partner_id === null || req.user.partner_id === undefined) {
    return forbidden(res, 'Acesso negado. Apenas parceiros do módulo Tow.');
  }
  return next();
}

/**
 * MVP-03 — the tow REQUEST endpoints are customer-only.
 *
 * A partner or an admin is rejected with 403, matching the legacy
 * `POST /api/emergency-requests` authorization (`['user']`): the customer
 * history is personal data, and a partner sees the same work through the
 * opportunity feed instead.
 */
function requireCustomer(req, res, next) {
  // `req.user` is the persisted user row (`users.*` plus the partner context),
  // so the customer id is `req.user.id` — there is no `userId` field.
  if (!req.user || req.user.role !== 'user'
    || req.user.id === null || req.user.id === undefined) {
    return forbidden(res, 'Acesso negado. Apenas clientes podem acessar esta rota.');
  }
  return next();
}

/**
 * MVP-05 — the tracking READ is the only route of the module that serves two
 * different principals.
 *
 * It is not a relaxation of `requireCustomer`/`requireTowPartner`: the caller
 * must still be EXACTLY one of them (a customer with an id, or a tow partner with
 * a partner id), and the application layer then applies the matching ownership
 * predicate — owner customer or assigned partner. An admin, a non-tow partner or
 * a partner row without an id is rejected here, so no downstream branch ever has
 * to cope with a principal it does not understand.
 */
function requireCustomerOrTowPartner(req, res, next) {
  if (!req.user) return forbidden(res, 'Acesso negado.');

  const isCustomer = req.user.role === 'user'
    && req.user.id !== null && req.user.id !== undefined;
  const isTowPartner = req.user.role === 'partner'
    && req.user.partner_type === PARTNER_TYPE
    && req.user.partner_id !== null && req.user.partner_id !== undefined;

  if (!isCustomer && !isTowPartner) {
    return forbidden(res, 'Acesso negado. Apenas o cliente do pedido ou o parceiro atribuído podem acessar esta rota.');
  }
  return next();
}

module.exports = { requireAdmin, requireTowPartner, requireCustomer, requireCustomerOrTowPartner };
