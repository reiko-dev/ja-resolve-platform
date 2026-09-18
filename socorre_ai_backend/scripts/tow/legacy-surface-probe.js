#!/usr/bin/env node
/**
 * T00 — current-state probe: which Tow v1 contract operations already exist in
 * the legacy HTTP surface?
 *
 * Boots the real Express app (`createApp()`) and issues one request per
 * operation of the composed Tow v1 contract with no credentials. A path that
 * does not exist at all answers 404 "Rota não encontrada"; a path that exists
 * answers 401/403 (auth) or another status. No database write is performed and
 * no external provider is called.
 *
 * Usage:
 *   node scripts/tow/legacy-surface-probe.js            # markdown report
 *   node scripts/tow/legacy-surface-probe.js --json     # machine-readable
 *
 * Evidence for docs/tow/T00-CURRENT-STATE-AUDIT.md.
 */
'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const request = require('supertest');
const { createApp } = require('../../src/app');
const { loadRawDocuments, composeDocument, collectOperations } = require('../../tests/helpers/towContract');

const asJson = process.argv.includes('--json');

async function main() {
  const { composed } = composeDocument(loadRawDocuments());
  const operations = collectOperations(composed).sort((a, b) => a.path.localeCompare(b.path));
  const app = createApp();

  const results = [];
  for (const operation of operations) {
    const path = operation.path.replace(/\{([^}]+)\}/g, '1');
    const response = await request(app)[operation.method](`/api${path}`).send({});
    const body = response.body || {};
    const routeMissing = response.status === 404
      && typeof body.message === 'string'
      && body.message.includes('Rota não encontrada');
    results.push({
      method: operation.method.toUpperCase(),
      path: operation.path,
      operationId: operation.operationId,
      status: response.status,
      routeMissing,
      legacyErrorShape: Object.prototype.hasOwnProperty.call(body, 'success')
        && Object.prototype.hasOwnProperty.call(body, 'message'),
    });
  }

  const missing = results.filter((r) => r.routeMissing);
  const present = results.filter((r) => !r.routeMissing);

  if (asJson) {
    console.log(JSON.stringify({ total: results.length, missing: missing.length, present, results }, null, 2));
    return;
  }

  console.log('# Tow v1 contract operations vs legacy HTTP surface\n');
  console.log(`Probed operations: ${results.length}`);
  console.log(`Not routed in the legacy app (404 "Rota não encontrada"): ${missing.length}`);
  console.log(`Routed in the legacy app: ${present.length}\n`);
  if (present.length > 0) {
    console.log('| Method | Path | operationId | Status |');
    console.log('| --- | --- | --- | --- |');
    for (const row of present) {
      console.log(`| ${row.method} | \`${row.path}\` | \`${row.operationId}\` | ${row.status} |`);
    }
  }
}

main().catch((error) => {
  console.error(`probe failed: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
