/**
 * T00 — Tow contract payload builders (pure, no persistence, no business rules).
 *
 * Every builder produces a payload that is validated against the composed
 * canonical OpenAPI document before it is returned: if the contract changes in
 * an incompatible way, the builder throws instead of silently emitting an
 * undocumented DTO. No field is invented here — the base payload is generated
 * from the contract schema and callers layer realistic overrides on top.
 *
 * Builders never encode business policy (no price, no radius, no state
 * transition, no deadline). They are deterministic: two calls with the same
 * arguments return deep-equal payloads.
 */
'use strict';

const {
  COMPOSED_SCHEMA_ID,
  buildAjv,
  composeDocument,
  generateFixture,
  getByPointer,
  schemaUri,
} = require('../towContract');

/** Locate a schema node's JSON pointer inside the composed document by identity. */
function findPointer(composed, schema) {
  const seen = new Set();
  const search = (node, pointer) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return null;
    seen.add(node);
    if (node === schema) return pointer || '/';
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index += 1) {
        const found = search(node[index], `${pointer}/${index}`);
        if (found) return found;
      }
      return null;
    }
    for (const [key, value] of Object.entries(node)) {
      const escaped = key.replace(/~/g, '~0').replace(/\//g, '~1');
      const found = search(value, `${pointer}/${escaped}`);
      if (found) return found;
    }
    return null;
  };
  return search(composed, '') || '';
}

const DEFAULT_INSTANT = '2026-01-15T12:00:00.000Z';

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Deep merge: objects merge, arrays and scalars are replaced. */
function deepMerge(base, overrides) {
  if (!isPlainObject(overrides)) return overrides === undefined ? base : overrides;
  const result = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(overrides)) {
    result[key] = isPlainObject(value) && isPlainObject(result[key])
      ? deepMerge(result[key], value)
      : value;
  }
  return result;
}

class TowPayloadBuilder {
  constructor(options = {}) {
    const documents = options.documents;
    const composition = composeDocument(documents);
    this.composed = composition.composed;
    this.ajv = options.ajv || buildAjv(this.composed);
    this.clock = options.clock || null;
    this.today = options.today || DEFAULT_INSTANT;
  }

  /** Deterministic timestamp derived from the injected clock (never Date.now). */
  nowIso() {
    return this.clock ? this.clock.isoNow() : this.today;
  }

  schemaFor(schemaName) {
    const schema = this.composed.components.schemas[schemaName];
    if (!schema) {
      throw new Error(`TowPayloadBuilder: unknown contract schema "${schemaName}"`);
    }
    return schema;
  }

  validatorFor(schemaName) {
    const validate = this.ajv.getSchema(`${COMPOSED_SCHEMA_ID}#/components/schemas/${schemaName}`);
    if (!validate) {
      throw new Error(`TowPayloadBuilder: schema "${schemaName}" is not compilable`);
    }
    return validate;
  }

  /**
   * Build a contract-valid payload for `schemaName` with deep-merged overrides.
   * Throws when the result violates the contract (fail fast, never invent).
   */
  build(schemaName, overrides = {}) {
    const schema = this.schemaFor(schemaName);
    const base = generateFixture(schema, this.composed);
    const payload = deepMerge(base, overrides);
    const validate = this.validatorFor(schemaName);
    if (!validate(payload)) {
      const details = (validate.errors || [])
        .slice(0, 5)
        .map((error) => `${error.instancePath || '/'} ${error.message}`)
        .join('; ');
      throw new Error(`TowPayloadBuilder: payload for "${schemaName}" violates the contract: ${details}`);
    }
    return payload;
  }

  /**
   * Build a payload for the request body of a documented operation. The schema
   * is taken from the composed contract itself, so inline request schemas
   * (destination change, cancellation, tracking point, ...) are supported
   * without inventing a component name.
   */
  buildRequestFor(operationId, overrides = {}) {
    const operation = this.operationFor(operationId);
    const requestBody = operation.requestBody;
    if (!requestBody) {
      throw new Error(`TowPayloadBuilder: operation "${operationId}" has no request body`);
    }
    const mediaTypes = Object.keys(requestBody.content || {});
    const mediaType = mediaTypes.includes('application/json') ? 'application/json' : mediaTypes[0];
    if (!mediaType) {
      throw new Error(`TowPayloadBuilder: operation "${operationId}" has no request media type`);
    }
    const schema = requestBody.content[mediaType].schema;
    const base = generateFixture(schema, this.composed);
    const payload = deepMerge(base, overrides);
    const validate = this.ajv.getSchema(schemaUri(findPointer(this.composed, schema)));
    if (!validate) {
      throw new Error(`TowPayloadBuilder: request schema of "${operationId}" is not compilable`);
    }
    if (!validate(payload)) {
      const details = (validate.errors || [])
        .slice(0, 5)
        .map((error) => `${error.instancePath || '/'} ${error.message}`)
        .join('; ');
      throw new Error(`TowPayloadBuilder: payload for "${operationId}" violates the contract: ${details}`);
    }
    return { mediaType, payload };
  }

