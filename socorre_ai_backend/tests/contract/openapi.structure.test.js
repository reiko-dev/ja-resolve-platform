/**
 * T00 — Tow OpenAPI 3.1 structural contract validation.
 *
 * Reproduces (and hardens) the pre-merge evidence recorded in
 * docs/tow/TOW-OPENAPI-CONSISTENCY-REVIEW.md:
 *   - OpenAPI 3.1 parse of the canonical entrypoint;
 *   - local external `$ref` resolution into the base composition artifact
 *     (including `~1`-escaped path refs);
 *   - composed operationId uniqueness without double-counting shadowed base
 *     operations;
 *   - path parameter correctness;
 *   - request/response schema presence and Draft 2020-12 compilability;
 *   - typed 2xx responses for every operation;
 *   - canonical enum values.
 *
 * The same checks are exposed as a CLI with an exit code:
 *   node scripts/tow/validate-openapi.js
 */
'use strict';

const {
  BASE_FILE,
  CANONICAL_FILE,
  CANONICAL_ENUMS,
  CANONICAL_ERROR_CODES,
  collectOperations,
  composeDocument,
  loadRawDocuments,
  resolveRef,
  validateContract,
} = require('../helpers/towContract');

describe('Tow OpenAPI 3.1 — structural contract validation', () => {
  const documents = loadRawDocuments();
  const report = validateContract({ documents });
  const composition = composeDocument(documents);
  const operations = collectOperations(composition.composed);

  test('canonical entrypoint parses as OpenAPI 3.1', () => {
    expect(documents.canonical.openapi).toBe('3.1.0');
    expect(documents.base.openapi).toBe('3.1.0');
    expect(typeof documents.canonical.info.title).toBe('string');
    expect(typeof documents.canonical.info.version).toBe('string');
    expect(report.openapiVersion).toBe('3.1.0');
  });

  test('every local external $ref resolves into the base composition artifact', () => {
    expect(report.refs.checked).toBeGreaterThan(0);
    expect(report.refs.external).toBeGreaterThan(0);
    expect(report.refs.unresolved).toEqual([]);

    // The `~1`-escaped path refs are the composition mechanism for path items:
    // they must resolve to a real base path item, not to a component.
    const escapedPathRefs = [
      "'./tow-api-contract.base.openapi.yaml#/paths/~1tow~1module-status'",
    ];
    expect(escapedPathRefs.length).toBeGreaterThan(0);
    const resolved = resolveRef(
      './tow-api-contract.base.openapi.yaml#/paths/~1tow~1module-status',
      CANONICAL_FILE,
      documents
    );
    expect(resolved.found).toBe(true);
    expect(resolved.value.get.operationId).toBe('getTowModuleStatus');
  });

  test('composed document has unique operationIds and none missing', () => {
    expect(report.operations.count).toBeGreaterThan(0);
    expect(report.operationIds.missing).toEqual([]);
    expect(report.operationIds.duplicates).toEqual([]);
    expect(report.operationIds.count).toBe(operations.length);
  });

  test('shadowed base operations are preserved (superset/allowlist) and not double-counted', () => {
    // `/tow/requests` exists in the base (POST only) and is re-declared inline
    // by the canonical entrypoint (GET + POST). The composed document must
    // contain exactly one POST createTowRequest and one GET listTowRequests.
    const createOps = operations.filter((op) => op.operationId === 'createTowRequest');
    const listOps = operations.filter((op) => op.operationId === 'listTowRequests');
    expect(createOps).toHaveLength(1);
    expect(createOps[0].method).toBe('post');
    expect(listOps).toHaveLength(1);
    expect(listOps[0].method).toBe('get');

    // Real superset/allowlist check (not tautological): iterate the BASE
    // methods on every shadowed path and require each one to survive into the
    // composed path item, unless it is explicitly allowlisted as dropped.
    expect(composition.stats.shadowedPathDetails).toHaveLength(composition.stats.shadowedPaths.length);
    for (const detail of composition.stats.shadowedPathDetails) {
      const allowlist = report.shadowedMethods.allowlist[detail.path] || [];
      for (const method of detail.baseMethods) {
        expect(detail.composedMethods.includes(method) || allowlist.includes(method)).toBe(true);
      }
    }
    // The frozen contract drops nothing; the allowlist is empty.
    expect(report.shadowedMethods.dropped).toEqual([]);
    expect(report.shadowedMethods.allowlist).toEqual({});
  });

  test('a shadowed base method dropped without allowlist is detected (negative control)', () => {
    // `/admin/tow/settings` is shadowed by an inline canonical path item that
    // re-declares GET + PATCH. Drop PATCH from the canonical definition to
    // simulate a base operation silently disappearing in the composition.
    const mutated = JSON.parse(JSON.stringify(documents));
    const inlinePath = mutated.canonical.paths['/admin/tow/settings'];
    expect(inlinePath.patch).toBeDefined();
    delete inlinePath.patch;

    const mutatedReport = validateContract({ documents: mutated });
    expect(mutatedReport.shadowedMethods.dropped).toContainEqual({
      path: '/admin/tow/settings',
      method: 'patch',
    });
    expect(mutatedReport.ok).toBe(false);
  });

  test('path parameters are all declared and no extra path parameters exist', () => {
    expect(report.pathParams.mismatches).toEqual([]);
  });

  test('every operation has at least one typed 2xx response', () => {
    expect(report.responses.without2xx).toEqual([]);
    expect(report.responses.withoutSchema).toEqual([]);
    expect(report.responses.checked).toBe(operations.length);
  });

  test('every request body declares a schema', () => {
    expect(report.requestBodies.withoutSchema).toEqual([]);
    expect(report.requestBodies.checked).toBeGreaterThan(0);
  });

  test('all component and inline schemas compile as JSON Schema Draft 2020-12', () => {
    expect(report.schemas.errors).toEqual([]);
    expect(report.schemas.componentChecked).toBeGreaterThan(50);
    expect(report.schemas.inlineChecked).toBeGreaterThan(50);
  });

  test('canonical enums match the frozen TOW-API-CONTRACT values', () => {
    expect(report.enums.mismatches).toEqual([]);
    expect(report.enums.forbidden).toEqual([]);

    const schemas = composition.composed.components.schemas;
    expect(schemas.TowRequestState.enum).toEqual(CANONICAL_ENUMS.TowRequestState);
    expect(schemas.TowProposalStatus.enum).toEqual(CANONICAL_ENUMS.TowProposalStatus);
    expect(schemas.CounterofferStatus.enum).toEqual(CANONICAL_ENUMS.CounterofferStatus);
    expect(schemas.PaymentMethod.enum).toEqual(CANONICAL_ENUMS.PaymentMethod);
    expect(schemas.VehicleDocumentStatus.enum).toEqual(CANONICAL_ENUMS.VehicleDocumentStatus);
    expect(schemas.TerminalReason.enum).toEqual(expect.arrayContaining(CANONICAL_ENUMS.TerminalReason));
  });

  test('SERVICE_DISABLED terminal reason stays distinct from service_module_disabled error code', () => {
    const schemas = composition.composed.components.schemas;
    expect(schemas.TerminalReason.enum).toContain('SERVICE_DISABLED');
    expect(schemas.ErrorResponse.properties.error.properties.code.enum)
      .toContain('service_module_disabled');
    expect(schemas.ErrorResponse.properties.error.properties.code.enum)
      .not.toContain('SERVICE_DISABLED');
    for (const code of CANONICAL_ERROR_CODES) {
      expect(schemas.ErrorResponse.properties.error.properties.code.enum).toContain(code);
    }
  });

  test('CASH_SELECTED is canonical and legacy PAYMENT_METHOD_SELECTED is absent', () => {
    const schemas = composition.composed.components.schemas;
    expect(schemas.PaymentStatus.enum).toContain('CASH_SELECTED');
    expect(schemas.PaymentStatus.enum).not.toContain('PAYMENT_METHOD_SELECTED');
  });

  test('the full validation report is GREEN (same gate as the CLI exit code)', () => {
    expect(report.ok).toBe(true);
  });

  test('the validator itself detects a broken ref (negative control)', () => {
    const mutated = JSON.parse(JSON.stringify(documents));
    mutated.canonical.paths['/tow/module-status'] = {
      $ref: './tow-api-contract.base.openapi.yaml#/paths/~1tow~1does-not-exist',
    };
    const mutatedReport = validateContract({ documents: mutated });
    expect(mutatedReport.refs.unresolved.length).toBeGreaterThan(0);
    expect(mutatedReport.ok).toBe(false);
  });

  test('the validator itself detects a duplicate operationId (negative control)', () => {
    const mutated = JSON.parse(JSON.stringify(documents));
    mutated.canonical.paths['/tow/duplicate-probe'] = {
      get: { operationId: 'getTowModuleStatus', responses: { 200: { description: 'x' } } },
    };
    const mutatedReport = validateContract({ documents: mutated });
    expect(mutatedReport.operationIds.duplicates).toContainEqual({
      operationId: 'getTowModuleStatus',
      count: 2,
    });
    expect(mutatedReport.ok).toBe(false);
  });

  test('the base composition artifact is not a consumer entrypoint', () => {
    // Consumers must use the canonical entrypoint: it is the only document
    // carrying the frozen discovery/settings/route contracts.
    expect(documents.canonical.info.version).toBe('1.0.0-draft.13');
    expect(BASE_FILE).not.toBe(CANONICAL_FILE);
    expect(composition.composed.info.version).toBe(documents.canonical.info.version);
  });
});
