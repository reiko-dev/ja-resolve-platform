#!/usr/bin/env node
/**
 * G2 — reconciliação interna de fotos órfãs do guincho.
 *
 * Lista SOMENTE arquivos com chave válida do contrato sob
 * SERVICE_PHOTO_STORAGE_DIR (`<id>/<pickup|delivery>-<uuid>.<jpg|webp>`) e
 * remove apenas os que não têm referência nas quatro colunas de foto
 * (`pickup_photo_url`, `pickup_photo_metadata`, `delivery_photo_url`,
 * `delivery_photo_metadata`). Nunca apaga nada fora da raiz, nunca segue
 * symlink e nunca toca em arquivos fora do padrão.
 *
 * Seguro por padrão (dry-run). Para remover de fato:
 *
 *   cd socorre_ai_backend
 *   SERVICE_PHOTO_STORAGE_DIR=/var/lib/socorre-ai/private/service-photos \
 *     node scripts/reconcile-service-photos.js --apply
 *
 * Este script é interno (cron/manutenção): não expõe HTTP e não faz deploy.
 */
'use strict';

const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
require(path.join(backendRoot, 'node_modules', 'dotenv')).config({
  path: process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : path.join(backendRoot, '.env'),
});

const knex = require(path.join(backendRoot, 'src/config/database'));
const EmergencyRequest = require(path.join(backendRoot, 'src/models/EmergencyRequest'));
const servicePhotoStorage = require(path.join(backendRoot, 'src/services/servicePhotoStorage'));

async function main() {
  const apply = process.argv.includes('--apply');
  const references = await EmergencyRequest.listPhotoStorageReferences();
  const report = await servicePhotoStorage.reconcileOrphanServicePhotos({
    references,
    dryRun: !apply,
  });

  process.stdout.write(
    `${JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...report }, null, 2)}\n`
  );

  if (report.failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch(error => {
    process.stderr.write(`reconcile-service-photos: ${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    knex.destroy().catch(() => {});
  });
