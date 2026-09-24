const mockDb = jest.fn();
jest.mock('../../src/config/database', () => mockDb);

const service = require('../../src/services/socketService');

function query(firstValue, updateValue = 1) {
  const builder = {};
  builder.leftJoin = jest.fn(() => builder);
  builder.join = jest.fn(() => builder);
  builder.where = jest.fn(() => builder);
  builder.whereIn = jest.fn(() => builder);
  builder.select = jest.fn(() => builder);
  builder.first = jest.fn().mockResolvedValue(firstValue);
  builder.update = jest.fn().mockResolvedValue(updateValue);
  return builder;
}

function socket(overrides = {}) {
  return {
    userId: 20,
    userRole: 'partner',
    emit: jest.fn(),
    join: jest.fn(),
    ...overrides,
  };
}

describe('Socket.IO tow: autorização e localização', () => {
  let room;

  beforeEach(() => {
    jest.clearAllMocks();
    room = { emit: jest.fn() };
    service.io = { to: jest.fn(() => room) };
  });

  test('bloqueia parceiro não atribuído', async () => {
    mockDb.mockReturnValueOnce(query({ id: 1, partner_id: 9, partner_user_id: 99, status: 'in_progress' }));
    const client = socket();

    await service.handlePartnerLocationUpdate(client, { emergencyId: 1, latitude: 1, longitude: 2 });

    expect(client.emit).toHaveBeenCalledWith('error', { message: 'Emergência não encontrada ou acesso negado' });
    expect(service.io.to).not.toHaveBeenCalled();
  });

  test('valida coordenadas antes de persistir', async () => {
    mockDb.mockReturnValueOnce(query({ id: 1, partner_id: 9, partner_user_id: 20, status: 'in_progress' }));
    const client = socket();

    await service.handlePartnerLocationUpdate(client, { emergencyId: 1, latitude: 200, longitude: 2 });

    expect(client.emit).toHaveBeenCalledWith('error', { message: 'Coordenadas inválidas' });
    expect(mockDb).toHaveBeenCalledTimes(1);
  });

  test('persiste e transmite localização do parceiro atribuído', async () => {
    mockDb.mockReturnValueOnce(query({ id: 1, partner_id: 9, partner_user_id: 20, status: 'in_progress' }));
    mockDb.mockReturnValueOnce(query(null, 1));
    const client = socket();

    await service.handlePartnerLocationUpdate(client, { emergencyId: 1, latitude: -9.97, longitude: -67.81 });

    expect(mockDb).toHaveBeenCalledTimes(2);
    expect(service.io.to).toHaveBeenCalledWith('emergency_1');
    expect(room.emit).toHaveBeenCalledWith('partner_location_updated', expect.objectContaining({ latitude: -9.97, longitude: -67.81 }));
  });
});

describe('Socket.IO tow: sala canônica e invalidation signal', () => {
  let room;

  beforeEach(() => {
    jest.clearAllMocks();
    room = { emit: jest.fn() };
    service.io = { to: jest.fn(() => room) };
  });

  test('sendTowTrackingUpdated emite o sinal mínimo apenas para a sala da solicitação', () => {
    service.sendTowTrackingUpdated('7', { received_at: '2026-01-15T12:04:00.000Z' });

    expect(service.io.to).toHaveBeenCalledWith('tow_request_7');
    expect(room.emit).toHaveBeenCalledWith('tow_tracking_updated', {
      request_id: '7',
      received_at: '2026-01-15T12:04:00.000Z',
    });
  });

  test('sendTowTrackingUpdated é no-op sem servidor inicializado', () => {
    service.io = null;
    expect(() => service.sendTowTrackingUpdated('7')).not.toThrow();
  });

  test('handleJoinTowRequest autoriza o cliente dono da solicitação', async () => {
    mockDb.mockReturnValueOnce(query({ id: 7, customer_id: 10 }));
    const client = socket({ userId: 10, userRole: 'user' });

    await service.handleJoinTowRequest(client, { requestId: 7 });

    expect(client.join).toHaveBeenCalledWith('tow_request_7');
    expect(client.emit).not.toHaveBeenCalled();
  });

  test('handleJoinTowRequest autoriza o parceiro atribuído', async () => {
    mockDb.mockReturnValueOnce(query({ id: 7, customer_id: 10 }));
    mockDb.mockReturnValueOnce(query({ id: 3 }));
    const client = socket({ userId: 20, userRole: 'partner' });

    await service.handleJoinTowRequest(client, { request_id: 7 });

    expect(client.join).toHaveBeenCalledWith('tow_request_7');
    expect(client.emit).not.toHaveBeenCalled();
  });

  test('handleJoinTowRequest recusa parceiro não atribuído e cliente estranho', async () => {
    mockDb.mockReturnValueOnce(query({ id: 7, customer_id: 10 }));
    mockDb.mockReturnValueOnce(query(null));
    const partner = socket({ userId: 99, userRole: 'partner' });
    await service.handleJoinTowRequest(partner, { requestId: 7 });
    expect(partner.join).not.toHaveBeenCalled();
    expect(partner.emit).toHaveBeenCalledWith('error', {
      message: 'Solicitação Tow não encontrada ou acesso negado',
    });

    mockDb.mockReturnValueOnce(query({ id: 7, customer_id: 10 }));
    const stranger = socket({ userId: 11, userRole: 'user' });
    await service.handleJoinTowRequest(stranger, { requestId: 7 });
    expect(stranger.join).not.toHaveBeenCalled();
    expect(stranger.emit).toHaveBeenCalledWith('error', {
      message: 'Solicitação Tow não encontrada ou acesso negado',
    });
  });

  test('handleJoinTowRequest recusa id inválido sem tocar o banco', async () => {
    const client = socket();

    await service.handleJoinTowRequest(client, { requestId: 'abc' });

    expect(mockDb).not.toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('error', { message: 'Solicitação Tow inválida' });
  });

  test('handleJoinTowRequest recusa solicitação inexistente', async () => {
    mockDb.mockReturnValueOnce(query(undefined));
    const client = socket({ userId: 10, userRole: 'user' });

    await service.handleJoinTowRequest(client, { requestId: 7 });

    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('error', {
      message: 'Solicitação Tow não encontrada ou acesso negado',
    });
  });
});
