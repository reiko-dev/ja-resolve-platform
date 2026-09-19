/**
 * MVP-01 — UNIT suite for the application eligibility service.
 *
 * The composition of module availability + active vehicle + valid documents +
 * compatibility is owned by the domain policy; this suite proves the service
 * wires the four sources and surfaces the canonical error code.
 *
 * RED-first: written before `src/modules/tow/application` exists.
 */
'use strict';

const { createEligibilityService } = require('../../../src/modules/tow/application/eligibility-service');
const domain = require('../../../src/modules/tow/domain');

function fakeRepositories({ module = { enabled: true }, vehicle = null, documents = [] } = {}) {
  return {
    moduleRepository: { getByKey: async () => module },
    vehicleRepository: { findActiveByPartner: async () => vehicle },
    documentRepository: { listByVehicle: async () => documents },
    clock: { now: () => new Date('2026-06-01T00:00:00.000Z') },
  };
}

const requested = { class: 'light_vehicle', weight_kg: 1200 };
const vehicle = { active: true, supported_vehicle_classes: ['light_vehicle'], max_towed_weight_kg: 3000 };
const approvedDoc = { document_type: 'vehicle_license', status: 'approved', expires_at: null };

describe('MVP-01 UNIT — eligibility service', () => {
  test('eligible when module, active vehicle, approved document and compatibility hold', async () => {
    const service = createEligibilityService(fakeRepositories({ vehicle, documents: [approvedDoc] }));
    await expect(service.evaluate({ partnerId: 1, requested })).resolves.toMatchObject({ eligible: true, code: null });
  });

  test('disabled module throws service_module_disabled on assert', async () => {
    const service = createEligibilityService(fakeRepositories({ module: { enabled: false }, vehicle, documents: [approvedDoc] }));
    const result = await service.evaluate({ partnerId: 1, requested });
    expect(result).toMatchObject({ eligible: false, code: 'service_module_disabled' });
    await expect(service.assertEligible({ partnerId: 1, requested })).rejects.toBeInstanceOf(domain.TowError);
  });

  test('no active vehicle => vehicle_not_operational', async () => {
    const service = createEligibilityService(fakeRepositories({ documents: [approvedDoc] }));
    await expect(service.evaluate({ partnerId: 1, requested })).resolves.toMatchObject({
      eligible: false, code: 'vehicle_not_operational',
    });
  });

  test('pending document => tow_document_not_approved', async () => {
    const service = createEligibilityService(fakeRepositories({
      vehicle,
      documents: [{ document_type: 'vehicle_license', status: 'pending' }],
    }));
    await expect(service.evaluate({ partnerId: 1, requested })).resolves.toMatchObject({
      eligible: false, code: 'tow_document_not_approved',
    });
  });

  test('incompatible class => vehicle_not_compatible', async () => {
    const service = createEligibilityService(fakeRepositories({ vehicle, documents: [approvedDoc] }));
    await expect(service.evaluate({ partnerId: 1, requested: { class: 'heavy_truck', weight_kg: 9000 } }))
      .resolves.toMatchObject({ eligible: false, code: 'vehicle_not_compatible' });
  });
});
