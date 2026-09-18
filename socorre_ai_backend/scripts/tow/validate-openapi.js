#!/usr/bin/env node
/**
 * Tow OpenAPI contract validator (CLI).
 *
 * Usage:
 *   node scripts/tow/validate-openapi.js [--json]
 *
 * Exit codes:
 *   0 = contract valid (all counters clean)
 *   1 = contract invalid (details printed)
 *
 * This is the reproducible version of the pre-merge evidence recorded in
 * docs/tow/TOW-OPENAPI-CONSISTENCY-REVIEW.md. It performs no network access:
 * every `$ref` resolves to a local file inside docs/tow.
 */
'use strict';

const {
  validateContract,
  DOCS_TOW_DIR,
  CANONICAL_FILE,
  BASE_FILE,
} = require('../../tests/helpers/towContract');

function main() {
  const asJson = process.argv.includes('--json');
  const report = validateContract();

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(report.ok ? 0 : 1);
  }

  const lines = [];
  lines.push('Tow OpenAPI contract validation');
  lines.push(`  docs:                             ${DOCS_TOW_DIR}`);
  lines.push(`  canonical entrypoint:             ${CANONICAL_FILE}`);
  lines.push(`  composition artifact:             ${BASE_FILE}`);
  lines.push(`  OpenAPI version:                  ${report.openapiVersion}`);
  lines.push(`  Contract version:                 ${report.contractVersion}`);
  lines.push(`  Canonical paths:                  ${report.composition.canonicalPaths}`);
  lines.push(`  Base paths:                       ${report.composition.basePaths}`);
  lines.push(`  Composed paths:                   ${report.composition.composedPaths}`);
  lines.push(`  Composed operations:              ${report.operations.count}`);
  lines.push(`  Shadowed base paths:              ${report.composition.shadowedPaths.length}`);
  lines.push(`  $ref occurrences checked:         ${report.refs.checked}`);
  lines.push(`  External/local-file $refs:        ${report.refs.external}`);
  lines.push(`  Unresolved refs:                  ${report.refs.unresolved.length}`);
  lines.push(`  Missing operationId:              ${report.operationIds.missing.length}`);
  lines.push(`  Duplicate operationId:            ${report.operationIds.duplicates.length}`);
  lines.push(`  Path-parameter mismatches:        ${report.pathParams.mismatches.length}`);
  lines.push(`  Request bodies checked:           ${report.requestBodies.checked}`);
  lines.push(`  Request bodies without schema:    ${report.requestBodies.withoutSchema.length}`);
  lines.push(`  Responses checked:                ${report.responses.checked}`);
  lines.push(`  Operations without 2xx:           ${report.responses.without2xx.length}`);
  lines.push(`  2xx responses without schema:     ${report.responses.withoutSchema.length}`);
  lines.push(`  Component schemas checked:        ${report.schemas.componentChecked}`);
  lines.push(`  Inline schema nodes checked:      ${report.schemas.inlineChecked}`);
  lines.push(`  JSON Schema definition errors:    ${report.schemas.errors.length}`);
  lines.push(`  Canonical enum mismatches:        ${report.enums.mismatches.length}`);
  lines.push(`  Forbidden legacy enum values:     ${report.enums.forbidden.length}`);
  lines.push(`  TowSettingsPatch errors:          ${report.settingsPatch.errors.length}`);
  lines.push(`  RESULT:                           ${report.ok ? 'PASS' : 'FAIL'}`);

  const detail = [];
  const pushDetails = (title, items) => {
    if (!items || items.length === 0) return;
    detail.push(`\n${title}:`);
    for (const item of items) detail.push(`  - ${JSON.stringify(item)}`);
  };
  pushDetails('Unresolved refs', report.refs.unresolved);
  pushDetails('Missing operationId', report.operationIds.missing);
  pushDetails('Duplicate operationId', report.operationIds.duplicates);
  pushDetails('Path-parameter mismatches', report.pathParams.mismatches);
  pushDetails('Request bodies without schema', report.requestBodies.withoutSchema);
  pushDetails('Operations without 2xx', report.responses.without2xx);
  pushDetails('2xx responses without schema', report.responses.withoutSchema);
  pushDetails('JSON Schema definition errors', report.schemas.errors);
  pushDetails('Canonical enum mismatches', report.enums.mismatches);
  pushDetails('Forbidden legacy enum values', report.enums.forbidden);
  pushDetails('TowSettingsPatch errors', report.settingsPatch.errors);

  process.stdout.write(`${lines.concat(detail).join('\n')}\n`);
  process.exit(report.ok ? 0 : 1);
}

main();
