/**
 * PLATFORM SERVICE CATALOG — the initial platform services.
 *
 * These are the services the product already displays today. `key` is the
 * stable identity consumed by the apps (never the display name); `name` is the
 * human copy; `sort_order` is the canonical catalog ordering; `initialStatus`
 * is the LAUNCH POLICY of the platform: the lifecycle status a service starts
 * with when it is first provisioned.
 *
 * Launch policy (the single bootstrap authority):
 *   - `tow` is the only LAUNCHED service: it starts ACTIVE;
 *   - the other five belong to the product but are NOT launched yet: they
 *     start SOON. They are visible in the catalog (readiness information) but
 *     block new business until an administrator releases them to ACTIVE.
 * The statuses are the canonical domain constants — never string literals.
 *
 * The list is FROZEN data: migration 010 provisions exactly these rows, and the
 * apps match availability by `key` only. Renaming `name` is a presentation
 * change; changing a `key` is a product migration.
 *
 *   mechanic      Mecânico            SOON
 *   tire_repair   Borracheiro         SOON
 *   electrical    Elétrica            SOON
 *   tow           Guincho             ACTIVE
 *   store         Loja                SOON
 *   gas_station   Posto de Gasolina   SOON
 */
'use strict';

const { ACTIVE_SERVICE_STATUS, SOON_SERVICE_STATUS } = require('./status');

const INITIAL_SERVICES = Object.freeze([
  Object.freeze({
    key: 'mechanic',
    name: 'Mecânico',
    sortOrder: 10,
    initialStatus: SOON_SERVICE_STATUS,
  }),
  Object.freeze({
    key: 'tire_repair',
    name: 'Borracheiro',
    sortOrder: 20,
    initialStatus: SOON_SERVICE_STATUS,
  }),
  Object.freeze({
    key: 'electrical',
    name: 'Elétrica',
    sortOrder: 30,
    initialStatus: SOON_SERVICE_STATUS,
  }),
  Object.freeze({
    key: 'tow',
    name: 'Guincho',
    sortOrder: 40,
    initialStatus: ACTIVE_SERVICE_STATUS,
  }),
  Object.freeze({
    key: 'store',
    name: 'Loja',
    sortOrder: 50,
    initialStatus: SOON_SERVICE_STATUS,
  }),
  Object.freeze({
    key: 'gas_station',
    name: 'Posto de Gasolina',
    sortOrder: 60,
    initialStatus: SOON_SERVICE_STATUS,
  }),
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
