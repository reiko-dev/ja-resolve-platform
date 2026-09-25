#!/usr/bin/env node
/**
 * TOW CLIENT DEMO — read-only readiness report.
 *
 * Prints the demo-cast readiness that the delivery gate asks for
 * (`DEMO_CUSTOMER_READY`, `DEMO_PARTNER_ONLINE`, ...) directly from the demo
 * database, without mutating anything. The partner checks mirror the real
 * matching predicate (`domain/matching.js` + `domain/documents.js`): a partner
 * that fails any of them returns `[]` in `GET /tow/partner/opportunities`.
 *
 * Guard: same fail-closed target rules of the demo tooling (`TOW_DEMO_ENV=demo`,
 * database name ending in `_demo`, loopback, non-privileged user). `status` is
 * read-only, so it requires no per-command opt-in flag.
 *
 * Usage (VPS):
 *   set -a; source /var/www/socorre-ai/shared/backend.env; set +a
 *   TOW_DEMO_ENV=demo node scripts/tow/demo-status.js
 */
'use strict';

require('dotenv').config();

const {
  DEMO_ACCOUNTS,
  assertDemoAuthorized,
  describeDemoTarget,
  createDemoConnection,
} = require('./demo-config');
const { MODULE_ROW } = require('../../database/migrations/003_mvp01_tow_foundation');
const { effectiveDocumentStatus } = require('../../src/modules/tow/domain/documents');

function yesNo(value) {
  return value ? 'YES' : 'NO';
}

function isOperationalCoordinate(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

async function collectDemoStatus(db, now = new Date()) {
  const customer = await db('users')
    .whereRaw('LOWER(email) = ?', [DEMO_ACCOUNTS.CUSTOMER.email.toLowerCase()])
    .first();
  const partnerUser = await db('users')
    .whereRaw('LOWER(email) = ?', [DEMO_ACCOUNTS.PARTNER.email.toLowerCase()])
    .first();
  const partner = partnerUser ? await db('partners').where({ user_id: partnerUser.id }).first() : null;
  const vehicle = partner
    ? await db('tow_vehicles').where({ partner_id: partner.id, active: true }).first()
    : null;
  const document = vehicle
    ? await db('tow_vehicle_documents')
      .where({ tow_vehicle_id: vehicle.id, document_type: 'vehicle_license' })
      .orderBy('id', 'desc')
      .first()
    : null;
  const module = await db('service_modules').where({ module_key: MODULE_ROW.module_key }).first();

  let requestCounts = { total: 0, open: 0, completed: 0 };
  let cashReceived = 0;
  if (customer) {
    const requests = await db('tow_requests').select('id', 'state').where({ customer_id: customer.id });
    requestCounts = {
      total: requests.length,
      open: requests.filter((row) => ['SEARCHING', 'NEGOTIATING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_TRANSIT', 'COMPLETION_PENDING'].includes(row.state)).length,
      completed: requests.filter((row) => row.state === 'COMPLETED').length,
    };
    const ids = requests.map((row) => row.id);
    if (ids.length > 0) {
      // `tow_payments.status` is the DB vocabulary: `RECEIVED` is exposed on the
      // wire as `CASH_RECEIVED` by the canonical payment projection.
      cashReceived = Number(await db('tow_payments').whereIn('tow_request_id', ids).where({ status: 'RECEIVED' }).count({ count: '*' }).first().then((row) => row.count)) || 0;
    }
  }

  const documentStatus = document ? effectiveDocumentStatus(document, now) : null;

  return {
    customer: {
      present: Boolean(customer),
      active: Boolean(customer && customer.is_active === true),
      ready: Boolean(customer && customer.is_active === true),
    },
    partner: {
      userPresent: Boolean(partnerUser),
      present: Boolean(partner),
      type: partner ? partner.type : null,
      approvalStatus: partner ? partner.approval_status : null,
      online: Boolean(partner && partner.is_online === true),
      available: Boolean(partner && partner.is_available === true),
      locationReady: Boolean(partner && isOperationalCoordinate(partner.latitude, partner.longitude)),
      vehicleReady: Boolean(vehicle && vehicle.active === true),
      vehiclePlate: vehicle ? vehicle.plate : null,
      documentStatus,
      documentReady: documentStatus === 'approved',
    },
    module: {
      present: Boolean(module),
      status: module ? module.status : null,
      enabled: Boolean(module && module.enabled === true),
    },
    requests: { ...requestCounts, cashReceived },
  };
}

async function main() {
  const target = assertDemoAuthorized(process.env, { purpose: 'status' });
  const db = createDemoConnection(target);
  try {
    const status = await collectDemoStatus(db);
    console.log(`[demo:status] target: ${describeDemoTarget(target)}`);
    console.log(`DEMO_CUSTOMER_READY=${yesNo(status.customer.ready)}`);
    console.log('DEMO_CUSTOMER_EMAIL=' + DEMO_ACCOUNTS.CUSTOMER.email);
    console.log(`DEMO_PARTNER_READY=${yesNo(status.partner.present && status.partner.vehicleReady)}`);
    console.log('DEMO_PARTNER_EMAIL=' + DEMO_ACCOUNTS.PARTNER.email);
    console.log(`DEMO_PARTNER_ONLINE=${yesNo(status.partner.online)}`);
    console.log(`DEMO_PARTNER_AVAILABLE=${yesNo(status.partner.available)}`);
    console.log(`DEMO_PARTNER_LOCATION_READY=${yesNo(status.partner.locationReady)}`);
    console.log(`DEMO_TOW_VEHICLE_READY=${yesNo(status.partner.vehicleReady)}`);
    console.log(`DEMO_DOCUMENTS_APPROVED=${yesNo(status.partner.documentReady)}`);
    console.log(`TOW_MODULE_STATUS=${status.module.status || 'MISSING'}`);
    console.log(`DEMO_REQUESTS_TOTAL=${status.requests.total}`);
    console.log(`DEMO_REQUESTS_OPEN=${status.requests.open}`);
    console.log(`DEMO_REQUESTS_COMPLETED=${status.requests.completed}`);
    console.log(`DEMO_REQUESTS_CASH_RECEIVED=${status.requests.cashReceived}`);
    if (!status.customer.ready || !status.partner.present || !status.partner.online
      || !status.partner.available || !status.partner.locationReady
      || !status.partner.vehicleReady || !status.partner.documentReady) {
      console.log('DEMO_STATUS=NOT_READY');
      process.exitCode = 1;
    } else {
      console.log('DEMO_STATUS=READY');
    }
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[demo:status] ${error && error.message ? error.message : error}`);
    console.error('DEMO_STATUS=FAIL');
    process.exitCode = 1;
  });
}

module.exports = { collectDemoStatus };
