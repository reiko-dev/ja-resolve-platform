/**
 * Tow contract harness — shared library.
 *
 * Loads, composes and validates the canonical Tow OpenAPI 3.1 contract:
 *   docs/tow/tow-api-contract.openapi.yaml      (canonical entrypoint)
 *   docs/tow/tow-api-contract.base.openapi.yaml (composition artifact)
 *
 * Why this exists (T00, Issue #11):
 *   TOW-OPENAPI-CONSISTENCY-REVIEW.md recorded one-off pre-merge evidence
 *   (parse, ref resolution, operationId uniqueness, Draft 2020-12 schema
 *   validation, consumer smoke). That evidence was not reproducible from the
 *   repository. This module turns it into committed, CI-reusable tooling so the
 *   contract stays enforceable after merge.
 *
 * Composition semantics (important):
 *   The canonical entrypoint re-declares some paths that also exist in the base
 *   file. For those paths the canonical definition SHADOWS the base definition
 *   entirely; the composed document must therefore contain exactly one operation
 *   per (path, method) and must not double-count shadowed base operations.
 *   Verified shape on the current contract (draft.14): base 51 paths / 59
 *   operations, canonical 59 paths (30 `$ref` path items + 29 inline) / 34
 *   inline operations, 21 shadowed base paths (0 dropped methods), composed
 *   69 operations. (draft.13 adds the required `payment_method` to
 *   `CreateTowRequestInput` and the commercial `payment_method` to `TowRequest`
 *   as component overrides; draft.14 documents the payment materialized at
 *   accept. Neither adds a path, method or operation.)
 *
 * No network access is required: every `$ref` is a local file reference.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DOCS_TOW_DIR = path.join(REPO_ROOT, 'docs', 'tow');
const CANONICAL_FILE = 'tow-api-contract.openapi.yaml';
const BASE_FILE = 'tow-api-contract.base.openapi.yaml';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/**
 * Methods intentionally dropped when a canonical inline path shadows a base
 * path. Empty for the frozen contract: every base method on a shadowed path is
 * preserved by the canonical definition (verified by
 * `unallowlistedDroppedShadowedMethods` / the OpenAPI structure suite).
 *
 * Any entry added here MUST carry a justification on the same line, otherwise
 * the structure test fails.
 */
const SHADOWED_METHOD_ALLOWLIST = Object.freeze({
  // '/tow/example/{id}': ['delete'], // justification: canonical drops DELETE because ...
});

