const mockDb = jest.fn();
jest.mock('../../src/config/database', () => mockDb);

const service = require('../../src/services/socketService');

function query(firstValue, updateValue = 1) {
  const builder = {};
  builder.leftJoin = jest.fn(() => builder);
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
