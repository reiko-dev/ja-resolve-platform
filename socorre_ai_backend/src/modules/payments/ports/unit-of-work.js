'use strict';

function assertUnitOfWork(unitOfWork) {
  if (!unitOfWork || typeof unitOfWork.run !== 'function') {
    throw new TypeError('unit of work must implement run(work)');
  }
  return unitOfWork;
}

module.exports = { assertUnitOfWork };