/** Canonical enum values frozen by TOW-API-CONTRACT.md §3 / the addendum §9. */
const CANONICAL_ENUMS = {
  TowRequestState: [
    'SEARCHING', 'NEGOTIATING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED',
    'IN_TRANSIT', 'COMPLETION_PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'DISPUTED',
  ],
  TerminalReason: [
    'NO_PROVIDER_AVAILABLE', 'SERVICE_DISABLED', 'CUSTOMER_CANCELLED', 'PARTNER_CANCELLED',
    'CUSTOMER_NO_SHOW', 'PARTNER_NO_SHOW', 'ADMIN_OVERRIDE', null,
  ],
  TowProposalStatus: ['ACTIVE', 'COUNTERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'CLOSED'],
  CounterofferStatus: ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CLOSED'],
  PaymentMethod: ['card', 'pix', 'cash'],
  VehicleDocumentStatus: ['pending', 'approved', 'rejected', 'expired'],
};

/** Stable error codes frozen by TOW-API-CONTRACT.md §12. */
const CANONICAL_ERROR_CODES = [
  'service_module_disabled', 'outstanding_financial_debt', 'partner_platform_fee_debt_limit',
  'partner_not_operational',
  'invalid_tow_state', 'invalid_tow_transition', 'not_request_owner', 'not_assigned_partner',
  'stale_tracking_update',
  'vehicle_not_compatible', 'vehicle_not_operational', 'tow_document_required',
  'tow_document_not_approved', 'proposal_already_active', 'proposal_expired', 'proposal_not_actionable',
  'counteroffer_already_used', 'counteroffer_expired', 'request_already_assigned',
  'payment_not_ready', 'payment_failed', 'payment_method_not_changeable',
  'customer_no_show_not_allowed_yet', 'idempotency_conflict', 'conflict',
  'validation_error', 'unauthorized', 'forbidden', 'not_found', 'external_dependency_unavailable',
];

/** Values that must never appear as a canonical enum value. */
const FORBIDDEN_ENUM_VALUES = ['PAYMENT_METHOD_SELECTED'];

// ---------------------------------------------------------------------------
// Loading / pointers / refs
// ---------------------------------------------------------------------------

function docsDir() {
  return DOCS_TOW_DIR;
}

function readYaml(fileName) {
  const filePath = path.join(DOCS_TOW_DIR, fileName);
  return YAML.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadRawDocuments() {
  return {
    canonical: readYaml(CANONICAL_FILE),
    base: readYaml(BASE_FILE),
    canonicalFile: CANONICAL_FILE,
    baseFile: BASE_FILE,
  };
}

/** Decode one RFC 6901 JSON pointer token (`~1` -> `/`, `~0` -> `~`). */
function decodePointerToken(token) {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

function parsePointer(pointer) {
  if (pointer === '' || pointer === '#') return [];
  const raw = pointer.startsWith('#') ? pointer.slice(1) : pointer;
  return raw.split('/').filter((segment) => segment !== '').map(decodePointerToken);
}

/** Resolve a `#/...` JSON pointer inside a document. */
function getByPointer(doc, pointer) {
  const tokens = parsePointer(pointer);
  let current = doc;
  for (const token of tokens) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return { found: false, value: undefined };
    }
    if (!Object.prototype.hasOwnProperty.call(current, token)) {
      return { found: false, value: undefined };
    }
    current = current[token];
  }
  return { found: true, value: current };
}

function splitRef(ref) {
  const hashIndex = ref.indexOf('#');
  if (hashIndex === -1) return { file: ref, pointer: '' };
  return { file: ref.slice(0, hashIndex), pointer: ref.slice(hashIndex) };
}

/**
 * Load the document that owns `targetFile`.
 *
 * The caller-supplied in-memory `canonical`/`base` documents always win for
 * their own file names: the composition and the mutation-based negative
 * controls depend on that. Any OTHER file is read from its REAL file in
 * docs/tow — a third file must never be silently resolved against the
 * canonical document (Muse final review P2-1: fail-open aliasing).
 */
function loadTargetDocument(targetFile, docs) {
  if (targetFile === CANONICAL_FILE && docs.canonical) {
    return { doc: docs.canonical, loaded: true };
  }
  if (targetFile === BASE_FILE && docs.base) {
    return { doc: docs.base, loaded: true };
  }
  const filePath = path.join(DOCS_TOW_DIR, targetFile);
  if (!fs.existsSync(filePath)) {
    return { loaded: false, reason: 'target_file_missing' };
  }
  try {
    return { doc: YAML.parse(fs.readFileSync(filePath, 'utf8')), loaded: true };
  } catch (error) {
    return {
      loaded: false,
      reason: 'target_file_unreadable',
      error: String(error && error.message ? error.message : error),
    };
  }
}

/**
 * Resolve a `$ref` string that appears in `sourceFileName`.
 *
 * Only local files directly inside docs/tow are supported: no http/https, no
 * absolute paths, no parent traversal, no nested directories. Anything else
 * fails closed with an explicit reason instead of being silently rewritten by
 * `path.basename()`. Resolution is always against the referenced file itself.
 */
function resolveRef(ref, sourceFileName, documents) {
  const { file, pointer } = splitRef(ref);
  const docs = documents || loadRawDocuments();
  let targetFile = sourceFileName;
  if (file && file.length > 0) {
    if (/^https?:\/\//i.test(file)) {
      return { found: false, reason: 'remote_ref_not_allowed', ref, targetFile: file };
    }
    const relative = file.replace(/^\.\//, '');
    if (relative.length === 0 || relative.includes('/') || relative.includes('\\')) {
      return { found: false, reason: 'ref_path_outside_docs_tow', ref, targetFile: file };
    }
    targetFile = relative;
  }
  const loaded = loadTargetDocument(targetFile, docs);
  if (!loaded.loaded) {
    return {
      found: false,
      reason: loaded.reason,
      ref,
      targetFile,
      pointer,
      error: loaded.error,
    };
  }
  const result = getByPointer(loaded.doc, pointer);
  return {
    found: result.found,
    reason: result.found ? null : 'pointer_not_found',
    ref,
    targetFile,
    pointer,
    value: result.value,
  };
}

/** Collect every `$ref` occurrence in a document tree with its JSON path. */
function collectRefs(node, jsonPath = '$', out = []) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectRefs(item, `${jsonPath}[${index}]`, out));
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') {
        out.push({ ref: value, jsonPath });
      } else {
        collectRefs(value, `${jsonPath}.${key}`, out);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isRefOnlyPathItem(pathItem) {
  return isPlainObject(pathItem) && typeof pathItem.$ref === 'string';
}

/**
 * Compose the canonical entrypoint over the base artifact.
 *
 * - inline canonical paths replace the base path item entirely (shadowing);
 * - canonical path items that are `$ref` to the base keep the base definition;
 * - canonical components override/extend base components;
 * - every remaining external ref is rewritten to an internal `#/...` ref so the
 *   result is a single self-contained OpenAPI document.
 */
function composeDocument(documents) {
  const docs = documents || loadRawDocuments();
  const { canonical, base } = docs;

  const composed = deepClone(base);
  composed.info = deepClone(canonical.info || base.info);
  composed.openapi = canonical.openapi || base.openapi;
  composed.servers = deepClone(canonical.servers || base.servers);
  composed.security = deepClone(canonical.security !== undefined ? canonical.security : base.security);
  composed.tags = deepClone(canonical.tags || base.tags);

  const shadowedPaths = [];
  const shadowedPathDetails = [];
  const inheritedPaths = [];
  composed.paths = deepClone(base.paths || {});
  for (const [pathKey, pathItem] of Object.entries(canonical.paths || {})) {
    if (isRefOnlyPathItem(pathItem)) {
      inheritedPaths.push(pathKey);
      // Keep the base path item (already present). If the base lacks the path,
      // resolve the ref so the composed document is still complete.
      if (!composed.paths[pathKey]) {
        const resolved = resolveRef(pathItem.$ref, CANONICAL_FILE, docs);
        if (resolved.found) composed.paths[pathKey] = deepClone(resolved.value);
      }
    } else {
      const basePathItem = composed.paths[pathKey];
      if (basePathItem) {
        const baseMethods = HTTP_METHODS.filter((method) => basePathItem[method]);
        shadowedPaths.push(pathKey);
        composed.paths[pathKey] = deepClone(pathItem);
        const composedMethods = HTTP_METHODS.filter((method) => composed.paths[pathKey][method]);
        shadowedPathDetails.push({
          path: pathKey,
          baseMethods,
          composedMethods,
          droppedMethods: baseMethods.filter((method) => !composedMethods.includes(method)),
          addedMethods: composedMethods.filter((method) => !baseMethods.includes(method)),
        });
      } else {
        composed.paths[pathKey] = deepClone(pathItem);
      }
    }
  }

  composed.components = composed.components || {};
  const canonicalComponents = canonical.components || {};
  for (const [section, value] of Object.entries(canonicalComponents)) {
    composed.components[section] = {
      ...(composed.components[section] || {}),
      ...deepClone(value),
    };
  }

  // Rewrite external refs to internal refs.
  const rewrite = (node) => {
    if (Array.isArray(node)) {
      node.forEach(rewrite);
      return node;
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string' && value.startsWith('./')) {
          const { pointer } = splitRef(value);
          node[key] = pointer.startsWith('#') ? pointer : `#${pointer}`;
        } else {
          rewrite(value);
        }
      }
    }
    return node;
  };
  rewrite(composed);

  return {
    composed,
    canonical,
    base,
    stats: {
      canonicalPaths: Object.keys(canonical.paths || {}).length,
      canonicalInlinePaths: Object.keys(canonical.paths || {}).filter((p) => !isRefOnlyPathItem(canonical.paths[p])).length,
      canonicalRefPaths: inheritedPaths.length,
      basePaths: Object.keys(base.paths || {}).length,
      composedPaths: Object.keys(composed.paths || {}).length,
      shadowedPaths,
      shadowedPathDetails,
    },
  };
}

