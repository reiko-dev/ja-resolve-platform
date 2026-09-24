/**
 * PLATFORM SERVICE CATALOG — domain barrel.
 *
 * Pure domain: lifecycle vocabulary, error type and the frozen initial service
 * list. No Express, Knex, filesystem or provider import is allowed here.
 */
'use strict';

const errors = require('./errors');
const status = require('./status');
const initialServices = require('./initial-services');

module.exports = {
  ...errors,
  ...status,
  ...initialServices,
};
