/**
 * MVP-01 — Tow domain barrel.
 *
 * Pure domain: identity, errors, vocabularies, policies and invariants. No
 * Express, Knex, filesystem or provider import is allowed in this directory
 * (enforced by `tests/tow/mvp01/towArchitectureBoundary.test.js`).
 */
'use strict';

const identity = require('./identity');
const errors = require('./errors');
const integers = require('./integers');
const vehicleClasses = require('./vehicle-classes');
const pricing = require('./pricing');
const geo = require('./geo');
const route = require('./route');
const towVehicle = require('./tow-vehicle');
const documents = require('./documents');
const availability = require('./availability');
const compatibility = require('./compatibility');
const eligibility = require('./eligibility');
const settings = require('./settings');
const towRequest = require('./tow-request');
const idempotency = require('./idempotency');
const matching = require('./matching');
const ids = require('./ids');
const towProposal = require('./tow-proposal');
const assignment = require('./assignment');
const towRequestStateMachine = require('./tow-request-state-machine');
const towExecutionInput = require('./tow-execution-input');
const cancellation = require('./cancellation');
const towPayment = require('./tow-payment');

module.exports = {
  ...identity,
  ...errors,
  ...integers,
  ...vehicleClasses,
  ...pricing,
  ...geo,
  ...route,
  ...towVehicle,
  ...documents,
  ...availability,
  ...compatibility,
  ...eligibility,
  ...settings,
  ...towRequest,
  ...idempotency,
  ...matching,
  ...ids,
  ...towProposal,
  ...assignment,
  ...towRequestStateMachine,
  ...towExecutionInput,
  ...cancellation,
  ...towPayment,
};