/**
 * Base methods on shadowed paths that the composition drops without an explicit
 * `SHADOWED_METHOD_ALLOWLIST` entry. Always `[]` for a healthy composition; a
 * non-empty result means a base operation silently disappeared.
 *
 * @returns {Array<{path: string, method: string}>}
 */
function unallowlistedDroppedShadowedMethods(documents) {
  const composition = composeDocument(documents);
  const dropped = [];
  for (const detail of composition.stats.shadowedPathDetails) {
    const allowlist = SHADOWED_METHOD_ALLOWLIST[detail.path] || [];
    for (const method of detail.droppedMethods) {
      if (!allowlist.includes(method)) dropped.push({ path: detail.path, method });
    }
  }
  return dropped;
}

function collectOperations(composed) {
  const operations = [];
  for (const [pathKey, pathItem] of Object.entries(composed.paths || {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem && pathItem[method];
      if (!operation) continue;
      operations.push({
        path: pathKey,
        method,
        operationId: operation.operationId,
        operation,
        pathItem,
      });
    }
  }
  return operations;
}

// ---------------------------------------------------------------------------
// JSON Schema (Draft 2020-12) validation of the composed contract
// ---------------------------------------------------------------------------

const COMPOSED_SCHEMA_ID = 'https://socorre.ai/contracts/tow/openapi-composed.json';

function buildAjv(composed) {
  const ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    allowUnionTypes: true,
    validateFormats: true,
  });
  addFormats(ajv);
  if (!ajv.getSchema(COMPOSED_SCHEMA_ID)) {
    ajv.addSchema(composed, COMPOSED_SCHEMA_ID);
  }
  return ajv;
}

