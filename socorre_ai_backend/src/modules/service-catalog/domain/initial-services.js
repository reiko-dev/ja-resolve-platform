/**
 * PLATFORM SERVICE CATALOG — the initial platform services.
 *
 * These are the services the product already displays today. `key` is the
 * stable identity consumed by the apps (never the display name); `name` is the
 * human copy; `sort_order` is the canonical catalog ordering.
 *
 * The list is FROZEN data: migration 010 provisions exactly these rows, and the
 * apps match availability by `key` only. Renaming `name` is a presentation
 * change; changing a `key` is a product migration.
 *
 *   mechanic      Mecânico
 *   tire_repair   Borracheiro
 *   electrical    Elétrica
 *   tow           Guincho
 *   store         Loja
 *   gas_station   Posto de Gasolina
 */
'use strict';

const INITIAL_SERVICES = Object.freeze([
  Object.freeze({ key: 'mechanic', name: 'Mecânico', sortOrder: 10 }),
  Object.freeze({ key: 'tire_repair', name: 'Borracheiro', sortOrder: 20 }),
  Object.freeze({ key: 'electrical', name: 'Elétrica', sortOrder: 30 }),
  Object.freeze({ key: 'tow', name: 'Guincho', sortOrder: 40 }),
  Object.freeze({ key: 'store', name: 'Loja', sortOrder: 50 }),
  Object.freeze({ key: 'gas_station', name: 'Posto de Gasolina', sortOrder: 60 }),
]);

const INITIAL_SERVICE_KEYS = Object.freeze(INITIAL_SERVICES.map((service) => service.key));

const TOW_SERVICE_KEY = 'tow';

function initialServiceByKey(key) {
  return INITIAL_SERVICES.find((service) => service.key === key) || null;
}

module.exports = {
  INITIAL_SERVICES,
  INITIAL_SERVICE_KEYS,
  TOW_SERVICE_KEY,
  initialServiceByKey,
};
