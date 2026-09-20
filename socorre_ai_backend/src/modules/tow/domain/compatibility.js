/**
 * MVP-01 — centralized class/capacity compatibility policy.
 *
 * Prevents an invalid TowVehicle from accepting a service. The rule is the
 * normative one from `TOW-SERVICE-SPECIFICATION.md` §6:
 *
 *   requested.class ∈ vehicle.supported_vehicle_classes
 *   AND requested.weight_kg <= vehicle.max_towed_weight_kg
 *   AND weight_kg is mandatory for medium_truck / heavy_truck
 *
 * Kept pure so matching (MVP-03) cannot re-implement it.
 */
'use strict';

const { isVehicleClass, requiresWeight } = require('./vehicle-classes');

function isFinitePositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * The policy result is also the source of the per-dimension verdicts the
 * consumer contract publishes (`OpportunityCompatibility`). Both flags are
 * DERIVED from the same checks above — never recomputed, never a second policy:
 *
 *   vehicle_class_supported   the requested class is a valid vocabulary value
 *                             AND the vehicle declares it;
 *   weight_within_capacity    no weight reason was raised: the weight is present
 *                             when the class requires it, and it does not exceed
 *                             the vehicle capacity. A class that does not require
 *                             a weight (e.g. motorcycle) is vacuously within
 *                             capacity.
 *
 * A non-operational vehicle short-circuits before any dimension is evaluated, so
 * both flags are reported as `false` ("not established"), which is truthful and
 * unreachable for an emitted opportunity: only `eligible` vehicles are emitted.
 */
function isCompatible(vehicle, requested) {
  if (!vehicle || vehicle.active !== true) {
    return {
      compatible: false,
      code: 'vehicle_not_operational',
      reasons: ['vehicle_not_active'],
      vehicle_class_supported: false,
      weight_within_capacity: false,
    };
  }

  const request = requested || {};
  const reasons = [];

  const classSupported = isVehicleClass(request.class)
    && Array.isArray(vehicle.supported_vehicle_classes)
    && vehicle.supported_vehicle_classes.includes(request.class);

  if (!isVehicleClass(request.class)) {
    reasons.push('invalid_requested_class');
  } else if (!classSupported) {
    reasons.push('class_not_supported');
  }

  const weightMissing = requiresWeight(request.class) && !isFinitePositive(request.weight_kg);
  const weightExceeds = isFinitePositive(request.weight_kg)
    && Number.isFinite(vehicle.max_towed_weight_kg)
    && request.weight_kg > vehicle.max_towed_weight_kg;

  if (weightMissing) {
    reasons.push('weight_required');
  }
  if (weightExceeds) {
    reasons.push('weight_exceeds_capacity');
  }

  const weightWithinCapacity = !weightMissing && !weightExceeds;

  const dimensions = {
    vehicle_class_supported: classSupported,
    weight_within_capacity: weightWithinCapacity,
  };

  if (reasons.length > 0) {
    return { compatible: false, code: 'vehicle_not_compatible', reasons, ...dimensions };
  }
  return { compatible: true, code: null, reasons: [], ...dimensions };
}

module.exports = { isCompatible };
