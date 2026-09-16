#!/usr/bin/env node
/**
 * Remove apenas massa E2E explicitamente identificada.
 * Nunca executar em produção: exige NODE_ENV != production e confirmação.
 * Uso homolog: E2E_RESET_TARGET=homolog E2E_RESET_ALLOW_HOMOLOG=1
 * E2E_RESET_CONFIRM=I_UNDERSTAND E2E_RESET_EMERGENCY_IDS=1,2 npm run reset:e2e
 */
'use strict';

const knex = require('../src/config/database');

const ids = String(process.env.E2E_RESET_EMERGENCY_IDS || '')
  .split(',').map((id) => id.trim()).filter((id) => /^[1-9][0-9]*$/.test(id));

const target = process.env.E2E_RESET_TARGET || 'local';
const productionHomologAllowed = target === 'homolog' && process.env.E2E_RESET_ALLOW_HOMOLOG === '1';
if (process.env.NODE_ENV === 'production' && !productionHomologAllowed) {
  console.error('Reset E2E bloqueado em produção; use alvo homolog explícito e E2E_RESET_ALLOW_HOMOLOG=1.');
  process.exit(1);
}
if (process.env.E2E_RESET_CONFIRM !== 'I_UNDERSTAND' || ids.length === 0) {
  console.error('Defina E2E_RESET_CONFIRM=I_UNDERSTAND e E2E_RESET_EMERGENCY_IDS com IDs explícitos.');
  process.exit(1);
}

(async () => {
  await knex.transaction(async (trx) => {
    await trx('tow_proposals').whereIn('emergency_request_id', ids).del();
    await trx('emergency_requests').whereIn('id', ids).del();
  });
  console.log(`Massa E2E removida somente para emergency_request_id=${ids.join(',')}.`);
})()
  .catch((error) => {
    console.error(`Falha no reset E2E: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => knex.destroy());