function schemaPointer(section, name) {
  return `#/components/${section}/${name}`;
}

/** Build the Ajv schema URI for a JSON pointer inside the composed document. */
function schemaUri(pointer) {
  if (!pointer) return COMPOSED_SCHEMA_ID;
  return `${COMPOSED_SCHEMA_ID}${pointer.startsWith('#') ? pointer : `#${pointer}`}`;
}

/** Compile a component schema by section+name; returns {ok, errors, validate}. */
function compileComponentSchema(ajv, section, name) {
  try {
    const validate = ajv.getSchema(schemaUri(schemaPointer(section, name)));
    if (!validate) return { ok: false, errors: ['schema_not_found'], validate: null };
    return { ok: true, errors: [], validate };
  } catch (error) {
    return { ok: false, errors: [String(error && error.message ? error.message : error)], validate: null };
  }
}

// ---------------------------------------------------------------------------
// Fixture generation (minimal, deterministic, Draft 2020-12 subset)
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic minimal instance for a composed schema.
 * The generator intentionally supports only the keyword subset used by the
 * frozen Tow contract; unsupported keywords are ignored, never guessed.
 */
function generateFixture(schema, composed, options = {}) {
  const refStack = options.refStack || [];
  if (!isPlainObject(schema)) return null;

  if (typeof schema.$ref === 'string') {
    if (refStack.includes(schema.$ref)) {
      // Recursive schema: emit null when the type allows it, otherwise {}.
      return null;
    }
    const resolved = getByPointer(composed, schema.$ref);
    if (!resolved.found) {
      throw new Error(`fixture generation: unresolved ref ${schema.$ref}`);
    }
    return generateFixture(resolved.value, composed, { refStack: refStack.concat(schema.$ref) });
  }

  if (schema.const !== undefined) return schema.const;

  if (Array.isArray(schema.enum)) {
    const nonNull = schema.enum.filter((value) => value !== null);
    return nonNull.length > 0 ? nonNull[0] : null;
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return generateFixture(schema.oneOf[0], composed, { refStack });
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return generateFixture(schema.anyOf[0], composed, { refStack });
  }

  const types = Array.isArray(schema.type) ? schema.type : (schema.type ? [schema.type] : []);
  const effectiveTypes = types.filter((t) => t !== 'null');

  if (effectiveTypes.length === 0) {
    if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
      const merged = {};
      for (const part of schema.allOf) {
        const value = generateFixture(part, composed, { refStack });
        if (isPlainObject(value)) Object.assign(merged, value);
      }
      return merged;
    }
    if (schema.properties || schema.required) return generateObject(schema, composed, refStack);
    return null;
  }

  const type = effectiveTypes[0];
  if (type === 'object') return generateObject(schema, composed, refStack);
  if (type === 'array') {
    const items = schema.items ? generateFixture(schema.items, composed, { refStack }) : null;
    const minItems = schema.minItems || 0;
    return minItems > 0 ? new Array(minItems).fill(items) : [];
  }
  if (type === 'string') return generateString(schema);
  if (type === 'integer') return generateNumber(schema, true);
  if (type === 'number') return generateNumber(schema, false);
  if (type === 'boolean') return true;
  if (type === 'null') return null;
  return null;
}

