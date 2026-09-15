/**
 * G2 — contrato de fotos privadas de guincho em emergency_requests.
 *
 * Adiciona as colunas da API de fotos (uma pickup + uma delivery) sem tocar em
 * `emergency_requests.photos` (legado) nem em qualquer campo do G1:
 *   pickup_photo_url        / delivery_photo_url        -> URL autenticada da API
 *   pickup_photo_metadata   / delivery_photo_metadata   -> JSON com chave
 *                                                          relativa, mime, tamanho,
 *                                                          dimensões e sha256
 *
 * Idempotente (hasColumn) e reversível (down remove apenas estas colunas).
 */
const PHOTO_COLUMNS = [
  'pickup_photo_url',
  'delivery_photo_url',
  'pickup_photo_metadata',
  'delivery_photo_metadata',
];

exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('emergency_requests');
  if (!hasTable) {
    return;
  }

  const missing = [];
  for (const column of PHOTO_COLUMNS) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await knex.schema.hasColumn('emergency_requests', column))) {
      missing.push(column);
    }
  }

  if (!missing.length) {
    return;
  }

  await knex.schema.alterTable('emergency_requests', function(table) {
    if (missing.includes('pickup_photo_url')) {
      table.text('pickup_photo_url');
    }
    if (missing.includes('delivery_photo_url')) {
      table.text('delivery_photo_url');
    }
    if (missing.includes('pickup_photo_metadata')) {
      table.text('pickup_photo_metadata');
    }
    if (missing.includes('delivery_photo_metadata')) {
      table.text('delivery_photo_metadata');
    }
  });
};

exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('emergency_requests');
  if (!hasTable) {
    return;
  }

  const present = [];
  for (const column of PHOTO_COLUMNS) {
    // eslint-disable-next-line no-await-in-loop
    if (await knex.schema.hasColumn('emergency_requests', column)) {
      present.push(column);
    }
  }

  if (!present.length) {
    return;
  }

  await knex.schema.alterTable('emergency_requests', function(table) {
    for (const column of present) {
      table.dropColumn(column);
    }
  });
};
