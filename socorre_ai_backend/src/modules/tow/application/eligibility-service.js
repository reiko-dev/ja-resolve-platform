/**
 * MVP-01 — operational eligibility application service.
 *
 * Loads the four inputs through ports and delegates the decision to the pure
 * domain `evaluateEligibility`. This is the seam later MVP deliveries call
 * before matching/proposing.
 */
'use strict';

const { MODULE_KEY, TowError, evaluateEligibility } = require('../domain');

function createEligibilityService({
  catalogService,
  vehicleRepository,
  documentRepository,
  partnerRepository,
  clock,
}) {
  if (!catalogService) throw new TypeError('createEligibilityService requires a catalogService port');
  if (!vehicleRepository) throw new TypeError('createEligibilityService requires a vehicleRepository port');
  if (!documentRepository) throw new TypeError('createEligibilityService requires a documentRepository port');
  if (!partnerRepository) throw new TypeError('createEligibilityService requires a partnerRepository port');
  if (!clock) throw new TypeError('createEligibilityService requires a clock port');

  async function evaluate({ partnerId, requested, vehicleId = null } = {}) {
    // PLATFORM SERVICE CATALOG — the gate is the platform registry row for
    // `service_key=tow`; `ensureService` preserves the legacy lazy default.
    const moduleStatus = await catalogService.ensureService(MODULE_KEY);
    const partner = await partnerRepository.findById(partnerId);
    const vehicle = vehicleId
      ? await vehicleRepository.findByPartnerAndId(partnerId, vehicleId)
      : await vehicleRepository.findActiveByPartner(partnerId);
    const documents = vehicle ? await documentRepository.listByVehicle(vehicle.id) : [];
    return evaluateEligibility({
      partner,
      moduleStatus,
      vehicle,
      documents,
      requested,
      now: clock.now(),
    });
  }

  async function assertEligible(args) {
    const result = await evaluate(args);
    if (!result.eligible) {
      throw new TowError(result.code, 'Tow partner is not operationally eligible', {
        details: { reasons: result.reasons },
      });
    }
    return result;
  }

  return { evaluate, assertEligible };
}

module.exports = { createEligibilityService };