function generateObject(schema, composed, refStack) {
  const shape = collectObjectShape(schema, composed, refStack, { properties: {}, required: new Set() });
  const result = {};
  for (const key of shape.required) {
    if (Object.prototype.hasOwnProperty.call(shape.properties, key)) {
      result[key] = generateFixture(shape.properties[key], composed, { refStack });
    }
  }
  // Honour minProperties by adding optional declared properties (never
  // undeclared ones: the contract uses additionalProperties: false widely).
  const minProperties = Number.isInteger(schema.minProperties) ? schema.minProperties : 0;
  if (Object.keys(result).length < minProperties) {
    for (const key of Object.keys(shape.properties)) {
      if (Object.keys(result).length >= minProperties) break;
      if (!Object.prototype.hasOwnProperty.call(result, key)) {
        result[key] = generateFixture(shape.properties[key], composed, { refStack });
      }
    }
  }
  // Optional properties are otherwise skipped: the generator only needs to be
  // schema-valid, not exhaustive.
  return result;
}

/** Flatten allOf/$ref/oneOf-into a single {properties, required} object shape. */
function collectObjectShape(schema, composed, refStack, acc) {
  if (!isPlainObject(schema)) return acc;
  if (typeof schema.$ref === 'string') {
    if (refStack.includes(schema.$ref)) return acc;
    const resolved = getByPointer(composed, schema.$ref);
    if (!resolved.found) return acc;
    return collectObjectShape(resolved.value, composed, refStack.concat(schema.$ref), acc);
  }
  if (Array.isArray(schema.allOf)) {
    for (const part of schema.allOf) collectObjectShape(part, composed, refStack, acc);
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    collectObjectShape(schema.oneOf[0], composed, refStack, acc);
  }
  Object.assign(acc.properties, schema.properties || {});
  for (const key of schema.required || []) acc.required.add(key);
  return acc;
}

function generateString(schema) {
  switch (schema.format) {
    case 'date-time': return '2026-09-17T05:15:00.000Z';
    case 'date': return '2026-09-17';
    case 'uuid': return '00000000-0000-4000-8000-000000000000';
    case 'email': return 'consumer@example.com';
    case 'uri': return 'https://example.com/resource';
    case 'binary': return 'binary-file-content';
    default: break;
  }
  const minLength = schema.minLength || 1;
  return 'x'.repeat(Math.max(1, minLength));
}

function generateNumber(schema, integer) {
  let value = integer ? 1 : 1;
  if (typeof schema.minimum === 'number') value = schema.minimum;
  if (typeof schema.exclusiveMinimum === 'number') value = schema.exclusiveMinimum + (integer ? 1 : 0.5);
  if (typeof schema.multipleOf === 'number' && schema.multipleOf > 0) {
    value = schema.multipleOf;
  }
  return integer ? Math.ceil(value) : value;
}

// ---------------------------------------------------------------------------
// Full contract validation
// ---------------------------------------------------------------------------

function validateRefs(documents) {
  const results = { checked: 0, external: 0, unresolved: [] };
  const files = [
    { name: CANONICAL_FILE, doc: documents.canonical },
    { name: BASE_FILE, doc: documents.base },
  ];
  for (const { name, doc } of files) {
    for (const occurrence of collectRefs(doc)) {
      results.checked += 1;
      const { file } = splitRef(occurrence.ref);
      if (file && file.length > 0) results.external += 1;
      const resolved = resolveRef(occurrence.ref, name, documents);
      if (!resolved.found) {
        results.unresolved.push({
          file: name,
          jsonPath: occurrence.jsonPath,
          ref: occurrence.ref,
          reason: resolved.reason,
        });
      }
    }
  }
  return results;
}

function validatePathParameters(composed) {
  const mismatches = [];
  for (const { path: pathKey, method, operation, pathItem } of collectOperations(composed)) {
    const declared = new Set();
    const params = [...(pathItem.parameters || []), ...(operation.parameters || [])];
    for (const param of params) {
      let resolved = param;
      if (isPlainObject(param) && typeof param.$ref === 'string') {
        resolved = getByPointer(composed, param.$ref).value;
      }
      if (resolved && resolved.in === 'path' && resolved.name) declared.add(resolved.name);
    }
    const used = new Set();
    const regex = /\{([^}]+)\}/g;
    let match = regex.exec(pathKey);
    while (match) {
      used.add(match[1]);
      match = regex.exec(pathKey);
    }
    const missing = [...used].filter((name) => !declared.has(name));
    const extra = [...declared].filter((name) => !used.has(name));
    if (missing.length > 0 || extra.length > 0) {
      mismatches.push({ path: pathKey, method, operationId: operation.operationId, missing, extra });
    }
  }
  return mismatches;
}

