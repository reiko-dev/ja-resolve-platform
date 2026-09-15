const EmergencyRequest = require('../models/EmergencyRequest');
const Partner = require('../models/Partner');
const { ServiceError } = require('./ServiceError');

/**
 * G3 — regras de coordenadas e de oportunidades tow.
 *
 * Este serviço concentra o que antes estava espalhado no controller:
 *   - parse/validação estrita de latitude/longitude (par explícito, limites,
 *     nunca 0,0 como fallback silencioso);
 *   - resolução das coordenadas do nearby (query explícita, cadastro do
 *     parceiro ou erro estruturado `partner_onboarding_required`);
 *   - validação de raio (finito e > 0, default vigente 15 km);
 *   - criação do pedido com validação antes do INSERT.
 */

const DEFAULT_NEARBY_RADIUS_KM = 15;
const REQUEST_TYPE_ALIASES = {
  mechanic: 'mechanic',
  mecanico: 'mechanic',
  tow: 'tow',
  guincho: 'tow',
};
const PARTNER_TYPE_ALIASES = {
  mechanic: 'mechanic',
  mecanico: 'mechanic',
  tow: 'tow',
  guincho: 'tow',
  towtruck: 'tow',
  tow_truck: 'tow',
};

function normalizeRequestType(requestType) {
  return REQUEST_TYPE_ALIASES[requestType] || requestType || 'mechanic';
}

function normalizePartnerType(partnerType) {
  return PARTNER_TYPE_ALIASES[partnerType] || partnerType;
}

function resolveRequestType(type, requestType) {
  if (normalizeRequestType(requestType) === 'tow') {
    return 'tow';
  }

  return 'mechanic';
}

/**
 * Aceita apenas número finito ou string numérica. Booleano, array, objeto,
 * `NaN`, `Infinity` e string vazia não são coordenadas.
 *
 * G3 — string vazia/whitespace é tratada como valor EXPLICITAMENTE inválido
 * (`provided: true, invalid: true`), não como ausência: em `GET /nearby`,
 * `latitude=&longitude=` precisa responder `400 invalid_coordinates` e nunca
 * cair silenciosamente para o cadastro do parceiro. Ausência real (chave fora
 * da query) continua `provided: false` e mantém o fallback cadastral.
 */
function parseCoordinate(raw) {
  if (raw === undefined || raw === null) {
    return { provided: false, invalid: false, value: null };
  }

  if (typeof raw === 'string') {
    const parsed = raw.trim() === '' ? NaN : Number(raw.trim());
    return { provided: true, invalid: !Number.isFinite(parsed), value: Number.isFinite(parsed) ? parsed : null };
  }

  if (typeof raw === 'number') {
    return { provided: true, invalid: !Number.isFinite(raw), value: Number.isFinite(raw) ? raw : null };
  }

  return { provided: true, invalid: true, value: null };
}

function isZeroZero(latitude, longitude) {
  return latitude === 0 && longitude === 0;
}

/**
 * Valida um par de coordenadas operacional: finito, dentro dos limites e
 * nunca (0,0) — usado tanto para pedido/parceiro quanto para query explícita.
 */
function assertOperationalCoordinates(latitude, longitude, options = {}) {
  const code = options.code || 'invalid_coordinates';
  const message = options.message || 'Latitude e longitude inválidas';

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new ServiceError(400, code, message, { reason: 'not_finite' });
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new ServiceError(400, code, message, { reason: 'out_of_bounds' });
  }

  if (isZeroZero(latitude, longitude)) {
    throw new ServiceError(400, code, message, { reason: 'zero_zero' });
  }

  return { latitude, longitude };
}

function resolveRadius(rawRadius) {
  if (rawRadius === undefined || rawRadius === null) {
    return DEFAULT_NEARBY_RADIUS_KM;
  }

  if (typeof rawRadius === 'string' && rawRadius.trim() === '') {
    return DEFAULT_NEARBY_RADIUS_KM;
  }

  if (typeof rawRadius !== 'string' && typeof rawRadius !== 'number') {
    throw new ServiceError(400, 'invalid_radius', 'Raio deve ser um número finito maior que zero');
  }

  const radius = Number(rawRadius);
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new ServiceError(400, 'invalid_radius', 'Raio deve ser um número finito maior que zero');
  }

  return radius;
}

function parseExcludeProposed(rawValue) {
  return rawValue === true || rawValue === 'true' || rawValue === '1';
}

function parseTypeFilter(rawType) {
  return typeof rawType === 'string' && rawType.trim() !== '' ? rawType.trim() : null;
}

/**
 * G3 — coordenadas operacionais de uma linha de emergência: par finito, dentro
 * dos limites e diferente de (0,0). Usado como segunda barreira (além do SQL)
 * para que linhas legadas inválidas nunca virem oportunidade tow.
 */
