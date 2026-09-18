/**
 * T00 — Consumer discovery & rehydration contracts.
 *
 * Normative decisions: docs/tow/TOW-OPENAPI-CONTRACT-DECISIONS.md
 * Flows: docs/tow/TOW-CONSUMER-FLOW-SPEC.md
 *
 * Discovery (Cliente `GET /api/tow/requests`, Parceiro
 * `GET /api/tow/partner/jobs`) returns the SAME typed paginated envelope
 * `TowRequestListResponse`; rehydration uses the authoritative detail
 * operations rather than re-deriving state from a list payload.
 *
 * These tests assert the contract only — no T01+ business behavior.
 */
'use strict';

const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const {
  composeDocument,
  generateFixture,
  getByPointer,
  loadRawDocuments,
} = require('../helpers/towContract');

function resolveRef(composed, node) {
  if (node && typeof node.$ref === 'string') return getByPointer(composed, node.$ref).value;
  return node;
}

function successSchema(composed, operation) {
  const response = resolveRef(composed, operation.responses['200']);
  return response.content['application/json'].schema;
}

describe('Tow consumer discovery & rehydration contracts', () => {
  const documents = loadRawDocuments();
  const { composed } = composeDocument(documents);
  const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true, validateFormats: true });
  addFormats(ajv);
  ajv.addSchema(composed, 'https://socorre.ai/contracts/tow/openapi-composed.json');
  const at = (pointer) => ajv.getSchema(`https://socorre.ai/contracts/tow/openapi-composed.json#${pointer}`);

  const customerDiscovery = composed.paths['/tow/requests'].get;
  const partnerDiscovery = composed.paths['/tow/partner/jobs'].get;

  test('the contract is served under the /api server base path', () => {
    expect(composed.servers).toEqual([{ url: '/api' }]);
    // Consumers must build `/api/tow/requests`, `/api/tow/partner/jobs`, ...
    expect(`/api${'/tow/requests'}`).toBe('/api/tow/requests');
  });

  test('Cliente discovery is GET /tow/requests (listTowRequests), customer-owned', () => {
    expect(customerDiscovery.operationId).toBe('listTowRequests');
    expect(customerDiscovery.security).toEqual([{ bearerAuth: [] }]);
    expect(customerDiscovery.tags).toContain('Tow Customer');
    expect(customerDiscovery.tags).not.toContain('Tow Partner');
  });

  test('Parceiro job discovery is GET /tow/partner/jobs (listPartnerTowJobs)', () => {
    expect(partnerDiscovery.operationId).toBe('listPartnerTowJobs');
    expect(partnerDiscovery.security).toEqual([{ bearerAuth: [] }]);
    expect(partnerDiscovery.tags).toContain('Tow Partner');
    expect(partnerDiscovery.tags).not.toContain('Tow Customer');
  });

  test('both discovery operations accept the same frozen filter set', () => {
    const names = (operation) => operation.parameters.map((param) => param.name || param.$ref.split('/').pop());
    for (const operation of [customerDiscovery, partnerDiscovery]) {
      expect(names(operation)).toEqual(['state', 'From', 'To', 'Page', 'Limit']);
    }
    const stateParam = customerDiscovery.parameters[0];
    expect(stateParam.in).toBe('query');
    expect(stateParam.schema.$ref).toBe('#/components/schemas/TowRequestState');
    expect(composed.components.parameters.Page.schema.minimum).toBe(1);
    expect(composed.components.parameters.Limit.schema.maximum).toBe(100);
    expect(composed.components.parameters.From.schema.format).toBe('date-time');
    expect(composed.components.parameters.To.schema.format).toBe('date-time');
  });

  test('both discovery operations return the SAME typed paginated envelope', () => {
    const customerSchema = successSchema(composed, customerDiscovery);
    const partnerSchema = successSchema(composed, partnerDiscovery);
    expect(customerSchema.$ref).toBe('#/components/schemas/TowRequestListResponse');
    expect(partnerSchema.$ref).toBe('#/components/schemas/TowRequestListResponse');

    const envelope = composed.components.schemas.TowRequestListResponse;
    expect(envelope.required).toEqual(expect.arrayContaining(['success', 'data']));
    expect(envelope.properties.success.const).toBe(true);
    expect(envelope.properties.data.required).toEqual(expect.arrayContaining(['items', 'meta']));
    expect(envelope.properties.data.properties.items.items.$ref)
      .toBe('#/components/schemas/TowRequest');
    expect(envelope.properties.data.properties.meta.$ref)
      .toBe('#/components/schemas/PaginationMeta');
  });

  test('the discovery envelope validates a generated fixture and rejects a broken one', () => {
    const validate = at('/components/schemas/TowRequestListResponse');
    const fixture = generateFixture({ $ref: '#/components/schemas/TowRequestListResponse' }, composed);
    expect(validate(fixture)).toBe(true);

    expect(validate({ success: false, data: { items: [], meta: { page: 1, limit: 20 } } })).toBe(false);
    expect(validate({ success: true, data: { items: [], meta: {} } })).toBe(false);
    expect(validate({ success: true, data: { items: [{ id: 'x' }], meta: { page: 1, limit: 20 } } })).toBe(false);
  });

  test('a discovery item is a complete TowRequest snapshot (rehydration without a second call)', () => {
    const request = composed.components.schemas.TowRequest;
    expect(request.required).toEqual(expect.arrayContaining([
      'id', 'state', 'module_key', 'customer_id', 'pickup', 'destination',
      'vehicle', 'payment', 'allowed_actions', 'created_at', 'updated_at',
    ]));
    expect(request.properties.module_key).toBeDefined();
    expect(request.properties.allowed_actions.type).toBe('array');
  });

  test('rehydration detail operations are authoritative and typed', () => {
    const detail = [
      ['/tow/requests/{requestId}', 'get', 'getTowRequest', 'TowRequestResponse'],
      ['/tow/requests/{requestId}/route', 'get', 'getTowRequestRoute', 'TowRouteResponse'],
      ['/tow/requests/{requestId}/tracking', 'get', 'getTowTracking', 'TrackingResponse'],
      ['/tow/requests/{requestId}/payment', 'get', 'getTowPaymentSummary', 'PaymentSummaryResponse'],
      ['/tow/requests/{requestId}/proposals', 'get', 'listTowRequestProposals', 'TowProposalListResponse'],
      ['/tow/partner/proposals', 'get', 'listPartnerTowProposals', 'TowProposalListResponse'],
      ['/tow/partner/opportunities', 'get', 'listTowOpportunities', 'TowOpportunityListResponse'],
      ['/tow/partner/financial-summary', 'get', 'getTowPartnerFinancialSummary', 'PartnerFinancialSummaryResponse'],
      ['/tow/partner/status', 'get', 'getTowPartnerStatus', 'PartnerTowStatusResponse'],
    ];
    for (const [path, method, operationId, schemaName] of detail) {
      const operation = composed.paths[path][method];
      expect(operation.operationId).toBe(operationId);
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      const schema = successSchema(composed, operation);
      expect(schema.$ref).toBe(`#/components/schemas/${schemaName}`);
      expect(composed.components.schemas[schemaName]).toBeDefined();
      // Every rehydration response must be generatable and valid.
      const validate = at(`/components/schemas/${schemaName}`);
      const fixture = generateFixture({ $ref: `#/components/schemas/${schemaName}` }, composed);
      expect(validate(fixture)).toBe(true);
    }
  });

  test('rehydration of an assigned job keeps the assignment identity in the payload', () => {
    const request = composed.components.schemas.TowRequest;
    expect(Object.keys(request.properties)).toContain('assignment');
    expect(request.properties.assignment.oneOf.map((branch) => branch.$ref || branch.type))
      .toEqual(['#/components/schemas/Assignment', 'null']);
    expect(composed.components.schemas.Assignment.required)
      .toEqual(['partner_id', 'tow_vehicle_id', 'final_price', 'assigned_at']);
  });

  test('the discovery/rehydration contract is the only documented way to recover state', () => {
    // There is exactly one customer discovery operation and one partner job
    // discovery operation: no shadow endpoint, no undocumented variant.
    const discoveryOperations = Object.values(composed.paths)
      .flatMap((item) => Object.values(item))
      .filter((node) => node && typeof node === 'object' && node.operationId)
      .filter((op) => ['listTowRequests', 'listPartnerTowJobs'].includes(op.operationId));
    expect(discoveryOperations).toHaveLength(2);
    const paths = Object.entries(composed.paths)
      .filter(([, item]) => item.get && ['listTowRequests', 'listPartnerTowJobs'].includes(item.get.operationId))
      .map(([path]) => path)
      .sort();
    expect(paths).toEqual(['/tow/partner/jobs', '/tow/requests']);
  });

  test('no undocumented pagination or discovery DTO exists', () => {
    const schemaNames = Object.keys(composed.components.schemas);
    const listSchemas = schemaNames.filter((name) => name.endsWith('ListResponse'));
    expect(listSchemas.sort()).toEqual([
      'AuditEventListResponse',
      'CustomerDebtListResponse',
      'DisputeListResponse',
      'TowOpportunityListResponse',
      'TowProposalListResponse',
      'TowRequestListResponse',
      'TowVehicleDocumentListResponse',
      'TowVehicleListResponse',
    ]);
    // Every list envelope is a typed success envelope with an item array; the
    // paginated collections additionally carry the shared PaginationMeta.
    const paginated = [
      'AuditEventListResponse',
      'DisputeListResponse',
      'TowOpportunityListResponse',
      'TowProposalListResponse',
      'TowRequestListResponse',
      'TowVehicleDocumentListResponse',
    ];
    const unpaginated = ['CustomerDebtListResponse', 'TowVehicleListResponse'];
    for (const name of listSchemas) {
      const envelope = composed.components.schemas[name];
      expect(envelope.properties.success.const).toBe(true);
      expect(envelope.properties.data.properties.items.type).toBe('array');
      if (paginated.includes(name)) {
        expect(envelope.properties.data.properties.meta.$ref)
          .toBe('#/components/schemas/PaginationMeta');
      } else {
        expect(unpaginated).toContain(name);
        expect(envelope.properties.data.properties.meta).toBeUndefined();
      }
    }
  });
});
