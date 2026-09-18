/**
 * Tow consumer contract smoke — flow definitions and runner.
 *
 * The flows below are the normative Cliente / Parceiro / Dashboard flows from:
 *   docs/tow/TOW-CONSUMER-FLOW-SPEC.md
 *   docs/tow/TOW-CONSUMER-FLOW-COVERAGE.md
 *   docs/tow/TOW-CONSUMER-CONTRACT-SMOKE-RESULT.md
 *
 * The smoke is driven exclusively by the composed canonical OpenAPI document.
 * For every operation used by a flow it:
 *   1. asserts the operation exists in the composed document;
 *   2. generates a minimal schema-valid request fixture and validates it
 *      against the operation request schema (JSON Schema Draft 2020-12);
 *   3. generates a minimal schema-valid response fixture for every typed 2xx
 *      response and validates it against the response schema.
 *
 * A consumer capability that cannot be expressed with a documented operation
 * must be reported as `undocumentedCapabilities`, never worked around with an
 * invented DTO/endpoint.
 */
'use strict';

const {
  schemaUri,
  collectOperations,
  composeDocument,
  generateFixture,
  getByPointer,
  isPlainObject,
} = require('./towContract');

/**
 * Flow step shape:
 *   { capability: '<normative capability name>', operationId: '<canonical>' }
 * `capability` documents which consumer capability the step proves; several
 * capabilities may map to the same operation (e.g. discovery + rehydration).
 */
const CLIENTE_FLOW = [
  { capability: 'module_status', operationId: 'getTowModuleStatus' },
  { capability: 'request_discovery_rehydration', operationId: 'listTowRequests' },
  { capability: 'create_request', operationId: 'createTowRequest' },
  { capability: 'authoritative_request_snapshot', operationId: 'getTowRequest' },
  { capability: 'destination_change', operationId: 'changeTowDestination' },
  { capability: 'proposal_list', operationId: 'listTowRequestProposals' },
  { capability: 'proposal_accept_atomic_assignment', operationId: 'acceptTowProposal' },
  { capability: 'counteroffer_create', operationId: 'createTowCounteroffer' },
  { capability: 'payment_method_selection', operationId: 'selectTowPaymentMethod' },
  { capability: 'payment_readiness_summary', operationId: 'getTowPaymentSummary' },
  { capability: 'route_geometry', operationId: 'getTowRequestRoute' },
  { capability: 'tracking_read', operationId: 'getTowTracking' },
  { capability: 'customer_cancellation', operationId: 'cancelTowRequestByCustomer' },
  { capability: 'completion_confirmation', operationId: 'confirmTowCompletion' },
  { capability: 'dispute_open', operationId: 'createTowDispute' },
  { capability: 'review_create', operationId: 'createTowReview' },
  { capability: 'customer_debt_list', operationId: 'listTowCustomerDebts' },
  { capability: 'customer_debt_payment', operationId: 'payTowCustomerDebt' },
];

const PARCEIRO_FLOW = [
  { capability: 'module_status', operationId: 'getTowModuleStatus' },
  { capability: 'partner_operational_status', operationId: 'getTowPartnerStatus' },
  { capability: 'partner_online_available_toggle', operationId: 'patchTowPartnerStatus' },
  { capability: 'partner_pre_assignment_location', operationId: 'updateTowPartnerLocation' },
  { capability: 'tow_vehicle_list', operationId: 'listTowVehicles' },
  { capability: 'tow_vehicle_create', operationId: 'createTowVehicle' },
  { capability: 'tow_vehicle_update', operationId: 'updateTowVehicle' },
  { capability: 'tow_vehicle_activate_single_active', operationId: 'activateTowVehicle' },
  { capability: 'tow_vehicle_delete', operationId: 'deleteTowVehicle' },
  { capability: 'tow_vehicle_document_list', operationId: 'listTowVehicleDocuments' },
  { capability: 'tow_vehicle_document_upload', operationId: 'uploadTowVehicleDocument' },
  { capability: 'tow_vehicle_document_delete', operationId: 'deleteTowVehicleDocument' },
  { capability: 'opportunity_discovery', operationId: 'listTowOpportunities' },
  { capability: 'proposal_create', operationId: 'createTowProposal' },
  { capability: 'partner_proposal_list', operationId: 'listPartnerTowProposals' },
  { capability: 'proposal_withdraw', operationId: 'withdrawTowProposal' },
  { capability: 'counteroffer_accept', operationId: 'acceptTowCounteroffer' },
  { capability: 'counteroffer_reject', operationId: 'rejectTowCounteroffer' },
  { capability: 'job_discovery_rehydration', operationId: 'listPartnerTowJobs' },
  { capability: 'assigned_job_snapshot', operationId: 'getTowRequest' },
  { capability: 'route_geometry', operationId: 'getTowRequestRoute' },
  { capability: 'payment_readiness', operationId: 'getTowPaymentSummary' },
  { capability: 'operational_state_en_route', operationId: 'startTowEnRoute' },
  { capability: 'operational_state_arrived', operationId: 'markTowArrived' },
  { capability: 'operational_state_in_transit', operationId: 'startTowInTransit' },
  { capability: 'operational_state_finish', operationId: 'finishTowService' },
  { capability: 'tracking_post', operationId: 'postTowTrackingPoint' },
  { capability: 'cash_received', operationId: 'markTowCashReceived' },
  { capability: 'partner_cancellation', operationId: 'cancelTowRequestByPartner' },
  { capability: 'customer_no_show', operationId: 'reportTowCustomerNoShow' },
  { capability: 'partner_financial_summary', operationId: 'getTowPartnerFinancialSummary' },
];