function hasOperationalEmergencyCoordinates(row) {
  const latitude = parseCoordinate(row?.latitude);
  const longitude = parseCoordinate(row?.longitude);

  if (!latitude.provided || !longitude.provided || latitude.invalid || longitude.invalid) {
    return false;
  }

  if (latitude.value < -90 || latitude.value > 90) return false;
  if (longitude.value < -180 || longitude.value > 180) return false;
  if (latitude.value === 0 && longitude.value === 0) return false;

  return true;
}

function coordinatesFromPartner(partner) {
  const latitude = parseCoordinate(partner?.latitude);
  const longitude = parseCoordinate(partner?.longitude);

  if (!partner || !latitude.provided || !longitude.provided || latitude.invalid || longitude.invalid) {
    throw new ServiceError(
      400,
      'partner_onboarding_required',
      'Cadastro do parceiro sem coordenadas válidas. Conclua o onboarding com latitude e longitude.',
      { reason: 'partner_coordinates_missing' }
    );
  }

  assertOperationalCoordinates(latitude.value, longitude.value, {
    code: 'partner_onboarding_required',
    message: 'Cadastro do parceiro sem coordenadas válidas. Conclua o onboarding com latitude e longitude.',
  });

  return { latitude: latitude.value, longitude: longitude.value };
}

class EmergencyRequestService {
  static parseCoordinate(raw) {
    return parseCoordinate(raw);
  }

  static normalizeRequestType(requestType) {
    return normalizeRequestType(requestType);
  }

  static normalizePartnerType(partnerType) {
    return normalizePartnerType(partnerType);
  }

  static resolveRequestType(type, requestType) {
    return resolveRequestType(type, requestType);
  }

  static assertOperationalCoordinates(latitude, longitude, options = {}) {
    return assertOperationalCoordinates(latitude, longitude, options);
  }

  static resolveRadius(rawRadius) {
    return resolveRadius(rawRadius);
  }

  /**
   * Coordenadas operacionais do cadastro do parceiro. Ausência, null, NaN,
   * infinito ou (0,0) viram 400 `partner_onboarding_required`.
   */
  static resolvePartnerCoordinates(partner) {
    return coordinatesFromPartner(partner);
  }

  /**
   * Coordenadas operacionais do pedido de emergência. Pedido sem localização
   * válida (ausente, NaN, infinita ou 0,0) não recebe proposta.
   */
  static resolveEmergencyCoordinates(emergency) {
    const latitude = parseCoordinate(emergency?.latitude);
    const longitude = parseCoordinate(emergency?.longitude);

    if (!emergency || !latitude.provided || !longitude.provided || latitude.invalid || longitude.invalid) {
      throw new ServiceError(400, 'emergency_invalid_coordinates', 'Emergência sem coordenadas válidas');
    }

    return assertOperationalCoordinates(latitude.value, longitude.value, {
      code: 'emergency_invalid_coordinates',
      message: 'Emergência sem coordenadas válidas',
    });
  }

  /**
   * Resolve as coordenadas do GET /nearby:
   *   1. par explícito na query (os dois ou nenhum);
   *   2. senão, cadastro do parceiro (`partners.latitude/longitude`);
   *   3. admin sem par explícito => 400 `coordinates_required`;
   *   4. parceiro sem cadastro/par válido => 400 `partner_onboarding_required`.
   * Nunca cai para (0,0).
   */
  static async resolveNearbySearch(query = {}, user = {}) {
    const latitudeInput = parseCoordinate(query.latitude);
    const longitudeInput = parseCoordinate(query.longitude);

    if (latitudeInput.provided !== longitudeInput.provided) {
      throw new ServiceError(
        400,
        'invalid_coordinates',
        'latitude e longitude devem ser informadas em par',
        { reason: 'pair_mismatch' }
      );
    }

    let latitude;
    let longitude;
    let coordinateSource;

    if (latitudeInput.provided) {
      if (latitudeInput.invalid || longitudeInput.invalid) {
        throw new ServiceError(400, 'invalid_coordinates', 'Latitude e longitude inválidas', {
          reason: 'not_finite',
        });
      }
      ({ latitude, longitude } = assertOperationalCoordinates(latitudeInput.value, longitudeInput.value));
      coordinateSource = 'query';
    } else if (user.role === 'admin') {
      throw new ServiceError(
        400,
        'coordinates_required',
        'Administrador deve informar latitude e longitude explicitamente',
        { reason: 'admin_without_coordinates' }
      );
    } else {
      const partnerId = user.partner_id ? Number(user.partner_id) : null;
      if (!partnerId) {
        throw new ServiceError(
          400,
          'partner_onboarding_required',
          'Cadastro do parceiro sem coordenadas válidas. Conclua o onboarding com latitude e longitude.',
          { reason: 'partner_not_found' }
        );
      }

      const partner = await Partner.findById(partnerId);
      ({ latitude, longitude } = coordinatesFromPartner(partner));
      coordinateSource = 'partner_registration';
    }

    const radius = resolveRadius(query.radius);
    const type = parseTypeFilter(query.type);
    const excludeProposed = parseExcludeProposed(query.exclude_proposed);
    const excludePartnerId = excludeProposed && user.partner_id ? Number(user.partner_id) : null;

    return {
      latitude,
      longitude,
      radius,
      type,
      coordinate_source: coordinateSource,
      exclude_proposed: excludeProposed,
      exclude_partner_id: excludePartnerId,
    };
  }

