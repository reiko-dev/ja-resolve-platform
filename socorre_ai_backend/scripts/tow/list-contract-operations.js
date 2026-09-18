#!/usr/bin/env node
/**
 * T00 — inventory of the composed Tow v1 contract (target side of the
 * legacy -> target mapping). Read-only; no business logic.
 *
 * Usage:
 *   node scripts/tow/list-contract-operations.js            # markdown table
 *   node scripts/tow/list-contract-operations.js --json     # machine-readable
 */
'use strict';

const { loadRawDocuments, composeDocument, collectOperations } = require('../../tests/helpers/towContract');

const asJson = process.argv.includes('--json');
const documents = loadRawDocuments();
const { composed } = composeDocument(documents);
const operations = collectOperations(composed).sort((a, b) => {
  if (a.path === b.path) return a.method.localeCompare(b.method);
  return a.path.localeCompare(b.path);
});

if (asJson) {
  console.log(JSON.stringify(operations.map((op) => ({
    method: op.method.toUpperCase(),
    path: op.path,
    operationId: op.operationId,
    tags: op.operation.tags || [],
    summary: op.operation.summary || null,
  })), null, 2));
} else {
  console.log(`# Composed Tow v1 contract operations (${operations.length})\n`);
  console.log('| # | Method | Path | operationId | Tag | Summary |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  operations.forEach((op, index) => {
    const tags = (op.operation.tags || []).join(', ');
    const summary = (op.operation.summary || '').replace(/\|/g, '\\|');
    console.log(`| ${index + 1} | ${op.method.toUpperCase()} | \`${op.path}\` | \`${op.operationId}\` | ${tags} | ${summary} |`);
  });
}
