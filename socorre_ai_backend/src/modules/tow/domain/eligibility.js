/**
 * MVP-01 — operational eligibility composition.
 *
 *   module availability
 *   + active TowVehicle
 *   + required documents approved and valid
 *   + compatibility (class/capacity)
 *   = eligible Tow partner
 *
 * Pure function over already-loaded data. Application services load the four
 * inputs through ports and delegate here; controllers never compute this.
 */
'use strict';

const { isModuleEnabled } = require('./availability');
const {
  REQUIRED_DOCUMENT_TYPES,
  areRequiredDocumentsSatisfied,
} = require('./documents');
const { isCompatible } = require('./compatibility');

function evaluateEligibility({ moduleStatus, vehicle, documents, requested, now } = {}) {
  if (!isModuleEnabled(moduleStatus)) {
    return { eligible: false, code: 'service_module_disabled', reasons: ['module_disabled'] };
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
    return { eligible: false, code: compatibility.code, reasons: compatibility.reasons };
  }

  return { eligible: true, code: null, reasons: [] };
}

module.exports = { evaluateEligibility };
