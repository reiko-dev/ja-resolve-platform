/**
 * SERVICE LOCATION — HTTP error mapper.
 *
 * Mirrors the Service Catalog mapper: domain errors keep their canonical
 * `{success:false,message,error:{code,details?}}` envelope; anything else is a
 * 500 with no internal detail leaked.
 */
'use strict';

const { isServiceLocationError } = require('../domain');

function sendError(res, error) {
  if (isServiceLocationError(error)) {
    const body = {
      success: false,
      message: error.message,
      error: { code: error.code },
    };
    if (error.details && typeof error.details === 'object') {
      body.error.details = error.details;
    }
    return res.status(error.httpStatus).json(body);
  }

  console.error('Erro no servidor (service-location):', error);
  return res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    error: { code: 'internal_error' },
  });
}

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      sendError(res, error);
    }
  };
}

module.exports = { sendError, handle };
