/**
 * MVP-01 — operational eligibility composition.
 *
 *   partner identity (type = tow)
 *   + module availability
 *   + active TowVehicle
 *   + required documents approved and valid
 *   + compatibility (class/capacity)
 *   = eligible Tow partner
 *
 * Pure function over already-loaded data. Application services load the inputs
 * through ports and delegate here; controllers never compute this.
 *
 * SERVICE CATALOG — the module/catalog check is OPT-IN. It is evaluated ONLY
 * when the caller supplies a `moduleStatus` (the MVP-01 operational eligibility
 * seam, where a disabled module must surface `service_module_disabled` even for
 * a non-tow partner). Post-creation flows (matching, opportunities, proposals)
 * deliberately do NOT pass it: once a request exists, the current catalog status
 * must never invalidate it. The status gates NEW requests at creation only.
 *
 * Check order when the module is supplied: module availability first, then
 * partner identity, then vehicle/documents/compatibility.
 */
'use strict';

const { isModuleEnabled } = require('./availability');
const { PARTNER_TYPE } = require('./identity');
const {
  REQUIRED_DOCUMENT_TYPES,
  areRequiredDocumentsSatisfied,
} = require('./documents');
const { isCompatible } = require('./compatibility');

function evaluateEligibility({ partner, moduleStatus = null, vehicle, documents, requested, now } = {}) {
  if (moduleStatus !== null && moduleStatus !== undefined && !isModuleEnabled(moduleStatus)) {
    return { eligible: false, code: 'service_module_disabled', reasons: ['module_disabled'] };
  }

  if (!partner) {
    return { eligible: false, code: 'partner_not_operational', reasons: ['partner_missing'] };
  }
  if (partner.type !== PARTNER_TYPE) {
    return { eligible: false, code: 'partner_not_operational', reasons: ['partner_not_tow'] };
  }

  if (!vehicle || vehicle.active !== true) {
    return { eligible: false, code: 'vehicle_not_operational', reasons: ['no_active_vehicle'] };
  }

  const list = Array.isArray(documents) ? documents : [];
  const hasRequiredType = list.some((document) => REQUIRED_DOCUMENT_TYPES.includes(document.document_type));
  if (!hasRequiredType) {
    return { eligible: false, code: 'tow_document_required', reasons: ['required_document_missing'] };
  }
  if (!areRequiredDocumentsSatisfied(list, now)) {
    return { eligible: false, code: 'tow_document_not_approved', reasons: ['required_document_not_approved'] };
  }

  const compatibility = isCompatible(vehicle, requested);
  if (!compatibility.compatible) {
    return {
      eligible: false,
      code: compatibility.code,
      reasons: compatibility.reasons,
      compatibility,
    };
  }

  return { eligible: true, code: null, reasons: [], compatibility };
}

module.exports = { evaluateEligibility };