function validateRequestBodies(composed) {
  const report = { checked: 0, withoutSchema: [], schemaErrors: [] };
  for (const { path: pathKey, method, operation, operationId } of collectOperations(composed)) {
    if (!operation.requestBody) continue;
    report.checked += 1;
    let body = operation.requestBody;
    if (isPlainObject(body) && typeof body.$ref === 'string') {
      body = getByPointer(composed, body.$ref).value;
    }
    const content = (body && body.content) || {};
    const entries = Object.entries(content);
    if (entries.length === 0) {
      report.withoutSchema.push({ path: pathKey, method, operationId, reason: 'no_content' });
      continue;
    }
    for (const [mediaType, media] of entries) {
      if (!media || !media.schema) {
        report.withoutSchema.push({ path: pathKey, method, operationId, reason: `no_schema:${mediaType}` });
      }
    }
  }
  return report;
}

function validateResponses(composed) {
  const report = { checked: 0, without2xx: [], withoutSchema: [] };
  for (const { path: pathKey, method, operation, operationId } of collectOperations(composed)) {
    report.checked += 1;
    const responses = operation.responses || {};
    const successKeys = Object.keys(responses).filter((code) => /^2\d\d$/.test(code));
    if (successKeys.length === 0) {
      report.without2xx.push({ path: pathKey, method, operationId });
      continue;
    }
    for (const code of successKeys) {
      let response = responses[code];
      if (isPlainObject(response) && typeof response.$ref === 'string') {
        response = getByPointer(composed, response.$ref).value;
      }
      const content = (response && response.content) || {};
      const entries = Object.entries(content);
      if (entries.length === 0) {
        report.withoutSchema.push({ path: pathKey, method, operationId, status: code, reason: 'no_content' });
        continue;
      }
      for (const [mediaType, media] of entries) {
        if (!media || !media.schema) {
          report.withoutSchema.push({ path: pathKey, method, operationId, status: code, reason: `no_schema:${mediaType}` });
        }
      }
    }
  }
  return report;
}

/**
 * Collect the JSON pointer of every JSON Schema node in the composed document:
 * `components.schemas.*` plus every `schema` keyword found in parameters,
 * request bodies, responses and headers.
 */
function collectSchemaPointers(composed) {
  const pointers = [];
  const seen = new Set();
  const add = (pointer, kind) => {
    if (seen.has(pointer)) return;
    seen.add(pointer);
    pointers.push({ pointer, kind });
  };

  for (const name of Object.keys(composed.components?.schemas || {})) {
    add(`#/components/schemas/${name.replace(/~/g, '~0').replace(/\//g, '~1')}`, 'component');
  }

  const walk = (node, jsonPath) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${jsonPath}/${index}`));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        const childPath = `${jsonPath}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
        if (key === 'schema' && value && typeof value === 'object') {
          add(childPath, 'inline');
        }
        walk(value, childPath);
      }
    }
  };
  walk(composed.paths || {}, '#/paths');
  walk(composed.components?.parameters || {}, '#/components/parameters');
  walk(composed.components?.responses || {}, '#/components/responses');
  walk(composed.components?.requestBodies || {}, '#/components/requestBodies');
  walk(composed.components?.headers || {}, '#/components/headers');

  return pointers;
}

/**
 * Compile every JSON Schema node with Ajv (Draft 2020-12). OpenAPI Parameter /
 * Response Objects are NOT JSON Schema themselves (`required: true` is an
 * OpenAPI boolean), so only their `schema` sub-objects are compiled.
 */
function validateComponentSchemas(composed) {
  const ajv = buildAjv(composed);
  const report = { checked: 0, componentChecked: 0, inlineChecked: 0, errors: [] };
  for (const { pointer, kind } of collectSchemaPointers(composed)) {
    report.checked += 1;
    if (kind === 'component') report.componentChecked += 1;
    else report.inlineChecked += 1;
    try {
      const validate = ajv.getSchema(schemaUri(pointer));
      if (!validate) {
        report.errors.push({ pointer, kind, errors: ['schema_not_found'] });
      }
    } catch (error) {
      report.errors.push({
        pointer,
        kind,
        errors: [String(error && error.message ? error.message : error)],
      });
    }
  }
  return report;
}

