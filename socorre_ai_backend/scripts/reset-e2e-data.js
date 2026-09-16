#!/usr/bin/env node
/**
 * Reset restrito de massa E2E (emergency_requests + tow_proposals).
 *
 * Regras de segurança (fail-closed):
 *   - sem `--apply` é dry-run: mostra o que seria removido e não apaga nada;
 *   - exige `E2E_RESET_CONFIRM=I_UNDERSTAND` para aplicar;
 *   - exige `E2E_RESET_EMERGENCY_IDS` com IDs numéricos explícitos (nada de
 *     "apagar tudo"); qualquer token inválido aborta;
 *   - todo pedido alvo precisa existir e pertencer a um dono reconhecidamente
 *     de teste: e-mail contendo "e2e" (padrão) ou listado em
 *     `E2E_RESET_OWNER_EMAILS=a@x,b@y`;
 *   - `NODE_ENV=production` só é permitido com alvo homolog explícito
 *     (`E2E_RESET_TARGET=homolog` + `E2E_RESET_ALLOW_HOMOLOG=1`);
 *   - `E2E_RESET_ALLOW_ANY_OWNER=1` libera donos fora do padrão apenas fora de
 *     produção e continua exigindo a lista explícita de IDs.
 *
 * Exemplos:
 *   # dry-run (não apaga):
 *   E2E_RESET_EMERGENCY_IDS=101,102 npm run reset:e2e
 *   # aplicando em ambiente local:
 *   E2E_RESET_CONFIRM=I_UNDERSTAND E2E_RESET_EMERGENCY_IDS=101,102 \
 *     npm run reset:e2e -- --apply
 */
'use strict';

const USAGE = [
  'Uso: E2E_RESET_EMERGENCY_IDS=<ids> [E2E_RESET_CONFIRM=I_UNDERSTAND] npm run reset:e2e -- [--apply]',
  'Variáveis opcionais: E2E_RESET_OWNER_EMAILS, E2E_RESET_OWNER_PATTERN, E2E_RESET_ALLOW_ANY_OWNER,',
  '                     E2E_RESET_TARGET=homolog, E2E_RESET_ALLOW_HOMOLOG=1.',
].join('\n');

function fail(message) {
  console.error(`Reset E2E bloqueado: ${message}`);
  console.error(USAGE);
  process.exit(1);
}

function parseIds(raw) {
  const tokens = String(raw || '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    fail('E2E_RESET_EMERGENCY_IDS não informado.');
  }

  const invalid = tokens.filter((token) => !/^[1-9][0-9]*$/.test(token));
  if (invalid.length > 0) {
    fail(`IDs inválidos em E2E_RESET_EMERGENCY_IDS: ${invalid.join(', ')} (use inteiros positivos separados por vírgula).`);
  }

  return [...new Set(tokens.map(Number))];
}

function parseOwnerEmails(raw) {
  return String(raw || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isTestOwner(email, explicitEmails, pattern) {
  const normalized = String(email || '').toLowerCase();
  if (!normalized) {
    return false;
  }
  if (explicitEmails.includes(normalized)) {
    return true;
  }
  return pattern.test(normalized);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const ids = parseIds(process.env.E2E_RESET_EMERGENCY_IDS);
  const target = process.env.E2E_RESET_TARGET || 'local';
  const isProduction = process.env.NODE_ENV === 'production';
  const productionHomologAllowed = target === 'homolog' && process.env.E2E_RESET_ALLOW_HOMOLOG === '1';

  if (isProduction && !productionHomologAllowed) {
    fail('produção exige E2E_RESET_TARGET=homolog e E2E_RESET_ALLOW_HOMOLOG=1.');
  }

  if (apply && process.env.E2E_RESET_CONFIRM !== 'I_UNDERSTAND') {
    fail('defina E2E_RESET_CONFIRM=I_UNDERSTAND para aplicar (sem --apply o script é dry-run).');
  }

  const ownerEmails = parseOwnerEmails(process.env.E2E_RESET_OWNER_EMAILS);
  const ownerPatternRaw = process.env.E2E_RESET_OWNER_PATTERN || 'e2e';
  let ownerPattern;
  try {
    ownerPattern = new RegExp(ownerPatternRaw, 'i');
  } catch (error) {
    fail(`E2E_RESET_OWNER_PATTERN inválido: ${error.message}`);
  }
  const allowAnyOwner = process.env.E2E_RESET_ALLOW_ANY_OWNER === '1';
  if (allowAnyOwner && isProduction) {
    fail('E2E_RESET_ALLOW_ANY_OWNER=1 não é permitido com NODE_ENV=production.');
  }

  // Require tardio: validações acima falham sem abrir conexão com o banco.
  const knex = require('../src/config/database');

  try {
    const rows = await knex('emergency_requests as er')
      .leftJoin('users as u', 'er.user_id', 'u.id')
      .whereIn('er.id', ids)
      .select('er.id', 'er.user_id', 'u.email as owner_email');

    const found = new Set(rows.map((row) => Number(row.id)));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      fail(`IDs não encontrados em emergency_requests: ${missing.join(', ')} (nada foi apagado).`);
    }

    const unsafe = rows.filter(
      (row) => !isTestOwner(row.owner_email, ownerEmails, ownerPattern),
    );
    if (unsafe.length > 0 && !allowAnyOwner) {
      const details = unsafe
        .map((row) => `id=${row.id} dono=${row.owner_email || 'sem e-mail'}`)
        .join('; ');
      fail(
        `pedidos sem dono de teste reconhecido (${details}). ` +
          'Informe E2E_RESET_OWNER_EMAILS ou E2E_RESET_OWNER_PATTERN; ' +
          'E2E_RESET_ALLOW_ANY_OWNER=1 só fora de produção.',
      );
    }

    const safeUserIds = [...new Set(rows.map((row) => row.user_id).filter((id) => id != null))];
    const proposalCount = await knex('tow_proposals')
      .whereIn('emergency_request_id', ids)
      .count({ total: '*' })
      .first();

    if (!apply) {
      console.log('[dry-run] Nada foi apagado. Alvos validados:');
      console.log(`  emergency_requests: ${ids.join(', ')}`);
      console.log(`  tow_proposals: ${Number(proposalCount?.total) || 0} registro(s)`);
      console.log('  Para aplicar: repita com E2E_RESET_CONFIRM=I_UNDERSTAND e --apply.');
      return;
    }

    await knex.transaction(async (trx) => {
      await trx('tow_proposals').whereIn('emergency_request_id', ids).del();
      // Dupla checagem de dono dentro da transação: só remove pedido cujo
      // user_id continua sendo o do dono validado.
      const deleteQuery = trx('emergency_requests').whereIn('id', ids);
      if (safeUserIds.length > 0) {
        deleteQuery.whereIn('user_id', safeUserIds);
      }
      await deleteQuery.del();
    });

    console.log(
      `Massa E2E removida: emergency_request_id=${ids.join(',')} ` +
        `(tow_proposals=${Number(proposalCount?.total) || 0}).`,
    );
  } finally {
    await knex.destroy();
  }
}

main().catch((error) => {
  console.error(`Falha no reset E2E: ${error.message}`);
  process.exitCode = 1;
});