  static async findNearby(user, query = {}) {
    const search = await this.resolveNearbySearch(query, user);
    const isTowSearch = Boolean(search.type) && normalizeRequestType(search.type) === 'tow';
    const rows = await EmergencyRequest.findNearby(
      search.latitude,
      search.longitude,
      search.radius,
      search.type,
      { excludePartnerId: search.exclude_partner_id }
    );

    // Guarda de dialeto/robustez: além do filtro SQL, garante que a listagem tow
    // só entregue oportunidades com prazo realmente futuro e coordenadas
    // operacionais (linhas legadas nulas/fora dos limites/(0,0) nunca aparecem).
    const requests = isTowSearch
      ? rows.filter(
        (row) =>
          EmergencyRequest.hasFutureProposalDeadline(row.proposal_selection_deadline) &&
          hasOperationalEmergencyCoordinates(row)
      )
      : rows;

    return {
      requests,
      count: requests.length,
      latitude: search.latitude,
      longitude: search.longitude,
      radius: search.radius,
      coordinate_source: search.coordinate_source,
    };
  }

  /**
   * Validação anterior ao INSERT do POST /api/emergency-requests: o par
   * principal é obrigatório e nunca (0,0); pares opcionais de origem/destino,
   * quando usados, também precisam ser pares válidos.
   */
  static validateCreationCoordinates(body = {}) {
    const latitude = parseCoordinate(body.latitude);
    const longitude = parseCoordinate(body.longitude);

    if (!latitude.provided || !longitude.provided || latitude.invalid || longitude.invalid) {
      throw new ServiceError(400, 'invalid_coordinates', 'Latitude e longitude válidas são obrigatórias');
    }

    assertOperationalCoordinates(latitude.value, longitude.value);

    for (const prefix of ['vehicle_origin', 'vehicle_destination']) {
      const pairLatitude = parseCoordinate(body[`${prefix}_latitude`]);
      const pairLongitude = parseCoordinate(body[`${prefix}_longitude`]);

      if (pairLatitude.provided !== pairLongitude.provided) {
        throw new ServiceError(
          400,
          'invalid_coordinates',
          `${prefix}_latitude e ${prefix}_longitude devem ser informadas em par`,
          { reason: 'pair_mismatch', field: prefix }
        );
      }

      if (!pairLatitude.provided) {
        continue;
      }

      if (pairLatitude.invalid || pairLongitude.invalid) {
        throw new ServiceError(400, 'invalid_coordinates', `Coordenadas de ${prefix} inválidas`, {
          reason: 'not_finite',
          field: prefix,
        });
      }

      assertOperationalCoordinates(pairLatitude.value, pairLongitude.value, {
        message: `Coordenadas de ${prefix} inválidas`,
      });
    }

    return { latitude: latitude.value, longitude: longitude.value };
  }

  /**
   * Cria a solicitação já validada; devolve também os parceiros notificados.
   */
  static async createRequest(user, body = {}) {
    this.validateCreationCoordinates(body);

    const resolvedRequestType = resolveRequestType(body.type, body.request_type);
    const requestData = {
      ...body,
      user_id: user.id,
      vehicle_info: body.vehicle_info ? JSON.stringify(body.vehicle_info) : null,
      photos: Array.isArray(body.photos) ? JSON.stringify(body.photos) : null,
    };

    let request;
    if (resolvedRequestType === 'tow') {
      request = await EmergencyRequest.createTowRequest(requestData);
    } else {
      request = await EmergencyRequest.createMechanicRequest(requestData);
    }

    let nearbyPartners = [];
    if (request.request_type === 'tow') {
      nearbyPartners = await EmergencyRequest.findForGuinchos(request.latitude, request.longitude);
    } else if (request.request_type === 'mechanic') {
      nearbyPartners = await EmergencyRequest.findForMechanics(request.latitude, request.longitude);
    }

    return { request, nearbyPartners };
  }
}

module.exports = EmergencyRequestService;
module.exports.DEFAULT_NEARBY_RADIUS_KM = DEFAULT_NEARBY_RADIUS_KM;
module.exports.normalizePartnerType = normalizePartnerType;
module.exports.normalizeRequestType = normalizeRequestType;
module.exports.assertOperationalCoordinates = assertOperationalCoordinates;
module.exports.parseCoordinate = parseCoordinate;
module.exports.hasOperationalEmergencyCoordinates = hasOperationalEmergencyCoordinates;