function validateEnumValues(composed) {
  const report = { checked: 0, mismatches: [], forbidden: [] };
  const schemas = composed.components?.schemas || {};
  for (const [name, expected] of Object.entries(CANONICAL_ENUMS)) {
    report.checked += 1;
    const schema = schemas[name];
    if (!schema) {
      report.mismatches.push({ name, reason: 'schema_absent' });
      continue;
    }
    const actual = Array.isArray(schema.enum) ? schema.enum : null;
    if (!actual) {
      report.mismatches.push({ name, reason: 'enum_absent' });
      continue;
    }
    const same = actual.length === expected.length && expected.every((value) => actual.includes(value));
    if (!same) report.mismatches.push({ name, expected, actual });
  }

  // PaymentStatus: CASH_SELECTED must exist; PAYMENT_METHOD_SELECTED must not.
  report.checked += 1;
  const paymentStatus = schemas.PaymentStatus;
  if (!paymentStatus || !Array.isArray(paymentStatus.enum)) {
    report.mismatches.push({ name: 'PaymentStatus', reason: 'enum_absent' });
  } else {
    if (!paymentStatus.enum.includes('CASH_SELECTED')) {
      report.mismatches.push({ name: 'PaymentStatus', reason: 'missing_CASH_SELECTED' });
    }
    if (paymentStatus.enum.includes('PAYMENT_METHOD_SELECTED')) {
      report.mismatches.push({ name: 'PaymentStatus', reason: 'legacy_PAYMENT_METHOD_SELECTED_present' });
    }
  }

  // Error codes: the canonical stable set must be present in ErrorResponse.
  report.checked += 1;
  const errorCodeEnum = schemas.ErrorResponse?.properties?.error?.properties?.code?.enum;
  if (!Array.isArray(errorCodeEnum)) {
    report.mismatches.push({ name: 'ErrorResponse.error.code', reason: 'enum_absent' });
  } else {
    const missing = CANONICAL_ERROR_CODES.filter((code) => !errorCodeEnum.includes(code));
    if (missing.length > 0) {
      report.mismatches.push({ name: 'ErrorResponse.error.code', reason: 'missing_codes', missing });
    }
  }

  // SERVICE_DISABLED (terminal reason) vs service_module_disabled (error code)
  // must remain two distinct contracts.
  report.checked += 1;
  const terminal = schemas.TerminalReason?.enum || [];
  if (!terminal.includes('SERVICE_DISABLED')) {
    report.mismatches.push({ name: 'TerminalReason', reason: 'missing_SERVICE_DISABLED' });
  }
  if ((errorCodeEnum || []).includes('SERVICE_DISABLED')) {
    report.mismatches.push({ name: 'ErrorResponse.error.code', reason: 'terminal_reason_leaked_into_error_code' });
  }

  // No forbidden legacy enum value anywhere in the composed document.
  const walk = (node, jsonPath) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${jsonPath}[${index}]`));
      return;
    }
    if (node && typeof node === 'object') {
      if (Array.isArray(node.enum)) {
        for (const value of node.enum) {
          if (FORBIDDEN_ENUM_VALUES.includes(value)) {
            report.forbidden.push({ jsonPath, value });
          }
        }
      }
      for (const [key, value] of Object.entries(node)) walk(value, `${jsonPath}.${key}`);
    }
  };
  walk(composed, '$');

  return report;
}

function validateTowSettingsPatch(composed) {
  const report = { ok: false, errors: [], checks: {} };
  const patch = composed.components?.schemas?.TowSettingsPatch;
  const full = composed.components?.schemas?.TowSettings;
  if (!patch) {
    report.errors.push('TowSettingsPatch schema absent');
    return report;
  }
  if (!full) {
    report.errors.push('TowSettings schema absent');
    return report;
  }
  if (Array.isArray(patch.required) && patch.required.length > 0) {
    report.errors.push(`TowSettingsPatch must not declare required properties (found ${patch.required.length})`);
  }
  if (patch.additionalProperties !== false) {
    report.errors.push('TowSettingsPatch.additionalProperties must be false');
  }
  if (patch.minProperties !== 1) {
    report.errors.push('TowSettingsPatch.minProperties must be 1');
  }
  const fullProps = Object.keys(full.properties || {});
  const patchProps = Object.keys(patch.properties || {});
  const missing = fullProps.filter((key) => !patchProps.includes(key));
  if (missing.length > 0) {
    report.errors.push(`TowSettingsPatch is missing full-settings properties: ${missing.join(', ')}`);
  }
  report.checks = {
    fullPropertyCount: fullProps.length,
    patchPropertyCount: patchProps.length,
    patchRequiredCount: Array.isArray(patch.required) ? patch.required.length : 0,
    minProperties: patch.minProperties,
    additionalProperties: patch.additionalProperties,
  };
  report.ok = report.errors.length === 0;
  return report;
}

/**
 * Run the full structural validation and return the counter report used by
 * tests, the CLI and the evidence documents.
 */
function validateContract(options = {}) {
  const documents = options.documents || loadRawDocuments();
  const composition = composeDocument(documents);
  const { composed } = composition;
  const operations = collectOperations(composed);

  const refs = validateRefs(documents);

  const operationIdCounts = new Map();
  const missingOperationIds = [];
  for (const op of operations) {
    if (!op.operationId) {
      missingOperationIds.push({ path: op.path, method: op.method });
      continue;
    }
    operationIdCounts.set(op.operationId, (operationIdCounts.get(op.operationId) || 0) + 1);
  }
  const duplicates = [...operationIdCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([operationId, count]) => ({ operationId, count }));

  const pathParams = validatePathParameters(composed);
  const requestBodies = validateRequestBodies(composed);
  const responses = validateResponses(composed);
  const schemas = validateComponentSchemas(composed);
  const enums = validateEnumValues(composed);
  const settingsPatch = validateTowSettingsPatch(composed);

  // A base operation silently disappearing behind a canonical inline path item
  // is a contract defect, not a detail: the composition must preserve every
  // base method unless it is explicitly allowlisted.
  const droppedShadowedMethods = unallowlistedDroppedShadowedMethods(documents);

  const ok = refs.unresolved.length === 0
    && missingOperationIds.length === 0
    && duplicates.length === 0
    && pathParams.length === 0
    && requestBodies.withoutSchema.length === 0
    && responses.without2xx.length === 0
    && responses.withoutSchema.length === 0
    && schemas.errors.length === 0
    && enums.mismatches.length === 0
    && enums.forbidden.length === 0
    && droppedShadowedMethods.length === 0
    && settingsPatch.ok;

  return {
    ok,
    openapiVersion: composed.openapi,
    contractVersion: composed.info?.version,
    composition: composition.stats,
    shadowedMethods: {
      dropped: droppedShadowedMethods,
      details: composition.stats.shadowedPathDetails,
      allowlist: SHADOWED_METHOD_ALLOWLIST,
    },
    operations: {
      count: operations.length,
      catalog: operations.map((op) => ({ operationId: op.operationId, method: op.method, path: op.path })),
    },
    refs,
    operationIds: {
      count: operationIdCounts.size,
      duplicates,
      missing: missingOperationIds,
    },
    pathParams: { mismatches: pathParams },
    requestBodies,
    responses,
    schemas,
    enums,
    settingsPatch,
  };
}

/** Resolve a (method, path) pair to its composed operation, or null. */
function findOperation(composed, operationId) {
  return collectOperations(composed).find((op) => op.operationId === operationId) || null;
}

module.exports = {
  REPO_ROOT,
  DOCS_TOW_DIR,
  CANONICAL_FILE,
  BASE_FILE,
  COMPOSED_SCHEMA_ID,
  schemaUri,
  HTTP_METHODS,
  SHADOWED_METHOD_ALLOWLIST,
  CANONICAL_ENUMS,
  CANONICAL_ERROR_CODES,
  FORBIDDEN_ENUM_VALUES,
  docsDir,
  loadRawDocuments,
  isPlainObject,
  parsePointer,
  getByPointer,
  splitRef,
  resolveRef,
  collectRefs,
  composeDocument,
  collectOperations,
  unallowlistedDroppedShadowedMethods,
  collectSchemaPointers,
  buildAjv,
  compileComponentSchema,
  generateFixture,
  validateRefs,
  validatePathParameters,
  validateRequestBodies,
  validateResponses,
  validateComponentSchemas,
  validateEnumValues,
  validateTowSettingsPatch,
  validateContract,
  findOperation,
};