const DASHBOARD_FLOW = [
  { capability: 'module_control_read', operationId: 'adminGetTowModule' },
  { capability: 'module_control_toggle', operationId: 'adminToggleTowModule' },
  { capability: 'settings_read', operationId: 'adminGetTowSettings' },
  { capability: 'settings_partial_patch', operationId: 'adminPatchTowSettings' },
  { capability: 'vehicle_document_queue', operationId: 'adminListTowVehicleDocuments' },
  { capability: 'vehicle_document_detail', operationId: 'adminGetTowVehicleDocument' },
  { capability: 'vehicle_document_approve', operationId: 'adminApproveTowVehicleDocument' },
  { capability: 'vehicle_document_reject', operationId: 'adminRejectTowVehicleDocument' },
  { capability: 'admin_request_list', operationId: 'adminListTowRequests' },
  { capability: 'admin_request_detail', operationId: 'adminGetTowRequest' },
  { capability: 'admin_override_cancel', operationId: 'adminOverrideCancelTowRequest' },
  { capability: 'admin_override_complete', operationId: 'adminOverrideCompleteTowRequest' },
  { capability: 'admin_dispute_list', operationId: 'adminListTowDisputes' },
  { capability: 'admin_dispute_detail', operationId: 'adminGetTowDispute' },
  { capability: 'admin_dispute_resolve', operationId: 'adminResolveTowDispute' },
  { capability: 'payout_preview', operationId: 'adminPreviewTowPayoutBatch' },
  { capability: 'payout_batch_create', operationId: 'adminCreateTowPayoutBatch' },
  { capability: 'payout_batch_detail', operationId: 'adminGetTowPayoutBatch' },
  { capability: 'payout_batch_process', operationId: 'adminProcessTowPayoutBatch' },
  { capability: 'admin_audit_events', operationId: 'adminListTowAuditEvents' },
];

const CONSUMER_FLOWS = {
  cliente: CLIENTE_FLOW,
  parceiro: PARCEIRO_FLOW,
  dashboard: DASHBOARD_FLOW,
};

function pickRequestBodySchema(operation) {
  const body = operation.requestBody;
  if (!body) return null;
  const content = body.content || {};
  const mediaTypes = Object.keys(content);
  if (mediaTypes.length === 0) return null;
  const preferred = mediaTypes.includes('application/json') ? 'application/json' : mediaTypes[0];
  return { mediaType: preferred, schema: content[preferred].schema };
}

function resolveMaybeRef(node, composed) {
  if (isPlainObject(node) && typeof node.$ref === 'string') {
    return getByPointer(composed, node.$ref).value;
  }
  return node;
}

/**
 * Run one consumer flow against the composed contract.
 * Returns counters plus per-step detail; never throws for contract defects.
 */
