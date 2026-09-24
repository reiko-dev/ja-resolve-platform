/**
 * PLATFORM SERVICE CATALOG — provision the initial platform services.
 *
 * `service_modules` is the platform service registry (migration 003 seeded
 * `tow`; migration 009 added the lifecycle). This migration makes the registry
 * truly platform-level by provisioning the services the product already
 * displays:
 *
 *   mechanic      Mecânico
 *   tire_repair   Borracheiro
 *   electrical    Elétrica
 *   tow           Guincho
 *   store         Loja
 *   gas_station   Posto de Gasolina
 *
 * Invariants:
 *   - ADDITIVE and IDEMPOTENT: `onConflict('module_key').ignore()` inserts only
 *     missing rows;
 *   - PRESERVES existing configuration: an existing Tow row (or any row) keeps
 *     its `status`, `disabled_reason` and `updated_by`. Only the Tow display
 *     name is filled when still NULL and the Tow `sort_order` when still at its
 *     003 default (0) — never a status reset;
 *   - no functional/business data: catalog rows are configuration.
 *
 * Deterministic: no environment value, no clock, no seed.
 */
'use strict';

const { INITIAL_SERVICES, TOW_SERVICE_KEY } = require('../../src/modules/service-catalog/domain/initial-services');

async function upsertInitialService(knex, service) {
  await knex('service_modules')
    .insert({
      module_key: service.key,
      service_key: service.key,
      partner_type: service.key,
      name: service.name,
      status: 'ACTIVE',
      sort_order: service.sortOrder,
      enabled: true,
    })
    .onConflict('module_key')
    .ignore();
}

exports.up = async function up(knex) {
  for (const service of INITIAL_SERVICES) {
    // Sequential on purpose: deterministic ordering and a simple conflict path.
    // eslint-disable-next-line no-await-in-loop
    await upsertInitialService(knex, service);
  }

  // Preserve the current Tow configuration; fill only the structural defaults
  // the platform catalog now guarantees (a custom name/order is never touched).
  await knex('service_modules')
    .where({ module_key: TOW_SERVICE_KEY })
    .whereNull('name')
    .update({ name: 'Guincho' });

  await knex('service_modules')
    .where({ module_key: TOW_SERVICE_KEY })
    .where({ sort_order: 0 })
    .update({ sort_order: 40 });
};

exports.down = async function down(knex) {
  // Reverts the provisioning of the catalog-only services. `tow` is NOT removed:
  // it is the structural module row owned by migration 003.
  const catalogOnlyKeys = INITIAL_SERVICES
    .map((service) => service.key)
    .filter((key) => key !== TOW_SERVICE_KEY);
  await knex('service_modules').whereIn('module_key', catalogOnlyKeys).del();
};
