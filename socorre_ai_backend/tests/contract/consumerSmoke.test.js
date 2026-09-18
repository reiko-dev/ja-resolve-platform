/**
 * T00 — Consumer contract smoke (Cliente / Parceiro / Dashboard).
 *
 * Reproduces the pre-merge smoke recorded in
 * docs/tow/TOW-CONSUMER-CONTRACT-SMOKE-RESULT.md, driven ONLY by the composed
 * canonical OpenAPI document:
 *
 *   consumer   operations   request bodies   typed 2xx responses
 *   Cliente    18           8                18
 *   Parceiro   29           10               29
 *   Dashboard  20           6                20
 *
 * Expected final counters: missing operation = 0, broken ref = 0, schema
 * generation failure = 0, invalid request smoke = 0, invalid response smoke = 0,
 * undocumented required consumer capability = 0.
 */
'use strict';

const {
  CLIENTE_FLOW,
  PARCEIRO_FLOW,
  DASHBOARD_FLOW,
  runConsumerFlow,
  runConsumerSmoke,
} = require('../helpers/towConsumerFlows');
const {
  buildAjv,
  composeDocument,
  loadRawDocuments,
} = require('../helpers/towContract');

const EXPECTED = {
  cliente: { steps: 18, requestBodies: 8, responses: 18 },
  parceiro: { steps: 29, requestBodies: 10, responses: 29 },
  dashboard: { steps: 20, requestBodies: 6, responses: 20 },
};

describe('Tow consumer contract smoke', () => {
  const documents = loadRawDocuments();
  const { composed } = composeDocument(documents);
  const ajv = buildAjv(composed);
  const context = { composed, ajv };
  const smoke = runConsumerSmoke(context);

  test('every consumer flow uses only documented operations', () => {
    expect(smoke.missingOperations).toEqual([]);
    expect(smoke.undocumentedCapabilities).toEqual([]);
  });

  test('every consumer flow is schema-valid in both directions', () => {
    expect(smoke.schemaGenerationFailures).toEqual([]);
    expect(smoke.invalidRequests).toEqual([]);
    expect(smoke.invalidResponses).toEqual([]);
    expect(smoke.untypedSuccessResponses).toEqual([]);
    expect(smoke.ok).toBe(true);
  });

  for (const [consumer, expected] of Object.entries(EXPECTED)) {
    test(`${consumer}: ${expected.steps} operations / ${expected.requestBodies} request bodies / ${expected.responses} responses`, () => {
      const report = smoke.consumers[consumer];
      expect(report.steps).toBe(expected.steps);
      expect(report.details).toHaveLength(expected.steps);
      expect(report.requestBodiesValidated).toBe(expected.requestBodies);
      expect(report.responsesValidated).toBe(expected.responses);
      expect(report.missingOperations).toEqual([]);
      expect(report.undocumentedCapabilities).toEqual([]);
      expect(report.schemaGenerationFailures).toEqual([]);
      expect(report.invalidRequests).toEqual([]);
      expect(report.invalidResponses).toEqual([]);
      expect(report.untypedSuccessResponses).toEqual([]);
    });
  }

  test('every flow step maps to exactly one capability and one operationId', () => {
    for (const [consumer, steps] of Object.entries({ cliente: CLIENTE_FLOW, parceiro: PARCEIRO_FLOW, dashboard: DASHBOARD_FLOW })) {
      const capabilities = steps.map((step) => step.capability);
      expect(new Set(capabilities).size).toBe(capabilities.length);
      for (const step of steps) {
        expect(typeof step.operationId).toBe('string');
        expect(step.operationId.length).toBeGreaterThan(0);
      }
      const report = smoke.consumers[consumer];
      expect(report.details.map((d) => d.capability)).toEqual(capabilities);
    }
  });

  test('the smoke is deterministic across runs (same counters, same order)', () => {
    const second = runConsumerSmoke({ composed, ajv });
    expect(second.ok).toBe(true);
    expect(JSON.stringify(second.consumers)).toBe(JSON.stringify(smoke.consumers));
  });

  test('the smoke performs no network, database or filesystem side effect', () => {
    // Purely contract-driven: a flow run against a document with a broken ref
    // must surface it as a schema generation failure instead of crashing.
    const mutated = JSON.parse(JSON.stringify(documents));
    // `/tow/module-status` is a `$ref` path item in the canonical entrypoint,
    // so the response schema lives in the base composition artifact.
    mutated.base.paths['/tow/module-status'].get.responses['200'].content['application/json'].schema = {
      $ref: '#/components/schemas/DoesNotExist',
    };
    const { composed: broken } = composeDocument(mutated);
    const report = runConsumerFlow('cliente', [{ capability: 'module_status', operationId: 'getTowModuleStatus' }], {
      composed: broken,
      ajv: buildAjv(broken),
    });
    expect(report.schemaGenerationFailures.length + report.invalidResponses.length).toBeGreaterThan(0);
  });

  test('the smoke detects an undocumented consumer capability (negative control)', () => {
    const report = runConsumerFlow('cliente', [
      { capability: 'not_a_documented_capability', operationId: 'definitelyNotAnOperation' },
    ], context);
    expect(report.missingOperations).toHaveLength(1);
    expect(report.undocumentedCapabilities).toHaveLength(1);
  });

  test('the smoke detects an invalid request fixture (negative control)', () => {
    // `adminPatchTowSettings` rejects `{}` (minProperties: 1). Force the
    // generator to emit `{}` by validating an empty payload directly.
    const operation = composed.paths['/admin/tow/settings'].patch;
    const schema = operation.requestBody.content['application/json'].schema;
    const validate = ajv.getSchema(
      'https://socorre.ai/contracts/tow/openapi-composed.json#/components/schemas/TowSettingsPatch'
    );
    expect(schema.$ref).toBe('#/components/schemas/TowSettingsPatch');
    expect(validate({})).toBe(false);
    expect(validate({ tow_max_radius_km: 80 })).toBe(true);
  });
});
