'use strict';

function createPaymentUnitOfWork(db) {
  if (!db || typeof db.transaction !== 'function') {
    throw new TypeError('createPaymentUnitOfWork requires a knex connection');
  }

  return Object.freeze({
    run(work) {
      if (typeof work !== 'function') {
        throw new TypeError('payment unit of work requires a work function');
      }
      return db.transaction(work);
    },
  });
}

module.exports = { createPaymentUnitOfWork };