  operationFor(operationId) {
    if (!this.operations) {
      this.operations = new Map();
      for (const [pathKey, pathItem] of Object.entries(this.composed.paths || {})) {
        for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
          const operation = pathItem && pathItem[method];
          if (operation && operation.operationId) {
            this.operations.set(operation.operationId, { ...operation, path: pathKey, method });
          }
        }
      }
    }
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error(`TowPayloadBuilder: unknown operation "${operationId}"`);
    }
    return operation;
  }

  /**
   * Build a payload from the overrides ALONE (no generated base) and validate
   * it. Use for partial PATCH bodies where the caller must control the exact
   * property set.
   */
  buildExact(schemaName, overrides = {}) {
    this.schemaFor(schemaName);
    const validate = this.validatorFor(schemaName);
    if (!validate(overrides)) {
      const details = (validate.errors || [])
        .slice(0, 5)
        .map((error) => `${error.instancePath || '/'} ${error.message}`)
        .join('; ');
      throw new Error(`TowPayloadBuilder: payload for "${schemaName}" violates the contract: ${details}`);
    }
    return JSON.parse(JSON.stringify(overrides));
  }

  /** Validate an arbitrary payload against a contract schema (no mutation). */
  validate(schemaName, payload) {
    const validate = this.validatorFor(schemaName);
    return { valid: validate(payload), errors: validate.errors || [] };
  }

  /** Resolve a `$ref` string against the composed document (read-only). */
  resolve(ref) {
    return getByPointer(this.composed, ref).value;
  }
}

// ---------------------------------------------------------------------------
// Named builders — thin wrappers over contract schemas
// ---------------------------------------------------------------------------

function createTowBuilders(options = {}) {
  const builder = new TowPayloadBuilder(options);
  const request = (operationId, overrides) => builder.buildRequestFor(operationId, overrides).payload;

  return {
    builder,
    request,
    // Component-schema builders (real contract component names only).
    createTowRequestInput: (overrides) => builder.build('CreateTowRequestInput', overrides),
    createCounterofferInput: (overrides) => builder.build('CreateCounterofferInput', overrides),
    // A PATCH body must contain exactly the properties the caller chose.
    towSettingsPatch: (overrides) => (overrides === undefined
      ? builder.build('TowSettingsPatch')
      : builder.buildExact('TowSettingsPatch', overrides)),
    partnerStatusPatch: (overrides) => builder.build('PatchPartnerTowStatusInput', overrides),
    partnerLocationInput: (overrides) => builder.build('PartnerLocationInput', overrides),
    paymentMethodSelection: (overrides) => builder.build('SelectPaymentMethodInput', overrides),
    disputeInput: (overrides) => builder.build('CreateDisputeInput', overrides),
    reviewInput: (overrides) => builder.build('CreateReviewInput', overrides),
    debtPaymentInput: (overrides) => builder.build('DebtPaymentInput', overrides),
    toggleModuleInput: (overrides) => builder.build('ToggleTowModuleInput', overrides),
    resolveDisputeInput: (overrides) => builder.build('ResolveDisputeInput', overrides),
    towVehicleInput: (overrides) => builder.build('TowVehicleInput', overrides),
    towVehiclePatch: (overrides) => builder.build('TowVehiclePatch', overrides),
    // Operation-request builders (works for inline request schemas too).
    changeDestinationInput: (overrides) => request('changeTowDestination', overrides),
    createProposalRequest: (overrides) => request('createTowProposal', overrides),
    cancelByCustomerInput: (overrides) => request('cancelTowRequestByCustomer', overrides),
    cancelByPartnerInput: (overrides) => request('cancelTowRequestByPartner', overrides),
    trackingPointInput: (overrides) => request('postTowTrackingPoint', overrides),
    markArrivedInput: (overrides) => request('markTowArrived', overrides),
    finishServiceInput: (overrides) => request('finishTowService', overrides),
    rejectDocumentInput: (overrides) => request('adminRejectTowVehicleDocument', overrides),
    // Response builders.
    towRequest: (overrides) => builder.build('TowRequest', overrides),
    towRequestListResponse: (overrides) => builder.build('TowRequestListResponse', overrides),
    towOpportunityListResponse: (overrides) => builder.build('TowOpportunityListResponse', overrides),
    errorResponse: (overrides) => builder.build('ErrorResponse', overrides),
  };
}

module.exports = {
  TowPayloadBuilder,
  createTowBuilders,
  deepMerge,
  findPointer,
  DEFAULT_INSTANT,
};