function runConsumerFlow(flowName, steps, context) {
  const { composed, ajv } = context;
  const operations = collectOperations(composed);
  const byId = new Map(operations.map((op) => [op.operationId, op]));

  const report = {
    consumer: flowName,
    steps: steps.length,
    missingOperations: [],
    undocumentedCapabilities: [],
    requestBodiesValidated: 0,
    responsesValidated: 0,
    schemaGenerationFailures: [],
    invalidRequests: [],
    invalidResponses: [],
    untypedSuccessResponses: [],
    details: [],
  };

  for (const step of steps) {
    const op = byId.get(step.operationId);
    if (!op) {
      report.missingOperations.push({ capability: step.capability, operationId: step.operationId });
      report.undocumentedCapabilities.push({
        capability: step.capability,
        reason: 'no documented operation',
        expectedOperationId: step.operationId,
      });
      continue;
    }

    const stepDetail = {
      capability: step.capability,
      operationId: op.operationId,
      method: op.method.toUpperCase(),
      path: op.path,
      requestValidated: false,
      responsesValidated: 0,
    };

    // --- request body -----------------------------------------------------
    const requestSchema = pickRequestBodySchema(op.operation);
    if (requestSchema) {
      try {
        const fixture = generateFixture(requestSchema.schema, composed);
        const pointer = schemaUri(findSchemaPointer(composed, requestSchema.schema));
        const validate = ajv.getSchema(pointer);
        if (!validate) {
          report.schemaGenerationFailures.push({
            operationId: op.operationId,
            reason: `request schema not compilable: ${requestSchema.mediaType}`,
          });
        } else {
          report.requestBodiesValidated += 1;
          if (!validate(fixture)) {
            report.invalidRequests.push({
              operationId: op.operationId,
              mediaType: requestSchema.mediaType,
              fixture,
              errors: (validate.errors || []).slice(0, 5),
            });
          } else {
            stepDetail.requestValidated = true;
          }
        }
      } catch (error) {
        report.schemaGenerationFailures.push({
          operationId: op.operationId,
          reason: `request fixture generation failed: ${error.message}`,
        });
      }
    }

    // --- typed 2xx responses ---------------------------------------------
    const responses = op.operation.responses || {};
    const successKeys = Object.keys(responses).filter((code) => /^2\d\d$/.test(code));
    if (successKeys.length === 0) {
      report.untypedSuccessResponses.push({ operationId: op.operationId, reason: 'no_2xx' });
    }
    for (const code of successKeys) {
      const response = resolveMaybeRef(responses[code], composed) || {};
      const content = response.content || {};
      const mediaTypes = Object.keys(content);
      if (mediaTypes.length === 0) {
        report.untypedSuccessResponses.push({ operationId: op.operationId, status: code, reason: 'no_content' });
        continue;
      }
      for (const mediaType of mediaTypes) {
        const schema = content[mediaType].schema;
        if (!schema) {
          report.untypedSuccessResponses.push({ operationId: op.operationId, status: code, reason: 'no_schema' });
          continue;
        }
        try {
          const fixture = generateFixture(schema, composed);
          const pointer = schemaUri(findSchemaPointer(composed, schema));
          const validate = ajv.getSchema(pointer);
          if (!validate) {
            report.schemaGenerationFailures.push({
              operationId: op.operationId,
              status: code,
              reason: `response schema not compilable: ${mediaType}`,
            });
            continue;
          }
          report.responsesValidated += 1;
          stepDetail.responsesValidated += 1;
          if (!validate(fixture)) {
            report.invalidResponses.push({
              operationId: op.operationId,
              status: code,
              mediaType,
              fixture,
              errors: (validate.errors || []).slice(0, 5),
            });
          }
        } catch (error) {
          report.schemaGenerationFailures.push({
            operationId: op.operationId,
            status: code,
            reason: `response fixture generation failed: ${error.message}`,
          });
        }
      }
    }

    report.details.push(stepDetail);
  }

  return report;
}

/**
 * Locate the JSON pointer of a schema node inside the composed document.
 * The composed document is immutable here, so identity comparison is exact.
 */
function findSchemaPointer(composed, schema) {
  const seen = new Set();
  const search = (node, pointer) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return null;
    seen.add(node);
    if (node === schema) return pointer;
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

/** Run all three consumer flows and aggregate the counters. */
function runConsumerSmoke(context) {
  const ctx = context || (() => {
    const { composeDocument: compose, buildAjv } = require('./towContract');
    const { composed } = compose();
    return { composed, ajv: buildAjv(composed) };
  })();

  const perConsumer = {};
  for (const [name, steps] of Object.entries(CONSUMER_FLOWS)) {
    perConsumer[name] = runConsumerFlow(name, steps, ctx);
  }

  const aggregate = {
    consumers: perConsumer,
    missingOperations: [],
    undocumentedCapabilities: [],
    schemaGenerationFailures: [],
    invalidRequests: [],
    invalidResponses: [],
    untypedSuccessResponses: [],
    requestBodiesValidated: 0,
    responsesValidated: 0,
  };
  for (const report of Object.values(perConsumer)) {
    aggregate.missingOperations.push(...report.missingOperations);
    aggregate.undocumentedCapabilities.push(...report.undocumentedCapabilities);
    aggregate.schemaGenerationFailures.push(...report.schemaGenerationFailures);
    aggregate.invalidRequests.push(...report.invalidRequests);
    aggregate.invalidResponses.push(...report.invalidResponses);
    aggregate.untypedSuccessResponses.push(...report.untypedSuccessResponses);
    aggregate.requestBodiesValidated += report.requestBodiesValidated;
    aggregate.responsesValidated += report.responsesValidated;
  }
  aggregate.ok = aggregate.missingOperations.length === 0
    && aggregate.undocumentedCapabilities.length === 0
    && aggregate.schemaGenerationFailures.length === 0
    && aggregate.invalidRequests.length === 0
    && aggregate.invalidResponses.length === 0
    && aggregate.untypedSuccessResponses.length === 0;

  return aggregate;
}

module.exports = {
  CLIENTE_FLOW,
  PARCEIRO_FLOW,
  DASHBOARD_FLOW,
  CONSUMER_FLOWS,
  runConsumerFlow,
  runConsumerSmoke,
  findSchemaPointer,
};
