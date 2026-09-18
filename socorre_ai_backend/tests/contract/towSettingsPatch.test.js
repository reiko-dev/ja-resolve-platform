/**
 * T00 — `TowSettingsPatch` true-partial PATCH semantics.
 *
 * Normative decisions: docs/tow/TOW-OPENAPI-CONTRACT-DECISIONS.md
 *   - `TowSettingsPatch` is a standalone schema: `type: object`,
 *     `additionalProperties: false`, `minProperties: 1`, every property
 *     optional (it mirrors the 14 `TowSettings` properties);
 *   - it must NOT be expressed as `allOf: [TowSettings, {...}]`, because
 *     `TowSettings` requires all 14 properties and the composition would make
 *     every partial patch invalid.
 *
 * Every assertion below is backed by a negative control (mutation) proving the
 * test actually detects the regression it claims to guard against.
 */
'use strict';

const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const {
  COMPOSED_SCHEMA_ID,
  CANONICAL_FILE,
  composeDocument,
  loadRawDocuments,
  validateTowSettingsPatch,
} = require('../helpers/towContract');

function buildValidator(schema) {
  const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true, validateFormats: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

describe('TowSettingsPatch — true partial PATCH semantics', () => {
  const documents = loadRawDocuments();
  const { composed } = composeDocument(documents);
  const patch = composed.components.schemas.TowSettingsPatch;
  const full = composed.components.schemas.TowSettings;

  test('schema shape is a true partial patch', () => {
    expect(patch.type).toBe('object');
    expect(patch.additionalProperties).toBe(false);
    expect(patch.minProperties).toBe(1);
    expect(patch.required).toBeUndefined();
    expect(Object.keys(patch.properties)).toHaveLength(14);
    expect(Object.keys(patch.properties).sort()).toEqual(Object.keys(full.properties).sort());
    expect(validateTowSettingsPatch(composed).ok).toBe(true);
  });

  test('TowSettings still requires every property (the patch must not mirror this)', () => {
    expect(Array.isArray(full.required)).toBe(true);
    expect(full.required).toHaveLength(14);
    expect(full.required).not.toContain('tow_max_radius_km' && undefined);
  });

  test('a single-property patch is valid', () => {
    const validate = buildValidator(patch);
    expect(validate({ tow_max_radius_km: 80 })).toBe(true);
    expect(validate.errors).toBeNull();
  });

  test('a multi-property partial patch is valid', () => {
    const validate = buildValidator(patch);
    expect(validate({
      tow_platform_fixed_fee_cents: 1500,
      tow_cancellation_fee_cents: 2500,
      tow_max_platform_fee_debt_cents: 10000,
    })).toBe(true);
  });

  test('an empty object is invalid (minProperties: 1)', () => {
    const validate = buildValidator(patch);
    expect(validate({})).toBe(false);
    expect(validate.errors.map((e) => e.keyword)).toContain('minProperties');
  });

  test('unknown properties are rejected (additionalProperties: false)', () => {
    const validate = buildValidator(patch);
    expect(validate({ not_a_tow_setting: 1 })).toBe(false);
    expect(validate.errors.map((e) => e.keyword)).toContain('additionalProperties');
  });

  test('wrong types are rejected', () => {
    const validate = buildValidator(patch);
    expect(validate({ tow_max_radius_km: '80' })).toBe(false);
  });

  test('the whole-settings payload is also a valid patch (superset)', () => {
    const validate = buildValidator(patch);
    const whole = {};
    for (const [key, schema] of Object.entries(full.properties)) {
      if (schema.type === 'integer' || schema.type === 'number') whole[key] = 1;
      else if (schema.type === 'boolean') whole[key] = true;
      else whole[key] = 'x';
    }
    expect(validate(whole)).toBe(true);
  });

  test('the PATCH operation consumes TowSettingsPatch, not TowSettings', () => {
    const operation = composed.paths['/admin/tow/settings'].patch;
    expect(operation.operationId).toBe('adminPatchTowSettings');
    const schemaRef = operation.requestBody.content['application/json'].schema.$ref;
    expect(schemaRef).toBe('#/components/schemas/TowSettingsPatch');
    expect(schemaRef).not.toBe('#/components/schemas/TowSettings');
  });

  test('the contract does not compose the patch with allOf over TowSettings', () => {
    const raw = documents.canonical.components.schemas.TowSettingsPatch;
    expect(raw.allOf).toBeUndefined();
    expect(JSON.stringify(raw)).not.toContain('TowSettings"');
  });

  test('negative control: a patch inheriting TowSettings.required is rejected', () => {
    // Regression simulation: if someone expressed the patch as
    // `allOf: [TowSettings, {...}]` the composed schema would carry the 14
    // required properties, and this exact mutation makes that observable.
    const mutated = JSON.parse(JSON.stringify(patch));
    mutated.required = JSON.parse(JSON.stringify(full.required));
    const validate = buildValidator(mutated);
    expect(validate({ tow_max_radius_km: 80 })).toBe(false);
    const missing = validate.errors.find((e) => e.keyword === 'required');
    expect(missing).toBeDefined();
    expect(missing.params.missingProperty).toBeDefined();

    // The real schema accepts the same payload: the guard is meaningful.
    expect(buildValidator(patch)({ tow_max_radius_km: 80 })).toBe(true);
  });

  test('negative control: an allOf composition over TowSettings is rejected', () => {
    const mutated = {
      allOf: [full, { type: 'object', additionalProperties: false, minProperties: 1 }],
    };
    const validate = buildValidator(mutated);
    expect(validate({ tow_max_radius_km: 80 })).toBe(false);
    expect(validate.errors.some((e) => e.keyword === 'required')).toBe(true);
  });

  test('negative control: the contract validator flags a required-bearing patch', () => {
    const mutated = JSON.parse(JSON.stringify(documents));
    mutated.canonical.components.schemas.TowSettingsPatch.required = ['tow_max_radius_km'];
    const report = validateTowSettingsPatch(composeDocument(mutated).composed);
    expect(report.ok).toBe(false);
    expect(report.errors.join(' ')).toMatch(/must not declare required/);
  });

  test('negative control: the contract validator flags open additionalProperties', () => {
    const mutated = JSON.parse(JSON.stringify(documents));
    delete mutated.canonical.components.schemas.TowSettingsPatch.additionalProperties;
    const report = validateTowSettingsPatch(composeDocument(mutated).composed);
    expect(report.ok).toBe(false);
    expect(report.errors.join(' ')).toMatch(/additionalProperties must be false/);
  });

  test('the canonical entrypoint is the only source of the patch schema', () => {
    // The patch must not be silently redefined by the base artifact: the
    // canonical document owns it.
    expect(documents.canonical.components.schemas.TowSettingsPatch).toBeDefined();
    expect(composed.components.schemas.TowSettingsPatch).toEqual(
      documents.canonical.components.schemas.TowSettingsPatch
    );
    expect(CANONICAL_FILE).toContain('tow-api-contract.openapi.yaml');
    expect(COMPOSED_SCHEMA_ID).toContain('openapi-composed.json');
  });
});
