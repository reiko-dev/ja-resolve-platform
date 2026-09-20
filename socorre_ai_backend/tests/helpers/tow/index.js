/**
 * T00 — Tow deterministic test foundation (barrel).
 *
 *   const tow = require('../helpers/tow');
 *   const clock = tow.createFakeClock();
 *   const maps = tow.createFakeMapsGateway();
 *   const payments = tow.createFakePaymentGateway();
 *   const auth = await tow.createTowPartnerAuth();
 *   const payload = tow.createTowBuilders({ clock }).createTowRequestInput();
 */
'use strict';

const clock = require('./clock');
const factories = require('./factories');
const builders = require('./builders');
const auth = require('./auth');
const mapsGateway = require('./gateways/mapsGateway');
const paymentGateway = require('./gateways/paymentGateway');

module.exports = {
  ...clock,
  ...factories,
  ...builders,
  ...auth,
  ...mapsGateway,
  ...paymentGateway,
  gateways: { mapsGateway, paymentGateway },
  createFakeGateways(options = {}) {
    return {
      maps: mapsGateway.createFakeMapsGateway(options.maps),
      payments: paymentGateway.createFakePaymentGateway(options.payments),
      // MVP-02 — the authoritative RouteProvider port double.
      routes: mapsGateway.createFakeRouteProvider(options.routes),
    };
  },
};
